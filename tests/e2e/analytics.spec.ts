import { test, expect } from "@playwright/test";
import { AnalyticsPage, ANALYTICS_TEXT } from "./pages/AnalyticsPage";
import { interceptAllServerActions } from "./helpers/test-utils";

const STORAGE_ADMIN = "tests/e2e/.auth/tasks-admin.json";
const STORAGE_BASIC = "tests/e2e/.auth/tasks-basic.json";
const STORAGE_NO_TASKS = "tests/e2e/.auth/tasks-no-tasks.json";

test.use({ storageState: STORAGE_ADMIN });

// ─── 1. Navigation & Page Load ──────────────────────────────

test.describe("Navigation & Page Load", () => {
  test("should navigate to /analytics and show page title and subtitle", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();
    await expect(analytics.pageTitle).toBeVisible();
    await expect(analytics.pageSubtitle).toBeVisible();
  });

  test("should display action buttons (חדש, צור עם AI, גרפים link)", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();
    await expect(analytics.createButton).toBeVisible();
    await expect(analytics.aiCreateButton).toBeVisible();
    await expect(analytics.graphsLink).toBeVisible();
  });

  test("should show AI report button as disabled", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();
    await expect(analytics.aiReportButton).toBeVisible();
    await expect(analytics.aiReportButton).toBeDisabled();
  });

  test("should show automation guide banner", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();
    await expect(analytics.automationGuideBanner).toBeVisible();
  });

  test("should show cache info banner with refresh quota", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();
    await expect(analytics.cacheInfoBanner).toBeVisible();
  });

  test("should display filter tabs (הכל, ידני, אוטומציה)", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();
    await expect(analytics.filterAll).toBeVisible();
    await expect(analytics.filterManual).toBeVisible();
    await expect(analytics.filterAutomation).toBeVisible();
  });

  test('should display "כל האנליטיקות" default folder selection', async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();
    await expect(analytics.allAnalyticsButton).toBeVisible();
  });
});

// ─── 2. Authentication & Authorization ──────────────────────

test.describe("Authentication & Authorization", () => {
  test("should redirect unauthenticated user to /login", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto("/analytics");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("should redirect user without canViewAnalytics to /", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: STORAGE_NO_TASKS,
    });
    const page = await context.newPage();
    await page.goto("/analytics");
    // Wait for redirect to complete — URL should NOT be /analytics
    await page.waitForURL((url) => !url.pathname.startsWith("/analytics"), { timeout: 8_000 });
    await expect(page).not.toHaveURL(/\/analytics/);
    await context.close();
  });

  test("should load normally for authorized admin user", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();
    await expect(analytics.pageTitle).toBeVisible();
  });

  test("should hide management buttons for view-only user", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: STORAGE_BASIC,
    });
    const page = await context.newPage();
    const analytics = new AnalyticsPage(page);
    await analytics.goto();
    await expect(analytics.pageTitle).toBeVisible();
    // Management buttons should not be visible
    await expect(analytics.createButton).not.toBeVisible();
    await expect(analytics.aiCreateButton).not.toBeVisible();
    await expect(analytics.createFolderButton).not.toBeVisible();
    await context.close();
  });

  test("should show management buttons for user with canManageAnalytics", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();
    await expect(analytics.createButton).toBeVisible();
    await expect(analytics.aiCreateButton).toBeVisible();
    await expect(analytics.createFolderButton).toBeVisible();
  });

  test("should show refresh and details buttons for view-only user", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: STORAGE_BASIC });
    const page = await context.newPage();
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    const cardName = "ספירת משימות לפי סטטוס";
    const card = analytics.getCardByName(cardName);
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Footer buttons always render regardless of canManage
    const refreshBtn = analytics.getCardRefreshButton(cardName);
    await expect(refreshBtn).toBeVisible();
    const detailsBtn = analytics.getCardDetailsButton(cardName);
    await expect(detailsBtn).toBeVisible();

    await context.close();
  });

  test("should show cards but hide hover action buttons for view-only user", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: STORAGE_BASIC,
    });
    const page = await context.newPage();
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    // Cards should be visible
    const card = analytics.getCardByName("ספירת משימות לפי סטטוס");
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Hover — action buttons should NOT appear
    await card.hover();
    const editBtn = analytics.getCardEditButton("ספירת משימות לפי סטטוס");
    await expect(editBtn).not.toBeVisible();
    const deleteBtn = analytics.getCardDeleteButton("ספירת משימות לפי סטטוס");
    await expect(deleteBtn).not.toBeVisible();

    await context.close();
  });
});

