"use client";

import React, { useState, useEffect } from "react";
import { CalendarHeader } from "./CalendarHeader";
import { WeekView } from "./WeekView";
import { DayView } from "./DayView";
import { EventModal } from "./EventModal";
import { addDays, addWeeks, addMonths } from "@/lib/dateUtils";
import { CalendarEvent } from "@/lib/types";
import {
  saveEventsToLocalStorage,
  loadEventsFromLocalStorage,
} from "@/lib/storage";

export function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"day" | "week">("week");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<
    CalendarEvent | undefined
  >();
  const [initialEventDate, setInitialEventDate] = useState<Date | undefined>();
  const [initialEventHour, setInitialEventHour] = useState<
    number | undefined
  >();

  // Load events from localStorage on mount
  useEffect(() => {
    const loadedEvents = loadEventsFromLocalStorage();
    setEvents(loadedEvents);
  }, []);

  // Save events to localStorage whenever they change
  useEffect(() => {
    if (events.length > 0 || typeof window !== "undefined") {
      saveEventsToLocalStorage(events);
    }
  }, [events]);

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

  const handleSaveEvent = (eventData: Omit<CalendarEvent, "id">) => {
    if (selectedEvent) {
      // Update existing event
      setEvents(
        events.map((e) =>
          e.id === selectedEvent.id ? { ...eventData, id: selectedEvent.id } : e
        )
      );
      setSelectedEvent(undefined);
    } else {
      // Create new event
      const newEvent: CalendarEvent = {
        ...eventData,
        id: `event-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      };
      setEvents([...events, newEvent]);
    }
    setIsModalOpen(false);
    setInitialEventDate(undefined);
    setInitialEventHour(undefined);
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setInitialEventDate(undefined);
    setInitialEventHour(undefined);
    setIsModalOpen(true);
  };

  const handleDeleteEvent = () => {
    if (selectedEvent) {
      setEvents(events.filter((e) => e.id !== selectedEvent.id));
      setSelectedEvent(undefined);
      setIsModalOpen(false);
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
    setIsModalOpen(true);
  };

  const handleTimeSlotClick = (date: Date, hour: number) => {
    setSelectedEvent(undefined);
    setInitialEventDate(date);
    setInitialEventHour(hour);
    setIsModalOpen(true);
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Floating Create Button */}
      <button
        onClick={handleCreateEvent}
        className="fixed bottom-8 right-8 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 z-40"
        aria-label="Create event"
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
      />
      <div className="flex-1 overflow-hidden">
        {view === "week" ? (
          <WeekView
            currentDate={currentDate}
            events={events}
            onEventClick={handleEventClick}
            onTimeSlotClick={handleTimeSlotClick}
          />
        ) : (
          <DayView
            currentDate={currentDate}
            events={events}
            onEventClick={handleEventClick}
            onTimeSlotClick={handleTimeSlotClick}
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
        }}
        onSave={handleSaveEvent}
        onDelete={selectedEvent ? handleDeleteEvent : undefined}
        event={selectedEvent}
        initialDate={initialEventDate}
        initialHour={initialEventHour}
      />
    </div>
  );
}
