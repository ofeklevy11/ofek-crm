import { type Page, type Locator } from "@playwright/test";

export const AUTO_TEXT = {
  // Page
  pageTitle: "ניהול אוטומציות",
  pageSubtitle: "צור ונהל כללים אוטומטיים לשליחת התראות וביצוע פעולות במערכת.",
  disclaimerTitle: "הערה חשובה לגבי אוטומציות מבוססות זמן",

  // Buttons
  createButton: "אוטומציה חדשה",
  aiCreateButton: "צור אוטומציה עם AI",
  multiEventButton: "אירועים מרובים",

  // Folder sidebar
  allAutomations: "כל האוטומציות",
  folderPlaceholder: "שם תיקיה...",
  saveFolder: "שמור",
  cancelFolder: "בטל",
  noFolder: "ללא תיקייה",

  // Folder section title
  foldersTitle: "תיקיות",

  // Toggle
  activeToggle: "פעיל - לחץ לכיבוי",
  inactiveToggle: "כבוי - לחץ להפעלה",

  // Empty state
  emptyState: "אין אוטומציות בתיקייה זו.",

  // Toasts
  toastDeleted: "האוטומציה נמחקה בהצלחה",
  toastActivated: "האוטומציה הופעלה",
  toastDeactivated: "האוטומציה הושבתה",

  // Confirm
  confirmDelete: "האם אתה בטוח שברצונך למחוק אוטומציה זו?",
  confirmDeleteFolder: "האם אתה בטוח? אוטומציות בתיקייה יוסרו מהתיקייה.",
  confirmBtn: "אישור",
  cancelBtn: "ביטול",

  // Modal headings
  wizardTitle: "אשף האוטומציות",
  editTitle: "עריכת אוטומציה",
  multiEventTitle: "אשף אוטומציה מרובת שלבים",
  aiTitle: "צור אוטומציה עם AI",
  nextStep: "המשך לשלב הבא",

  // Rate limit
  rateLimitMessage: "בוצעו יותר מדי פניות",

  // Badges
  viewBadge: "תצוגה",
} as const;

export class AutomationsPage {
  readonly page: Page;

  // Page elements
  readonly pageTitle: Locator;
  readonly pageSubtitle: Locator;
  readonly disclaimerBanner: Locator;

  // Action buttons
  readonly createButton: Locator;
  readonly aiCreateButton: Locator;
  readonly multiEventButton: Locator;

  // Folder sidebar
  readonly folderSidebar: Locator;
  readonly allAutomationsButton: Locator;
  readonly createFolderButton: Locator;
  readonly folderNameInput: Locator;
  readonly saveFolderButton: Locator;
  readonly cancelFolderButton: Locator;

  // Empty state
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;

    this.pageTitle = page.getByRole("heading", { name: AUTO_TEXT.pageTitle });
    this.pageSubtitle = page.getByText(AUTO_TEXT.pageSubtitle);
    this.disclaimerBanner = page.getByText(AUTO_TEXT.disclaimerTitle);

    this.createButton = page.getByRole("button", {
      name: AUTO_TEXT.createButton,
    });
    this.aiCreateButton = page.getByRole("button", {
      name: AUTO_TEXT.aiCreateButton,
    });
    this.multiEventButton = page.getByRole("button", {
      name: AUTO_TEXT.multiEventButton,
    });

    this.folderSidebar = page.locator("div").filter({ hasText: AUTO_TEXT.foldersTitle }).first();
    this.allAutomationsButton = page.getByRole("button", {
      name: AUTO_TEXT.allAutomations,
      exact: true,
    });
    this.createFolderButton = page
      .locator("div")
      .filter({ hasText: AUTO_TEXT.foldersTitle })
      .getByRole("button")
      .first();
    this.folderNameInput = page.getByPlaceholder(AUTO_TEXT.folderPlaceholder);
    this.saveFolderButton = page.getByRole("button", {
      name: AUTO_TEXT.saveFolder,
    });
    this.cancelFolderButton = page.getByRole("button", {
      name: AUTO_TEXT.cancelFolder,
    });

