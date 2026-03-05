import { type Page, type Locator } from "@playwright/test";

export class RetainersPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly createButton: Locator;
  readonly table: Locator;
  readonly statActive: Locator;
  readonly statPaused: Locator;
  readonly statCancelled: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.getByRole("heading", { name: "כל הריטיינרים" });
    this.createButton = page.getByRole("link", { name: /ריטיינר חדש/ });
    this.table = page.locator("table");

    // Status badges
    this.statActive = page.locator("div.text-sm.text-gray-500", { hasText: "ריטיינרים פעילים" });
    this.statPaused = page.getByText("ריטיינרים מושהים");
    this.statCancelled = page.getByText("ריטיינרים לא פעילים");
  }

  async goto() {
    await this.page.goto("/finance/retainers");
  }

  getRetainerRow(title: string) {
    return this.table.locator("tr").filter({ hasText: title });
  }

  getEditButton(title: string) {
    return this.getRetainerRow(title).getByTitle("ערוך ריטיינר");
  }

  getDeleteButton(title: string) {
    return this.getRetainerRow(title).getByTitle("מחק ריטיינר");
  }
}