// ─── 3. Analytics Cards Display ─────────────────────────────

test.describe("Analytics Cards Display", () => {
  test("should display seeded analytics cards with name, stats, and source badge", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    // COUNT view
    const countCard = analytics.getCardByName("ספירת משימות לפי סטטוס");
    await expect(countCard).toBeVisible({ timeout: 10_000 });

    // CONVERSION view
    const conversionCard = analytics.getCardByName("אחוז המרת לקוחות");
    await expect(conversionCard).toBeVisible();
  });

  test('should show "ידני" badge on custom views', async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    const card = analytics.getCardByName("ספירת משימות לפי סטטוס");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText(ANALYTICS_TEXT.badgeManual)).toBeVisible();
  });

  test("should show card footer with record count", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    const card = analytics.getCardByName("ספירת משימות לפי סטטוס");
    await expect(card).toBeVisible({ timeout: 10_000 });
    // Footer should contain "רשומות"
    await expect(card.getByText("רשומות")).toBeVisible();
  });

  test("should show empty state when no views match filter", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    // Filter to automation - no automation-source views seeded
    await analytics.clickFilter("automation");
    await expect(analytics.emptyState).toBeVisible();
  });

  test("should display CONVERSION card with percentage and fraction stats", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    const card = analytics.getCardByName("אחוז המרת לקוחות");
    await expect(card).toBeVisible({ timeout: 10_000 });

    // CONVERSION card should show "60%" main metric and "3/5" sub metric
    await expect(card.getByText("60%")).toBeVisible();
    await expect(card.getByText("3/5")).toBeVisible();
  });

  test("should display COUNT card with main metric", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    const card = analytics.getCardByName("ספירת משימות לפי סטטוס");
    await expect(card).toBeVisible({ timeout: 10_000 });

    // COUNT card should show "8" main metric (seeded cached stats)
    await expect(card.getByText("8")).toBeVisible();
    // And its label "משימות"
    await expect(card.getByText("משימות")).toBeVisible();
  });

  test("should show card config details (filters, groupBy)", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    // The COUNT card has a filter { status: "todo" } and groupByField: "status"
    const card = analytics.getCardByName("ספירת משימות לפי סטטוס");
    await expect(card).toBeVisible({ timeout: 10_000 });
    // Should show translated filter key "סטטוס"
    await expect(card.getByText("סטטוס")).toBeVisible();
  });
});

// ─── 4. Filter Tabs ─────────────────────────────────────────

