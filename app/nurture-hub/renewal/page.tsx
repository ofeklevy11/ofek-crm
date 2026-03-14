"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  ArrowRight,
  RefreshCw,
  Save,
  Clock,
  AlertTriangle,
  Zap,
  Pencil,
  ToggleRight,
  ToggleLeft,
  Trash2,
  Mail,
  Phone,
  X,
  Send,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import dynamic from "next/dynamic";
const CustomerListManager = dynamic(() => import("@/components/nurture/CustomerListManager"), { ssr: false });
import NurtureChannelSelector from "@/components/nurture/NurtureChannelSelector";
import NurtureMessageEditor, { migrateConfigMessages, getActiveMessage, NurtureMessage } from "@/components/nurture/NurtureMessageEditor";
import NurtureTriggerInfo from "@/components/nurture/NurtureTriggerInfo";
import NurtureAutomationPreview from "@/components/nurture/NurtureAutomationPreview";
import { useNurtureQuota } from "@/components/nurture/NurtureQuotaContext";
import NurtureQueuePanel from "@/components/nurture/NurtureQueuePanel";
import NurtureAutoSendQueue from "@/components/nurture/NurtureAutoSendQueue";
import NurtureSendConfirmDialog, { type ChannelSelection, type BulkCustomer } from "@/components/nurture/NurtureSendConfirmDialog";
import NurtureSubscriberSearch from "@/components/nurture/NurtureSubscriberSearch";
import NurtureCustomerGrid from "@/components/nurture/NurtureCustomerGrid";
import { useNurtureSubscribers } from "@/hooks/useNurtureSubscribers";
import { RENEWAL_SMART_FIELDS } from "@/lib/nurture-fields";
import type { NurtureSubscriberResult } from "../actions";
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
import {
  deleteAutomationRule,
  toggleAutomationRule,
} from "@/app/actions/automations";
import { getFriendlyResultError, getUserFriendlyError } from "@/lib/errors";
import { toast } from "sonner";
import { showConfirm } from "@/hooks/use-modal";
import { isRateLimitError, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit-utils";

export default function RenewalAutomationPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [confirmDeleteRuleId, setConfirmDeleteRuleId] = useState<number | null>(null);
  const [isAutoModalOpen, setIsAutoModalOpen] = useState(false);
  const [tables, setTables] = useState<DataSource[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<NurtureSubscriberResult | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<NurtureSubscriberResult | null>(null);

  // Hook for subscribers with pagination/search
  const {
    customers, total, hasMore, isLoading, isLoadingMore,
    lastSentMap, selectedCustomerIds,
    search, filters, setSearch, setFilters,
    toggleCustomerSelection, toggleAllCustomers,
    loadMore, refreshData,
  } = useNurtureSubscribers("renewal");

  // Helper to get table name from ID
  const getTableName = (tableId: string) => {
    const table = tables.find((t) => t.id === tableId);
    return table?.name || `טבלה ${tableId}`;
  };

  const refreshRules = () => {
    getNurtureRules("renewal").then((r) => {
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

  const handleAddCustomers = () => {
    refreshData();
  };

  const [isEnabled, setIsEnabled] = useState(false);
  const [availableChannels, setAvailableChannels] = useState({ sms: false, whatsappGreen: false, whatsappCloud: false, email: false });
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
  const [previewRefreshTrigger, setPreviewRefreshTrigger] = useState(0);
  const [autoSendQueueTrigger, setAutoSendQueueTrigger] = useState(0);
  const handleAutoSendDispatched = useCallback(() => { setPreviewRefreshTrigger(p => p + 1); setAutoSendQueueTrigger(p => p + 1); }, []);
  const [config, setConfig] = useState({
    daysBeforeExpiry: "30",
    offerType: "discount",
    offerValue: "10",
    channels: { sms: false, whatsappGreen: false, whatsappCloud: false, email: false },
    messages: [
      {
        id: "msg_default",
        name: "הודעה ראשית",
        isActive: true,
        smsBody: "היי {first_name}, המנוי שלך עומד להסתיים! חדש עכשיו וקבל הטבה מיוחדת.",
        whatsappGreenBody: "היי {first_name}, המנוי שלך עומד להסתיים! חדש עכשיו וקבל הטבה מיוחדת.",
        whatsappCloudTemplateName: "",
        whatsappCloudLanguageCode: "he",
        emailSubject: "",
        emailBody: "",
      },
    ] as NurtureMessage[],
  });

  useEffect(() => {
    getNurtureConfig("renewal").then((saved) => {
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
      const result = await saveNurtureConfig("renewal", config, isEnabled);
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
      email: c.email,
      phoneActive: c.phoneActive,
      emailActive: c.emailActive,
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
      const result = await sendNurtureCampaign("renewal", undefined, channels, subscriberIds);
      if (result.success) {
        const ch = result.channelsSent;
        const parts: string[] = [];
        if (ch?.sms) parts.push("SMS");
        if (ch?.whatsappGreen) parts.push("WhatsApp");
        if (ch?.whatsappCloud) parts.push("WhatsApp Cloud");
        if (ch?.email) parts.push("אימייל");
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
      const result = await sendNurtureCampaign("renewal", customer.id, selectedChannels);
      if (result.success) {
        const ch = result.channelsSent;
        const parts: string[] = [];
        if (ch?.sms) parts.push("SMS");
        if (ch?.whatsappGreen) parts.push("WhatsApp");
        if (ch?.whatsappCloud) parts.push("WhatsApp Cloud");
        if (ch?.email) parts.push("אימייל");
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
    <main
      className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20"
      dir="rtl"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 relative">
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/nurture-hub"
            className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:border-indigo-100 transition-all"
            aria-label="חזרה ל-Nurture Hub"
          >
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <RefreshCw className="w-8 h-8 text-cyan-500" aria-hidden="true" />
              חידוש הסכם (Renewal)
            </h1>
            <p className="text-slate-500">
              מנע נטישת לקוחות והבטח הכנסה חוזרת באופן אוטומטי
            </p>
          </div>
          <div className="mr-auto flex items-center gap-3">
            <div className="flex items-center gap-2 border rounded-lg px-3 py-1.5">
              <Label htmlFor="renewal-enabled" className="text-sm text-slate-600 cursor-pointer">
                {isEnabled ? "פעיל" : "כבוי"}
              </Label>
              <Switch
                id="renewal-enabled"
                checked={isEnabled}
                onCheckedChange={setIsEnabled}
              />
            </div>
            <Button
              onClick={handleSendNow}
              disabled={sending || customers.length === 0 || (!config.channels.sms && !config.channels.whatsappGreen && !config.channels.whatsappCloud && !config.channels.email)}
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
              שלח לכולם
            </Button>
            <Button onClick={handleSave} disabled={saving} variant="outline" className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
              שמור
            </Button>
          </div>
        </div>

        <NurtureTriggerInfo slug="renewal" />
        <NurtureAutomationPreview
          slug="renewal"
          channels={config.channels}
          messages={config.messages}
          timing="cron"
          customerCount={total}
          isEnabled={isEnabled}
          accentColor="blue"
          refreshTrigger={previewRefreshTrigger}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Customer List Management */}
            <Card>
              <CardHeader>
                <h2 className="font-semibold leading-none tracking-tight text-lg flex justify-between items-center">
                  <span>רשימת לקוחות ({total})</span>
                  <CustomerListManager
                    onAddCustomers={handleAddCustomers}
                    listSlug="renewal"
                    automationOpenProp={isAutoModalOpen}
                    onAutomationOpenChangeProp={setIsAutoModalOpen}
                    onAutoSendDispatched={handleAutoSendDispatched}
                  />
                </h2>
                <CardDescription>
                  נהל את רשימת הלקוחות שיקבלו תזכורת חידוש
                </CardDescription>
              </CardHeader>
              <CardContent>
                <NurtureSubscriberSearch
                  smartFields={RENEWAL_SMART_FIELDS}
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
                  dateColumn={{
                    label: "תאריך סיום",
                    render: (c) => {
                      if (!c.triggerDate) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 font-medium">חסר תאריך</span>;
                      const d = new Date(c.triggerDate);
                      const isExpired = d < new Date();
                      return (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs text-slate-600">{d.toLocaleDateString("he-IL")}</span>
                          {isExpired ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium w-fit">פג תוקף</span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium w-fit">בתוקף</span>
                          )}
                        </div>
                      );
                    },
                  }}
                  accentColor="orange"
                  onToggleSelection={toggleCustomerSelection}
                  onToggleAll={toggleAllCustomers}
                  onCustomerClick={(c) => setSelectedCustomer(c)}
                  onSendToCustomer={handleSendToCustomer}
                  onLoadMore={loadMore}
                  onBulkSend={handleSendSelected}
                  onBulkDelete={handleBulkDelete}
                  isDeletingBulk={isDeletingBulk}
                  hasActiveSearch={search.length > 0 || filters.length > 0}
                  onClearSearch={() => { setSearch(""); setFilters([]); }}
                />
              </CardContent>
            </Card>

            {/* Active Automation Rules */}
            {rules.length > 0 && (
              <Card>
                <CardHeader>
                  <h2 className="font-semibold leading-none tracking-tight text-lg flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-500 fill-amber-500" aria-hidden="true" />
                    חוקי אוטומציה פעילים ({rules.length})
                  </h2>
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
                              className="p-1.5 rounded-md text-indigo-600 hover:bg-indigo-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              title="ערוך ונהל אוטומציות"
                              aria-label="ערוך אוטומציה"
                            >
                              <Pencil className="w-4 h-4" aria-hidden="true" />
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
                              className={`p-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                rule.isActive
                                  ? "text-green-600 hover:bg-green-100"
                                  : "text-slate-400 hover:bg-slate-100"
                              }`}
                              title={rule.isActive ? "השבת" : "הפעל"}
                              aria-label={rule.isActive ? "השבת אוטומציה" : "הפעל אוטומציה"}
                            >
                              {rule.isActive ? (
                                <ToggleRight className="w-5 h-5" aria-hidden="true" />
                              ) : (
                                <ToggleLeft className="w-5 h-5" aria-hidden="true" />
                              )}
                            </button>
                            {/* Delete */}
                            {confirmDeleteRuleId === rule.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={async () => {
                                    try {
                                      const result = await deleteAutomationRule(rule.id);
                                      if (result.success) {
                                        refreshRules();
                                        toast.success("האוטומציה נמחקה בהצלחה");
                                      } else {
                                        toast.error(result.error || "שגיאה במחיקת האוטומציה");
                                      }
                                    } catch (error) {
                                      if (isRateLimitError(error)) toast.error(RATE_LIMIT_MESSAGE);
                                      else toast.error(getUserFriendlyError(error));
                                    } finally {
                                      setConfirmDeleteRuleId(null);
                                    }
                                  }}
                                  className="p-1 rounded-md text-white bg-red-500 hover:bg-red-600 transition-colors text-xs px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  aria-label="אשר מחיקת אוטומציה"
                                >
                                  מחק
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteRuleId(null)}
                                  className="p-1 rounded-md text-slate-500 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  aria-label="ביטול מחיקה"
                                >
                                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteRuleId(rule.id)}
                                className="p-1.5 rounded-md text-red-500 hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                title="מחק"
                                aria-label="מחק אוטומציה"
                              >
                                <Trash2 className="w-4 h-4" aria-hidden="true" />
                              </button>
                            )}
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
                <h2 className="font-semibold leading-none tracking-tight text-lg">ערוצי שליחה</h2>
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
                <h2 className="font-semibold leading-none tracking-tight text-lg">תוכן ההודעות</h2>
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

            {/* Trigger Config */}
            <Card>
              <CardHeader>
                <h2 className="font-semibold leading-none tracking-tight text-lg">תזמון והצעה</h2>
                <CardDescription>מתי לפנות ללקוח ומה להציע לו?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>שלח תזכורת</Label>
                    <Select
                      value={config.daysBeforeExpiry}
                      onValueChange={(val) =>
                        setConfig({ ...config, daysBeforeExpiry: val })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="60">60 יום לפני הסיום</SelectItem>
                        <SelectItem value="30">30 יום לפני הסיום</SelectItem>
                        <SelectItem value="14">14 יום לפני הסיום</SelectItem>
                        <SelectItem value="7">7 ימים לפני הסיום</SelectItem>
                        <SelectItem value="1">ביום הסיום</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>תמריץ לחידוש מוקדם</Label>
                    <div className="flex gap-2">
                      <Select
                        value={config.offerType}
                        onValueChange={(val) =>
                          setConfig({ ...config, offerType: val })
                        }
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="discount">הנחה (%)</SelectItem>
                          <SelectItem value="bonus">חודשיים מתנה</SelectItem>
                          <SelectItem value="upgrade">שדרוג חבילה</SelectItem>
                        </SelectContent>
                      </Select>
                      {config.offerType === "discount" && (
                        <Input
                          type="number"
                          placeholder="%"
                          value={config.offerValue}
                          onChange={(e) =>
                            setConfig({ ...config, offerValue: e.target.value })
                          }
                          className="w-20"
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-sm text-orange-800">
                    <strong>שים לב:</strong> לפי הנתונים שלך, 40% מהלקוחות
                    מחדשים ב-30 הימים האחרונים. מומלץ להתחיל את התהליך מוקדם.
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* Preview Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-8 space-y-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                תצוגה מקדימה
              </h3>
              <div className="border border-slate-200 bg-white rounded-[2.5rem] p-3 shadow-xl max-w-[320px] mx-auto" aria-hidden="true">
                <div className="bg-slate-50 rounded-[2rem] h-[550px] overflow-hidden border border-slate-100 relative">
                  <div className="h-6 bg-white flex justify-between items-center px-4 text-[10px] text-slate-800 font-medium">
                    <span>09:41</span>
                    <div className="flex gap-1">
                      <span>📶</span>
                      <span>🔋</span>
                    </div>
                  </div>
                  <div className="p-4 space-y-4 h-full overflow-y-auto pb-12">
                    {config.channels.sms && getActiveMessage(config.messages)?.smsBody && (
                      <div className="space-y-1">
                        <div className="text-[10px] text-slate-400 font-medium px-1">SMS</div>
                        <div className="p-3 rounded-xl shadow-sm text-xs text-slate-800 max-w-[85%] bg-slate-100">
                          {getActiveMessage(config.messages)!.smsBody.replace(/\{first_name\}/g, "ישראל")}
                          <div className="text-[9px] text-slate-400 text-left mt-1">09:00</div>
                        </div>
                      </div>
                    )}
                    {config.channels.whatsappGreen && getActiveMessage(config.messages)?.whatsappGreenBody && (
                      <div className="space-y-1">
                        <div className="text-[10px] text-green-600 font-medium px-1">WhatsApp (Green API)</div>
                        <div className="p-3 rounded-tr-xl rounded-tl-xl rounded-bl-xl shadow-sm text-xs text-slate-800 ml-auto max-w-[85%] bg-[#DCF8C6]">
                          {getActiveMessage(config.messages)!.whatsappGreenBody.replace(/\{first_name\}/g, "ישראל")}
                          <div className="text-[9px] text-slate-400 text-left mt-1">09:00</div>
                        </div>
                      </div>
                    )}
                    {config.channels.whatsappCloud && getActiveMessage(config.messages)?.whatsappCloudTemplateName && (
                      <div className="space-y-1">
                        <div className="text-[10px] text-blue-600 font-medium px-1">WhatsApp (Cloud API)</div>
                        <div className="p-3 rounded-tr-xl rounded-tl-xl rounded-bl-xl shadow-sm text-xs text-slate-800 ml-auto max-w-[85%] bg-blue-50 border border-blue-100">
                          <div className="font-medium mb-1">Template: {getActiveMessage(config.messages)!.whatsappCloudTemplateName}</div>
                          <div className="text-[10px] text-blue-500">שפה: {getActiveMessage(config.messages)!.whatsappCloudLanguageCode}</div>
                        </div>
                      </div>
                    )}
                    {config.channels.email && getActiveMessage(config.messages)?.emailBody && (
                      <div className="space-y-1">
                        <div className="text-[10px] text-purple-600 font-medium px-1">Email</div>
                        <div className="p-3 rounded-xl shadow-sm text-xs text-slate-800 max-w-[85%] bg-purple-50 border border-purple-100">
                          <div className="font-medium mb-1">{getActiveMessage(config.messages)!.emailSubject?.replace(/\{first_name\}/g, "ישראל") || "ללא נושא"}</div>
                          <div>{getActiveMessage(config.messages)!.emailBody.replace(/\{first_name\}/g, "ישראל").slice(0, 100)}{getActiveMessage(config.messages)!.emailBody.length > 100 ? "..." : ""}</div>
                        </div>
                      </div>
                    )}
                    {!config.channels.sms && !config.channels.whatsappGreen && !config.channels.whatsappCloud && !config.channels.email && (
                      <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm">
                        <RefreshCw className="w-8 h-8 mb-2 opacity-30" aria-hidden="true" />
                        בחר ערוץ שליחה כדי לראות תצוגה מקדימה
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Details Popup */}
      <Dialog open={!!selectedCustomer} onOpenChange={(open) => { if (!open) { setSelectedCustomer(null); setEditingCustomer(null); setConfirmingDelete(false); } }}>
        <DialogContent className="max-w-sm p-5" dir="rtl">
          <DialogHeader>
            <DialogTitle className="sr-only">{selectedCustomer?.name ?? "פרטי לקוח"}</DialogTitle>
            <DialogDescription className="sr-only">צפייה ועריכת פרטי לקוח</DialogDescription>
          </DialogHeader>
          {selectedCustomer && (<>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-cyan-100 text-cyan-600 flex items-center justify-center text-lg font-bold">
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
              {!editingCustomer && selectedCustomer && (
                <button
                  onClick={() => setEditingCustomer({ ...selectedCustomer })}
                  className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title="ערוך"
                  aria-label="ערוך פרטי לקוח"
                >
                  <Pencil className="w-4 h-4 text-slate-600" aria-hidden="true" />
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
                        <Mail className="w-4 h-4 text-blue-600" aria-hidden="true" />
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
                      className={`p-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        editingCustomer.emailActive
                          ? "text-green-600 hover:bg-green-50"
                          : "text-slate-400 hover:bg-slate-100"
                      }`}
                      aria-label={editingCustomer.emailActive ? "השבת אימייל" : "הפעל אימייל"}
                    >
                      {editingCustomer.emailActive ? (
                        <ToggleRight className="w-6 h-6" aria-hidden="true" />
                      ) : (
                        <ToggleLeft className="w-6 h-6" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                )}

                {editingCustomer.phone && (
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center">
                        <Phone className="w-4 h-4 text-green-600" aria-hidden="true" />
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
                      className={`p-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        editingCustomer.phoneActive
                          ? "text-green-600 hover:bg-green-50"
                          : "text-slate-400 hover:bg-slate-100"
                      }`}
                      aria-label={editingCustomer.phoneActive ? "השבת טלפון" : "הפעל טלפון"}
                    >
                      {editingCustomer.phoneActive ? (
                        <ToggleRight className="w-6 h-6" aria-hidden="true" />
                      ) : (
                        <ToggleLeft className="w-6 h-6" aria-hidden="true" />
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
                      <Mail className="w-4 h-4 text-blue-600" aria-hidden="true" />
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
                      <Phone className="w-4 h-4 text-green-600" aria-hidden="true" />
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
                      <Clock className="w-4 h-4 text-orange-600" aria-hidden="true" />
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
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                      מחק מהרשימה
                    </button>
                  )}
                </div>
              </>
            )}
          </>)}
        </DialogContent>
      </Dialog>
      <NurtureQueuePanel batchId={activeBatchId} onClose={() => setActiveBatchId(null)} />
      <NurtureAutoSendQueue slug="renewal" trigger={autoSendQueueTrigger} />
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
    </main>
  );
}
