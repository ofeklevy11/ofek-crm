import { type Page, type Locator, expect } from "@playwright/test";

export class TablesPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly subtitle: Locator;
  readonly createTableLink: Locator;
  readonly newCategoryButton: Locator;
  readonly createWithAIButton: Locator;
  readonly createWithAIMobileButton: Locator;
  readonly emptyState: Locator;
  readonly categoryModal: Locator;
  readonly categoryNameInput: Locator;
  readonly categorySubmitButton: Locator;
  readonly categoryCancelButton: Locator;
  readonly uncategorizedHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "טבלאות", level: 1 });
    this.subtitle = page.getByText("נהל את טבלאות הנתונים שלך");
    this.createTableLink = page.getByRole("link", { name: /צור טבלה/ });
    this.newCategoryButton = page.getByRole("button", { name: "קטגוריה חדשה" });
    this.createWithAIButton = page.getByRole("button", { name: "צור עם AI", exact: true });
    this.createWithAIMobileButton = page.getByRole("button", { name: /צור עם AI \(במחשב בלבד\)/ });
    this.emptyState = page.getByText("עדיין אין טבלאות");
    this.categoryModal = page.getByRole("dialog");
    this.categoryNameInput = page.getByLabel("שם הקטגוריה");
    this.categorySubmitButton = this.categoryModal.getByRole("button", { name: /^(צור|עדכן)$/ });
    this.categoryCancelButton = this.categoryModal.getByRole("button", { name: "ביטול" });
    this.uncategorizedHeading = page.getByRole("heading", { name: /ללא קטגוריה/ });
  }

  async goto() {
    await this.page.goto("/tables");
  }

  /** Wait for the page to be fully loaded (heading visible) */
  async waitForLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15_000 });
  }

  /** Get all table cards — each card is a div.group containing an h2 */
  getTableCards() {
    return this.page.locator("div.group").filter({ has: this.page.locator("h2") });
  }

  getTableCardByName(name: string) {
    return this.page.locator("div.group").filter({ hasText: name }).filter({ has: this.page.locator("h2") });
  }

  getCardName(card: Locator) {
    return card.locator("h2");
  }

  getCardSlug(card: Locator) {
    return card.locator(".font-mono");
  }

  getCardRecordCount(card: Locator) {
    return card.getByText(/רשומ/);
  }

  getCardCreator(card: Locator) {
    return card.getByText(/נוצר על ידי/);
  }

  getCardEditButton(card: Locator) {
    return card.getByTitle("ערוך טבלה");
  }

  getCardDuplicateButton(card: Locator) {
    return card.getByTitle("שכפל טבלה");
  }

  getCardDeleteButton(card: Locator) {
    return card.getByTitle("מחק טבלה");
  }

  getCategoryHeading(name: string) {
    return this.page.getByRole("heading", { name: new RegExp(name) });
  }

  getCategoryEditButton(name: string) {
    return this.getCategoryHeading(name).locator("..").getByTitle(/ערוך/);
  }

  async openNewCategoryModal() {
    await this.newCategoryButton.click();
    await expect(this.categoryModal).toBeVisible();
  }

  async fillCategoryName(name: string) {
    await this.categoryNameInput.fill(name);
  }

  async submitCategory() {
    await this.categorySubmitButton.click();
  }

  async cancelCategoryModal() {
    await this.categoryCancelButton.click();
  }
}
