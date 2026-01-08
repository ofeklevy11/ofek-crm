"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Share2,
  Save,
  Gift,
  CheckCircle2,
  Copy,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  getNurtureSubscribers,
  getNurtureRules,
  updateNurtureSubscriber,
  deleteNurtureSubscriber,
  getDataSources,
  DataSource,
} from "../actions";
import {
  deleteAutomationRule,
  toggleAutomationRule,
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
  createdAt?: Date;
}

export default function ReferralAutomationPage() {
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
    getNurtureSubscribers("referral").then((subs) => {
      setCustomers(
        subs.map((s) => ({
          ...s,
          sourceTableName: s.sourceTableName || undefined,
        }))
      );
    });
    getNurtureRules("referral").then((r) => {
      setRules(r);
    });
  };

  // Load tables on mount
  useEffect(() => {
    getDataSources().then((sources) => {
      setTables(sources.filter((s) => s.type === "table"));
    });
  }, []);

  useEffect(() => {
    refreshData();
  }, []);

  const handleAddCustomers = (newCustomers: any[]) => {
    refreshData();
  };

  const [isEnabled, setIsEnabled] = useState(false);
  const [config, setConfig] = useState({
    referrerRewardType: "credit",
    referrerRewardValue: "50",
    refereeRewardType: "discount",
    refereeRewardValue: "10",
    emailSubject: "יש לי מתנה בשבילך! 🎁",
    emailBody:
      "היי,\n\nנהניתי מאוד מהשירות ואני חושב שגם לך כדאי לנסות.\nהנה קופון מתנה ממני להנחה של {referee_reward} בקנייה הראשונה!\n\nתהנה,\n{referrer_name}",
  });

  const handleSave = () => {
    console.log("Saving config:", config, isEnabled);
    alert("ההגדרות נשמרו בהצלחה (דמו)");
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
              <Share2 className="w-8 h-8 text-blue-500" />
              מסלולי המלצות (Referrals)
            </h1>
            <p className="text-slate-500">
              תמרץ לקוחות להביא חברים והגדל את המעגל העסקי בצורה אורגנית
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
          <div className="lg:col-span-2 space-y-6">
            {/* Customer List Management */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex justify-between items-center">
                  <span>רשימת לקוחות ({customers.length})</span>
                  <CustomerListManager
                    onAddCustomers={handleAddCustomers}
                    listSlug="referral"
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
                            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
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

            {/* Rewards Config */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">הגדרת תגמולים</CardTitle>
                <CardDescription>
                  מה מקבל מי שממליץ ומה מקבל החבר החדש?
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4 p-4 bg-blue-50/50 rounded-xl border border-blue-100/50">
                  <Label className="text-blue-900 font-semibold flex items-center gap-2">
                    <Gift className="w-4 h-4" />
                    תגמול לממליץ (הלקוח הקיים)
                  </Label>
                  <Select
                    value={config.referrerRewardType}
                    onValueChange={(val) =>
                      setConfig({ ...config, referrerRewardType: val })
                    }
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credit">
                        קרדיט לקנייה הבאה (₪)
                      </SelectItem>
                      <SelectItem value="cash">החזר כספי (Cashback)</SelectItem>
                      <SelectItem value="gift">מתנה פיזית</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="ערך התגמול"
                    value={config.referrerRewardValue}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        referrerRewardValue: e.target.value,
                      })
                    }
                    className="bg-white"
                  />
                </div>

                <div className="space-y-4 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                  <Label className="text-indigo-900 font-semibold flex items-center gap-2">
                    <Gift className="w-4 h-4" />
                    תגמול לחבר (הלקוח החדש)
                  </Label>
                  <Select
                    value={config.refereeRewardType}
                    onValueChange={(val) =>
                      setConfig({ ...config, refereeRewardType: val })
                    }
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="discount">אחוז הנחה (%)</SelectItem>
                      <SelectItem value="coupon">קופון שקלי (₪)</SelectItem>
                      <SelectItem value="freebie">מוצר מתנה</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="ערך התגמול"
                    value={config.refereeRewardValue}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        refereeRewardValue: e.target.value,
                      })
                    }
                    className="bg-white"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Message Config */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">הודעת השיתוף</CardTitle>
                <CardDescription>
                  זו ההודעה שהלקוח ישלח לחברים שלו
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>נושא (לשיתוף במייל)</Label>
                  <Input
                    value={config.emailSubject}
                    onChange={(e) =>
                      setConfig({ ...config, emailSubject: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>תוכן ההודעה</Label>
                  <Textarea
                    rows={5}
                    value={config.emailBody}
                    onChange={(e) =>
                      setConfig({ ...config, emailBody: e.target.value })
                    }
                  />
                  <div className="flex gap-2 text-xs text-slate-500">
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer hover:bg-slate-200">
                      {"{referrer_name}"}
                    </span>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer hover:bg-slate-200">
                      {"{referee_reward}"}
                    </span>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer hover:bg-slate-200">
                      {"{link}"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">
                תצוגה מקדימה ללקוח
              </h3>
              <div className="bg-linear-to-br from-blue-500 to-indigo-600 rounded-xl p-6 text-white text-center mb-6">
                <Gift className="w-12 h-12 mx-auto mb-3 text-white/90" />
                <div className="text-2xl font-bold mb-1">
                  {config.referrerRewardType === "credit"
                    ? `₪${config.referrerRewardValue}`
                    : config.referrerRewardValue}
                </div>
                <div className="text-white/80 text-sm mb-4">
                  מתנה על כל חבר שמצטרף!
                </div>
                <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 flex items-center justify-between gap-2 border border-white/30 cursor-pointer hover:bg-white/30 transition-colors">
                  <span className="text-xs font-mono truncate opacity-90">
                    ofer.link/ref/yossi123
                  </span>
                  <Copy className="w-3 h-3" />
                </div>
              </div>

              <div className="space-y-4">
                <Label>שיתוף מהיר</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="w-full gap-2 text-green-600 border-green-200 hover:bg-green-50"
                  >
                    <Share2 className="w-4 h-4" /> Whatsapp
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                  >
                    <Share2 className="w-4 h-4" /> Facebook
                  </Button>
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
              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-lg font-bold">
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
                        <div className="text-sm text-slate-500">
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
                        <div className="text-sm text-slate-500">
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
    </div>
  );
}
