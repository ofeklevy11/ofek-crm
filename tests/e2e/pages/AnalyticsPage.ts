import { type Page, type Locator } from "@playwright/test";

export const ANALYTICS_TEXT = {
  // Page header
  pageTitle: "אנליטיקות ותובנות",
  pageSubtitle:
    "מרכז הבקרה שלך לעסקים - צפה בנתונים בזמן אמת, נתח ביצועים וקבל החלטות מבוססות נתונים.",

  // Action buttons
  createButton: "חדש",
  aiCreateButton: "צור עם AI",
  graphsLink: "גרפים",
  aiReportButton: "דוח AI (בקרוב...)",

  // Folder bar
  allAnalytics: "כל האנליטיקות",
  createFolderTitle: "צור תיקייה חדשה",

  // Filter tabs
  filterAll: "הכל",
  filterManual: "ידני",
  filterAutomation: "אוטומציה",

  // Info banners
  automationGuideBanner: "אוטומציות אנליטיקה",
  cacheInfoBanner: "מערכת קאש חכמה",

  // Card badges
  badgeAutomation: "אוטומציה",
  badgeManual: "ידני",

  // Card footer
  refreshButton: "רענן נתון",
  detailsButton: "צפה ברשימה המלאה",

  // Card actions (hover)
  moveToFolder: "העבר לתיקייה",
  addAutomation: "הוסף אוטומציה",
  editView: "ערוך תצוגה",
  editAutomation: "ערוך אוטומציה",
  changeColor: "שנה צבע",
  deleteView: "מחק תצוגה",

  // Empty state
  emptyState: "אין נתונים להצגה",

  // Create folder modal
  createFolderHeading: "יצירת תיקייה חדשה",
  folderNamePlaceholder: "שם התיקייה...",
  createFolderButton: "צור תיקייה",
  cancelButton: "ביטול",

  // Create view modal types
  viewTypeCount: "ספירה / פילוח",
  viewTypeConversion: "אחוז המרה",
  viewTypeGraph: "גרף ויזואלי",

  // Loading
  loadingSpinner: "animate-spin",

  // Error state
  errorHeading: "שגיאה בטעינת הנתונים",
  retryButton: "נסה שוב",

  // Refresh quota
  refreshQuotaPattern: /נותרו \d+ מתוך \d+ רענונים/,
  refreshQuotaExhausted: "נגמרה מכסת הרענונים",

  // Confirm dialogs
  confirmDeleteView: "האם אתה בטוח שברצונך למחוק את התצוגה?",
  confirmDeleteFolder:
    "האם אתה בטוח שברצונך למחוק את התיקייה?",
  alertDeleteAutomationView:
    "על מנת למחוק אנליטיקה שנוצרה על ידי אוטומציה נצטרך למחוק את האוטומציה עצמה בעמוד אוטומציות.",

  // Toast messages
  toastFolderCreated: "התיקייה נוצרה בהצלחה",
  toastViewDeleted: "התצוגה נמחקה בהצלחה",
  toastFolderDeleted: "התיקייה נמחקה בהצלחה",
  toastRefreshing: "מרענן נתונים ברקע...",
} as const;

export class AnalyticsPage {
  readonly page: Page;

  // Page elements
  readonly pageTitle: Locator;
  readonly pageSubtitle: Locator;

  // Action buttons
  readonly createButton: Locator;
  readonly aiCreateButton: Locator;
  readonly graphsLink: Locator;
  readonly aiReportButton: Locator;

  // Folder bar
  readonly allAnalyticsButton: Locator;
  readonly createFolderButton: Locator;

  // Filter tabs
  readonly filterAll: Locator;
  readonly filterManual: Locator;
  readonly filterAutomation: Locator;

  // Info banners
  readonly automationGuideBanner: Locator;
  readonly cacheInfoBanner: Locator;

  // Empty state
  readonly emptyState: Locator;

