import { type Page, type Locator } from "@playwright/test";
import { TEXT } from "../helpers/test-utils";

export class DashboardPage {
  readonly page: Page;

  // Page heading
  readonly pageTitle: Locator;
  readonly pageSubtitle: Locator;
  readonly myDashboardHeading: Locator;

  // Widget action buttons
  readonly addWidgetButton: Locator;
  readonly addMiniDashboardButton: Locator;
  readonly addGoalsTableButton: Locator;
  readonly addAnalyticsTableButton: Locator;
  readonly miniCalendarButton: Locator;
  readonly miniTasksButton: Locator;
  readonly miniQuotesButton: Locator;
  readonly miniMeetingsButton: Locator;

  // Empty state
  readonly emptyStateText: Locator;
  readonly addFirstWidgetButton: Locator;

  // Add widget modal
  readonly addWidgetModal: Locator;
  readonly addWidgetModalTitle: Locator;
  readonly tabAnalytics: Locator;
  readonly tabGoals: Locator;
  readonly tabTableViews: Locator;
  readonly noAnalyticsMessage: Locator;
  readonly noGoalsMessage: Locator;
  readonly modalCancelButton: Locator;
  readonly modalAddButton: Locator;

  // Config modal (mini widget settings)
  readonly configModal: Locator;

  // Delete confirmation modal
  readonly deleteModalTitle: Locator;
  readonly deleteModalInput: Locator;
  readonly deleteModalConfirmButton: Locator;
  readonly deleteModalCancelButton: Locator;

  // No access state
  readonly noAccessTitle: Locator;
  readonly noAccessMessage: Locator;

  // Rate limit
  readonly rateLimitTitle: Locator;
  readonly rateLimitRetryButton: Locator;

  // Loading
  readonly loadingSpinner: Locator;

  constructor(page: Page) {
    this.page = page;

    // Heading
    this.pageTitle = page.getByRole("heading", { name: TEXT.dashboardTitle });
    this.pageSubtitle = page.getByText(TEXT.dashboardSubtitle);
    this.myDashboardHeading = page.getByRole("heading", {
      name: TEXT.myDashboard,
    });

    // Action buttons
    this.addWidgetButton = page.getByRole("button", {
      name: TEXT.addWidget,
    });
    this.addMiniDashboardButton = page.getByRole("button", {
      name: TEXT.addMiniDashboard,
    });
    this.addGoalsTableButton = page.getByRole("button", {
      name: TEXT.addGoalsTable,
    });
    this.addAnalyticsTableButton = page.getByRole("button", {
      name: TEXT.addAnalyticsTable,
    });
    this.miniCalendarButton = page.getByRole("button", {
      name: TEXT.miniCalendar,
    });
    this.miniTasksButton = page.getByRole("button", {
      name: TEXT.miniTasks,
    });
    this.miniQuotesButton = page.getByRole("button", {
      name: TEXT.miniQuotes,
    });
    this.miniMeetingsButton = page.getByRole("button", {
      name: TEXT.miniMeetings,
    });

    // Empty state
    this.emptyStateText = page.getByText(TEXT.emptyDashboard);
    this.addFirstWidgetButton = page.getByRole("button", {
      name: TEXT.addFirstWidget,
    });

    // Add widget modal — scoped container
    this.addWidgetModal = page.locator(".fixed.inset-0").filter({
      has: page.getByText(TEXT.addWidgetModalTitle),
    });
    this.addWidgetModalTitle = page.getByText(TEXT.addWidgetModalTitle);
    this.tabAnalytics = this.addWidgetModal.getByRole("button", {
      name: TEXT.tabAnalytics,
    });
    this.tabGoals = this.addWidgetModal.getByRole("button", {
      name: TEXT.tabGoals,
    });
    this.tabTableViews = this.addWidgetModal.getByRole("button", {
      name: TEXT.tabTableViews,
    });
    this.noAnalyticsMessage = this.addWidgetModal.getByText(TEXT.noAnalytics);
    this.noGoalsMessage = this.addWidgetModal.getByText(TEXT.noGoals);
    this.modalCancelButton = this.addWidgetModal.getByRole("button", {
      name: TEXT.cancelButton,
    });
    this.modalAddButton = this.addWidgetModal.getByRole("button", {
      name: TEXT.addToDashboard,
    });

    // Config modal — scoped container (mini widget settings)
    this.configModal = page.locator(".fixed.inset-0").filter({
      has: page.getByText(TEXT.configModalTitle),
    });

    // Delete confirmation modal
    this.deleteModalTitle = page.getByRole("heading", {
      name: TEXT.deleteModalTitle,
    });
    this.deleteModalInput = page
      .getByRole("dialog")
      .locator("input");
    this.deleteModalConfirmButton = page
      .getByRole("dialog")
      .getByRole("button", { name: TEXT.deleteConfirmButton });
    this.deleteModalCancelButton = page
      .getByRole("dialog")
      .getByRole("button", { name: TEXT.cancelButton });

    // No access
    this.noAccessTitle = page.getByText(TEXT.noAccess);
    this.noAccessMessage = page.getByText(TEXT.contactAdmin);

    // Rate limit
    this.rateLimitTitle = page.getByRole("heading", {
      name: TEXT.rateLimitTitle,
    });
    this.rateLimitRetryButton = page.getByRole("button", {
      name: TEXT.rateLimitRetry,
    });

    // Loading
    this.loadingSpinner = page.getByRole("status");
  }

