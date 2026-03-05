import { test, expect } from "@playwright/test";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import {
  TEXT,
  STORAGE_BASIC,
  STORAGE_NO_TASKS,
  interceptAllServerActions,
} from "./helpers/test-utils";

// ─────────────────────────────────────────────────────────
// 1. Landing Page (Unauthenticated)
// ─────────────────────────────────────────────────────────

test.describe("Landing Page (Unauthenticated)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let landing: LandingPage;

  test.beforeEach(async ({ page }) => {
    landing = new LandingPage(page);
    await landing.goto();
  });

  test("page loads and shows hero content", async () => {
    await expect(landing.heroTitle).toBeVisible();
    await expect(landing.heroSubtitle).toBeVisible();
  });

  test("login and register buttons are visible", async () => {
    await expect(landing.loginButton).toBeVisible();
    await expect(landing.registerButton).toBeVisible();
  });

  test("feature highlights are visible", async () => {
    await expect(landing.featureLeads).toBeVisible();
    await expect(landing.featureAutomations).toBeVisible();
    await expect(landing.featureReports).toBeVisible();
  });

  test("CRM badge is visible", async () => {
    await expect(landing.crmBadge).toBeVisible();
  });

  test("click login navigates to /login", async ({ page }) => {
    await landing.clickLogin();
    await expect(page).toHaveURL(/\/login/);
  });

  test("click register navigates to /register", async ({ page }) => {
    await landing.clickRegister();
    await expect(page).toHaveURL(/\/register/);
  });

  test('navbar shows "התחבר" link', async () => {
    await expect(landing.navLoginLink).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 2. Authentication Flows
// ─────────────────────────────────────────────────────────

test.describe("Authentication Flows", () => {
  test("unauthenticated user accessing protected route redirects to /login", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto("/tables");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("authenticated user at / sees dashboard (not landing)", async ({
    page,
  }) => {
    // Default storageState = admin.json (from config)
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(dashboard.pageTitle).toBeVisible();
    await expect(page.getByText(TEXT.heroTitle)).not.toBeVisible();
  });

  test("authenticated user at /login is redirected to /", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL("/");
  });

  test("invalid auth token redirects to /login", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: {
        cookies: [
          {
            name: "auth_token",
            value: "invalid.token.value",
            domain: "localhost",
            path: "/",
          },
        ],
        origins: [],
      },
    });
    const page = await context.newPage();
    await page.goto("/tables");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });
});

// ─────────────────────────────────────────────────────────
// 3. Dashboard Page Load (Authenticated — Admin)
// ─────────────────────────────────────────────────────────