    this.emptyState = page.getByText(AUTO_TEXT.emptyState);
  }

  async goto() {
    await this.page.goto("/automations");
    await this.page.waitForLoadState("networkidle");
  }

  // ── Card selectors ────────────────────────────────────────

  getAutomationCards() {
    return this.page.locator(".grid > div.shadow");
  }

  getCardByName(name: string) {
    return this.page.locator(".grid > div.shadow").filter({ hasText: name });
  }

  // ── Card button selectors (centralized) ───────────────────

  getToggleButton(cardName: string) {
    return this.getCardByName(cardName).getByText(
      new RegExp(`${AUTO_TEXT.activeToggle}|${AUTO_TEXT.inactiveToggle}`),
    );
  }

  getDeleteButton(cardName: string) {
    return this.getCardByName(cardName).locator(
      'button:has(svg.lucide-trash-2)',
    );
  }

  getEditButton(cardName: string) {
    return this.getCardByName(cardName).locator(
      'button:has(svg.lucide-square-pen)',
    );
  }

  getFolderDropdownButton(cardName: string) {
    return this.getCardByName(cardName).locator(
      'button:has(svg.lucide-folder-input)',
    );
  }

  // ── Content heading (h2 that shows folder name) ─────────

  getContentHeading() {
    return this.page.getByRole("heading", { level: 2 });
  }

  // ── Folder dropdown item (scoped to card's absolute dropdown) ──

  getFolderDropdownItem(cardName: string, folderName: string) {
    return this.getCardByName(cardName)
      .locator(".absolute")
      .getByText(folderName);
  }

  // ── Modal selectors (custom overlays, NOT role=dialog) ────

  /** Get the standard automation modal (wizard or edit) by heading text */
  getAutomationModal() {
    return this.page
      .locator(".fixed.inset-0")
      .filter({
        has: this.page.locator("h3").filter({
          hasText: new RegExp(`${AUTO_TEXT.wizardTitle}|${AUTO_TEXT.editTitle}`),
        }),
      });
  }

  /** Get the multi-event automation modal by heading text */
  getMultiEventModal() {
    return this.page
      .locator(".fixed.inset-0")
      .filter({ hasText: AUTO_TEXT.multiEventTitle });
  }

  /** Get the AI automation creator modal by heading text */
  getAICreatorModal() {
    return this.page
      .locator(".fixed.inset-0")
      .filter({ hasText: AUTO_TEXT.aiTitle });
  }

  // ── Modal close helpers ──────────────────────────────────

  /** Close AutomationModal or MultiEventModal via the X button (rounded-full with lucide-x) */
  async closeModalViaXButton(modal: Locator) {
    // .first() targets header close button, not action-item delete buttons
    await modal.locator("button.rounded-full:has(svg.lucide-x)").first().click();
  }

  /** Close AICreator modal via its X button (inline SVG, no lucide class) */
  async closeAICreatorViaXButton(modal: Locator) {
    // The AI creator header X button is the first button with an SVG child in the header (border-b) area
    await modal.locator(".border-b").first().locator("button:has(svg)").first().click();
  }

  // ── Alert dialog (Radix AlertDialog) ──────────────────────

  /** Get the scoped Radix AlertDialog */
  getAlertDialog() {
    return this.page.locator('[role="alertdialog"]');
  }

  /** Click confirm inside the AlertDialog */
  async confirmAlertDialog() {
    const dialog = this.getAlertDialog();
    const btn = dialog.getByRole("button", { name: AUTO_TEXT.confirmBtn });
    await btn.click();
  }

  /** Click cancel inside the AlertDialog */
  async cancelAlertDialog() {
    const dialog = this.getAlertDialog();
    const btn = dialog.getByRole("button", { name: AUTO_TEXT.cancelBtn });
    await btn.click();
  }

  // ── Folder actions ────────────────────────────────────────

  async clickCreateFolder() {
    await this.createFolderButton.click();
  }

  async fillFolderName(name: string) {
    await this.folderNameInput.fill(name);
  }

  async saveFolderCreation() {
    await this.saveFolderButton.click();
  }

  async cancelFolderCreation() {
    await this.cancelFolderButton.click();
  }

  selectFolder(name: string) {
    return this.page.getByRole("button", { name, exact: true });
  }

  async selectAllAutomations() {
    await this.allAutomationsButton.click();
  }

  getFolderDeleteButton(folderName: string) {
    return this.page
      .locator("li")
      .filter({ hasText: folderName })
      .locator('button:has(svg.lucide-trash-2)');
  }

  // ── Toast selectors ───────────────────────────────────────

  getToast() {
    return this.page.locator("[data-sonner-toast]");
  }

  getToastByText(text: string) {
    return this.page.locator("[data-sonner-toast]").filter({ hasText: text });
  }
}
