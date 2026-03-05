import { type Page, type Locator } from "@playwright/test";

export const WORKERS_TEXT = {
  pageTitle: "ניהול עובדים",
  pageSubtitle: "גיוס, קליטה, הדרכה ומעקב אחר עובדים",

  // Stat cards
  statTotal: "סה״כ עובדים",
  statOnboarding: "בקליטה",
  statActive: "פעילים",
  statDepartments: "מחלקות",

  // Tabs
  tabWorkers: "עובדים",
  tabDepartments: "מחלקות",
  tabOnboarding: "מסלולי קליטה",

  // New buttons
  newWorker: "עובד חדש",
  newDepartment: "מחלקה חדשה",
  newPath: "מסלול חדש",

  // Search & filters
  searchPlaceholder: "חיפוש עובד...",
  allStatuses: "כל הסטטוסים",
  allDepartments: "כל המחלקות",

  // Status options
  statusOnboarding: "בקליטה",
  statusActive: "פעיל",
  statusOnLeave: "בחופשה",
  statusTerminated: "סיום עבודה",

  // Empty states
  noWorkers: "אין עובדים",
  noDepartments: "אין מחלקות",
  noPaths: "אין מסלולי קליטה",
  noDepartmentsYet: "טרם נוצרו מחלקות",
  createNewDepartment: "צור מחלקה חדשה",
  noFilterResults: "לא נמצאו עובדים התואמים לסינון",

  // Menu actions
  view: "צפייה",
  edit: "עריכה",
  delete: "מחיקה",

  // Toasts
  workerCreated: "העובד נוצר בהצלחה",
  workerUpdated: "העובד עודכן בהצלחה",
  workerDeleted: "העובד נמחק בהצלחה",
  departmentCreated: "המחלקה נוצרה בהצלחה",
  departmentUpdated: "המחלקה עודכנה בהצלחה",
  departmentDeleted: "המחלקה נמחקה בהצלחה",
  pathCreated: "מסלול הכשרה נוצר בהצלחה",
  pathUpdated: "מסלול הכשרה עודכן בהצלחה",
  pathDeleted: "מסלול הכשרה נמחק בהצלחה",

  // Validation alerts
  alertNameRequired: "יש למלא שם פרטי ושם משפחה",
  alertDeptNameRequired: "יש להזין שם למחלקה",
  alertDeptHasWorkers:
    "לא ניתן למחוק מחלקה עם עובדים פעילים. יש להעביר אותם למחלקה אחרת קודם.",

  // Validation alerts (additional)
  alertDeptRequired: "יש לבחור מחלקה",
  alertPathNameRequired: "יש להזין שם למסלול",

  // Onboarding
  createPathHeading: "מסלול קליטה חדש",
  editPathHeading: "עריכת מסלול קליטה",
  defaultBadge: "ברירת מחדל",
  required: "חובה",
  optional: "אופציונלי",
} as const;

