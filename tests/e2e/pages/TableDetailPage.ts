import { type Page, type Locator, expect } from "@playwright/test";

export class TableDetailPage {
  readonly page: Page;
  readonly backLink: Locator;
  readonly tableName: Locator;
  readonly recordCount: Locator;
  readonly searchInput: Locator;
  readonly settingsButton: Locator;
  readonly addRecordButton: Locator;
  readonly recordTable: Locator;
  readonly bulkDeleteButton: Locator;
  readonly permissionDenied: Locator;

  // Add record dialog
  readonly addRecordDialog: Locator;
  readonly createRecordButton: Locator;
  readonly cancelRecordButton: Locator;

  // Pagination
  readonly firstPageButton: Locator;
  readonly prevPageButton: Locator;
  readonly nextPageButton: Locator;
  readonly lastPageButton: Locator;
  readonly pageInfo: Locator;

  constructor(page: Page) {
    this.page = page;
    this.backLink = page.getByRole("link", { name: /חזרה לטבלאות/ });
    this.tableName = page.locator("h1");
    this.recordCount = page.getByText(/רשומ.*בסך הכל/);
    this.searchInput = page.getByPlaceholder("חיפוש...");
    this.settingsButton = page.getByTitle("הגדרות טבלה");
    this.addRecordButton = page.getByRole("button", { name: /הוסף רשומה/ });
    this.recordTable = page.locator("table");
    this.bulkDeleteButton = page.getByRole("button", { name: /מחק נבחרים/ });
    this.permissionDenied = page.getByText("אין לך הרשאה לצפות בטבלה זו");

    // Add record dialog
    this.addRecordDialog = page.getByRole("dialog");
    this.createRecordButton = page.getByRole("button", { name: /צור רשומה/ });
    this.cancelRecordButton = this.addRecordDialog.getByRole("button", { name: "ביטול" });

    // Pagination
    this.firstPageButton = page.getByRole("button", { name: /ראשון/ });
    this.prevPageButton = page.getByRole("button", { name: /הקודם/ });
    this.nextPageButton = page.getByRole("button", { name: /הבא/ });
    this.lastPageButton = page.getByRole("button", { name: /אחרון/ });
    this.pageInfo = page.getByText(/עמוד \d+ מתוך \d+/);
  }

  async goto(id: number | string) {
    await this.page.goto(`/tables/${id}`);
  }

  /** Wait for the detail page to be fully loaded */
  async waitForLoaded() {
    await expect(this.tableName).toBeVisible({ timeout: 15_000 });
  }

  async search(term: string) {
    await this.searchInput.fill(term);
    // Wait for debounced search (300ms) + navigation
    await this.page.waitForURL(/q=/, { timeout: 5_000 });
  }

  async clearSearch() {
    await this.searchInput.clear();
    await this.page.waitForFunction(() => !window.location.search.includes("q="));
  }

  getRecordRows() {
    return this.recordTable.locator("tbody tr");
  }

  getRecordCheckboxes() {
    return this.recordTable.locator("tbody").getByRole("checkbox");
  }

  async selectRecord(index: number) {
    await this.getRecordCheckboxes().nth(index).click();
  }

  async goToNextPage() {
    await this.nextPageButton.click();
  }

  async goToPrevPage() {
    await this.prevPageButton.click();
  }

  async goToFirstPage() {
    await this.firstPageButton.click();
  }

  async goToLastPage() {
    await this.lastPageButton.click();
  }

  async navigateBack() {
    await this.backLink.click();
    await expect(this.page).toHaveURL(/\/tables$/);
  }

  /** Open the add record dialog */
  async openAddRecordDialog() {
    await this.addRecordButton.click();
    await expect(this.addRecordDialog).toBeVisible();
  }

  /** Fill a text field in the add record dialog by its placeholder */
  async fillRecordField(label: string, value: string) {
    const field = this.addRecordDialog.getByPlaceholder(`הזן ${label}`);
    await field.fill(value);
  }

  /** Get the destructive confirm dialog (AlertDialog uses role="alertdialog") */
  getDestructiveDialog() {
    return this.page.getByRole("alertdialog");
  }

  /** Get the export button (desktop) */
  getExportButton() {
    return this.page.getByRole("button", { name: /ייצוא נבחרים/ });
  }

  /** Get the mobile export button (disabled variant) */
  getExportMobileButton() {
    return this.page.getByRole("button", { name: /ייצוא נבחרים \(במחשב בלבד\)/ });
  }

  /** Submit the add record form */
  async submitRecord() {
    await this.createRecordButton.click();
  }
}
