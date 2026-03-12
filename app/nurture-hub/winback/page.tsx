"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight,
  UserPlus,
  Save,
  Timer,
  Ghost,
  Sparkles,
  Zap,
  Pencil,
  ToggleRight,
  ToggleLeft,
  Trash2,
  Mail,
  Phone,
  X,
  Clock,
  Send,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Badge } from "@/components/ui/badge";
import CustomerListManager from "@/components/nurture/CustomerListManager";
import NurtureChannelSelector from "@/components/nurture/NurtureChannelSelector";
import NurtureMessageEditor, { migrateConfigMessages, NurtureMessage } from "@/components/nurture/NurtureMessageEditor";
import NurtureTriggerInfo from "@/components/nurture/NurtureTriggerInfo";
import { useNurtureQuota } from "@/components/nurture/NurtureQuotaContext";
import NurtureQuotaBadge from "@/components/nurture/NurtureQuotaBadge";

import {
  getNurtureSubscribers,
  getNurtureRules,
  updateNurtureSubscriber,
  deleteNurtureSubscriber,
  getDataSources,
  DataSource,
  saveNurtureConfig,
  getNurtureConfig,
  getAvailableChannels,
  sendNurtureCampaign,
} from "../actions";
import {
  deleteAutomationRule,
  toggleAutomationRule,
} from "@/app/actions/automations";
import { getFriendlyResultError, getUserFriendlyError } from "@/lib/errors";
import { toast } from "sonner";
import { showConfirm } from "@/hooks/use-modal";
import { isRateLimitError, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit-utils";

// Type needed for list state
interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  emailActive: boolean;
  phoneActive: boolean;
  source: string;
  sourceTableId?: number;
  sourceTableName?: string;
  createdAt?: Date;
  triggerDate?: string | null;
}

