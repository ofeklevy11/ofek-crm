"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Share2,
  Save,
  Gift,
  CheckCircle2,
  Copy,
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

// Type needed for list state
interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  source: string;
}

export default function ReferralAutomationPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);

  const handleAddCustomers = (newCustomers: Customer[]) => {
    setCustomers((prev) => [...prev, ...newCustomers]);
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
              <Share2 className="w-8 h-8 text-blue-500" />
              מסלולי המלצות (Referrals)
            </h1>
            <p className="text-slate-500">
              תמרץ לקוחות להביא חברים והגדל את המעגל העסקי בצורה אורגנית
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
                    listSlug="referral"
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2">
                    {customers.map((c, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-lg shadow-sm"
                      >
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="bg-indigo-50 text-indigo-600 text-xs font-bold">
                            {c.name.slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 overflow-hidden">
                          <div className="text-sm font-medium truncate text-slate-900">
                            {c.name}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {c.email}
                          </div>
                        </div>
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-5 px-1.5 bg-slate-100 text-slate-500"
                        >
                          {c.source}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

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
    </div>
  );
}
