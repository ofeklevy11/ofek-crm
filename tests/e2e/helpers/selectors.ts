/**
 * Hebrew text constants and selector helpers for task E2E tests.
 */

export const TASK_TEXT = {
  // Page
  pageTitle: "משימות",
  pageSubtitle: "ניהול משימות ודפי עבודה יומיים",
  mySheetsSubtitle: "צפה בדפי המשימות היומיים/שבועיים שהוקצו לך",

  // Tabs
  tabKanban: "לוח קנבן",
  tabDone: "משימות שבוצעו",
  tabMySheets: "דפי המשימות שלי",
  tabManageSheets: "ניהול דפי משימות",

  // Kanban columns
  colTodo: "משימות",
  colInProgress: "משימות בטיפול",
  colWaitingClient: "ממתינים לאישור לקוח",
  colOnHold: "משימות בהשהייה",
  colCompletedMonth: "בוצעו החודש",

  // Kanban actions
  newTask: "משימה חדשה",
  searchPlaceholder: "חיפוש משימות...",
  showFilters: "הצג פילטרים",
  hideFilters: "הסתר פילטרים",
  emptyColumn: "אין משימות",
  addFirstTask: "הוסף משימה ראשונה",
  addTaskToColumn: "הוסף משימה",

  // Task modal
  modalCreateTitle: "משימה חדשה",
  modalEditTitle: "עריכת משימה",
  labelTitle: "כותרת",
  labelDescription: "תיאור",
  labelDueDate: "תאריך יעד",
  labelStatus: "סטטוס",
  labelPriority: "עדיפות",
  labelAssignee: "אחראי",
  labelTags: "תגיות",
  titlePlaceholder: "שם המשימה",
  descriptionPlaceholder: "תיאור (אופציונלי)",
  tagPlaceholder: "הקלד תגית ולחץ Enter",
  btnSaveTask: "שמור משימה",
  btnUpdateTask: "עדכן משימה",
  btnCancel: "ביטול",

  // Priority
  priorityHigh: "גבוה",
  priorityMedium: "בינוני",
  priorityLow: "נמוך",

  // Status options in modal
  statusTodo: "משימות",
  statusInProgress: "משימות בטיפול",
  statusWaitingClient: "ממתינים לאישור לקוח",
  statusOnHold: "משימות בהשהייה",
  statusCompletedMonth: "בוצעו החודש",
  statusDone: "משימות שבוצעו",

  // Toasts
  toastCreated: "המשימה נוצרה בהצלחה",
  toastUpdated: "המשימה עודכנה בהצלחה",
  toastDeleted: "המשימה נמחקה בהצלחה",
  toastCreateFailed: "הוספת משימה נכשלה",
  toastUpdateFailed: "עדכון משימה נכשל",
  toastDeleteFailed: "שגיאה במחיקת המשימה",

  // Task card
  editTask: "עריכת משימה",
  deleteTask: "מחיקת משימה",
  editBtnTitle: "עריכה",
  deleteBtnTitle: "מחיקה",

  // Confirm dialog
  confirmBtn: "אישור",
  cancelBtn: "ביטול",

  // Completed tasks
  doneSearchPlaceholder: "חיפוש משימה...",
  noCompletedTasks: "אין משימות שבוצעו",
  noMatchingTasks: "לא נמצאו משימות התואמות לפילטרים",
  clearFilters: "נקה פילטרים",
  nextPage: "הבא",
  prevPage: "הקודם",

  // Filter labels (completed tasks view)
  filterPriority: "עדיפות",
  filterAssignee: "אחראי",
  filterTag: "תגית",
  filterFromDate: "מתאריך",
  filterToDate: "עד תאריך",
  filterPriorityHigh: "גבוהה",
  filterPriorityMedium: "בינונית",
  filterPriorityLow: "נמוכה",

  // Filter sidebar labels (kanban view)
  sidebarTitle: "פילטרים",
  sidebarAssignee: "אחראי משימה",
  sidebarPriority: "דחיפות משימה",
  sidebarDueDate: "תאריך יעד לסיום",
  sidebarStartDate: "תאריך התחלת משימה",
  sidebarAllEmployees: "כל העובדים",
  sidebarAllPriorities: "כל הדחיפויות",
  sidebarPriorityLow: "נמוכה",
  sidebarPriorityMedium: "בינונית",
  sidebarPriorityHigh: "גבוהה",
  sidebarPriorityCritical: "קריטית",
  sidebarClearFilters: "נקה פילטרים",
  sidebarNoActiveFilters: "אין פילטרים פעילים",

  // My sheets
  noSheets: "אין דפי משימות",
  sheetTypeDaily: "יומי",
  sheetTypeWeekly: "שבועי",
  resetSheet: "איפוס דף המשימות",
  toastItemCompleted: "המשימה הושלמה בהצלחה",
  toastItemUncompleted: "המשימה סומנה כלא הושלמה",
  toastSheetReset: "דף המשימות אופס בהצלחה",

  // Manage sheets
  manageTitle: "ניהול דפי משימות",
  newSheet: "דף משימות חדש",
  createSheetModal: "יצירת דף משימות חדש",
  editSheetModal: "עריכת דף משימות",

  // Error
  loadError: "שגיאה בטעינת המשימות",
  retry: "נסה שוב",

  // Done view
  doneViewHeader: "כל המשימות שסומנו כבוצעו",
  completedAt: "הושלם:",

  // Assignee select
  noAssignee: "ללא אחראי",
} as const;