export class WorkersPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly pageSubtitle: Locator;

  // Stat cards grid
  readonly statCardsGrid: Locator;
  readonly statTotal: Locator;
  readonly statOnboarding: Locator;
  readonly statActive: Locator;
  readonly statDepartments: Locator;

  // Tabs
  readonly tabWorkers: Locator;
  readonly tabDepartments: Locator;
  readonly tabOnboarding: Locator;

  // Filters
  readonly searchInput: Locator;
  readonly statusFilter: Locator;
  readonly departmentFilter: Locator;

  constructor(page: Page) {
    this.page = page;

    this.pageTitle = page.getByRole("heading", {
      name: WORKERS_TEXT.pageTitle,
    });
    this.pageSubtitle = page.getByText(WORKERS_TEXT.pageSubtitle);

    // Scope stat cards to the grid container to avoid matching tab text
    this.statCardsGrid = page.locator(".grid").first();
    this.statTotal = this.statCardsGrid.getByText(WORKERS_TEXT.statTotal);
    this.statOnboarding = this.statCardsGrid.getByText(
      WORKERS_TEXT.statOnboarding,
    );
    this.statActive = this.statCardsGrid.getByText(WORKERS_TEXT.statActive);
    this.statDepartments = this.statCardsGrid.getByText(
      WORKERS_TEXT.statDepartments,
    );

    this.tabWorkers = page.getByRole("button", {
      name: new RegExp(WORKERS_TEXT.tabWorkers),
    });
    this.tabDepartments = page.getByRole("button", {
      name: new RegExp(WORKERS_TEXT.tabDepartments),
    });
    this.tabOnboarding = page.getByRole("button", {
      name: new RegExp(WORKERS_TEXT.tabOnboarding),
    });

    this.searchInput = page.getByPlaceholder(WORKERS_TEXT.searchPlaceholder);
    this.statusFilter = page
      .locator("select")
      .filter({
        has: page.locator(`option:text("${WORKERS_TEXT.allStatuses}")`),
      });
    this.departmentFilter = page
      .locator("select")
      .filter({
        has: page.locator(`option:text("${WORKERS_TEXT.allDepartments}")`),
      });
  }

  async goto() {
    await this.page.goto("/workers");
    await this.pageTitle.waitFor();
  }

  async clickTab(name: string) {
    await this.page.getByRole("button", { name: new RegExp(name) }).click();
    // Rely on Playwright auto-wait on next assertion instead of waitForTimeout
  }

  async clickNewButton() {
    await this.page
      .locator("button")
      .filter({ hasText: /עובד חדש|מחלקה חדשה|מסלול חדש/ })
      .first()
      .click();
  }

  async searchWorker(query: string) {
    await this.searchInput.fill(query);
  }

  async clearSearch() {
    await this.searchInput.clear();
  }

  async filterByStatus(value: string) {
    await this.statusFilter.selectOption(value);
  }

  async filterByDepartment(name: string) {
    if (name === WORKERS_TEXT.allDepartments) {
      await this.departmentFilter.selectOption("");
    } else {
      await this.departmentFilter.selectOption({ label: name });
    }
  }

  // ── Scoped row/card helpers ──

  /** Get a scoped locator for a worker row by full name */
  getWorkerRow(firstName: string, lastName: string): Locator {
    return this.page
      .locator("div.flex.items-center")
      .filter({ hasText: `${firstName} ${lastName}` })
      .first();
  }

  /** Get a scoped locator for a department card by name */
  getDeptCard(name: string): Locator {
    return this.page
      .locator("div.bg-white")
      .filter({ hasText: name })
      .first();
  }

  /** Get a scoped locator for an onboarding path row by name */
  getPathRow(name: string): Locator {
    return this.page
      .locator("div.px-6.py-4.flex.items-center")
      .filter({ hasText: name })
      .first();
  }

  // ── Menu helpers (scoped to row) ──

  /** Open the 3-dot menu for a worker row by name */
  async openWorkerMenu(firstName: string, lastName: string) {
    const row = this.getWorkerRow(firstName, lastName);
    await row.locator("div.relative button").first().click();
  }

  /** Open the 3-dot menu for a department card */
  async openDepartmentMenu(name: string) {
    const card = this.getDeptCard(name);
    await card.locator("button").first().click();
  }

  /** Open the 3-dot menu for an onboarding path */
  async openPathMenu(name: string) {
    const row = this.getPathRow(name);
    await row.locator("div.relative button").first().click();
  }

  // ── Expand/Collapse helpers (scoped to row) ──

  /** Expand a worker row */
  async expandWorkerRow(firstName: string, lastName: string) {
    const row = this.getWorkerRow(firstName, lastName);
    await row
      .locator("button")
      .filter({ has: this.page.locator("svg.lucide-chevron-down") })
      .click();
  }

  /** Collapse a worker row */
  async collapseWorkerRow(firstName: string, lastName: string) {
    const row = this.getWorkerRow(firstName, lastName);
    await row
      .locator("button")
      .filter({ has: this.page.locator("svg.lucide-chevron-up") })
      .click();
  }

  /** Expand an onboarding path row by name */
  async expandPath(name: string) {
    const row = this.getPathRow(name);
    await row
      .locator("button")
      .filter({ has: this.page.locator("svg.lucide-chevron-down") })
      .click();
  }

  /** Collapse an onboarding path row by name */
  async collapsePath(name: string) {
    const row = this.getPathRow(name);
    await row
      .locator("button")
      .filter({ has: this.page.locator("svg.lucide-chevron-up") })
      .click();
  }

  // ── Stat card value helper ──

  /** Read the numeric value displayed in a stat card by its label */
  getStatCardValue(label: string): Locator {
    const card = this.statCardsGrid
      .locator("div.bg-white\\/80, div[class*='bg-white']")
      .filter({ hasText: label })
      .first();
    return card.locator("p").first();
  }

  // ── Toast helper ──

  /** Get a toast locator by text using [data-sonner-toast] pattern */
  getToast(text: string): Locator {
    return this.page
      .locator("[data-sonner-toast]")
      .filter({ hasText: text });
  }

  // ── Destructive dialog helpers ──

  /** Confirm a destructive action by typing the confirmation phrase and clicking delete */
  async confirmDestructiveDelete() {
    const dialog = this.page.locator('[role="alertdialog"]');
    await dialog.locator('input[aria-label="הקלד ביטוי אישור"]').fill("מחק");
    await dialog.getByRole("button", { name: "מחק" }).click();
  }

  /** Dismiss a destructive confirm dialog */
  async dismissDestructiveDelete() {
    const dialog = this.page.locator('[role="alertdialog"]');
    await dialog.getByRole("button", { name: "ביטול" }).click();
  }

  /** Dismiss an alert dialog */
  async dismissAlert() {
    const dialog = this.page.locator('[role="alertdialog"]');
    await dialog.getByRole("button", { name: "אישור" }).click();
  }

  // ── Path modal helpers ──

  /** Get the path name input in the path modal */
  getPathNameInput(): Locator {
    return this.page.locator('input[placeholder*="קליטת עובד חדש"]');
  }

  /** Get the "צור מסלול" button in the create path modal */
  getCreatePathButton(): Locator {
    return this.page.getByRole("button", { name: "צור מסלול" });
  }

  /** Get the "שמור שינויים" button in the edit path modal */
  getSavePathButton(): Locator {
    return this.page.getByRole("button", { name: "שמור שינויים" });
  }

  // ── Modal backdrop helper ──

  /** Get the modal backdrop overlay */
  getModalBackdrop(): Locator {
    return this.page.locator(".fixed.inset-0.bg-black\\/50");
  }
}
