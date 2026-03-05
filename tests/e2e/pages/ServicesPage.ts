import { type Page, type Locator, expect } from "@playwright/test";

export class ServicesPage {
  readonly page: Page;

  // Page header
  readonly heading: Locator;
  readonly subtitle: Locator;
  readonly addButton: Locator;

  // Stats cards — scoped via heading text then parent card
  readonly statTotal: Locator;
  readonly statAvgMargin: Locator;
  readonly statMostProfitable: Locator;

  // Catalog table
  readonly catalogHeading: Locator;
  readonly catalogTable: Locator;
  readonly emptyStateTitle: Locator;
  readonly emptyStateSubtitle: Locator;

  // Product modal
  readonly modalCreateTitle: Locator;
  readonly modalEditTitle: Locator;
  readonly cancelButton: Locator;
  readonly closeXButton: Locator;

  // Description popup
  readonly descriptionPopupTitle: Locator;

  constructor(page: Page) {
    this.page = page;

    // Page header
    this.heading = page.getByRole("heading", { name: "מוצרים ושירותים", level: 1 });
    this.subtitle = page.getByText("ניהול הקטלוג העסקי וניתוח רווחיות");
    this.addButton = page.getByRole("button", { name: "הוסף חדש" });

    // Stats cards — use heading text as anchor, then navigate to sibling value div
    this.statTotal = page.getByText("סה״כ פריטים בקטלוג").locator("..").locator("div.text-4xl");
    this.statAvgMargin = page.getByText("ממוצע רווח גולמי").locator("..").locator("div.text-4xl");
    this.statMostProfitable = page.getByText("הפריט הרווחי ביותר").locator("..").locator("div.text-xl");

    // Catalog
    this.catalogHeading = page.getByRole("heading", { name: "קטלוג" });
    this.catalogTable = page.locator("table");
    this.emptyStateTitle = page.getByText("אין פריטים בקטלוג");
    this.emptyStateSubtitle = page.getByText("הוסף את השירות או המוצר הראשון שלך כדי להתחיל");

    // Modal titles
    this.modalCreateTitle = page.getByRole("heading", { name: "הוספת שירות / מוצר חדש" });
    this.modalEditTitle = page.getByRole("heading", { name: "עריכת שירות / מוצר" });
    this.cancelButton = page.getByRole("button", { name: "ביטול" });
    // X button has sr-only text "סגור" — use .first() to disambiguate from description popup's "סגור" button
    this.closeXButton = page.getByRole("button", { name: "סגור" }).first();

    // Description popup
    this.descriptionPopupTitle = page.getByRole("heading", { name: "תיאור המוצר / שירות" });
  }

  // ── Form field locators (only valid when modal is open) ──

  get nameInput() {
    return this.page.getByPlaceholder("לדוגמה: בדיקת SEO");
  }

  get typeSelect() {
    return this.page.locator("select");
  }

  get skuInput() {
    return this.page.getByPlaceholder("לדוגמה: SKU-001");
  }

  get descriptionButton() {
    return this.page.locator("button").filter({ hasText: /לחץ להוספת תיאור|תיאור/ }).first();
  }

  get priceInput() {
    // Locate relative to the "מחיר (הכנסה)" label
    return this.page.getByText("מחיר (הכנסה)").locator("..").locator('input[type="number"]');
  }

  get costInput() {
    // Locate relative to the "עלות (הוצאה)" label
    return this.page.getByText("עלות (הוצאה)").locator("..").locator('input[type="number"]');
  }

  get marginDisplay() {
    return this.page.getByText("רווח משוער:");
  }

  get submitCreateButton() {
    return this.page.getByRole("button", { name: "צור חדש" });
  }

  get submitEditButton() {
    return this.page.getByRole("button", { name: "שמור שינויים" });
  }

  get loadingButton() {
    return this.page.getByRole("button", { name: "שומר..." });
  }

  get descriptionTextarea() {
    return this.page.locator("textarea");
  }

  get descriptionSaveButton() {
    // Inside the description popup — scope via the popup heading's container
    const popup = this.page.locator("div").filter({ has: this.descriptionPopupTitle });
    return popup.getByRole("button", { name: "שמור" });
  }

  get descriptionCloseButton() {
    // Inside the description popup footer — the "סגור" button
    const popup = this.page.locator("div").filter({ has: this.descriptionPopupTitle });
    return popup.getByRole("button", { name: "סגור" });
  }

  // ── Navigation ──

  async goto() {
    await this.page.goto("/services");
  }

  async waitForLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15_000 });
  }

  // ── Modal actions ──

  async openAddModal() {
    await this.addButton.click();
    await expect(this.modalCreateTitle).toBeVisible();
  }

  async openEditModal(productName: string) {
    const row = this.getTableRow(productName);
    await row.getByRole("button").click();
    await expect(this.modalEditTitle).toBeVisible();
  }

  async fillForm(data: {
    name?: string;
    type?: "SERVICE" | "PRODUCT" | "PACKAGE";
    sku?: string;
    description?: string;
    price?: string;
    cost?: string;
  }) {
    if (data.name !== undefined) {
      await this.nameInput.clear();
      await this.nameInput.fill(data.name);
    }
    if (data.type !== undefined) {
      await this.typeSelect.selectOption(data.type);
    }
    if (data.sku !== undefined) {
      await this.skuInput.clear();
      await this.skuInput.fill(data.sku);
    }
    if (data.description !== undefined) {
      await this.openDescriptionPopup();
      await this.descriptionTextarea.clear();
      await this.descriptionTextarea.fill(data.description);
      await this.descriptionSaveButton.click();
    }
    if (data.price !== undefined) {
      await this.priceInput.clear();
      await this.priceInput.fill(data.price);
    }
    if (data.cost !== undefined) {
      await this.costInput.clear();
      await this.costInput.fill(data.cost);
    }
  }

  async submitForm() {
    const createVisible = await this.submitCreateButton.isVisible().catch(() => false);
    if (createVisible) {
      await this.submitCreateButton.click();
    } else {
      await this.submitEditButton.click();
    }
  }

  async openDescriptionPopup() {
    await this.descriptionButton.click();
    await expect(this.descriptionPopupTitle).toBeVisible();
  }

  // ── Table helpers ──

  getTableRow(name: string) {
    return this.catalogTable.locator("tbody tr").filter({ hasText: name });
  }

  getTableRows() {
    return this.catalogTable.locator("tbody tr");
  }

  async getRowValues(name: string) {
    const row = this.getTableRow(name);
    const cells = row.locator("td");
    return {
      name: await cells.nth(0).textContent(),
      sku: await cells.nth(1).textContent(),
      type: await cells.nth(2).textContent(),
      price: await cells.nth(3).textContent(),
      cost: await cells.nth(4).textContent(),
      margin: await cells.nth(5).textContent(),
    };
  }

  /** Close modal via backdrop click — click at top-left corner outside modal card */
  async closeModalViaBackdrop() {
    await this.page.mouse.click(0, 0);
  }
}
