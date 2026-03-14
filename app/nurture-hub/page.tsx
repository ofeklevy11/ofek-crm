"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Gift,
  Share2,
  TrendingUp,
  Star,
  RefreshCw,

  UserPlus,
  ArrowLeft,
  Zap,
  Heart,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Mock data for the cards
const nurturePaths = [
  {
    id: "birthday",
    title: "אוטומציית יום הולדת",
    description:
      "שליחת ברכה אישית והטבה ייחודית ביום המיוחד של הלקוח. מחזק קשר רגשי ומגדיל נאמנות.",
    icon: Gift,
    color: "from-pink-500 to-rose-500",
    textColor: "text-pink-600",
    bg: "bg-pink-500/10",
    stats: "30% אחוזי המרה",
    href: "/nurture-hub/birthday",

  },
  {
    id: "referral",
    title: "מסלולי המלצות",
    description:
      "תמרץ לקוחות להמליץ לחברים. מערכת מתגמלת אוטומטית על כל ליד חדש שמגיע מלקוח קיים.",
    icon: Share2,
    color: "from-blue-400 to-indigo-500",
    textColor: "text-blue-600",
    bg: "bg-blue-500/10",
    stats: "גידול אורגני",
    href: "/nurture-hub/referral",

  },
  {
    id: "upsell",
    title: "Upsell & Cross-sell",
    description:
      "זיהוי הזדמנויות לשדרוג עסקה או מכירת מוצרים משלימים ברגע הנכון במסע הלקוח.",
    icon: TrendingUp,
    color: "from-emerald-400 to-teal-500",
    textColor: "text-emerald-600",
    bg: "bg-emerald-500/10",
    stats: "+15% להכנסות",
    href: "/nurture-hub/upsell",

  },
  {
    id: "review",
    title: "בקשת ביקורת",
    description:
      "תזמון חכם לבקשת ביקורת חיובית בגוגל/פייסבוק לאחר חווית שירות מוצלחת.",
    icon: Star,
    color: "from-amber-400 to-orange-500",
    textColor: "text-amber-600",
    bg: "bg-amber-500/10",
    stats: "שיפור מוניטין",
    href: "/nurture-hub/review",

  },
  {
    id: "renewal",
    title: "חידוש הסכם",
    description:
      "תזכורות אוטומטיות לקראת סיום מנוי או חוזה, עם הצעה אטרקטיבית לחידוש מידי.",
    icon: RefreshCw,
    color: "from-cyan-400 to-blue-500",
    textColor: "text-cyan-600",
    bg: "bg-cyan-500/10",
    stats: "מניעת נטישה",
    href: "/nurture-hub/renewal",

  },
  {
    id: "winback",
    title: "החזרת לקוחות לא פעילים",
    description:
      "זיהוי לקוחות 'רדומים' והפעלת קמפיין ממוקד להחזרתם למעגל הפעילות העסקית.",
    icon: UserPlus,
    color: "from-gray-500 to-slate-600",
    textColor: "text-slate-600",
    bg: "bg-slate-500/10",
    stats: "הזדמנות שנייה",
    href: "/nurture-hub/winback",

  },
];

