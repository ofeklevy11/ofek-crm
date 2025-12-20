"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  RefreshCw,
  Save,
  Clock,
  AlertTriangle,
  ArrowUpRight,
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

export default function RenewalAutomationPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);

  const handleAddCustomers = (newCustomers: Customer[]) => {
    setCustomers((prev) => [...prev, ...newCustomers]);
  };

  const [isEnabled, setIsEnabled] = useState(false);
  const [config, setConfig] = useState({
    daysBeforeExpiry: "30",
    offerType: "discount",
    offerValue: "10",
    emailSubject: "המנוי שלך עומד להסתיים... אל תפספס! ⏳",
    emailBody:
      "היי {first_name},\n\nשמנו לב שהמנוי שלך מסתיים ב-{expiry_date}.\nאנחנו לא רוצים שתישאר בלי שירות, ולכן אם תחדש עכשיו תקבל {offer_value} במתנה!\n\nלחידוש מהיר לחץ כאן:\n{link}",
  });

  const handleSave = () => {
    console.log("Saving renewal config:", config, isEnabled);
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
              <RefreshCw className="w-8 h-8 text-cyan-500" />
              חידוש הסכם (Renewal)
            </h1>
            <p className="text-slate-500">
              מנע נטישת לקוחות והבטח הכנסה חוזרת באופן אוטומטי
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
                    listSlug="renewal"
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

            {/* Trigger Config */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">תזמון והצעה</CardTitle>
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
                  <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-orange-800">
                    <strong>שים לב:</strong> לפי הנתונים שלך, 40% מהלקוחות
                    מחדשים ב-30 הימים האחרונים. מומלץ להתחיל את התהליך מוקדם.
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Message Config */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">תוכן המייל</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>נושא</Label>
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
                  />
                  <div className="flex gap-2 text-xs text-slate-500">
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer hover:bg-slate-200">
                      {"{expiry_date}"}
                    </span>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer hover:bg-slate-200">
                      {"{offer_value}"}
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
            <Card className="bg-linear-to-br from-slate-900 to-slate-800 text-white border-0 overflow-hidden relative">
              {/* Abstract shapes */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/20 rounded-full blur-2xl -mr-10 -mt-10"></div>
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl -ml-10 -mb-10"></div>

              <CardContent className="p-6 relative z-10 flex flex-col h-full min-h-[400px]">
                <div className="mb-4 text-xs font-mono text-cyan-400">
                  PREVIEW: EMAIL
                </div>
                <h3 className="text-xl font-bold mb-4 leading-tight">
                  {config.emailSubject}
                </h3>
                <div className="space-y-4 text-sm text-slate-300 flex-1 whitespace-pre-line">
                  {config.emailBody
                    .replace("{first_name}", "דני")
                    .replace("{expiry_date}", "01/05/2026")
                    .replace(
                      "{offer_value}",
                      config.offerType === "discount"
                        ? `${config.offerValue}% הנחה`
                        : "הטבה מיוחדת"
                    )
                    .replace("{link}", "")}
                </div>

                <div className="mt-8">
                  <Button className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold h-12">
                    חדש מנוי עכשיו <ArrowUpRight className="w-4 h-4 mr-2" />
                  </Button>
                  <div className="text-center mt-3 text-xs text-slate-500">
                    *ההטבה בתוקף ל-48 שעות בלבד
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
