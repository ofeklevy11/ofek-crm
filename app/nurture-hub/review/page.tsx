"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Star,
  Save,
  ThumbsUp,
  MessageCircle,
  Clock,
  Zap,
  Pencil,
  ToggleRight,
  ToggleLeft,
  Trash2,
  Mail,
  Phone,
  X,
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

export default function ReviewAutomationPage() {
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
    getNurtureSubscribers("review").then((subs) => {
      setCustomers(
        subs.map((s) => ({
          ...s,
          sourceTableName: s.sourceTableName || undefined,
        }))
      );
    });
    getNurtureRules("review").then((r) => {
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
    platforms: {
      google: true,
      facebook: false,
      website: true,
    },
    timing: "immediate", // immediate, 1_day, 3_days
    minStarsForPublic: "4", // Only ask for public review if internal rating is >= this
    messageSubject: "איך הייתה החוויה שלך?",
    messageBody:
      "היי {first_name},\n\nשמחנו לתת לך שירות! נשמח לשמוע איך היה בקישור קצר למטה.\nדעתך חשובה לנו מאוד ועוזרת לנו להשתפר.",
  });

  const handleSave = () => {
    console.log("Saving review config:", config, isEnabled);
    alert("ההגדרות נשמרו בהצלחה (דמו)");
  };

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20"
      dir="rtl"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-12">
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
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
              <span
                className={cn(
                  "w-2.5 h-2.5 rounded-full",
                  isEnabled ? "bg-green-500" : "bg-slate-300"
                )}
              ></span>
              <span className="text-sm font-medium text-slate-600">
                {isEnabled ? "פעיל" : "לא פעיל"}
              </span>
              <button
                onClick={() => setIsEnabled(!isEnabled)}
                className="mr-2 text-xs text-indigo-600 hover:underline"
              >
                {isEnabled ? "השבת" : "הפעל"}
              </button>
            </div>
            <Button
              onClick={handleSave}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              <Save className="w-4 h-4 ml-2" />
              שמור שינויים
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Customer List Management */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex justify-between items-center">
                  <span>רשימת לקוחות ({customers.length})</span>
                  <CustomerListManager
                    onAddCustomers={handleAddCustomers}
                    listSlug="review"
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
                            <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold shrink-0">
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

            {/* Logic & Platforms */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">לוגיקה ופלטפורמות</CardTitle>
                <CardDescription>
                  הגדר מתי ולאן להפנות את הלקוחות
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div
                    className={cn(
                      "cursor-pointer border rounded-xl p-4 flex flex-col items-center gap-3 transition-all",
                      config.platforms.google
                        ? "border-amber-500 bg-amber-50/50"
                        : "border-slate-200 hover:border-slate-300"
                    )}
                    onClick={() =>
                      setConfig({
                        ...config,
                        platforms: {
                          ...config.platforms,
                          google: !config.platforms.google,
                        },
                      })
                    }
                  >
                    <div className="text-2xl">G</div>
                    <span className="font-medium text-sm">Google Reviews</span>
                  </div>
                  <div
                    className={cn(
                      "cursor-pointer border rounded-xl p-4 flex flex-col items-center gap-3 transition-all",
                      config.platforms.facebook
                        ? "border-blue-500 bg-blue-50/50"
                        : "border-slate-200 hover:border-slate-300"
                    )}
                    onClick={() =>
                      setConfig({
                        ...config,
                        platforms: {
                          ...config.platforms,
                          facebook: !config.platforms.facebook,
                        },
                      })
                    }
                  >
                    <div className="text-2xl text-blue-600">f</div>
                    <span className="font-medium text-sm">Facebook</span>
                  </div>
                  <div
                    className={cn(
                      "cursor-pointer border rounded-xl p-4 flex flex-col items-center gap-3 transition-all",
                      config.platforms.website
                        ? "border-indigo-500 bg-indigo-50/50"
                        : "border-slate-200 hover:border-slate-300"
                    )}
                    onClick={() =>
                      setConfig({
                        ...config,
                        platforms: {
                          ...config.platforms,
                          website: !config.platforms.website,
                        },
                      })
                    }
                  >
                    <div className="text-2xl">🌐</div>
                    <span className="font-medium text-sm">אתר הבית</span>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <Label className="flex flex-col gap-1">
                      <span>סינון איכות חכם</span>
                      <span className="text-xs text-slate-500 font-normal">
                        בקש ביקורת פומבית (גוגל/פייסבוק) רק אם הדירוג הפנימי
                        גבוה מ-
                      </span>
                    </Label>
                    <Select
                      value={config.minStarsForPublic}
                      onValueChange={(val) =>
                        setConfig({ ...config, minStarsForPublic: val })
                      }
                    >
                      <SelectTrigger className="w-[100px]">
                        <div className="flex items-center gap-2">
                          <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                          <SelectValue />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 כוכבים</SelectItem>
                        <SelectItem value="4">4 כוכבים</SelectItem>
                        <SelectItem value="5">5 כוכבים</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="flex flex-col gap-1">
                      <span>תזמון שליחה</span>
                      <span className="text-xs text-slate-500 font-normal">
                        כמה זמן לאחר סיום השירות/רכישה לשלוח את הבקשה?
                      </span>
                    </Label>
                    <Select
                      value={config.timing}
                      onValueChange={(val) =>
                        setConfig({ ...config, timing: val })
                      }
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="immediate">מיידית</SelectItem>
                        <SelectItem value="1_hour">שעה אחרי</SelectItem>
                        <SelectItem value="24_hours">יום אחרי</SelectItem>
                        <SelectItem value="3_days">3 ימים אחרי</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Message Config */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">תוכן הפנייה</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>כותרת</Label>
                  <Input
                    value={config.messageSubject}
                    onChange={(e) =>
                      setConfig({ ...config, messageSubject: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>גוף ההודעה</Label>
                  <Textarea
                    rows={4}
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
            <div className="sticky top-8 bg-white border border-slate-200 rounded-[2rem] p-4 shadow-xl">
              <div className="text-center mb-6 mt-4">
                <div className="w-16 h-16 bg-slate-100 rounded-full mx-auto mb-3 flex items-center justify-center">
                  <span className="text-2xl">🏢</span>
                </div>
                <h3 className="font-bold text-lg">{config.messageSubject}</h3>
                <p className="text-sm text-slate-500 mt-2 px-4 whitespace-pre-line">
                  {config.messageBody.replace("{first_name}", "דני")}
                </p>
              </div>

              <div className="flex justify-center gap-2 mb-8">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={cn(
                      "w-8 h-8 cursor-pointer transition-all hover:scale-110",
                      star <= 4
                        ? "text-amber-400 fill-amber-400"
                        : "text-slate-200 fill-slate-200"
                    )}
                  />
                ))}
              </div>

              <div className="text-center text-xs text-slate-400 pb-4">
                *אם הלקוח ידרג גבוה, הוא יועבר ל:
              </div>
              <div className="grid grid-cols-2 gap-2 px-4 pb-4">
                {config.platforms.google && (
                  <div className="bg-red-50 text-red-600 border border-red-100 py-2 rounded-lg text-xs font-bold text-center">
                    Google
                  </div>
                )}
                {config.platforms.facebook && (
                  <div className="bg-blue-50 text-blue-600 border border-blue-100 py-2 rounded-lg text-xs font-bold text-center">
                    Facebook
                  </div>
                )}
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