export default function NurtureHubPage() {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  return (
    <main
      className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20"
      dir="rtl"
    >
      {/* Decorative Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-indigo-200/30 rounded-full blur-3xl opacity-50 mix-blend-multiply animate-blob" />
        <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] bg-purple-200/30 rounded-full blur-3xl opacity-50 mix-blend-multiply animate-blob animation-delay-2000" />
        <div className="absolute bottom-[-20%] right-[20%] w-[600px] h-[600px] bg-pink-200/30 rounded-full blur-3xl opacity-50 mix-blend-multiply animate-blob animation-delay-4000" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12">
        <a
          href="#nurture-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:right-2 focus:bg-white focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg focus:text-blue-600 focus:ring-2 focus:ring-blue-500"
        >
          דלג לתוכן טיפוח לקוחות
        </a>
        {/* Header Section */}
        <div className="text-center mb-16 relative">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-sm font-medium mb-6 animate-fade-in-up">
            <Heart className="w-4 h-4 fill-indigo-700" aria-hidden="true" />
            <span>מערכת שימור לקוחות מתקדמת</span>
          </div>

          <h1 id="nurture-heading" className="text-5xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-slate-900 via-indigo-900 to-slate-900 mb-6 tracking-tight animate-fade-in-up animation-delay-100">
            Nurture Hub
          </h1>

          <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed animate-fade-in-up animation-delay-200">
            מרכז הטיפוח הופך לקוחות מזדמנים לשגרירים נאמנים. בנה מסלולים ארוכי
            טווח, אוטומציות חכמות וחוויות אישיות שגורמות ללקוחות שלך להתאהב
            במותג מחדש בכל אינטראקציה.
          </p>
        </div>

        {/* Info Cards / Stats Overview (Optional) */}
        <div role="group" aria-label="יתרונות המערכת" className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 animate-fade-in-up animation-delay-300">
          <div className="bg-white/60 backdrop-blur-xl border border-white/20 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-xl">
                <Zap className="w-6 h-6 text-green-600" aria-hidden="true" />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-800">אוטומטי</div>
                <div className="text-sm text-slate-500">
                  חוסך זמן יקר בניהול ידני
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white/60 backdrop-blur-xl border border-white/20 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-xl">
                <TrendingUp className="w-6 h-6 text-blue-600" aria-hidden="true" />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-800">
                  ממוקד ROI
                </div>
                <div className="text-sm text-slate-500">
                  הגדלת ערך חיי לקוח (LTV)
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white/60 backdrop-blur-xl border border-white/20 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-100 rounded-xl">
                <Star className="w-6 h-6 text-amber-600" aria-hidden="true" />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-800">
                  חווית לקוח
                </div>
                <div className="text-sm text-slate-500">
                  פרסונליזציה בכל נקודת מגע
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div id="nurture-content" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {nurturePaths.map((path, index) => (
              <Link
                href={path.href}
                key={path.id}
                aria-label={path.title}
                className="group relative block"
                onMouseEnter={() => setHoveredCard(path.id)}
                onMouseLeave={() => setHoveredCard(null)}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div
                  className="relative h-full bg-white rounded-3xl p-8 transition-all duration-300 border border-slate-100 overflow-hidden hover:shadow-[0_20px_50px_rgba(0,0,0,0.1)] hover:-translate-y-2 flex flex-col justify-between"
                >
                  <div
                    className={cn(
                      "absolute top-0 left-0 w-full h-1 bg-linear-to-r opacity-0 transition-opacity duration-300",
                      path.color,
                      hoveredCard === path.id && "opacity-100"
                    )}
                  />

                  <div>
                    <div className="flex justify-between items-start mb-6">
                      <div
                        className={cn(
                          "p-4 rounded-2xl transition-all duration-300 group-hover:scale-110",
                          path.bg
                        )}
                      >
                        <path.icon className={cn("w-8 h-8", path.textColor)} />
                      </div>
                      {path.stats && (
                        <span className="px-3 py-1 bg-slate-50 rounded-full text-xs font-semibold text-slate-500 border border-slate-100">
                          {path.stats}
                        </span>
                      )}
                    </div>

                    <h2 className="text-2xl font-bold text-slate-900 mb-3 transition-colors group-hover:text-indigo-900">
                      {path.title}
                    </h2>
                    <p className="text-slate-500 leading-relaxed mb-6">
                      {path.description}
                    </p>
                  </div>

                  <div className="pt-6 border-t border-slate-100/50 mt-auto flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-400 transition-colors group-hover:text-indigo-600">
                      הגדר מסלול
                    </span>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 bg-slate-50 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transform group-hover:rotate-180">
                      <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                    </div>
                  </div>
                </div>
              </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
