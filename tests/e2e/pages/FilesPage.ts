import { type Page, type Locator, expect } from "@playwright/test";

export class FilesPage {
  readonly page: Page;

  // Page header
  readonly heading: Locator;
  readonly subtitle: Locator;
  readonly createFolderBtn: Locator;
  readonly uploadFileBtn: Locator;

  // Storage
  readonly storageUsage: Locator;
  readonly progressBar: Locator;

  // Breadcrumbs
  readonly breadcrumbRoot: Locator;

  // Location banner
  readonly locationBanner: Locator;
  readonly backToLibraryBtn: Locator;

  // Empty state
  readonly emptyState: Locator;
  readonly emptyStateAlt: Locator;

  // View mode buttons
  readonly gridViewBtn: Locator;
  readonly listViewBtn: Locator;
  readonly compactViewBtn: Locator;

  // Create folder dialog
  readonly createFolderDialog: Locator;
  readonly folderNameInput: Locator;
  readonly createFolderSubmitBtn: Locator;
  readonly createFolderCancelBtn: Locator;

  // Upload dialog
  readonly uploadDialog: Locator;
  readonly uploadDropzone: Locator;
  readonly uploadCancelBtn: Locator;
  readonly uploadSubmitBtn: Locator;
  readonly selectedFilesHeading: Locator;

  constructor(page: Page) {
    this.page = page;

    // Page header
    this.heading = page.getByRole("heading", { name: "ספריית קבצים", level: 1 });
    this.subtitle = page.getByText("נהל את המסמכים, המדיניות והנכסים שלך בצורה מקצועית.");
    this.createFolderBtn = page.getByRole("button", { name: "תיקייה חדשה" });
    this.uploadFileBtn = page.getByRole("button", { name: "העלאת קובץ" });

    // Storage
    this.storageUsage = page.getByText("אחסון בשימוש");
    this.progressBar = page.getByRole("progressbar");

    // Breadcrumbs
    this.breadcrumbRoot = page.getByRole("link", { name: "כל הקבצים" });

    // Location banner
    this.locationBanner = page.getByText("מיקום נוכחי");
    this.backToLibraryBtn = page.getByRole("button", { name: "חזרה לספרייה" });

    // Empty state
    this.emptyState = page.getByText("התיקייה ריקה");
    this.emptyStateAlt = page.getByText("לא נמצאו תיקיות");

    // View mode buttons (by title)
    this.gridViewBtn = page.getByRole("button", { name: "רשת" });
    this.listViewBtn = page.getByRole("button", { name: "רשימה" });
    this.compactViewBtn = page.getByRole("button", { name: "דחוס" });

    // Create folder dialog
    this.createFolderDialog = page.getByRole("dialog").filter({ hasText: "יצירת תיקייה חדשה" });
    this.folderNameInput = page.getByLabel("שם התיקייה");
    this.createFolderSubmitBtn = page.getByRole("button", { name: /צור תיקייה|יוצר\.\.\./ });
    this.createFolderCancelBtn = this.createFolderDialog.getByRole("button", { name: "ביטול" });

    // Upload dialog
    this.uploadDialog = page.getByRole("dialog").filter({ hasText: "העלאת קבצים" });
    this.uploadDropzone = page.getByText("לחץ לבחירה או גרור קבצים לכאן");
    this.uploadCancelBtn = this.uploadDialog.getByRole("button", { name: "ביטול" });
    this.uploadSubmitBtn = page.getByRole("button", { name: /^העלה|מעלה\.\.\./ });
    this.selectedFilesHeading = page.getByText("קבצים שנבחרו");
  }

  async goto(folderId?: number) {
    const url = folderId ? `/files?folderId=${folderId}` : "/files";
    await this.page.goto(url);
  }

  async waitForLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15_000 });
  }

  // View mode switching
  async switchView(mode: "grid" | "list" | "compact") {
    const btn = mode === "grid" ? this.gridViewBtn : mode === "list" ? this.listViewBtn : this.compactViewBtn;
    await btn.click();
  }

  // Filter buttons
  getFilterButton(label: string) {
    return this.page.getByRole("button", { name: new RegExp(label) });
  }

  async selectFilter(filter: string) {
    await this.getFilterButton(filter).click();
  }

  /** Extract the numeric count from a filter button's badge text */
  async getFilterCount(label: string): Promise<number> {
    const btn = this.getFilterButton(label);
    const text = await btn.textContent();
    // The button text is like "כל הקבצים 5" or "תיקיות 2"
    const match = text?.match(/(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  // Folder locators
  // Uses `a.group` because folder cards are <a> tags with the Tailwind `group` class.
  // `getByRole("link")` would also match breadcrumb links, so this CSS selector
  // is a deliberate tradeoff for specificity over fragility.
  getFolderByName(name: string) {
    return this.page.locator("a.group").filter({ hasText: name });
  }

  // File locators (div with draggable attribute containing file name)
  getFileByName(name: string) {
    return this.page.locator("[draggable]").filter({ hasText: name });
  }

  /** Open the 3-dot dropdown menu on a folder by name */
  async openFolderDropdown(name: string) {
    const folder = this.getFolderByName(name);
    await folder.hover();
    await folder.locator("button").first().click();
  }

  /** Open the 3-dot dropdown menu on a file by name.
   *  The MoreVertical button has no accessible name/aria-label in the source component,
   *  so we locate it as the first SVG-containing button in the card. */
  async openFileDropdown(name: string) {
    const fileCard = this.getFileByName(name);
    await fileCard.hover();
    await fileCard.locator("button").filter({ has: this.page.locator("svg") }).first().click();
  }

  // Confirm dialog (scoped to alertdialog role)
  getConfirmDialog() {
    return this.page.getByRole("alertdialog");
  }

  /** Click the confirm button inside the alertdialog */
  async confirmAction() {
    const dialog = this.getConfirmDialog();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.getByRole("button", { name: "אישור" }).click();
  }

  // Rename dialog (appears for folders)
  getRenameDialog() {
    return this.page.getByRole("dialog").filter({ hasText: "שינוי שם תיקייה" });
  }

  // Get breadcrumb for a specific folder name
  getBreadcrumb(name: string) {
    return this.page.getByRole("link", { name });
  }

  /** Get an upload file list item's remove button by filename.
   *  Assumes the filename text and remove button are siblings within
   *  the same container div (see upload-modal.tsx file item structure). */
  getUploadFileRemoveBtn(name: string) {
    return this.uploadDialog.getByText(name).locator("..").getByRole("button");
  }
}