test.describe("Filter Tabs", () => {
  test('should filter views by "ידני" tab', async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    await analytics.clickFilter("manual");
    // Manual views should still be visible
    const countCard = analytics.getCardByName("ספירת משימות לפי סטטוס");
    await expect(countCard).toBeVisible({ timeout: 10_000 });

    // Prove the filter machinery works by checking automation filter shows empty state
    await analytics.clickFilter("automation");
    await expect(analytics.emptyState).toBeVisible({ timeout: 5_000 });

    // Return to "all" — all cards visible again
    await analytics.clickFilter("all");
    const allCards = analytics.getAnalyticsCards();
    const returnCount = await allCards.count();
    expect(returnCount).toBeGreaterThanOrEqual(2);
  });

  test('should filter views by "אוטומציה" tab', async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    await analytics.clickFilter("automation");
    // No automation views seeded, expect empty state
    await expect(analytics.emptyState).toBeVisible();
  });

  test('should show all views with "הכל" tab', async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    // Switch to manual then back to all
    await analytics.clickFilter("manual");
    await analytics.clickFilter("all");

    const cards = analytics.getAnalyticsCards();
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ─── 5. Folder Management ───────────────────────────────────

test.describe("Folder Management", () => {
  test("should create a new folder", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    await analytics.createFolder("תיקיית טסט חדשה");

    // Expect success toast
    await expect(
      analytics.getToastByText(ANALYTICS_TEXT.toastFolderCreated),
    ).toBeVisible({ timeout: 5_000 });

    // New folder should appear in sidebar
    await expect(
      page.getByText("תיקיית טסט חדשה"),
    ).toBeVisible();
  });

  test("should filter views when selecting a folder", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    // Click on the analytics folder that has the "משימות בתיקייה" view
    const folder = analytics.selectFolder("תיקיית אנליטיקות");
    await folder.click();

    // Only the view in this folder should be visible
    const card = analytics.getCardByName("משימות בתיקייה");
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Views not in this folder should not be visible
    const otherCard = analytics.getCardByName("ספירת משימות לפי סטטוס");
    await expect(otherCard).not.toBeVisible();
  });

  test("should show empty state for empty folder", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    const emptyFolder = analytics.selectFolder("תיקייה ריקה אנליטיקות");
    await emptyFolder.click();

    await expect(analytics.emptyState).toBeVisible();
  });

  test("should cancel folder creation with ביטול", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    await analytics.openCreateFolderModal();
    const modal = analytics.getFolderModal();
    await expect(modal).toBeVisible();

    await analytics.getFolderNameInput().fill("תיקייה שתבוטל");
    await analytics.getCancelFolderButton().click();

    // Modal should close
    await expect(modal).not.toBeVisible();
    // Folder should not be created
    await expect(page.getByText("תיקייה שתבוטל")).not.toBeVisible();
  });

  test("should disable create folder button when name is empty", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    await analytics.openCreateFolderModal();
    const modal = analytics.getFolderModal();
    await expect(modal).toBeVisible();

    // Without filling name, button should be disabled
    await expect(analytics.getSaveFolderButton()).toBeDisabled();

    // Fill name, button should be enabled
    await analytics.getFolderNameInput().fill("טסט");
    await expect(analytics.getSaveFolderButton()).toBeEnabled();

    // Clear name, button should be disabled again
    await analytics.getFolderNameInput().clear();
    await expect(analytics.getSaveFolderButton()).toBeDisabled();

    await analytics.getCancelFolderButton().click();
  });

  test("should create folder when pressing Enter in name input", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    await analytics.openCreateFolderModal();
    const modal = analytics.getFolderModal();
    await expect(modal).toBeVisible();

    const input = analytics.getFolderNameInput();
    await input.fill("תיקיית אנטר");
    await input.press("Enter");

    await expect(
      analytics.getToastByText(ANALYTICS_TEXT.toastFolderCreated),
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("תיקיית אנטר")).toBeVisible();
  });

  test("should delete a folder", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    // First create a folder to delete
    await analytics.createFolder("תיקייה למחיקה");
    await expect(
      analytics.getToastByText(ANALYTICS_TEXT.toastFolderCreated),
    ).toBeVisible({ timeout: 5_000 });

    // Find the folder element and hover to reveal delete button.
    // selectFolder uses getByText — returns the <div> containing the folder name.
    const folderEl = analytics.selectFolder("תיקייה למחיקה");
    await folderEl.hover();

    // The delete button is inside the same group div (the only <button> child).
    const deleteBtn = folderEl.locator("button").first();
    await deleteBtn.click();

    // Verify dialog content before confirming
    const folderDialog = analytics.getAlertDialog();
    await expect(folderDialog).toContainText(ANALYTICS_TEXT.confirmDeleteFolder);
    await analytics.confirmAlertDialog();

    await expect(
      analytics.getToastByText(ANALYTICS_TEXT.toastFolderDeleted),
    ).toBeVisible({ timeout: 5_000 });

    // Verify the folder is actually removed from the sidebar
    await expect(folderEl).not.toBeVisible({ timeout: 5_000 });
  });

  test('should return to "כל האנליטיקות" after folder selection', async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    // Select a specific folder
    const folder = analytics.selectFolder("תיקיית אנליטיקות");
    await folder.click();

    // Verify folder content shown
    const folderCard = analytics.getCardByName("משימות בתיקייה");
    await expect(folderCard).toBeVisible({ timeout: 10_000 });

    // Click "כל האנליטיקות" to go back
    await analytics.allAnalyticsButton.click();

    // All views should be visible again
    const allCards = analytics.getAnalyticsCards();
    const count = await allCards.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ─── 6. View CRUD Operations ────────────────────────────────

test.describe("View CRUD Operations", () => {
  test("should open create view modal and show type options", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    await analytics.openCreateModal();

    // Should show the three view type options (scoped to modal)
    const createModal = analytics.getCreateViewModal();
    await expect(createModal).toBeVisible({ timeout: 5_000 });
    await expect(
      createModal.getByText(ANALYTICS_TEXT.viewTypeCount),
    ).toBeVisible();
    await expect(
      createModal.getByText(ANALYTICS_TEXT.viewTypeConversion),
    ).toBeVisible();
    await expect(
      createModal.getByText(ANALYTICS_TEXT.viewTypeGraph),
    ).toBeVisible();
  });

  test("should navigate between steps in create modal", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    await analytics.openCreateModal();
    const modal = analytics.getCreateViewModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Step 1: select COUNT type
    await modal.getByText(ANALYTICS_TEXT.viewTypeCount).click();

    // "המשך" button should be enabled
    const continueBtn = modal.getByRole("button", { name: "המשך" });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Step 2: should show "כותרת התצוגה" label and "חזור" button
    await expect(modal.getByText("כותרת התצוגה")).toBeVisible();
    const backBtn = modal.getByRole("button", { name: "חזור" });
    await expect(backBtn).toBeVisible();

    // Go back to step 1
    await backBtn.click();
    await expect(modal.getByText(ANALYTICS_TEXT.viewTypeCount)).toBeVisible();
  });

  test("should open details modal when clicking list button", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    const cardName = "ספירת משימות לפי סטטוס";
    const card = analytics.getCardByName(cardName);
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Details button should be visible (seeded views have cached data)
    const detailsBtn = analytics.getCardDetailsButton(cardName);
    await expect(detailsBtn).toBeVisible({ timeout: 5_000 });

    await detailsBtn.click();

    // Details modal should open
    const modal = analytics.getDetailsModal(cardName);
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Verify the details table renders with data rows
    const table = modal.locator("table");
    await expect(table).toBeVisible();
    const rows = table.locator("tbody tr");
    expect(await rows.count()).toBeGreaterThan(0);

    // Verify all 3 column headers render
    const headers = table.locator("thead th");
    expect(await headers.count()).toBe(3);
  });

  test("should close details modal via close button", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    const cardName = "ספירת משימות לפי סטטוס";
    await expect(analytics.getCardByName(cardName)).toBeVisible({ timeout: 10_000 });

    await analytics.getCardDetailsButton(cardName).click();
    const modal = analytics.getDetailsModal(cardName);
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Click "סגור" button in modal footer
    await modal.getByRole("button", { name: "סגור" }).click();
    await expect(modal).not.toBeVisible();
  });

  test("should close details modal when clicking overlay", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    const cardName = "ספירת משימות לפי סטטוס";
    await expect(analytics.getCardByName(cardName)).toBeVisible({ timeout: 10_000 });

    await analytics.getCardDetailsButton(cardName).click();
    const modal = analytics.getDetailsModal(cardName);
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Click the overlay background (position near edge to avoid inner content)
    await modal.click({ position: { x: 5, y: 5 } });
    await expect(modal).not.toBeVisible();
  });

  test("should open edit modal when clicking edit button on custom view", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    const cardName = "ספירת משימות לפי סטטוס";
    const card = analytics.getCardByName(cardName);
    await expect(card).toBeVisible({ timeout: 10_000 });

    await card.hover();

    const editBtn = analytics.getCardEditButton(cardName);
    await expect(editBtn).toBeVisible({ timeout: 3_000 });
    await editBtn.click();

    // Edit modal should open with "עריכת תצוגת ניתוח" heading
    const editModal = analytics.getEditViewModal();
    await expect(editModal).toBeVisible({ timeout: 5_000 });
  });
});

