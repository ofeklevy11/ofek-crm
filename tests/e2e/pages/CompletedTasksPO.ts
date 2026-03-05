import { type Page, type Locator } from "@playwright/test";
import { TASK_TEXT } from "../helpers/selectors";

export class CompletedTasksPO {
  readonly page: Page;

  // Filter elements
  readonly searchInput: Locator;
  readonly prioritySelect: Locator;
  readonly assigneeSelect: Locator;
  readonly tagSelect: Locator;
  readonly fromDateInput: Locator;
  readonly toDateInput: Locator;
  readonly clearFiltersButton: Locator;

  // Empty states
  readonly emptyState: Locator;
  readonly noMatchState: Locator;

  // Pagination
  readonly nextButton: Locator;
  readonly prevButton: Locator;
  readonly pageInfo: Locator;

  constructor(page: Page) {
    this.page = page;

    this.searchInput = page.getByPlaceholder(TASK_TEXT.doneSearchPlaceholder);
    this.prioritySelect = page.locator("select").filter({ has: page.locator(`option:text("${TASK_TEXT.filterPriority}")`) });
    this.assigneeSelect = page.locator("select").filter({ has: page.locator(`option:text("${TASK_TEXT.filterAssignee}")`) });
    this.tagSelect = page.locator("select").filter({ has: page.locator(`option:text("${TASK_TEXT.filterTag}")`) });
    this.fromDateInput = page.locator('input[type="date"]').first();
    this.toDateInput = page.locator('input[type="date"]').nth(1);
    this.clearFiltersButton = page.getByRole("button", { name: TASK_TEXT.clearFilters });

    this.emptyState = page.getByText(TASK_TEXT.noCompletedTasks);
    this.noMatchState = page.getByText(TASK_TEXT.noMatchingTasks);

    this.nextButton = page.getByRole("button", { name: TASK_TEXT.nextPage });
    this.prevButton = page.getByRole("button", { name: TASK_TEXT.prevPage });
    this.pageInfo = page.locator("text=/עמוד \\d+ מתוך \\d+/");
  }

  async search(query: string) {
    await this.searchInput.fill(query);
  }

  async clearSearch() {
    await this.searchInput.clear();
  }

  async filterByPriority(priority: string) {
    await this.prioritySelect.selectOption({ label: priority });
  }

  async clearAllFilters() {
    await this.clearFiltersButton.click();
  }

  getTaskCard(title: string): Locator {
    return this.page.locator("h3").filter({ hasText: title }).first();
  }

  getEditButton(title: string): Locator {
    const card = this.page.locator("div.bg-slate-800\\/60").filter({
      has: this.page.locator("h3").filter({ hasText: title }),
    });
    return card.getByTitle(TASK_TEXT.editBtnTitle).first();
  }

  getDeleteButton(title: string): Locator {
    const card = this.page.locator("div.bg-slate-800\\/60").filter({
      has: this.page.locator("h3").filter({ hasText: title }),
    });
    return card.getByTitle(TASK_TEXT.deleteBtnTitle).first();
  }

  async getPageNumber(): Promise<string | null> {
    return this.pageInfo.textContent();
  }
}
