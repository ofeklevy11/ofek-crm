import { type Page, type Locator } from "@playwright/test";
import { TASK_TEXT } from "../helpers/selectors";

export class MySheetsPO {
  readonly page: Page;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emptyState = page.getByText(TASK_TEXT.noSheets);
  }

  /** Get a sheet card by its title (find the card container that has the h3 title) */
  getSheet(title: string): Locator {
    return this.page.locator("div.rounded-2xl").filter({
      has: this.page.locator("h3").filter({ hasText: title }),
    });
  }

  /** Get the type badge (יומי/שבועי) for a sheet */
  getSheetTypeBadge(title: string): Locator {
    const sheet = this.getSheet(title);
    return sheet.locator("span").filter({ hasText: /יומי|שבועי/ }).first();
  }

  /** Get progress text for a sheet */
  getProgressText(title: string): Locator {
    const sheet = this.getSheet(title);
    return sheet.locator("text=/\\d+%/").first();
  }

  /** Click expand/collapse on a sheet */
  async toggleSheet(title: string) {
    const sheet = this.getSheet(title);
    // Click the h3 title inside the header div (which has the onClick toggle handler)
    await sheet.locator("h3").filter({ hasText: title }).click();
  }

  /** Get a specific item within a sheet (targets the li element containing the item title) */
  getItem(itemTitle: string): Locator {
    return this.page.locator("li").filter({
      has: this.page.locator("span").filter({ hasText: itemTitle }),
    }).first();
  }

  /** Toggle completion of an item by clicking its checkbox circle */
  async toggleItem(itemTitle: string) {
    const item = this.getItem(itemTitle);
    const checkbox = item.locator("button, div[role='checkbox'], [class*='cursor-pointer']").first();
    await checkbox.click();
  }

  /** Get the reset button for a sheet */
  getResetButton(title: string): Locator {
    const sheet = this.getSheet(title);
    return sheet.getByRole("button", { name: /איפוס/ }).first();
  }

  /** Reset a sheet (click + confirm) */
  async resetSheet(title: string) {
    const resetBtn = this.getResetButton(title);
    await resetBtn.click();
    // Confirm dialog
    await this.page.getByRole("button", { name: TASK_TEXT.confirmBtn }).click();
  }
}
