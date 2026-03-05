import { type Page, type Locator } from "@playwright/test";

export class FinanceDashboardPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly pageSubtitle: Locator;
  readonly newRetainerButton: Locator;
  readonly newPaymentButton: Locator;
  readonly incomeExpensesBanner: Locator;
  readonly goalsSection: Locator;
  readonly activeRetainersSection: Locator;
  readonly pendingPaymentsSection: Locator;
  readonly activeRetainersViewAll: Locator;
  readonly pendingPaymentsViewAll: Locator;

  readonly statMRR: Locator;
  readonly statOutstandingDebt: Locator;
  readonly statActiveRetainers: Locator;
  readonly statChurnRate: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.getByRole("heading", { name: "ניהול כספים" });
    this.pageSubtitle = page.getByText("סקירה כללית של כספי העסק");
    this.newRetainerButton = page.getByRole("link", { name: /ריטיינר חדש/ });
    this.newPaymentButton = page.getByRole("link", { name: /תשלום חדש/ });
    this.incomeExpensesBanner = page.getByRole("heading", {
      name: "דוח הוצאות והכנסות",
    });
    this.goalsSection = page.getByRole("heading", {
      name: "תכנון יעדים ותחזיות",
    });
    this.activeRetainersSection = page.getByRole("heading", {
      name: "ריטיינרים פעילים",
    });
    this.pendingPaymentsSection = page.getByRole("heading", {
      name: "תשלומים בהמתנה",
    });
    this.activeRetainersViewAll = page
      .locator("div", { has: this.activeRetainersSection })
      .getByRole("link", { name: "צפה בהכל" });
    this.pendingPaymentsViewAll = page
      .locator("div", { has: this.pendingPaymentsSection })
      .getByRole("link", { name: "צפה בהכל" });

    // FinancialStats card labels
    this.statMRR = page.getByText("הכנסה חודשית קבועה (MRR)");
    this.statOutstandingDebt = page.getByText("חובות פתוחים");
    this.statActiveRetainers = page.locator("h3", { hasText: "ריטיינרים פעילים" });
    this.statChurnRate = page.getByText("שיעור עזיבת ריטיינרים");
  }

  async goto() {
    await this.page.goto("/finance");
  }

  getNavCard(name: string) {
    return this.page.getByRole("link").filter({ hasText: name });
  }

  getStatCard(label: string) {
    return this.page.getByText(label);
  }
}
