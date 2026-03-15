"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { toast } from "sonner";
import {
  Video,
  Calendar,
  Clock,
  Users,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  LinkIcon,
  User,
  Check,
  X,
  HelpCircle,
  Repeat,
  AlertCircle,
} from "lucide-react";
import type { GoogleMeetEvent, GoogleMeetAttendee } from "@/lib/types";
import { useGoogleMeetFilters } from "@/hooks/use-google-meet-filters";
import GoogleMeetFilters from "./GoogleMeetFilters";

interface GoogleMeetListProps {
  open: boolean;
  onClose: () => void;
}

const PAGE_SIZE = 20;

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff === 0) return "היום";
  if (diff === 1) return "מחר";
  if (diff === -1) return "אתמול";
  return date.toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "numeric",
    month: "short",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ResponseStatusIcon({ status }: { status?: string }) {
  switch (status) {
    case "accepted":
      return <Check className="size-3.5 text-emerald-400" aria-label="אישר השתתפות" />;
    case "declined":
      return <X className="size-3.5 text-red-400" aria-label="דחה השתתפות" />;
    case "tentative":
      return <HelpCircle className="size-3.5 text-amber-400" aria-label="אולי ישתתף" />;
    default:
      return <HelpCircle className="size-3.5 text-white/40" aria-label="ממתין לתשובה" />;
  }
}