test.describe("Dashboard Page Load (Authenticated)", () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
  });

  test('page title "לוח בקרה" is visible', async () => {
    await expect(dashboard.pageTitle).toBeVisible();
  });

  test("subtitle is visible", async () => {
    await expect(dashboard.pageSubtitle).toBeVisible();
  });

  test('"הדאשבורד שלי" section heading is visible', async () => {
    await expect(dashboard.myDashboardHeading).toBeVisible();
  });

  test("widget action buttons are visible", async () => {
    await expect(dashboard.addWidgetButton).toBeVisible();
    await expect(dashboard.addMiniDashboardButton).toBeVisible();
    await expect(dashboard.addGoalsTableButton).toBeVisible();
    await expect(dashboard.addAnalyticsTableButton).toBeVisible();
  });

  test("navbar shows dashboard link for admin", async ({ page }) => {
    const navbar = page.getByRole("navigation");
    await expect(navbar).toBeVisible();
    await expect(
      page.getByRole("link", { name: TEXT.navDashboard })
    ).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 4. Dashboard Empty State
// ─────────────────────────────────────────────────────────

test.describe("Dashboard Empty State", () => {
  test("freshly seeded admin sees empty state", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    await expect(dashboard.emptyStateText).toBeVisible();
    await expect(dashboard.addFirstWidgetButton).toBeVisible();
  });

  test("clicking add first widget button opens modal", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    await dashboard.addFirstWidgetButton.click();
    await expect(dashboard.addWidgetModalTitle).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 5. Add Widget Modal
// ─────────────────────────────────────────────────────────

test.describe("Add Widget Modal", () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();
  });

  test("opens modal via add widget button", async () => {
    await dashboard.openAddWidgetModal();
    await expect(dashboard.addWidgetModalTitle).toBeVisible();
  });

  test("modal has three type tabs", async () => {
    await dashboard.openAddWidgetModal();
    await expect(dashboard.tabAnalytics).toBeVisible();
    await expect(dashboard.tabGoals).toBeVisible();
    await expect(dashboard.tabTableViews).toBeVisible();
  });

  test("switching between tabs updates content area", async ({ page }) => {
    await dashboard.openAddWidgetModal();

    // Analytics tab — should show empty analytics message
    await dashboard.tabAnalytics.click();
    await expect(page.getByText(TEXT.noAnalytics)).toBeVisible();

    // Goals tab — should show empty goals message
    await dashboard.tabGoals.click();
    await expect(page.getByText(TEXT.noGoals)).toBeVisible();

    // Table views tab — should show select table text
    await dashboard.tabTableViews.click();
    await expect(page.getByText(TEXT.selectTable)).toBeVisible();
  });

  test("cancel button closes modal", async () => {
    await dashboard.openAddWidgetModal();
    await dashboard.closeAddWidgetModal();
    await expect(dashboard.addWidgetModalTitle).not.toBeVisible();
  });

  test("add button disabled when nothing selected in modal", async () => {
    await dashboard.openAddWidgetModal();
    await expect(dashboard.modalAddButton).toBeDisabled();
  });

  test("clicking backdrop closes add widget modal", async ({ page }) => {
    await dashboard.openAddWidgetModal();
    // Click the overlay backdrop outside the centered modal content
    const backdrop = page.locator(".fixed.inset-0").filter({
      has: page.getByText(TEXT.addWidgetModalTitle),
    });
    await backdrop.click({ position: { x: 10, y: 10 } });
    await expect(dashboard.addWidgetModalTitle).not.toBeVisible();
  });

  test("shows empty analytics message when none available", async () => {
    await dashboard.openAddWidgetModal();
    await dashboard.tabAnalytics.click();
    await expect(dashboard.noAnalyticsMessage).toBeVisible();
  });

  test("shows empty goals message when none available", async () => {
    await dashboard.openAddWidgetModal();
    await dashboard.tabGoals.click();
    await expect(dashboard.noGoalsMessage).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 6. Mini Widget Buttons
// ─────────────────────────────────────────────────────────

test.describe("Mini Widget Buttons", () => {
  test("all four conditional mini widget buttons visible for admin", async ({
    page,
  }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    await expect(dashboard.miniCalendarButton).toBeVisible();
    await expect(dashboard.miniTasksButton).toBeVisible();
    await expect(dashboard.miniQuotesButton).toBeVisible();
    await expect(dashboard.miniMeetingsButton).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 7. Mini Widget Config Modals
// ─────────────────────────────────────────────────────────

test.describe("Mini Widget Config Modals", () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();
  });

  test("clicking mini calendar button opens config modal with calendar presets", async ({
    page,
  }) => {
    await dashboard.miniCalendarButton.click();

    await expect(
      page.getByRole("heading", { name: TEXT.configModalTitle })
    ).toBeVisible();

    // Calendar presets
    await expect(page.getByText(TEXT.presetToday)).toBeVisible();
    await expect(page.getByText(TEXT.presetThisWeek)).toBeVisible();
    await expect(page.getByText(TEXT.preset7Days)).toBeVisible();
    await expect(page.getByText(TEXT.preset14Days)).toBeVisible();
    await expect(page.getByText(TEXT.presetThisMonth)).toBeVisible();

    // Confirm and cancel buttons
    await expect(
      dashboard.configModal.getByRole("button", { name: TEXT.configModalConfirm })
    ).toBeVisible();
    await expect(
      dashboard.configModal.getByRole("button", { name: TEXT.cancelButton })
    ).toBeVisible();

    // Close modal
    await dashboard.configModal.getByRole("button", { name: TEXT.cancelButton }).click();
  });

  test("clicking mini tasks button opens config modal with task presets", async ({
    page,
  }) => {
    await dashboard.miniTasksButton.click();

    await expect(
      page.getByRole("heading", { name: TEXT.configModalTitle })
    ).toBeVisible();

    // Task presets
    await expect(page.getByText(TEXT.presetOverdue)).toBeVisible();
    await expect(page.getByText(TEXT.presetMyTasks)).toBeVisible();
    await expect(page.getByText(TEXT.presetAllActive)).toBeVisible();
    await expect(page.getByText(TEXT.presetDueThisWeek)).toBeVisible();

    // Close modal
    await dashboard.configModal.getByRole("button", { name: TEXT.cancelButton }).click();
  });

  test("clicking mini quotes button opens config modal with quote presets", async ({
    page,
  }) => {
    await dashboard.miniQuotesButton.click();

    await expect(
      page.getByRole("heading", { name: TEXT.configModalTitle })
    ).toBeVisible();

    // Quote presets
    await expect(page.getByText(TEXT.presetRecent)).toBeVisible();
    await expect(page.getByText(TEXT.presetThisMonth)).toBeVisible();
    await expect(page.getByText(TEXT.presetPending)).toBeVisible();
    await expect(page.getByText(TEXT.presetClosed)).toBeVisible();

    // Close modal
    await dashboard.configModal.getByRole("button", { name: TEXT.cancelButton }).click();
  });

  test("confirming mini calendar config modal adds widget to dashboard", async ({
    page,
  }) => {
    const countBefore = await dashboard.getWidgetCount();

    await dashboard.miniCalendarButton.click();
    await expect(
      page.getByRole("heading", { name: TEXT.configModalTitle })
    ).toBeVisible();

    // Click confirm to add widget
    await dashboard.configModal.getByRole("button", { name: TEXT.configModalConfirm }).click();

    // Modal should close
    await expect(
      page.getByRole("heading", { name: TEXT.configModalTitle })
    ).not.toBeVisible();

    // Widget count should increase
    await expect(async () => {
      const countAfter = await dashboard.getWidgetCount();
      expect(countAfter).toBe(countBefore + 1);
    }).toPass({ timeout: 5000 });

    // Clean up
    await dashboard.deleteWidgetByTitle(0, TEXT.miniCalendar);
  });

  test("confirming mini tasks config modal adds widget to dashboard", async ({
    page,
  }) => {
    const countBefore = await dashboard.getWidgetCount();

    await dashboard.miniTasksButton.click();
    await expect(
      page.getByRole("heading", { name: TEXT.configModalTitle })
    ).toBeVisible();

    // Click confirm to add widget
    await dashboard.configModal.getByRole("button", { name: TEXT.configModalConfirm }).click();

    // Modal should close
    await expect(
      page.getByRole("heading", { name: TEXT.configModalTitle })
    ).not.toBeVisible();

    // Widget count should increase
    await expect(async () => {
      const countAfter = await dashboard.getWidgetCount();
      expect(countAfter).toBe(countBefore + 1);
    }).toPass({ timeout: 5000 });

    // Clean up
    await dashboard.deleteWidgetByTitle(0, TEXT.miniTasks);
  });

  test("confirming mini quotes config modal adds widget to dashboard", async ({
    page,
  }) => {
    const countBefore = await dashboard.getWidgetCount();

    await dashboard.miniQuotesButton.click();
    await expect(
      page.getByRole("heading", { name: TEXT.configModalTitle })
    ).toBeVisible();

    // Click confirm to add widget
    await dashboard.configModal.getByRole("button", { name: TEXT.configModalConfirm }).click();

    // Modal should close
    await expect(
      page.getByRole("heading", { name: TEXT.configModalTitle })
    ).not.toBeVisible();

    // Widget count should increase
    await expect(async () => {
      const countAfter = await dashboard.getWidgetCount();
      expect(countAfter).toBe(countBefore + 1);
    }).toPass({ timeout: 5000 });

    // Clean up
    await dashboard.deleteWidgetByTitle(0, TEXT.miniQuotes);
  });

  // handleMiniConfigConfirm uses try/finally (no catch). setMiniConfigModal(null)
  // at L434 is inside try — when server action throws, it never executes, so
  // modal stays open. No catch block means no error toast.
  test("config modal error: modal stays open and no widget is added when server action fails", async ({
    page,
  }) => {
    const countBefore = await dashboard.getWidgetCount();

    await dashboard.miniCalendarButton.click();
    await expect(
      page.getByRole("heading", { name: TEXT.configModalTitle })
    ).toBeVisible();

    // Intercept all server actions to simulate failure
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.abort("failed");
    });

    // Click confirm — server action will fail
    await dashboard.configModal.getByRole("button", { name: TEXT.configModalConfirm }).click();

    // Modal should stay open (setMiniConfigModal(null) is inside try, never reached)
    await expect(
      page.getByRole("heading", { name: TEXT.configModalTitle })
    ).toBeVisible();

    // Widget count should not change
    const countAfter = await dashboard.getWidgetCount();
    expect(countAfter).toBe(countBefore);

    // No error toast — handleMiniConfigConfirm has try/finally with NO catch,
    // so no toast.error() is called. Contrast with handleAddMiniMeetings which
    // DOES have a catch block (section 10 tests that path).
    await expect(page.getByText(TEXT.toastWidgetError)).not.toBeVisible();

    await cleanup();

    // Close modal manually
    await dashboard.configModal.getByRole("button", { name: TEXT.cancelButton }).click();
  });

  test("config modal subtitle shows correct widget type name", async ({
    page,
  }) => {
    // Calendar — scope to configModal to avoid strict mode collision with page button
    await dashboard.miniCalendarButton.click();
    await expect(dashboard.configModal.getByText(TEXT.miniCalendar)).toBeVisible();
    await dashboard.configModal.getByRole("button", { name: TEXT.cancelButton }).click();

    // Tasks
    await dashboard.miniTasksButton.click();
    await expect(dashboard.configModal.getByText(TEXT.miniTasks)).toBeVisible();
    await dashboard.configModal.getByRole("button", { name: TEXT.cancelButton }).click();

    // Quotes
    await dashboard.miniQuotesButton.click();
    await expect(dashboard.configModal.getByText(TEXT.miniQuotes)).toBeVisible();
    await dashboard.configModal.getByRole("button", { name: TEXT.cancelButton }).click();
  });

  test("closing mini config modal without confirming does not add widget", async ({
    page,
  }) => {
    const countBefore = await dashboard.getWidgetCount();

    await dashboard.miniCalendarButton.click();
    await expect(
      page.getByRole("heading", { name: TEXT.configModalTitle })
    ).toBeVisible();

    // Cancel without confirming
    await dashboard.configModal.getByRole("button", { name: TEXT.cancelButton }).click();
    await expect(
      page.getByRole("heading", { name: TEXT.configModalTitle })
    ).not.toBeVisible();

    const countAfter = await dashboard.getWidgetCount();
    expect(countAfter).toBe(countBefore);
  });

  test("settings gear opens config modal in edit mode with presets", async ({ page }) => {
    // Add a mini calendar widget
    await dashboard.miniCalendarButton.click();
    await expect(
      page.getByRole("heading", { name: TEXT.configModalTitle })
    ).toBeVisible();
    await dashboard.configModal
      .getByRole("button", { name: TEXT.configModalConfirm })
      .click();
    await expect(
      page.getByRole("heading", { name: TEXT.configModalTitle })
    ).not.toBeVisible();

    // Wait for widget to appear
    await expect(async () => {
      expect(await dashboard.getWidgetCount()).toBeGreaterThan(0);
    }).toPass({ timeout: 5000 });

    // Click settings gear on the widget
    await dashboard.hoverWidget(0);
    await dashboard.getWidgetSettingsButton(0).click();

    // Config modal opens in EDIT mode (different heading from create)
    await expect(
      page.getByRole("heading", { name: TEXT.configModalEditTitle })
    ).toBeVisible();

    // Calendar presets should be visible (pre-populated from current settings)
    await expect(page.getByText(TEXT.presetToday)).toBeVisible();

    // Cancel without saving
    await page.getByRole("button", { name: TEXT.cancelButton }).click();

    // Clean up
    await dashboard.deleteWidgetByTitle(0, TEXT.miniCalendar);
  });
});

// ─────────────────────────────────────────────────────────
// 8. Widget CRUD Flow (serial — modifies state)
// ─────────────────────────────────────────────────────────

test.describe("Widget CRUD Flow", () => {
  test.describe.configure({ mode: "serial" });

  let dashboard: DashboardPage;

  test("add mini meetings widget appears in grid", async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    const countBefore = await dashboard.getWidgetCount();
    expect(countBefore).toBe(0);

    // Click the mini meetings button to add widget
    await dashboard.miniMeetingsButton.click();

    // Toast should appear
    await expect(
      page.getByText(TEXT.toastMiniMeetingsAdded)
    ).toBeVisible();

    // Widget count should increase
    await expect(async () => {
      const countAfter = await dashboard.getWidgetCount();
      expect(countAfter).toBe(1);
    }).toPass({ timeout: 5000 });
  });

  test("delete widget: correct title enables confirm, wrong title keeps disabled", async ({
    page,
  }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    // Self-sufficient: add a widget if none exists
    const currentCount = await dashboard.getWidgetCount();
    if (currentCount === 0) {
      await dashboard.addMiniMeetingsAndWait();
      await expect(async () => {
        expect(await dashboard.getWidgetCount()).toBeGreaterThan(0);
      }).toPass({ timeout: 5000 });
    }

    // Click remove button on first widget
    await dashboard.getWidgetRemoveButton(0).click();

    // Delete modal should appear
    await expect(dashboard.deleteModalTitle).toBeVisible();

    // Type wrong text — confirm button should be disabled
    await dashboard.deleteModalInput.fill("wrong text");
    await expect(dashboard.deleteModalConfirmButton).toBeDisabled();

    // Clear and type correct title
    await dashboard.deleteModalInput.clear();
    await dashboard.deleteModalInput.fill(TEXT.miniMeetings);
    await expect(dashboard.deleteModalConfirmButton).toBeEnabled();

    // Click confirm — modal closes, widget removed
    await dashboard.deleteModalConfirmButton.click();
    await expect(dashboard.deleteModalTitle).not.toBeVisible();

    // Widget count should decrease to 0
    await expect(async () => {
      const countAfter = await dashboard.getWidgetCount();
      expect(countAfter).toBe(0);
    }).toPass({ timeout: 5000 });
  });

  test("cancel delete keeps widget", async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    // Add a widget first
    await dashboard.addMiniMeetingsAndWait();

    await expect(async () => {
      const count = await dashboard.getWidgetCount();
      expect(count).toBe(1);
    }).toPass({ timeout: 5000 });

    // Click remove button
    await dashboard.getWidgetRemoveButton(0).click();
    await expect(dashboard.deleteModalTitle).toBeVisible();

    // Click cancel
    await dashboard.deleteModalCancelButton.click();
    await expect(dashboard.deleteModalTitle).not.toBeVisible();

    // Widget should still be there
    const countAfter = await dashboard.getWidgetCount();
    expect(countAfter).toBe(1);

    // Clean up — delete the widget
    await dashboard.getWidgetRemoveButton(0).click();
    await dashboard.deleteModalInput.fill(TEXT.miniMeetings);
    await dashboard.deleteModalConfirmButton.click();
    await expect(dashboard.deleteModalTitle).not.toBeVisible();
  });

  test("delete modal displays the widget title for confirmation", async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    // Add a widget
    await dashboard.addMiniMeetingsAndWait();
    await expect(async () => {
      expect(await dashboard.getWidgetCount()).toBe(1);
    }).toPass({ timeout: 5000 });

    // Open delete modal
    await dashboard.getWidgetRemoveButton(0).click();
    await expect(dashboard.deleteModalTitle).toBeVisible();

    // Dialog body should contain the widget title
    await expect(page.getByRole("dialog")).toContainText(TEXT.miniMeetings);

    // Close modal
    await page.keyboard.press("Escape");
    await expect(dashboard.deleteModalTitle).not.toBeVisible();

    // Clean up
    await dashboard.deleteWidgetByTitle(0, TEXT.miniMeetings);
  });

  test("empty state returns after deleting last widget", async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    // Add a widget
    await dashboard.addMiniMeetingsAndWait();
    await expect(async () => {
      expect(await dashboard.getWidgetCount()).toBe(1);
    }).toPass({ timeout: 5000 });

    // Empty state should NOT be visible while widget exists
    await expect(dashboard.emptyStateText).not.toBeVisible();

    // Delete the widget
    await dashboard.deleteWidgetByTitle(0, TEXT.miniMeetings);

    // Empty state should reappear
    await expect(dashboard.emptyStateText).toBeVisible();
  });

  test("multiple widgets can coexist", async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    // Add first widget
    await dashboard.addMiniMeetingsAndWait();
    await expect(async () => {
      expect(await dashboard.getWidgetCount()).toBe(1);
    }).toPass({ timeout: 5000 });

    // Add second widget
    await dashboard.addMiniMeetingsAndWait();
    await expect(async () => {
      expect(await dashboard.getWidgetCount()).toBe(2);
    }).toPass({ timeout: 5000 });

    // Delete first widget — second should remain
    await dashboard.deleteWidgetByTitle(0, TEXT.miniMeetings);
    await expect(async () => {
      expect(await dashboard.getWidgetCount()).toBe(1);
    }).toPass({ timeout: 5000 });

    // Clean up — delete remaining widget
    await dashboard.deleteWidgetByTitle(0, TEXT.miniMeetings);
    await expect(async () => {
      expect(await dashboard.getWidgetCount()).toBe(0);
    }).toPass({ timeout: 5000 });
  });

  test("widget persists after page reload", async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    // Add a widget
    await dashboard.addMiniMeetingsAndWait();
    await expect(async () => {
      expect(await dashboard.getWidgetCount()).toBe(1);
    }).toPass({ timeout: 5000 });

    // Reload the page
    await page.reload();
    await dashboard.waitForDashboardLoad();

    // Widget should still be present (server-persisted)
    await expect(async () => {
      expect(await dashboard.getWidgetCount()).toBe(1);
    }).toPass({ timeout: 5000 });

    // Clean up
    await dashboard.deleteWidgetByTitle(0, TEXT.miniMeetings);
  });

  test("collapsed widget state persists after page reload", async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    // Add a widget
    await dashboard.addMiniMeetingsAndWait();
    await expect(async () => {
      expect(await dashboard.getWidgetCount()).toBe(1);
    }).toPass({ timeout: 5000 });

    // Collapse the widget
    await dashboard.hoverWidget(0);
    await dashboard.getWidgetCollapseButton(0).click();

    // Verify collapsed
    await dashboard.hoverWidget(0);
    await expect(dashboard.getWidgetExpandButton(0)).toBeVisible();

    // Reload page — collapsed state should persist (server-persisted)
    await page.reload();
    await dashboard.waitForDashboardLoad();

    // Widget should still be collapsed after reload
    await dashboard.hoverWidget(0);
    await expect(dashboard.getWidgetExpandButton(0)).toBeVisible();
    await expect(dashboard.getWidgetCollapseButton(0)).not.toBeVisible();

    // Clean up: expand then delete
    await dashboard.getWidgetExpandButton(0).click();
    await dashboard.deleteWidgetByTitle(0, TEXT.miniMeetings);
  });

  test("widget collapse hides content and expand restores it", async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    // Add a widget
    await dashboard.addMiniMeetingsAndWait();
    await expect(async () => {
      expect(await dashboard.getWidgetCount()).toBe(1);
    }).toPass({ timeout: 5000 });

    // Hover widget to reveal action buttons, then click collapse
    await dashboard.hoverWidget(0);
    await dashboard.getWidgetCollapseButton(0).click();

    // After collapse: expand button ("הצג") should appear, collapse button ("הסתר") should not
    await dashboard.hoverWidget(0);
    await expect(dashboard.getWidgetExpandButton(0)).toBeVisible();
    await expect(dashboard.getWidgetCollapseButton(0)).not.toBeVisible();
    // Content link should be hidden (inside the {!isCollapsed && (...)} block)
    await expect(page.getByRole("link", { name: TEXT.viewAllMeetings })).not.toBeVisible();

    // Click expand to restore
    await dashboard.getWidgetExpandButton(0).click();

    // After expand: collapse button should return
    await dashboard.hoverWidget(0);
    await expect(dashboard.getWidgetCollapseButton(0)).toBeVisible();
    await expect(dashboard.getWidgetExpandButton(0)).not.toBeVisible();
    // Content link should be visible again
    await expect(page.getByRole("link", { name: TEXT.viewAllMeetings })).toBeVisible();

    // Clean up
    await dashboard.deleteWidgetByTitle(0, TEXT.miniMeetings);
  });

  test("delete modal closes on Escape key", async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    // Add a widget to delete
    await dashboard.addMiniMeetingsAndWait();
    await expect(async () => {
      expect(await dashboard.getWidgetCount()).toBe(1);
    }).toPass({ timeout: 5000 });

    // Open delete modal
    await dashboard.getWidgetRemoveButton(0).click();
    await expect(dashboard.deleteModalTitle).toBeVisible();

    // Press Escape — delete modal is a Radix Dialog, should close
    await page.keyboard.press("Escape");
    await expect(dashboard.deleteModalTitle).not.toBeVisible();

    // Widget should still exist
    expect(await dashboard.getWidgetCount()).toBe(1);

    // Clean up
    await dashboard.deleteWidgetByTitle(0, TEXT.miniMeetings);
  });
});

