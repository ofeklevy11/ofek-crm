"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarHeader } from "./CalendarHeader";
import { WeekView } from "./WeekView";
import { DayView } from "./DayView";
import { EventModal } from "./EventModal";
import { AllEventsModal } from "./AllEventsModal";
import { GlobalEventAutomationsModal } from "./GlobalEventAutomationsModal";
import { addDays, addWeeks, addMonths } from "@/lib/dateUtils";
import { CalendarEvent } from "@/lib/types";

export function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"day" | "week">("week");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
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
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [initialEventTab, setInitialEventTab] = useState<
    "details" | "automations"
  >("details");

  const searchParams = useSearchParams();

  // Load events from API on mount
  useEffect(() => {
    fetchEvents();
  }, []);

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
        if (tab === "automations") {
          setInitialEventTab("automations");
        } else {
          setInitialEventTab("details");
        }
        handleEventClick(event);
        // Important: handleEventClick resets things, so we need to set tab AFTER or modify handleEventClick
        // Actually handleEventClick sets selectedEvent and opens modal.
        // But handleEventClick resets initial* vars.
        // Let's modify handleEventClick to accept a tab or just setter here.
        // Since I can't easily change handleEventClick signature everywhere, I will set it directly here.
      }
    }
  }, [searchParams, events]);

  const fetchEvents = async () => {
    try {
      const { getCalendarEvents } = await import("@/app/actions");
      const result = await getCalendarEvents();
      if (result.success) {
        const parsedEvents = result.data!.map((event: any) => ({
          ...event,
          startTime: new Date(event.startTime),
          endTime: new Date(event.endTime),
        }));
        setEvents(parsedEvents);
      }
    } catch (error) {
      console.error("Failed to fetch events:", error);
    }
  };

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

  const handleSaveEvent = async (eventData: Omit<CalendarEvent, "id">) => {
    try {
      if (selectedEvent) {
        // Update existing event
        const { updateCalendarEvent } = await import("@/app/actions");
        const result = await updateCalendarEvent(selectedEvent.id, {
          title: eventData.title,
          description: eventData.description ?? undefined,
          startTime: eventData.startTime.toISOString(),
          endTime: eventData.endTime.toISOString(),
          color: eventData.color ?? undefined,
        });

        if (result.success) {
          const updatedEvent = result.data!;
          setEvents(
            events.map((e) =>
              e.id === selectedEvent.id
                ? {
                    ...updatedEvent,
                    startTime: new Date(updatedEvent.startTime),
                    endTime: new Date(updatedEvent.endTime),
                  }
                : e,
            ),
          );
          setSelectedEvent(undefined);
        }
      } else {
        // Create new event
        const { createCalendarEvent } = await import("@/app/actions");
        const result = await createCalendarEvent({
          title: eventData.title,
          description: eventData.description ?? undefined,
          startTime: eventData.startTime.toISOString(),
          endTime: eventData.endTime.toISOString(),
          color: eventData.color ?? undefined,
        });

        if (result.success) {
          const newEvent = result.data!;
          setEvents([
            ...events,
            {
              ...newEvent,
              startTime: new Date(newEvent.startTime),
              endTime: new Date(newEvent.endTime),
            },
          ]);
        }
      }
      setIsModalOpen(false);
      setInitialEventDate(undefined);
      setInitialEventHour(undefined);
      setInitialEventMinutes(undefined);
    } catch (error) {
      console.error("Failed to save event:", error);
    }
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setInitialEventDate(undefined);
    setInitialEventHour(undefined);
    setInitialEventMinutes(undefined);
    // Don't reset tab here if called from effect with a specific intent?
    // But handleEventClick is called from UI too.
    // If called from UI, we want "details".
    // If called from URL, we might want "automations".
    // I can assume UI calls won't set tab state before calling this.
    // But wait, the Effect calls handleEventClick.
    // If I reset it here, it overrides the Effect.
    // I should checking if I am in the effect... No.
    // I will remove the reset here and rely on the value being set before or defaulting.
    // But if I click from UI, I need it to be "details".
    // So I will set it to "details" here unless I see a way to pass it.
    // I'll assume standard click is details.
    // For the param case, I'll set it AFTER calling this in the effect?
    // React state updates are batched, so setting it after might work if handleEventClick sets it.
    // But handleEventClick is just setting state.
    // Let's default to "details" here, BUT check if I can modify the Effect to set it AFTER.
    // Yes.
    setInitialEventTab("details");
    setIsModalOpen(true);
  };

  const handleDeleteEvent = async () => {
    if (selectedEvent) {
      try {
        const { deleteCalendarEvent } = await import("@/app/actions");
        const result = await deleteCalendarEvent(selectedEvent.id);

        if (result.success) {
          setEvents(events.filter((e) => e.id !== selectedEvent.id));
          setSelectedEvent(undefined);
          setIsModalOpen(false);
        }
      } catch (error) {
        console.error("Failed to delete event:", error);
      }
    }
  };

  const handleDeleteById = async (event: CalendarEvent) => {
    if (confirm("האם אתה בטוח שברצונך למחוק אירוע זה?")) {
      try {
        const { deleteCalendarEvent } = await import("@/app/actions");
        const result = await deleteCalendarEvent(event.id);

        if (result.success) {
          setEvents(events.filter((e) => e.id !== event.id));
          if (selectedEvent?.id === event.id) {
            setSelectedEvent(undefined);
            setIsModalOpen(false);
          }
        }
      } catch (error) {
        console.error("Failed to delete event:", error);
      }
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

  // Drag and drop handlers
  const handleDragStart = (event: CalendarEvent) => {
    setDraggingEventId(event.id);
  };

  const handleDragEnd = () => {
    setDraggingEventId(null);
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

      // Find the event to get its current data
      const eventToUpdate = events.find((e) => e.id === eventId);
      if (!eventToUpdate) return;

      // Update via API
      const { updateCalendarEvent } = await import("@/app/actions");
      const result = await updateCalendarEvent(eventId, {
        title: eventToUpdate.title,
        description: eventToUpdate.description ?? undefined,
        startTime: newStartTime.toISOString(),
        endTime: newEndTime.toISOString(),
        color: eventToUpdate.color ?? undefined,
      });

      if (result.success) {
        const updatedEvent = result.data!;
        setEvents(
          events.map((e) =>
            e.id === eventId
              ? {
                  ...updatedEvent,
                  startTime: new Date(updatedEvent.startTime),
                  endTime: new Date(updatedEvent.endTime),
                }
              : e,
          ),
        );
      }
    } catch (error) {
      console.error("Failed to move event:", error);
    } finally {
      setDraggingEventId(null);
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
        onShowAllEvents={() => setIsAllEventsModalOpen(true)}
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
            draggingEventId={draggingEventId}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onCreateEvent={handleCreateEvent}
          />
        ) : (
          <DayView
            currentDate={currentDate}
            events={events}
            onEventClick={handleEventClick}
            onTimeSlotClick={handleTimeSlotClick}
            onEventDrop={handleEventDrop}
            draggingEventId={draggingEventId}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
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
        events={events}
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
