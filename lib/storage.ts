import { CalendarEvent } from "./types";

const STORAGE_KEY = "calendar-events";

export function saveEventsToLocalStorage(events: CalendarEvent[]): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch (error) {
      console.error("Failed to save events to localStorage:", error);
    }
  }
}

export function loadEventsFromLocalStorage(): CalendarEvent[] {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert date strings back to Date objects
        return parsed.map((event: any) => ({
          ...event,
          startTime: new Date(event.startTime),
          endTime: new Date(event.endTime),
        }));
      }
    } catch (error) {
      console.error("Failed to load events from localStorage:", error);
    }
  }
  return [];
}

export function clearEventsFromLocalStorage(): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear events from localStorage:", error);
    }
  }
}
