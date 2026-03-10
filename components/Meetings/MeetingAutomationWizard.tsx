"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  MessageSquare,
  Timer,
  CheckSquare,
  Pencil,
  Webhook,
  Clock,
  Phone,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  X,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AutomationRule {
  id: number;
  name: string;
  triggerType: string;
  triggerConfig: any;
  actionType: string;
  actionConfig: any;
  meetingTypeId?: number | null;
}

interface MeetingAutomationWizardProps {
  mode: "global" | "per-meeting";
  meetingId?: string;
  meetingTypes?: { id: number; name: string }[];
  onSave: (data: any) => Promise<{ success: boolean; error?: string }>;
  onClose: () => void;
  editingRule?: AutomationRule;
  userPlan?: string;
}

const PLAN_LABELS: Record<string, string> = {
  basic: "בייסיק",
  premium: "פרימיום",
  super: "סופר",
};

const TRIGGER_OPTIONS_GLOBAL = [
  {
    value: "MEETING_BOOKED",
    title: "כשנקבעת פגישה",
    description: "הפעל אוטומציה ברגע שנקבעת פגישה חדשה",
    icon: <Sparkles className="text-green-500" size={24} />,
  },
  {
    value: "MEETING_CANCELLED",
    title: "כשפגישה מבוטלת",
    description: "הפעל אוטומציה כאשר פגישה מבוטלת",
    icon: <X className="text-red-500" size={24} />,
  },
  {
    value: "MEETING_REMINDER",
    title: "תזכורת לפני פגישה",
    description: "שלח תזכורת מספר דקות לפני תחילת הפגישה",
    icon: <Clock className="text-orange-500" size={24} />,
  },
];

const TRIGGER_OPTIONS_PER_MEETING = [
  {
    value: "MEETING_CANCELLED",
    title: "כשהפגישה מבוטלת",
    description: "הפעל אוטומציה כאשר פגישה זו מבוטלת",
    icon: <X className="text-red-500" size={24} />,
  },
  {
    value: "MEETING_REMINDER",
    title: "תזכורת לפני הפגישה",
    description: "שלח תזכורת מספר דקות לפני הפגישה",
    icon: <Clock className="text-orange-500" size={24} />,
  },
];

const ACTION_OPTIONS = [
  {
    value: "SEND_NOTIFICATION",
    title: "שליחת התראה",
    description: "שלח הודעת התראה למערכת",
    icon: <Bell className="text-yellow-500" size={24} />,
    color: "yellow",
  },
  {
    value: "SEND_WHATSAPP",
    title: "שליחת WhatsApp",
    description: "שלח הודעת וואטסאפ למשתתף",
    icon: <MessageSquare className="text-green-600" size={24} />,
    color: "green",
  },
  {
    value: "SEND_SMS",
    title: "שליחת SMS",
    description: "שלח הודעת SMS למשתתף",
    icon: <Phone className="text-blue-600" size={24} />,
    color: "blue",
  },
  {
    value: "CALCULATE_DURATION",
    title: "חישוב זמן",
    description: "חשב משך זמן בין אירועים",
    icon: <Timer className="text-teal-500" size={24} />,
    color: "teal",
  },
  {
    value: "WEBHOOK",
    title: "Webhook",
    description: "שלח נתונים לכתובת URL חיצונית",
    icon: <div className="text-sm font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded">Api</div>,
    color: "gray",
  },
  {
    value: "CREATE_TASK",
    title: "יצירת משימה",
    description: "צור משימה חדשה במערכת",
    icon: <CheckSquare className="text-blue-500" size={24} />,
    color: "blue",
  },
  {
    value: "UPDATE_RECORD_FIELD",
    title: "עדכון שדה ברשומה",
    description: "עדכן שדה ספציפי ברשומה קיימת",
    icon: <Pencil className="text-purple-500" size={24} />,
    color: "purple",
  },
];

const TRIGGER_LABELS: Record<string, string> = {
  MEETING_BOOKED: "כשנקבעת פגישה",
  MEETING_CANCELLED: "כשפגישה מבוטלת",
  MEETING_REMINDER: "תזכורת לפני פגישה",
};

const ACTION_LABELS: Record<string, string> = {
  SEND_NOTIFICATION: "התראה",
  SEND_WHATSAPP: "וואטסאפ",
  SEND_SMS: "SMS",
  CALCULATE_DURATION: "חישוב זמן",
  WEBHOOK: "Webhook",
  CREATE_TASK: "משימה",
  UPDATE_RECORD_FIELD: "עדכון שדה",
};