export default function GoogleMeetList({ open, onClose }: GoogleMeetListProps) {
  const [rawEvents, setRawEvents] = useState<GoogleMeetEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [expandedAttendees, setExpandedAttendees] = useState<Set<string>>(new Set());
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const fetchCounterRef = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    filters,
    setFilter,
    resetFilters,
    dateRange,
    activeFilterCount,
    applyFilters,
  } = useGoogleMeetFilters();

  const filteredEvents = useMemo(() => applyFilters(rawEvents), [applyFilters, rawEvents]);
  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const paginatedEvents = useMemo(
    () => filteredEvents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredEvents, page],
  );

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filters]);

  // Scroll to top on page/filter change
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [page, filters]);

  const fetchAllEvents = useCallback(
    async () => {
      const currentFetch = ++fetchCounterRef.current;
      setLoading(true);
      setFetchError(null);

      try {
        const { getAllGoogleMeetEvents } = await import(
          "@/app/actions/google-meet"
        );
        const result = await getAllGoogleMeetEvents(
          dateRange.start.toISOString(),
          dateRange.end.toISOString(),
        );

        // Discard stale fetch
        if (currentFetch !== fetchCounterRef.current) return;

        if (!result.success) {
          const msg = result.error || "שגיאה בטעינת פגישות Google Meet";
          toast.error(msg);
          setFetchError(msg);
          if (result.connected === false) setConnected(false);
          return;
        }

        setConnected(result.connected ?? null);

        if (result.data) {
          const parsed = result.data.events.map((e) => ({
            ...e,
            startTime: new Date(e.startTime),
            endTime: new Date(e.endTime),
          }));
          setRawEvents(parsed);
        }
      } catch {
        if (currentFetch !== fetchCounterRef.current) return;
        const msg = "שגיאה בטעינת פגישות Google Meet";
        toast.error(msg);
        setFetchError(msg);
      } finally {
        if (currentFetch === fetchCounterRef.current) {
          setLoading(false);
        }
      }
    },
    [dateRange.start, dateRange.end],
  );

  // Fetch when dialog opens or date range changes
  useEffect(() => {
    if (open) {
      setExpandedAttendees(new Set());
      fetchAllEvents();
    }
  }, [open, fetchAllEvents]);

  // Reset filters on dialog close
  const handleClose = useCallback(() => {
    resetFilters();
    setPage(1);
    onClose();
  }, [resetFilters, onClose]);

  const handleConnect = async () => {
    try {
      const res = await fetch("/api/integrations/google/calendar/connect");
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        }
      } else {
        toast.error("שגיאה בהתחברות ל-Google");
      }
    } catch {
      toast.error("שגיאה בהתחברות ל-Google");
    }
  };

  const toggleAttendees = (eventId: string) => {
    setExpandedAttendees((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        ref={scrollContainerRef}
        className="sm:max-w-2xl max-h-[85vh] overflow-y-auto bg-[#1a3a2a] border-white/20 text-white p-0"
        dir="rtl"
      >
        {/* Header accent bar */}
        <div className="h-1 w-full bg-gradient-to-l from-blue-500 via-green-500 to-emerald-500" />

        <div className="px-6 pt-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="size-5 text-blue-400" aria-hidden="true" />
              <span>פגישות Google Meet</span>
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Filters */}
          {connected !== false && (
            <GoogleMeetFilters
              filters={filters}
              setFilter={setFilter}
              resetFilters={resetFilters}
              activeFilterCount={activeFilterCount}
              totalResults={filteredEvents.length}
            />
          )}

          {/* Loading */}
          {loading && (
            <div className="space-y-3" role="status" aria-label="טוען פגישות">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-3"
                >
                  <div className="h-4 w-48 bg-white/10 rounded animate-pulse" />
                  <div className="h-3 w-32 bg-white/10 rounded animate-pulse" />
                  <div className="h-3 w-24 bg-white/10 rounded animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {!loading && fetchError && connected !== false && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia>
                  <AlertCircle className="size-8 text-red-400" />
                </EmptyMedia>
                <EmptyTitle>שגיאה בטעינת פגישות</EmptyTitle>
                <EmptyDescription>{fetchError}</EmptyDescription>
              </EmptyHeader>
              <Button
                onClick={() => {
                  setFetchError(null);
                  fetchAllEvents();
                }}
                className="mt-3 bg-white/[0.08] hover:bg-white/[0.15] text-white border border-white/20"
              >
                <RefreshCw className="size-4 ml-2" aria-hidden="true" />
                נסה שוב
              </Button>
            </Empty>
          )}

          {/* Not connected */}
          {!loading && connected === false && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia>
                  <LinkIcon className="size-8 text-white/40" />
                </EmptyMedia>
                <EmptyTitle>Google Calendar לא מחובר</EmptyTitle>
                <EmptyDescription>
                  כדי לצפות בפגישות Google Meet יש לחבר את חשבון Google Calendar
                  שלך.
                </EmptyDescription>
              </EmptyHeader>
              <Button
                onClick={handleConnect}
                className="mt-3 bg-blue-600 hover:bg-blue-700 text-white"
              >
                חבר את Google Calendar
              </Button>
            </Empty>
          )}

          {/* Empty state: no events in date range */}
          {!loading && !fetchError && connected !== false && rawEvents.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia>
                  <Video className="size-8 text-white/40" />
                </EmptyMedia>
                <EmptyTitle>אין פגישות Google Meet</EmptyTitle>
                <EmptyDescription>
                  לא נמצאו פגישות Google Meet בתקופה הנבחרת.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {/* Empty state: no events after filtering */}
          {!loading && !fetchError && connected !== false && rawEvents.length > 0 && filteredEvents.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia>
                  <Video className="size-8 text-white/40" />
                </EmptyMedia>
                <EmptyTitle>אין פגישות תואמות</EmptyTitle>
                <EmptyDescription>
                  לא נמצאו פגישות שמתאימות למסננים שנבחרו.
                </EmptyDescription>
              </EmptyHeader>
              <Button
                onClick={resetFilters}
                className="mt-3 bg-white/[0.08] hover:bg-white/[0.15] text-white border border-white/20"
              >
                נקה מסננים
              </Button>
            </Empty>
          )}

          {/* Events list */}
          {!loading && paginatedEvents.length > 0 && (
            <div className="space-y-3">
              {paginatedEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] transition-colors p-4 space-y-3"
                >
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <h4 className="font-medium text-white/90 truncate">
                        {event.title}
                      </h4>
                      {event.isRecurring && (
                        <Badge
                          variant="outline"
                          className="shrink-0 border-white/20 text-white/60 text-xs gap-1"
                        >
                          <Repeat className="size-3" aria-hidden="true" />
                          חוזר
                        </Badge>
                      )}
                    </div>
                    {event.meetLink && (
                      <a
                        href={event.meetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0"
                        aria-label="הצטרף לפגישת Google Meet"
                      >
                        <Button
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 text-xs"
                        >
                          <Video className="size-3.5" aria-hidden="true" />
                          הצטרף ל-Meet
                        </Button>
                      </a>
                    )}
                  </div>

                  {/* Date & time */}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-white/60">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="size-3.5" aria-hidden="true" />
                      <span>{formatRelativeDate(event.startTime)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="size-3.5" aria-hidden="true" />
                      <span dir="ltr">
                        {formatTime(event.startTime)} -{" "}
                        {formatTime(event.endTime)}
                      </span>
                    </div>
                  </div>

                  {/* Organizer */}
                  {event.organizer?.email && (
                    <div className="flex items-center gap-1.5 text-sm text-white/50">
                      <User className="size-3.5" aria-hidden="true" />
                      <span>
                        מארגן:{" "}
                        {event.organizer.displayName || event.organizer.email}
                      </span>
                    </div>
                  )}

                  {/* Attendees */}
                  {event.attendees.length > 0 && (
                    <div>
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white/70 transition-colors"
                        onClick={() => toggleAttendees(event.id)}
                        aria-expanded={expandedAttendees.has(event.id)}
                        aria-controls={`attendees-${event.id}`}
                      >
                        <Users className="size-3.5" aria-hidden="true" />
                        <span>
                          {event.attendees.length} משתתפים
                        </span>
                        <ChevronLeft
                          className={`size-3 transition-transform ${expandedAttendees.has(event.id) ? "-rotate-90" : ""}`}
                          aria-hidden="true"
                        />
                      </button>

                      {expandedAttendees.has(event.id) && (
                        <div
                          id={`attendees-${event.id}`}
                          className="mt-2 mr-5 space-y-1.5"
                        >
                          {event.attendees.map((attendee, i) => (
                            <div
                              key={`${attendee.email}-${i}`}
                              className="flex items-center gap-2 text-xs text-white/50"
                            >
                              <ResponseStatusIcon
                                status={attendee.responseStatus}
                              />
                              <span>
                                {attendee.displayName || attendee.email}
                              </span>
                              {attendee.displayName && (
                                <span className="text-white/30" dir="ltr">
                                  ({attendee.email})
                                </span>
                              )}
                              {attendee.self && (
                                <Badge
                                  variant="outline"
                                  className="border-white/15 text-white/40 text-[10px] py-0"
                                >
                                  אתה
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Google Calendar link */}
                  {event.googleEventUrl && (
                    <div className="pt-1 border-t border-white/5">
                      <a
                        href={event.googleEventUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors"
                        aria-label="פתח ב-Google Calendar"
                      >
                        <ExternalLink className="size-3" aria-hidden="true" />
                        פתח ב-Google Calendar
                      </a>
                    </div>
                  )}
                </div>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 rounded-lg bg-white/[0.08] border-white/20 text-white/80 hover:bg-white/[0.15] hover:text-white"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    aria-label="עמוד הקודם"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                  <span className="text-sm text-white/60 tabular-nums" aria-live="polite" aria-atomic="true">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 rounded-lg bg-white/[0.08] border-white/20 text-white/80 hover:bg-white/[0.15] hover:text-white"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    aria-label="עמוד הבא"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
