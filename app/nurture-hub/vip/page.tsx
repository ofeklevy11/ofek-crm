"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Crown,
  Save,
  Zap,
  Star,
  Clock,
  ShieldCheck,
  Trophy,
  Users,
  TrendingUp,
  Settings,
  Bell,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import CustomerListManager from "@/components/nurture/CustomerListManager";
import { getNurtureSubscribers } from "../actions";

// Mock types for the VIP module
interface VipPolicy {
  responseTimeMinutes: string;
  autoAssignToId: string;
  highlightTickets: boolean;
  dedicatedPhoneLine: boolean;
  priorityLabel: string;
}

export default function VipClubPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAutoModalOpen, setIsAutoModalOpen] = useState(false);

  // VIP Policy State
  const [policy, setPolicy] = useState<VipPolicy>({
    responseTimeMinutes: "60",
    autoAssignToId: "",
    highlightTickets: true,
    dedicatedPhoneLine: false,
    priorityLabel: "VIP פרימיום",
  });

  // Welcome Package State
  const [welcomePackage, setWelcomePackage] = useState({
    enabled: true,
    message: "ברוכים הבאים למועדון ה-VIP היוקרתי שלנו! שמחים לראות אתכם כאן.",
    giftType: "discount", // discount, physical, service
    giftValue: "20",
  });

  const refreshData = () => {
    setLoading(true);
    getNurtureSubscribers("vip").then((subs) => {
      setCustomers(subs);
      setLoading(false);
    });
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleAddCustomers = () => {
    refreshData();
  };

  const handleSavePolicy = () => {
    // Mock save
    console.log("Saving policy:", policy, welcomePackage);
    alert("הגדרות מועדון ה-VIP נשמרו בהצלחה!");
  };

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20"
      dir="rtl"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 relative">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/nurture-hub"
            className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:border-indigo-100 transition-all"
          >
            <ArrowRight className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Crown className="w-8 h-8 text-amber-500 fill-amber-500" />
              מועדון VIP
            </h1>
            <p className="text-slate-500">
              נהל את לקוחות הפרימיום, הגדר חוקי תיעדוף והענק יחס מועדף
            </p>
          </div>
          <div className="mr-auto">
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

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-8 grayscale opacity-50 pointer-events-none select-none"
        >
          <TabsList className="bg-white p-1 border border-slate-200 rounded-xl h-auto">
            <TabsTrigger
              value="overview"
              className="px-6 py-2.5 rounded-lg data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700"
            >
              <TrendingUp className="w-4 h-4 ml-2" />
              מבט על
            </TabsTrigger>
            <TabsTrigger
              value="members"
              className="px-6 py-2.5 rounded-lg data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700"
            >
              <Users className="w-4 h-4 ml-2" />
              חברי המועדון
            </TabsTrigger>
            <TabsTrigger
              value="policies"
              className="px-6 py-2.5 rounded-lg data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700"
            >
              <ShieldCheck className="w-4 h-4 ml-2" />
              מדיניות ותיעדוף
            </TabsTrigger>
            <TabsTrigger
              value="benefits"
              className="px-6 py-2.5 rounded-lg data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700"
            >
              <Trophy className="w-4 h-4 ml-2" />
              הטבות ומתנות
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent
            value="overview"
            className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="border-indigo-100 bg-linear-to-br from-indigo-50 to-white">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
                      <Users className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-indigo-900">
                        {customers.length}
                      </div>
                      <div className="text-sm text-indigo-600 font-medium">
                        לקוחות VIP פעילים
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-amber-100 bg-linear-to-br from-amber-50 to-white">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
                      <Star className="w-6 h-6 fill-current" />
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-amber-900">
                        100%
                      </div>
                      <div className="text-sm text-amber-600 font-medium">
                        שביעות רצון (יעד)
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-emerald-100 bg-linear-to-br from-emerald-50 to-white">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
                      <Zap className="w-6 h-6 fill-current" />
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-emerald-900">
                        {policy.responseTimeMinutes} דק'
                      </div>
                      <div className="text-sm text-emerald-600 font-medium">
                        זמן תגובה מובטח
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Members Tab */}
          <TabsContent
            value="members"
            className="animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center text-lg">
                  <span className="flex items-center gap-2">
                    <Crown className="w-5 h-5 text-amber-500" />
                    ניהול רשימת חברי VIP
                  </span>
                  <CustomerListManager
                    onAddCustomers={handleAddCustomers}
                    listSlug="vip"
                    automationOpenProp={isAutoModalOpen}
                    onAutomationOpenChangeProp={setIsAutoModalOpen}
                    title="ניהול חברי VIP"
                    description="הוסף לקוחות ידנית או הגדר חוקים אוטומטיים להצטרפות למועדון"
                  />
                </CardTitle>
                <CardDescription>
                  לקוחות ברשימה זו יקבלו באופן אוטומטי את תנאי השירות וההטבות
                  המוגדרים
                </CardDescription>
              </CardHeader>
              <CardContent>
                {customers.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 border border-dashed rounded-xl">
                    <Crown className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 mb-2">
                      אין עדיין חברי מועדון
                    </h3>
                    <p className="text-slate-500 max-w-sm mx-auto mb-6">
                      התחל להוסיף את הלקוחות הטובים ביותר שלך באופן ידני, או צור
                      אוטומציה שתצרף אותם על בסיס רכישות או וותק.
                    </p>
                    <Button
                      onClick={() => setIsAutoModalOpen(true)}
                      variant="outline"
                      className="border-indigo-200 text-indigo-700"
                    >
                      <Zap className="w-4 h-4 ml-2" />
                      צור אוטומציית הצטרפות
                    </Button>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <div className="col-span-4">לקוח</div>
                      <div className="col-span-4">פרטי קשר</div>
                      <div className="col-span-2">מקור הצטרפות</div>
                      <div className="col-span-2 text-left">סטטוס</div>
                    </div>
                    <div className="divide-y divide-slate-100 bg-white">
                      {customers.map((c, i) => (
                        <div
                          key={i}
                          className="grid grid-cols-12 gap-2 px-4 py-3 hover:bg-slate-50 transition-colors items-center group"
                        >
                          <div className="col-span-4 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm">
                              {c.name.slice(0, 2)}
                            </div>
                            <span className="text-sm font-medium text-slate-900">
                              {c.name}
                            </span>
                          </div>
                          <div className="col-span-4 text-sm text-slate-600">
                            {c.email || c.phone || "—"}
                          </div>
                          <div className="col-span-2">
                            <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600">
                              {c.sourceType === "MANUAL" ? "ידני" : "אוטומטי"}
                            </span>
                          </div>
                          <div className="col-span-2 text-left">
                            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-100">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              פעיל
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Benefits & Policies Tab */}
          <TabsContent
            value="policies"
            className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Service Level Agreement */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-500" />
                    רמת שירות (SLA)
                  </CardTitle>
                  <CardDescription>
                    הגדר כיצד המערכת תתעדף ותטפל בפניות של לקוחות VIP
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label>זמן תגובה מקסימלי (בדקות)</Label>
                    <div className="flex items-center gap-4">
                      <Input
                        type="number"
                        value={policy.responseTimeMinutes}
                        onChange={(e) =>
                          setPolicy({
                            ...policy,
                            responseTimeMinutes: e.target.value,
                          })
                        }
                        className="max-w-[120px]"
                      />
                      <span className="text-sm text-slate-500">
                        המערכת תתריע וחרוג מזמן זה בפניות VIP
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="space-y-0.5">
                      <Label className="text-base">תיעדוף אוטומטי בכרטסת</Label>
                      <p className="text-sm text-slate-500">
                        סמן פניות של VIP בצבע בולט והקפץ לראש הרשימה
                      </p>
                    </div>
                    <Switch
                      checked={policy.highlightTickets}
                      onCheckedChange={(c) =>
                        setPolicy({ ...policy, highlightTickets: c })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="space-y-0.5">
                      <Label className="text-base">הקצאה למנהלים בלבד</Label>
                      <p className="text-sm text-slate-500">
                        נתב פניות VIP ישירות למנהלי צוותים או עובדים בכירים
                      </p>
                    </div>
                    <Switch
                      checked={!!policy.autoAssignToId}
                      onCheckedChange={(c) =>
                        setPolicy({
                          ...policy,
                          autoAssignToId: c ? "manager" : "",
                        })
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Communication Preferences */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Bell className="w-5 h-5 text-purple-500" />
                    התראות ותקשורת
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>תווית זיהוי במערכת</Label>
                    <Input
                      value={policy.priorityLabel}
                      onChange={(e) =>
                        setPolicy({ ...policy, priorityLabel: e.target.value })
                      }
                      placeholder="למשל: לקוח זהב"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg border border-purple-100">
                    <div className="space-y-0.5">
                      <Label className="text-base text-purple-900">
                        התראה מיידית למנהל תיק
                      </Label>
                      <p className="text-sm text-purple-700/80">
                        שלח SMS/מייל למנהל התיק ברגע שהלקוח יוצר קשר
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Benefits Tab */}
          <TabsContent
            value="benefits"
            className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GiftTypeIcon type={welcomePackage.giftType} />
                  חבילת הצטרפות
                </CardTitle>
                <CardDescription>
                  הגדר מה מקבל לקוח ברגע שהוא מצטרף למועדון ה-VIP
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4 mb-4">
                  <Label className="min-w-fit">הפעל חבילת הצטרפות</Label>
                  <Switch
                    checked={welcomePackage.enabled}
                    onCheckedChange={(c) =>
                      setWelcomePackage({ ...welcomePackage, enabled: c })
                    }
                  />
                </div>

                {welcomePackage.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in zoom-in-95 duration-300">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>סוג הטבה</Label>
                        <Select
                          value={welcomePackage.giftType}
                          onValueChange={(v) =>
                            setWelcomePackage({
                              ...welcomePackage,
                              giftType: v,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="discount">
                              הנחה קבועה (%)
                            </SelectItem>
                            <SelectItem value="credit">
                              קרדיט לארנק (₪)
                            </SelectItem>
                            <SelectItem value="physical">מתנה פיזית</SelectItem>
                            <SelectItem value="service">
                              שירות פרימיום חינם
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>ערך ההטבה</Label>
                        <Input
                          value={welcomePackage.giftValue}
                          onChange={(e) =>
                            setWelcomePackage({
                              ...welcomePackage,
                              giftValue: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>הודעת ברוכים הבאים</Label>
                        <Textarea
                          rows={4}
                          value={welcomePackage.message}
                          onChange={(e) =>
                            setWelcomePackage({
                              ...welcomePackage,
                              message: e.target.value,
                            })
                          }
                        />
                        <p className="text-xs text-slate-500">
                          הודעה זו תישלח אוטומטית בערוץ המועדף על הלקוח
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function GiftTypeIcon({ type }: { type: string }) {
  const icons: Record<string, any> = {
    discount: Zap,
    credit: Star,
    physical: Crown,
    service: ShieldCheck,
  };
  const Icon = icons[type] || Crown;
  return <Icon className="w-5 h-5 text-indigo-500" />;
}