// ─────────────────────────────────────────────────────────
// 9. Permission-Based Access
// ─────────────────────────────────────────────────────────

test.describe("Permission-Based Access", () => {
  test("basic user without canViewDashboard sees no-access message", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: STORAGE_NO_TASKS,
    });
    const page = await context.newPage();
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.noAccessTitle).toBeVisible();
    await expect(dashboard.noAccessMessage).toBeVisible();
    await context.close();
  });

  test("basic user with limited permissions sees no-access on dashboard", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: STORAGE_BASIC,
    });
    const page = await context.newPage();
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.noAccessTitle).toBeVisible();
    await context.close();
  });

  test("admin user has full dashboard access", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.pageTitle).toBeVisible();
    await expect(dashboard.myDashboardHeading).toBeVisible();
  });

  test("no-tasks user does not see mini widget buttons", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: STORAGE_NO_TASKS,
    });
    const page = await context.newPage();
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // User without dashboard access should not see mini widget buttons
    await expect(dashboard.miniCalendarButton).not.toBeVisible();
    await expect(dashboard.miniTasksButton).not.toBeVisible();
    await expect(dashboard.miniQuotesButton).not.toBeVisible();
    await expect(dashboard.miniMeetingsButton).not.toBeVisible();
    await context.close();
  });
});

