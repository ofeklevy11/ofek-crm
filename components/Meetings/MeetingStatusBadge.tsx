"use client";

import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<string, { label: string; className: string; dotClass: string }> = {
  PENDING: { label: "ממתין", className: "bg-amber-50 text-amber-700 border-amber-200", dotClass: "bg-amber-500" },
  CONFIRMED: { label: "מאושר", className: "bg-emerald-50 text-emerald-700 border-emerald-200", dotClass: "bg-emerald-500" },
  COMPLETED: { label: "הושלם", className: "bg-blue-50 text-blue-700 border-blue-200", dotClass: "bg-blue-500" },
  CANCELLED: { label: "בוטל", className: "bg-red-50 text-red-700 border-red-200", dotClass: "bg-red-500" },
  NO_SHOW: { label: "לא הגיע", className: "bg-gray-50 text-gray-600 border-gray-200", dotClass: "bg-gray-400" },
};

export default function MeetingStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, className: "bg-gray-50 text-gray-600 border-gray-200", dotClass: "bg-gray-400" };
  return (
    <Badge variant="outline" className={`${config.className} text-xs font-medium gap-1.5`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
      {config.label}
    </Badge>
  );
}
