"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarHeader } from "./CalendarHeader";
import { WeekView } from "./WeekView";
import { DayView } from "./DayView";
import { EventModal } from "./EventModal";
import { AllEventsModal } from "./AllEventsModal";
import { GlobalEventAutomationsModal } from "./GlobalEventAutomationsModal";
import { addDays, addWeeks, addMonths, getStartOfWeek } from "@/lib/dateUtils";
import { CalendarEvent } from "@/lib/types";
import { showConfirm } from "@/hooks/use-modal";
import { isRateLimitError, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit-utils";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";
import {
  getCalendarEvents,
  updateCalendarEvent,
  createCalendarEvent,
  deleteCalendarEvent,
} from "@/app/actions";

export function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"day" | "week">("week");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [allEventsForModal, setAllEventsForModal] = useState<CalendarEvent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAllEventsModalOpen, setIsAllEventsModalOpen] = useState(false);
  const [isGlobalAutomationsModalOpen, setIsGlobalAutomationsModalOpen] =
    useState(false);
  const [selectedEvent, setSelectedEvent] = useState<
    CalendarEvent | undefined
  >();
  const [initialEventDate, setInitialEventDate] = useState<Date | undefined>();
  const [initialEventHour, setInitialEventHour] = useState<
    number | undefined
  >();
  const [initialEventMinutes, setInitialEventMinutes] = useState<
    number | undefined
  >();
  const [initialEventTab, setInitialEventTab] = useState<
    "details" | "automations"
  >("details");

  const searchParams = useSearchParams();

  // Load events for visible date range (debounced to prevent rapid-fire on navigation)
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);

    fetchTimerRef.current = setTimeout(async () => {
      try {
        let rangeStart: Date;
        let rangeEnd: Date;
        if (view === "week") {
          const weekStart = getStartOfWeek(currentDate);
          rangeStart = addDays(weekStart, -7);
          rangeEnd = addDays(weekStart, 21);
        } else {
          rangeStart = addDays(currentDate, -1);
          rangeEnd = addDays(currentDate, 2);
        }

        const result = await getCalendarEvents(
          rangeStart.toISOString(),
          rangeEnd.toISOString(),
        );
        if (result.success) {
          setEvents(
            result.data!.map((event: any) => ({
              ...event,
              startTime: new Date(event.startTime),
              endTime: new Date(event.endTime),
            })),
          );
        }
      } catch (error) {
        console.error("Failed to fetch events:", error);
        if (isRateLimitError(error)) toast.error(RATE_LIMIT_MESSAGE, { id: "calendar-fetch" });
        else toast.error(getUserFriendlyError(error), { id: "calendar-fetch" });
      }
    }, 300);

    return () => {
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
    };
  }, [currentDate, view]);

  // Handle URL params for opening modals
  useEffect(() => {
    if (events.length === 0) return;

    const openGlobal = searchParams.get("openGlobalAutomations");
    if (openGlobal === "true") {
      setIsGlobalAutomationsModalOpen(true);
    }

    const eventId = searchParams.get("eventId");
    const openEdit = searchParams.get("openEdit");
    const tab = searchParams.get("tab");

    if (eventId && openEdit === "true") {
      const event = events.find((e) => e.id === eventId);
      if (event) {
        handleEventClick(event, tab === "automations" ? "automations" : "details");
      }
    }
  }, [searchParams, events]);

  const handlePrev = () => {
    if (view === "day") {
      setCurrentDate(addDays(currentDate, -1));
    } else {
      setCurrentDate(addWeeks(currentDate, -1));
    }
  };

  const handleNext = () => {
    if (view === "day") {
      setCurrentDate(addDays(currentDate, 1));
    } else {
      setCurrentDate(addWeeks(currentDate, 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleViewChange = (newView: "day" | "week") => {
    setView(newView);
  };

  const handlePrevMonth = () => {
    setCurrentDate(addMonths(currentDate, -1));
  };

  const handleNextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1));
  };

  const handleSelectDate = (date: Date) => {
    setCurrentDate(date);
  };

  const handleSaveEvent = async (eventData: Omit<CalendarEvent, "id">): Promise<string | false> => {
    const eventToSave = selectedEvent;
    try {
      if (eventToSave) {
        // Update existing event
        const result = await updateCalendarEvent(eventToSave.id, {
          title: eventData.title,
          description: eventData.description ?? undefined,
          startTime: eventData.startTime.toISOString(),
          endTime: eventData.endTime.toISOString(),
          color: eventData.color ?? undefined,
        });

        if (!result.success) return false;

        const updatedEvent = result.data!;
        setEvents((prev) =>
          prev.map((e) =>
            e.id === eventToSave.id
              ? {
                  ...updatedEvent,
                  startTime: new Date(updatedEvent.startTime),
                  endTime: new Date(updatedEvent.endTime),
                }
              : e,
          ),
        );
        toast.success("האירוע עודכן בהצלחה");
        setSelectedEvent(undefined);
        setIsModalOpen(false);
        setInitialEventDate(undefined);
        setInitialEventHour(undefined);
        setInitialEventMinutes(undefined);
        return eventToSave.id;
      } else {
        // Create new event
        const result = await createCalendarEvent({
          title: eventData.title,
          description: eventData.description ?? undefined,
          startTime: eventData.startTime.toISOString(),
          endTime: eventData.endTime.toISOString(),
          color: eventData.color ?? undefined,
        });

        if (!result.success) return false;

        const newEvent = result.data!;
        setEvents((prev) => [
          ...prev,
          {
            ...newEvent,
            startTime: new Date(newEvent.startTime),
            endTime: new Date(newEvent.endTime),
          },
        ]);
        toast.success("האירוע נוצר בהצלחה");
        setIsModalOpen(false);
        setInitialEventDate(undefined);
        setInitialEventHour(undefined);
        setInitialEventMinutes(undefined);
        return newEvent.id;
      }
    } catch (error) {
      console.error("Failed to save event:", error);
      if (isRateLimitError(error)) toast.error(RATE_LIMIT_MESSAGE);
      else toast.error(getUserFriendlyError(error));
      return false;
    }
  };

  const handleEventClick = (event: CalendarEvent, tab: "details" | "automations" = "details") => {
    setSelectedEvent(event);
    setInitialEventDate(undefined);
    setInitialEventHour(undefined);
    setInitialEventMinutes(undefined);
    setInitialEventTab(tab);
    setIsModalOpen(true);
  };

  const handleDeleteEvent = async () => {
    const eventToDelete = selectedEvent;
    if (eventToDelete) {
      try {
        const result = await deleteCalendarEvent(eventToDelete.id);
        if (result.success) {
          setEvents(prev => prev.filter((e) => e.id !== eventToDelete.id));
          setSelectedEvent(undefined);
          setIsModalOpen(false);
          toast.success("האירוע נמחק בהצלחה");
        }
      } catch (error) {
        console.error("Failed to delete event:", error);
        if (isRateLimitError(error)) toast.error(RATE_LIMIT_MESSAGE);
        else toast.error(getUserFriendlyError(error));
      }
    }
  };

  const handleDeleteById = async (event: CalendarEvent) => {
    if (await showConfirm("האם אתה בטוח שברצונך למחוק אירוע זה?")) {
      try {
        const result = await deleteCalendarEvent(event.id);

        if (result.success) {
          setEvents(prev => prev.filter((e) => e.id !== event.id));
          setAllEventsForModal((prev) => prev.filter((e) => e.id !== event.id));
          if (selectedEvent?.id === event.id) {
            setSelectedEvent(undefined);
            setIsModalOpen(false);
          }
          toast.success("האירוע נמחק בהצלחה");
        }
      } catch (error) {
        console.error("Failed to delete event:", error);
        if (isRateLimitError(error)) toast.error(RATE_LIMIT_MESSAGE);
        else toast.error(getUserFriendlyError(error));
      }
    }
  };

  const handleShowAllEvents = async () => {
    setIsAllEventsModalOpen(true);
    try {
      // Default to 6 months back / 6 months forward to avoid unbounded fetch
      const now = new Date();
      const rangeStart = new Date(now);
      rangeStart.setMonth(rangeStart.getMonth() - 6);
      const rangeEnd = new Date(now);
      rangeEnd.setMonth(rangeEnd.getMonth() + 6);

      const result = await getCalendarEvents(
        rangeStart.toISOString(),
        rangeEnd.toISOString(),
      );
      if (result.success) {
        setAllEventsForModal(
          result.data!.map((event: any) => ({
            ...event,
            startTime: new Date(event.startTime),
            endTime: new Date(event.endTime),
          })),
        );
      }
    } catch (error) {
      console.error("Failed to fetch all events:", error);
      if (isRateLimitError(error)) toast.error(RATE_LIMIT_MESSAGE, { id: "calendar-all-events" });
      else toast.error(getUserFriendlyError(error), { id: "calendar-all-events" });
    }
  };

  // Get next rounded hour from current time
  const getNextRoundedHour = (): number => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();

    // If we're past the hour, go to next hour, otherwise use current hour
    if (currentMinutes > 0) {
      return (currentHour + 1) % 24;
    }
    return currentHour;
  };

  const handleCreateEvent = () => {
    setSelectedEvent(undefined);
    // Set default to today with next rounded hour
    setInitialEventDate(new Date());
    setInitialEventHour(getNextRoundedHour());
    setInitialEventMinutes(0);
    setInitialEventTab("details");
    setIsModalOpen(true);
  };

  const handleTimeSlotClick = (
    date: Date,
    hour: number,
    minutes: number = 0,
  ) => {
    setSelectedEvent(undefined);
    setInitialEventDate(date);
    setInitialEventHour(hour);
    setInitialEventMinutes(minutes);
    setInitialEventTab("details");
    setIsModalOpen(true);
  };

  const handleEventDrop = async (
    eventId: string,
    newDate: Date,
    newHour: number,
    newMinutes: number,
    duration: number,
  ) => {
    try {
      // Calculate new start and end times
      const newStartTime = new Date(newDate);
      newStartTime.setHours(newHour, newMinutes, 0, 0);

      const newEndTime = new Date(newStartTime.getTime() + duration);

      // Update via API
      const result = await updateCalendarEvent(eventId, {
        startTime: newStartTime.toISOString(),
        endTime: newEndTime.toISOString(),
      });

      if (result.success) {
        const updatedEvent = result.data!;
        setEvents(prev =>
          prev.map((e) =>
            e.id === eventId
              ? {
                  ...updatedEvent,
                  startTime: new Date(updatedEvent.startTime),
                  endTime: new Date(updatedEvent.endTime),
                }
              : e,
          ),
        );
        toast.success("האירוע עודכן בהצלחה");
      }
    } catch (error) {
      console.error("Failed to move event:", error);
      if (isRateLimitError(error)) toast.error(RATE_LIMIT_MESSAGE);
      else toast.error(getUserFriendlyError(error));
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white" dir="rtl">
      {/* Floating Create Button */}
      <button
        onClick={handleCreateEvent}
        className="fixed bottom-8 start-8 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg items-center justify-center transition-all hover:scale-110 z-40 hidden md:flex"
        aria-label="צור אירוע"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
      </button>

      <CalendarHeader
        currentDate={currentDate}
        view={view}
        onViewChange={handleViewChange}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onSelectDate={handleSelectDate}
        onShowAllEvents={handleShowAllEvents}
        onGlobalAutomations={() => setIsGlobalAutomationsModalOpen(true)}
      />
      <div className="sticky top-16 h-[calc(100dvh-4rem)] overflow-hidden bg-white z-0">
        {view === "week" ? (
          <WeekView
            currentDate={currentDate}
            events={events}
            onEventClick={handleEventClick}
            onTimeSlotClick={handleTimeSlotClick}
            onEventDrop={handleEventDrop}
            onCreateEvent={handleCreateEvent}
          />
        ) : (
          <DayView
            currentDate={currentDate}
            events={events}
            onEventClick={handleEventClick}
            onTimeSlotClick={handleTimeSlotClick}
            onEventDrop={handleEventDrop}
            onCreateEvent={handleCreateEvent}
          />
        )}
      </div>

      <EventModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedEvent(undefined);
          setInitialEventDate(undefined);
          setInitialEventHour(undefined);
          setInitialEventMinutes(undefined);

          const url = new URL(window.location.href);
          if (url.searchParams.has("openEdit")) {
            url.searchParams.delete("openEdit");
            url.searchParams.delete("eventId");
            window.history.replaceState({}, "", url.toString());
          }
        }}
        onSave={handleSaveEvent}
        onDelete={selectedEvent ? handleDeleteEvent : undefined}
        event={selectedEvent}
        initialDate={initialEventDate}
        initialHour={initialEventHour}
        initialMinutes={initialEventMinutes}
        initialTab={initialEventTab}
      />

      <AllEventsModal
        isOpen={isAllEventsModalOpen}
        onClose={() => setIsAllEventsModalOpen(false)}
        events={allEventsForModal}
        onEdit={(event) => {
          handleEventClick(event);
          // We can optionally close the list here, but keeping it open allows for quick edits of multiple items if supported.
          // However, handleEventClick opens a modal. Having two modals might be UI clutter.
          // Let's not close it for now, assuming standard z-index stacking handles it.
        }}
        onDelete={handleDeleteById}
      />

      <GlobalEventAutomationsModal
        isOpen={isGlobalAutomationsModalOpen}
        onClose={() => {
          setIsGlobalAutomationsModalOpen(false);
          const url = new URL(window.location.href);
          if (url.searchParams.has("openGlobalAutomations")) {
            url.searchParams.delete("openGlobalAutomations");
            window.history.replaceState({}, "", url.toString());
          }
        }}
      />
    </div>
  );
}
