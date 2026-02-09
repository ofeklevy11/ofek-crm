"use client";

import React, { useState, useMemo } from "react";
import { CalendarEvent } from "@/lib/types";

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

  const sortedEvents = useMemo(() => {
    const now = new Date();

    // Filter events
    const filtered = events.filter((event) => {
      if (view === "all") return true;

      const eventTime = new Date(event.startTime);
      const isUpcoming = view === "upcoming";
      return isUpcoming ? eventTime >= now : eventTime < now;
    });

    // Sort events
    return filtered.sort((a, b) => {
      const dateA = new Date(a.startTime).getTime();
      const dateB = new Date(b.startTime).getTime();

      if (view === "upcoming") {
        // "from the most current to the most future" -> Ascending for upcoming
        return dateA - dateB;
      } else {
        // For past: Descending (most recent past first)
        // For all: Descending (newest first seems most logical to see recent/future)
        return dateB - dateA;
      }
    });
  }, [events, view]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]">
        <div
          className="flex items-center justify-between p-6 border-b border-gray-200"
          dir="rtl"
        >
          <h2 className="text-xl font-semibold text-gray-900">כל הרשומות</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div
          className="border-b border-gray-200 overflow-x-auto scrollbar-hide"
          dir="rtl"
        >
          <div className="flex items-center gap-4 p-4 min-w-full justify-center sm:justify-start">
            <button
              onClick={() => setView("upcoming")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus:outline-none ${
                view === "upcoming"
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              }`}
            >
              אירועים עתידיים
            </button>
            <button
              onClick={() => setView("past")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus:outline-none ${
                view === "past"
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              }`}
            >
              אירועי עבר
            </button>
            <button
              onClick={() => setView("all")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus:outline-none ${
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
            <div className="w-3 h-3 rounded-full bg-blue-100 border border-blue-200"></div>
            <span className="text-xs text-gray-600">אירוע עתידי</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-100 border border-green-200"></div>
            <span className="text-xs text-gray-600">אירוע עבר</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4" dir="rtl">
          {sortedEvents.length === 0 ? (
            <p className="text-center text-gray-500 py-4">אין אירועים להצגה</p>
          ) : (
            sortedEvents.map((event) => {
              const now = new Date();
              const isPast = new Date(event.startTime) < now;

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
                    />
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {event.title}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {new Date(event.startTime).toLocaleString("he-IL", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onEdit(event)}
                      className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                      title="ערוך"
                    >
                      <svg
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
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                      title="מחק"
                    >
                      <svg
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
      </div>
    </div>
  );
}
