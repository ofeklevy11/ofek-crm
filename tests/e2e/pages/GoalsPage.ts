import { type Page, type Locator } from "@playwright/test";

export class GoalsPage {
  readonly page: Page;

  // Page header
  readonly pageTitle: Locator;
  readonly pageSubtitle: Locator;
  readonly backLink: Locator;
  readonly archiveLink: Locator;
  readonly newGoalButton: Locator;

  // Stats
  readonly statActiveGoals: Locator;
  readonly statOnTrack: Locator;

  // Goal list
  readonly goalListHeading: Locator;
  readonly emptyStateTitle: Locator;
  readonly createFirstGoalBtn: Locator;

  // Modal (scoped to dialog)
  readonly modalDialog: Locator;
  readonly modalTitle: Locator;
  readonly goalNameInput: Locator;
  readonly continueButton: Locator;
  readonly backStepButton: Locator;
  readonly targetValueInput: Locator;
  readonly submitCreateBtn: Locator;
  readonly submitUpdateBtn: Locator;

  constructor(page: Page) {
    this.page = page;

    // Page header
    this.pageTitle = page.getByRole("heading", { name: "תכנון יעדים" });
    this.pageSubtitle = page.getByText("מעקב אחר מדדים עסקיים");
    this.backLink = page.getByRole("link", { name: /חזרה למרכז הפיננסי/ });
    this.archiveLink = page.getByRole("button", { name: /ארכיון יעדים/ });
    this.newGoalButton = page.getByRole("button", { name: /יעד חדש/ });

    // Stats — target the stat card container (div wrapping h3 + value)
    this.statActiveGoals = page.locator("h3", { hasText: "יעדים פעילים" });
    this.statOnTrack = page.locator("h3", { hasText: "במסלול להצלחה" });

    // Goal list
    this.goalListHeading = page.getByRole("heading", { name: "לוח היעדים שלך" });
    this.emptyStateTitle = page.getByText("עדיין לא הוגדרו יעדים");
    this.createFirstGoalBtn = page.getByRole("button", { name: /צור את היעד הראשון שלך/ });

    // Modal
    this.modalDialog = page.getByRole("dialog");
    this.modalTitle = this.modalDialog.getByRole("heading");
    this.goalNameInput = page.getByPlaceholder("תן שם ליעד...");
    this.continueButton = page.getByRole("button", { name: /המשך/ });
    this.backStepButton = this.modalDialog.getByRole("button", { name: "חזרה" });
    this.targetValueInput = this.modalDialog.locator('input[type="number"]');
    this.submitCreateBtn = page.getByRole("button", { name: "צור יעד" });
    this.submitUpdateBtn = page.getByRole("button", { name: "עדכן יעד" });
  }

  async goto() {
    await this.page.goto("/finance/goals");
  }

  /**
   * Get a goal card by name.
   * Note: Uses `.border-2` Tailwind class + `[dir="rtl"]` attribute for container.
   * The h3 name filter provides a strong secondary anchor.
   */
  getGoalCard(name: string): Locator {
    return this.page
      .locator('.border-2[dir="rtl"]')
      .filter({ has: this.page.locator("h3", { hasText: name }) });
  }

  /** Open the three-dot menu for a goal card */
  async openGoalMenu(name: string) {
    const card = this.getGoalCard(name);
    await card.locator('[data-slot="dropdown-menu-trigger"]').click();
  }

  getMenuItem(label: string): Locator {
    return this.page.getByRole("menuitem", { name: label });
  }

  selectMetric(name: string) {
    return this.page.getByRole("button", { name }).click();
  }

  /**
   * Read the numeric value from a stat card by its label.
   * Note: Uses `.bg-white.rounded-xl` Tailwind classes for container — no semantic
   * alternative exists without adding data-testid to source code.
   */
  async getStatValue(label: string): Promise<string> {
    const container = this.page
      .locator(".bg-white.rounded-xl")
      .filter({ has: this.page.locator("h3", { hasText: label }) });
    return (await container.locator("p").first().textContent()) ?? "";
  }

  /** Get the progress percentage text from a goal card (e.g. "75% הושלמו") */
  getProgressText(name: string): Locator {
    return this.getGoalCard(name).getByText(/\d+% הושלמו/);
  }

  /** Get the date range text from a goal card */
  getDateRange(name: string): Locator {
    // Date format: "d MMM - d MMM, yyyy" rendered next to a Clock icon
    return this.getGoalCard(name).locator("p").filter({ hasText: / - / });
  }

  /** Get the status badge from a goal card */
  getStatusBadge(name: string): Locator {
    return this.getGoalCard(name).getByText(/במסלול|בסיכון|קריטי|מצוין/).first();
  }
}
