import { type Page, type Route } from "@playwright/test";
import path from "path";

const AUTH_DIR = path.join(__dirname, "..", ".auth");
export const STORAGE_ADMIN = path.join(AUTH_DIR, "admin.json");
export const STORAGE_BASIC = path.join(AUTH_DIR, "basic.json");
export const STORAGE_NO_TASKS = path.join(AUTH_DIR, "no-tasks.json");

// ── Hebrew text constants used across tests ──

export const TEXT = {
  // Landing page
  heroTitle: "הפתרון המושלם",
  heroSubtitle: "לניהול העסק שלך",
  loginButton: "כניסה למערכת",
  registerButton: "הרשמה",
  crmBadge: "מערכת CRM חכמה לניהול העסק",
  featureLeads: "ניהול לידים ולקוחות",
  featureAutomations: "אוטומציות חכמות",
  featureReports: "דוחות ונתונים",

  // Navbar (unauthenticated)
  navLogin: "התחבר",

  // Dashboard (authenticated)
  dashboardTitle: "לוח בקרה",
  dashboardSubtitle: "סקירה כללית של העסק שלך",
  myDashboard: "הדאשבורד שלי",

  // Dashboard actions
  addWidget: "הוסף וידג׳ט",
  addMiniDashboard: "הוסף מיני דאשבורד (תצוגות טבלה)",
  addGoalsTable: "הוסף טבלת יעדים",
  addAnalyticsTable: "הוסף טבלת אנליטיקות",

  // Mini widgets (conditional)
  miniCalendar: "מיני יומן",
  miniTasks: "מיני משימות",
  miniQuotes: "מיני הצעות מחיר",
  miniMeetings: "מיני פגישות",

  // Empty dashboard
  emptyDashboard: "הדאשבורד שלך ריק",
  addFirstWidget: "הוסף וידג׳ט ראשון",

  // Add widget modal
  addWidgetModalTitle: "הוספת וידג׳ט לדאשבורד",
  tabAnalytics: "אנליטיקות",
  tabGoals: "יעדים",
  tabTableViews: "תצוגות טבלה",
  noAnalytics: "לא נמצאו אנליטיקות זמינות.",
  noGoals: "לא נמצאו יעדים זמינים.",
  cancelButton: "ביטול",
  addToDashboard: "הוסף לדאשבורד",

  // Delete confirmation
  deleteModalTitle: "מחיקת וידג׳ט",
  deleteConfirmButton: "מחק",
  widgetRemoveTitle: "הסר מהדאשבורד",

  // Toast messages
  toastMiniMeetingsAdded: "מיני פגישות נוסף לדאשבורד",

  // Table views
  selectTable: "בחר טבלה",

  // No access
  noAccess: "אין לך גישה לדאשבורד",
  contactAdmin: "אנא פנה למנהל המערכת לקבלת הרשאות מתאימות",

  // Rate limit
  rateLimitTitle: "בוצעו יותר מדי פניות",
  rateLimitRetry: "נסה שוב עכשיו",

  // Login form
  loginFormEmail: "כתובת אימייל",
  loginFormPassword: "סיסמא",
  loginFormSubmit: "התחבר למערכת",
  loginFormLoading: "מתחבר...",
  loginFormRegisterLink: "פתח חשבון חדש",

  // Navbar links
  navDashboard: "לוח בקרה",

  // Notification bell
  notificationBell: "התראות",

  // Mobile menu
  mobileMenu: "תפריט",
  mobileMenuWarning: "שים לב!",

  // Toast errors
  toastWidgetError: "שגיאה בהוספת וידג'ט",

  // Widget collapse/expand
  collapseWidget: "הסתר",
  expandWidget: "הצג",

  // Mini config modal
  configModalTitle: "הגדרת ווידג׳ט",
  configModalConfirm: "הוסף ווידג׳ט",

  // Calendar presets
  presetToday: "היום",
  presetThisWeek: "השבוע",
  preset7Days: "7 ימים",
  preset14Days: "14 ימים",
  presetThisMonth: "החודש",

  // Tasks presets
  presetOverdue: "באיחור",
  presetMyTasks: "המשימות שלי",
  presetAllActive: "כל הפעילות",
  presetDueThisWeek: "לשבוע",

  // Quotes presets
  presetRecent: "אחרונות",
  presetPending: "ממתינות",
  presetClosed: "עסקאות סגורות",

  // Widget content (for collapse assertions)
  viewAllMeetings: "צפה בכל הפגישות",

  // Login page heading
  welcomeHeading: "ברוכים הבאים",

  // Specialized modal headings
  addMiniDashboardModalTitle: "הוספת מיני דאשבורד",
  addGoalsTableModalTitle: "הוספת טבלת יעדים",
  addAnalyticsTableModalTitle: "הוספת טבלת אנליטיקות",

  // Specialized modal empty states
  noViewsAvailable: "אין תצוגות זמינות",
  noGoalsAvailable: "לא נמצאו יעדים זמינים.",
  noAnalyticsAvailable: "לא נמצאו אנליטיקות זמינות",

  // Settings gear / edit mode
  settingsButton: "הגדרות",
  configModalEditTitle: "עריכת הגדרות",
} as const;

// ── Server action interceptor ──

/**
 * Intercept Next.js server action calls.
 * Server actions are POSTed to the page URL with `Next-Action` header.
 */
export async function interceptServerAction(
  page: Page,
  actionId: string,
  handler: (route: Route) => Promise<void> | void
) {
  await page.route("**/*", async (route) => {
    const headers = route.request().headers();
    if (
      route.request().method() === "POST" &&
      headers["next-action"]?.includes(actionId)
    ) {
      await handler(route);
    } else {
      await route.fallback();
    }
  });
}

/**
 * Mock a Next.js server action to return specific data.
 * The response format wraps the data for RSC protocol.
 */
export async function mockServerAction(
  page: Page,
  actionId: string,
  responseData: unknown
) {
  await interceptServerAction(page, actionId, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/x-component",
      body: `0:${JSON.stringify(responseData)}\n`,
    });
  });
}

/**
 * Intercept ALL Next.js server action calls (any POST with Next-Action header).
 * Returns a cleanup function to remove the route handler.
 */
export async function interceptAllServerActions(
  page: Page,
  handler: (route: Route) => Promise<void> | void
): Promise<() => Promise<void>> {
  const routeHandler = async (route: Route) => {
    const headers = route.request().headers();
    if (
      route.request().method() === "POST" &&
      headers["next-action"]
    ) {
      await handler(route);
    } else {
      await route.fallback();
    }
  };

  await page.route("**/*", routeHandler);

  return async () => {
    await page.unroute("**/*", routeHandler);
  };
}

/**
 * Mock a fetch call by URL pattern.
 */
export async function mockApiRoute(
  page: Page,
  urlPattern: string,
  response: { status?: number; body: unknown }
) {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      status: response.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(response.body),
    });
  });
}