function TriggerCard({
  title,
  description,
  icon,
  selected,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`relative p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 group ${
        selected
          ? "border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-200 ring-offset-2"
          : "border-gray-100 bg-white hover:border-blue-200 hover:bg-gray-50"
      }`}
    >
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-lg ${selected ? "bg-white" : "bg-gray-100 group-hover:bg-white"}`}>
          {icon}
        </div>
        <div>
          <h4 className={`font-bold text-lg mb-1 ${selected ? "text-blue-900" : "text-gray-800"}`}>
            {title}
          </h4>
          <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
        </div>
      </div>
      {selected && (
        <div className="absolute top-4 left-4 text-blue-500">
          <CheckCircle2 size={20} fill="currentColor" className="text-blue-100" />
        </div>
      )}
    </div>
  );
}

export default function MeetingAutomationWizard({
  mode,
  meetingId,
  meetingTypes,
  onSave,
  onClose,
  editingRule,
  userPlan = "basic",
}: MeetingAutomationWizardProps) {
  const totalSteps = 3;
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [usage, setUsage] = useState<{ total: number; limit: number; globalCount: number; perMeetingCount: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { getMeetingAutomationUsage } = await import("@/app/actions/meeting-automations");
        const res = await getMeetingAutomationUsage(mode === "per-meeting" ? meetingId : undefined);
        if (res.success && res.data) setUsage(res.data);
      } catch { /* ignore */ }
    })();
  }, [mode, meetingId]);

  const isAtLimit = usage ? userPlan !== "super" && usage.total >= usage.limit : false;

  // Step 1: Name + Trigger
  const [name, setName] = useState(editingRule?.name || "");
  const [triggerType, setTriggerType] = useState(editingRule?.triggerType || "");
  const [minutesBefore, setMinutesBefore] = useState(
    editingRule?.triggerConfig?.minutesBefore ?? 30
  );
  const [meetingTypeId, setMeetingTypeId] = useState<string>(
    editingRule?.meetingTypeId ? String(editingRule.meetingTypeId) : "all"
  );

  // Step 2: Action
  const [actionType, setActionType] = useState(editingRule?.actionType || "");
  const [notifMessage, setNotifMessage] = useState(editingRule?.actionConfig?.message || "");
  const [webhookUrl, setWebhookUrl] = useState(editingRule?.actionConfig?.url || "");
  const [taskTitle, setTaskTitle] = useState(editingRule?.actionConfig?.title || "");
  const [updateField, setUpdateField] = useState(editingRule?.actionConfig?.field || "");
  const [updateValue, setUpdateValue] = useState(editingRule?.actionConfig?.value || "");

  const triggerOptions = mode === "global" ? TRIGGER_OPTIONS_GLOBAL : TRIGGER_OPTIONS_PER_MEETING;

  const canGoStep2 = triggerType !== "" && (triggerType !== "MEETING_REMINDER" || minutesBefore > 0);
  const canGoStep3 = actionType !== "";

  const buildActionConfig = () => {
    switch (actionType) {
      case "SEND_NOTIFICATION":
        return { message: notifMessage || "תזכורת לפגישה" };
      case "SEND_WHATSAPP":
        return { message: notifMessage || "תזכורת לפגישה" };
      case "SEND_SMS":
        return { message: notifMessage || "תזכורת לפגישה" };
      case "WEBHOOK":
        return { url: webhookUrl };
      case "CREATE_TASK":
        return { title: taskTitle || "מעקב אחרי פגישה" };
      case "UPDATE_RECORD_FIELD":
        return { field: updateField, value: updateValue };
      case "CALCULATE_DURATION":
        return {};
      default:
        return {};
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    const payload: any = {
      triggerType,
      minutesBefore: triggerType === "MEETING_REMINDER" ? minutesBefore : undefined,
      actionType,
      actionConfig: buildActionConfig(),
      name: name || undefined,
    };

    if (mode === "global") {
      payload.meetingTypeId = meetingTypeId !== "all" ? Number(meetingTypeId) : undefined;
      if (editingRule) payload.id = editingRule.id;
    } else {
      payload.meetingId = meetingId;
    }

    const result = await onSave(payload);
    setSaving(false);
    if (result.success) {
      setSuccess(true);
      setTimeout(() => onClose(), 1200);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div>
        <label className="block text-base font-bold text-gray-700 mb-2">
          איך נקרא לאוטומציה הזו?
        </label>
        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="למשל: תזכורת 30 דקות לפני"
          className="w-full px-4 py-3 text-lg border-2 border-gray-200 rounded-xl focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
        />
      </div>

      <div>
        <label className="block text-base font-bold text-gray-700 mb-3">
          מה יפעיל את האוטומציה?
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {triggerOptions.map((t) => (
            <TriggerCard
              key={t.value}
              title={t.title}
              description={t.description}
              icon={t.icon}
              selected={triggerType === t.value}
              onClick={() => setTriggerType(t.value)}
            />
          ))}
        </div>
      </div>

      {triggerType === "MEETING_REMINDER" && (
        <div className="animate-in slide-in-from-top-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">דקות לפני הפגישה</label>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Input
              type="number"
              value={minutesBefore}
              onChange={(e) => setMinutesBefore(Number(e.target.value))}
              min={1}
              max={43200}
              className="w-28"
            />
            <span className="text-sm text-muted-foreground">דקות</span>
          </div>
        </div>
      )}

      {mode === "global" && meetingTypes && meetingTypes.length > 0 && (
        <div className="animate-in slide-in-from-top-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            סוג פגישה (אופציונלי)
          </label>
          <Select value={meetingTypeId} onValueChange={setMeetingTypeId}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל סוגי הפגישות</SelectItem>
              {meetingTypes.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="bg-gray-50 p-4 rounded-lg mb-4 text-sm text-gray-600 flex items-center gap-2">
        <CheckCircle2 size={16} className="text-blue-500 shrink-0" />
        <span>טריגר: <strong>{TRIGGER_LABELS[triggerType]}</strong></span>
        {triggerType === "MEETING_REMINDER" && (
          <span className="mr-2">({minutesBefore} דקות לפני)</span>
        )}
      </div>

      <div>
        <label className="block text-base font-bold text-gray-700 mb-3">
          מה האוטומציה תעשה?
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ACTION_OPTIONS.map((a) => (
            <TriggerCard
              key={a.value}
              title={a.title}
              description={a.description}
              icon={a.icon}
              selected={actionType === a.value}
              onClick={() => setActionType(a.value)}
            />
          ))}
        </div>
      </div>

      {/* Action-specific config */}
      {(actionType === "SEND_NOTIFICATION" || actionType === "SEND_WHATSAPP" || actionType === "SEND_SMS") && (
        <div className={`p-6 rounded-xl border space-y-4 animate-in slide-in-from-top-2 ${
          actionType === "SEND_WHATSAPP"
            ? "bg-green-50 border-green-100"
            : actionType === "SEND_SMS"
              ? "bg-blue-50 border-blue-100"
              : "bg-yellow-50 border-yellow-100"
        }`}>
          <div className={`flex items-center gap-2 mb-2 font-medium pb-2 border-b ${
            actionType === "SEND_WHATSAPP"
              ? "text-green-800 border-green-200"
              : actionType === "SEND_SMS"
                ? "text-blue-800 border-blue-200"
                : "text-yellow-800 border-yellow-200"
          }`}>
            {actionType === "SEND_WHATSAPP" ? <MessageSquare size={18} /> : actionType === "SEND_SMS" ? <Phone size={18} /> : <Bell size={18} />}
            {actionType === "SEND_WHATSAPP" ? "הודעת וואטסאפ" : actionType === "SEND_SMS" ? "הודעת SMS" : "הודעת התראה"}
          </div>
          <Textarea
            value={notifMessage}
            onChange={(e) => setNotifMessage(e.target.value)}
            placeholder="ניתן להשתמש במשתנים: {participantName}, {meetingType}, {meetingStart}"
            rows={3}
          />
          <p className="text-xs text-gray-500">
            משתנים: {"{participantName}"}, {"{participantEmail}"}, {"{participantPhone}"}, {"{meetingType}"}, {"{meetingStart}"}, {"{meetingEnd}"}
          </p>
        </div>
      )}

      {actionType === "WEBHOOK" && (
        <div className="bg-gray-50 p-6 rounded-xl border border-gray-100 space-y-4 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-2 text-gray-800 font-medium pb-2 border-b border-gray-200">
            <Webhook size={18} /> Webhook
          </div>
          <Input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://..."
            dir="ltr"
          />
        </div>
      )}

      {actionType === "CREATE_TASK" && (
        <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 space-y-4 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-2 text-blue-800 font-medium pb-2 border-b border-blue-200">
            <CheckSquare size={18} /> יצירת משימה
          </div>
          <Input
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="מעקב אחרי פגישה עם {participantName}"
          />
        </div>
      )}

      {actionType === "UPDATE_RECORD_FIELD" && (
        <div className="bg-purple-50 p-6 rounded-xl border border-purple-100 space-y-4 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-2 text-purple-800 font-medium pb-2 border-b border-purple-200">
            <Pencil size={18} /> עדכון שדה
          </div>
          <Input
            value={updateField}
            onChange={(e) => setUpdateField(e.target.value)}
            placeholder="שם השדה"
          />
          <Input
            value={updateValue}
            onChange={(e) => setUpdateValue(e.target.value)}
            placeholder="ערך חדש"
          />
        </div>
      )}

      {actionType === "CALCULATE_DURATION" && (
        <div className="bg-teal-50 p-6 rounded-xl border border-teal-100 space-y-4 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-2 text-teal-800 font-medium pb-2 border-b border-teal-200">
            <Timer size={18} /> חישוב זמן
          </div>
          <p className="text-sm text-teal-700">
            חישוב הזמן יתבצע אוטומטית בהתאם לאירוע הטריגר.
          </p>
        </div>
      )}
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      {success ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4 animate-in zoom-in duration-300">
            <CheckCircle2 size={40} className="text-green-600" />
          </div>
          <h3 className="text-2xl font-bold text-green-800 mb-2">
            {editingRule ? "האוטומציה עודכנה!" : "האוטומציה נוצרה!"}
          </h3>
          <p className="text-gray-500">האוטומציה תפעל אוטומטית בהתאם להגדרות.</p>
        </div>
      ) : (
        <>
          <h3 className="text-lg font-bold text-gray-800">סיכום האוטומציה</h3>

          <div className="bg-gray-50 rounded-xl p-6 space-y-4">
            {name && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 w-20">שם:</span>
                <span className="font-medium">{name}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 w-20">טריגר:</span>
              <span className="font-medium">{TRIGGER_LABELS[triggerType]}</span>
              {triggerType === "MEETING_REMINDER" && (
                <span className="text-sm text-gray-500">({minutesBefore} דקות לפני)</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 w-20">פעולה:</span>
              <span className="font-medium">{ACTION_LABELS[actionType]}</span>
            </div>
            {mode === "global" && meetingTypeId !== "all" && meetingTypes && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 w-20">סוג פגישה:</span>
                <span className="font-medium">
                  {meetingTypes.find((t) => String(t.id) === meetingTypeId)?.name}
                </span>
              </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
            לאחר היצירה, האוטומציה תפעל אוטומטית בכל פעם שהטריגר מתקיים.
          </div>
        </>
      )}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gray-50 px-8 py-5 border-b border-gray-100 flex justify-between items-center">
          <div className="flex flex-col">
            <h3 className="text-xl font-bold text-gray-800">
              {editingRule ? "עריכת אוטומציה" : "אשף אוטומציות פגישות"}
            </h3>
            <div className="flex gap-2 mt-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i <= step ? "w-8 bg-blue-600" : "w-2 bg-gray-200"
                  }`}
                />
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 relative scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
          {/* Plan usage disclaimer */}
          {usage && (
            <div className={`mb-6 p-3 rounded-xl border flex items-center gap-3 ${
              isAtLimit
                ? "bg-red-50 border-red-200"
                : userPlan === "super"
                  ? "bg-green-50 border-green-200"
                  : "bg-blue-50 border-blue-200"
            }`}>
              <AlertCircle size={18} className={`shrink-0 ${
                isAtLimit ? "text-red-500" : userPlan === "super" ? "text-green-500" : "text-blue-500"
              }`} />
              <div className="text-sm">
                <span className="font-medium">תוכנית {PLAN_LABELS[userPlan] || userPlan}: </span>
                {userPlan === "super" ? (
                  <span className="text-green-700">ללא הגבלה ({usage.total} אוטומציות פעילות — קבועות: {usage.globalCount}, פרטניות: {usage.perMeetingCount})</span>
                ) : isAtLimit ? (
                  <span className="text-red-600">הגעת למגבלת האוטומציות ({usage.limit}). שדרג את התוכנית להוספת אוטומציות.</span>
                ) : (
                  <span className="text-gray-600">{usage.total} / {usage.limit} אוטומציות בשימוש (קבועות: {usage.globalCount}, פרטניות: {usage.perMeetingCount})</span>
                )}
              </div>
            </div>
          )}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>

        {/* Footer */}
        {!success && (
          <div className="p-6 border-t border-gray-100 bg-white flex justify-between items-center">
            {step > 1 ? (
              <button
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-2 px-5 py-2.5 text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-xl transition-all font-medium"
              >
                <ArrowRight size={18} /> חזור
              </button>
            ) : (
              <div />
            )}

            {step < totalSteps ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={(step === 1 && !canGoStep2) || (step === 2 && !canGoStep3)}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-medium shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                המשך לשלב הבא
                <ArrowLeft size={18} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all font-medium shadow-lg shadow-green-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "שומר..." : editingRule ? "שמור שינויים" : "צור אוטומציה"}
                <CheckCircle2 size={18} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