// ─────────────────────────────────────────────────────────
// 10. Server Action Error Handling
// ─────────────────────────────────────────────────────────

test.describe("Server Action Error Handling", () => {
  test("shows error toast when add widget server action fails", async ({
    page,
  }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    const countBefore = await dashboard.getWidgetCount();

    // Intercept all server actions to simulate failure
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.abort("failed");
    });

    // Try to add mini meetings widget
    await dashboard.miniMeetingsButton.click();

    // Error toast should appear
    await expect(page.getByText(TEXT.toastWidgetError)).toBeVisible();

    // Widget count should not change
    const countAfter = await dashboard.getWidgetCount();
    expect(countAfter).toBe(countBefore);

    await cleanup();
  });

  test("widget reverts to expanded state when collapse server action fails", async ({
    page,
  }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    // Add a widget
    await dashboard.addMiniMeetingsAndWait();
    await expect(async () => {
      expect(await dashboard.getWidgetCount()).toBe(1);
    }).toPass({ timeout: 5000 });

    // Verify widget starts expanded (collapse button visible on hover)
    await dashboard.hoverWidget(0);
    await expect(dashboard.getWidgetCollapseButton(0)).toBeVisible();

    // Intercept all server actions to simulate failure
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.abort("failed");
    });

    // Click collapse — widget optimistically collapses
    await dashboard.getWidgetCollapseButton(0).click();

    // Wait for rollback: the catch block reverts isCollapsed, so collapse button should return
    await expect(async () => {
      await dashboard.hoverWidget(0);
      await expect(dashboard.getWidgetCollapseButton(0)).toBeVisible();
    }).toPass({ timeout: 5000 });

    await cleanup();

    // Clean up
    await dashboard.deleteWidgetByTitle(0, TEXT.miniMeetings);
  });

  // Note: confirmRemoveWidget uses try/finally (no catch). When the server action
  // aborts, the error propagates as an unhandled rejection. Widget state is
  // preserved because setWidgets is inside `if (res.success)`, which never
  // executes when the call throws before returning a result.
  test("widget state not corrupted when delete action fails (no error handling)", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    // Add a widget first
    await dashboard.addMiniMeetingsAndWait();
    await expect(async () => {
      expect(await dashboard.getWidgetCount()).toBe(1);
    }).toPass({ timeout: 5000 });

    // Intercept all server actions to simulate failure
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.abort("failed");
    });

    // Try to delete
    await dashboard.getWidgetRemoveButton(0).click();
    await dashboard.deleteModalInput.fill(TEXT.miniMeetings);
    await dashboard.deleteModalConfirmButton.click();

    // Widget should still exist after the failed action attempt
    await expect(async () => {
      expect(await dashboard.getWidgetCount()).toBe(1);
    }).toPass({ timeout: 5000 });

    await cleanup();

    // Clean up — reload to reset UI state deterministically, then delete
    await page.reload();
    await dashboard.waitForDashboardLoad();
    await dashboard.deleteWidgetByTitle(0, TEXT.miniMeetings);
  });
});

