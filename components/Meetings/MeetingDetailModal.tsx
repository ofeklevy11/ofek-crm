"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import MeetingStatusBadge from "./MeetingStatusBadge";
import { toast } from "sonner";
import {
  User,
  Mail,
  Phone,
  Calendar,
  Clock,
  Tag,
  FileText,
  Link as LinkIcon,
  X,
  Zap,
  Plus,
  Trash2,
  Bell,
  MessageSquare,
  Webhook,
  CheckSquare,
  Timer,
  Pencil,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import MeetingAutomationWizard from "./MeetingAutomationWizard";

interface MeetingDetail {
  id: string;
  participantName: string;
  participantEmail?: string | null;
  participantPhone?: string | null;
  customFieldData?: any;
  startTime: string | Date;
  endTime: string | Date;
  timezone: string;
  status: string;
  notesBefore?: string | null;
  notesAfter?: string | null;
  tags: string[];
  manageToken: string;
  cancelledAt?: string | Date | null;
  cancelledBy?: string | null;
  cancelReason?: string | null;
  meetingType: {
    id: number;
    name: string;
    color?: string | null;
    duration: number;
  };
  client?: { id: number; name: string; email?: string | null; phone?: string | null } | null;
  calendarEvent?: { id: string; title: string } | null;
}

interface MeetingDetailModalProps {
  open: boolean;
  onClose: () => void;
  meeting: MeetingDetail | null;
  onUpdateStatus: (id: string, status: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateNotes: (id: string, notesBefore?: string, notesAfter?: string) => Promise<{ success: boolean; error?: string }>;
  onCancel: (id: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateTags: (id: string, tags: string[]) => Promise<{ success: boolean; error?: string }>;
  userPlan: string;
}

const PLAN_LABELS: Record<string, string> = {
  basic: "בייסיק",
  premium: "פרימיום",
  super: "סופר",
};

export default function MeetingDetailModal({
  open,
  onClose,
  meeting,
  onUpdateStatus,
  onUpdateNotes,
  onCancel,
  onUpdateTags,
  userPlan,
}: MeetingDetailModalProps) {
  const [notesBefore, setNotesBefore] = useState("");
  const [notesAfter, setNotesAfter] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [newTag, setNewTag] = useState("");
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Per-meeting automations
  const [perMeetingAutomations, setPerMeetingAutomations] = useState<any[]>([]);
  const [loadingAutomations, setLoadingAutomations] = useState(false);
  const [showAutomationWizard, setShowAutomationWizard] = useState(false);
  const [deletingAutoId, setDeletingAutoId] = useState<number | null>(null);
  const [usage, setUsage] = useState<{ globalCount: number; perMeetingCount: number; total: number; limit: number } | null>(null);

  const isAtLimit = usage ? userPlan !== "super" && usage.total >= usage.limit : false;

  const fetchPerMeetingAutomations = async (meetingId: string) => {
    setLoadingAutomations(true);
    try {
      const { getPerMeetingAutomations, getMeetingAutomationUsage } = await import("@/app/actions/meeting-automations");
      const [result, usageResult] = await Promise.all([
        getPerMeetingAutomations(meetingId),
        getMeetingAutomationUsage(meetingId),
      ]);
      if (result.success && result.data) {
        setPerMeetingAutomations(result.data);
      }
      if (usageResult.success && usageResult.data) {
        setUsage(usageResult.data);
      }
    } catch { /* ignore */ }
    setLoadingAutomations(false);
  };

  const confirmDeleteAutomation = async (id: number) => {
    const { deletePerMeetingAutomation } = await import("@/app/actions/meeting-automations");
    const result = await deletePerMeetingAutomation(id);
    if (result.success) {
      setPerMeetingAutomations(prev => prev.filter(a => a.id !== id));
      toast.success("אוטומציה נמחקה");
    } else {
      toast.error(result.error || "שגיאה");
    }
    setDeletingAutoId(null);
  };

  const handleSavePerMeetingAutomation = async (data: any) => {
    const { createPerMeetingAutomation } = await import("@/app/actions/meeting-automations");
    const result = await createPerMeetingAutomation(data);
    if (result.success && meeting) {
      toast.success("אוטומציה נוצרה");
      setShowAutomationWizard(false);
      fetchPerMeetingAutomations(meeting.id);
    } else {
      toast.error(result.error || "שגיאה");
    }
    return result;
  };

  // Fetch automations when modal opens with a meeting
  useEffect(() => {
    if (meeting && meeting.status !== "CANCELLED" && meeting.status !== "COMPLETED") {
      fetchPerMeetingAutomations(meeting.id);
    }
  }, [meeting?.id, meeting?.status]);

  if (!meeting) return null;

  const start = new Date(meeting.startTime);
  const end = new Date(meeting.endTime);
  const dateStr = start.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeStr = `${start.toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" })}`;

  const manageUrl = typeof window !== "undefined"
    ? `${window.location.origin}/p/meetings/manage/${meeting.manageToken}`
    : "";

  const handleStatusChange = async (status: string) => {
    setSaving(true);
    const result = await onUpdateStatus(meeting.id, status);
    setSaving(false);
    if (result.success) toast.success("סטטוס עודכן");
    else toast.error(result.error || "שגיאה בעדכון סטטוס");
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    const result = await onUpdateNotes(
      meeting.id,
      notesBefore || meeting.notesBefore || "",
      notesAfter || meeting.notesAfter || "",
    );
    setSaving(false);
    if (result.success) toast.success("הערות נשמרו");
    else toast.error(result.error || "שגיאה בשמירת הערות");
  };

  const handleCancel = async () => {
    setSaving(true);
    const result = await onCancel(meeting.id, cancelReason);
    setSaving(false);
    if (result.success) {
      toast.success("הפגישה בוטלה");
      setShowCancelForm(false);
      onClose();
    } else {
      toast.error(result.error || "שגיאה בביטול");
    }
  };

  const handleAddTag = async () => {
    if (!newTag.trim()) return;
    const tags = [...meeting.tags, newTag.trim()];
    setSaving(true);
    const result = await onUpdateTags(meeting.id, tags);
    setSaving(false);
    if (result.success) {
      setNewTag("");
      toast.success("תגית נוספה");
    } else {
      toast.error(result.error || "שגיאה");
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const tags = meeting.tags.filter(t => t !== tagToRemove);
    const result = await onUpdateTags(meeting.id, tags);
    if (result.success) toast.success("תגית הוסרה");
    else toast.error(result.error || "שגיאה");
  };

  const copyManageLink = () => {
    navigator.clipboard.writeText(manageUrl);
    toast.success("קישור ניהול הועתק");
  };

  return (
    <>
    <Dialog open={open && !showAutomationWizard} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0" dir="rtl">
        {/* Color accent bar */}
        <div className="h-1 w-full" style={{ backgroundColor: meeting.meetingType.color || "#3B82F6" }} />

        <div className="px-6 pt-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: meeting.meetingType.color || "#3B82F6" }}
              />
              <span>{meeting.meetingType.name}</span>
              <MeetingStatusBadge status={meeting.status} />
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="space-y-6 px-6 pb-6">
          {/* Participant Info */}
          <div className="bg-[#F8FAFC] rounded-xl p-4 space-y-2 mtg-slide-up" style={{ animationDelay: "0ms" }}>
            <h3 className="font-semibold text-sm text-gray-900 mb-2">פרטי משתתף</h3>
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>{meeting.participantName}</span>
            </div>
            {meeting.participantEmail && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span dir="ltr">{meeting.participantEmail}</span>
              </div>
            )}
            {meeting.participantPhone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span dir="ltr">{meeting.participantPhone}</span>
              </div>
            )}
            {meeting.client && (
              <div className="text-sm text-blue-600 mt-1">
                לקוח מקושר: {meeting.client.name}
              </div>
            )}
          </div>

          {/* Date/Time */}
          <div className="flex items-center gap-4 text-sm mtg-slide-up" style={{ animationDelay: "80ms" }}>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{dateStr}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span dir="ltr">{timeStr}</span>
            </div>
          </div>

          {/* Status Control */}
          {meeting.status !== "CANCELLED" && (
            <div className="flex items-center gap-3 mtg-slide-up" style={{ animationDelay: "160ms" }}>
              <span className="text-sm font-medium">שנה סטטוס:</span>
              <Select value={meeting.status} onValueChange={handleStatusChange} disabled={saving}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">ממתין</SelectItem>
                  <SelectItem value="CONFIRMED">מאושר</SelectItem>
                  <SelectItem value="COMPLETED">הושלם</SelectItem>
                  <SelectItem value="NO_SHOW">לא הגיע</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Notes */}
          <div className="bg-[#F8FAFC] rounded-xl p-4 mtg-slide-up" style={{ animationDelay: "240ms" }}>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-gray-900">הערות</h3>
              <div>
                <label className="text-xs text-muted-foreground">הערות לפני הפגישה</label>
                <Textarea
                  defaultValue={meeting.notesBefore || ""}
                  onChange={e => setNotesBefore(e.target.value)}
                  placeholder="הערות לפני הפגישה..."
                  className="mt-1"
                  rows={2}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">הערות אחרי הפגישה</label>
                <Textarea
                  defaultValue={meeting.notesAfter || ""}
                  onChange={e => setNotesAfter(e.target.value)}
                  placeholder="הערות אחרי הפגישה..."
                  className="mt-1"
                  rows={2}
                />
              </div>
              <Button size="sm" onClick={handleSaveNotes} disabled={saving}>
                <FileText className="h-4 w-4 ml-1" />
                שמור הערות
              </Button>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2 mtg-slide-up" style={{ animationDelay: "320ms" }}>
            <h3 className="font-semibold text-sm text-gray-900 flex items-center gap-1">
              <Tag className="h-4 w-4" /> תגיות
            </h3>
            <div className="flex flex-wrap gap-1">
              {meeting.tags.map(tag => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button onClick={() => handleRemoveTag(tag)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                placeholder="תגית חדשה..."
                className="flex-1"
                onKeyDown={e => e.key === "Enter" && handleAddTag()}
              />
              <Button size="sm" variant="outline" onClick={handleAddTag} disabled={saving}>
                הוסף
              </Button>
            </div>
          </div>

          {/* Per-meeting Automations */}
          {meeting.status !== "CANCELLED" && meeting.status !== "COMPLETED" && (
            <div className="space-y-3 mtg-slide-up" style={{ animationDelay: "380ms" }}>
              <h3 className="font-semibold text-sm text-gray-900 flex items-center gap-1">
                <Zap className="h-4 w-4 text-yellow-500" /> אוטומציות לפגישה זו
              </h3>

              {/* Plan usage disclaimer */}
              {usage && userPlan !== "super" && (
                <div className={`p-3 rounded-lg border text-sm ${isAtLimit ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200"}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">תוכנית {PLAN_LABELS[userPlan] || userPlan}:</span>
                    <span className={isAtLimit ? "text-red-600" : "text-gray-600"}>
                      {usage.total} / {usage.limit} אוטומציות
                    </span>
                  </div>
                  {isAtLimit && (
                    <p className="text-xs text-red-600 mt-1">
                      הגעת למגבלה. שדרג את התוכנית להוספת אוטומציות נוספות.
                    </p>
                  )}
                </div>
              )}

              {loadingAutomations ? (
                <p className="text-xs text-muted-foreground">טוען...</p>
              ) : perMeetingAutomations.length === 0 ? (
                <p className="text-xs text-muted-foreground">אין אוטומציות לפגישה זו</p>
              ) : (
                <div className="space-y-1.5">
                  {perMeetingAutomations.map((auto: any) => (
                    <div
                      key={auto.id}
                      className="flex items-center justify-between p-2 border rounded-md bg-background text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="shrink-0 text-muted-foreground">
                          {auto.actionType === "SEND_NOTIFICATION" && <Bell className="h-3.5 w-3.5" />}
                          {auto.actionType === "SEND_WHATSAPP" && <MessageSquare className="h-3.5 w-3.5" />}
                          {auto.actionType === "WEBHOOK" && <Webhook className="h-3.5 w-3.5" />}
                          {auto.actionType === "CREATE_TASK" && <CheckSquare className="h-3.5 w-3.5" />}
                          {auto.actionType === "CALCULATE_DURATION" && <Timer className="h-3.5 w-3.5" />}
                          {auto.actionType === "UPDATE_RECORD_FIELD" && <Pencil className="h-3.5 w-3.5" />}
                        </div>
                        <span className="truncate">{auto.name}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {auto.triggerType === "MEETING_REMINDER" ? "תזכורת" : "ביטול"}
                        </Badge>
                      </div>
                      <AlertDialog open={deletingAutoId === auto.id} onOpenChange={(open) => !open && setDeletingAutoId(null)}>
                        <AlertDialogTrigger asChild>
                          <button
                            onClick={() => setDeletingAutoId(auto.id)}
                            className="text-destructive hover:text-destructive/80 p-1 shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent dir="rtl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>מחיקת אוטומציה</AlertDialogTitle>
                            <AlertDialogDescription>האם למחוק את האוטומציה &quot;{auto.name}&quot;?</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>ביטול</AlertDialogCancel>
                            <AlertDialogAction onClick={() => confirmDeleteAutomation(auto.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              מחק
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAutomationWizard(true)}
                className="text-xs"
                disabled={isAtLimit}
              >
                <Plus className="h-3.5 w-3.5 ml-1" />
                הוסף אוטומציה
              </Button>
            </div>
          )}

          {/* Manage Link */}
          <div className="flex items-center gap-2 mtg-slide-up" style={{ animationDelay: "400ms" }}>
            <Button size="sm" variant="outline" onClick={copyManageLink}>
              <LinkIcon className="h-4 w-4 ml-1" />
              העתק קישור ניהול למשתתף
            </Button>
          </div>

          {/* Cancel section */}
          {meeting.status !== "CANCELLED" && meeting.status !== "COMPLETED" && (
            <div className="border-t rounded-xl pt-4">
              {!showCancelForm ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowCancelForm(true)}
                >
                  בטל פגישה
                </Button>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                    placeholder="סיבת ביטול (אופציונלי)..."
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleCancel} disabled={saving} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                      אשר ביטול
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowCancelForm(false)}>
                      חזור
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cancellation info */}
          {meeting.status === "CANCELLED" && (
            <div className="bg-red-50 rounded-xl p-3 text-sm text-red-800">
              <p>בוטל {meeting.cancelledBy === "participant" ? "על ידי המשתתף" : "על ידי בעל העסק"}</p>
              {meeting.cancelReason && <p className="mt-1">סיבה: {meeting.cancelReason}</p>}
              {meeting.cancelledAt && (
                <p className="mt-1 text-xs text-red-600">
                  {new Date(meeting.cancelledAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {showAutomationWizard && (
      <MeetingAutomationWizard
        mode="per-meeting"
        meetingId={meeting.id}
        onSave={handleSavePerMeetingAutomation}
        onClose={() => setShowAutomationWizard(false)}
        userPlan={userPlan}
      />
    )}
    </>
  );
}
