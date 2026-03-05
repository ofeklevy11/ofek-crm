import { type Page, type Locator, expect } from "@playwright/test";
import { SERVICE_TEXT } from "../helpers/service-selectors";

export class TicketDetailsPO {
  readonly page: Page;

  // Sheet container
  readonly sheet: Locator;

  // Header badges
  readonly ticketIdBadge: Locator;
  readonly typeBadge: Locator;

  // Title
  readonly title: Locator;
  readonly titleEditBtn: Locator;

  // Status & Priority selects in the quick actions row
  // These are always the first two [data-slot=select-trigger] in the sheet header.
  // .first() = status, .nth(1) = priority. No other selects precede them.
  readonly statusSelect: Locator;
  readonly prioritySelect: Locator;

  // Info sections
  readonly descriptionSection: Locator;
  readonly clientLabel: Locator;
  readonly assigneeLabel: Locator;
  readonly creatorLabel: Locator;

  // Assignee select (inside the info cards grid, scoped by its label)
  readonly assigneeSelect: Locator;

  // Activity
  readonly activityTitle: Locator;

  // Comment input
  readonly commentInput: Locator;
  readonly sendButton: Locator;

  // Delete button (trash icon in header)
  readonly deleteButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Sheet is the side panel
    this.sheet = page.locator("[data-slot=sheet-content]");

