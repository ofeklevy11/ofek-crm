import { type Page, type Locator } from "@playwright/test";

export class CreateClientPage {
  readonly page: Page;
  readonly nameInput: Locator;
  readonly companyInput: Locator;
  readonly emailInput: Locator;
  readonly phoneInput: Locator;
  readonly notesTextarea: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nameInput = page.locator("#name");
    this.companyInput = page.locator("#company");
    this.emailInput = page.locator("#email");
    this.phoneInput = page.locator("#phone");
    this.notesTextarea = page.locator("#notes");
    this.submitButton = page.getByRole("button", { name: "צור לקוח" });
    this.cancelButton = page.getByRole("button", { name: "ביטול" });
  }

  async goto() {
    await this.page.goto("/finance/clients/new");
  }

  async fillForm(data: {
    name: string;
    company?: string;
    email?: string;
    phone?: string;
    notes?: string;
  }) {
    await this.nameInput.fill(data.name);
    if (data.company) await this.companyInput.fill(data.company);
    if (data.email) await this.emailInput.fill(data.email);
    if (data.phone) await this.phoneInput.fill(data.phone);
    if (data.notes) await this.notesTextarea.fill(data.notes);
  }

  async submit() {
    await this.submitButton.click();
  }
}
