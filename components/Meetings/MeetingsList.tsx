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
import { Skeleton } from "@/components/ui/skeleton";
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
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="חיפוש משתתף..."
            className="pr-9 w-48 h-9 rounded-lg"
          />
        </div>

        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36 rounded-lg h-9">
            <SelectValue placeholder="סטטוס" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            <SelectItem value="PENDING">ממתין</SelectItem>
            <SelectItem value="CONFIRMED">מאושר</SelectItem>
            <SelectItem value="COMPLETED">הושלם</SelectItem>
            <SelectItem value="CANCELLED">בוטל</SelectItem>
            <SelectItem value="NO_SHOW">לא הגיע</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44 rounded-lg h-9">
            <SelectValue placeholder="סוג פגישה" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסוגים</SelectItem>
            {meetingTypes.map(t => (
              <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 mr-auto">
          <span className="text-sm text-muted-foreground">{total} פגישות</span>
          {statusFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 text-xs cursor-pointer" onClick={() => { setStatusFilter("all"); setPage(1); }}>
              {statusFilter === "PENDING" ? "ממתין" : statusFilter === "CONFIRMED" ? "מאושר" : statusFilter === "COMPLETED" ? "הושלם" : statusFilter === "CANCELLED" ? "בוטל" : "לא הגיע"}
              <X className="h-3 w-3" />
            </Badge>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right bg-[#F8FAFC] text-xs font-medium text-gray-500">משתתף</TableHead>
              <TableHead className="text-right bg-[#F8FAFC] text-xs font-medium text-gray-500">סוג</TableHead>
              <TableHead className="text-right bg-[#F8FAFC] text-xs font-medium text-gray-500">תאריך</TableHead>
              <TableHead className="text-right bg-[#F8FAFC] text-xs font-medium text-gray-500">שעה</TableHead>
              <TableHead className="text-right bg-[#F8FAFC] text-xs font-medium text-gray-500">סטטוס</TableHead>
              <TableHead className="bg-[#F8FAFC]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 w-full mtg-skeleton-shimmer" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filteredMeetings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-0">
                  <Empty className="py-10">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <CalendarDays className="h-6 w-6" />
                      </EmptyMedia>
                      <EmptyTitle>אין פגישות</EmptyTitle>
                      <EmptyDescription>פגישות שנקבעו יופיעו כאן</EmptyDescription>
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
                    className="group cursor-pointer hover:bg-[#F8FAFC] transition-colors duration-150 even:bg-gray-50/30 mtg-slide-up"
                    style={{ animationDelay: `${idx * 40}ms` }}
                    onClick={() => openDetail(m.id)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                          {m.participantName?.charAt(0) || "?"}
                        </div>
                        <div>
                          <span className="block">{m.participantName}</span>
                          {m.participantEmail && (
                            <span className="block text-xs text-gray-400">{m.participantEmail}</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: m.meetingType?.color || "#3B82F6" }}
                        />
                        {m.meetingType?.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatRelativeDate(start)}
                    </TableCell>
                    <TableCell dir="ltr" className="text-right">
                      {start.toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell>
                      <MeetingStatusBadge status={m.status} />
                    </TableCell>
                    <TableCell className="w-10">
                      <Eye className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
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
            className="h-8 w-8 p-0 rounded-lg"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 rounded-lg"
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
        userPlan={userPlan}
      />
    </div>
  );
}
