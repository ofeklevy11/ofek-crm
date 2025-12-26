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
      className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white"
      dir="rtl"
    >
      <div className="flex items-center gap-6">
        <h1 className="text-2xl font-semibold text-gray-800 min-w-[180px]">
          {formatMonthYear(currentDate)}
        </h1>

        {/* Navigation Controls */}
        <div className="flex items-center gap-4">
          {/* Month Navigation */}
          <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">
            <button
              onClick={onNextMonth}
              className="p-1.5 hover:bg-gray-200 rounded transition-colors"
              aria-label="חודש הבא"
              title="חודש הבא"
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
            <span className="text-xs font-medium text-gray-500 px-1">חודש</span>
            <button
              onClick={onPrevMonth}
              className="p-1.5 hover:bg-gray-200 rounded transition-colors"
              aria-label="חודש קודם"
              title="חודש קודם"
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

          {/* Day/Week Navigation */}
          <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">
            <button
              onClick={onNext}
              className="p-1.5 hover:bg-gray-200 rounded transition-colors"
              aria-label={view === "day" ? "יום הבא" : "שבוע הבא"}
              title={view === "day" ? "יום הבא" : "שבוע הבא"}
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
            <span className="text-xs font-medium text-gray-500 px-1">
              {view === "day" ? "יום" : "שבוע"}
            </span>
            <button
              onClick={onPrev}
              className="p-1.5 hover:bg-gray-200 rounded transition-colors"
              aria-label={view === "day" ? "יום קודם" : "שבוע קודם"}
              title={view === "day" ? "יום קודם" : "שבוע קודם"}
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
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            היום
          </button>

          {/* Date Picker Button */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors shadow-sm flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4"
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
                בחר תאריך מדויק
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

            <button
              onClick={onShowAllEvents}
              className="px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors shadow-sm flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
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
              הצג את כל הרשומות
            </button>
          </div>
        </div>
      </div>

      {/* View Switcher */}
      <div className="flex bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => onViewChange("day")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
            view === "day"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          יום
        </button>
        <button
          onClick={() => onViewChange("week")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
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