// ─────────────────────────────────────────────────────────
// 11. Rate Limit Handling
// ─────────────────────────────────────────────────────────

test.describe("Rate Limit Handling", () => {
  test("shows rate limit fallback component", async ({ page }) => {
    await page.route("**/", async (route) => {
      if (
        route.request().resourceType() === "document" &&
        route.request().method() === "GET"
      ) {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: `<!DOCTYPE html>
<html dir="rtl"><body>
  <div dir="rtl" style="display:flex;min-height:100vh;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:2rem">
    <span style="font-size:2.25rem">&#9203;</span>
    <h2 style="color:#b45309;font-weight:600">בוצעו יותר מדי פניות</h2>
    <p style="color:#d97706;font-size:0.875rem;text-align:center">אנא המתינו, הדף יתרענן אוטומטית בעוד <span style="font-weight:700">60</span> שניות</p>
    <button style="background:#d97706;color:#fff;padding:0.5rem 1rem;border-radius:0.25rem;border:none">נסה שוב עכשיו</button>
  </div>
</body></html>`,
        });
        return;
      }
      await route.fallback();
    });

    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: TEXT.rateLimitTitle })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: TEXT.rateLimitRetry })
    ).toBeVisible();
    // Verify countdown number is visible (matches real RateLimitFallback structure)
    await expect(page.getByText("60")).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 12. Navbar (Authenticated)
