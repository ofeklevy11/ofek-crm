import { type Page, type Locator } from "@playwright/test";

export class QuotesListPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly searchInput: Locator;
  readonly newQuoteButton: Locator;
  readonly trashButton: Locator;
  readonly settingsButton: Locator;
  readonly quotesCount: Locator;
  readonly emptyState: Locator;
  readonly loadMoreButton: Locator;
  readonly tableRows: Locator;
  readonly backToQuotesButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.getByRole("heading", { name: "הצעות מחיר" });
    this.searchInput = page.getByPlaceholder(
      "חיפוש לפי שם לקוח או מספר הצעה..."
    );
    this.newQuoteButton = page.getByRole("link", { name: "הצעת מחיר חדשה" });
    this.trashButton = page.getByRole("link", { name: "פח זבל" });
    this.settingsButton = page.getByRole("button", { name: "הגדרות עסק" });
    this.quotesCount = page.getByText(/\d+ הצעות מחיר/);
    this.emptyState = page.getByText("אין הצעות מחיר");
    this.loadMoreButton = page.getByRole("button", { name: "טען עוד הצעות" });
    this.tableRows = page.locator("tbody tr");
    this.backToQuotesButton = page.getByRole("link", { name: "חזרה להצעות" });
  }

  async goto() {
    await this.page.goto("/quotes");
  }

  async gotoTrash() {
    await this.page.goto("/quotes?trash=true");
  }

  getRowByClient(name: string) {
    return this.tableRows.filter({ hasText: name });
  }

  clickEdit(row: Locator) {
    return row.getByTitle("עריכה").click();
  }

  clickPreview(row: Locator) {
    return row.getByTitle("תצוגה מקדימה").click();
  }

  clickTrash(row: Locator) {
    return row.getByTitle("העבר לפח").click();
  }

  clickRestore(row: Locator) {
    return row.getByTitle("שחזור").click();
  }
}
