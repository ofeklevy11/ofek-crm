import { type Page, type Locator } from "@playwright/test";

export class CreatePaymentPage {
  readonly page: Page;
  readonly titleInput: Locator;
  readonly amountInput: Locator;
  readonly dueDateInput: Locator;
  readonly notesTextarea: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;
  readonly existingClientTab: Locator;
  readonly newClientTab: Locator;
  readonly newClientNameInput: Locator;
  readonly newClientEmailInput: Locator;
  readonly newClientPhoneInput: Locator;
  readonly newClientCompanyInput: Locator;
  readonly clientError: Locator;

  constructor(page: Page) {
    this.page = page;
    this.titleInput = page.locator("#title");
    this.amountInput = page.locator("#amount");
    this.dueDateInput = page.locator("#dueDate");
    this.notesTextarea = page.locator("#notes");
    this.submitButton = page.getByRole("button", { name: "צור תשלום" });
    this.cancelButton = page.getByRole("button", { name: "ביטול" });
    this.existingClientTab = page.getByRole("button", {
      name: "בחר לקוח קיים",
    });
    this.newClientTab = page.getByRole("button", { name: "צור לקוח חדש" });
    this.newClientNameInput = page.locator("#newClientName");
    this.newClientEmailInput = page.locator("#newClientEmail");
    this.newClientPhoneInput = page.locator("#newClientPhone");
    this.newClientCompanyInput = page.locator("#newClientCompany");
    this.clientError = page.getByText("יש לבחור לקוח");
  }

  async goto() {
    await this.page.goto("/finance/payments/new");
  }

  async fillForm(data: {
    title: string;
    amount: string;
    dueDate: string;
    notes?: string;
  }) {
    await this.titleInput.fill(data.title);
    await this.amountInput.fill(data.amount);
    await this.dueDateInput.fill(data.dueDate);
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
