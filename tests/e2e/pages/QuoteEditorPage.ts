import { type Page, type Locator } from "@playwright/test";

export class QuoteEditorPage {
  readonly page: Page;

  // Header
  readonly pageHeading: Locator;
  readonly backButton: Locator;
  readonly saveButton: Locator;
  readonly printPdfButton: Locator;

  // Client section
  readonly clientSelect: Locator;
  readonly clientNameInput: Locator;
  readonly clientEmailInput: Locator;
  readonly clientPhoneInput: Locator;
  readonly clientTaxIdInput: Locator;
  readonly clientAddressInput: Locator;

  // Settings section
  readonly titleInput: Locator;
  readonly statusSelect: Locator;
  readonly currencySelect: Locator;
  readonly validUntilInput: Locator;

  // Duration shortcuts
  readonly weekButton: Locator;
  readonly monthButton: Locator;
  readonly applyButton: Locator;

  // VAT
  readonly vatCheckbox: Locator;

  // Items
  readonly addItemButton: Locator;

  // Discount
  readonly discountSelect: Locator;
  readonly discountValueInput: Locator;

  // Summary panel
  readonly subtotalDisplay: Locator;
  readonly vatDisplay: Locator;
  readonly totalDisplay: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.pageHeading = page.getByRole("heading", { level: 1 });
    this.backButton = page.getByTestId("back-button");
    this.saveButton = page.getByRole("button", { name: "שמור הצעה" });
    this.printPdfButton = page.getByRole("button", {
      name: /הדפסה \/ PDF/,
    });

    // Client section
    this.clientSelect = page
      .locator("select")
      .filter({ has: page.locator('option:has-text("+ לקוח חדש")') });
    this.clientNameInput = page
      .locator("label")
      .filter({ hasText: "שם לקוח" })
      .locator(".. >> input");
    // Use regex to match both ASCII " and Hebrew geresh ״
    this.clientEmailInput = page
      .locator("label")
      .filter({ hasText: /דוא.ל/ })
      .locator(".. >> input");
    this.clientPhoneInput = page
      .locator("label")
      .filter({ hasText: "טלפון" })
      .locator(".. >> input");
    this.clientTaxIdInput = page.getByPlaceholder("מספר ח.פ או ת.ז");
    this.clientAddressInput = page
      .locator("label")
      .filter({ hasText: "כתובת / פרטים נוספים" })
      .locator(".. >> input");

    // Settings
    this.titleInput = page.getByPlaceholder(
      "לדוגמה: הצעת מחיר לפרויקט בניית אתר"
    );
    this.statusSelect = page
      .locator("select")
      .filter({ has: page.locator('option:has-text("טיוטה")') });
    this.currencySelect = page
      .locator("select")
      .filter({ has: page.locator('option:has-text("שקל ישראלי")') });
    this.validUntilInput = page
      .locator("label")
      .filter({ hasText: "בתוקף עד" })
      .locator(".. >> input[type='date']");

    // Duration shortcuts
    this.weekButton = page.getByRole("button", { name: "שבוע מהיום" });
    this.monthButton = page.getByRole("button", { name: "חודש מהיום" });
    this.applyButton = page.getByRole("button", { name: "החל" });

    // VAT — use regex to match Hebrew geresh ״
    this.vatCheckbox = page.getByLabel(/המחיר כולל מע.מ/);

    // Items
    this.addItemButton = page.getByRole("button", { name: "הוסף פריט" });

    // Discount
    this.discountSelect = page
      .locator("select")
      .filter({ has: page.locator('option:has-text("ללא הנחה")') });
    this.discountValueInput = page
      .locator("label")
      .filter({ hasText: /אחוז הנחה|סכום/ })
      .locator(".. >> input[type='number']");

    // Summary — use regex for Hebrew geresh
    this.subtotalDisplay = page.getByText(/סה.כ פריטים:/);
    this.vatDisplay = page.getByText(/מע.מ \(18%\):/);
    this.totalDisplay = page.getByText(/סה.כ לתשלום:/);
  }

  /** Count items by counting product select dropdowns */
  getItemCount() {
    return this.getProductSelects().count();
  }

  /** All product/service select dropdowns (one per item row) */
  getProductSelects() {
    return this.page
      .locator("select")
      .filter({ has: this.page.locator('option:has-text("פריט מותאם אישית")') });
  }

  /** Get quantity input for a specific item by index */
  getItemQuantityInput(index: number) {
    return this.page
      .locator("label")
      .filter({ hasText: "כמות" })
      .locator(".. >> input[type='number']")
      .nth(index);
  }

  /** Get price input for a specific item by index */
  getItemPriceInput(index: number) {
    return this.page
      .locator("label")
      .filter({ hasText: /^מחיר/ })
      .locator(".. >> input[type='number']")
      .nth(index);
  }

  async goto() {
    await this.page.goto("/quotes/new");
  }

  async gotoEdit(id: string) {
    await this.page.goto(`/quotes/${id}`);
  }

  async fillClientDetails(data: {
    name: string;
    email?: string;
    phone?: string;
    taxId?: string;
    address?: string;
  }) {
    await this.clientNameInput.fill(data.name);
    if (data.email) await this.clientEmailInput.fill(data.email);
    if (data.phone) await this.clientPhoneInput.fill(data.phone);
    if (data.taxId) await this.clientTaxIdInput.fill(data.taxId);
    if (data.address) await this.clientAddressInput.fill(data.address);
  }

  async addLineItem(quantity: string, price: string) {
    await this.addItemButton.click();
    const count = await this.getItemCount();
    const lastIdx = count - 1;
    await this.getItemQuantityInput(lastIdx).fill(quantity);
    await this.getItemPriceInput(lastIdx).fill(price);
  }

  async removeItem(index: number) {
    // Each item row's last button is the trash button — scope by product selects
    const productSelects = this.getProductSelects();
    const itemRow = productSelects.nth(index).locator("xpath=ancestor::div[contains(@class,'items-start')]");
    await itemRow.locator("button").last().click();
  }

  /** Ensure at least one item row exists (new quotes start with 0 items) */
  async ensureItem() {
    const count = await this.getItemCount();
    if (count === 0) {
      await this.addItemButton.click();
    }
  }

  async save() {
    await this.saveButton.click();
  }
}
