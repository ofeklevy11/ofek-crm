"use client";

import { useState } from "react";
import { Clock, Zap, Users, Info, ChevronDown } from "lucide-react";

type NurtureSlug = "birthday" | "renewal" | "winback" | "review" | "upsell" | "referral";

const TRIGGER_DATA: Record<NurtureSlug, {
  title: string;
  icon: typeof Clock;
  body: string;
  bullets: string[];
}> = {
  birthday: {
    title: "כיצד נשלחות הודעות יום הולדת?",
    icon: Clock,
    body: "המערכת סורקת את רשימת המנויים מדי יום באמצעות משימה מתוזמנת (CRON). כאשר יום ההולדת של מנוי (חודש + יום) תואם את התאריך של היום, נשלחת הודעה אוטומטית בערוצים שנבחרו.",
    bullets: [
      "סריקה יומית אוטומטית — ההודעה נשלחת ביום ההולדת עצמו",
      "כל מנוי חייב לכלול תאריך לידה (שדה \"תאריך טריגר\")",
      "כל מנוי מקבל הודעה פעם אחת בשנה בלבד (dedup)",
      "ניתן גם לשלוח ידנית לכל הרשימה באמצעות כפתור \"שלח לכולם\"",
    ],
  },
  renewal: {
    title: "כיצד נשלחות תזכורות חידוש?",
    icon: Clock,
    body: "המערכת סורקת את רשימת המנויים מדי יום. כאשר תאריך סיום החוזה של מנוי מתקרב בהתאם להגדרת הימים מראש, נשלחת תזכורת אוטומטית.",
    bullets: [
      "סריקה יומית אוטומטית",
      "כל מנוי חייב לכלול תאריך סיום חוזה (שדה \"תאריך טריגר\")",
      "מספר הימים לפני סיום התוקף מוגדר בסעיף \"תזמון והצעה\" למטה (ברירת מחדל: 30 ימים)",
      "ניתן גם לשלוח ידנית באמצעות כפתור \"שלח לכולם\"",
    ],
  },
  winback: {
    title: "כיצד מזוהים לקוחות לא פעילים?",
    icon: Clock,
    body: "המערכת סורקת את רשימת המנויים מדי יום. כאשר תאריך הפעילות האחרונה של מנוי חורג מסף אי-הפעילות שהוגדר, נשלחת הודעה אוטומטית.",
    bullets: [
      "סריקה יומית אוטומטית",
      "כל מנוי חייב לכלול תאריך פעילות אחרונה (שדה \"תאריך טריגר\")",
      "סף אי-הפעילות מוגדר בסעיף \"הגדרות טריגר\" למטה (ברירת מחדל: 90 ימים)",
      "כל מנוי מקבל הודעה לכל היותר פעם ברבעון (dedup)",
      "ניתן גם לשלוח ידנית באמצעות כפתור \"שלח לכולם\"",
    ],
  },
  review: {
    title: "כיצד נשלחות בקשות ביקורת?",
    icon: Zap,
    body: "ההודעות מופעלות באמצעות Webhook ממערכות חיצוניות או חוקי אוטומציה עם autoTrigger. לאחר הפעלת הטריגר, ההודעה נשלחת בהתאם להשהייה שהוגדרה בסעיף \"תזמון שליחה\".",
    bullets: [
      "Webhook: בקשת POST אל /api/nurture/webhook/review עם Bearer token",
      "חוקי אוטומציה עם autoTrigger",
      "השהיית שליחה מוגדרת בסעיף \"תזמון שליחה\" למטה (ידני / מיידית / שעה / יום / 3 ימים / שבוע / שבועיים / חודש)",
      "ניתן גם לשלוח ידנית באמצעות כפתור \"שלח לכולם\"",
    ],
  },
  upsell: {
    title: "כיצד נשלחות הצעות שדרוג?",
    icon: Zap,
    body: "לקוחות מתווספים לרשימה ידנית או באמצעות חוקי אוטומציה. לאחר ההוספה, ההודעה נשלחת בהתאם להשהייה שהוגדרה בסעיף \"תזמון שליחה\".",
    bullets: [
      "הוספה ידנית באמצעות כפתור \"הוסף לקוחות\"",
      "הוספה אוטומטית באמצעות חוקי אוטומציה (ADD_TO_NURTURE_LIST)",
      "השהיית שליחה מוגדרת בסעיף \"תזמון שליחה\" למטה (ידני / מיידית / שעה / יום / 3 ימים / שבוע)",
      "ניתן גם לשלוח ידנית באמצעות כפתור \"שלח לכולם\"",
    ],
  },
  referral: {
    title: "כיצד מתווספים לקוחות וכיצד נשלח הקמפיין?",
    icon: Users,
    body: "מנויים מתווספים לרשימה ידנית או באמצעות חוקי אוטומציה. לאחר שהרשימה מוכנה, לחצו על \"שלח לכולם\" כדי לשלוח את הקמפיין לכל המנויים. אין שליחה אוטומטית מבוססת תאריך.",
    bullets: [
      "הוספה ידנית באמצעות כפתור \"הוסף לקוחות\"",
      "הוספה אוטומטית באמצעות חוקי אוטומציה (ADD_TO_NURTURE_LIST)",
      "שליחת קמפיין ידנית באמצעות כפתור \"שלח לכולם\"",
      "אין שליחה אוטומטית — הקמפיין נשלח רק בלחיצה ידנית",
    ],
  },
};

export default function NurtureTriggerInfo({ slug }: { slug: NurtureSlug }) {
  const [open, setOpen] = useState(false);
  const data = TRIGGER_DATA[slug];
  if (!data) return null;

  const Icon = data.icon;

  return (
    <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-blue-100/50 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-blue-600" />
        </div>
        <span className="text-sm font-semibold text-blue-900 flex-1">{data.title}</span>
        <ChevronDown className={`w-4 h-4 text-blue-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-blue-100">
          <p className="text-sm text-blue-800 mb-3 leading-relaxed">{data.body}</p>
          <ul className="space-y-1.5">
            {data.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-blue-700">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-400" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
