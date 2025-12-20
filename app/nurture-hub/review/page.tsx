"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Star,
  Save,
  ThumbsUp,
  MessageCircle,
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

// Type needed for list state
interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  source: string;
}

export default function ReviewAutomationPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);

  const handleAddCustomers = (newCustomers: Customer[]) => {
    setCustomers((prev) => [...prev, ...newCustomers]);
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
    </div>
  );
}