    // Header badges — ticket ID starts with #
    this.ticketIdBadge = this.sheet.locator("span").filter({ hasText: /^#\d+$/ }).first();
    // Type badge — target by known type labels instead of brittle CSS color class
    this.typeBadge = this.sheet.locator("[class*=badge], span").filter({
      hasText: new RegExp(`^(${SERVICE_TEXT.typeService}|${SERVICE_TEXT.typeComplaint}|${SERVICE_TEXT.typeRetention}|${SERVICE_TEXT.typeOther})$`),
    }).first();

    // Title (h2 inside the sheet)
    this.title = this.sheet.locator("h2").first();
    this.titleEditBtn = this.sheet.locator("div:has(> h2) button").first();

    // Status and priority selects in quick actions row
    this.statusSelect = this.sheet.locator("[data-slot=select-trigger]").first();
    this.prioritySelect = this.sheet.locator("[data-slot=select-trigger]").nth(1);

    // Info sections
    this.descriptionSection = this.sheet.getByText(SERVICE_TEXT.descriptionLabel).first();
    this.clientLabel = this.sheet.getByText(SERVICE_TEXT.clientLabel).first();
    this.assigneeLabel = this.sheet.getByText(SERVICE_TEXT.assigneeLabel).first();
    this.creatorLabel = this.sheet.getByText(SERVICE_TEXT.creatorLabel);

    // Assignee select — scoped by its parent card that contains the "נציג מטפל" label
    this.assigneeSelect = this.sheet
      .locator("div.bg-white")
      .filter({ has: page.locator("label", { hasText: SERVICE_TEXT.assigneeLabel }) })
      .locator("[data-slot=select-trigger]");

    // Activity section
    this.activityTitle = this.sheet.getByText(SERVICE_TEXT.activityTitle).first();

    // Comment input and send
    this.commentInput = this.sheet.getByPlaceholder(SERVICE_TEXT.commentPlaceholder);
    this.sendButton = this.sheet.locator("button").filter({ has: page.locator("svg.lucide-send") });

    // Delete button (trash icon in the header area)
    this.deleteButton = this.sheet.locator("button").filter({
      has: page.locator("svg.lucide-trash-2"),
    }).first();
  }

  async isOpen(): Promise<boolean> {
    return this.sheet.isVisible();
  }

  async changeStatus(statusLabel: string) {
    await this.statusSelect.click();
    await this.page.getByRole("option", { name: statusLabel }).click();
  }

  async changePriority(priorityLabel: string) {
    await this.prioritySelect.click();
    await this.page.getByRole("option", { name: priorityLabel }).click();
  }

  /** Edit the ticket title inline */
  async editTitle(newTitle: string) {
    // Click the edit pencil icon next to the title
    await this.titleEditBtn.click();
    // Fill new title in the input that appears
    const titleInput = this.sheet.locator("input").first();
    await titleInput.clear();
    await titleInput.fill(newTitle);
    // Click save button (Check icon)
    const saveBtn = this.sheet.locator("button").filter({
      has: this.page.locator("svg.lucide-check"),
    }).first();
    await saveBtn.click();
  }

  /** Edit the ticket description inline */
  async editDescription(newDesc: string) {
    // Click the edit pencil next to description heading
    const descEditBtn = this.sheet
      .locator(`div:has(> h3:has-text('${SERVICE_TEXT.descriptionLabel}')) button`)
      .first();
    await descEditBtn.click();
    // Fill new description
    const textarea = this.sheet.locator("textarea").first();
    await textarea.clear();
    await textarea.fill(newDesc);
    // Click save button
    await this.sheet.getByRole("button", { name: SERVICE_TEXT.btnSave }).first().click();
  }

  /** Delete the ticket via the trash icon + confirm dialog */
  async deleteTicket() {
    await this.deleteButton.click();
    // Confirm dialog appears with "אישור" button
    const confirmBtn = this.page.getByRole("button", { name: SERVICE_TEXT.confirmBtn });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();
  }

  /** Change the assignee using the assignee select in the info cards */
  async changeAssignee(name: string) {
    await this.assigneeSelect.click();
    await this.page.getByRole("option", { name }).click();
  }

  /** Cancel description edit — click ביטול button to revert */
  async cancelEditDescription() {
    const descEditBtn = this.sheet
      .locator(`div:has(> h3:has-text('${SERVICE_TEXT.descriptionLabel}')) button`)
      .first();
    await descEditBtn.click();
    const textarea = this.sheet.locator("textarea").first();
    await textarea.clear();
    await textarea.fill("temporary-change-to-cancel");
    // Click cancel button
    await this.sheet.getByRole("button", { name: SERVICE_TEXT.btnCancel }).first().click();
  }

  /** Open the client change dialog by clicking the pencil next to client label */
  async openClientDialog() {
    const clientCard = this.sheet
      .locator("div")
      .filter({ has: this.page.locator("label", { hasText: SERVICE_TEXT.clientLabel }) })
      .first();
    // Click pencil icon (appears on hover)
    const pencilBtn = clientCard.locator("button").filter({
      has: this.page.locator("svg.lucide-pencil"),
    }).first();
    await pencilBtn.click({ force: true }); // force because it's opacity-0 until hover
  }

  /** Delete a comment by its text — hover to reveal trash, click, confirm */
  async deleteComment(commentText: string) {
    const commentEl = this.sheet.locator("div.bg-white.border.rounded-lg").filter({
      hasText: commentText,
    }).first();
    // Hover to reveal buttons
    await commentEl.hover();
    // Click trash button
    const trashBtn = commentEl.locator("button").filter({
      has: this.page.locator("svg.lucide-trash-2"),
    }).first();
    await trashBtn.click();
    // Confirm deletion
    const confirmBtn = this.page.getByRole("button", { name: SERVICE_TEXT.confirmBtn });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();
  }

  /** Edit a comment by its text — hover to reveal pencil, click, change text, save */
  async editComment(commentText: string, newText: string) {
    const commentEl = this.sheet.locator("div.bg-white.border.rounded-lg").filter({
      hasText: commentText,
    }).first();
    await commentEl.hover();
    const pencilBtn = commentEl.locator("button").filter({
      has: this.page.locator("svg.lucide-pencil"),
    }).first();
    await pencilBtn.click();
    const textarea = commentEl.locator("textarea").first();
    await textarea.clear();
    await textarea.fill(newText);
    await commentEl.getByRole("button", { name: SERVICE_TEXT.btnSave }).click();
  }

  /** Get the description paragraph text (first <p> inside the description card) */
  get descriptionText(): Locator {
    return this.sheet
      .locator("div.bg-white")
      .filter({ has: this.page.locator("h3", { hasText: SERVICE_TEXT.descriptionLabel }) })
      .locator("p")
      .first();
  }

  /** Get an activity log entry by field label (scoped to purple activity log cards) */
  getActivityLogEntry(fieldLabel: string): Locator {
    return this.sheet
      .locator("[class*='bg-purple-50']")
      .filter({ hasText: fieldLabel })
      .first();
  }

  /** Get the creator info card (scoped by the "נוצר על ידי" label) */
  get creatorCard(): Locator {
    return this.sheet
      .locator("div.bg-white")
      .filter({ has: this.page.locator("label", { hasText: SERVICE_TEXT.creatorLabel }) })
      .first();
  }

  async addComment(text: string) {
    await this.commentInput.fill(text);
    await this.sendButton.click();
  }

  async close() {
    // Click the X button in sheet header or press Escape
    await this.page.keyboard.press("Escape");
  }
}