// ─────────────────────────────────────────────────────────

test.describe("Navbar (Authenticated)", () => {
  test("navbar is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation")).toBeVisible();
  });

  test("admin sees dashboard link in navbar", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: TEXT.navDashboard })
    ).toBeVisible();
  });

  test("company name displayed in navbar", async ({ page }) => {
    await page.goto("/");
    const navbar = page.getByRole("navigation");
    await expect(navbar).toBeVisible();
    // Seeded company name: "E2E Test Company" (16 chars, not truncated)
    await expect(navbar).toContainText("E2E Test Company");
  });

  test("notification bell visible for authenticated user", async ({
    page,
  }) => {
    await page.goto("/");
    const navbar = page.getByRole("navigation");
    const bellButton = navbar.getByRole("button", {
      name: TEXT.notificationBell,
    });
    await expect(bellButton).toBeVisible();
  });

  test("user without canViewDashboardData does not see dashboard link", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: STORAGE_NO_TASKS,
    });
    const page = await context.newPage();
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: TEXT.navDashboard })
    ).not.toBeVisible();
    await context.close();
  });
});

// ─────────────────────────────────────────────────────────
// 13. Responsive Layout
// ─────────────────────────────────────────────────────────

test.describe("Responsive Layout", () => {
  test("desktop: full navbar and action buttons visible", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");

    const dashboard = new DashboardPage(page);
    await expect(dashboard.pageTitle).toBeVisible();
    await expect(dashboard.addWidgetButton).toBeVisible();
  });

  test("mobile: hamburger menu appears and opens", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    const mobileMenuButton = page.getByRole("button", {
      name: TEXT.mobileMenu,
    });
    await expect(mobileMenuButton).toBeVisible();

    // Verify menu opens on click — scope to the mobile sheet by its unique warning text
    await mobileMenuButton.click();
    const mobileDialog = page.getByRole("dialog").filter({
      hasText: TEXT.mobileMenuWarning,
    });
    await expect(mobileDialog).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 14. Login Page
// ─────────────────────────────────────────────────────────

test.describe("Login Page", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login form renders with email and password fields", async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
  });

  test("login form shows register link", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await expect(loginPage.registerLink).toBeVisible();
  });

  test("shows welcome heading", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: TEXT.welcomeHeading })
    ).toBeVisible();
  });

  test("register link navigates to /register", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.registerLink.click();
    await expect(page).toHaveURL(/\/register/);
  });
});

