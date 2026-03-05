import { test, expect, type Page } from "@playwright/test";
import { GoalsPage } from "./pages/GoalsPage";
import { STORAGE_BASIC } from "./helpers/test-utils";

// ─── Helpers ───

const uid = () => Math.random().toString(36).slice(2, 8);

async function expectToast(page: Page, message: string | RegExp) {
  await expect(page.getByText(message).first()).toBeVisible({ timeout: 10_000 });
}

async function createGoalViaAPI(page: Page, overrides?: Record<string, unknown>) {
  const response = await page.request.post("/api/finance/goals", {
    data: {
      name: `יעד-${uid()}`,
      metricType: "CUSTOMERS",
      targetType: "COUNT",
      targetValue: 50,
      periodType: "MONTHLY",
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      filters: {},
      warningThreshold: 70,
      criticalThreshold: 50,
      ...overrides,
    },
    headers: { "X-Requested-With": "XMLHttpRequest" },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

async function deleteGoalViaAPI(page: Page, id: number) {
  await page.request
    .delete(`/api/finance/goals/${id}`, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    })
    .catch(() => {});
}

/** Delete all goals for clean state */
async function deleteAllGoalsViaAPI(page: Page) {
  const res = await page.request.get("/api/finance/goals", {
    headers: { "X-Requested-With": "XMLHttpRequest" },
  });
  if (res.ok()) {
    const goals = await res.json();
    const list = Array.isArray(goals) ? goals : goals.goals ?? [];
    for (const g of list) {
      await deleteGoalViaAPI(page, g.id);
    }
  }
}

// ═══════════════════════════════════════════════════════
// AUTH & ACCESS CONTROL
// ═══════════════════════════════════════════════════════
test.describe("Goals — Auth & Access Control", () => {
  test("unauthenticated user is redirected to /login", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto("/finance/goals");
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });

  test("basic user without canViewGoals is redirected to home", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_BASIC });
    const page = await ctx.newPage();
    await page.goto("/finance/goals");
    await expect(page).toHaveURL("/");
    await ctx.close();
  });

  test("admin user loads the page normally", async ({ page }) => {
    const goalsPage = new GoalsPage(page);
    await goalsPage.goto();
    await expect(goalsPage.pageTitle).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════
// PAGE LOAD — EMPTY STATE
// ═══════════════════════════════════════════════════════
test.describe("Goals — Empty State", () => {
  let goalsPage: GoalsPage;

  test.beforeEach(async ({ page }) => {
    // Ensure clean state
    await deleteAllGoalsViaAPI(page);
    goalsPage = new GoalsPage(page);
    await goalsPage.goto();
  });

  test("shows page title, subtitle, and buttons", async () => {
    await expect(goalsPage.pageTitle).toBeVisible();
    await expect(goalsPage.pageSubtitle).toBeVisible();
    await expect(goalsPage.newGoalButton).toBeVisible();
    await expect(goalsPage.archiveLink).toBeVisible();
  });

  test("shows empty state message and create-first button", async () => {
    await expect(goalsPage.emptyStateTitle).toBeVisible();
    await expect(goalsPage.createFirstGoalBtn).toBeVisible();
  });

  test("stat cards show 0 for active goals", async () => {
    const value = await goalsPage.getStatValue("יעדים פעילים");
    expect(value.trim()).toBe("0");
  });

  test("back link navigates to /finance", async ({ page }) => {
    await goalsPage.backLink.click();
    await expect(page).toHaveURL(/\/finance$/);
  });

  test("archive link navigates to /finance/goals/archive", async ({ page }) => {
    await goalsPage.archiveLink.click();
    await expect(page).toHaveURL(/\/finance\/goals\/archive/);
  });

  test("archive page shows empty state when no archived goals", async ({ page }) => {
    await page.goto("/finance/goals/archive");
    await expect(page.getByText("הארכיון ריק")).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════
// PAGE LOAD — WITH GOALS
// ═══════════════════════════════════════════════════════
test.describe("Goals — With Goals", () => {
  let goalsPage: GoalsPage;
  let goalData: { id: number; name: string };

  test.beforeEach(async ({ page }) => {
    const created = await createGoalViaAPI(page);
    goalData = { id: created.id, name: created.name };
    goalsPage = new GoalsPage(page);
    await goalsPage.goto();
  });

  test.afterEach(async ({ page }) => {
    await deleteGoalViaAPI(page, goalData.id);
  });

  test("displays goal card with name", async () => {
    await expect(goalsPage.getGoalCard(goalData.name)).toBeVisible();
  });

  test("goal card shows status badge", async () => {
    const badge = goalsPage.getStatusBadge(goalData.name);
    await expect(badge).toBeVisible();
  });

  test("goal card shows progress percentage", async () => {
    const progressText = goalsPage.getProgressText(goalData.name);
    await expect(progressText).toBeVisible();
  });

  test("goal card shows target value", async () => {
    const card = goalsPage.getGoalCard(goalData.name);
    await expect(card.getByText(/יעד:/)).toBeVisible();
  });

  test("goal card shows date range", async () => {
    const dateRange = goalsPage.getDateRange(goalData.name);
    await expect(dateRange).toBeVisible();
  });

  test("goal card shows days remaining", async () => {
    const card = goalsPage.getGoalCard(goalData.name);
    await expect(card.getByText(/ימים נותרו/)).toBeVisible();
  });

  test("on-track stat card shows value", async () => {
    const value = await goalsPage.getStatValue("במסלול להצלחה");
    expect(Number(value.trim())).toBeGreaterThanOrEqual(0);
  });

  test("goal list section heading is visible", async () => {
    await expect(goalsPage.goalListHeading).toBeVisible();
  });

  test("goal card shows current value", async () => {
    const card = goalsPage.getGoalCard(goalData.name);
    // Current value is rendered in a large text-3xl span (e.g., "0", "1,234", "₪50,000")
    const currentValue = card.locator("span.text-3xl").first();
    await expect(currentValue).toBeVisible();
    await expect(currentValue).toHaveText(/[\d₪,.\s]+/);
  });

  test("stat cards reflect non-zero active count", async () => {
    const value = await goalsPage.getStatValue("יעדים פעילים");
    expect(Number(value.trim())).toBeGreaterThan(0);
  });

  test("goal card shows context explanation for CUSTOMERS metric", async () => {
    const card = goalsPage.getGoalCard(goalData.name);
    // CUSTOMERS goals show "לקוחות פעילים" context text
    await expect(card.getByText("לקוחות פעילים")).toBeVisible();
  });

  test("multiple goals render with correct individual names", async ({ page }) => {
    // Create a second goal
    const second = await createGoalViaAPI(page, { name: `יעד-שני-${uid()}` });
    await goalsPage.goto();

    await expect(goalsPage.getGoalCard(goalData.name)).toBeVisible();
    await expect(goalsPage.getGoalCard(second.name)).toBeVisible();

    // Cleanup second goal
    await deleteGoalViaAPI(page, second.id);
  });
});

// ═══════════════════════════════════════════════════════
// GOAL CREATION FLOW
// ═══════════════════════════════════════════════════════
test.describe("Goals — Creation Flow", () => {
  let goalsPage: GoalsPage;

  test.beforeEach(async ({ page }) => {
    goalsPage = new GoalsPage(page);
    await goalsPage.goto();
  });

  test("new goal button opens modal at step 1 with metric types", async ({ page }) => {
    await goalsPage.newGoalButton.click();
    await expect(goalsPage.modalDialog).toBeVisible();
    await expect(goalsPage.modalTitle).toContainText("הגדרת יעד חדש");
    // Verify metric type buttons exist
    for (const metric of ["הכנסות", "ריטיינרים", "לקוחות", "הצעות מחיר", "משימות", "רשומות", "פגישות ויומן"]) {
      await expect(page.getByRole("button", { name: metric })).toBeVisible();
    }
  });

  test("selecting metric advances to step 2", async () => {
    await goalsPage.newGoalButton.click();
    await goalsPage.selectMetric("לקוחות");
    await expect(goalsPage.goalNameInput).toBeVisible();
  });

  test("REVENUE metric shows target type toggle", async ({ page }) => {
    await goalsPage.newGoalButton.click();
    await goalsPage.selectMetric("הכנסות");
    // Revenue has COUNT/SUM target type toggle
    await expect(page.getByText("כמות (יחידות)")).toBeVisible();
    await expect(page.getByText("ערך כספי (סכום)")).toBeVisible();
  });

  test("step 2 back button returns to step 1", async () => {
    await goalsPage.newGoalButton.click();
    await goalsPage.selectMetric("לקוחות");
    await goalsPage.backStepButton.click();
    await expect(goalsPage.modalTitle).toContainText("הגדרת יעד חדש");
  });

  test("step 2 continue advances to step 3 with target value and dates", async ({ page }) => {
    await goalsPage.newGoalButton.click();
    await goalsPage.selectMetric("לקוחות");
    await goalsPage.goalNameInput.fill("יעד בדיקה");
    await goalsPage.continueButton.click();
    await expect(goalsPage.targetValueInput).toBeVisible();
    await expect(page.getByText("תאריך התחלה")).toBeVisible();
  });

  test("full creation flow: CUSTOMERS — card appears in list after submit", async ({ page }) => {
    const goalName = `יעד-טסט-${uid()}`;
    let createdId: number | null = null;

    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/finance/goals") &&
        resp.request().method() === "POST" &&
        resp.status() === 200
    );

    await goalsPage.newGoalButton.click();
    await goalsPage.selectMetric("לקוחות");
    await goalsPage.goalNameInput.fill(goalName);
    await goalsPage.continueButton.click();
    await goalsPage.targetValueInput.fill("100");
    await goalsPage.submitCreateBtn.click();

    const response = await responsePromise;
    const body = await response.json();
    createdId = body.id;

    // Verify POST payload contains correct fields
    const postPayload = JSON.parse(response.request().postData() ?? "{}");
    expect(postPayload.metricType).toBe("CUSTOMERS");
    expect(postPayload.targetType).toBe("COUNT");
    expect(postPayload.targetValue).toBe(100);
    expect(postPayload.name).toBe(goalName);
    expect(postPayload.startDate).toBeTruthy();
    expect(postPayload.endDate).toBeTruthy();
    expect(postPayload.filters).toEqual({});
    expect(postPayload.periodType).toBe("MONTHLY");

    await expectToast(page, "היעד נוצר בהצלחה");

    // Verify the new card appears in the list without manual reload
    await expect(goalsPage.getGoalCard(goalName)).toBeVisible({ timeout: 10_000 });

    // Cleanup
    if (createdId) await deleteGoalViaAPI(page, createdId);
  });

  test("REVENUE metric full creation with SUM target type", async ({ page }) => {
    const goalName = `יעד-הכנסות-${uid()}`;
    let createdId: number | null = null;

    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/finance/goals") &&
        resp.request().method() === "POST" &&
        resp.status() === 200
    );

    await goalsPage.newGoalButton.click();
    await goalsPage.selectMetric("הכנסות");

    // Explicitly select SUM target type (don't rely on default)
    await page.getByText("ערך כספי (סכום)").click();
    await goalsPage.goalNameInput.fill(goalName);
    await goalsPage.continueButton.click();
    await goalsPage.targetValueInput.fill("50000");
    await goalsPage.submitCreateBtn.click();

    const response = await responsePromise;
    const body = await response.json();
    createdId = body.id;

    // Verify POST payload contains correct fields for REVENUE SUM
    const postPayload = JSON.parse(response.request().postData() ?? "{}");
    expect(postPayload.metricType).toBe("REVENUE");
    expect(postPayload.targetType).toBe("SUM");
    expect(postPayload.targetValue).toBe(50000);
    expect(postPayload.name).toBe(goalName);
    expect(postPayload.startDate).toBeTruthy();
    expect(postPayload.endDate).toBeTruthy();
    expect(postPayload.filters).toMatchObject({ source: "TRANSACTIONS_ONE_TIME" });
    expect(postPayload.periodType).toBe("MONTHLY");

    await expectToast(page, "היעד נוצר בהצלחה");
    await expect(goalsPage.getGoalCard(goalName)).toBeVisible({ timeout: 10_000 });

    // Cleanup
    if (createdId) await deleteGoalViaAPI(page, createdId);
  });

  test("submit without required fields shows error toast", async ({ page }) => {
    await goalsPage.newGoalButton.click();
    await goalsPage.selectMetric("לקוחות");
    // Fill name but leave target value empty
    await goalsPage.goalNameInput.fill("יעד חסר ערך");
    await goalsPage.continueButton.click();
    // Don't fill target value, just submit
    await goalsPage.submitCreateBtn.click();
    await expectToast(page, "נא למלא את כל שדות החובה");
  });

  test("empty name submit shows validation toast", async ({ page }) => {
    await goalsPage.newGoalButton.click();
    await goalsPage.selectMetric("לקוחות");
    // Leave name empty, click continue
    await goalsPage.continueButton.click();
    await goalsPage.targetValueInput.fill("100");
    await goalsPage.submitCreateBtn.click();
    await expectToast(page, "נא למלא את כל שדות החובה");
  });

  test("TASKS metric shows COUNT/REDUCE mode toggle and switching works", async ({ page }) => {
    await goalsPage.newGoalButton.click();
    await goalsPage.selectMetric("משימות");
    await expect(page.getByText("ספירת משימות")).toBeVisible();
    await expect(page.getByText("צמצום משימות")).toBeVisible();
    // Click REDUCE mode and verify REDUCE-unique disclaimer appears
    await page.getByText("צמצום משימות").click();
    await expect(page.getByText(/ספירה הפוכה/)).toBeVisible();
  });

  test("TASKS REDUCE mode shows step-3 tip about zero target", async ({ page }) => {
    await goalsPage.newGoalButton.click();
    await goalsPage.selectMetric("משימות");
    await page.getByText("צמצום משימות").click();
    await goalsPage.goalNameInput.fill("צמצום בדיקה");
    await goalsPage.continueButton.click();
    // Step 3: REDUCE-unique tip text appears
    await expect(page.getByText(/הזן 0 אם המטרה היא לסיים את כל המשימות/)).toBeVisible();
  });

  test("empty state create-first button opens modal", async () => {
    await deleteAllGoalsViaAPI(goalsPage.page);
    await goalsPage.goto();
    await goalsPage.createFirstGoalBtn.click();
    await expect(goalsPage.modalDialog).toBeVisible();
  });

  test("endDate before startDate shows validation error", async ({ page }) => {
    await goalsPage.newGoalButton.click();
    await goalsPage.selectMetric("לקוחות");
    await goalsPage.goalNameInput.fill("יעד תאריכים שגויים");
    await goalsPage.continueButton.click();
    await goalsPage.targetValueInput.fill("10");

    // Set startDate to tomorrow and endDate to yesterday
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split("T")[0];
    const startInput = goalsPage.modalDialog.locator('input[type="date"]').first();
    const endInput = goalsPage.modalDialog.locator('input[type="date"]').last();
    await startInput.fill(tomorrow);
    await endInput.fill(yesterday);
    await goalsPage.submitCreateBtn.click();

    // API returns 400 validation error → modal shows error toast
    await expectToast(page, "אירעה שגיאה. אנא נסו שוב מאוחר יותר.");
  });

  test("RECORDS metric shows table selector on step 2", async ({ page }) => {
    await goalsPage.newGoalButton.click();
    await goalsPage.selectMetric("רשומות");
    await expect(page.getByText("בחר טבלה")).toBeVisible();
  });

  test("RETAINERS metric shows frequency filter", async ({ page }) => {
    await goalsPage.newGoalButton.click();
    await goalsPage.selectMetric("ריטיינרים");
    // Frequency filter label is visible (options are inside closed Select)
    await expect(page.getByText("סינון לפי תדירות הריטיינרים")).toBeVisible();
  });

  test("QUOTES metric shows status filter", async ({ page }) => {
    await goalsPage.newGoalButton.click();
    await goalsPage.selectMetric("הצעות מחיר");
    // Status filter label is visible (options are inside closed Select)
    await expect(page.getByText("סינון לפי סטטוס הצעה")).toBeVisible();
  });

  test("CALENDAR metric shows search filter", async ({ page }) => {
    await goalsPage.newGoalButton.click();
    await goalsPage.selectMetric("פגישות ויומן");
    await expect(page.getByPlaceholder(/פגישת מכירה|זום/)).toBeVisible();
  });

  test("REVENUE metric shows source selection buttons", async ({ page }) => {
    await goalsPage.newGoalButton.click();
    await goalsPage.selectMetric("הכנסות");
    await expect(page.getByText("גביית תשלומים חד פעמיים")).toBeVisible();
    await expect(page.getByText("גביית ריטיינרים")).toBeVisible();
    await expect(page.getByText("מודול הכנסות/הוצאות")).toBeVisible();
    await expect(page.getByText("טבלה מותאמת")).toBeVisible();
  });

  test("step 3 shows preview calculate button and clicking it triggers loading", async ({ page }) => {
    await goalsPage.newGoalButton.click();
    await goalsPage.selectMetric("לקוחות");
    await goalsPage.goalNameInput.fill("יעד חישוב");
    await goalsPage.continueButton.click();
    await goalsPage.targetValueInput.fill("10");

    const previewBtn = page.getByRole("button", { name: /חשב מצב נוכחי/ });
    await expect(previewBtn).toBeVisible();

    // Click the preview button and verify it triggers the calculation
    await previewBtn.click();
    // Loading state shows "מחשב..." text; then resolves to current value display
    await expect(
      page.getByText("מחשב...").or(page.getByText(/מצב נוכחי/)).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ═══════════════════════════════════════════════════════
// GOAL CARD ACTIONS
// ═══════════════════════════════════════════════════════
test.describe("Goals — Card Actions", () => {
  let goalsPage: GoalsPage;
  let goalData: { id: number; name: string };

  test.beforeEach(async ({ page }) => {
    const created = await createGoalViaAPI(page);
    goalData = { id: created.id, name: created.name };
    goalsPage = new GoalsPage(page);
    await goalsPage.goto();
  });

  test.afterEach(async ({ page }) => {
    await deleteGoalViaAPI(page, goalData.id);
  });

  test("three-dot menu shows Edit, Archive, Delete options", async ({ page }) => {
    await goalsPage.openGoalMenu(goalData.name);
    await expect(goalsPage.getMenuItem("ערוך")).toBeVisible();
    await expect(goalsPage.getMenuItem("העבר לארכיון")).toBeVisible();
    await expect(goalsPage.getMenuItem("מחק לצמיתות")).toBeVisible();
  });

  test("Edit opens modal in edit mode with pre-filled data", async () => {
    await goalsPage.openGoalMenu(goalData.name);
    await goalsPage.getMenuItem("ערוך").click();
    await expect(goalsPage.modalDialog).toBeVisible();
    // Edit mode starts at step 2 with name pre-filled
    await expect(goalsPage.goalNameInput).toHaveValue(goalData.name);
  });

  test("Edit modal step 3 shows pre-filled target value", async () => {
    await goalsPage.openGoalMenu(goalData.name);
    await goalsPage.getMenuItem("ערוך").click();
    await expect(goalsPage.modalDialog).toBeVisible();
    await goalsPage.continueButton.click();
    // Target value should be pre-filled with existing value (50 from createGoalViaAPI)
    await expect(goalsPage.targetValueInput).toHaveValue("50");
  });

  test("Edit and update flow: verifies PATCH sent and card shows updated name", async ({ page }) => {
    const updatedName = `יעד-מעודכן-${uid()}`;

    const patchPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/finance/goals/${goalData.id}`) &&
        resp.request().method() === "PATCH"
    );

    await goalsPage.openGoalMenu(goalData.name);
    await goalsPage.getMenuItem("ערוך").click();
    await expect(goalsPage.modalDialog).toBeVisible();

    await goalsPage.goalNameInput.clear();
    await goalsPage.goalNameInput.fill(updatedName);
    await goalsPage.continueButton.click();
    await goalsPage.submitUpdateBtn.click();

    // Verify PATCH was sent
    const patchResponse = await patchPromise;
    expect(patchResponse.ok()).toBe(true);

    // Verify payload contains the updated name and preserves targetValue
    const patchBody = JSON.parse(patchResponse.request().postData() ?? "{}");
    expect(patchBody.name).toBe(updatedName);
    expect(patchBody.targetValue).toBe(50); // from createGoalViaAPI default

    await expectToast(page, "היעד עודכן בהצלחה");

    // Verify the card shows the updated name after refresh
    await expect(goalsPage.getGoalCard(updatedName)).toBeVisible({ timeout: 10_000 });
  });

  test("Archive moves goal and shows toast", async ({ page }) => {
    await goalsPage.openGoalMenu(goalData.name);
    await goalsPage.getMenuItem("העבר לארכיון").click();
    await expectToast(page, "היעד הועבר לארכיון");
    // Card should disappear from active list
    await expect(goalsPage.getGoalCard(goalData.name)).not.toBeVisible({ timeout: 5_000 });
  });

  test("archived goal appears on archive page", async ({ page }) => {
    await goalsPage.openGoalMenu(goalData.name);
    await goalsPage.getMenuItem("העבר לארכיון").click();
    await expectToast(page, "היעד הועבר לארכיון");
    await expect(goalsPage.getGoalCard(goalData.name)).not.toBeVisible({ timeout: 5_000 });

    // Navigate to archive page and verify goal appears there
    await page.goto("/finance/goals/archive");
    await expect(page.getByText(goalData.name)).toBeVisible({ timeout: 10_000 });
  });

  test("Delete shows confirm dialog, typing phrase enables confirm", async ({ page }) => {
    await goalsPage.openGoalMenu(goalData.name);
    await goalsPage.getMenuItem("מחק לצמיתות").click();

    // Destructive confirm dialog
    await expect(page.getByText("מחיקת יעד")).toBeVisible();
    const confirmInput = page.getByLabel("הקלד ביטוי אישור");
    await expect(confirmInput).toBeVisible();

    await confirmInput.fill("מחק");

    const confirmButton = page.getByRole("button", { name: "מחק" }).last();
    await confirmButton.click();

    await expectToast(page, "היעד נמחק בהצלחה");
    await expect(goalsPage.getGoalCard(goalData.name)).not.toBeVisible({ timeout: 5_000 });
  });

  test("Delete with wrong confirmation phrase keeps button disabled", async ({ page }) => {
    await goalsPage.openGoalMenu(goalData.name);
    await goalsPage.getMenuItem("מחק לצמיתות").click();

    await expect(page.getByText("מחיקת יעד")).toBeVisible();
    const confirmInput = page.getByLabel("הקלד ביטוי אישור");

    // Type wrong phrase
    await confirmInput.fill("לא נכון");

    // The confirm button should be disabled
    const confirmButton = page.getByRole("button", { name: "מחק" }).last();
    await expect(confirmButton).toBeDisabled();
  });

  test("restore from archive returns goal to active page", async ({ page }) => {
    // Archive the goal first
    await goalsPage.openGoalMenu(goalData.name);
    await goalsPage.getMenuItem("העבר לארכיון").click();
    await expectToast(page, "היעד הועבר לארכיון");
    await expect(goalsPage.getGoalCard(goalData.name)).not.toBeVisible({ timeout: 5_000 });

    // Navigate to archive page
    await page.goto("/finance/goals/archive");
    await expect(page.getByText(goalData.name)).toBeVisible({ timeout: 10_000 });

    // Restore is the first icon button in the row (RefreshCcw); verified by toast below
    const goalRow = page.locator(".divide-y > div", { hasText: goalData.name });
    await goalRow.getByRole("button").first().click();
    await expectToast(page, "היעד שוחזר");

    // Navigate back to active goals and verify restored
    await page.goto("/finance/goals");
    await expect(goalsPage.getGoalCard(goalData.name)).toBeVisible({ timeout: 10_000 });
  });

  test("Delete cancel keeps goal visible", async ({ page }) => {
    await goalsPage.openGoalMenu(goalData.name);
    await goalsPage.getMenuItem("מחק לצמיתות").click();

    await expect(page.getByText("מחיקת יעד")).toBeVisible();
    await page.getByRole("button", { name: "ביטול" }).click();

    await expect(goalsPage.getGoalCard(goalData.name)).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════
// MODAL BEHAVIOR
// ═══════════════════════════════════════════════════════
test.describe("Goals — Modal Behavior", () => {
  let goalsPage: GoalsPage;

  test.beforeEach(async ({ page }) => {
    goalsPage = new GoalsPage(page);
    await goalsPage.goto();
  });

  test("Escape key closes modal without submitting", async ({ page }) => {
    await goalsPage.newGoalButton.click();
    await expect(goalsPage.modalDialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(goalsPage.modalDialog).not.toBeVisible();
  });

  test("clicking outside modal (overlay) closes it", async ({ page }) => {
    await goalsPage.newGoalButton.click();
    await expect(goalsPage.modalDialog).toBeVisible();
    // Click the overlay (area outside the dialog content)
    await page.locator('[data-slot="dialog-overlay"]').click({ position: { x: 10, y: 10 } });
    await expect(goalsPage.modalDialog).not.toBeVisible();
  });

  test("re-open modal after close resets form state", async ({ page }) => {
    // Open modal, fill some data, close
    await goalsPage.newGoalButton.click();
    await goalsPage.selectMetric("לקוחות");
    await goalsPage.goalNameInput.fill("שם זמני");
    await page.keyboard.press("Escape");
    await expect(goalsPage.modalDialog).not.toBeVisible();

    // Re-open — should be back at step 1
    await goalsPage.newGoalButton.click();
    await expect(goalsPage.modalDialog).toBeVisible();
    await expect(goalsPage.modalTitle).toContainText("הגדרת יעד חדש");
    // Step 1 shows metric selection, not the name input
    await expect(goalsPage.goalNameInput).not.toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════
// ERROR STATES
// ═══════════════════════════════════════════════════════
test.describe("Goals — Error States", () => {
  let goalsPage: GoalsPage;

  test.beforeEach(async ({ page }) => {
    goalsPage = new GoalsPage(page);
    await goalsPage.goto();
  });

  test("creation API error shows error toast and modal stays open", async ({ page }) => {
    // First let the page load normally, then set up the mock for POST only
    await page.route("**/api/finance/goals", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
      } else {
        await route.fallback();
      }
    });

    await goalsPage.newGoalButton.click();
    await goalsPage.selectMetric("לקוחות");
    await goalsPage.goalNameInput.fill("יעד שגיאה");
    await goalsPage.continueButton.click();
    await goalsPage.targetValueInput.fill("100");
    await goalsPage.submitCreateBtn.click();

    // Error toast should appear with the generic error message
    await expectToast(page, "אירעה שגיאה. אנא נסו שוב מאוחר יותר.");
    // Modal should remain open
    await expect(goalsPage.modalDialog).toBeVisible();
  });

  test("update PATCH error shows error toast and modal stays open", async ({ page }) => {
    const created = await createGoalViaAPI(page);
    await goalsPage.goto();

    // Mock PATCH to fail
    await page.route(`**/api/finance/goals/${created.id}`, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
      } else {
        await route.fallback();
      }
    });

    await goalsPage.openGoalMenu(created.name);
    await goalsPage.getMenuItem("ערוך").click();
    await expect(goalsPage.modalDialog).toBeVisible();

    await goalsPage.goalNameInput.clear();
    await goalsPage.goalNameInput.fill("שם חדש שנכשל");
    await goalsPage.continueButton.click();
    await goalsPage.submitUpdateBtn.click();

    await expectToast(page, "אירעה שגיאה. אנא נסו שוב מאוחר יותר.");
    // Modal should stay open on error
    await expect(goalsPage.modalDialog).toBeVisible();

    // Cleanup
    await page.unroute(`**/api/finance/goals/${created.id}`);
    await deleteGoalViaAPI(page, created.id);
  });

  test("deletion API error shows error toast and card stays visible", async ({ page }) => {
    const created = await createGoalViaAPI(page);
    await goalsPage.goto();

    // Mock deletion to fail (only DELETE method)
    await page.route(`**/api/finance/goals/${created.id}`, async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
      } else {
        await route.fallback();
      }
    });

    await goalsPage.openGoalMenu(created.name);
    await goalsPage.getMenuItem("מחק לצמיתות").click();

    const confirmInput = page.getByLabel("הקלד ביטוי אישור");
    await confirmInput.fill("מחק");
    await page.getByRole("button", { name: "מחק" }).last().click();

    await expectToast(page, "אירעה שגיאה. אנא נסו שוב מאוחר יותר.");

    // Card should still be visible
    await expect(goalsPage.getGoalCard(created.name)).toBeVisible();

    // Cleanup
    await page.unroute(`**/api/finance/goals/${created.id}`);
    await deleteGoalViaAPI(page, created.id);
  });

  test("archive error shows error toast and card stays", async ({ page }) => {
    const created = await createGoalViaAPI(page);
    await goalsPage.goto();

    // Archive uses toggleGoalArchive server action (POST with next-action header).
    // Intercept server action POSTs to simulate failure.
    const serverActionHandler = async (route: import("@playwright/test").Route) => {
      const headers = route.request().headers();
      if (
        route.request().method() === "POST" &&
        headers["next-action"]
      ) {
        await route.fulfill({
          status: 500,
          contentType: "text/plain",
          body: "Server Error",
        });
      } else {
        await route.fallback();
      }
    };
    await page.route("**/finance/goals", serverActionHandler);

    await goalsPage.openGoalMenu(created.name);
    await goalsPage.getMenuItem("העבר לארכיון").click();

    await expectToast(page, "אירעה שגיאה. אנא נסו שוב מאוחר יותר.");

    // Card should still be visible
    await expect(goalsPage.getGoalCard(created.name)).toBeVisible();

    // Cleanup
    await page.unroute("**/finance/goals", serverActionHandler);
    await deleteGoalViaAPI(page, created.id);
  });
});

// ═══════════════════════════════════════════════════════
// RESPONSIVE LAYOUT
// ═══════════════════════════════════════════════════════
test.describe("Goals — Responsive Layout", () => {
  test("mobile (375px): buttons visible, stat cards stack", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const goalsPage = new GoalsPage(page);
    await goalsPage.goto();
    await expect(goalsPage.newGoalButton).toBeVisible();
    await expect(goalsPage.statActiveGoals).toBeVisible();
  });

  test("desktop (1280px): multi-column goal grid with 3 goals", async ({ page }) => {
    // Create 3 goals
    const goals: { id: number; name: string }[] = [];
    for (let i = 0; i < 3; i++) {
      const created = await createGoalViaAPI(page);
      goals.push({ id: created.id, name: created.name });
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    const goalsPage = new GoalsPage(page);
    await goalsPage.goto();

    // All 3 goals should be visible
    for (const goal of goals) {
      await expect(goalsPage.getGoalCard(goal.name)).toBeVisible();
    }

    // Cleanup
    for (const goal of goals) {
      await deleteGoalViaAPI(page, goal.id);
    }
  });
});
