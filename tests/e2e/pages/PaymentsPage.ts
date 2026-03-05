import { type Page, type Locator } from "@playwright/test";

export class PaymentsPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly createButton: Locator;
  readonly table: Locator;
  readonly statPending: Locator;
  readonly statOverdue: Locator;
  readonly statPaid: Locator;
  readonly statTotalOutstanding: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.getByRole("heading", { name: "תשלומים חד פעמיים" });
    this.createButton = page.getByRole("link", { name: /תשלום חדש/ });
    this.table = page.locator("table");

    // Stat badges
    this.statPending = page.locator("div.text-sm.text-gray-500", { hasText: "ממתין" });
    this.statOverdue = page.locator("div.text-sm.text-gray-500", { hasText: "באיחור" });
    this.statPaid = page.locator("div.text-sm.text-gray-500", { hasText: "שולם" });
    this.statTotalOutstanding = page.getByText("סה\"כ לתשלום");
  }

  async goto() {
    await this.page.goto("/finance/payments");
  }

  getPaymentRow(title: string) {
    return this.table.locator("tr").filter({ hasText: title });
  }

  getEditButton(title: string) {
    return this.getPaymentRow(title).getByTitle("ערוך תשלום");
  }

  getDeleteButton(title: string) {
    return this.getPaymentRow(title).getByTitle("מחק תשלום");
  }
}
