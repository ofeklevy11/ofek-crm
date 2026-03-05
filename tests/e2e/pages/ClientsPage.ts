import { type Page, type Locator } from "@playwright/test";

export class ClientsPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly createButton: Locator;
  readonly table: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.getByRole("heading", { name: "כל הלקוחות" });
    this.createButton = page.getByRole("link", { name: /לקוח חדש/ });
    this.table = page.locator("table");
  }

  async goto() {
    await this.page.goto("/finance/clients");
  }

  getClientRow(name: string) {
    return this.table.locator("tr").filter({ hasText: name });
  }

  getDeleteButton(name: string) {
    return this.getClientRow(name).getByTitle("מחק לקוח");
  }

  getEditButton(name: string) {
    return this.getClientRow(name).getByTitle("ערוך לקוח");
  }

  getViewButton(name: string) {
    return this.getClientRow(name).getByTitle("צפה בלקוח");
  }
}
