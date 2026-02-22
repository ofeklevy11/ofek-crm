"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import MeetingAutomationWizard from "./MeetingAutomationWizard";
import { toast } from "sonner";
import { Plus, Trash2, Bell, Clock, MessageSquare, Webhook, CheckSquare, Timer, Pencil, Edit2, AlertCircle } from "lucide-react";

interface AutomationRule {
  id: number;
  name: string;
  triggerType: string;
  triggerConfig: any;
  actionType: string;
  actionConfig: any;
  meetingTypeId?: number | null;
}

interface GlobalMeetingAutomationsModalProps {
  open: boolean;
  onClose: () => void;
  meetingTypes: { id: number; name: string }[];
  userPlan: string;
}

const PLAN_LABELS: Record<string, string> = {
  basic: "בייסיק",
  premium: "פרימיום",
  super: "סופר",
};

const TRIGGER_LABELS: Record<string, string> = {
  MEETING_BOOKED: "כשנקבעת פגישה",
  MEETING_CANCELLED: "כשפגישה מבוטלת",
  MEETING_REMINDER: "תזכורת לפני פגישה",
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
  SEND_NOTIFICATION: <Bell className="h-3.5 w-3.5" />,
  SEND_WHATSAPP: <MessageSquare className="h-3.5 w-3.5" />,
  CREATE_TASK: <CheckSquare className="h-3.5 w-3.5" />,
  WEBHOOK: <Webhook className="h-3.5 w-3.5" />,
  CALCULATE_DURATION: <Timer className="h-3.5 w-3.5" />,
  UPDATE_RECORD_FIELD: <Pencil className="h-3.5 w-3.5" />,
};

const ACTION_LABELS: Record<string, string> = {
  SEND_NOTIFICATION: "התראה",
  SEND_WHATSAPP: "וואטסאפ",
  CREATE_TASK: "משימה",
  WEBHOOK: "Webhook",
  CALCULATE_DURATION: "חישוב זמן",
  UPDATE_RECORD_FIELD: "עדכון שדה",
};

export default function GlobalMeetingAutomationsModal({
  open,
  onClose,
  meetingTypes,
  userPlan,
}: GlobalMeetingAutomationsModalProps) {
  const [automations, setAutomations] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | undefined>(undefined);
  const [usage, setUsage] = useState<{ globalCount: number; perMeetingCount: number; total: number; limit: number } | null>(null);

  const fetchAutomations = async () => {
    setLoading(true);
    try {
      const { getGlobalMeetingAutomations, getMeetingAutomationUsage } = await import("@/app/actions/meeting-automations");
      const [result, usageResult] = await Promise.all([
        getGlobalMeetingAutomations(),
        getMeetingAutomationUsage(),
      ]);
      if (result.success && result.data) {
        setAutomations(result.data as AutomationRule[]);
      }
      if (usageResult.success && usageResult.data) {
        setUsage(usageResult.data);
      }
    } catch {
      toast.error("שגיאה בטעינת אוטומציות");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchAutomations();
  }, [open]);

  const isAtLimit = usage ? userPlan !== "super" && usage.globalCount >= usage.limit : false;

  const handleSave = async (data: any) => {
    if (data.id) {
      const { updateGlobalMeetingAutomation } = await import("@/app/actions/meeting-automations");
      const result = await updateGlobalMeetingAutomation(data);
      if (result.success) {
        toast.success("אוטומציה עודכנה");
        setShowWizard(false);
        setEditingRule(undefined);
        fetchAutomations();
      } else {
        toast.error(result.error || "שגיאה");
      }
      return result;
    } else {
      const { createGlobalMeetingAutomation } = await import("@/app/actions/meeting-automations");
      const result = await createGlobalMeetingAutomation(data);
      if (result.success) {
        toast.success("אוטומציה נוצרה");
        setShowWizard(false);
        setEditingRule(undefined);
        fetchAutomations();
      } else {
        toast.error(result.error || "שגיאה");
      }
      return result;
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("למחוק אוטומציה זו?")) return;
    const { deleteGlobalMeetingAutomation } = await import("@/app/actions/meeting-automations");
    const result = await deleteGlobalMeetingAutomation(id);
    if (result.success) {
      toast.success("אוטומציה נמחקה");
      setAutomations(prev => prev.filter(a => a.id !== id));
    } else {
      toast.error(result.error || "שגיאה");
    }
  };

  const handleEdit = (rule: AutomationRule) => {
    setEditingRule(rule);
    setShowWizard(true);
  };

  return (
    <>
      <Dialog open={open && !showWizard} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>אוטומציות קבועות לפגישות</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            אוטומציות אלו יופעלו עבור כל הפגישות (או לפי סוג פגישה).
          </p>

          {/* Plan Usage Disclaimer */}
          {usage && (
            <div
              className={`p-4 rounded-xl border ${
                isAtLimit
                  ? "bg-red-50 border-red-200"
                  : userPlan === "super"
                    ? "bg-green-50 border-green-200"
                    : "bg-blue-50 border-blue-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`p-2 rounded-lg ${
                    isAtLimit
                      ? "bg-red-100 text-red-600"
                      : userPlan === "super"
                        ? "bg-green-100 text-green-600"
                        : "bg-blue-100 text-blue-600"
                  }`}
                >
                  <AlertCircle size={20} />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">
                    תוכנית: {PLAN_LABELS[userPlan] || userPlan}
                  </div>
                  {userPlan === "super" ? (
                    <p className="text-sm text-green-700 mt-1">
                      ללא הגבלה על מספר אוטומציות הפגישות.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-600 mt-1">
                        {isAtLimit
                          ? `הגעת למגבלת האוטומציות הקבועות (${usage.limit}). שדרג את התוכנית להוספת אוטומציות נוספות.`
                          : `${usage.globalCount} מתוך ${usage.limit} אוטומציות קבועות בשימוש. נשארו ${usage.limit - usage.globalCount}.`}
                      </p>
                      <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${isAtLimit ? "bg-red-500" : "bg-blue-500"}`}
                          style={{ width: `${Math.min(100, (usage.globalCount / usage.limit) * 100)}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Existing automations */}
          <div className="space-y-2 mt-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">טוען...</p>
            ) : automations.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין אוטומציות קבועות</p>
            ) : (
              automations.map(auto => (
                <div
                  key={auto.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-background"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0">
                      {ACTION_ICONS[auto.actionType] || <Bell className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{auto.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-xs">
                          {TRIGGER_LABELS[auto.triggerType] || auto.triggerType}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {ACTION_LABELS[auto.actionType] || auto.actionType}
                        </Badge>
                        {auto.triggerType === "MEETING_REMINDER" && auto.triggerConfig?.minutesBefore && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {auto.triggerConfig.minutesBefore} דקות
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(auto)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(auto.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add new */}
          <Button
            variant="outline"
            onClick={() => { setEditingRule(undefined); setShowWizard(true); }}
            className="mt-2"
            disabled={isAtLimit}
          >
            <Plus className="h-4 w-4 ml-1" />
            הוסף אוטומציה
          </Button>
        </DialogContent>
      </Dialog>

      {showWizard && (
        <MeetingAutomationWizard
          mode="global"
          meetingTypes={meetingTypes}
          onSave={handleSave}
          onClose={() => { setShowWizard(false); setEditingRule(undefined); }}
          editingRule={editingRule}
          userPlan={userPlan}
        />
      )}
    </>
  );
}
