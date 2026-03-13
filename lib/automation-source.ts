export const AUTOMATION_SOURCES: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  MANUAL:         { label: "ידני",            color: "text-gray-700",   bgColor: "bg-gray-100",   borderColor: "border-gray-200" },
  NURTURE:        { label: "טיפוח לקוחות",   color: "text-green-800",  bgColor: "bg-green-100",  borderColor: "border-green-200" },
  CALENDAR:       { label: "יומן",            color: "text-blue-800",   bgColor: "bg-blue-100",   borderColor: "border-blue-200" },
  MEETING:        { label: "פגישות",          color: "text-indigo-800", bgColor: "bg-indigo-100", borderColor: "border-indigo-200" },
  SERVICE:        { label: "שירות",           color: "text-orange-800", bgColor: "bg-orange-100", borderColor: "border-orange-200" },
  AI:             { label: "AI",              color: "text-purple-800", bgColor: "bg-purple-100", borderColor: "border-purple-200" },
  ANALYTICS_VIEW: { label: "תצוגה",          color: "text-purple-800", bgColor: "bg-purple-100", borderColor: "border-purple-200" },
  MULTI_EVENT:    { label: "אירועים מרובים", color: "text-amber-800",  bgColor: "bg-amber-100",  borderColor: "border-amber-200" },
};

/** Infer source for old rules that don't have the source field set */
export function inferSource(rule: {
  triggerType: string;
  actionType: string;
  calendarEventId?: string | null;
  meetingId?: string | null;
}): string {
  const t = rule.triggerType;

  if (t === "VIEW_METRIC_THRESHOLD") return "ANALYTICS_VIEW";
  if (t === "MULTI_EVENT_DURATION") return "MULTI_EVENT";
  if (t === "TICKET_STATUS_CHANGE" || t === "SLA_BREACH") return "SERVICE";
  if (t === "MEETING_BOOKED" || t === "MEETING_CANCELLED" || t === "MEETING_REMINDER") return "MEETING";
  if (t === "EVENT_TIME") return "CALENDAR";

  if (rule.actionType === "ADD_TO_NURTURE_LIST") return "NURTURE";

  if (rule.actionType === "SEND_EMAIL") {
    const ac = (rule as any).actionConfig;
    if (ac && typeof ac === "object" && ac.nurtureListSlug) return "NURTURE";
  }

  if (rule.calendarEventId) return "CALENDAR";
  if (rule.meetingId) return "MEETING";

  return "MANUAL";
}