export default function WinbackAutomationPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [isAutoModalOpen, setIsAutoModalOpen] = useState(false);
  const [tables, setTables] = useState<DataSource[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Helper to get table name from ID
  const getTableName = (tableId: string) => {
    const table = tables.find((t) => t.id === tableId);
    return table?.name || `טבלה ${tableId}`;
  };

  const refreshData = () => {
    getNurtureSubscribers("winback").then((subs) => {
      setCustomers(
        subs.map((s) => ({
          ...s,
          sourceTableName: s.sourceTableName || undefined,
        }))
      );
    }).catch((err: any) => {
      if (isRateLimitError(err)) toast.error(RATE_LIMIT_MESSAGE);
      else toast.error(getUserFriendlyError(err));
    });
    getNurtureRules("winback").then((r) => {
      setRules(r);
    }).catch((err: any) => {
      if (isRateLimitError(err)) toast.error(RATE_LIMIT_MESSAGE);
      else toast.error(getUserFriendlyError(err));
    });
  };

  // Load tables on mount
  useEffect(() => {
    getDataSources().then((sources) => {
      setTables(sources.filter((s) => s.type === "table"));
    }).catch((err: any) => {
      if (isRateLimitError(err)) toast.error(RATE_LIMIT_MESSAGE);
      else toast.error(getUserFriendlyError(err));
    });
  }, []);

  useEffect(() => {
    refreshData();
  }, []);

  const handleAddCustomers = (newCustomers: any[]) => {
    refreshData();
  };

  const [isEnabled, setIsEnabled] = useState(false);
  const [availableChannels, setAvailableChannels] = useState({ sms: false, whatsappGreen: false, whatsappCloud: false });
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingCustomerId, setSendingCustomerId] = useState<string | null>(null);
  const quota = useNurtureQuota();
  const [config, setConfig] = useState({
    inactivityDays: "90",
    offerTitle: "מתגעגעים אליך! 💔",
    offerValue: "20% הנחה",
    messageBody:
      "היי {first_name},\n\nעבר המון זמן מאז שראינו אותך! \nאנחנו מתגעגעים ורוצים שתחזור, אז הכנו לך הטבה מיוחדת:\n{offer_value} לקנייה חוזרת.\n\nמחכים לך,",
    channels: { sms: false, whatsappGreen: false, whatsappCloud: false },
    messages: [
      {
        id: "msg_default",
        name: "הודעה ראשית",
        isActive: true,
        smsBody: "היי {first_name}, מתגעגעים אליך! הכנו לך הטבה מיוחדת לחזרה.",
        whatsappGreenBody: "היי {first_name}, מתגעגעים אליך! הכנו לך הטבה מיוחדת לחזרה.",
        whatsappCloudTemplateName: "",
        whatsappCloudLanguageCode: "he",
      },
    ] as NurtureMessage[],
  });

  useEffect(() => {
    getNurtureConfig("winback").then((saved) => {
      if (saved?.config) {
        const raw = saved.config as any;
        const { smsBody, whatsappGreenBody, whatsappCloudTemplateName, whatsappCloudLanguageCode, ...rest } = raw;
        const messages = migrateConfigMessages(raw);
        setConfig((prev) => ({ ...prev, ...rest, messages }));
      }
      if (saved?.isEnabled !== undefined) setIsEnabled(saved.isEnabled);
    }).catch((err: any) => {
      if (isRateLimitError(err)) toast.error(RATE_LIMIT_MESSAGE);
      else toast.error(getUserFriendlyError(err));
    });
    getAvailableChannels().then(setAvailableChannels).catch((err: any) => {
      if (isRateLimitError(err)) toast.error(RATE_LIMIT_MESSAGE);
      else toast.error(getUserFriendlyError(err));
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveNurtureConfig("winback", config, isEnabled);
      if (result.success) toast.success("ההגדרות נשמרו בהצלחה");
      else toast.error(getFriendlyResultError(result.error, "שגיאה בשמירה"));
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  const handleSendNow = async () => {
    const tierInfo = quota.isUnlimited ? "ללא הגבלה" : `${quota.limit} הודעות/דקה`;
    if (!(await showConfirm(`לשלוח את הקמפיין ל-${customers.length} לקוחות?\n\nשליחה המונית מתבצעת דרך תור עיבוד ואינה מושפעת ממגבלת ההודעות האישית (${tierInfo}).`))) return;
    setSending(true);
    try {
      const result = await sendNurtureCampaign("winback");
      if (result.success) {
        const ch = result.channelsSent;
        const parts: string[] = [];
        if (ch?.sms) parts.push("SMS");
        if (ch?.whatsappGreen) parts.push("WhatsApp");
        if (ch?.whatsappCloud) parts.push("WhatsApp Cloud");
        const via = parts.length > 0 ? ` (${parts.join(", ")})` : "";
        toast.success(`${result.count} הודעות נשלחו בהצלחה${via}`);
      }
      else toast.error(getFriendlyResultError(result.error, "שגיאה בשליחה"));
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setSending(false);
    }
  };

  const handleSendToCustomer = async (customer: Customer) => {
    if (!quota.isUnlimited && quota.remaining <= 0) {
      toast.error(`חרגת ממגבלת ההודעות. נסה שוב בעוד ${quota.resetInSeconds} שניות.`);
      return;
    }
    if (!(await showConfirm(`לשלוח הודעה ל-${customer.name}?`))) return;
    setSendingCustomerId(customer.id);
    try {
      const result = await sendNurtureCampaign("winback", customer.id);
      if (result.success) {
        const ch = result.channelsSent;
        const parts: string[] = [];
        if (ch?.sms) parts.push("SMS");
        if (ch?.whatsappGreen) parts.push("WhatsApp");
        if (ch?.whatsappCloud) parts.push("WhatsApp Cloud");
        const via = parts.length > 0 ? ` (${parts.join(", ")})` : "";
        toast.success(`ההודעה נשלחה ל-${customer.name}${via}`);
      }
      else toast.error(getFriendlyResultError(result.error, "שגיאה בשליחה"));
      quota.refreshQuota();
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setSendingCustomerId(null);
    }
  };

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20"
      dir="rtl"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 relative">
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/nurture-hub"
            className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:border-indigo-100 transition-all"
          >
            <ArrowRight className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-8 h-8 text-slate-600" />
              החזרת לקוחות לא פעילים (Winback)
            </h1>
            <p className="text-slate-500">
              זהה לקוחות רדומים באופן אוטומטי והחזר אותם למעגל המכירות
            </p>
          </div>
          <div className="mr-auto flex items-center gap-3">
            <NurtureQuotaBadge />
            <Button
              onClick={handleSendNow}
              disabled={sending || customers.length === 0 || (!config.channels.sms && !config.channels.whatsappGreen && !config.channels.whatsappCloud)}
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              שלח לכולם
            </Button>
            <Button onClick={handleSave} disabled={saving} variant="outline" className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              שמור
            </Button>
          </div>
        </div>

        <NurtureTriggerInfo slug="winback" />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Customer List Management */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex justify-between items-center">
                  <span>רשימת לקוחות ({customers.length})</span>
                  <CustomerListManager
                    onAddCustomers={handleAddCustomers}
                    listSlug="winback"
                    automationOpenProp={isAutoModalOpen}
                    onAutomationOpenChangeProp={setIsAutoModalOpen}
                  />
                </CardTitle>
                <CardDescription>
                  נהל את רשימת הלקוחות שיקבלו הודעת חזרה
                </CardDescription>
              </CardHeader>
              <CardContent>
                {customers.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed text-sm">
                    עדיין אין לקוחות ברשימה. לחץ על "הוסף לקוחות" כדי להתחיל.
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 border-b text-xs font-medium text-slate-500">
                      <div className="col-span-3">שם</div>
                      <div className="col-span-3">פעילות אחרונה</div>
                      <div className="col-span-2">פרטי קשר</div>
                      <div className="col-span-2">מקור</div>
                      <div className="col-span-2 text-center">שליחה</div>
                    </div>
                    {/* List */}
                    <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-100">
                      {customers.map((c) => {
                        let activityNode: React.ReactNode;
                        if (c.triggerDate) {
                          const d = new Date(c.triggerDate);
                          const daysDiff = Math.floor((Date.now() - d.getTime()) / 86400000);
                          const dateStr = d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });
                          activityNode = (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-slate-500">{dateStr}</span>
                              <span className={`text-[10px] font-medium ${daysDiff > 90 ? "text-red-600" : "text-emerald-600"}`}>
                                {daysDiff > 90 ? "לא פעיל" : "פעיל"}
                              </span>
                            </div>
                          );
                        } else {
                          activityNode = <span className="text-[10px] text-orange-500">חסר תאריך</span>;
                        }
                        return (
                        <div
                          key={c.id}
                          className="grid grid-cols-12 gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer transition-colors group items-center"
                          onClick={() => setSelectedCustomer(c)}
                        >
                          <div className="col-span-3 flex items-center gap-2 overflow-hidden">
                            <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
                              {c.name.slice(0, 2)}
                            </div>
                            <span className="text-sm font-medium text-slate-900 truncate">
                              {c.name}
                            </span>
                          </div>
                          <div className="col-span-3 flex items-center">
                            {activityNode}
                          </div>
                          <div className="col-span-2 flex items-center text-xs text-slate-600 truncate">
                            {c.email || c.phone || "—"}
                          </div>
                          <div className="col-span-2 flex items-center gap-1.5">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                c.source === "Table Automation"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {c.source === "Manual"
                                ? "ידני"
                                : c.source === "Table Automation"
                                ? "אוטומציה"
                                : c.source}
                            </span>
                            {c.source === "Table Automation" &&
                              c.sourceTableName && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                                  {c.sourceTableName}
                                </span>
                              )}
                          </div>
                          <div className="col-span-2 flex items-center justify-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSendToCustomer(c); }}
                              disabled={sendingCustomerId === c.id || !c.phone || !c.phoneActive || (!quota.isUnlimited && quota.remaining <= 0)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              title={!c.phone || !c.phoneActive ? "אין מספר טלפון פעיל" : `שלח ל-${c.name}`}
                            >
                              {sendingCustomerId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                              שלח
                            </button>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Active Automation Rules */}
            {rules.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-500 fill-amber-500" />
                    חוקי אוטומציה פעילים ({rules.length})
                  </CardTitle>
                  <CardDescription>
                    חוקים שמוסיפים לקוחות באופן אוטומטי
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {rules.map((rule: any) => {
                      const triggerConfig = rule.triggerConfig || {};
                      const actionConfig = rule.actionConfig || {};
                      return (
                        <div
                          key={rule.id}
                          className="flex items-center justify-between p-3 bg-amber-50 border border-amber-100 rounded-lg"
                        >
                          <div className="flex-1">
                            <div className="text-sm font-medium text-slate-900">
                              {rule.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {rule.triggerType === "NEW_RECORD"
                                ? `כאשר נוצר רשומה חדשה בטבלה "${getTableName(
                                    triggerConfig.tableId
                                  )}"`
                                : `כאשר משתנה ${triggerConfig.columnId} מ-"${
                                    triggerConfig.fromValue || "כל ערך"
                                  }" ל-"${
                                    triggerConfig.toValue
                                  }" בטבלה "${getTableName(
                                    triggerConfig.tableId
                                  )}"`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Edit */}
                            <button
                              onClick={() => {
                                setIsAutoModalOpen(true);
                              }}
                              className="p-1.5 rounded-md text-indigo-600 hover:bg-indigo-50 transition-colors"
                              title="ערוך ונהל אוטומציות"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            {/* Toggle Active/Inactive */}
                            <button
                              onClick={async () => {
                                try {
                                  await toggleAutomationRule(
                                    rule.id,
                                    !rule.isActive
                                  );
                                  refreshData();
                                } catch (error) {
                                  if (isRateLimitError(error)) toast.error(RATE_LIMIT_MESSAGE);
                                  else toast.error(getUserFriendlyError(error));
                                }
                              }}
                              className={`p-1.5 rounded-md transition-colors ${
                                rule.isActive
                                  ? "text-green-600 hover:bg-green-100"
                                  : "text-slate-400 hover:bg-slate-100"
                              }`}
                              title={rule.isActive ? "השבת" : "הפעל"}
                            >
                              {rule.isActive ? (
                                <ToggleRight className="w-5 h-5" />
                              ) : (
                                <ToggleLeft className="w-5 h-5" />
                              )}
                            </button>
                            {/* Delete */}
                            <button
                              onClick={async () => {
                                if (await showConfirm("האם למחוק את חוק האוטומציה?")) {
                                  try {
                                    await deleteAutomationRule(rule.id);
                                    refreshData();
                                  } catch (error) {
                                    if (isRateLimitError(error)) toast.error(RATE_LIMIT_MESSAGE);
                                    else toast.error(getUserFriendlyError(error));
                                  }
                                }
                              }}
                              className="p-1.5 rounded-md text-red-500 hover:bg-red-50 transition-colors"
                              title="מחק"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <Badge
                              className={`${
                                rule.isActive
                                  ? "bg-green-100 text-green-700 border-green-200"
                                  : "bg-slate-100 text-slate-500 border-slate-200"
                              }`}
                            >
                              {rule.isActive ? "פעיל" : "מושבת"}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Channel Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">ערוצי שליחה</CardTitle>
                <CardDescription>בחר היכן הלקוח יקבל את ההודעה</CardDescription>
              </CardHeader>
              <CardContent>
                <NurtureChannelSelector
                  channels={config.channels}
                  onChange={(channels) => setConfig({ ...config, channels })}
                  availableChannels={availableChannels}
                />
              </CardContent>
            </Card>

            {/* Message Editor */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">תוכן ההודעות</CardTitle>
              </CardHeader>
              <CardContent>
                <NurtureMessageEditor
                  channels={config.channels}
                  messages={config.messages}
                  onMessagesChange={(messages) => setConfig({ ...config, messages })}
                  placeholders={["{first_name}"]}
                />
              </CardContent>
            </Card>

            {/* Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">הגדרת טריגר</CardTitle>
                <CardDescription>
                  מתי להגדיר לקוח כ"לא פעיל" בקבוצה זו?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>ימים ללא רכישה/פעילות</Label>
                    <Select
                      value={config.inactivityDays}
                      onValueChange={(val) =>
                        setConfig({ ...config, inactivityDays: val })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 יום</SelectItem>
                        <SelectItem value="60">60 יום</SelectItem>
                        <SelectItem value="90">90 יום</SelectItem>
                        <SelectItem value="180">חצי שנה</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>הצעה מפתה</Label>
                    <Input
                      value={config.offerValue}
                      onChange={(e) =>
                        setConfig({ ...config, offerValue: e.target.value })
                      }
                      placeholder="לדוגמה: 20% הנחה"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Message Config */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">הודעת Winback</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>כותרת ראשית</Label>
                  <Input
                    value={config.offerTitle}
                    onChange={(e) =>
                      setConfig({ ...config, offerTitle: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>גוף ההודעה</Label>
                  <Textarea
                    rows={5}
                    value={config.messageBody}
                    onChange={(e) =>
                      setConfig({ ...config, messageBody: e.target.value })
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-8 space-y-6">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 text-center shadow-lg relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-linear-to-r from-slate-400 to-slate-600"></div>

                <div className="w-20 h-20 bg-slate-100 rounded-full mx-auto mb-4 flex items-center justify-center relative">
                  <Ghost className="w-10 h-10 text-slate-400" />
                  <div className="absolute top-0 right-0 w-6 h-6 bg-red-500 rounded-full border-2 border-white"></div>
                </div>

                <h3 className="text-xl font-extrabold text-slate-900 mb-2">
                  {config.offerTitle}
                </h3>

                <p className="text-slate-600 text-sm mb-6 whitespace-pre-line leading-relaxed">
                  {config.messageBody
                    .replace("{first_name}", "רוני")
                    .replace("{offer_value}", config.offerValue)}
                </p>

                <div className="bg-slate-50 rounded-xl p-4 border border-dashed border-slate-300 mb-6 relative group cursor-pointer hover:bg-slate-100 transition-colors">
                  <div className="text-xs text-slate-500 font-medium mb-1">
                    קוד קופון אישי
                  </div>
                  <div className="text-2xl font-mono font-bold text-slate-800 tracking-widest">
                    COMEBACK20
                  </div>
                  <Sparkles className="absolute top-2 right-2 w-4 h-4 text-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-full">
                  קחו אותי לחנות
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Details Popup */}
      {selectedCustomer && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => {
            setSelectedCustomer(null);
            setEditingCustomer(null);
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-[90%] max-w-sm p-5 relative"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setSelectedCustomer(null);
                setEditingCustomer(null);
              }}
              className="absolute top-3 left-3 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-slate-600" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-lg font-bold">
                {selectedCustomer.name.slice(0, 2)}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-lg text-slate-900">
                  {selectedCustomer.name}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      selectedCustomer.source === "Table Automation"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {selectedCustomer.source === "Manual"
                      ? "הוספה ידנית"
                      : selectedCustomer.source === "Table Automation"
                      ? "אוטומציה"
                      : selectedCustomer.source}
                  </span>
                  {selectedCustomer.source === "Table Automation" &&
                    selectedCustomer.sourceTableName && (
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                        מטבלה: {selectedCustomer.sourceTableName}
                      </span>
                    )}
                </div>
              </div>
              {!editingCustomer && (
                <button
                  onClick={() => setEditingCustomer({ ...selectedCustomer })}
                  className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
                  title="ערוך"
                >
                  <Pencil className="w-4 h-4 text-slate-600" />
                </button>
              )}
            </div>

            {editingCustomer ? (
              /* Edit Mode */
              <div className="space-y-4 border-t pt-4">
                <div className="text-sm font-medium text-slate-700 mb-1">פרטי לקוח</div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">שם</Label>
                  <Input
                    value={editingCustomer.name}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">טלפון</Label>
                  <Input
                    value={editingCustomer.phone || ""}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                    className="h-9 text-sm"
                    dir="ltr"
                    placeholder="05XXXXXXXX"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">אימייל</Label>
                  <Input
                    value={editingCustomer.email || ""}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                    className="h-9 text-sm"
                    dir="ltr"
                    type="email"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">תאריך טריגר</Label>
                  <Input
                    type="date"
                    value={editingCustomer.triggerDate ? new Date(editingCustomer.triggerDate).toISOString().split("T")[0] : ""}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, triggerDate: e.target.value || null })}
                    className="h-9 text-sm"
                    dir="ltr"
                  />
                </div>

                <div className="text-sm font-medium text-slate-700 mt-2">ערוצי תקשורת</div>

                {editingCustomer.email && (
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                        <Mail className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="text-sm font-medium text-slate-900">אימייל</div>
                    </div>
                    <button
                      onClick={() =>
                        setEditingCustomer({
                          ...editingCustomer,
                          emailActive: !editingCustomer.emailActive,
                        })
                      }
                      className={`p-1.5 rounded-md transition-colors ${
                        editingCustomer.emailActive
                          ? "text-green-600 hover:bg-green-50"
                          : "text-slate-400 hover:bg-slate-100"
                      }`}
                    >
                      {editingCustomer.emailActive ? (
                        <ToggleRight className="w-6 h-6" />
                      ) : (
                        <ToggleLeft className="w-6 h-6" />
                      )}
                    </button>
                  </div>
                )}

                {editingCustomer.phone && (
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center">
                        <Phone className="w-4 h-4 text-green-600" />
                      </div>
                      <div className="text-sm font-medium text-slate-900">טלפון (SMS/WhatsApp)</div>
                    </div>
                    <button
                      onClick={() =>
                        setEditingCustomer({
                          ...editingCustomer,
                          phoneActive: !editingCustomer.phoneActive,
                        })
                      }
                      className={`p-1.5 rounded-md transition-colors ${
                        editingCustomer.phoneActive
                          ? "text-green-600 hover:bg-green-50"
                          : "text-slate-400 hover:bg-slate-100"
                      }`}
                    >
                      {editingCustomer.phoneActive ? (
                        <ToggleRight className="w-6 h-6" />
                      ) : (
                        <ToggleLeft className="w-6 h-6" />
                      )}
                    </button>
                  </div>
                )}

                {!editingCustomer.emailActive &&
                  !editingCustomer.phoneActive && (
                    <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">
                      שני ערוצי התקשורת מושבתים. הלקוח לא יקבל הודעות.
                    </div>
                  )}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingCustomer(null)}
                    className="flex-1"
                  >
                    ביטול
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        const result = await updateNurtureSubscriber(
                          editingCustomer.id,
                          {
                            name: editingCustomer.name,
                            phone: editingCustomer.phone || "",
                            email: editingCustomer.email || "",
                            triggerDate: editingCustomer.triggerDate || null,
                            emailActive: editingCustomer.emailActive,
                            phoneActive: editingCustomer.phoneActive,
                          }
                        );
                        if (result.success) {
                          setEditingCustomer(null);
                          setSelectedCustomer(null);
                          refreshData();
                        } else {
                          toast.error(getFriendlyResultError(result.error, "שגיאה בשמירה"));
                        }
                      } catch (error) {
                        toast.error(getUserFriendlyError(error));
                      }
                    }}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  >
                    שמור
                  </Button>
                </div>
              </div>
            ) : (
              /* View Mode */
              <>
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                      <Mail className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">אימייל</div>
                      <div className="text-sm text-slate-900">
                        {selectedCustomer.email || "לא צוין"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center">
                      <Phone className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">טלפון</div>
                      <div className="text-sm text-slate-900">
                        {selectedCustomer.phone || "לא צוין"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Delete Button */}
                <div className="border-t mt-4 pt-4">
                  <button
                    onClick={async () => {
                      if (
                        !(await showConfirm(
                          `האם למחוק את ${selectedCustomer.name} מהרשימה?`
                        ))
                      ) return;
                      try {
                        const result = await deleteNurtureSubscriber(
                          selectedCustomer.id
                        );
                        if (result.success) {
                          setSelectedCustomer(null);
                          refreshData();
                        } else {
                          toast.error(getFriendlyResultError(result.error, "שגיאה במחיקה"));
                        }
                      } catch (error) {
                        toast.error(getUserFriendlyError(error));
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    מחק מהרשימה
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
