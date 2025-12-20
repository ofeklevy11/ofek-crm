"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  UserPlus,
  Save,
  Timer,
  Ghost,
  Sparkles,
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

export default function WinbackAutomationPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);

  const handleAddCustomers = (newCustomers: Customer[]) => {
    setCustomers((prev) => [...prev, ...newCustomers]);
  };

  const [isEnabled, setIsEnabled] = useState(false);
  const [activeSegment, setActiveSegment] = useState("at_risk"); // at_risk, lost, dormant

  const [config, setConfig] = useState({
    inactivityDays: "90",
    offerTitle: "מתגעגעים אליך! 💔",
    offerValue: "20% הנחה",
    messageBody:
      "היי {first_name},\n\nעבר המון זמן מאז שראינו אותך! \nאנחנו מתגעגעים ורוצים שתחזור, אז הכנו לך הטבה מיוחדת:\n{offer_value} לקנייה חוזרת.\n\nמחכים לך,",
  });

  const handleSave = () => {
    console.log("Saving winback config:", config, isEnabled);
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
              <UserPlus className="w-8 h-8 text-slate-600" />
              החזרת לקוחות לא פעילים (Winback)
            </h1>
            <p className="text-slate-500">
              זהה לקוחות רדומים באופן אוטומטי והחזר אותם למעגל המכירות
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
                    listSlug="winback"
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

            {/* Segmentation Tabs */}
            <div className="bg-white p-1 rounded-xl border border-slate-200 inline-flex">
              <button
                onClick={() => setActiveSegment("at_risk")}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  activeSegment === "at_risk"
                    ? "bg-slate-100 text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                בסיכון (30-60 יום)
              </button>
              <button
                onClick={() => setActiveSegment("dormant")}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  activeSegment === "dormant"
                    ? "bg-slate-100 text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                רדומים (60-90 יום)
              </button>
              <button
                onClick={() => setActiveSegment("lost")}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  activeSegment === "lost"
                    ? "bg-slate-100 text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                אבודים (90+ יום)
              </button>
            </div>

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
    </div>
  );
}
