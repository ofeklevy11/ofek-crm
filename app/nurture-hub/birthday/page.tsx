"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Gift,
  Save,
  Clock,
  AlertCircle,
  Zap,
  Phone,
  X,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Loader2,
  Send,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getFriendlyResultError, getUserFriendlyError } from "@/lib/errors";
import { toast } from "sonner";
import { showAlert, showConfirm } from "@/hooks/use-modal";
import { isRateLimitError, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit-utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import NurtureMessageEditor, { migrateConfigMessages, getActiveMessage, NurtureMessage } from "@/components/nurture/NurtureMessageEditor";
import NurtureTriggerInfo from "@/components/nurture/NurtureTriggerInfo";
import NurtureAutomationPreview from "@/components/nurture/NurtureAutomationPreview";
import { useNurtureQuota } from "@/components/nurture/NurtureQuotaContext";
import NurtureQuotaBadge from "@/components/nurture/NurtureQuotaBadge";
import NurtureQueuePanel from "@/components/nurture/NurtureQueuePanel";
import NurtureSendConfirmDialog, { type ChannelSelection, type BulkCustomer } from "@/components/nurture/NurtureSendConfirmDialog";
import NurtureSubscriberSearch from "@/components/nurture/NurtureSubscriberSearch";
import NurtureCustomerGrid from "@/components/nurture/NurtureCustomerGrid";
import { useNurtureSubscribers } from "@/hooks/useNurtureSubscribers";
import { BIRTHDAY_SMART_FIELDS } from "@/lib/nurture-fields";
import type { NurtureSubscriberResult } from "../actions";
import {
  getNurtureRules,
  updateNurtureSubscriber,
  deleteNurtureSubscriber,
  deleteNurtureSubscribers,
  getDataSources,
  getTableFields,
  DataSource,
  FieldDefinition,
  saveNurtureConfig,
  getNurtureConfig,
  getAvailableChannels,
  sendNurtureCampaign,
} from "../actions";
import {
  deleteAutomationRule,
  toggleAutomationRule,
  updateAutomationRule,
} from "@/app/actions/automations";

// Since Tabs might not be in the listed files (I didn't see tabs.tsx), I'll implement a simple one or just check quickly.
// Ah, I didn't see tabs.tsx in the list. I'll use state for tabs.

export default function BirthdayAutomationPage() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isAutoModalOpen, setIsAutoModalOpen] = useState(false);
  const [rules, setRules] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<NurtureSubscriberResult | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<NurtureSubscriberResult | null>(null);

  // Tables and editing state
  const [tables, setTables] = useState<DataSource[]>([]);
  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [editStep, setEditStep] = useState(1);
  const [editConfig, setEditConfig] = useState({
    trigger: "record_created",
    tableId: "",
    fields: { name: "", email: "", phone: "", triggerDate: "" },
    condition: { field: "", fromValue: "", toValue: "" },
  });
  const [tableFields, setTableFields] = useState<FieldDefinition[]>([]);
  const [fetchingFields, setFetchingFields] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Hook for subscribers with pagination/search
  const {
    customers, total, hasMore, isLoading, isLoadingMore,
    lastSentMap, selectedCustomerIds,
    search, filters, setSearch, setFilters,
    toggleCustomerSelection, toggleAllCustomers,
    loadMore, refreshData,
  } = useNurtureSubscribers("birthday");

  // Helper to get table name from ID
  const getTableName = (tableId: string) => {
    const table = tables.find((t) => t.id === tableId);
    return table?.name || `טבלה ${tableId}`;
  };

  const refreshRules = () => {
    getNurtureRules("birthday").then((r) => {
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

  // Load fields when editing rule table changes
  useEffect(() => {
    if (!editConfig.tableId) return;
    if (isNaN(parseInt(editConfig.tableId))) {
      setTableFields([]);
      return;
    }
    const loadFields = async () => {
      setFetchingFields(true);
      try {
        const fields = await getTableFields(editConfig.tableId);
        setTableFields(fields);
      } catch (e) {
        console.error(e);
        toast.error(getUserFriendlyError(e));
      } finally {
        setFetchingFields(false);
      }
    };
    loadFields();
  }, [editConfig.tableId]);

  useEffect(() => {
    refreshRules();
  }, []);

  const handleAddCustomers = () => {
    refreshData();
  };

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

  // Form State
  const [config, setConfig] = useState({
    channels: {
      sms: false,
      whatsappGreen: false,
      whatsappCloud: false,
    },
    timing: "09:00",
    messages: [{
      id: "msg_default",
      name: "הודעה ראשית",
      isActive: true,
      smsBody: "מזל טוב {first_name}! 🎂 פינוק ליום ההולדת מחכה לך אצלנו: 15% הנחה בהצגת הודעה זו. תוקף: 7 ימים.",
      whatsappGreenBody: "מזל טוב {first_name}! 🎂🎉\nפינוק ליום ההולדת מחכה לך אצלנו: 15% הנחה!\nתוקף: 7 ימים.",
      whatsappCloudTemplateName: "",
      whatsappCloudLanguageCode: "he",
    }] as NurtureMessage[],
    offerType: "percentage",
    offerValue: "15",
  });

  // Load saved config and available channels on mount
  useEffect(() => {
    getNurtureConfig("birthday").then((saved) => {
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
      const result = await saveNurtureConfig("birthday", config, isEnabled);
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
      const result = await sendNurtureCampaign("birthday", undefined, channels, subscriberIds);
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
      const result = await sendNurtureCampaign("birthday", customer.id, selectedChannels);
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
        {/* Breadcrumb / Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/nurture-hub"
            className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:border-indigo-100 transition-all"
          >
            <ArrowRight className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Gift className="w-8 h-8 text-pink-500" />
              אוטומציית יום הולדת
            </h1>
            <p className="text-slate-500">
              נהל את הברכות וההטבות שנשלחות ללקוחות ביום הולדתם
            </p>
          </div>
          <div className="mr-auto flex items-center gap-3">
            <NurtureQuotaBadge />
            <div className="flex items-center gap-2 border rounded-lg px-3 py-1.5">
              <Label htmlFor="birthday-enabled" className="text-sm text-slate-600 cursor-pointer">
                {isEnabled ? "פעיל" : "כבוי"}
              </Label>
              <Switch
                id="birthday-enabled"
                checked={isEnabled}
                onCheckedChange={setIsEnabled}
              />
            </div>
            <Button
              onClick={handleSendNow}
              disabled={sending || customers.length === 0 || (!config.channels.sms && !config.channels.whatsappGreen && !config.channels.whatsappCloud)}
              className="bg-pink-600 hover:bg-pink-700 gap-2"
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

        <NurtureTriggerInfo slug="birthday" />
        <NurtureAutomationPreview
          slug="birthday"
          channels={config.channels}
          messages={config.messages}
          timing="cron"
          customerCount={total}
          isEnabled={isEnabled}
          accentColor="pink"
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Col: Configuration */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer List Management */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex justify-between items-center">
                  <span>רשימת לקוחות ({total})</span>
                  <CustomerListManager
                    onAddCustomers={handleAddCustomers}
                    listSlug="birthday"
                    automationOpenProp={isAutoModalOpen}
                    onAutomationOpenChangeProp={setIsAutoModalOpen}
                  />
                </CardTitle>
                <CardDescription>
                  נהל את רשימת הלקוחות שיקבלו את הברכה
                </CardDescription>
              </CardHeader>
              <CardContent>
                <NurtureSubscriberSearch
                  smartFields={BIRTHDAY_SMART_FIELDS}
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
                    label: "תאריך",
                    render: (c) =>
                      c.triggerDate ? (
                        new Date(c.triggerDate).toLocaleDateString("he-IL")
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 font-medium">
                          חסר תאריך
                        </span>
                      ),
                  }}
                  accentColor="pink"
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
                <CardDescription>בחר היכן הלקוח יקבל את הברכה</CardDescription>
              </CardHeader>
              <CardContent>
                <NurtureChannelSelector
                  channels={config.channels}
                  onChange={(channels) => setConfig({ ...config, channels })}
                  availableChannels={availableChannels}
                />
              </CardContent>
            </Card>

            {/* Automation Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">הגדרות תוכן ותזמון</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>שעת שליחה</Label>
                    <div className="relative">
                      <Clock className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
                      <Input
                        type="time"
                        value={config.timing}
                        onChange={(e) =>
                          setConfig({ ...config, timing: e.target.value })
                        }
                        className="pr-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>סוג הטבה</Label>
                    <Select
                      value={config.offerType}
                      onValueChange={(val) =>
                        setConfig({ ...config, offerType: val })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">
                          אחוז הנחה (%)
                        </SelectItem>
                        <SelectItem value="fixed">סכום קבוע (₪)</SelectItem>
                        <SelectItem value="gift">מתנה חינם</SelectItem>
                        <SelectItem value="none">ללא הטבה</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
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
                  placeholders={["{first_name}", "{coupon_code}"]}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right Col: Live Preview */}
          <div className="lg:col-span-1">
            <div className="sticky top-8 space-y-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                תצוגה מקדימה
              </h3>

              {/* Phone Preview */}
              <div className="border border-slate-200 bg-white rounded-[2.5rem] p-3 shadow-xl max-w-[320px] mx-auto">
                <div className="bg-slate-50 rounded-[2rem] h-[550px] overflow-hidden border border-slate-100 relative">
                  {/* Status Bar Mock */}
                  <div className="h-6 bg-white flex justify-between items-center px-4 text-[10px] text-slate-800 font-medium">
                    <span>09:41</span>
                    <div className="flex gap-1">
                      <span>📶</span>
                      <span>🔋</span>
                    </div>
                  </div>

                  {/* App Content Mock */}
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

                    {!config.channels.sms && !config.channels.whatsappGreen && !config.channels.whatsappCloud && (
                      <div className="flex items-center justify-center h-20 text-xs text-slate-400">
                        בחר ערוץ לתצוגה מקדימה
                      </div>
                    )}

                    {config.offerType !== "none" && (
                      <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-center">
                        <div className="text-xs text-indigo-800 font-medium mb-1">
                          {config.offerType === "percentage"
                            ? `${config.offerValue}% הנחה`
                            : config.offerType === "fixed"
                            ? `₪${config.offerValue} מתנה`
                            : "מתנה מיוחדת"}
                        </div>
                        <div className="text-lg font-bold tracking-widest text-indigo-600 bg-white inline-block px-3 py-1 rounded border border-indigo-200 border-dashed">
                          BDAY15
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <strong>טיפ:</strong> הודעות יום הולדת עם קופון אישי משיגות את
                  אחוזי ההמרה הגבוהים ביותר (כ-25% בממוצע).
                </div>
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

                {/* Name */}
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">שם</Label>
                  <Input
                    value={editingCustomer.name}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>

                {/* Phone */}
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

                {/* Email */}
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

                {/* Trigger Date */}
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

                {/* Email Toggle */}
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

                {/* Phone Toggle */}
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

                {/* Warning if both disabled */}
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

      {/* Edit Rule Dialog */}
      <Dialog
        open={!!editingRule}
        onOpenChange={(open) => !open && setEditingRule(null)}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader className="text-right">
            <DialogTitle>עריכת חוק אוטומציה</DialogTitle>
            <DialogDescription>ערוך את הגדרות החוק</DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-6">
            {/* Step 1: Trigger & Source */}
            {editStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>מתי להוסיף לקוח?</Label>
                  <Tabs
                    value={editConfig.trigger}
                    onValueChange={(val) =>
                      setEditConfig({ ...editConfig, trigger: val })
                    }
                    dir="rtl"
                  >
                    <TabsList className="w-full grid grid-cols-2">
                      <TabsTrigger value="record_created">
                        כשנוצרת רשומה חדשה
                      </TabsTrigger>
                      <TabsTrigger value="status_changed">
                        כשסטטוס משתנה
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <div className="space-y-2">
                  <Label>מקור הנתונים (טבלה)</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={editConfig.tableId}
                    onChange={(e) =>
                      setEditConfig({ ...editConfig, tableId: e.target.value })
                    }
                  >
                    <option value="" disabled>
                      בחר טבלה...
                    </option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Step 2: Conditions & Mapping */}
            {editStep === 2 && (
              <div className="space-y-4">
                {fetchingFields ? (
                  <div className="text-center py-8 text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    טוען שדות...
                  </div>
                ) : (
                  <>
                    {editConfig.trigger === "status_changed" && (
                      <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg space-y-3">
                        <Label className="text-amber-900">
                          תנאי הוספה (שינוי סטטוס)
                        </Label>

                        <div className="space-y-1">
                          <Label className="text-xs text-amber-800">
                            שדה הסטטוס
                          </Label>
                          <select
                            className="w-full h-9 rounded-md border border-amber-200 bg-white px-2 text-sm"
                            value={editConfig.condition.field}
                            onChange={(e) =>
                              setEditConfig({
                                ...editConfig,
                                condition: {
                                  ...editConfig.condition,
                                  field: e.target.value,
                                },
                              })
                            }
                          >
                            <option value="">בחר שדה סטטוס...</option>
                            {tableFields
                              .filter(
                                (f) =>
                                  f.type === "select" ||
                                  f.type === "singleSelect" ||
                                  f.type === "status" ||
                                  f.type === "multiSelect"
                              )
                              .map((f) => (
                                <option key={f.key} value={f.key}>
                                  {f.name}
                                </option>
                              ))}
                          </select>
                        </div>

                        {editConfig.condition.field && (
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs text-amber-800">
                                מסטטוס (קודם)
                              </Label>
                              <select
                                className="w-full h-9 rounded-md border border-amber-200 bg-white px-2 text-sm"
                                value={editConfig.condition.fromValue}
                                onChange={(e) =>
                                  setEditConfig({
                                    ...editConfig,
                                    condition: {
                                      ...editConfig.condition,
                                      fromValue: e.target.value,
                                    },
                                  })
                                }
                              >
                                <option value="">כל סטטוס...</option>
                                {tableFields
                                  .find(
                                    (f) => f.key === editConfig.condition.field
                                  )
                                  ?.options?.map((opt: any) => {
                                    const val =
                                      typeof opt === "string"
                                        ? opt
                                        : opt.label || opt.name || opt.value;
                                    const id =
                                      typeof opt === "string"
                                        ? opt
                                        : opt.id || opt.value || opt.name;
                                    return (
                                      <option key={id} value={id}>
                                        {val}
                                      </option>
                                    );
                                  })}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-amber-800">
                                לסטטוס (חדש)
                              </Label>
                              <select
                                className="w-full h-9 rounded-md border border-amber-200 bg-white px-2 text-sm"
                                value={editConfig.condition.toValue}
                                onChange={(e) =>
                                  setEditConfig({
                                    ...editConfig,
                                    condition: {
                                      ...editConfig.condition,
                                      toValue: e.target.value,
                                    },
                                  })
                                }
                              >
                                <option value="">בחר יעד...</option>
                                {tableFields
                                  .find(
                                    (f) => f.key === editConfig.condition.field
                                  )
                                  ?.options?.map((opt: any) => {
                                    const val =
                                      typeof opt === "string"
                                        ? opt
                                        : opt.label || opt.name || opt.value;
                                    const id =
                                      typeof opt === "string"
                                        ? opt
                                        : opt.id || opt.value || opt.name;
                                    return (
                                      <option key={id} value={id}>
                                        {val}
                                      </option>
                                    );
                                  })}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-3">
                      <Label>מיפוי שדות (איזה מידע לשמור?)</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500">
                            שדה שם
                          </Label>
                          <select
                            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                            value={editConfig.fields.name}
                            onChange={(e) =>
                              setEditConfig({
                                ...editConfig,
                                fields: {
                                  ...editConfig.fields,
                                  name: e.target.value,
                                },
                              })
                            }
                          >
                            <option value="">בחר שדה...</option>
                            {tableFields
                              .filter(
                                (f) =>
                                  f.type === "text" ||
                                  f.name.includes("שם") ||
                                  f.name.toLowerCase().includes("name")
                              )
                              .map((f) => (
                                <option key={f.key} value={f.key}>
                                  {f.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500">
                            שדה אימייל (אופציונלי אם נבחר טלפון)
                          </Label>
                          <select
                            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                            value={editConfig.fields.email}
                            onChange={(e) =>
                              setEditConfig({
                                ...editConfig,
                                fields: {
                                  ...editConfig.fields,
                                  email: e.target.value,
                                },
                              })
                            }
                          >
                            <option value="">בחר שדה...</option>
                            {tableFields
                              .filter(
                                (f) =>
                                  f.type === "email" ||
                                  f.type === "text" ||
                                  f.name.includes("מייל")
                              )
                              .map((f) => (
                                <option key={f.key} value={f.key}>
                                  {f.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500">
                            שדה טלפון (אופציונלי אם נבחר אימייל)
                          </Label>
                          <select
                            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                            value={editConfig.fields.phone}
                            onChange={(e) =>
                              setEditConfig({
                                ...editConfig,
                                fields: {
                                  ...editConfig.fields,
                                  phone: e.target.value,
                                },
                              })
                            }
                          >
                            <option value="">בחר שדה...</option>
                            {tableFields
                              .filter(
                                (f) =>
                                  f.type === "phone" ||
                                  f.type === "text" ||
                                  f.name.includes("פון") ||
                                  f.name.includes("נייד")
                              )
                              .map((f) => (
                                <option key={f.key} value={f.key}>
                                  {f.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500">
                            תאריך יום הולדת
                          </Label>
                          <select
                            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                            value={editConfig.fields.triggerDate}
                            onChange={(e) =>
                              setEditConfig({
                                ...editConfig,
                                fields: {
                                  ...editConfig.fields,
                                  triggerDate: e.target.value,
                                },
                              })
                            }
                          >
                            <option value="">בחר שדה...</option>
                            <option value="__createdAt">תאריך יצירה (מערכת)</option>
                            <option value="__updatedAt">תאריך עדכון (מערכת)</option>
                            {tableFields
                              .filter(
                                (f) =>
                                  f.type === "date" ||
                                  f.type === "text" ||
                                  f.name.includes("תאריך") ||
                                  f.name.toLowerCase().includes("date")
                              )
                              .map((f) => (
                                <option key={f.key} value={f.key}>
                                  {f.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            {editStep === 1 ? (
              <Button
                onClick={() => setEditStep(2)}
                disabled={!editConfig.tableId}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                המשך לשלב הבא
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setEditStep(1)}>
                  חזור
                </Button>
                <Button
                  onClick={async () => {
                    if (
                      !editConfig.fields.name ||
                      (!editConfig.fields.email && !editConfig.fields.phone)
                    ) {
                      showAlert(
                        "חובה לבחור שדה שם ולפחות אמצעי קשר אחד (מייל או טלפון)"
                      );
                      return;
                    }

                    setIsSaving(true);
                    try {
                      const result = await updateAutomationRule(
                        editingRule.id,
                        {
                          name: editingRule.name,
                          triggerType:
                            editConfig.trigger === "record_created"
                              ? "NEW_RECORD"
                              : "RECORD_FIELD_CHANGE",
                          triggerConfig: {
                            tableId: editConfig.tableId,
                            columnId:
                              editConfig.trigger === "status_changed"
                                ? editConfig.condition.field
                                : undefined,
                            fromValue:
                              editConfig.trigger === "status_changed"
                                ? editConfig.condition.fromValue
                                : undefined,
                            toValue:
                              editConfig.trigger === "status_changed"
                                ? editConfig.condition.toValue
                                : undefined,
                          },
                          actionType: "ADD_TO_NURTURE_LIST",
                          actionConfig: {
                            listId: "birthday",
                            mapping: {
                              name: editConfig.fields.name,
                              email: editConfig.fields.email,
                              phone: editConfig.fields.phone,
                              ...(editConfig.fields.triggerDate
                                ? { triggerDate: editConfig.fields.triggerDate }
                                : {}),
                            },
                          },
                        }
                      );

                      if (result.success) {
                        setEditingRule(null);
                        refreshData();
                      } else {
                        toast.error(getFriendlyResultError(result.error, "שגיאה בעדכון האוטומציה"));
                      }
                    } catch (error) {
                      toast.error(getUserFriendlyError(error));
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  className="bg-green-600 hover:bg-green-700"
                  disabled={
                    !editConfig.fields.name ||
                    (!editConfig.fields.email && !editConfig.fields.phone) ||
                    isSaving ||
                    (editConfig.trigger === "status_changed" &&
                      !editConfig.condition.toValue)
                  }
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                      שומר...
                    </>
                  ) : (
                    "שמור שינויים"
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
