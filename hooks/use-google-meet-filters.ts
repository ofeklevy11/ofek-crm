"use client";

import { useMemo, useCallback, useDeferredValue } from "react";
import { useState } from "react";
import type { GoogleMeetEvent } from "@/lib/types";

export interface GoogleMeetFilters {
  searchMode: "simple" | "smart";
  searchText: string;
  smartSearchField: "title" | "organizer" | "participant" | null;
  datePreset: "today" | "tomorrow" | "thisWeek" | "thisMonth" | "custom";
  customDateFrom: string | null;
  customDateTo: string | null;
  organizer: string;
  participant: string;
  participantCount: "1on1" | "small" | "large" | null;
  duration: "15" | "15-30" | "30-60" | "60+" | null;
  responseStatus: "accepted" | "needsAction" | "declined" | null;
  recurring: "one-time" | "recurring" | null;
  sortBy: "closest" | "farthest" | "newest" | "name";
}

const defaultFilters: GoogleMeetFilters = {
  searchMode: "simple",
  searchText: "",
  smartSearchField: null,
  datePreset: "thisWeek",
  customDateFrom: null,
  customDateTo: null,
  organizer: "",
  participant: "",
  participantCount: null,
  duration: null,
  responseStatus: null,
  recurring: null,
  sortBy: "closest",
};

function computeDateRange(filters: GoogleMeetFilters): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (filters.datePreset) {
    case "today": {
      const end = new Date(today);
      end.setHours(23, 59, 59, 999);
      return { start: today, end };
    }
    case "tomorrow": {
      const start = new Date(today);
      start.setDate(start.getDate() + 1);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case "thisWeek": {
      const dayOfWeek = now.getDay();
      const start = new Date(today);
      start.setDate(today.getDate() - dayOfWeek);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case "thisMonth": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end };
    }
    case "custom": {
      let from = filters.customDateFrom ? new Date(filters.customDateFrom) : today;
      let to = filters.customDateTo ? new Date(filters.customDateTo) : today;

      // Auto-swap if from > to
      if (from.getTime() > to.getTime()) {
        [from, to] = [to, from];
      }

      // Cap at 3 months
      const threeMonths = 90 * 24 * 60 * 60 * 1000;
      if (to.getTime() - from.getTime() > threeMonths) {
        to = new Date(from.getTime() + threeMonths);
      }

      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
      return { start: from, end: to };
    }
    default:
      return { start: today, end: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000) };
  }
}

function isAllDayEvent(event: GoogleMeetEvent): boolean {
  const durationMs = event.endTime.getTime() - event.startTime.getTime();
  return durationMs >= 24 * 60 * 60 * 1000;
}

function getDurationMinutes(event: GoogleMeetEvent): number {
  return (event.endTime.getTime() - event.startTime.getTime()) / (1000 * 60);
}

function matchesSearch(event: GoogleMeetEvent, text: string, mode: "simple" | "smart", field: string | null): boolean {
  if (!text.trim()) return true;
  const lower = text.toLowerCase();

  if (mode === "smart" && field) {
    switch (field) {
      case "title":
        return event.title.toLowerCase().includes(lower);
      case "organizer":
        return (
          (event.organizer?.email?.toLowerCase().includes(lower) ?? false) ||
          (event.organizer?.displayName?.toLowerCase().includes(lower) ?? false)
        );
      case "participant":
        return event.attendees.some(
          (a) =>
            a.email.toLowerCase().includes(lower) ||
            (a.displayName?.toLowerCase().includes(lower) ?? false),
        );
      default:
        return true;
    }
  }

  // Simple search: search across all fields
  if (event.title.toLowerCase().includes(lower)) return true;
  if (event.organizer?.email?.toLowerCase().includes(lower)) return true;
  if (event.organizer?.displayName?.toLowerCase().includes(lower)) return true;
  if (event.attendees.some(
    (a) =>
      a.email.toLowerCase().includes(lower) ||
      (a.displayName?.toLowerCase().includes(lower) ?? false),
  )) return true;

  return false;
}

