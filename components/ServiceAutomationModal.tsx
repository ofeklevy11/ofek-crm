"use client";

import { useState } from "react";
import {
  createAutomationRule,
  updateAutomationRule,
} from "@/app/actions/automations";
import { X, Loader2, Bell, MessageCircle, Mail } from "lucide-react";
import { showAlert } from "@/hooks/use-modal";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getActionsPerAutomationLimit } from "@/lib/plan-limits";

// Retrying Modal update - Step 1: Update State Initialization
interface ServiceAutomationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: any[];
  initialData?: any;
  userPlan?: string;
}

export default function ServiceAutomationModal({
  open,
  onOpenChange,
  users,
  initialData,
  userPlan = "basic",
}: ServiceAutomationModalProps) {
  const [loading, setLoading] = useState(false);
  const [triggerType, setTriggerType] = useState<
    "TICKET_STATUS_CHANGE" | "SLA_BREACH"
  >("TICKET_STATUS_CHANGE");

  // Status Change Config
  const [fromStatus, setFromStatus] = useState("any");
  const [toStatus, setToStatus] = useState("any");

  // SLA Breach Config
  const [slaPriority, setSlaPriority] = useState("any");
  const [slaBreachType, setSlaBreachType] = useState<
    "any" | "RESPONSE" | "RESOLVE"
  >("any");

  // Action Config
  const [actionType, setActionType] =
    useState<"SEND_NOTIFICATION">("SEND_NOTIFICATION");
  const [recipientId, setRecipientId] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [name, setName] = useState("");

  // Initialize from initialData when it changes or when modal opens
  // Since we can't use useEffect easily with conditional render returns, we do it in render or simplified effect
  // But standard way is useEffect on open/initialData

  const [initialized, setInitialized] = useState(false);

  if (open && initialData && !initialized) {
    // One-time init when opening with data
    setTriggerType(initialData.triggerType);

    const tc = initialData.triggerConfig || {};
    setFromStatus(tc.fromStatus || "any");
    setToStatus(tc.toStatus || "any");
    setSlaPriority(tc.priority || "any");
    setSlaBreachType(tc.breachType || "any");

    setActionType(initialData.actionType || "SEND_NOTIFICATION");

    const ac = initialData.actionConfig || {};
    setRecipientId(ac.recipientId ? String(ac.recipientId) : "");
    setMessageTemplate(ac.messageTemplate || "");

    setName(initialData.name || "");
    setInitialized(true);
  } else if (open && !initialData && !initialized) {
    // Reset for new creation
    setTriggerType("TICKET_STATUS_CHANGE");
    setFromStatus("any");
    setToStatus("any");
    setSlaPriority("any");
    setSlaBreachType("any");
    setActionType("SEND_NOTIFICATION");
    setRecipientId("");
    setMessageTemplate("הקריאה {ticketTitle} עברה לסטטוס {toStatus}");
    setName("");
    setInitialized(true);
  }

  // Reset initialized when closing
  if (!open && initialized) {
    setInitialized(false);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate recipient is selected before proceeding
    if (actionType === "SEND_NOTIFICATION" && !recipientId) {
      showAlert("יש לבחור נמען להתראה");
      return;
    }

    setLoading(true);

    try {
      let triggerConfig: any = {};
      if (triggerType === "TICKET_STATUS_CHANGE") {
        triggerConfig = {
          fromStatus: fromStatus === "any" ? undefined : fromStatus,
          toStatus: toStatus === "any" ? undefined : toStatus,
        };
      } else if (triggerType === "SLA_BREACH") {
        triggerConfig = {
          priority: slaPriority === "any" ? undefined : slaPriority,
          breachType: slaBreachType === "any" ? undefined : slaBreachType,
        };
      }

      const commonData = {
        name:
          name ||
          (triggerType === "TICKET_STATUS_CHANGE"
            ? "אוטומציית סטטוס"
            : "אוטומציית SLA"),
        triggerType,
        triggerConfig,
        actionType,
        actionConfig: {
          recipientId: parseInt(recipientId),
          messageTemplate,
          titleTemplate:
            triggerType === "SLA_BREACH" ? "חריגת SLA" : "עדכון קריאה",
        },
      };

      if (initialData?.id) {
        await updateAutomationRule(initialData.id, commonData);
      } else {
        await createAutomationRule(commonData);
      }

      toast.success("האוטומציה נשמרה בהצלחה");
      onOpenChange(false);
      // Reset form handled by initialization logic
      if (!initialData) {
        setName("");
        setFromStatus("any");
        setToStatus("any");
        setRecipientId("");
      }
    } catch (error) {
      console.error(error);
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold text-[#000000]">
            {initialData ? "עריכת אוטומציה" : "יצירת אוטומציה חדשה"}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-2">
            <Label>שם האוטומציה</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="למשל: עדכון מנהל בסגירת קריאה"
              className="text-right"
            />
          </div>

          <div className="space-y-2">
            <Label>מתי זה קורה? (טריגר)</Label>
            <Select
              value={triggerType}
              onValueChange={(val: any) => setTriggerType(val)}
            >
              <SelectTrigger className="text-right">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TICKET_STATUS_CHANGE">
                  כשיש שינוי סטטוס בקריאה
                </SelectItem>
                <SelectItem value="SLA_BREACH">
                  כשזמן ה-SLA עובר (חריגה)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {triggerType === "TICKET_STATUS_CHANGE" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>מסטטוס</Label>
                <Select value={fromStatus} onValueChange={setFromStatus}>
                  <SelectTrigger className="text-right">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">כל סטטוס</SelectItem>
                    <SelectItem value="OPEN">פתוח</SelectItem>
                    <SelectItem value="IN_PROGRESS">בטיפול</SelectItem>
                    <SelectItem value="WAITING">ממתין</SelectItem>
                    <SelectItem value="RESOLVED">טופל</SelectItem>
                    <SelectItem value="CLOSED">סגור</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>לסטטוס</Label>
                <Select value={toStatus} onValueChange={setToStatus}>
                  <SelectTrigger className="text-right">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">כל סטטוס</SelectItem>
                    <SelectItem value="OPEN">פתוח</SelectItem>
                    <SelectItem value="IN_PROGRESS">בטיפול</SelectItem>
                    <SelectItem value="WAITING">ממתין</SelectItem>
                    <SelectItem value="RESOLVED">טופל</SelectItem>
                    <SelectItem value="CLOSED">סגור</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {triggerType === "SLA_BREACH" && (
            <div className="space-y-4">
              {/* Breach Type Selection */}
              <div className="space-y-2">
                <Label>סוג חריגת SLA</Label>
                <Select
                  value={slaBreachType}
                  onValueChange={(val: any) => setSlaBreachType(val)}
                >
                  <SelectTrigger className="text-right">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">כל סוג חריגה</SelectItem>
                    <SelectItem value="RESPONSE">חריגת זמן תגובה</SelectItem>
                    <SelectItem value="RESOLVE">חריגת זמן פתרון</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded mt-1">
                  {slaBreachType === "RESPONSE" && (
                    <span>
                      ⏱️ <strong>זמן תגובה:</strong> כשהקריאה נשארת בסטטוס
                      "פתוח" מעבר לזמן התגובה שהוגדר
                    </span>
                  )}
                  {slaBreachType === "RESOLVE" && (
                    <span>
                      ⏱️ <strong>זמן פתרון:</strong> כשהקריאה לא טופלה (לא הגיעה
                      ל"טופל"/"סגור") מעבר לזמן הפתרון שהוגדר
                    </span>
                  )}
                  {slaBreachType === "any" && (
                    <span>יופעל על כל סוג חריגה (תגובה או פתרון)</span>
                  )}
                </div>
              </div>

              {/* Priority Selection */}
              <div className="space-y-2">
                <Label>עבור איזה עדיפות?</Label>
                <Select value={slaPriority} onValueChange={setSlaPriority}>
                  <SelectTrigger className="text-right">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">כל עדיפות</SelectItem>
                    <SelectItem value="CRITICAL">קריטי</SelectItem>
                    <SelectItem value="HIGH">גבוה</SelectItem>
                    <SelectItem value="MEDIUM">בינוני</SelectItem>
                    <SelectItem value="LOW">נמוך</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-4 border-t pt-4">
            <Label className="text-base font-bold">מה לעשות? (פעולה)</Label>

            <div className="grid grid-cols-3 gap-2">
              <div
                className={`border rounded-lg p-3 cursor-pointer flex flex-col items-center gap-2 hover:bg-slate-50 transition-colors ${
                  actionType === "SEND_NOTIFICATION"
                    ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                    : ""
                }`}
                onClick={() => setActionType("SEND_NOTIFICATION")}
              >
                <Bell className="w-5 h-5 text-blue-500" />
                <span className="text-xs font-medium">התראה במערכת</span>
              </div>
              <div className="border rounded-lg p-3 cursor-not-allowed opacity-60 flex flex-col items-center gap-2 relative overflow-hidden">
                <MessageCircle className="w-5 h-5 text-green-500" />
                <span className="text-xs font-medium">וואטספ</span>
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
                  <span className="text-[10px] bg-slate-800 text-white px-1.5 py-0.5 rounded">
                    בקרוב
                  </span>
                </div>
              </div>
              <div className="border rounded-lg p-3 cursor-not-allowed opacity-60 flex flex-col items-center gap-2 relative overflow-hidden">
                <Mail className="w-5 h-5 text-purple-500" />
                <span className="text-xs font-medium">אימייל</span>
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
                  <span className="text-[10px] bg-slate-800 text-white px-1.5 py-0.5 rounded">
                    בקרוב
                  </span>
                </div>
              </div>
            </div>

            {actionType === "SEND_NOTIFICATION" && (
              <div className="space-y-4 bg-slate-50 p-4 rounded-lg">
                <div className="space-y-2">
                  <Label>למי לשלוח?</Label>
                  <Select value={recipientId} onValueChange={setRecipientId}>
                    <SelectTrigger className="text-right bg-white">
                      <SelectValue placeholder="בחר משתמש" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id.toString()}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>הודעה</Label>
                  <Textarea
                    value={messageTemplate}
                    onChange={(e) => setMessageTemplate(e.target.value)}
                    className="text-right bg-white"
                    rows={3}
                  />
                  <p className="text-xs text-slate-500">
                    משתנים זמינים: {`{ticketTitle}, {fromStatus}, {toStatus}`}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="submit"
              disabled={loading}
              className="bg-[#4f95ff] hover:bg-blue-600 text-white"
            >
              {loading && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              {initialData ? "שמור שינויים" : "צור אוטומציה"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              ביטול
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
