"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Star,
  Save,
  Send,
  Loader2,
  Zap,
  Pencil,
  ToggleRight,
  ToggleLeft,
  Trash2,
  Mail,
  Phone,
  X,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import NurtureChannelSelector from "@/components/nurture/NurtureChannelSelector";
import NurtureMessageEditor, { migrateConfigMessages, NurtureMessage } from "@/components/nurture/NurtureMessageEditor";
import CustomerListManager from "@/components/nurture/CustomerListManager";
import NurtureTriggerInfo from "@/components/nurture/NurtureTriggerInfo";
import { useNurtureQuota } from "@/components/nurture/NurtureQuotaContext";
import NurtureQuotaBadge from "@/components/nurture/NurtureQuotaBadge";
import NurtureQueuePanel from "@/components/nurture/NurtureQueuePanel";
import NurtureSendConfirmDialog, { type ChannelSelection, type BulkCustomer } from "@/components/nurture/NurtureSendConfirmDialog";
import NurtureSubscriberSearch from "@/components/nurture/NurtureSubscriberSearch";
import NurtureCustomerGrid from "@/components/nurture/NurtureCustomerGrid";
import { useNurtureSubscribers } from "@/hooks/useNurtureSubscribers";
import { REVIEW_SMART_FIELDS } from "@/lib/nurture-fields";

