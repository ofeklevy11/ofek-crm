"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Gift,
  Save,
  MessageSquare,
  Mail,
  Smartphone,
  Clock,
  CheckCircle2,
  AlertCircle,
  Zap,
  User,
  Phone,
  X,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Pencil,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  getNurtureSubscribers,
  getNurtureRules,
  updateNurtureSubscriber,
  deleteNurtureSubscriber,
  getDataSources,
  getTableFields,
  DataSource,
  FieldDefinition,
} from "../actions";
import {
  deleteAutomationRule,
  toggleAutomationRule,
  updateAutomationRule,
} from "@/app/actions/automations";

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
}

// Since Tabs might not be in the listed files (I didn't see tabs.tsx), I'll implement a simple one or just check quickly.
// Ah, I didn't see tabs.tsx in the list. I'll use state for tabs.

export default function BirthdayAutomationPage() {
  const [activeTab, setActiveTab] = useState("content");
  const [isEnabled, setIsEnabled] = useState(false);
  const [isAutoModalOpen, setIsAutoModalOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Tables and editing state
  const [tables, setTables] = useState<DataSource[]>([]);
  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [editStep, setEditStep] = useState(1);
  const [editConfig, setEditConfig] = useState({
    trigger: "record_created",
    tableId: "",
    fields: { name: "", email: "", phone: "" },
    condition: { field: "", fromValue: "", toValue: "" },
  });
  const [tableFields, setTableFields] = useState<FieldDefinition[]>([]);
  const [fetchingFields, setFetchingFields] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Helper to get table name from ID
  const getTableName = (tableId: string) => {
    const table = tables.find((t) => t.id === tableId);
    return table?.name || `טבלה ${tableId}`;
  };

  const refreshData = () => {
    getNurtureSubscribers("birthday").then((subs) => {
      setCustomers(
        subs.map((s) => ({
          ...s,
          sourceTableName: s.sourceTableName || undefined,
        }))
      );
    });
    getNurtureRules("birthday").then((r) => {
      setRules(r);
    });
  };

  // Load tables on mount
  useEffect(() => {
    getDataSources().then((sources) => {
      setTables(sources.filter((s) => s.type === "table"));
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
      } finally {
        setFetchingFields(false);
      }
    };
    loadFields();
  }, [editConfig.tableId]);

  useEffect(() => {
    refreshData();
  }, []);

  const handleAddCustomers = (newCustomers: any[]) => {
    // Refresh from DB to get the latest
    refreshData();
  };

  // Form State
  const [config, setConfig] = useState({
    channels: {
      email: true,
      sms: false,
      whatsapp: false,
    },
    timing: "09:00",
    emailSubject: "מזל טוב ליום הולדתך! 🎁",
    emailBody:
      "היי {first_name},\n\nיום הולדת שמח! 🎉\nאנחנו רוצים לחגוג איתך את היום המיוחד ולכן הכנו לך מתנה קטנה...\n\nיש לך 15% הנחה לקנייה הבאה שלך!\nקוד קופון: BDAY15\n\nבאהבה,\nצוות העסק",
    smsBody:
      "מזל טוב {first_name}! 🎂 פינוק ליום ההולדת מחכה לך אצלנו: 15% הנחה בהצגת הודעה זו. תוקף: 7 ימים.",
    offerType: "percentage", // percentage, fixed, gift
    offerValue: "15",
  });

  const handleSave = () => {
    // In a real app this would call an API
    console.log("Saving config:", config, isEnabled);
    alert("ההגדרות נשמרו בהצלחה (דמו)");
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
            <div className="bg-slate-100 text-slate-500 px-3 py-1.5 rounded-full text-sm font-medium border border-slate-200 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              בקרוב...
            </div>
          </div>
        </div>

        {/* Coming Soon Overlay */}
        <div className="absolute inset-0 z-50 flex items-start justify-center pt-40 pointer-events-none">
          <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl shadow-2xl border border-indigo-100 text-center max-w-sm mx-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Clock className="w-6 h-6 text-indigo-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">בקרוב...</h3>
            <p className="text-sm text-slate-500">מודול זה נמצא בפיתוח</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 grayscale opacity-50 pointer-events-none select-none">
          {/* Left Col: Configuration */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer List Management */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex justify-between items-center">
                  <span>רשימת לקוחות ({customers.length})</span>
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
                {customers.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed text-sm">
                    עדיין אין לקוחות ברשימה. לחץ על "הוסף לקוחות" כדי להתחיל.
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 border-b text-xs font-medium text-slate-500">
                      <div className="col-span-4">שם</div>
                      <div className="col-span-4">פרטי קשר</div>
                      <div className="col-span-4">מקור</div>
                    </div>
                    {/* List */}
                    <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-100">
                      {customers.map((c, i) => (
                        <div
                          key={i}
                          className="grid grid-cols-12 gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer transition-colors group"
                          onClick={() => setSelectedCustomer(c)}
                        >
                          <div className="col-span-4 flex items-center gap-2 overflow-hidden">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">
                              {c.name.slice(0, 2)}
                            </div>
                            <span className="text-sm font-medium text-slate-900 truncate">
                              {c.name}
                            </span>
                          </div>
                          <div className="col-span-4 flex items-center text-xs text-slate-600 truncate">
                            {c.email || c.phone || "—"}
                          </div>
                          <div className="col-span-4 flex items-center gap-1.5">
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
                        </div>
                      ))}
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
                                await toggleAutomationRule(
                                  rule.id,
                                  !rule.isActive
                                );
                                refreshData();
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
                                if (confirm("האם למחוק את חוק האוטומציה?")) {
                                  await deleteAutomationRule(rule.id);
                                  refreshData();
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
              <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div
                  className={cn(
                    "cursor-pointer border rounded-xl p-4 flex flex-col items-center gap-3 transition-all",
                    config.channels.email
                      ? "border-indigo-500 bg-indigo-50/50"
                      : "border-slate-200 hover:border-slate-300"
                  )}
                  onClick={() =>
                    setConfig({
                      ...config,
                      channels: {
                        ...config.channels,
                        email: !config.channels.email,
                      },
                    })
                  }
                >
                  <div
                    className={cn(
                      "p-2 rounded-full",
                      config.channels.email
                        ? "bg-indigo-100 text-indigo-600"
                        : "bg-slate-100 text-slate-400"
                    )}
                  >
                    <Mail className="w-5 h-5" />
                  </div>
                  <span className="font-medium text-sm">אימייל</span>
                  {config.channels.email && (
                    <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                  )}
                </div>

                <div
                  className={cn(
                    "cursor-pointer border rounded-xl p-4 flex flex-col items-center gap-3 transition-all",
                    config.channels.sms
                      ? "border-pink-500 bg-pink-50/50"
                      : "border-slate-200 hover:border-slate-300"
                  )}
                  onClick={() =>
                    setConfig({
                      ...config,
                      channels: {
                        ...config.channels,
                        sms: !config.channels.sms,
                      },
                    })
                  }
                >
                  <div
                    className={cn(
                      "p-2 rounded-full",
                      config.channels.sms
                        ? "bg-pink-100 text-pink-600"
                        : "bg-slate-100 text-slate-400"
                    )}
                  >
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <span className="font-medium text-sm">SMS</span>
                  {config.channels.sms && (
                    <CheckCircle2 className="w-4 h-4 text-pink-600" />
                  )}
                </div>

                <div
                  className={cn(
                    "cursor-pointer border rounded-xl p-4 flex flex-col items-center gap-3 transition-all",
                    config.channels.whatsapp
                      ? "border-green-500 bg-green-50/50"
                      : "border-slate-200 hover:border-slate-300"
                  )}
                  onClick={() =>
                    setConfig({
                      ...config,
                      channels: {
                        ...config.channels,
                        whatsapp: !config.channels.whatsapp,
                      },
                    })
                  }
                >
                  <div
                    className={cn(
                      "p-2 rounded-full",
                      config.channels.whatsapp
                        ? "bg-green-100 text-green-600"
                        : "bg-slate-100 text-slate-400"
                    )}
                  >
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <span className="font-medium text-sm">WhatsApp</span>
                  {config.channels.whatsapp && (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  )}
                </div>
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
              <CardHeader className="pb-3 border-b border-slate-100">
                <div className="flex gap-4">
                  <button
                    onClick={() => setActiveTab("content")}
                    className={cn(
                      "text-sm font-medium pb-3 -mb-3 border-b-2 transition-colors",
                      activeTab === "content"
                        ? "border-indigo-600 text-indigo-600"
                        : "border-transparent text-slate-500"
                    )}
                  >
                    עריכת תוכן
                  </button>
                  <button
                    onClick={() => setActiveTab("design")}
                    className={cn(
                      "text-sm font-medium pb-3 -mb-3 border-b-2 transition-colors",
                      activeTab === "design"
                        ? "border-indigo-600 text-indigo-600"
                        : "border-transparent text-slate-500"
                    )}
                  >
                    עיצוב (HTML)
                  </button>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                {config.channels.email && (
                  <div className="space-y-4">
                    <h3 className="font-medium flex items-center gap-2 text-indigo-700">
                      <Mail className="w-4 h-4" />
                      תוכן האימייל
                    </h3>
                    <div className="space-y-2">
                      <Label>נושא המייל</Label>
                      <Input
                        value={config.emailSubject}
                        onChange={(e) =>
                          setConfig({ ...config, emailSubject: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>גוף ההודעה</Label>
                      <Textarea
                        rows={6}
                        value={config.emailBody}
                        onChange={(e) =>
                          setConfig({ ...config, emailBody: e.target.value })
                        }
                        className="font-mono text-sm leading-relaxed"
                      />
                      <div className="flex gap-2 text-xs text-slate-500">
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer hover:bg-slate-200">
                          {"{first_name}"}
                        </span>
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer hover:bg-slate-200">
                          {"{last_name}"}
                        </span>
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer hover:bg-slate-200">
                          {"{coupon_code}"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {(config.channels.sms || config.channels.whatsapp) && (
                  <>
                    <div className="border-t border-slate-100 my-4" />
                    <div className="space-y-4">
                      <h3 className="font-medium flex items-center gap-2 text-pink-700">
                        <MessageSquare className="w-4 h-4" />
                        תוכן SMS / WhatsApp
                      </h3>
                      <div className="space-y-2">
                        <Label>נושא ההודעה</Label>
                        <Textarea
                          rows={3}
                          value={config.smsBody}
                          onChange={(e) =>
                            setConfig({ ...config, smsBody: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </>
                )}
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
                    {config.channels.email ? (
                      <div className="bg-white p-4 rounded-xl shadow-sm space-y-3">
                        <div className="flex items-center gap-2 border-b border-slate-50 pb-2">
                          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xs font-bold">
                            L
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-900">
                              העסק שלנו
                            </div>
                            <div className="text-[10px] text-slate-500">
                              אל: ישראל ישראלי
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm font-bold text-slate-900">
                            {config.emailSubject}
                          </div>
                          <div className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                            {config.emailBody.replace("{first_name}", "ישראל")}
                          </div>
                        </div>
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
                    ) : (
                      <div className="flex items-center justify-center h-20 text-xs text-slate-400">
                        בחר אימייל לתצוגה מקדימה
                      </div>
                    )}

                    {(config.channels.sms || config.channels.whatsapp) && (
                      <div className="p-3 rounded-tr-xl rounded-tl-xl rounded-bl-xl shadow-sm text-xs text-slate-800 ml-auto max-w-[85%] relative bg-[#DCF8C6] self-end">
                        {config.smsBody.replace("{first_name}", "ישראל")}
                        <div className="text-[9px] text-slate-400 text-left mt-1">
                          09:00
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
              /* Edit Mode - Only channel preferences */
              <div className="space-y-4 border-t pt-4">
                <div className="text-sm text-slate-600 mb-2">
                  בחר אילו ערוצי תקשורת פעילים עבור לקוח זה:
                </div>

                {/* Email Toggle */}
                {selectedCustomer.email && (
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                        <Mail className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          אימייל
                        </div>
                        <div className="text-xs text-slate-500">
                          {selectedCustomer.email}
                        </div>
                      </div>
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
                {selectedCustomer.phone && (
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center">
                        <Phone className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          טלפון (SMS/WhatsApp)
                        </div>
                        <div className="text-xs text-slate-500">
                          {selectedCustomer.phone}
                        </div>
                      </div>
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
                      ⚠️ שים לב: שני ערוצי התקשורת מושבתים. הלקוח לא יקבל
                      הודעות.
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
                      const result = await updateNurtureSubscriber(
                        editingCustomer.id,
                        {
                          emailActive: editingCustomer.emailActive,
                          phoneActive: editingCustomer.phoneActive,
                        }
                      );
                      if (result.success) {
                        setEditingCustomer(null);
                        setSelectedCustomer(null);
                        refreshData();
                      } else {
                        alert(result.error || "שגיאה בשמירה");
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
                        confirm(
                          `האם למחוק את ${selectedCustomer.name} מהרשימה?`
                        )
                      ) {
                        const result = await deleteNurtureSubscriber(
                          selectedCustomer.id
                        );
                        if (result.success) {
                          setSelectedCustomer(null);
                          refreshData();
                        } else {
                          alert(result.error || "שגיאה במחיקה");
                        }
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

      {/* Edit Rule Dialog */}
      <Dialog
        open={!!editingRule}
        onOpenChange={(open) => !open && setEditingRule(null)}
      >
        <DialogContent className="sm:max-w-[500px]" dir="rtl">
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
                                  f.type === "singleSelect" ||
                                  f.type.toLowerCase().includes("status")
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
                      alert(
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
                            },
                          },
                        }
                      );

                      if (result.success) {
                        setEditingRule(null);
                        refreshData();
                      } else {
                        alert("שגיאה בעדכון האוטומציה: " + result.error);
                      }
                    } catch (error) {
                      console.error(error);
                      alert("שגיאה לא צפויה");
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
    </div>
  );
}
