/**
 * Hebrew text constants and selector helpers for service (ticket) E2E tests.
 */

export const SERVICE_TEXT = {
  // Page
  pageTitle: "שירות לקוחות",
  pageSubtitle: "ניהול קריאות שירות, שימור לקוחות ואוטומציות SLA במקום אחד.",

  // Header actions
  newTicket: "קריאה חדשה",
  slaBreaches: "חריגות SLA",
  automations: "אוטומציות",
  archive: "ארכיון",
  slaSettings: "הגדרות SLA",

  // Search
  searchPlaceholder: "חיפוש קריאות...",

  // Stats cards
  statsOpen: "קריאות פתוחות",
  statsInProgress: "בטיפול",
  statsUrgent: "תשומת לב דחופה",
  statsBreached: "קריאות בחריגה",
  statsClosed: "קריאות סגורות",

  // Kanban columns
  colOpen: "פתוח",
  colInProgress: "בטיפול",
  colWaiting: "ממתין",
  colResolved: "טופל",

  // List view headers
  headerTicket: "קריאה",
  headerStatus: "סטטוס",
  headerClient: "לקוח",
  headerAssignee: "נציג מטפל",
  headerPriority: "עדיפות",
  headerCreated: "נוצר בתאריך",
  headerUpdated: "עודכן בתאריך",

  // Create ticket modal
  modalTitle: "פתיחת קריאה חדשה",
  modalDescription: "פתח קריאת שירות חדשה או בקשה לעזרה.",
  labelSubject: "נושא",
  labelType: "סוג",
  labelPriority: "עדיפות",
  labelStatus: "סטטוס",
  labelClient: "לקוח (אופציונלי)",
  labelAssignee: "נציג מטפל (אופציונלי)",
  labelDescription: "תיאור",
  btnCreate: "צור קריאה",
  btnCancel: "ביטול",

  // Toast messages
  toastCreated: "הקריאה נוצרה בהצלחה",
  toastStatusUpdated: "הסטטוס עודכן",
  toastPriorityUpdated: "העדיפות עודכנה",
  toastTitleUpdated: "הכותרת עודכנה",
  toastDescriptionUpdated: "התיאור עודכן",
  toastAssigneeUpdated: "הנציג עודכן",
  toastClientUpdated: "הלקוח עודכן",
  toastDeleted: "הקריאה נמחקה",
  toastCommentDeleted: "ההודעה נמחקה",
  toastSlaUpdated: "מדיניות SLA עודכנה בהצלחה",
  toastLogDeleted: "הלוג נמחק",

  // Details panel
  activityTitle: "פעילות",
  noActivity: "אין פעילות עדיין. התחל את השיחה.",
  commentPlaceholder: "כתוב תגובה...",
  noDescription: "לא סופק תיאור.",
  descriptionLabel: "תיאור",
  clientLabel: "לקוח",
  assigneeLabel: "נציג מטפל",
  creatorLabel: "נוצר על ידי",
  noClient: "אין לקוח",
  noAssignee: "לא משויך",

  // SLA config modal
  slaModalTitle: "הגדרות SLA",
  slaResponseTime: "זמן תגובה (דקות)",
  slaResolveTime: "זמן פתרון (דקות)",
  slaSave: "שמור שינויים",

  // Priorities
  priorityCritical: "קריטי",
  priorityHigh: "גבוה",
  priorityMedium: "בינוני",
  priorityLow: "נמוך",

  // Types
  typeService: "שירות",
  typeComplaint: "תלונה",
  typeRetention: "שימור",
  typeOther: "אחר",

  // Statuses
  statusOpen: "פתוח",
  statusInProgress: "בטיפול",
  statusWaiting: "ממתין",
  statusResolved: "טופל",
  statusClosed: "סגור",

  // Confirm dialogs
  confirmDelete: "האם אתה בטוח שברצונך למחוק קריאה זו?",
  confirmBtn: "אישור",
  deleteCommentConfirm: "האם אתה בטוח שברצונך למחוק הודעה זו?",

  // Client dialog
  clientDialogTitle: "בחירת לקוח",
  clientSearchPlaceholder: "חיפוש לקוח...",
  noClientOption: "ללא לקוח",

  // Edit actions
  btnSave: "שמור",

  // Error toasts
  toastDeleteError: "שגיאה במחיקת הקריאה",
  toastCreateError: "שגיאה",
  toastUpdateError: "שגיאה",
} as const;
