"use client";

import React, { useState } from "react";
import { addMonths, monthNames, daysOfWeek } from "@/lib/dateUtils";

interface DatePickerPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDate: (date: Date) => void;
  currentDate: Date;
}

export function DatePickerPopup({
  isOpen,
  onClose,
  onSelectDate,
  currentDate,
}: DatePickerPopupProps) {
  const [viewDate, setViewDate] = useState(new Date(currentDate));

  if (!isOpen) return null;

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Get first day of month
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Get number of days in month
  const daysInMonth = lastDay.getDate();

  // Get day of week for first day (0 = Sunday)
  const startingDayOfWeek = firstDay.getDay();

  // Create array of days
  const days: (number | null)[] = [];

  // Add empty cells for days before month starts
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null);
  }

  // Add days of month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const handleDateClick = (day: number) => {
    const selectedDate = new Date(year, month, day);
    onSelectDate(selectedDate);
    onClose();
  };

  const isToday = (day: number) => {
    const today = new Date();
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    );
  };

  const isSelected = (day: number) => {
    return (
      day === currentDate.getDate() &&
      month === currentDate.getMonth() &&
      year === currentDate.getFullYear()
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Popup */}
      <div
        className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 md:absolute md:top-16 md:left-1/2 md:transform md:-translate-x-1/2 md:translate-y-0 bg-white rounded-lg shadow-xl border border-gray-200 z-50 p-4 w-80"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setViewDate(addMonths(viewDate, -1))}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="חודש קודם"
          >
            <svg
              className="w-5 h-5 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>

          <h3 className="text-base font-semibold text-gray-800">
            {monthNames[month]} {year}
          </h3>

          <button
            onClick={() => setViewDate(addMonths(viewDate, 1))}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="חודש הבא"
          >
            <svg
              className="w-5 h-5 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        </div>

        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {daysOfWeek.map((day) => (
            <div
              key={day}
              className="text-center text-xs font-medium text-gray-500 py-1"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, index) => (
            <div key={index} className="aspect-square">
              {day ? (
                <button
                  onClick={() => handleDateClick(day)}
                  className={`w-full h-full flex items-center justify-center text-sm rounded-full transition-all ${
                    isSelected(day)
                      ? "bg-blue-600 text-white font-semibold shadow-md"
                      : isToday(day)
                        ? "bg-blue-100 text-blue-700 font-semibold"
                        : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {day}
                </button>
              ) : (
                <div />
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-200">
          <button
            onClick={() => {
              const today = new Date();
              setViewDate(today);
              onSelectDate(today);
              onClose();
            }}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            היום
          </button>
          <button
            onClick={onClose}
            className="text-sm text-gray-600 hover:text-gray-700 font-medium"
          >
            סגור
          </button>
        </div>
      </div>
    </>
  );
}
