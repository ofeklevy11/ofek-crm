import { type Page, type Locator } from "@playwright/test";
import { SERVICE_TEXT } from "../helpers/service-selectors";

export class TicketModalPO {
  readonly page: Page;

  // Modal heading
  readonly heading: Locator;
  readonly description: Locator;

  // Form fields
  readonly titleInput: Locator;
  readonly descriptionInput: Locator;

  // Buttons
  readonly submitButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole("heading", { name: SERVICE_TEXT.modalTitle });
    this.description = page.getByText(SERVICE_TEXT.modalDescription);

    this.titleInput = page.getByPlaceholder("לדוגמה: מדפסת מקולקלת");
    this.descriptionInput = page.getByPlaceholder("תיאור מפורט של הבעיה...");

    this.submitButton = page.getByRole("button", { name: SERVICE_TEXT.btnCreate });
    this.cancelButton = page.getByRole("button", { name: SERVICE_TEXT.btnCancel });
  }

  async isOpen(): Promise<boolean> {
    return this.heading.isVisible();
  }

  async fillTitle(title: string) {
    await this.titleInput.fill(title);
  }

  async fillDescription(description: string) {
    await this.descriptionInput.fill(description);
  }

  /** Select a priority using the Shadcn Select component — scoped by label */
  async selectPriority(label: string) {
    const container = this.page.locator("div.space-y-2").filter({
      has: this.page.locator("label", { hasText: SERVICE_TEXT.labelPriority }),
    });
    await container.locator("[data-slot=select-trigger]").click();
    await this.page.getByRole("option", { name: label }).click();
  }

  /** Select a type using the Shadcn Select component — scoped by label */
  async selectType(label: string) {
    const container = this.page.locator("div.space-y-2").filter({
      has: this.page.locator("label", { hasText: SERVICE_TEXT.labelType }),
    });
    await container.locator("[data-slot=select-trigger]").click();
    await this.page.getByRole("option", { name: label }).click();
  }

  /** Select a client using the Shadcn Select component — scoped by label */
  async selectClient(label: string) {
    const container = this.page.locator("div.space-y-2").filter({
      has: this.page.locator("label", { hasText: SERVICE_TEXT.labelClient }),
    });
    await container.locator("[data-slot=select-trigger]").click();
    await this.page.getByRole("option", { name: label }).click();
  }

  /** Select an assignee using the Shadcn Select component — scoped by label */
  async selectAssignee(label: string) {
    const container = this.page.locator("div.space-y-2").filter({
      has: this.page.locator("label", { hasText: SERVICE_TEXT.labelAssignee }),
    });
    await container.locator("[data-slot=select-trigger]").click();
    await this.page.getByRole("option", { name: label }).click();
  }

  async submit() {
    await this.submitButton.click();
  }

  async cancel() {
    await this.cancelButton.click();
  }
}