// ─── 6b. Destructive CRUD (serial — runs last to avoid state mutation) ──

test.describe.serial("Destructive View Operations", () => {
  test("should delete a custom view with confirmation", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    // Use the conversion card which is expendable for the delete test
    const cardName = "אחוז המרת לקוחות";
    const card = analytics.getCardByName(cardName);
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Hover to reveal action buttons
    await card.hover();

    // Click delete
    const deleteBtn = analytics.getCardDeleteButton(cardName);
    await expect(deleteBtn).toBeVisible({ timeout: 3_000 });
    await deleteBtn.click();

    // Verify dialog content before confirming
    const dialog = analytics.getAlertDialog();
    await expect(dialog).toContainText(ANALYTICS_TEXT.confirmDeleteView);
    await analytics.confirmAlertDialog();

    // Expect success toast
    await expect(
      analytics.getToastByText(ANALYTICS_TEXT.toastViewDeleted),
    ).toBeVisible({ timeout: 5_000 });

    // Verify card is actually removed from the UI
    await expect(card).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─── 6c. Cancel Delete ──────────────────────────────────────

test.describe("Cancel Delete Operations", () => {
  test("should cancel delete dialog and card should remain", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    const cardName = "ספירת משימות לפי סטטוס";
    const card = analytics.getCardByName(cardName);
    await expect(card).toBeVisible({ timeout: 10_000 });

    await card.hover();

    const deleteBtn = analytics.getCardDeleteButton(cardName);
    await expect(deleteBtn).toBeVisible({ timeout: 3_000 });
    await deleteBtn.click();

    // Verify dialog appeared with correct text
    const dialog = analytics.getAlertDialog();
    await expect(dialog).toContainText(ANALYTICS_TEXT.confirmDeleteView);

    // Cancel
    await analytics.cancelAlertDialog();

    // Card should still exist
    await expect(card).toBeVisible();
  });
});

// ─── 7. Card Actions (hover menu) ───────────────────────────

test.describe("Card Actions (hover menu)", () => {
  test("should show color picker, select a color, and verify change", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    const cardName = "ספירת משימות לפי סטטוס";
    const card = analytics.getCardByName(cardName);
    await expect(card).toBeVisible({ timeout: 10_000 });

    const accentBar = card.locator("div.h-1\\.5.w-full").first();
    const classBefore = await accentBar.getAttribute("class");

    await card.hover();

    // Click color picker button
    const colorBtn = analytics.getCardColorButton(cardName);
    await expect(colorBtn).toBeVisible({ timeout: 3_000 });
    await colorBtn.click();

    // Color picker popup should appear with color options
    await expect(page.locator('[title="אדום"]')).toBeVisible({
      timeout: 3_000,
    });
    await expect(page.locator('[title="ירוק"]')).toBeVisible();

    // Select a color
    await page.locator('[title="אדום"]').click();

    // Color picker should close
    await expect(page.locator('[title="אדום"]')).not.toBeVisible();

    // Verify the card's accent bar changed
    const classAfter = await accentBar.getAttribute("class");
    expect(classAfter).not.toBe(classBefore);
  });

  test("should move view to folder and verify it appears there", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    const cardName = "ספירת משימות לפי סטטוס";
    const card = analytics.getCardByName(cardName);
    await expect(card).toBeVisible({ timeout: 10_000 });

    await card.hover();

    // Click move to folder button
    const moveBtn = analytics.getCardMoveButton(cardName);
    await expect(moveBtn).toBeVisible({ timeout: 3_000 });
    await moveBtn.click();

    // Folder picker popup should appear
    await expect(page.getByText("בחר תיקייה")).toBeVisible({
      timeout: 3_000,
    });

    // Select "תיקיית אנליטיקות" — use getByRole("button") to target the dropdown item,
    // avoiding strict mode violation with the sidebar folder div that has the same text.
    await page.getByRole("button", { name: "תיקיית אנליטיקות" }).click();

    // Now navigate to that folder and verify the card is there
    const folder = analytics.selectFolder("תיקיית אנליטיקות");
    await folder.click();

    const movedCard = analytics.getCardByName(cardName);
    await expect(movedCard).toBeVisible({ timeout: 10_000 });

    // Move it back: go to the folder, hover the card, move to root
    await movedCard.hover();
    const moveBtnAgain = analytics.getCardMoveButton(cardName);
    await expect(moveBtnAgain).toBeVisible({ timeout: 3_000 });
    await moveBtnAgain.click();
    await expect(page.getByText("בחר תיקייה")).toBeVisible({
      timeout: 3_000,
    });
    await page.getByRole("button", { name: "ראשי (ללא תיקייה)" }).click();

    // Verify the card is back in root by going to "כל האנליטיקות"
    await analytics.allAnalyticsButton.click();
    await expect(analytics.getCardByName(cardName)).toBeVisible({ timeout: 10_000 });
  });

  test("should show add automation button on custom view", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    const cardName = "ספירת משימות לפי סטטוס";
    const card = analytics.getCardByName(cardName);
    await expect(card).toBeVisible({ timeout: 10_000 });

    await card.hover();

    const automationBtn = analytics.getCardAddAutomationButton(cardName);
    await expect(automationBtn).toBeVisible();
  });

  test("should open automation modal when clicking add automation button", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    const cardName = "ספירת משימות לפי סטטוס";
    const card = analytics.getCardByName(cardName);
    await expect(card).toBeVisible({ timeout: 10_000 });

    await card.hover();

    const automationBtn = analytics.getCardAddAutomationButton(cardName);
    await expect(automationBtn).toBeVisible({ timeout: 3_000 });
    await automationBtn.click();

    // Automation modal should open — verify by its specific heading
    await expect(page.getByText("אוטומציות לאנליטיקה")).toBeVisible({ timeout: 5_000 });
  });

});

