import { type Page, type Locator } from "@playwright/test";
import { TASK_TEXT } from "../helpers/selectors";

export class TaskModalPO {
  readonly page: Page;

  // Modal container
  readonly modal: Locator;

  // Form fields
  readonly titleInput: Locator;
  readonly descriptionInput: Locator;
  readonly dueDateInput: Locator;
  readonly statusSelect: Locator;
  readonly prioritySelect: Locator;
  readonly assigneeSelect: Locator;
  readonly tagInput: Locator;

  // Buttons
  readonly saveButton: Locator;
  readonly updateButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Modal is the overlay div with fixed positioning
    this.modal = page.locator("div.fixed.inset-0").first();

    this.titleInput = page.getByPlaceholder(TASK_TEXT.titlePlaceholder);
    this.descriptionInput = page.getByPlaceholder(TASK_TEXT.descriptionPlaceholder);
    this.dueDateInput = page.locator('input[type="date"]').first();
    this.statusSelect = page.locator("select").filter({ has: page.locator(`option:text("${TASK_TEXT.statusTodo}")`) });
    this.prioritySelect = page.locator("select").filter({ has: page.locator(`option:text("${TASK_TEXT.priorityHigh}")`) });
    this.assigneeSelect = page.locator("select").filter({ has: page.locator(`option:text("${TASK_TEXT.noAssignee}")`) });
    this.tagInput = page.getByPlaceholder(TASK_TEXT.tagPlaceholder);

    this.saveButton = page.getByRole("button", { name: TASK_TEXT.btnSaveTask });
    this.updateButton = page.getByRole("button", { name: TASK_TEXT.btnUpdateTask });
    this.cancelButton = page.getByRole("button", { name: TASK_TEXT.btnCancel });
  }

  async isOpen(): Promise<boolean> {
    return this.modal.isVisible();
  }

  async getHeading(): Promise<string | null> {
    const heading = this.modal.locator("h2, h3").first();
    return heading.textContent();
  }

  async fillTitle(title: string) {
    await this.titleInput.fill(title);
  }

  async fillDescription(description: string) {
    await this.descriptionInput.fill(description);
  }

  async setDueDate(date: string) {
    await this.dueDateInput.fill(date);
  }

  async setStatus(status: string) {
    await this.statusSelect.selectOption({ label: status });
  }

  async setPriority(priority: string) {
    await this.prioritySelect.selectOption({ label: priority });
  }

  async setAssignee(name: string) {
    await this.assigneeSelect.selectOption({ label: name });
  }

  async addTag(tag: string) {
    await this.tagInput.fill(tag);
    await this.tagInput.press("Enter");
  }

  async removeTag(tag: string) {
    // Tag removal button is an × next to the tag text
    const tagElement = this.page.locator("span").filter({ hasText: tag });
    await tagElement.locator("button, svg").first().click();
  }

  async submit() {
    // Click whichever submit button is visible
    if (await this.saveButton.isVisible()) {
      await this.saveButton.click();
    } else {
      await this.updateButton.click();
    }
  }

  async cancel() {
    await this.cancelButton.click();
  }

  async clickBackdrop() {
    // Click the overlay backdrop (behind the modal content)
    await this.modal.click({ position: { x: 5, y: 5 } });
  }
}
