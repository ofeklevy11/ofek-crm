import { type Page, type Locator } from "@playwright/test";
import { TASK_TEXT } from "../helpers/selectors";

export class TasksPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly pageSubtitle: Locator;
  readonly loadingSpinner: Locator;

  // Tabs
  readonly tabKanban: Locator;
  readonly tabDone: Locator;
  readonly tabMySheets: Locator;
  readonly tabManageSheets: Locator;

  // Error
  readonly errorBanner: Locator;
  readonly retryButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.pageTitle = page.getByRole("heading", { name: TASK_TEXT.pageTitle });
    this.pageSubtitle = page.getByText(TASK_TEXT.pageSubtitle);
    this.loadingSpinner = page.locator('[class*="animate-spin"]');

    this.tabKanban = page.getByRole("link", { name: TASK_TEXT.tabKanban });
    this.tabDone = page.getByRole("link", { name: TASK_TEXT.tabDone });
    this.tabMySheets = page.getByRole("link", { name: new RegExp(TASK_TEXT.tabMySheets) });
    this.tabManageSheets = page.getByRole("link", { name: TASK_TEXT.tabManageSheets });

    this.errorBanner = page.getByText(TASK_TEXT.loadError);
    this.retryButton = page.getByRole("link", { name: TASK_TEXT.retry });
  }

  async goto(view?: string) {
    const url = view ? `/tasks?view=${view}` : "/tasks";
    await this.page.goto(url);
    await this.page.waitForLoadState("networkidle");
  }

  async getActiveTab(): Promise<string | null> {
    const url = this.page.url();
    const match = url.match(/view=(\w+)/);
    return match ? match[1] : "kanban";
  }

  async clickTab(label: string) {
    await this.page.getByRole("link", { name: label }).click();
    await this.page.waitForLoadState("networkidle");
  }

  async getMySheetsBadge(): Promise<string | null> {
    const badge = this.tabMySheets.locator("span.rounded-full");
    if (await badge.isVisible()) {
      return badge.textContent();
    }
    return null;
  }
}
