import { type Page, type Locator } from "@playwright/test";

interface DepartmentFormData {
  name: string;
  description?: string;
  color?: string;
}

export class DepartmentModalPO {
  readonly page: Page;
  readonly modal: Locator;
  readonly heading: Locator;

  // Fields
  readonly nameInput: Locator;
  readonly descriptionTextarea: Locator;

  // Buttons
  readonly cancelButton: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modal = page.locator(".fixed.inset-0").filter({
      has: page.getByText(/מחלקה חדשה|עריכת מחלקה/),
    });

    this.heading = this.modal.locator("h2");

    this.nameInput = this.modal.locator(
      'input[placeholder*="מכירות"]',
    );
    this.descriptionTextarea = this.modal.locator(
      'textarea[placeholder="תאר את תפקיד המחלקה..."]',
    );

    this.cancelButton = this.modal.getByRole("button", { name: "ביטול" });
    this.submitButton = this.modal
      .getByRole("button", { name: /צור מחלקה|שמור שינויים/ });
  }

  async fillDepartmentForm(data: DepartmentFormData) {
    await this.nameInput.fill(data.name);

    if (data.description) {
      await this.descriptionTextarea.fill(data.description);
    }

    if (data.color) {
      await this.modal
        .locator(`button[style*="background-color: ${data.color}"]`)
        .click();
    }
  }

  async submit() {
    await this.submitButton.click();
  }

  async cancel() {
    await this.cancelButton.click();
  }
}
