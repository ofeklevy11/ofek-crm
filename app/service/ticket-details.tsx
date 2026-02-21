"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import {
  X,
  Send,
  User,
  CheckCircle2,
  Clock,
  AlertCircle,
  MoreVertical,
  Paperclip,
  Trash2,
  History,
  ArrowLeftRight,
  Pencil,
  Check,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  updateTicket,
  addTicketComment,
  deleteTicket,
  updateTicketComment,
  deleteTicketComment,
} from "@/app/actions/tickets";
import { deleteTicketActivityLog } from "@/app/actions/ticket-activity-logs";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";

// Combines comments and activity logs into a single sorted timeline
function getCombinedActivity(ticket: any) {
  const comments = (ticket.comments || []).map((c: any) => ({
    ...c,
    type: "comment",
  }));

  const activityLogs = (ticket.activityLogs || []).map((log: any) => ({
    ...log,
    type: "activity",
  }));

  // Combine and sort by createdAt (newest first)
  return [...comments, ...activityLogs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function getTypeLabel(type: string) {
  switch (type) {
    case "SERVICE":
      return "שירות";
    case "COMPLAINT":
      return "תלונה";
    case "RETENTION":
      return "שימור";
    case "OTHER":
      return "אחר";
    default:
      return type;
  }
}

interface TicketDetailsProps {
  ticket: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: any[];
  clients?: any[];
  currentUser?: { id: number; role: string };
  onTicketUpdate?: (updatedTicket: any) => void;
}

export default function TicketDetails({
  ticket,
  open,
  onOpenChange,
  users,
  clients = [],
  currentUser,
  onTicketUpdate,
}: TicketDetailsProps) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const isAdmin = currentUser?.role === "admin";

  // Description & Title editing state
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState(
    ticket.description || ""
  );

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(ticket.title || "");

  // Client selection dialog state
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");

  // Comment editing state
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentValue, setEditingCommentValue] = useState("");

  // Helper to create an optimistic log entry
  const createOptimisticLog = (
    fieldName: string,
    fieldLabel: string,
    oldValue: any,
    newValue: any,
    oldLabel: string | null,
    newLabel: string | null
  ) => ({
    id: Date.now(), // Temporary ID
    type: "log",
    fieldName,
    fieldLabel,
    oldValue:
      oldValue !== null && oldValue !== undefined ? String(oldValue) : null,
    newValue:
      newValue !== null && newValue !== undefined ? String(newValue) : null,
    oldLabel,
    newLabel,
    createdAt: new Date(),
    user: {
      id: currentUser?.id,
      name: users.find((u) => u.id === currentUser?.id)?.name || "אני",
    },
  });

  // Hebrew labels for status and priority
  const statusLabels: Record<string, string> = {
    OPEN: "פתוח",
    IN_PROGRESS: "בטיפול",
    WAITING: "ממתין",
    RESOLVED: "טופל",
    CLOSED: "סגור",
  };

  const priorityLabels: Record<string, string> = {
    LOW: "נמוך",
    MEDIUM: "בינוני",
    HIGH: "גבוה",
    CRITICAL: "קריטי",
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateTicket(ticket.id, { status: newStatus });
      toast({ title: "הסטטוס עודכן" });
      // Instant UI update with optimistic log
      const newLog = createOptimisticLog(
        "status",
        "סטטוס",
        ticket.status,
        newStatus,
        statusLabels[ticket.status] || ticket.status,
        statusLabels[newStatus] || newStatus
      );
      onTicketUpdate?.({
        ...ticket,
        status: newStatus,
        activityLogs: [newLog, ...(ticket.activityLogs || [])],
      });
      router.refresh();
    } catch (error) {
      toast({ title: "שגיאה בעדכון הסטטוס", variant: "destructive" });
    }
  };

  const handlePriorityChange = async (newPriority: string) => {
    try {
      await updateTicket(ticket.id, { priority: newPriority });
      toast({ title: "העדיפות עודכנה" });
      // Instant UI update with optimistic log
      const newLog = createOptimisticLog(
        "priority",
        "עדיפות",
        ticket.priority,
        newPriority,
        priorityLabels[ticket.priority] || ticket.priority,
        priorityLabels[newPriority] || newPriority
      );
      onTicketUpdate?.({
        ...ticket,
        priority: newPriority,
        activityLogs: [newLog, ...(ticket.activityLogs || [])],
      });
      router.refresh();
    } catch (error) {
      toast({ title: "שגיאה בעדכון העדיפות", variant: "destructive" });
    }
  };

  const handleAssigneeChange = async (assigneeId: string) => {
    try {
      const assigneeIdNum = parseInt(assigneeId);
      await updateTicket(ticket.id, { assigneeId: assigneeIdNum });
      toast({ title: "הנציג עודכן" });
      // Instant UI update - find the user for display
      const newAssignee = users.find((u) => u.id === assigneeIdNum);
      const oldAssignee = users.find((u) => u.id === ticket.assigneeId);
      const newLog = createOptimisticLog(
        "assigneeId",
        "נציג מטפל",
        ticket.assigneeId,
        assigneeIdNum,
        oldAssignee?.name || "לא משויך",
        newAssignee?.name || "לא משויך"
      );
      onTicketUpdate?.({
        ...ticket,
        assigneeId: assigneeIdNum,
        assignee: newAssignee,
        activityLogs: [newLog, ...(ticket.activityLogs || [])],
      });
      router.refresh();
    } catch (error) {
      toast({ title: "שגיאה בעדכון הנציג", variant: "destructive" });
    }
  };

  const handleSendComment = async () => {
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      const newComment = await addTicketComment(ticket.id, comment);
      setComment("");
      // Instant UI update - add new comment to the list
      const newCommentWithUser = {
        ...newComment,
        user: {
          id: currentUser?.id,
          name: currentUser?.id
            ? users.find((u) => u.id === currentUser.id)?.name || "אני"
            : "אני",
        },
      };
      onTicketUpdate?.({
        ...ticket,
        comments: [newCommentWithUser, ...(ticket.comments || [])],
      });
      router.refresh();
    } catch (error) {
      toast({ title: "שגיאה בשליחת התגובה", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLog = async (logId: number) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק לוג זה?")) return;
    try {
      await deleteTicketActivityLog(logId);
      toast({ title: "הלוג נמחק" });
      // Instant UI update - remove log from list
      onTicketUpdate?.({
        ...ticket,
        activityLogs: (ticket.activityLogs || []).filter(
          (log: any) => log.id !== logId
        ),
      });
      router.refresh();
    } catch (error: any) {
      toast({
        title: getUserFriendlyError(error),
        variant: "destructive",
      });
    }
  };

  // Description handlers
  const handleSaveDescription = async () => {
    try {
      await updateTicket(ticket.id, { description: descriptionValue });
      toast({ title: "התיאור עודכן" });
      setEditingDescription(false);
      // Instant UI update with optimistic log
      const newLog = createOptimisticLog(
        "description",
        "תיאור",
        ticket.description,
        descriptionValue,
        ticket.description, // Use actual old description
        descriptionValue // Use actual new description
      );
      onTicketUpdate?.({
        ...ticket,
        description: descriptionValue,
        activityLogs: [newLog, ...(ticket.activityLogs || [])],
      });
      router.refresh();
    } catch (error) {
      toast({ title: "שגיאה בעדכון התיאור", variant: "destructive" });
    }
  };

  // Title handlers
  const handleSaveTitle = async () => {
    if (!titleValue.trim()) return;
    try {
      await updateTicket(ticket.id, { title: titleValue });
      toast({ title: "הכותרת עודכנה" });
      setEditingTitle(false);
      // Instant UI update with optimistic log
      const newLog = createOptimisticLog(
        "title",
        "כותרת",
        ticket.title,
        titleValue,
        ticket.title,
        titleValue
      );
      onTicketUpdate?.({
        ...ticket,
        title: titleValue,
        activityLogs: [newLog, ...(ticket.activityLogs || [])],
      });
      router.refresh();
    } catch (error) {
      toast({ title: "שגיאה בעדכון הכותרת", variant: "destructive" });
    }
  };

  // Client handlers
  const handleClientChange = async (clientId: number | null) => {
    try {
      // Send null explicitly so activity log can detect the change
      await updateTicket(ticket.id, {
        clientId: clientId as number | null | undefined,
      });
      toast({ title: "הלקוח עודכן" });
      setClientDialogOpen(false);
      // Instant UI update - find the client for display
      const newClient = clientId
        ? clients.find((c) => c.id === clientId)
        : null;
      const oldClient = ticket.client;
      const newLog = createOptimisticLog(
        "clientId",
        "לקוח",
        ticket.clientId,
        clientId,
        oldClient?.name || "אין לקוח",
        newClient?.name || "אין לקוח"
      );
      onTicketUpdate?.({
        ...ticket,
        clientId,
        client: newClient,
        activityLogs: [newLog, ...(ticket.activityLogs || [])],
      });
      router.refresh();
    } catch (error) {
      toast({ title: "שגיאה בעדכון הלקוח", variant: "destructive" });
    }
  };

  const filteredClients = clients.filter(
    (c) =>
      c.name?.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.email?.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.businessName?.toLowerCase().includes(clientSearch.toLowerCase())
  );

  // Comment handlers
  const handleEditComment = (commentItem: any) => {
    setEditingCommentId(commentItem.id);
    setEditingCommentValue(commentItem.content);
  };

  const handleSaveComment = async (commentId: number) => {
    try {
      await updateTicketComment(commentId, editingCommentValue);
      toast({ title: "ההודעה עודכנה" });
      // Instant UI update - update the comment in the list
      const updatedComments = (ticket.comments || []).map((c: any) =>
        c.id === commentId ? { ...c, content: editingCommentValue } : c
      );
      onTicketUpdate?.({ ...ticket, comments: updatedComments });
      setEditingCommentId(null);
      setEditingCommentValue("");
      router.refresh();
    } catch (error: any) {
      toast({
        title: getUserFriendlyError(error),
        variant: "destructive",
      });
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק הודעה זו?")) return;
    try {
      await deleteTicketComment(commentId);
      toast({ title: "ההודעה נמחקה" });
      // Instant UI update - remove comment from list
      onTicketUpdate?.({
        ...ticket,
        comments: (ticket.comments || []).filter(
          (c: any) => c.id !== commentId
        ),
      });
      router.refresh();
    } catch (error: any) {
      toast({
        title: getUserFriendlyError(error),
        variant: "destructive",
      });
    }
  };

  const canEditComment = (commentItem: any) => {
    return isAdmin || commentItem.user?.id === currentUser?.id;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-xl p-0 flex flex-col bg-[#f4f8f8]"
        dir="rtl"
      >
        {/* Header with gradient */}
        <div className="bg-gradient-to-l from-[#4f95ff]/10 via-[#a24ec1]/5 to-white border-b">
          {/* Top bar with close and actions */}
          <div className="flex items-center justify-between p-4 pb-5">
            <div className="flex items-center gap-2 mt-6">
              <Badge
                variant="outline"
                className="bg-white/80 backdrop-blur-sm border-slate-200 text-slate-600 font-mono"
              >
                #{ticket.id}
              </Badge>
              <Badge
                variant="outline"
                className="bg-[#a24ec1]/10 border-[#a24ec1]/20 text-[#a24ec1]"
              >
                {getTypeLabel(ticket.type)}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
              onClick={async () => {
                if (confirm("האם אתה בטוח שברצונך למחוק קריאה זו?")) {
                  try {
                    await deleteTicket(ticket.id);
                    toast({ title: "הקריאה נמחקה" });
                    router.refresh();
                    onOpenChange(false);
                  } catch (error) {
                    toast({
                      title: "שגיאה במחיקת הקריאה",
                      variant: "destructive",
                    });
                  }
                }
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Title */}
          <div className="px-4 py-3 group">
            {editingTitle ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-[#4f95ff] hover:bg-blue-600"
                  onClick={handleSaveTitle}
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTitleValue(ticket.title);
                    setEditingTitle(false);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
                <Input
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  className="text-xl font-bold text-[#000000] text-right h-auto py-1"
                  autoFocus
                />
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <h2 className="text-xl font-bold text-[#000000] text-right leading-tight break-all">
                  {ticket.title}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-slate-400 hover:text-[#4f95ff] mt-1 shrink-0"
                  onClick={() => {
                    setTitleValue(ticket.title);
                    setEditingTitle(true);
                  }}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>

          {/* Quick actions row */}
          <div className="flex items-center gap-3 px-4 pb-4">
            <Select
              key={`status-${ticket.status}`}
              value={ticket.status}
              onValueChange={handleStatusChange}
            >
              <SelectTrigger
                className="w-[130px] h-9 bg-white border-slate-200 shadow-sm text-right"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPEN">פתוח</SelectItem>
                <SelectItem value="IN_PROGRESS">בטיפול</SelectItem>
                <SelectItem value="WAITING">ממתין</SelectItem>
                <SelectItem value="RESOLVED">טופל</SelectItem>
                <SelectItem value="CLOSED">סגור</SelectItem>
              </SelectContent>
            </Select>

            <Select
              key={`priority-${ticket.priority}`}
              value={ticket.priority}
              onValueChange={handlePriorityChange}
            >
              <SelectTrigger
                className="w-[110px] h-9 bg-white border-slate-200 shadow-sm text-right"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">נמוך</SelectItem>
                <SelectItem value="MEDIUM">בינוני</SelectItem>
                <SelectItem value="HIGH">גבוה</SelectItem>
                <SelectItem value="CRITICAL">קריטי</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">
            {/* Description Card */}
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-[#000000] text-right flex items-center gap-2">
                  <span className="w-1 h-4 bg-[#4f95ff] rounded-full"></span>
                  תיאור
                </h3>
                {!editingDescription && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-slate-400 hover:text-[#4f95ff]"
                    onClick={() => {
                      setDescriptionValue(ticket.description || "");
                      setEditingDescription(true);
                    }}
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                )}
              </div>
              {editingDescription ? (
                <div className="space-y-2">
                  <Textarea
                    value={descriptionValue}
                    onChange={(e) => setDescriptionValue(e.target.value)}
                    className="min-h-[100px] text-right resize-none"
                    placeholder="הוסף תיאור לקריאה..."
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingDescription(false)}
                    >
                      ביטול
                    </Button>
                    <Button
                      size="sm"
                      className="bg-[#4f95ff] hover:bg-blue-600"
                      onClick={handleSaveDescription}
                    >
                      <Check className="w-3 h-3 ml-1" />
                      שמור
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-600 whitespace-pre-wrap text-right leading-relaxed">
                  {ticket.description || "לא סופק תיאור."}
                </p>
              )}
            </div>

            {/* Info Cards Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Client Card */}
              <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm group">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-slate-400 block">
                    לקוח
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-slate-400 hover:text-[#4f95ff] opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => {
                      setClientSearch("");
                      setClientDialogOpen(true);
                    }}
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#4f95ff] to-[#4f95ff]/70 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                    {ticket.client?.name?.charAt(0) || "?"}
                  </div>
                  <div className="text-sm font-medium text-[#000000]">
                    {ticket.client?.name || "אין לקוח"}
                  </div>
                </div>
              </div>

              {/* Assignee Card */}
              <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <label className="text-xs font-medium text-slate-400 mb-2 block">
                  נציג מטפל
                </label>
                <Select
                  key={`assignee-${ticket.assigneeId || "none"}`}
                  value={ticket.assigneeId?.toString() || ""}
                  onValueChange={handleAssigneeChange}
                >
                  <SelectTrigger
                    className="h-9 bg-slate-50 border-slate-200 text-right"
                  >
                    <SelectValue placeholder="לא משויך" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Creator Card */}
              <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm col-span-2">
                <label className="text-xs font-medium text-slate-400 mb-2 block">
                  נוצר על ידי
                </label>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#a24ec1] to-[#a24ec1]/70 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                      {ticket.creator?.name?.charAt(0) || "?"}
                    </div>
                    <span className="text-sm font-medium text-[#000000]">
                      {ticket.creator?.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full">
                    <Clock className="w-3 h-3" />
                    {format(new Date(ticket.createdAt), "d MMM, yyyy · HH:mm", {
                      locale: he,
                    })}
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Activity / Comments & Logs */}
            <div>
              <h3 className="text-sm font-bold text-[#000000] mb-4 text-right">
                פעילות
              </h3>
              <div className="space-y-4">
                {/* Combined activity stream: comments + activity logs */}
                {getCombinedActivity(ticket).map((item: any) => (
                  <div key={`${item.type}-${item.id}`}>
                    {item.type === "comment" ? (
                      /* Comment Item */
                      <div className="flex gap-3 group">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="bg-slate-200 text-slate-600">
                            {item.user.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="bg-white border rounded-lg p-3 shadow-sm">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-[#000000]">
                                {item.user.name}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">
                                  {format(
                                    new Date(item.createdAt),
                                    "d MMM, HH:mm",
                                    {
                                      locale: he,
                                    }
                                  )}
                                </span>
                                {canEditComment(item) &&
                                  editingCommentId !== item.id && (
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-slate-400 hover:text-[#4f95ff] hover:bg-blue-50"
                                        onClick={() => handleEditComment(item)}
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                        onClick={() =>
                                          handleDeleteComment(item.id)
                                        }
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  )}
                              </div>
                            </div>
                            {editingCommentId === item.id ? (
                              <div className="space-y-2">
                                <Textarea
                                  value={editingCommentValue}
                                  onChange={(e) =>
                                    setEditingCommentValue(e.target.value)
                                  }
                                  className="min-h-[60px] text-right resize-none text-sm"
                                />
                                <div className="flex gap-2 justify-end">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingCommentId(null);
                                      setEditingCommentValue("");
                                    }}
                                  >
                                    ביטול
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="bg-[#4f95ff] hover:bg-blue-600"
                                    onClick={() => handleSaveComment(item.id)}
                                  >
                                    <Check className="w-3 h-3 ml-1" />
                                    שמור
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-slate-600 leading-relaxed text-right">
                                {item.content}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Activity Log Item */
                      <div className="flex gap-3 items-start group">
                        <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
                          <History className="w-4 h-4 text-[#a24ec1]" />
                        </div>
                        <div className="flex-1">
                          <div className="bg-purple-50/50 border border-purple-100 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-[#000000]">
                                {item.user.name}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">
                                  {format(
                                    new Date(item.createdAt),
                                    "d MMM, HH:mm",
                                    {
                                      locale: he,
                                    }
                                  )}
                                </span>
                                {isAdmin && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-600 hover:bg-red-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteLog(item.id);
                                    }}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="text-sm text-slate-600 text-right">
                              <span>שינה את </span>
                              <span className="font-medium text-[#a24ec1]">
                                {item.fieldLabel}
                              </span>
                              <span> מ"</span>
                              <span className="font-medium text-slate-700">
                                {item.oldLabel || item.oldValue || "(ריק)"}
                              </span>
                              <span>" ל"</span>
                              <span className="font-medium text-[#4f95ff]">
                                {item.newLabel || item.newValue || "(ריק)"}
                              </span>
                              <span>"</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {getCombinedActivity(ticket).length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    אין פעילות עדיין. התחל את השיחה.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Input */}
        <div className="p-4 border-t bg-[#f4f8f8]">
          <div className="flex gap-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="כתוב תגובה..."
              className="resize-none min-h-[44px] max-h-32 bg-white text-right"
            />
            <Button
              size="icon"
              className="h-auto w-12 bg-[#4f95ff] hover:bg-blue-600"
              onClick={handleSendComment}
              disabled={submitting || !comment.trim()}
            >
              <Send className="w-4 h-4 text-white" />
            </Button>
          </div>
        </div>
      </SheetContent>

      {/* Client Selection Dialog */}
      <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>בחירת לקוח</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="חיפוש לקוח..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="pr-9 text-right"
              />
            </div>
            <div className="max-h-[300px] overflow-y-auto space-y-1">
              {/* Option to remove client */}
              <button
                onClick={() => handleClientChange(null)}
                className="w-full p-3 text-right rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-3 text-slate-500"
              >
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </div>
                <span className="text-sm">ללא לקוח</span>
              </button>

              {filteredClients.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-sm">
                  לא נמצאו לקוחות
                </div>
              ) : (
                filteredClients.slice(0, 20).map((client) => (
                  <button
                    key={client.id}
                    onClick={() => handleClientChange(client.id)}
                    className={cn(
                      "w-full p-3 text-right rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-3",
                      ticket.clientId === client.id &&
                        "bg-blue-50 hover:bg-blue-100"
                    )}
                  >
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#4f95ff] to-[#4f95ff]/70 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                      {client.name?.charAt(0) || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#000000] truncate">
                        {client.name}
                      </div>
                      {(client.email || client.businessName) && (
                        <div className="text-xs text-slate-400 truncate">
                          {client.businessName || client.email}
                        </div>
                      )}
                    </div>
                    {ticket.clientId === client.id && (
                      <Check className="w-4 h-4 text-[#4f95ff]" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