  // Error state
  readonly errorHeading: Locator;
  readonly retryButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.pageTitle = page.getByRole("heading", {
      name: ANALYTICS_TEXT.pageTitle,
    });
    this.pageSubtitle = page.getByText(ANALYTICS_TEXT.pageSubtitle);

    this.createButton = page.getByRole("button", {
      name: ANALYTICS_TEXT.createButton,
    });
    this.aiCreateButton = page.getByRole("button", {
      name: ANALYTICS_TEXT.aiCreateButton,
    });
    this.graphsLink = page.getByRole("link", {
      name: ANALYTICS_TEXT.graphsLink,
    });
    this.aiReportButton = page.getByRole("button", {
      name: ANALYTICS_TEXT.aiReportButton,
    });

    this.allAnalyticsButton = page.getByRole("button", {
      name: ANALYTICS_TEXT.allAnalytics,
    });
    this.createFolderButton = page.locator(
      `[title="${ANALYTICS_TEXT.createFolderTitle}"]`,
    );

    this.filterAll = page.getByRole("button", {
      name: ANALYTICS_TEXT.filterAll,
      exact: true,
    });
    this.filterManual = page.getByRole("button", {
      name: ANALYTICS_TEXT.filterManual,
      exact: true,
    });
    this.filterAutomation = page.getByRole("button", {
      name: ANALYTICS_TEXT.filterAutomation,
      exact: true,
    });

    this.automationGuideBanner = page.getByText(
      ANALYTICS_TEXT.automationGuideBanner,
    );
    this.cacheInfoBanner = page.getByText(ANALYTICS_TEXT.cacheInfoBanner);

    this.emptyState = page.getByRole("heading", {
      name: ANALYTICS_TEXT.emptyState,
    });

