import React, { useState } from "react";
import { formatMonthYear } from "@/lib/dateUtils";
import { DatePickerPopup } from "./DatePickerPopup";

interface CalendarHeaderProps {
  currentDate: Date;
  view: "day" | "week";
  onViewChange: (view: "day" | "week") => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (date: Date) => void;
  onShowAllEvents: () => void;
}

export function CalendarHeader({
  currentDate,
  view,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
  onShowAllEvents,
}: CalendarHeaderProps) {
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  return (
    <div
      className="flex flex-col md:flex-row items-center justify-between px-4 py-4 border-b border-gray-200 bg-white gap-4"
      dir="rtl"
    >
      {/* Top Row: Title */}
      <div className="flex items-center justify-between w-full md:w-auto">
        <h1 className="text-xl md:text-2xl font-semibold text-gray-800">
          {formatMonthYear(currentDate)}
        </h1>

        {/* Mobile View Switcher (Visible only on mobile to save space in main controls if needed, 
            but we can keep the main one valid. Let's stick to one View Switcher) */}
      </div>

      {/* Controls Container */}
      <div className="flex flex-col w-full md:w-auto gap-3 md:flex-row md:items-center">
        {/* Navigation Group */}
        <div className="flex items-center justify-between md:justify-start w-full md:w-auto gap-2">
          {/* Month Nav */}
          <div className="flex items-center gap-1 px-1 py-1 bg-gray-50 rounded-lg border border-gray-200 shrink-0">
            <button
              onClick={onPrevMonth}
              className="p-1.5 hover:bg-gray-200 rounded transition-colors"
              aria-label="חודש הבא"
            >
              <svg
                className="w-4 h-4 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
            <span className="text-xs font-medium text-gray-500 px-1 hidden sm:inline">
              חודש
            </span>
            <button
              onClick={onNextMonth}
              className="p-1.5 hover:bg-gray-200 rounded transition-colors"
              aria-label="חודש קודם"
            >
              <svg
                className="w-4 h-4 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          </div>

          {/* Period Nav */}
          <div className="flex items-center gap-1 px-1 py-1 bg-gray-50 rounded-lg border border-gray-200 shrink-0">
            <button
              onClick={onPrev}
              className="p-1.5 hover:bg-gray-200 rounded transition-colors"
              aria-label={view === "day" ? "יום הבא" : "שבוע הבא"}
            >
              <svg
                className="w-4 h-4 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
            <span className="text-xs font-medium text-gray-500 px-1 w-8 text-center">
              {view === "day" ? "יום" : "שבוע"}
            </span>
            <button
              onClick={onNext}
              className="p-1.5 hover:bg-gray-200 rounded transition-colors"
              aria-label={view === "day" ? "יום קודם" : "שבוע קודם"}
            >
              <svg
                className="w-4 h-4 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          </div>

          {/* Today Button */}
          <button
            onClick={onToday}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm whitespace-nowrap"
          >
            היום
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Date Picker */}
          <div className="relative flex-1 md:flex-none">
            <button
              onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
              className="w-full md:w-auto px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors shadow-sm flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span>לבחירת תאריך מדויק</span>
            </button>

            <DatePickerPopup
              isOpen={isDatePickerOpen}
              onClose={() => setIsDatePickerOpen(false)}
              onSelectDate={(date) => {
                onSelectDate(date);
                setIsDatePickerOpen(false);
              }}
              currentDate={currentDate}
            />
          </div>

          {/* Show All */}
          <button
            onClick={onShowAllEvents}
            className="flex-1 md:flex-none w-full md:w-auto px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors shadow-sm flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 10h16M4 14h16M4 18h16"
              />
            </svg>
            <span>לצפייה בכל הרשומות</span>
          </button>
        </div>
      </div>

      {/* View Switcher */}
      <div className="flex w-full md:w-auto bg-gray-100 p-1 rounded-lg shrink-0">
        <button
          onClick={() => onViewChange("day")}
          className={`flex-1 md:flex-none px-4 py-1.5 text-xs md:text-sm font-medium rounded-md transition-all ${
            view === "day"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          יום
        </button>
        <button
          onClick={() => onViewChange("week")}
          className={`flex-1 md:flex-none px-4 py-1.5 text-xs md:text-sm font-medium rounded-md transition-all ${
            view === "week"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          שבוע
        </button>
      </div>
    </div>
  );
}
