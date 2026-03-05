import { type Page, type Locator } from "@playwright/test";
import { TASK_TEXT } from "../helpers/selectors";

const COLUMN_TITLES = [
  TASK_TEXT.colTodo,
  TASK_TEXT.colInProgress,
  TASK_TEXT.colWaitingClient,
  TASK_TEXT.colOnHold,
  TASK_TEXT.colCompletedMonth,
];

export class KanbanBoardPO {
  readonly page: Page;
  readonly newTaskButton: Locator;
  readonly searchInput: Locator;
  readonly filterToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newTaskButton = page.getByRole("button", { name: TASK_TEXT.newTask });
    this.searchInput = page.getByPlaceholder(TASK_TEXT.searchPlaceholder);
    this.filterToggle = page.getByRole("button", { name: new RegExp(TASK_TEXT.sidebarTitle) });
  }

  static get columnTitles() {
    return COLUMN_TITLES;
  }

  /**
   * Get a kanban column container by its Hebrew title.
   * DOM structure: div(column) > div(header) > div(inner) > h3
   * We find the div that contains both the h3 heading AND h4 task cards (or empty state).
   */
  getColumn(title: string): Locator {
    return this.page.locator("div.flex.flex-col").filter({
      has: this.page.locator("h3").filter({ hasText: title }),
    });
  }

  /** Get the task count badge text from a column header */
  async getColumnTaskCount(title: string): Promise<string | null> {
    const column = this.getColumn(title);
    const badge = column.locator("span.rounded-full").first();
    if (await badge.isVisible()) {
      return badge.textContent();
    }
    return null;
  }

  /** Get a task card by its title text (targets the h4 element) */
  getTaskCard(title: string): Locator {
    return this.page.locator("h4").filter({ hasText: title }).first();
  }

  /** Get the edit button on a task card */
  getTaskEditButton(title: string): Locator {
    // Find the draggable card div that contains the task title h4
    const card = this.page.locator("[draggable]").filter({
      has: this.page.locator("h4").filter({ hasText: title }),
    });
    return card.getByTitle(TASK_TEXT.editTask).first();
  }

  /** Get the delete button on a task card */
  getTaskDeleteButton(title: string): Locator {
    const card = this.page.locator("[draggable]").filter({
      has: this.page.locator("h4").filter({ hasText: title }),
    });
    return card.getByTitle(TASK_TEXT.deleteTask).first();
  }

  /** Click the + button in a specific column header */
  async clickColumnNewTask(title: string) {
    const column = this.getColumn(title);
    const plusBtn = column.getByTitle(TASK_TEXT.addTaskToColumn);
    await plusBtn.click();
  }

  async clickNewTask() {
    await this.newTaskButton.click();
  }

  async searchTasks(query: string) {
    await this.searchInput.fill(query);
  }

  async clearSearch() {
    await this.searchInput.clear();
  }

  async toggleFilterSidebar() {
    await this.filterToggle.click();
  }

  /** Get all visible column titles */
  async getVisibleColumns(): Promise<string[]> {
    const columns: string[] = [];
    for (const title of COLUMN_TITLES) {
      const heading = this.page.locator("h3").filter({ hasText: title });
      if (await heading.isVisible()) {
        columns.push(title);
      }
    }
    return columns;
  }

  /** Assert a task card is inside a specific column */
  getTaskInColumn(taskTitle: string, columnTitle: string): Locator {
    const column = this.getColumn(columnTitle);
    return column.locator("h4").filter({ hasText: taskTitle });
  }
}
