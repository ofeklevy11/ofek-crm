"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import type { GoogleMeetEvent, GoogleMeetAttendee } from "@/lib/types";

interface GoogleMeetListProps {
  open: boolean;
  onClose: () => void;
}

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

function getWeekRange(offset: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - dayOfWeek + offset * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const label = `${start.toLocaleDateString("he-IL", { day: "numeric", month: "short" })} - ${end.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" })}`;
  return { start, end, label };
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
  const [events, setEvents] = useState<GoogleMeetEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedAttendees, setExpandedAttendees] = useState<Set<string>>(new Set());

  const { start, end, label: weekLabel } = getWeekRange(weekOffset);

  const fetchEvents = useCallback(
    async (pageToken?: string) => {
      if (!pageToken) setLoading(true);
      else setLoadingMore(true);

      try {
        const { getGoogleMeetEvents } = await import(
          "@/app/actions/google-meet"
        );
        const result = await getGoogleMeetEvents(
          start.toISOString(),
          end.toISOString(),
          pageToken,
        );

        if (!result.success) {
          toast.error(result.error || "שגיאה בטעינת פגישות Google Meet");
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

          if (pageToken) {
            setEvents((prev) => [...prev, ...parsed]);
          } else {
            setEvents(parsed);
          }
          setNextPageToken(result.data.nextPageToken);
        }
      } catch {
        toast.error("שגיאה בטעינת פגישות Google Meet");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [start, end],
  );

  useEffect(() => {
    if (open) {
      setExpandedAttendees(new Set());
      fetchEvents();
    }
  }, [open, fetchEvents]);

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
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
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
          {/* Week navigation */}
          <div className="flex items-center justify-between bg-white/[0.06] rounded-lg px-3 py-2 border border-white/10">
            <Button
              variant="ghost"
              size="sm"
              className="text-white/60 hover:text-white hover:bg-white/10 p-1.5"
              onClick={() => setWeekOffset((p) => p + 1)}
              aria-label="שבוע הבא"
            >
              <ChevronRight className="size-4" />
            </Button>
            <span className="text-sm text-white/80 font-medium" dir="ltr">
              {weekLabel}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-white/60 hover:text-white hover:bg-white/10 p-1.5"
              onClick={() => setWeekOffset((p) => p - 1)}
              aria-label="שבוע קודם"
            >
              <ChevronLeft className="size-4" />
            </Button>
          </div>

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

          {/* Empty state */}
          {!loading && connected !== false && events.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia>
                  <Video className="size-8 text-white/40" />
                </EmptyMedia>
                <EmptyTitle>אין פגישות Google Meet</EmptyTitle>
                <EmptyDescription>
                  לא נמצאו פגישות Google Meet בשבוע הנבחר.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {/* Events list */}
          {!loading && events.length > 0 && (
            <div className="space-y-3">
              {events.map((event) => (
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

              {/* Load more */}
              {nextPageToken && (
                <Button
                  variant="outline"
                  className="w-full bg-white/[0.06] hover:bg-white/[0.1] text-white/60 border-white/10"
                  onClick={() => fetchEvents(nextPageToken)}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <RefreshCw
                      className="size-4 animate-spin ml-2"
                      aria-hidden="true"
                    />
                  ) : null}
                  {loadingMore ? "טוען..." : "טען עוד"}
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