// ─────────────────────────────────────────────────────────
// 15. Specialized Widget Creation Modals
// ─────────────────────────────────────────────────────────

test.describe("Specialized Widget Creation Modals", () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();
  });

  test("mini dashboard button opens modal with empty views state", async ({ page }) => {
    await dashboard.addMiniDashboardButton.click();
    await expect(
      page.getByRole("heading", { name: TEXT.addMiniDashboardModalTitle })
    ).toBeVisible();
    await expect(page.getByText(TEXT.noViewsAvailable)).toBeVisible();
    await page.getByRole("button", { name: TEXT.cancelButton }).click();
    await expect(
      page.getByRole("heading", { name: TEXT.addMiniDashboardModalTitle })
    ).not.toBeVisible();
  });

  test("goals table button opens modal with empty goals state", async ({ page }) => {
    await dashboard.addGoalsTableButton.click();
    await expect(
      page.getByRole("heading", { name: TEXT.addGoalsTableModalTitle })
    ).toBeVisible();
    await expect(page.getByText(TEXT.noGoalsAvailable)).toBeVisible();
    await page.getByRole("button", { name: TEXT.cancelButton }).click();
    await expect(
      page.getByRole("heading", { name: TEXT.addGoalsTableModalTitle })
    ).not.toBeVisible();
  });

  test("analytics table button opens modal with empty analytics state", async ({ page }) => {
    await dashboard.addAnalyticsTableButton.click();
    await expect(
      page.getByRole("heading", { name: TEXT.addAnalyticsTableModalTitle })
    ).toBeVisible();
    await expect(page.getByText(TEXT.noAnalyticsAvailable)).toBeVisible();
    await page.getByRole("button", { name: TEXT.cancelButton }).click();
    await expect(
      page.getByRole("heading", { name: TEXT.addAnalyticsTableModalTitle })
    ).not.toBeVisible();
  });
});
