import { type Page, type Locator } from "@playwright/test";

export class CreateRetainerPage {
  readonly page: Page;
  readonly titleInput: Locator;
  readonly amountInput: Locator;
  readonly frequencySelect: Locator;
  readonly startDateInput: Locator;
  readonly notesTextarea: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;
  readonly existingClientTab: Locator;
  readonly newClientTab: Locator;
  readonly newClientNameInput: Locator;
  readonly newClientEmailInput: Locator;
  readonly newClientPhoneInput: Locator;
  readonly newClientCompanyInput: Locator;
  readonly prepaidRadio: Locator;
  readonly postpaidRadio: Locator;
  readonly clientError: Locator;

  constructor(page: Page) {
    this.page = page;
    this.titleInput = page.locator("#title");
    this.amountInput = page.locator("#amount");
    this.frequencySelect = page.locator("#frequency");
    this.startDateInput = page.locator("#startDate");
    this.notesTextarea = page.locator("#notes");
    this.submitButton = page.getByRole("button", { name: "צור ריטיינר" });
    this.cancelButton = page.getByRole("button", { name: "ביטול" });
    this.existingClientTab = page.getByRole("button", {
      name: "בחר לקוח קיים",
    });
    this.newClientTab = page.getByRole("button", { name: "צור לקוח חדש" });
    this.newClientNameInput = page.locator("#newClientName");
    this.newClientEmailInput = page.locator("#newClientEmail");
    this.newClientPhoneInput = page.locator("#newClientPhone");
    this.newClientCompanyInput = page.locator("#newClientCompany");
    this.prepaidRadio = page.locator('input[name="paymentMode"][value="prepaid"]');
    this.postpaidRadio = page.locator('input[name="paymentMode"][value="postpaid"]');
    this.clientError = page.getByText("יש לבחור לקוח");
  }

  async goto() {
    await this.page.goto("/finance/retainers/new");
  }

  async fillForm(data: {
    title: string;
    amount: string;
    frequency?: string;
    startDate: string;
    paymentMode?: "prepaid" | "postpaid";
    notes?: string;
  }) {
    await this.titleInput.fill(data.title);
    await this.amountInput.fill(data.amount);
    if (data.frequency) await this.frequencySelect.selectOption(data.frequency);
    await this.startDateInput.fill(data.startDate);
    if (data.paymentMode === "prepaid") await this.prepaidRadio.check();
    if (data.notes) await this.notesTextarea.fill(data.notes);
  }

  async fillNewClient(data: {
    name: string;
    email?: string;
    phone?: string;
    company?: string;
  }) {
    await this.newClientTab.click();
    await this.newClientNameInput.fill(data.name);
    if (data.email) await this.newClientEmailInput.fill(data.email);
    if (data.phone) await this.newClientPhoneInput.fill(data.phone);
    if (data.company) await this.newClientCompanyInput.fill(data.company);
  }

  async submit() {
    await this.submitButton.click();
  }
}