    this.errorHeading = page.getByRole("heading", {
      name: ANALYTICS_TEXT.errorHeading,
    });
    this.retryButton = page.getByRole("button", {
      name: ANALYTICS_TEXT.retryButton,
    });
  }

  async goto() {
    await this.page.goto("/analytics");
    await this.pageTitle.waitFor({ timeout: 10_000 });
  }

  // ── Card selectors ────────────────────────────────────────
  // Note: `.grid > div` depends on Tailwind grid class. No data-testid available;
  // combined with `has: h3` filtering this is specific enough to identify cards.

  getAnalyticsCards() {
    return this.page
      .locator(".grid > div")
      .filter({ has: this.page.locator("h3") });
  }

  getCardByName(name: string) {
    return this.page
      .locator(".grid > div")
      .filter({ has: this.page.getByRole("heading", { name, exact: true }) });
  }

  // ── Card action buttons (hover) ───────────────────────────

  getCardMoveButton(cardName: string) {
    return this.getCardByName(cardName).locator(
      `[title="${ANALYTICS_TEXT.moveToFolder}"]`,
    );
  }

  getCardAddAutomationButton(cardName: string) {
    return this.getCardByName(cardName).locator(
      `[title="${ANALYTICS_TEXT.addAutomation}"]`,
    );
  }

  getCardEditButton(cardName: string) {
    return this.getCardByName(cardName).locator(
      `[title="${ANALYTICS_TEXT.editView}"], [title="${ANALYTICS_TEXT.editAutomation}"]`,
    );
  }

  getCardColorButton(cardName: string) {
    return this.getCardByName(cardName).locator(
      `[title="${ANALYTICS_TEXT.changeColor}"]`,
    );
  }

  getCardDeleteButton(cardName: string) {
    return this.getCardByName(cardName).locator(
      `[title="${ANALYTICS_TEXT.deleteView}"]`,
    );
  }

  getCardRefreshButton(cardName: string) {
    return this.getCardByName(cardName).locator(
      `[title="${ANALYTICS_TEXT.refreshButton}"]`,
    );
  }

  getCardDetailsButton(cardName: string) {
    return this.getCardByName(cardName).locator(
      `[title="${ANALYTICS_TEXT.detailsButton}"]`,
    );
  }

  // ── Folder management ─────────────────────────────────────

  // Folders are rendered as <div> with onClick, not <button>.
  // Use getByText to match the folder name text content.
  selectFolder(name: string) {
    // Return the group div wrapper so .locator("button") finds the delete button inside it.
    // Scoped to .overflow-x-auto to avoid matching card .group elements.
    return this.page.locator(".overflow-x-auto div.group").filter({
      has: this.page.getByText(name, { exact: true }),
    });
  }

  async openCreateFolderModal() {
    await this.createFolderButton.click();
  }

  getFolderModal() {
    return this.page.locator(".fixed.inset-0").filter({
      has: this.page.getByText(ANALYTICS_TEXT.createFolderHeading),
    });
  }

  getFolderNameInput() {
    return this.page.getByPlaceholder(ANALYTICS_TEXT.folderNamePlaceholder);
  }

  getSaveFolderButton() {
    return this.page.getByRole("button", {
      name: ANALYTICS_TEXT.createFolderButton,
    });
  }

  getCancelFolderButton() {
    return this.page.getByRole("button", {
      name: ANALYTICS_TEXT.cancelButton,
    });
  }

  async createFolder(name: string) {
    await this.openCreateFolderModal();
    await this.getFolderNameInput().fill(name);
    await this.getSaveFolderButton().click();
  }

  // ── Filter tabs ───────────────────────────────────────────

  async clickFilter(type: "all" | "manual" | "automation") {
    switch (type) {
      case "all":
        await this.filterAll.click();
        break;
      case "manual":
        await this.filterManual.click();
        break;
      case "automation":
        await this.filterAutomation.click();
        break;
    }
  }

  // ── Create view modal ─────────────────────────────────────

  async openCreateModal() {
    await this.createButton.click();
  }

  // ── Confirm dialog (Radix AlertDialog) ─────────────────────

  getAlertDialog() {
    return this.page.locator('[role="alertdialog"]');
  }

  async confirmAlertDialog() {
    const dialog = this.getAlertDialog();
    await dialog.getByRole("button", { name: "אישור" }).click();
  }

  async cancelAlertDialog() {
    const dialog = this.getAlertDialog();
    await dialog.getByRole("button", { name: ANALYTICS_TEXT.cancelButton }).click();
  }

  // ── AI creator ────────────────────────────────────────────

  /** Returns a heading unique to the AI creator panel */
  getAICreatorHeading() {
    return this.page.getByRole("heading", { name: "יצירת אנליטיקה חכמה עם AI" });
  }

  async closeAICreatorPanel() {
    const aiOverlay = this.page.locator(".fixed.inset-0").filter({
      has: this.page.getByRole("heading", { name: "יצירת אנליטיקה חכמה עם AI" }),
    });
    // Scope to the header row (border-b div containing the heading).
    // The X close button is always the last button in the header.
    const header = aiOverlay.locator("div.border-b").filter({
      has: this.page.getByRole("heading", { name: "יצירת אנליטיקה חכמה עם AI" }),
    }).first();
    await header.getByRole("button").last().click();
  }

  getEditViewModal() {
    return this.page.locator(".fixed.inset-0").filter({
      has: this.page.getByRole("heading", { name: "עריכת תצוגת ניתוח" }),
    });
  }

  getCreateViewModal() {
    return this.page.locator(".fixed.inset-0").filter({
      has: this.page.getByRole("button", { name: ANALYTICS_TEXT.viewTypeCount }),
    });
  }

  getDetailsModal(cardName: string) {
    return this.page.locator(".fixed.inset-0").filter({
      has: this.page.getByRole("heading", { name: cardName, level: 3 }),
    });
  }

  // ── Toast selectors ───────────────────────────────────────

  getToast() {
    return this.page.locator("[data-sonner-toast]");
  }

  getToastByText(text: string) {
    return this.page.locator("[data-sonner-toast]").filter({ hasText: text });
  }

  // ── Refresh quota ─────────────────────────────────────────

  getRefreshQuotaText() {
    return this.page.getByText(ANALYTICS_TEXT.refreshQuotaPattern);
  }
}
