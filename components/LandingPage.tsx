"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Heebo } from "next/font/google";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  CheckCircle2,
  Globe,
  Layers,
  LayoutDashboard,
  ListChecks,
  MousePointerClick,
  Rocket,
  Settings,
  Shield,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

/* ================================================================
   Hooks
   ================================================================ */

function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

/* ================================================================
   Animated wrapper – fades/slides in on scroll
   ================================================================ */

function Reveal({
  children,
  className = "",
  delay = 0,
  direction = "up",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "left" | "right" | "none";
}) {
  const { ref, visible } = useInView();
  const hidden: Record<string, string> = {
    up: "translate-y-10 opacity-0",
    left: "-translate-x-10 opacity-0",
    right: "translate-x-10 opacity-0",
    none: "opacity-0",
  };
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible ? "translate-x-0 translate-y-0 opacity-100" : hidden[direction]
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ================================================================
   Data
   ================================================================ */

const FEATURES = [
  {
    icon: Users,
    title: "ניהול לידים ולקוחות",
    desc: "עקבו אחרי כל ליד מהרגע שנכנס ועד סגירת העסקה. כל המידע, ההיסטוריה והתקשורת — במקום אחד.",
    gradient: "from-blue-500 to-blue-600",
    bg: "bg-blue-50",
    text: "text-blue-600",
  },
  {
    icon: Zap,
    title: "אוטומציות חכמות",
    desc: "צרו תהליכים אוטומטיים שחוסכים שעות עבודה — פולואפ, תזכורות, שיוך לידים, ועוד.",
    gradient: "from-purple-500 to-purple-600",
    bg: "bg-purple-50",
    text: "text-purple-600",
  },
  {
    icon: Wallet,
    title: "ניהול פיננסי",
    desc: "הפקת הצעות מחיר וחשבוניות, מעקב תשלומים ויעדים כספיים — הכל מובנה במערכת.",
    gradient: "from-emerald-500 to-emerald-600",
    bg: "bg-emerald-50",
    text: "text-emerald-600",
  },
  {
    icon: ListChecks,
    title: "ניהול משימות",
    desc: "ארגנו משימות, הגדירו עדיפויות, ועקבו אחרי ביצועי הצוות בזמן אמת.",
    gradient: "from-amber-500 to-amber-600",
    bg: "bg-amber-50",
    text: "text-amber-600",
  },
  {
    icon: Calendar,
    title: "יומן וזימון פגישות",
    desc: "יומן חכם עם דף הזמנה ללקוחות, תזכורות אוטומטיות, וסנכרון מלא.",
    gradient: "from-sky-500 to-sky-600",
    bg: "bg-sky-50",
    text: "text-sky-600",
  },
  {
    icon: BarChart3,
    title: "דוחות ואנליטיקות",
    desc: "דשבורדים ודוחות מתקדמים שעוזרים לכם לקבל החלטות מבוססות נתונים.",
    gradient: "from-rose-500 to-rose-600",
    bg: "bg-rose-50",
    text: "text-rose-600",
  },
];

const STEPS = [
  {
    icon: MousePointerClick,
    title: "הירשמו בחינם",
    desc: "צרו חשבון תוך דקה אחת — ללא כרטיס אשראי ובלי התחייבות.",
  },
  {
    icon: Settings,
    title: "הגדירו את העסק",
    desc: "הוסיפו שירותים, עובדים ותהליכי עבודה שמתאימים בדיוק לעסק שלכם.",
  },
  {
    icon: Rocket,
    title: "התחילו לנהל",
    desc: "המערכת מוכנה — נהלו לידים, לקוחות ומכירות מהיום הראשון.",
  },
];

const TESTIMONIALS = [
  {
    name: "דנה כ.",
    role: "מנכ״לית, סטודיו עיצוב",
    quote:
      "מאז שעברנו ל-BizlyCRM, חסכנו כ-15 שעות עבודה בשבוע. האוטומציות פשוט עושות את העבודה בשבילנו.",
    initials: "דכ",
  },
  {
    name: "יוסי ל.",
    role: "מנכ״ל, חברת שיווק",
    quote:
      "הממשק הכי אינטואיטיבי שנתקלתי בו. הצוות שלנו אימץ את המערכת ביום הראשון — בלי הדרכות.",
    initials: "יל",
  },
  {
    name: "מיכל א.",
    role: "מנהלת, קליניקה פרטית",
    quote:
      "BizlyCRM שינתה לנו את העסק. שום ליד לא נופל בין הכיסאות, והדוחות נותנים לי תמונה ברורה.",
    initials: "מא",
  },
];

const STATS = [
  { value: "5,000+", label: "עסקים פעילים" },
  { value: "1M+", label: "לידים מנוהלים" },
  { value: "99.9%", label: "זמינות מערכת" },
  { value: "24/7", label: "תמיכה טכנית" },
];

/* ================================================================
   Landing Page
   ================================================================ */

export default function LandingPage() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(true), []);

  const heroAnim = (delay: number) =>
    `transition-all duration-700 ease-out ${
      loaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
    }`;

  return (
    <div className={`overflow-x-hidden ${heebo.className}`}>
      {/* ─────────────────── HERO ─────────────────── */}
      <section className="relative min-h-[calc(100vh-4rem)] flex items-center overflow-hidden">
        {/* BG effects */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(79,149,255,0.12),transparent)]" />
        <div className="absolute top-20 left-1/4 w-[500px] h-[500px] rounded-full bg-blue-400/5 blur-3xl lp-float pointer-events-none" />
        <div className="absolute bottom-10 right-1/4 w-[400px] h-[400px] rounded-full bg-purple-400/5 blur-3xl lp-float-reverse pointer-events-none" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* ── Content ── */}
            <div className="space-y-8 text-center lg:text-start">
              {/* Badge */}
              <div
                className={`inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 text-[#4f95ff] rounded-full text-sm font-semibold ${heroAnim(0)}`}
                style={{ transitionDelay: "0ms" }}
              >
                <Sparkles className="w-4 h-4" />
                <span>מערכת CRM חכמה לעסק שלכם</span>
              </div>

              {/* Headline */}
              <h1
                className={`text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-[1.15] ${heroAnim(100)}`}
                style={{ transitionDelay: "100ms" }}
              >
                כל מה שהעסק שלכם צריך
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-l from-[#4f95ff] to-[#a24ec1]">
                  במקום אחד
                </span>
              </h1>

              {/* Sub */}
              <p
                className={`text-lg sm:text-xl text-gray-500 leading-relaxed max-w-lg mx-auto lg:mx-0 ${heroAnim(200)}`}
                style={{ transitionDelay: "200ms" }}
              >
                BizlyCRM היא מערכת ניהול קשרי לקוחות (CRM) שמרכזת את ניהול
                הלידים, הלקוחות, המכירות, הפיננסים והמשימות שלכם — עם אוטומציות
                חכמות, דוחות בזמן אמת, וממשק שפשוט עובד.
              </p>

              {/* CTAs */}
              <div
                className={`flex flex-col sm:flex-row gap-4 justify-center lg:justify-start ${heroAnim(300)}`}
                style={{ transitionDelay: "300ms" }}
              >
                <Link
                  href="/register"
                  prefetch={false}
                  className="group relative flex items-center justify-center gap-2 bg-gradient-to-l from-[#4f95ff] to-[#a24ec1] text-white py-4 px-8 rounded-2xl font-semibold text-lg shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all duration-300 hover:-translate-y-0.5 overflow-hidden"
                >
                  <span className="relative z-10">התחילו עכשיו — בחינם</span>
                  <ArrowLeft className="w-5 h-5 relative z-10 transition-transform group-hover:-translate-x-1" />
                  <div className="absolute inset-0 bg-gradient-to-l from-[#3b82f6] to-[#8b3faf] opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
                <Link
                  href="/login"
                  prefetch={false}
                  className="flex items-center justify-center gap-2 bg-white text-gray-700 border border-gray-200 py-4 px-8 rounded-2xl font-semibold text-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-300"
                >
                  כניסה למערכת
                </Link>
              </div>

              {/* Trust badges */}
              <div
                className={`flex flex-wrap items-center gap-6 text-sm text-gray-400 justify-center lg:justify-start pt-2 ${heroAnim(400)}`}
                style={{ transitionDelay: "400ms" }}
              >
                {["ללא כרטיס אשראי", "הגדרה תוך דקות", "תמיכה מלאה"].map(
                  (t) => (
                    <div key={t} className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span>{t}</span>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* ── Hero Visual (desktop) ── */}
            <div
              className={`hidden lg:block relative transition-all duration-1000 ${
                loaded
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 -translate-x-12"
              }`}
              style={{ transitionDelay: "300ms" }}
            >
              <div className="relative">
                {/* Glow */}
                <div className="absolute -inset-4 bg-gradient-to-l from-blue-500/10 to-purple-500/10 rounded-3xl blur-2xl" />

                {/* Dashboard card */}
                <div className="relative bg-white rounded-2xl shadow-2xl shadow-gray-200/60 border border-gray-100 overflow-hidden">
                  {/* Browser bar */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400" />
                      <div className="w-3 h-3 rounded-full bg-yellow-400" />
                      <div className="w-3 h-3 rounded-full bg-green-400" />
                    </div>
                    <div className="flex-1 flex justify-center">
                      <div className="px-4 py-1 bg-white rounded-md text-xs text-gray-400 border border-gray-200">
                        app.bizlycrm.com/dashboard
                      </div>
                    </div>
                  </div>

                  <div className="flex">
                    {/* Sidebar */}
                    <div className="w-14 bg-gray-50 border-l border-gray-100 py-4 flex flex-col items-center gap-4">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-bl from-[#4f95ff] to-[#a24ec1] flex items-center justify-center">
                        <Layers className="w-4 h-4 text-white" />
                      </div>
                      {[LayoutDashboard, Users, Wallet, Calendar].map(
                        (Icon, i) => (
                          <div
                            key={i}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              i === 0
                                ? "bg-blue-50 text-[#4f95ff]"
                                : "text-gray-400"
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                        )
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-800">
                          סקירה כללית
                        </span>
                        <span className="text-xs text-gray-400">מרץ 2026</span>
                      </div>

                      {/* Stat cards */}
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          {
                            label: "לידים חדשים",
                            value: "142",
                            pct: "+18%",
                            bg: "bg-blue-50",
                            color: "text-blue-600/70",
                          },
                          {
                            label: "מכירות",
                            value: "₪48K",
                            pct: "+24%",
                            bg: "bg-purple-50",
                            color: "text-purple-600/70",
                          },
                          {
                            label: "לקוחות פעילים",
                            value: "89",
                            pct: "+7%",
                            bg: "bg-emerald-50",
                            color: "text-emerald-600/70",
                          },
                        ].map((s) => (
                          <div key={s.label} className={`${s.bg} rounded-xl p-3`}>
                            <div className={`text-xs ${s.color} mb-1`}>
                              {s.label}
                            </div>
                            <div className="text-lg font-bold text-gray-900">
                              {s.value}
                            </div>
                            <div className="text-xs text-green-600">
                              {s.pct} ↑
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Mini chart */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <div className="flex items-end gap-1.5 h-16">
                          {[
                            40, 55, 35, 65, 50, 80, 60, 75, 90, 70, 85, 95,
                          ].map((h, i) => (
                            <div
                              key={i}
                              className="flex-1 rounded-t bg-gradient-to-t from-[#4f95ff] to-[#a24ec1] transition-all duration-1000"
                              style={{
                                height: loaded ? `${h}%` : "0%",
                                transitionDelay: `${800 + i * 60}ms`,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating cards */}
                <div className="absolute -top-4 -left-4 bg-white p-3 rounded-xl shadow-lg shadow-gray-200/50 border border-gray-100 lp-float z-10">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-700">
                        +24% מכירות
                      </div>
                      <div className="text-[10px] text-gray-400">
                        לעומת חודש שעבר
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute -bottom-3 -right-3 bg-white p-3 rounded-xl shadow-lg shadow-gray-200/50 border border-gray-100 lp-float-reverse z-10">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-semibold text-gray-700">
                      ליד חדש נכנס למערכת
                    </span>
                  </div>
                </div>

                <div
                  className="absolute top-1/2 -right-6 -translate-y-1/2 bg-white p-2.5 rounded-xl shadow-lg shadow-gray-200/50 border border-gray-100 lp-float z-10"
                  style={{ animationDelay: "1s" }}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-500" />
                    <span className="text-[11px] font-medium text-gray-600">
                      משימה הושלמה
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────── STATS ─────────────────── */}
      <Reveal className="py-16 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {STATS.map((s, i) => (
              <Reveal key={s.label} delay={i * 100} direction="up">
                <div className="text-center">
                  <div className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-l from-[#4f95ff] to-[#a24ec1]">
                    {s.value}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">{s.label}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ─────────────────── PURPOSE / ABOUT ─────────────────── */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-semibold mb-4">
              <Target className="w-3 h-3" />
              מה זה BizlyCRM
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              הכירו את הפלטפורמה שתשנה את
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-l from-[#4f95ff] to-[#a24ec1]">
                הדרך שבה אתם מנהלים את העסק
              </span>
            </h2>
          </Reveal>

          <div className="max-w-4xl mx-auto">
            <Reveal delay={100}>
              <div className="bg-gradient-to-b from-gray-50 to-white rounded-3xl border border-gray-100 p-8 sm:p-12 space-y-6">
                <p className="text-gray-700 text-lg leading-relaxed">
                  <strong>BizlyCRM</strong> היא מערכת לניהול קשרי לקוחות (CRM)
                  שתוכננה במיוחד עבור עסקים קטנים ובינוניים. המערכת מאפשרת לכם
                  לנהל את כל מחזור חיי הלקוח — מרגע הכניסה כליד, דרך תהליך
                  המכירה, ועד לשימור לקוח פעיל — הכל ממקום אחד.
                </p>
                <p className="text-gray-700 text-lg leading-relaxed">
                  המערכת כוללת כלים מתקדמים לניהול לידים ולקוחות, מעקב אחר עסקאות
                  ומכירות, הפקת הצעות מחיר וחשבוניות, ניהול משימות ופרויקטים,
                  תזמון פגישות ויומן חכם, ואוטומציות שחוסכות שעות עבודה ידנית.
                  בנוסף, דשבורדים ודוחות מתקדמים מאפשרים לקבל תמונה ברורה של
                  ביצועי העסק בזמן אמת.
                </p>

                <div className="grid sm:grid-cols-3 gap-6 pt-4">
                  {[
                    {
                      icon: Globe,
                      title: "נגיש מכל מקום",
                      desc: "מערכת מבוססת ענן — כל מה שצריך זה דפדפן אינטרנט כדי לנהל את העסק מכל מכשיר.",
                    },
                    {
                      icon: Shield,
                      title: "מאובטח ופרטי",
                      desc: "הנתונים שלכם מוצפנים ומאוחסנים בצורה מאובטחת. אנחנו לא משתפים מידע עם צד שלישי.",
                    },
                    {
                      icon: Zap,
                      title: "אוטומציה חכמה",
                      desc: "חסכו זמן עם תהליכים אוטומטיים — פולואפ, תזכורות, שיוך לידים, ועוד.",
                    },
                  ].map((item, i) => (
                    <Reveal key={item.title} delay={200 + i * 100}>
                      <div className="text-center space-y-3">
                        <div className="w-12 h-12 mx-auto rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                          <item.icon className="w-6 h-6" />
                        </div>
                        <h3 className="font-bold text-gray-900">
                          {item.title}
                        </h3>
                        <p className="text-sm text-gray-500 leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </Reveal>
                  ))}
                </div>

                {/* English summary for Google reviewers */}
                <div className="mt-8 pt-6 border-t border-gray-100">
                  <p className="text-gray-400 text-sm leading-relaxed" dir="ltr" lang="en">
                    <strong>BizlyCRM</strong> is a cloud-based Customer Relationship Management
                    (CRM) platform designed for small and medium-sized businesses. It helps
                    businesses manage their leads, customers, sales pipeline, invoicing,
                    task management, appointment scheduling, and reporting — all in one
                    place. The platform provides automation tools to streamline workflows
                    and real-time analytics to support data-driven business decisions.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─────────────────── FEATURES ─────────────────── */}
      <section className="py-24 relative">
        <div className="absolute inset-0 bg-[radial-gradient(#4f95ff_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.03] pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <Reveal className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-50 text-purple-600 rounded-full text-xs font-semibold mb-4">
              <Sparkles className="w-3 h-3" />
              כל הכלים שצריך
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              פיצ׳רים שמשנים את הדרך
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-l from-[#4f95ff] to-[#a24ec1]">
                שבה אתם מנהלים את העסק
              </span>
            </h2>
            <p className="text-gray-500 mt-4 max-w-2xl mx-auto text-lg">
              BizlyCRM מספקת כלים מתקדמים לכל היבט בניהול העסק — הכל בממשק אחד
              פשוט ואינטואיטיבי.
            </p>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 80}>
                <div className="group bg-white rounded-2xl p-7 border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 hover:-translate-y-1 h-full">
                  <div
                    className={`w-12 h-12 rounded-xl ${f.bg} ${f.text} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}
                  >
                    <f.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {f.title}
                  </h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────── HOW IT WORKS ─────────────────── */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-semibold mb-4">
              <Rocket className="w-3 h-3" />
              פשוט להתחיל
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              שלושה צעדים ואתם בפנים
            </h2>
            <p className="text-gray-500 mt-4 max-w-xl mx-auto text-lg">
              ההתחלה פשוטה — לא צריך ידע טכני ולא הגדרות מסובכות.
            </p>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting line – desktop only */}
            <div className="hidden md:block absolute top-16 right-[16.6%] left-[16.6%] h-0.5 bg-gradient-to-l from-[#4f95ff] to-[#a24ec1] opacity-20" />

            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 150}>
                <div className="relative text-center">
                  {/* Number badge */}
                  <div className="relative mx-auto mb-6 w-16 h-16">
                    <div className="absolute inset-0 bg-gradient-to-bl from-[#4f95ff] to-[#a24ec1] rounded-2xl opacity-10" />
                    <div className="relative w-full h-full flex items-center justify-center">
                      <div className="w-12 h-12 bg-gradient-to-bl from-[#4f95ff] to-[#a24ec1] rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <s.icon className="w-6 h-6 text-white" />
                      </div>
                    </div>
                    {/* Step number */}
                    <div className="absolute -top-2 -left-2 w-7 h-7 bg-white border-2 border-[#4f95ff] text-[#4f95ff] rounded-full flex items-center justify-center text-xs font-bold shadow-sm">
                      {i + 1}
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {s.title}
                  </h3>
                  <p className="text-gray-500 text-sm max-w-xs mx-auto leading-relaxed">
                    {s.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────── TESTIMONIALS ─────────────────── */}
      <section className="py-24 relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(162,78,193,0.06),transparent)] pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <Reveal className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-xs font-semibold mb-4">
              <Star className="w-3 h-3" />
              מה הלקוחות אומרים
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              עסקים שכבר עברו למנהל חכם
            </h2>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} delay={i * 120}>
                <div className="bg-white rounded-2xl p-7 border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300 h-full flex flex-col">
                  {/* Stars */}
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star
                        key={j}
                        className="w-4 h-4 fill-amber-400 text-amber-400"
                      />
                    ))}
                  </div>
                  {/* Quote */}
                  <p className="text-gray-600 leading-relaxed flex-1 mb-6">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  {/* Author */}
                  <div className="flex items-center gap-3 pt-4 border-t border-gray-50">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-bl from-[#4f95ff] to-[#a24ec1] flex items-center justify-center text-white text-sm font-bold">
                      {t.initials}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-900">
                        {t.name}
                      </div>
                      <div className="text-xs text-gray-400">{t.role}</div>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────── FINAL CTA ─────────────────── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="relative bg-gradient-to-l from-[#4f95ff] to-[#a24ec1] rounded-3xl p-12 sm:p-16 text-center overflow-hidden">
              {/* Decorative */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.12),transparent)] pointer-events-none" />
              <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2 pointer-events-none" />

              <div className="relative z-10">
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-4">
                  מוכנים לשדרג את העסק?
                </h2>
                <p className="text-blue-100 text-lg sm:text-xl max-w-xl mx-auto mb-8">
                  הצטרפו לאלפי עסקים שכבר מנהלים חכם יותר עם BizlyCRM
                </p>
                <Link
                  href="/register"
                  prefetch={false}
                  className="group inline-flex items-center gap-2 bg-white text-gray-900 py-4 px-10 rounded-2xl font-bold text-lg shadow-xl shadow-black/10 hover:shadow-2xl transition-all duration-300 hover:-translate-y-0.5"
                >
                  <span>התחילו בחינם עכשיו</span>
                  <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
