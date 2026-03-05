import { type Page, type Locator, expect } from "@playwright/test";

interface WorkerFormData {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  departmentName?: string;
  position?: string;
  employeeId?: string;
  notes?: string;
  status?: string;
}

export class WorkerModalPO {
  readonly page: Page;
  readonly modal: Locator;
  readonly heading: Locator;

  // Fields
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly emailInput: Locator;
  readonly phoneInput: Locator;
  readonly departmentSelect: Locator;
  readonly positionInput: Locator;
  readonly employeeIdInput: Locator;
  readonly startDateInput: Locator;
  readonly statusSelect: Locator;
  readonly linkedUserSelect: Locator;
  readonly notesTextarea: Locator;
  readonly onboardingPathSelect: Locator;

  // Buttons
  readonly cancelButton: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modal = page.locator(".fixed.inset-0").filter({
      has: page.getByText(/עובד חדש|עריכת עובד/),
    });

    this.heading = this.modal.locator("h2");

    // Personal info fields
    this.firstNameInput = this.modal.locator(
      'input[placeholder="הכנס שם פרטי"]',
    );
    this.lastNameInput = this.modal.locator(
      'input[placeholder="הכנס שם משפחה"]',
    );
    this.emailInput = this.modal.locator(
      'input[placeholder="email@example.com"]',
    );
    this.phoneInput = this.modal.locator(
      'input[placeholder="050-0000000"]',
    );

    // Employment info
    this.departmentSelect = this.modal.locator("select").filter({
      has: page.locator('option:text("בחר מחלקה")'),
    });
    this.positionInput = this.modal.locator('input[placeholder*="מנהל מכירות"]');
    this.employeeIdInput = this.modal.locator(
      'input[placeholder="מספר עובד פנימי"]',
    );
    this.startDateInput = this.modal.locator('input[type="date"]');
    this.statusSelect = this.modal
      .locator("select")
      .filter({ has: page.locator('option[value="ACTIVE"]') })
      .first();
    this.linkedUserSelect = this.modal.locator("select").filter({
      has: page.locator('option:text("לא מקושר")'),
    });
    this.notesTextarea = this.modal.locator(
      'textarea[placeholder="הוסף הערות..."]',
    );
    this.onboardingPathSelect = this.modal.locator("select").filter({
      has: page.locator('option:text("ללא מסלול קליטה")'),
    });

    this.cancelButton = this.modal.getByRole("button", { name: "ביטול" });
    this.submitButton = this.modal
      .getByRole("button", { name: /הוסף עובד|שמור שינויים/ });
  }

  async fillWorkerForm(data: WorkerFormData) {
    await this.firstNameInput.fill(data.firstName);
    await this.lastNameInput.fill(data.lastName);

    if (data.email) await this.emailInput.fill(data.email);
    if (data.phone) await this.phoneInput.fill(data.phone);
    if (data.departmentName) {
      await this.departmentSelect.selectOption({ label: data.departmentName });
    }
    if (data.position) await this.positionInput.fill(data.position);
    if (data.employeeId) await this.employeeIdInput.fill(data.employeeId);
    if (data.notes) await this.notesTextarea.fill(data.notes);
  }

  async submit() {
    await this.submitButton.click();
  }

  async cancel() {
    await this.cancelButton.click();
  }

  /** Assert that the form is pre-filled with expected values */
  async expectPrefilledWith(data: Partial<WorkerFormData>) {
    if (data.firstName !== undefined) {
      await expect(this.firstNameInput).toHaveValue(data.firstName);
    }
    if (data.lastName !== undefined) {
      await expect(this.lastNameInput).toHaveValue(data.lastName);
    }
    if (data.email !== undefined) {
      await expect(this.emailInput).toHaveValue(data.email);
    }
    if (data.phone !== undefined) {
      await expect(this.phoneInput).toHaveValue(data.phone);
    }
  }
}