// ─── 8. Refresh Flow ────────────────────────────────────────

test.describe("Refresh Flow", () => {
  test("should show refresh button on card footer", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    const cardName = "ספירת משימות לפי סטטוס";
    const card = analytics.getCardByName(cardName);
    await expect(card).toBeVisible({ timeout: 10_000 });

    const refreshBtn = analytics.getCardRefreshButton(cardName);
    await expect(refreshBtn).toBeVisible();
  });

  test("should trigger refresh and show toast with spinning animation", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    const cardName = "ספירת משימות לפי סטטוס";
    const card = analytics.getCardByName(cardName);
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Add delay to server actions so spinner stays visible long enough to assert
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fallback();
    });

    const refreshBtn = analytics.getCardRefreshButton(cardName);
    await refreshBtn.click();

    // Should show refreshing toast
    await expect(
      analytics.getToastByText(ANALYTICS_TEXT.toastRefreshing),
    ).toBeVisible({ timeout: 5_000 });

    // Refresh icon should be spinning (animate-spin class on the SVG)
    const spinningIcon = card.locator("svg.animate-spin");
    await expect(spinningIcon).toBeVisible({ timeout: 3_000 });

    await cleanup();
  });

  test("should show error toast when refresh server action fails", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    const cardName = "ספירת משימות לפי סטטוס";
    const card = analytics.getCardByName(cardName);
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Intercept all server actions to return error.
    // Note: The RSC flight response format (`0:${JSON.stringify(...)}`) may not exactly
    // match Next.js internals, but the component's catch block will still trigger a
    // generic error toast. The assertion uses "שגיאה" broadly to account for this.
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/x-component",
        body: `0:${JSON.stringify({ success: false, error: "שגיאה ברענון הנתון" })}\n`,
      });
    });

    const refreshBtn = analytics.getCardRefreshButton(cardName);
    await refreshBtn.click();

    // Should show error toast (generic match — see note above about RSC format)
    await expect(
      analytics.getToastByText("שגיאה"),
    ).toBeVisible({ timeout: 5_000 });

    await cleanup();
  });

  test("should display refresh quota info", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    // Cache info banner should contain refresh quota text
    await expect(analytics.cacheInfoBanner).toBeVisible();
    // Check for quota pattern like "נותרו X מתוך Y רענונים" or plan info
    const quotaArea = page.getByText(/רענונים/);
    await expect(quotaArea.first()).toBeVisible();
  });
});

