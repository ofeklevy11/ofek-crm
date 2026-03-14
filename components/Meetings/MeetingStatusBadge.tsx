"use client";

import { Badge } from "@/components/ui/badge";

const LIGHT_CONFIG: Record<string, { label: string; className: string; dotClass: string }> = {
  PENDING: { label: "ממתין", className: "bg-amber-50 text-amber-700 border-amber-200", dotClass: "bg-amber-500" },
  CONFIRMED: { label: "מאושר", className: "bg-emerald-50 text-emerald-700 border-emerald-200", dotClass: "bg-emerald-500" },
  COMPLETED: { label: "הושלם", className: "bg-blue-50 text-blue-700 border-blue-200", dotClass: "bg-blue-500" },
  CANCELLED: { label: "בוטל", className: "bg-red-50 text-red-700 border-red-200", dotClass: "bg-red-500" },
  NO_SHOW: { label: "לא הגיע", className: "bg-gray-50 text-gray-600 border-gray-200", dotClass: "bg-gray-400" },
};

const DARK_CONFIG: Record<string, { label: string; className: string; dotClass: string }> = {
  PENDING: { label: "ממתין", className: "bg-amber-500/15 text-amber-400 border-amber-500/30", dotClass: "bg-amber-400" },
  CONFIRMED: { label: "מאושר", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", dotClass: "bg-emerald-400" },
  COMPLETED: { label: "הושלם", className: "bg-blue-500/15 text-blue-400 border-blue-500/30", dotClass: "bg-blue-400" },
  CANCELLED: { label: "בוטל", className: "bg-red-500/15 text-red-400 border-red-500/30", dotClass: "bg-red-400" },
  NO_SHOW: { label: "לא הגיע", className: "bg-gray-500/15 text-gray-400 border-gray-500/30", dotClass: "bg-gray-400" },
};

const LIGHT_FALLBACK = { label: "", className: "bg-gray-50 text-gray-600 border-gray-200", dotClass: "bg-gray-400" };
const DARK_FALLBACK = { label: "", className: "bg-gray-500/15 text-gray-400 border-gray-500/30", dotClass: "bg-gray-400" };

export default function MeetingStatusBadge({ status, variant = "dark" }: { status: string; variant?: "dark" | "light" }) {
  const configs = variant === "dark" ? DARK_CONFIG : LIGHT_CONFIG;
  const fallback = variant === "dark" ? DARK_FALLBACK : LIGHT_FALLBACK;
  const config = configs[status] || { ...fallback, label: status };
  return (
    <Badge variant="outline" className={`${config.className} text-xs font-medium gap-1.5`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} aria-hidden="true" />
      {config.label}
    </Badge>
  );
}
