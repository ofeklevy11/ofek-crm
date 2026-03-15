"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Search,
  SlidersHorizontal,
  X,
  ArrowUpDown,
  CalendarIcon,
} from "lucide-react";
import type { GoogleMeetFilters as FilterState } from "@/hooks/use-google-meet-filters";

interface GoogleMeetFiltersProps {
  filters: FilterState;
  setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  resetFilters: () => void;
  activeFilterCount: number;
  totalResults: number;
}

const DATE_PRESET_LABELS: Record<FilterState["datePreset"], string> = {
  today: "היום",
  tomorrow: "מחר",
  thisWeek: "השבוע",
  thisMonth: "החודש",
  custom: "טווח מותאם",
};

const SORT_LABELS: Record<FilterState["sortBy"], string> = {
  closest: "הקרוב ביותר",
  farthest: "הרחוק ביותר",
  newest: "החדש ביותר",
  name: "שם",
};

const PARTICIPANT_COUNT_LABELS: Record<string, string> = {
  "1on1": "1 על 1",
  small: "קבוצה קטנה (3-5)",
  large: "קבוצה גדולה (6+)",
};

const DURATION_LABELS: Record<string, string> = {
  "15": "עד 15 דקות",
  "15-30": "15-30 דקות",
  "30-60": "30-60 דקות",
  "60+": "שעה+",
};

const RESPONSE_STATUS_LABELS: Record<string, string> = {
  accepted: "אישרו",
  needsAction: "ממתין לתשובה",
  declined: "דחו",
};

const RECURRING_LABELS: Record<string, string> = {
  "one-time": "חד פעמי",
  recurring: "חוזר",
};

const SMART_FIELD_LABELS: Record<string, string> = {
  title: "כותרת",
  organizer: "מארגן",
  participant: "משתתף",
};

function getActiveFilterChips(filters: FilterState): { key: string; label: string; onRemove: () => [keyof FilterState, FilterState[keyof FilterState]] }[] {
  const chips: { key: string; label: string; onRemove: () => [keyof FilterState, FilterState[keyof FilterState]] }[] = [];

  if (filters.searchText.trim()) {
    chips.push({
      key: "search",
      label: `חיפוש: "${filters.searchText}"`,
      onRemove: () => ["searchText", ""],
    });
  }
  if (filters.datePreset !== "thisWeek") {
    chips.push({
      key: "date",
      label: `תאריך: ${DATE_PRESET_LABELS[filters.datePreset]}`,
      onRemove: () => ["datePreset", "thisWeek"],
    });
  }
  if (filters.organizer.trim()) {
    chips.push({
      key: "organizer",
      label: `מארגן: "${filters.organizer}"`,
      onRemove: () => ["organizer", ""],
    });
  }
  if (filters.participant.trim()) {
    chips.push({
      key: "participant",
      label: `משתתף: "${filters.participant}"`,
      onRemove: () => ["participant", ""],
    });
  }
  if (filters.participantCount) {
    chips.push({
      key: "participantCount",
      label: PARTICIPANT_COUNT_LABELS[filters.participantCount],
      onRemove: () => ["participantCount", null],
    });
  }
  if (filters.duration) {
    chips.push({
      key: "duration",
      label: DURATION_LABELS[filters.duration],
      onRemove: () => ["duration", null],
    });
  }
  if (filters.responseStatus) {
    chips.push({
      key: "responseStatus",
      label: RESPONSE_STATUS_LABELS[filters.responseStatus],
      onRemove: () => ["responseStatus", null],
    });
  }
  if (filters.recurring) {
    chips.push({
      key: "recurring",
      label: RECURRING_LABELS[filters.recurring],
      onRemove: () => ["recurring", null],
    });
  }
  if (filters.sortBy !== "closest") {
    chips.push({
      key: "sort",
      label: `מיון: ${SORT_LABELS[filters.sortBy]}`,
      onRemove: () => ["sortBy", "closest"],
    });
  }

  return chips;
}