import {
  getNurtureRules,
  updateNurtureSubscriber,
  deleteNurtureSubscriber,
  deleteNurtureSubscribers,
  getDataSources,
  DataSource,
  saveNurtureConfig,
  getNurtureConfig,
  getAvailableChannels,
  sendNurtureCampaign,
} from "../actions";
import type { NurtureSubscriberResult } from "../actions";
import {
  deleteAutomationRule,
  toggleAutomationRule,
} from "@/app/actions/automations";
import { getFriendlyResultError, getUserFriendlyError } from "@/lib/errors";
import { toast } from "sonner";
import { showConfirm } from "@/hooks/use-modal";
import { isRateLimitError, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit-utils";

export default function ReviewAutomationPage() {
  const {
    customers, total, hasMore, isLoading, isLoadingMore,
    lastSentMap, selectedCustomerIds,
    search, filters, setSearch, setFilters,
    toggleCustomerSelection, toggleAllCustomers,
    loadMore, refreshData,
  } = useNurtureSubscribers("review");

  const [rules, setRules] = useState<any[]>([]);
  const [isAutoModalOpen, setIsAutoModalOpen] = useState(false);
  const [tables, setTables] = useState<DataSource[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<NurtureSubscriberResult | null>(
    null
  );
  const [editingCustomer, setEditingCustomer] = useState<NurtureSubscriberResult | null>(null);

  // Helper to get table name from ID
  const getTableName = (tableId: string) => {
    const table = tables.find((t) => t.id === tableId);
    return table?.name || `טבלה ${tableId}`;
  };

  const refreshRules = () => {
    getNurtureRules("review").then((r) => {
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
    refreshRules();
  }, []);

  useEffect(() => {
    getNurtureConfig("review").then((saved) => {
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

  const handleAddCustomers = (newCustomers: any[]) => {
    refreshData();
  };

  const [isEnabled, setIsEnabled] = useState(false);
  const [availableChannels, setAvailableChannels] = useState({ sms: false, whatsappGreen: false, whatsappCloud: false });
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingCustomerId, setSendingCustomerId] = useState<string | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [sendConfirmCustomer, setSendConfirmCustomer] = useState<NurtureSubscriberResult | null>(null);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [bulkSendOpen, setBulkSendOpen] = useState(false);
  const [bulkSendForSelected, setBulkSendForSelected] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const quota = useNurtureQuota();
  const [config, setConfig] = useState({
    timing: "immediate",
    channels: { sms: false, whatsappGreen: false, whatsappCloud: false },
    messages: [
      {
        id: "msg_default",
        name: "הודעה ראשית",
        isActive: true,
        smsBody: "היי {first_name}, שמחנו לתת לך שירות! נשמח לשמוע מה חשבת בקישור קצר.",
        whatsappGreenBody: "היי {first_name}, שמחנו לתת לך שירות! נשמח לשמוע מה חשבת בקישור קצר.",
        whatsappCloudTemplateName: "",
        whatsappCloudLanguageCode: "he",
      },
    ] as NurtureMessage[],
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveNurtureConfig("review", config, isEnabled);
      if (result.success) toast.success("ההגדרות נשמרו בהצלחה");
      else toast.error(getFriendlyResultError(result.error, "שגיאה בשמירה"));
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  const bulkCustomers: BulkCustomer[] = useMemo(() => {
    const source = bulkSendForSelected && selectedCustomerIds.size > 0
      ? customers.filter((c) => selectedCustomerIds.has(c.id))
      : customers;
    return source.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      phoneActive: c.phoneActive,
      alreadySent: !!lastSentMap[c.id],
      lastSentAt: lastSentMap[c.id] || undefined,
    }));
  }, [customers, lastSentMap, selectedCustomerIds, bulkSendForSelected]);

  const handleSendNow = () => { setBulkSendForSelected(false); setBulkSendOpen(true); };
  const handleSendSelected = () => { setBulkSendForSelected(true); setBulkSendOpen(true); };

  const handleBulkDelete = async () => {
    if (!(await showConfirm(`האם למחוק ${selectedCustomerIds.size} נרשמים מהרשימה?`))) return;
    setIsDeletingBulk(true);
    try {
      const result = await deleteNurtureSubscribers(Array.from(selectedCustomerIds));
      if (result.success) {
        toast.success(`${(result as any).count ?? selectedCustomerIds.size} נרשמים נמחקו`);
        refreshData();
      } else {
        toast.error(getFriendlyResultError(result.error, "שגיאה במחיקה"));
      }
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const handleBulkConfirmSend = async (channels: ChannelSelection, subscriberIds?: string[]) => {
    setBulkSendOpen(false);
    setSending(true);
    try {
      const result = await sendNurtureCampaign("review", undefined, channels, subscriberIds);
      if (result.success) {
        const ch = result.channelsSent;
        const parts: string[] = [];
        if (ch?.sms) parts.push("SMS");
        if (ch?.whatsappGreen) parts.push("WhatsApp");
        if (ch?.whatsappCloud) parts.push("WhatsApp Cloud");
        const via = parts.length > 0 ? ` (${parts.join(", ")})` : "";
        const quotaNote = result.quotaLimited ? ` (מתוך ${result.totalSubscribers})` : "";
        toast.success(`${result.count} הודעות נשלחו בהצלחה${via}${quotaNote}`);
        setActiveBatchId(result.batchId ?? null);
        quota.refreshQuota();
        refreshData();
      }
      else toast.error(getFriendlyResultError(result.error, "שגיאה בשליחה"));
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setSending(false);
    }
  };

  const handleSendToCustomer = (customer: NurtureSubscriberResult) => {
    if (!quota.isUnlimited && quota.remaining <= 0) {
      toast.error(`חרגת ממגבלת ההודעות. נסה שוב בעוד ${quota.resetInSeconds} שניות.`);
      return;
    }
    setSendConfirmCustomer(customer);
    setSendConfirmOpen(true);
  };

  const handleConfirmSend = async (selectedChannels: ChannelSelection) => {
    const customer = sendConfirmCustomer;
    if (!customer) return;
    setSendConfirmOpen(false);
    setSendingCustomerId(customer.id);
    try {
      const result = await sendNurtureCampaign("review", customer.id, selectedChannels);
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
              <Star className="w-8 h-8 text-amber-500" />
              בקשת ביקורות (Reviews)
            </h1>
            <p className="text-slate-500">
              נהל את המוניטין שלך באופן אוטומטי והגדל את כמות הביקורות החיוביות
            </p>
          </div>
          <div className="mr-auto flex items-center gap-3">
            <NurtureQuotaBadge />
            <Button
              onClick={handleSendNow}
              disabled={sending || customers.length === 0 || (!config.channels.sms && !config.channels.whatsappGreen && !config.channels.whatsappCloud)}
              className="bg-amber-600 hover:bg-amber-700 gap-2"
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

        <NurtureTriggerInfo slug="review" />

        <div className="space-y-6">
            {/* Customer List Management */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex justify-between items-center">
                  <span>רשימת לקוחות ({total})</span>
                  <CustomerListManager
                    onAddCustomers={handleAddCustomers}
                    listSlug="review"
                    automationOpenProp={isAutoModalOpen}
                    onAutomationOpenChangeProp={setIsAutoModalOpen}
                  />
                </CardTitle>
                <CardDescription>
                  נהל את רשימת הלקוחות שיקבלו בקשת ביקורת
                </CardDescription>
              </CardHeader>
              <CardContent>
                <NurtureSubscriberSearch
                  smartFields={REVIEW_SMART_FIELDS}
                  search={search}
                  onSearchChange={setSearch}
                  filters={filters}
                  onFiltersChange={setFilters}
                />
                <NurtureCustomerGrid
                  customers={customers}
                  total={total}
                  hasMore={hasMore}
                  isLoading={isLoading}
                  isLoadingMore={isLoadingMore}
                  lastSentMap={lastSentMap}
                  selectedCustomerIds={selectedCustomerIds}
                  sendingCustomerId={sendingCustomerId}
                  quotaRemaining={quota.remaining}
                  isQuotaUnlimited={quota.isUnlimited}
                  accentColor="amber"
                  onToggleSelection={toggleCustomerSelection}
                  onToggleAll={toggleAllCustomers}
                  onCustomerClick={setSelectedCustomer}
                  onSendToCustomer={handleSendToCustomer}
                  onLoadMore={loadMore}
                  onBulkSend={handleSendSelected}
                  onBulkDelete={handleBulkDelete}
                  isDeletingBulk={isDeletingBulk}
                  hasActiveSearch={!!search || filters.length > 0}
                  onClearSearch={() => { setSearch(""); setFilters([]); }}
                />
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
                                  refreshRules();
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
                                    refreshRules();
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

            {/* Timing & Scheduling */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500 fill-amber-500" />
                  תזמון שליחה
                </CardTitle>
                <CardDescription>הגדר מתי לשלוח בקשת ביקורת ללקוחות שמתווספים לרשימה</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="flex flex-col gap-1">
                    <span>שליחה אוטומטית לאחר הוספה לרשימה</span>
                    <span className="text-xs text-slate-500 font-normal">
                      כמה זמן אחרי שלקוח מתווסף לרשימה לשלוח לו בקשה?
                    </span>
                  </Label>
                  <Select
                    value={config.timing}
                    onValueChange={(val) =>
                      setConfig({ ...config, timing: val })
                    }
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">ידני בלבד</SelectItem>
                      <SelectItem value="immediate">מיידית</SelectItem>
                      <SelectItem value="1_hour">שעה אחרי</SelectItem>
                      <SelectItem value="24_hours">יום אחרי</SelectItem>
                      <SelectItem value="3_days">3 ימים אחרי</SelectItem>
                      <SelectItem value="1_week">שבוע אחרי</SelectItem>
                      <SelectItem value="2_weeks">שבועיים אחרי</SelectItem>
                      <SelectItem value="1_month">חודש אחרי</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="bg-slate-50 border rounded-lg p-3 text-xs text-slate-600 space-y-1">
                  <p>
                    {config.timing === "manual"
                      ? "לקוחות יתווספו לרשימה ותוכל לשלוח להם ידנית בלחיצה על \"שלח\" ליד כל לקוח, או \"שלח לכולם\"."
                      : `לאחר הוספה לרשימה (ידנית או אוטומטית), ההודעה תישלח ${
                          config.timing === "immediate" ? "מיד" :
                          config.timing === "1_hour" ? "שעה אחרי" :
                          config.timing === "24_hours" ? "יום אחרי" :
                          config.timing === "3_days" ? "3 ימים אחרי" :
                          config.timing === "1_week" ? "שבוע אחרי" :
                          config.timing === "2_weeks" ? "שבועיים אחרי" :
                          config.timing === "1_month" ? "חודש אחרי" : ""
                        }. תמיד אפשר גם לשלוח ידנית.`}
                  </p>
                </div>
              </CardContent>
            </Card>

        </div>
      </div>

      {/* Customer Details Popup */}
      {selectedCustomer && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => {
            setSelectedCustomer(null);
            setEditingCustomer(null);
            setConfirmingDelete(false);
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
                setConfirmingDelete(false);
              }}
              className="absolute top-3 left-3 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-slate-600" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-lg font-bold">
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

                {lastSentMap[selectedCustomer.id] && (
                  <div className="flex items-center gap-3 border-t pt-3">
                    <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-orange-600" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">נשלח לאחרונה</div>
                      <div className="text-sm text-slate-900">
                        {new Date(lastSentMap[selectedCustomer.id]).toLocaleDateString("he-IL")}
                      </div>
                    </div>
                  </div>
                )}

                {/* Delete Button */}
                <div className="border-t mt-4 pt-4">
                  {confirmingDelete ? (
                    <div className="space-y-2">
                      <p className="text-sm text-center text-red-600 font-medium">
                        האם למחוק את {selectedCustomer.name} מהרשימה?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            try {
                              const result = await deleteNurtureSubscriber(
                                selectedCustomer.id
                              );
                              if (result.success) {
                                toast.success("נמחק בהצלחה");
                                setSelectedCustomer(null);
                                setConfirmingDelete(false);
                                refreshData();
                              } else {
                                toast.error(getFriendlyResultError(result.error, "שגיאה במחיקה"));
                              }
                            } catch (error) {
                              toast.error(getUserFriendlyError(error));
                            }
                          }}
                          className="flex-1 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                        >
                          כן, מחק
                        </button>
                        <button
                          onClick={() => setConfirmingDelete(false)}
                          className="flex-1 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                          ביטול
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingDelete(true)}
                      className="w-full flex items-center justify-center gap-2 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      מחק מהרשימה
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <NurtureQueuePanel batchId={activeBatchId} onClose={() => setActiveBatchId(null)} />
      <NurtureSendConfirmDialog
        open={sendConfirmOpen}
        onOpenChange={setSendConfirmOpen}
        mode="single"
        customerName={sendConfirmCustomer?.name || ""}
        customerLastSentAt={sendConfirmCustomer ? lastSentMap[sendConfirmCustomer.id] : undefined}
        enabledChannels={config.channels}
        onConfirm={handleConfirmSend}
        loading={sendingCustomerId === sendConfirmCustomer?.id}
      />
      <NurtureSendConfirmDialog
        open={bulkSendOpen}
        onOpenChange={setBulkSendOpen}
        mode="bulk"
        customers={bulkCustomers}
        enabledChannels={config.channels}
        onConfirm={handleBulkConfirmSend}
        loading={sending}
        quota={quota}
        selectedOnly={bulkSendForSelected}
      />
    </div>
  );
}
