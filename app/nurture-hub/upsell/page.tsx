"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  TrendingUp,
  Save,
  ShoppingBag,
  ArrowUp,
  Plus,
  CheckCircle2,
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

export default function UpsellAutomationPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);

  const handleAddCustomers = (newCustomers: Customer[]) => {
    setCustomers((prev) => [...prev, ...newCustomers]);
  };

  const [isEnabled, setIsEnabled] = useState(false);
  const [activeStrategy, setActiveStrategy] = useState("cross_sell"); // upsell, cross_sell

  const [config, setConfig] = useState({
    triggerEvent: "purchase_completed",
    delayMinutes: "15",
    offerTitle: "הנה משהו שישלים את החוויה שלך...",
    discount: "10%",
  });

  const handleSave = () => {
    console.log("Saving upsell config:", config, isEnabled);
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
              <TrendingUp className="w-8 h-8 text-emerald-500" />
              Upsell & Cross-sell
            </h1>
            <p className="text-slate-500">
              הגדל את ערך העסקה הממוצעת (AOV) עם הצעות חכמות בזמן הנכון
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
                    listSlug="upsell"
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

            {/* Visual Strategy Select */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                onClick={() => setActiveStrategy("cross_sell")}
                className={cn(
                  "cursor-pointer border-2 rounded-xl p-4 transition-all relative overflow-hidden",
                  activeStrategy === "cross_sell"
                    ? "border-emerald-500 bg-emerald-50/30"
                    : "border-slate-200 hover:border-emerald-200"
                )}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                    <Plus className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-lg">Cross-sell</span>
                </div>
                <p className="text-sm text-slate-500">
                  מכירת מוצרים משלימים (לדוגמה: קנית נעליים? הנה גרביים)
                </p>
                {activeStrategy === "cross_sell" && (
                  <div className="absolute top-2 left-2 text-emerald-600">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                )}
              </div>

              <div
                onClick={() => setActiveStrategy("upsell")}
                className={cn(
                  "cursor-pointer border-2 rounded-xl p-4 transition-all relative overflow-hidden",
                  activeStrategy === "upsell"
                    ? "border-emerald-500 bg-emerald-50/30"
                    : "border-slate-200 hover:border-emerald-200"
                )}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                    <ArrowUp className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-lg">Upsell</span>
                </div>
                <p className="text-sm text-slate-500">
                  שדרוג לעסקה יקרה יותר (לדוגמה: שדרוג לפרימיום)
                </p>
                {activeStrategy === "upsell" && (
                  <div className="absolute top-2 left-2 text-emerald-600">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                )}
              </div>
            </div>

            {/* Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">טריגרים ותזמון</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>מתי להציע?</Label>
                    <Select
                      value={config.triggerEvent}
                      onValueChange={(val) =>
                        setConfig({ ...config, triggerEvent: val })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cart_add">
                          מיד בהוספה לעגלה
                        </SelectItem>
                        <SelectItem value="checkout_start">
                          במעבר לתשלום
                        </SelectItem>
                        <SelectItem value="purchase_completed">
                          מיד לאחר רכישה (Thank you page)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>הנחה לתמריץ (אופציונלי)</Label>
                    <Input
                      value={config.discount}
                      onChange={(e) =>
                        setConfig({ ...config, discount: e.target.value })
                      }
                      placeholder="%"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Message Config */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">קופי ועיצוב</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>כותרת ההצעה</Label>
                  <Input
                    value={config.offerTitle}
                    onChange={(e) =>
                      setConfig({ ...config, offerTitle: e.target.value })
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-8 space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-12 h-12 bg-slate-100 rounded-md"></div>
                  <div className="space-y-1">
                    <div className="h-2 w-20 bg-slate-200 rounded"></div>
                    <div className="h-2 w-12 bg-slate-100 rounded"></div>
                  </div>
                  <div className="mr-auto text-green-600 font-bold text-xs">
                    V נרכש
                  </div>
                </div>

                <div className="border-t border-dashed border-slate-200 my-4 pt-4">
                  <h4 className="font-bold text-center text-slate-800 mb-4">
                    {config.offerTitle}
                  </h4>

                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex gap-3 items-center">
                    <div className="w-14 h-14 bg-white rounded-md border border-emerald-100 flex items-center justify-center">
                      <ShoppingBag className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-slate-800 text-sm">
                        מוצר משלים מושלם
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-600 font-bold">₪89</span>
                        <span className="text-slate-400 text-xs line-through">
                          ₪100
                        </span>
                        <Badge
                          variant="secondary"
                          className="bg-emerald-200 text-emerald-800 text-[10px] h-5 px-1"
                        >
                          {config.discount} הנחה
                        </Badge>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 h-8 w-8 p-0 rounded-full"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full mt-4 text-xs h-8 text-slate-400"
                >
                  לא תודה, דלג
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