export default function GoogleMeetFilters({
  filters,
  setFilter,
  resetFilters,
  activeFilterCount,
  totalResults,
}: GoogleMeetFiltersProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const chips = getActiveFilterChips(filters);

  return (
    <div className="space-y-3">
      {/* Search section */}
      <div className="space-y-2">
        {/* Search mode toggle */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-white/20 overflow-hidden" role="group" aria-label="מצב חיפוש">
            <button
              type="button"
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                filters.searchMode === "simple"
                  ? "bg-white/[0.15] text-white"
                  : "bg-white/[0.04] text-white/50 hover:text-white/70"
              }`}
              onClick={() => setFilter("searchMode", "simple")}
              aria-pressed={filters.searchMode === "simple"}
            >
              חיפוש רגיל
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-white/20 ${
                filters.searchMode === "smart"
                  ? "bg-white/[0.15] text-white"
                  : "bg-white/[0.04] text-white/50 hover:text-white/70"
              }`}
              onClick={() => setFilter("searchMode", "smart")}
              aria-pressed={filters.searchMode === "smart"}
            >
              חיפוש חכם
            </button>
          </div>

          {/* Filters toggle button */}
          <Button
            variant="outline"
            size="sm"
            className="mr-auto bg-white/[0.06] hover:bg-white/[0.12] text-white/70 border-white/20 gap-1.5 text-xs"
            onClick={() => setFiltersOpen(!filtersOpen)}
            aria-expanded={filtersOpen}
            aria-controls="google-meet-filters-panel"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            מסננים
            {activeFilterCount > 0 && (
              <Badge className="bg-blue-600 text-white text-[10px] px-1.5 py-0 min-w-[1.25rem] h-4">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Search input */}
        <div className="flex gap-2">
          {filters.searchMode === "smart" && (
            <Select
              value={filters.smartSearchField || ""}
              onValueChange={(v) => setFilter("smartSearchField", (v || null) as FilterState["smartSearchField"])}
            >
              <SelectTrigger
                className="w-28 shrink-0 h-9 rounded-lg bg-white/[0.08] border-white/20 text-white text-xs"
                aria-label="שדה חיפוש"
              >
                <SelectValue placeholder="שדה" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a3a2a] border-white/20 text-white/80">
                <SelectItem value="title">{SMART_FIELD_LABELS.title}</SelectItem>
                <SelectItem value="organizer">{SMART_FIELD_LABELS.organizer}</SelectItem>
                <SelectItem value="participant">{SMART_FIELD_LABELS.participant}</SelectItem>
              </SelectContent>
            </Select>
          )}
          <div className="relative flex-1">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-white/50" aria-hidden="true" />
            <Input
              value={filters.searchText}
              onChange={(e) => setFilter("searchText", e.target.value)}
              placeholder={
                filters.searchMode === "smart"
                  ? `חיפוש לפי ${filters.smartSearchField ? SMART_FIELD_LABELS[filters.smartSearchField] : "שדה"}...`
                  : "חיפוש פגישות..."
              }
              aria-label="חיפוש פגישות"
              className="pr-9 h-9 rounded-lg bg-white/[0.08] border-white/20 text-white placeholder:text-white/50 focus:ring-blue-500/50"
            />
          </div>
        </div>
      </div>

      {/* Collapsible filter panel */}
      {filtersOpen && (
        <div
          id="google-meet-filters-panel"
          className="space-y-3 bg-white/[0.04] rounded-lg p-3 border border-white/10"
        >
          {/* Row 1: Date */}
          <div className="flex flex-wrap gap-2">
            <Select
              value={filters.datePreset}
              onValueChange={(v) => setFilter("datePreset", v as FilterState["datePreset"])}
            >
              <SelectTrigger
                className="w-full sm:w-36 h-9 rounded-lg bg-white/[0.08] border-white/20 text-white text-xs"
                aria-label="טווח תאריכים"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a3a2a] border-white/20 text-white/80">
                <SelectItem value="today">{DATE_PRESET_LABELS.today}</SelectItem>
                <SelectItem value="tomorrow">{DATE_PRESET_LABELS.tomorrow}</SelectItem>
                <SelectItem value="thisWeek">{DATE_PRESET_LABELS.thisWeek}</SelectItem>
                <SelectItem value="thisMonth">{DATE_PRESET_LABELS.thisMonth}</SelectItem>
                <SelectItem value="custom">{DATE_PRESET_LABELS.custom}</SelectItem>
              </SelectContent>
            </Select>

            {filters.datePreset === "custom" && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-9 bg-white/[0.08] border-white/20 text-white/80 text-xs gap-1.5 hover:bg-white/[0.12]"
                    >
                      <CalendarIcon className="size-3.5" aria-hidden="true" />
                      {filters.customDateFrom
                        ? new Date(filters.customDateFrom).toLocaleDateString("he-IL", { day: "numeric", month: "short" })
                        : "מתאריך"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-[#1a3a2a] border-white/20" align="start">
                    <Calendar
                      mode="single"
                      selected={filters.customDateFrom ? new Date(filters.customDateFrom) : undefined}
                      onSelect={(date) => setFilter("customDateFrom", date ? date.toISOString().split("T")[0] : null)}
                    />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-9 bg-white/[0.08] border-white/20 text-white/80 text-xs gap-1.5 hover:bg-white/[0.12]"
                    >
                      <CalendarIcon className="size-3.5" aria-hidden="true" />
                      {filters.customDateTo
                        ? new Date(filters.customDateTo).toLocaleDateString("he-IL", { day: "numeric", month: "short" })
                        : "עד תאריך"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-[#1a3a2a] border-white/20" align="start">
                    <Calendar
                      mode="single"
                      selected={filters.customDateTo ? new Date(filters.customDateTo) : undefined}
                      onSelect={(date) => setFilter("customDateTo", date ? date.toISOString().split("T")[0] : null)}
                    />
                  </PopoverContent>
                </Popover>
              </>
            )}
          </div>

          {/* Row 2: Organizer + Participant */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[140px]">
              <Input
                value={filters.organizer}
                onChange={(e) => setFilter("organizer", e.target.value)}
                placeholder="מארגן..."
                aria-label="סינון לפי מארגן"
                className="h-9 rounded-lg bg-white/[0.08] border-white/20 text-white placeholder:text-white/50 text-xs focus:ring-blue-500/50"
              />
            </div>
            <div className="relative flex-1 min-w-[140px]">
              <Input
                value={filters.participant}
                onChange={(e) => setFilter("participant", e.target.value)}
                placeholder="משתתף..."
                aria-label="סינון לפי משתתף"
                className="h-9 rounded-lg bg-white/[0.08] border-white/20 text-white placeholder:text-white/50 text-xs focus:ring-blue-500/50"
              />
            </div>
          </div>

          {/* Row 3: Participant count, Duration, Response status, Recurring */}
          <div className="flex flex-wrap gap-2">
            <Select
              value={filters.participantCount || "all"}
              onValueChange={(v) => setFilter("participantCount", v === "all" ? null : v as FilterState["participantCount"])}
            >
              <SelectTrigger
                className="w-full sm:w-40 h-9 rounded-lg bg-white/[0.08] border-white/20 text-white text-xs"
                aria-label="מספר משתתפים"
              >
                <SelectValue placeholder="מספר משתתפים" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a3a2a] border-white/20 text-white/80">
                <SelectItem value="all">כל הגדלים</SelectItem>
                <SelectItem value="1on1">{PARTICIPANT_COUNT_LABELS["1on1"]}</SelectItem>
                <SelectItem value="small">{PARTICIPANT_COUNT_LABELS.small}</SelectItem>
                <SelectItem value="large">{PARTICIPANT_COUNT_LABELS.large}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.duration || "all"}
              onValueChange={(v) => setFilter("duration", v === "all" ? null : v as FilterState["duration"])}
            >
              <SelectTrigger
                className="w-full sm:w-36 h-9 rounded-lg bg-white/[0.08] border-white/20 text-white text-xs"
                aria-label="משך הפגישה"
              >
                <SelectValue placeholder="משך" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a3a2a] border-white/20 text-white/80">
                <SelectItem value="all">כל משך</SelectItem>
                <SelectItem value="15">{DURATION_LABELS["15"]}</SelectItem>
                <SelectItem value="15-30">{DURATION_LABELS["15-30"]}</SelectItem>
                <SelectItem value="30-60">{DURATION_LABELS["30-60"]}</SelectItem>
                <SelectItem value="60+">{DURATION_LABELS["60+"]}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.responseStatus || "all"}
              onValueChange={(v) => setFilter("responseStatus", v === "all" ? null : v as FilterState["responseStatus"])}
            >
              <SelectTrigger
                className="w-full sm:w-36 h-9 rounded-lg bg-white/[0.08] border-white/20 text-white text-xs"
                aria-label="סטטוס תשובה"
              >
                <SelectValue placeholder="סטטוס תשובה" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a3a2a] border-white/20 text-white/80">
                <SelectItem value="all">כל הסטטוסים</SelectItem>
                <SelectItem value="accepted">{RESPONSE_STATUS_LABELS.accepted}</SelectItem>
                <SelectItem value="needsAction">{RESPONSE_STATUS_LABELS.needsAction}</SelectItem>
                <SelectItem value="declined">{RESPONSE_STATUS_LABELS.declined}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.recurring || "all"}
              onValueChange={(v) => setFilter("recurring", v === "all" ? null : v as FilterState["recurring"])}
            >
              <SelectTrigger
                className="w-full sm:w-32 h-9 rounded-lg bg-white/[0.08] border-white/20 text-white text-xs"
                aria-label="סוג פגישה"
              >
                <SelectValue placeholder="סוג" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a3a2a] border-white/20 text-white/80">
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="one-time">{RECURRING_LABELS["one-time"]}</SelectItem>
                <SelectItem value="recurring">{RECURRING_LABELS.recurring}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Summary row with active filter chips */}
      {(chips.length > 0 || activeFilterCount > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <Badge
              key={chip.key}
              variant="secondary"
              className="gap-1 text-xs cursor-pointer bg-white/[0.08] text-white/80 border-white/20 hover:bg-white/[0.15] focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:ring-offset-1 focus:ring-offset-transparent"
              onClick={() => {
                const [key, value] = chip.onRemove();
                setFilter(key, value as FilterState[typeof key]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  const [key, value] = chip.onRemove();
                  setFilter(key, value as FilterState[typeof key]);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`הסר סינון: ${chip.label}`}
            >
              {chip.label}
              <X className="size-3" aria-hidden="true" />
            </Badge>
          ))}

          {chips.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-white/50 hover:text-white hover:bg-white/[0.08] h-6 px-2"
              onClick={resetFilters}
            >
              נקה הכל
            </Button>
          )}

          <div className="flex items-center gap-2 mr-auto">
            {/* Sort */}
            <Select
              value={filters.sortBy}
              onValueChange={(v) => setFilter("sortBy", v as FilterState["sortBy"])}
            >
              <SelectTrigger
                className="w-32 h-7 rounded-md bg-white/[0.06] border-white/15 text-white/70 text-xs gap-1"
                aria-label="מיון"
              >
                <ArrowUpDown className="size-3" aria-hidden="true" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a3a2a] border-white/20 text-white/80">
                <SelectItem value="closest">{SORT_LABELS.closest}</SelectItem>
                <SelectItem value="farthest">{SORT_LABELS.farthest}</SelectItem>
                <SelectItem value="newest">{SORT_LABELS.newest}</SelectItem>
                <SelectItem value="name">{SORT_LABELS.name}</SelectItem>
              </SelectContent>
            </Select>

            <span className="text-xs text-white/50" aria-live="polite" aria-atomic="true">
              {totalResults} תוצאות
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