  async goto() {
    await this.page.goto("/");
  }

  async waitForDashboardLoad() {
    await this.myDashboardHeading.waitFor({ state: "visible", timeout: 15000 });
  }

  async openAddWidgetModal() {
    await this.addWidgetButton.click();
    await this.addWidgetModalTitle.waitFor({ state: "visible" });
  }

  async closeAddWidgetModal() {
    await this.modalCancelButton.click();
    await this.addWidgetModalTitle.waitFor({ state: "hidden" });
  }

  async getWidgetCount(): Promise<number> {
    const widgets = this.page.getByTestId("dashboard-widget");
    return await widgets.count();
  }

  getWidgetRemoveButton(index: number): Locator {
    return this.page
      .getByRole("button", { name: TEXT.widgetRemoveTitle })
      .nth(index);
  }

  /** Add a mini meetings widget and wait for the success toast. */
  async addMiniMeetingsAndWait(): Promise<void> {
    await this.miniMeetingsButton.click();
    await this.page
      .getByText(TEXT.toastMiniMeetingsAdded)
      .waitFor({ state: "visible" });
  }

  /** Hover over a widget to reveal its action buttons (collapse/expand, remove). */
  async hoverWidget(index: number): Promise<void> {
    await this.page.getByTestId("dashboard-widget").nth(index).hover();
  }

  /** Get the collapse ("הסתר") button scoped to a specific widget. */
  getWidgetCollapseButton(index: number): Locator {
    return this.page
      .getByTestId("dashboard-widget")
      .nth(index)
      .getByRole("button", { name: TEXT.collapseWidget });
  }

  /** Get the expand ("הצג") button scoped to a specific widget. */
  getWidgetExpandButton(index: number): Locator {
    return this.page
      .getByTestId("dashboard-widget")
      .nth(index)
      .getByRole("button", { name: TEXT.expandWidget });
  }

  /** Get the settings gear button scoped to a specific widget. */
  getWidgetSettingsButton(index: number): Locator {
    return this.page
      .getByTestId("dashboard-widget")
      .nth(index)
      .getByRole("button", { name: TEXT.settingsButton });
  }

  /** Delete a widget by clicking its remove button, typing the title, and confirming. */
  async deleteWidgetByTitle(index: number, title: string): Promise<void> {
    await this.getWidgetRemoveButton(index).click();
    await this.deleteModalTitle.waitFor({ state: "visible" });
    await this.deleteModalInput.fill(title);
    await this.deleteModalConfirmButton.click();
    await this.deleteModalTitle.waitFor({ state: "hidden" });
  }
}