// ─── 9. AI Analytics Creator ────────────────────────────────

test.describe("AI Analytics Creator", () => {
  test('should open AI creator panel when clicking "צור עם AI"', async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    await analytics.aiCreateButton.click();

    // AI creator panel should open — verify by its unique heading
    await expect(analytics.getAICreatorHeading()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("should close AI creator panel and verify it is gone", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    await analytics.aiCreateButton.click();

    // Verify AI panel is open
    const aiHeading = analytics.getAICreatorHeading();
    await expect(aiHeading).toBeVisible({ timeout: 5_000 });

    // Close via X button using POM method
    await analytics.closeAICreatorPanel();

    // Verify AI panel content is actually gone
    await expect(aiHeading).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─── 10. Navigation to Graphs ───────────────────────────────

test.describe("Navigation to Graphs", () => {
  test("should navigate to /analytics/graphs when clicking גרפים link", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    await analytics.graphsLink.click();
    await expect(page).toHaveURL(/\/analytics\/graphs/);
  });
});

// ─── 11. Responsive Layout ─────────────────────────────────

test.describe("Responsive Layout", () => {
  test("should display multiple cards side-by-side on desktop", async ({
    page,
  }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    // Verify at least 2 cards are visible on desktop
    const cards = analytics.getAnalyticsCards();
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Verify cards are rendered side-by-side in a grid
    const firstCard = cards.first();
    const secondCard = cards.nth(1);
    await expect(firstCard).toBeVisible();
    await expect(secondCard).toBeVisible();

    // Verify side-by-side layout via bounding box coordinates
    const firstBox = await firstCard.boundingBox();
    const secondBox = await secondCard.boundingBox();
    expect(firstBox).not.toBeNull();
    expect(secondBox).not.toBeNull();
    // Same row: similar Y positions (within 10px tolerance)
    expect(Math.abs(firstBox!.y - secondBox!.y)).toBeLessThan(10);
  });

  test("should show card action buttons without hover on mobile viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    const cardName = "ספירת משימות לפי סטטוס";
    const card = analytics.getCardByName(cardName);
    await expect(card).toBeVisible({ timeout: 10_000 });

    // On mobile: opacity-100 (not md:opacity-0) means action buttons are always visible
    const editBtn = analytics.getCardEditButton(cardName);
    await expect(editBtn).toBeVisible();
  });

  test("should stack cards on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    // Cards should still be visible
    const countCard = analytics.getCardByName("ספירת משימות לפי סטטוס");
    await expect(countCard).toBeVisible({ timeout: 10_000 });

    const conversionCard = analytics.getCardByName("אחוז המרת לקוחות");
    await expect(conversionCard).toBeVisible({ timeout: 10_000 });

    // Verify vertical stacking via bounding box
    const firstBox = await countCard.boundingBox();
    const secondBox = await conversionCard.boundingBox();
    expect(firstBox).not.toBeNull();
    expect(secondBox).not.toBeNull();
    // Stacked: similar X positions, second card below first
    expect(Math.abs(firstBox!.x - secondBox!.x)).toBeLessThan(10);
    expect(secondBox!.y).toBeGreaterThan(firstBox!.y + firstBox!.height - 10);
  });
});

// ─── 12. Edge Cases ─────────────────────────────────────────

test.describe("Edge Cases", () => {
  test("should handle page refresh and preserve state", async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto();

    // Verify initial state
    await expect(analytics.pageTitle).toBeVisible();
    const card = analytics.getCardByName("ספירת משימות לפי סטטוס");
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Reload and verify state persists
    await page.reload();
    await analytics.pageTitle.waitFor({ timeout: 10_000 });

    await expect(analytics.pageTitle).toBeVisible();
    await expect(card).toBeVisible({ timeout: 10_000 });
  });

  // Note: Error state test removed — loadError is an SSR-only prop that cannot
  // be mocked via route interception. Error UI is validated via unit tests.
  // The POM still exposes errorHeading and retryButton for manual/integration testing.
});
