"use client";

import React, { useState, useMemo } from "react";
import { CalendarEvent } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface AllEventsModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: CalendarEvent[];
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}

export function AllEventsModal({
  isOpen,
  onClose,
  events,
  onEdit,
  onDelete,
}: AllEventsModalProps) {
  const [view, setView] = useState<"upcoming" | "past" | "all">("upcoming");

  const now = useMemo(() => new Date(), [view]);

  const sortedEvents = useMemo(() => {
    // Filter events
    const filtered = events.filter((event) => {
      if (view === "all") return true;

      const isUpcoming = view === "upcoming";
      return isUpcoming ? event.startTime >= now : event.startTime < now;
    });

    // Sort events
    return filtered.sort((a, b) => {
      const dateA = a.startTime.getTime();
      const dateB = b.startTime.getTime();

      if (view === "upcoming") {
        return dateA - dateB;
      } else {
        return dateB - dateA;
      }
    });
  }, [events, view, now]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-2rem)] sm:max-w-2xl p-0 gap-0 flex flex-col max-h-[80vh]"
      >
        <div
          className="flex items-center justify-between p-6 border-b border-gray-200"
          dir="rtl"
        >
          <DialogTitle className="text-xl font-semibold text-gray-900">כל הרשומות</DialogTitle>
          <button
            onClick={onClose}
            aria-label="סגור"
            className="text-gray-400 hover:text-gray-600 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 rounded-sm"
          >
            <svg
              aria-hidden="true"
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <DialogDescription className="sr-only">צפייה בכל אירועי היומן</DialogDescription>

        <div
          className="border-b border-gray-200 overflow-x-auto scrollbar-hide"
          dir="rtl"
        >
          <div className="flex items-center gap-4 p-4 min-w-full justify-center sm:justify-start" role="tablist" aria-label="סינון אירועים">
            <button
              id="tab-upcoming"
              role="tab"
              aria-selected={view === "upcoming"}
              onClick={() => setView("upcoming")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                view === "upcoming"
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              }`}
            >
              אירועים עתידיים
            </button>
            <button
              id="tab-past"
              role="tab"
              aria-selected={view === "past"}
              onClick={() => setView("past")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                view === "past"
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              }`}
            >
              אירועי עבר
            </button>
            <button
              id="tab-all"
              role="tab"
              aria-selected={view === "all"}
              onClick={() => setView("all")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                view === "all"
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              }`}
            >
              כל האירועים
            </button>
          </div>
        </div>

        <div
          className="px-6 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-start gap-4"
          dir="rtl"
        >
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-100 border border-blue-200" aria-hidden="true"></div>
            <span className="text-xs text-gray-600">אירוע עתידי</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-100 border border-green-200" aria-hidden="true"></div>
            <span className="text-xs text-gray-600">אירוע עבר</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4" dir="rtl" role="tabpanel" aria-labelledby={`tab-${view}`}>
          {sortedEvents.length === 0 ? (
            <p className="text-center text-gray-500 py-4">אין אירועים להצגה</p>
          ) : (
            sortedEvents.map((event) => {
              const isPast = event.startTime < now;

              return (
                <div
                  key={event.id}
                  className={`flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow ${
                    isPast ? "bg-green-50" : "bg-blue-50"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-2 h-10 rounded-full"
                      style={{ backgroundColor: event.color || "#3B82F6" }}
                      aria-hidden="true"
                    />
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {event.title}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {event.startTime.toLocaleString("he-IL", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                      <span className="sr-only">{isPast ? "אירוע עבר" : "אירוע עתידי"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onEdit(event)}
                      className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-blue-500"
                      aria-label={`ערוך ${event.title}`}
                    >
                      <svg
                        aria-hidden="true"
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => onDelete(event)}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-blue-500"
                      aria-label={`מחק ${event.title}`}
                    >
                      <svg
                        aria-hidden="true"
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
