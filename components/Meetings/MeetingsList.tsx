"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import MeetingStatusBadge from "./MeetingStatusBadge";
import MeetingDetailModal from "./MeetingDetailModal";
import { toast } from "sonner";
import { ChevronRight, ChevronLeft, CalendarDays, Search, Eye, X } from "lucide-react";

interface MeetingType {
  id: number;
  name: string;
  color?: string | null;
}

interface MeetingsListProps {
  meetingTypes: MeetingType[];
  userPlan: string;
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "היום";
  if (diff === 1) return "מחר";
  if (diff === -1) return "אתמול";
  return date.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "short" });
}

export default function MeetingsList({ meetingTypes, userPlan }: MeetingsListProps) {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const limit = 15;

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const { getMeetings } = await import("@/app/actions/meetings");
      const filters: any = { page, limit };
      if (statusFilter !== "all") filters.status = statusFilter;
      if (typeFilter !== "all") filters.meetingTypeId = Number(typeFilter);

      const result = await getMeetings(filters);
      if (result.success && result.data) {
        setMeetings(result.data.meetings);
        setTotal(result.data.total);
      }
    } catch {
      toast.error("שגיאה בטעינת פגישות");
    }
    setLoading(false);
  }, [page, statusFilter, typeFilter]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const openDetail = async (meetingId: string) => {
    try {
      const { getMeetingById } = await import("@/app/actions/meetings");
      const result = await getMeetingById(meetingId);
      if (result.success && result.data) {
        setSelectedMeeting(result.data);
        setDetailOpen(true);
      }
    } catch {
      toast.error("שגיאה בטעינת פרטי פגישה");
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    const { updateMeetingStatus } = await import("@/app/actions/meetings");
    const result = await updateMeetingStatus(id, status);
    if (result.success) fetchMeetings();
    return result;
  };

  const handleUpdateNotes = async (id: string, notesBefore?: string, notesAfter?: string) => {
    const { updateMeetingNotes } = await import("@/app/actions/meetings");
    return updateMeetingNotes(id, notesBefore, notesAfter);
  };

  const handleCancel = async (id: string, reason?: string) => {
    const { cancelMeeting } = await import("@/app/actions/meetings");
    const result = await cancelMeeting(id, reason);
    if (result.success) fetchMeetings();
    return result;
  };

  const handleUpdateTags = async (id: string, tags: string[]) => {
    const { updateMeetingTags } = await import("@/app/actions/meetings");
    return updateMeetingTags(id, tags);
  };

  const handleReschedule = async (id: string, newStart: string, newEnd: string) => {
    const { rescheduleMeeting } = await import("@/app/actions/meetings");
    const result = await rescheduleMeeting(id, newStart, newEnd);
    if (result.success) fetchMeetings();
    return result;
  };

  const totalPages = Math.ceil(total / limit);

  const filteredMeetings = searchQuery.trim()
    ? meetings.filter(m =>
        m.participantName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.participantEmail?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : meetings;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="חיפוש משתתף..."
            className="pr-9 w-full sm:w-48 h-9 rounded-lg bg-white/[0.08] border-white/20 text-white placeholder:text-white/50 focus:ring-blue-500/50"
          />
        </div>

        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-36 rounded-lg h-9 bg-white/[0.08] border-white/20 text-white">
            <SelectValue placeholder="סטטוס" />
          </SelectTrigger>
          <SelectContent className="bg-[#1a3a2a] border-white/20 text-white/80">
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            <SelectItem value="PENDING">ממתין</SelectItem>
            <SelectItem value="CONFIRMED">מאושר</SelectItem>
            <SelectItem value="COMPLETED">הושלם</SelectItem>
            <SelectItem value="CANCELLED">בוטל</SelectItem>
            <SelectItem value="NO_SHOW">לא הגיע</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44 rounded-lg h-9 bg-white/[0.08] border-white/20 text-white">
            <SelectValue placeholder="סוג פגישה" />
          </SelectTrigger>
          <SelectContent className="bg-[#1a3a2a] border-white/20 text-white/80">
            <SelectItem value="all">כל הסוגים</SelectItem>
            {meetingTypes.map(t => (
              <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 mr-auto">
          <span className="text-sm text-white/60">{total} פגישות</span>
          {statusFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 text-xs cursor-pointer bg-white/[0.08] text-white/80 border-white/20 hover:bg-white/[0.15]" onClick={() => { setStatusFilter("all"); setPage(1); }}>
              {statusFilter === "PENDING" ? "ממתין" : statusFilter === "CONFIRMED" ? "מאושר" : statusFilter === "COMPLETED" ? "הושלם" : statusFilter === "CANCELLED" ? "בוטל" : "לא הגיע"}
              <X className="h-3 w-3" />
            </Badge>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#162e22] backdrop-blur-sm rounded-xl border border-white/20 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-white/20 hover:bg-transparent">
              <TableHead className="text-right bg-white/[0.04] text-sm font-medium text-white/70">משתתף</TableHead>
              <TableHead className="text-right bg-white/[0.04] text-sm font-medium text-white/70">סוג</TableHead>
              <TableHead className="text-right bg-white/[0.04] text-sm font-medium text-white/70">תאריך</TableHead>
              <TableHead className="text-right bg-white/[0.04] text-sm font-medium text-white/70">שעה</TableHead>
              <TableHead className="text-right bg-white/[0.04] text-sm font-medium text-white/70">סטטוס</TableHead>
              <TableHead className="bg-white/[0.04]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-white/20">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 w-full mtg-dark-skeleton" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filteredMeetings.length === 0 ? (
              <TableRow className="border-white/20">
                <TableCell colSpan={6} className="py-0">
                  <Empty className="py-10">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <CalendarDays className="h-6 w-6 text-white/60" />
                      </EmptyMedia>
                      <EmptyTitle className="text-white">אין פגישות</EmptyTitle>
                      <EmptyDescription className="text-white/60">פגישות שנקבעו יופיעו כאן</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              filteredMeetings.map((m, idx) => {
                const start = new Date(m.startTime);
                return (
                  <TableRow
                    key={m.id}
                    className="group cursor-pointer hover:bg-white/[0.06] transition-colors duration-150 even:bg-white/[0.02] border-white/20 mtg-slide-up"
                    style={{ animationDelay: `${idx * 40}ms` }}
                    onClick={() => openDetail(m.id)}
                  >
                    <TableCell className="font-medium text-white">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-500/15 text-blue-300 flex items-center justify-center text-xs font-bold shrink-0">
                          {m.participantName?.charAt(0) || "?"}
                        </div>
                        <div>
                          <span className="block text-white">{m.participantName}</span>
                          {m.participantEmail && (
                            <span className="block text-xs text-white/60">{m.participantEmail}</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-white/80">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: m.meetingType?.color || "#3B82F6" }}
                        />
                        {m.meetingType?.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-white/80">
                      {formatRelativeDate(start)}
                    </TableCell>
                    <TableCell dir="ltr" className="text-right text-white/80">
                      {start.toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell>
                      <MeetingStatusBadge status={m.status} />
                    </TableCell>
                    <TableCell className="w-10">
                      <Eye className="h-4 w-4 text-white/50 opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 rounded-lg bg-white/[0.08] border-white/20 text-white/80 hover:bg-white/[0.15] hover:text-white"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm text-white/60 tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 rounded-lg bg-white/[0.08] border-white/20 text-white/80 hover:bg-white/[0.15] hover:text-white"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Detail Modal */}
      <MeetingDetailModal
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedMeeting(null); }}
        meeting={selectedMeeting}
        onUpdateStatus={handleUpdateStatus}
        onUpdateNotes={handleUpdateNotes}
        onCancel={handleCancel}
        onUpdateTags={handleUpdateTags}
        onReschedule={handleReschedule}
        userPlan={userPlan}
      />
    </div>
  );
}