export function useGoogleMeetFilters() {
  const [filters, setFilters] = useState<GoogleMeetFilters>({ ...defaultFilters });

  const deferredSearchText = useDeferredValue(filters.searchText);
  const deferredOrganizer = useDeferredValue(filters.organizer);
  const deferredParticipant = useDeferredValue(filters.participant);

  const setFilter = useCallback(<K extends keyof GoogleMeetFilters>(key: K, value: GoogleMeetFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ ...defaultFilters });
  }, []);

  const dateRange = useMemo(() => computeDateRange(filters), [
    filters.datePreset,
    filters.customDateFrom,
    filters.customDateTo,
  ]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.searchText.trim()) count++;
    if (filters.organizer.trim()) count++;
    if (filters.participant.trim()) count++;
    if (filters.participantCount) count++;
    if (filters.duration) count++;
    if (filters.responseStatus) count++;
    if (filters.recurring) count++;
    if (filters.datePreset !== "thisWeek") count++;
    if (filters.sortBy !== "closest") count++;
    return count;
  }, [filters]);

  const applyFilters = useCallback(
    (events: GoogleMeetEvent[]): GoogleMeetEvent[] => {
      let filtered = events.filter((event) => {
        // Search
        if (!matchesSearch(event, deferredSearchText, filters.searchMode, filters.smartSearchField)) {
          return false;
        }

        // Organizer
        if (deferredOrganizer.trim()) {
          const lower = deferredOrganizer.toLowerCase();
          const matchOrg =
            (event.organizer?.email?.toLowerCase().includes(lower) ?? false) ||
            (event.organizer?.displayName?.toLowerCase().includes(lower) ?? false);
          if (!matchOrg) return false;
        }

        // Participant
        if (deferredParticipant.trim()) {
          const lower = deferredParticipant.toLowerCase();
          const matchPart = event.attendees.some(
            (a) =>
              a.email.toLowerCase().includes(lower) ||
              (a.displayName?.toLowerCase().includes(lower) ?? false),
          );
          if (!matchPart) return false;
        }

        // Participant count
        if (filters.participantCount) {
          const count = event.attendees.length;
          if (count === 0) return false;
          switch (filters.participantCount) {
            case "1on1":
              if (count !== 2) return false;
              break;
            case "small":
              if (count < 3 || count > 5) return false;
              break;
            case "large":
              if (count < 6) return false;
              break;
          }
        }

        // Duration (skip all-day events)
        if (filters.duration && !isAllDayEvent(event)) {
          const minutes = getDurationMinutes(event);
          switch (filters.duration) {
            case "15":
              if (minutes > 15) return false;
              break;
            case "15-30":
              if (minutes <= 15 || minutes > 30) return false;
              break;
            case "30-60":
              if (minutes <= 30 || minutes > 60) return false;
              break;
            case "60+":
              if (minutes <= 60) return false;
              break;
          }
        }

        // Response status
        if (filters.responseStatus) {
          const hasStatus = event.attendees.some(
            (a) => a.responseStatus === filters.responseStatus,
          );
          if (!hasStatus) return false;
        }

        // Recurring
        if (filters.recurring) {
          if (filters.recurring === "recurring" && !event.isRecurring) return false;
          if (filters.recurring === "one-time" && event.isRecurring) return false;
        }

        return true;
      });

      // Sort
      filtered.sort((a, b) => {
        switch (filters.sortBy) {
          case "closest":
            return a.startTime.getTime() - b.startTime.getTime();
          case "farthest":
          case "newest":
            return b.startTime.getTime() - a.startTime.getTime();
          case "name":
            return a.title.localeCompare(b.title, "he");
          default:
            return 0;
        }
      });

      return filtered;
    },
    [deferredSearchText, deferredOrganizer, deferredParticipant, filters.searchMode, filters.smartSearchField, filters.participantCount, filters.duration, filters.responseStatus, filters.recurring, filters.sortBy],
  );

  return {
    filters,
    setFilter,
    resetFilters,
    dateRange,
    activeFilterCount,
    applyFilters,
  };
}
