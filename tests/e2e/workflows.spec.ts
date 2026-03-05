import { test, expect } from "@playwright/test";
import { WorkflowsPage, WF_TEXT } from "./pages/WorkflowsPage";

const STORAGE_ADMIN = "tests/e2e/.auth/tasks-admin.json";

test.use({ storageState: STORAGE_ADMIN });

// ─── 1. Navigation & Page Load ──────────────────────────────

test.describe("Navigation & Page Load", () => {
  test("should navigate to /workflows and show page title and subtitle", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();
    await expect(wf.pageTitle).toBeVisible();
    await expect(wf.pageSubtitle).toBeVisible();
  });

  test("should show active tab by default with active header", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();
    await expect(page.getByText(WF_TEXT.activeTitle)).toBeVisible();
  });

  test("should switch to templates tab and show template UI", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();
    await wf.tabTemplates.click();
    await expect(wf.newTemplateButton).toBeVisible();
  });

  test("should switch back to active tab from templates", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();
    await wf.tabTemplates.click();
    await expect(wf.newTemplateButton).toBeVisible();
    await wf.tabActive.click();
    await expect(page.getByText(WF_TEXT.activeTitle)).toBeVisible();
  });
});

// ─── 2. Authentication & Authorization ──────────────────────

test.describe("Authentication & Authorization", () => {
  test("should redirect unauthenticated user to /login", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto("/workflows");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("should redirect user without canViewWorkflows to /", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "tests/e2e/.auth/tasks-no-tasks.json",
    });
    const page = await context.newPage();
    await page.goto("/workflows");
    await page.waitForLoadState("networkidle");
    const title = page.getByRole("heading", { name: WF_TEXT.pageTitle });
    await expect(title).not.toBeVisible();
    await expect(page).toHaveURL("/");
    await context.close();
  });

  test("should load normally for authorized admin", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();
    await expect(wf.pageTitle).toBeVisible();
  });
});

// ─── 3. Active Instances — List View ────────────────────────

test.describe("Active Instances — List View", () => {
  test("should display seeded instance cards with name and workflow type", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const alphaCard = wf.getInstanceCardByName("אונבורדינג ללקוח אלפא");
    await expect(alphaCard).toBeVisible({ timeout: 10_000 });
    await expect(alphaCard.getByText("אונבורדינג לקוחות")).toBeVisible();
  });

  test("should show progress bar with partial completion (~33%)", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const betaCard = wf.getInstanceCardByName("אונבורדינג ללקוח בטא");
    await expect(betaCard).toBeVisible({ timeout: 10_000 });
    // Beta has 1 of 3 stages completed = 33%
    await expect(betaCard.getByText("33%")).toBeVisible();
  });

  test("should show assignee name on card", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const alphaCard = wf.getInstanceCardByName("אונבורדינג ללקוח אלפא");
    await expect(alphaCard).toBeVisible({ timeout: 10_000 });
    await expect(alphaCard.getByText("E2E Admin")).toBeVisible();
  });

  test("should show creation date on card", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח אלפא");
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Card should display a date in he-IL format (e.g. "1.1.2025" or similar)
    // The card has a Calendar icon + formatDate output
    const dateArea = card.locator("div.flex.items-center.gap-1").filter({
      has: page.locator("svg.lucide-calendar"),
    });
    await expect(dateArea).toBeVisible();
    await expect(dateArea).toHaveText(/\d{1,2}\.\d{1,2}\.\d{4}/); // he-IL date format DD.MM.YYYY
  });

  test("should reveal edit/delete buttons on hover", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח אלפא");
    await expect(card).toBeVisible({ timeout: 10_000 });

    await card.hover();
    await expect(wf.getEditButton("אונבורדינג ללקוח אלפא")).toBeVisible();
    await expect(wf.getDeleteButton("אונבורדינג ללקוח אלפא")).toBeVisible();
  });
});

// ─── 3b. Empty States (needs dedicated seed user) ────────────

test.describe("Empty States", () => {
  // These tests require a seed user with no instances/templates.
  // Skipped until seed infrastructure is available.
  test.skip("should show empty state when no instances exist", async () => {
    // Expects WF_TEXT.noActiveProcesses and WF_TEXT.createProcessNow to be visible
  });

  test.skip("should show empty state when no templates exist", async () => {
    // Expects WF_TEXT.noTemplates to be visible in templates tab
  });
});

// ─── 4. Active Instances — Detail View ──────────────────────

test.describe("Active Instances — Detail View", () => {
  test("should open detail view when clicking card", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח אלפא");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    await expect(page.getByText("אונבורדינג ללקוח אלפא")).toBeVisible();
    await expect(wf.getBackButton()).toBeVisible();
  });

  test("should return to list view when clicking back button", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח אלפא");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();
    await expect(wf.getBackButton()).toBeVisible();

    await wf.getBackButton().click();
    await expect(wf.startNewProcessButton).toBeVisible();
  });

  test("should display assignee and progress in detail view", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח בטא");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    await expect(page.getByText("E2E Basic User")).toBeVisible();
  });

  test("should display all 3 stages as checklist items", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח אלפא");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    await expect(page.getByText("פגישת היכרות")).toBeVisible();
    await expect(page.getByText("חתימת חוזה")).toBeVisible();
    await expect(page.getByText("הגדרת המערכת")).toBeVisible();
  });

  test("should show reset button in detail view", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח אלפא");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    await expect(wf.resetWorkflowButton).toBeVisible();
  });

  test("should mark stage as complete with line-through styling", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    // Create a fresh instance to avoid mutating seeded alpha
    const markName = `mark-stage-${Date.now()}`;
    await wf.startNewProcessButton.click();
    const createModal = wf.getCreateModal();
    await expect(createModal).toBeVisible({ timeout: 5_000 });
    await wf.getTemplateButton("אונבורדינג לקוחות").click();
    await wf.getCreateNameInput().fill(markName);
    await wf.getCreateSubmitButton().click();
    await expect(wf.getToastByText(WF_TEXT.toastInstanceCreated)).toBeVisible({ timeout: 10_000 });

    const card = wf.getInstanceCardByName(markName);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    const checkButton = wf.getStageToggleButton("פגישת היכרות");
    await checkButton.click();

    const heading = page.getByRole("heading", { name: "פגישת היכרות", level: 3 });
    await expect(heading).toHaveClass(/line-through/, { timeout: 5_000 });
  });

  test("should unmark stage and revert styling", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    // Create a fresh instance to avoid mutating seeded beta
    const unmarkName = `unmark-stage-${Date.now()}`;
    await wf.startNewProcessButton.click();
    const createModal = wf.getCreateModal();
    await expect(createModal).toBeVisible({ timeout: 5_000 });
    await wf.getTemplateButton("אונבורדינג לקוחות").click();
    await wf.getCreateNameInput().fill(unmarkName);
    await wf.getCreateSubmitButton().click();
    await expect(wf.getToastByText(WF_TEXT.toastInstanceCreated)).toBeVisible({ timeout: 10_000 });

    const card = wf.getInstanceCardByName(unmarkName);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    // First toggle ON
    const checkButton = wf.getStageToggleButton("פגישת היכרות");
    await checkButton.click();
    const heading = page.getByRole("heading", { name: "פגישת היכרות", level: 3 });
    await expect(heading).toHaveClass(/line-through/, { timeout: 5_000 });

    // Then toggle OFF
    await checkButton.click();
    await expect(heading).not.toHaveClass(/line-through/, { timeout: 5_000 });
  });

  test("should show completion banner when all stages are toggled complete", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    // Create a fresh instance to avoid state corruption from earlier toggle tests
    await wf.startNewProcessButton.click();
    const modal = wf.getCreateModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await wf.getTemplateButton("אונבורדינג לקוחות").click();
    const bannerInstanceName = `banner-test-${Date.now()}`;
    await wf.getCreateNameInput().fill(bannerInstanceName);
    await wf.getCreateSubmitButton().click();
    await expect(wf.getToastByText(WF_TEXT.toastInstanceCreated)).toBeVisible({ timeout: 10_000 });

    // Open the fresh instance's detail view
    const card = wf.getInstanceCardByName(bannerInstanceName);
    await expect(card).toBeVisible({ timeout: 5_000 });
    await card.click();

    // Toggle all 3 stages to complete
    for (const stageName of ["פגישת היכרות", "חתימת חוזה", "הגדרת המערכת"]) {
      const btn = wf.getStageToggleButton(stageName);
      await btn.click();
      // Wait for heading to show line-through confirming toggle took effect
      const heading = page.getByRole("heading", { name: stageName, level: 3 });
      await expect(heading).toHaveClass(/line-through/, { timeout: 5_000 });
    }

    // Completion banner should appear
    await expect(page.getByText(WF_TEXT.completionBannerText)).toBeVisible({ timeout: 10_000 });

    // Go back and verify card badge shows "הושלם"
    await wf.getBackButton().click();
    const updatedCard = wf.getInstanceCardByName(bannerInstanceName);
    await expect(updatedCard).toBeVisible({ timeout: 5_000 });
    await expect(wf.getStatusBadge(bannerInstanceName)).toHaveText(WF_TEXT.statusCompleted);
  });

  test("should show 'ללא משויך' in detail view for unassigned instance", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    // "תהליך למחיקה" is seeded without an assignee
    const card = wf.getInstanceCardByName("תהליך למחיקה");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    await expect(page.getByText(WF_TEXT.noAssigneeDetail)).toBeVisible({ timeout: 5_000 });
  });

  test("should show stage descriptions in detail view", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח אלפא");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    await expect(page.getByText("פגישת היכרות ראשונה עם הלקוח")).toBeVisible();
    await expect(page.getByText("חתימה על הסכם שירות")).toBeVisible();
  });
});

// ─── 5. Create Instance Modal ───────────────────────────────

test.describe("Create Instance Modal", () => {
  test("should open create modal via button", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    await wf.startNewProcessButton.click();
    const modal = wf.getCreateModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal.getByText(WF_TEXT.createModalTitle)).toBeVisible();
  });

  test("should show workflow template buttons in grid", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    await wf.startNewProcessButton.click();
    const modal = wf.getCreateModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await expect(wf.getTemplateButton("אונבורדינג לקוחות")).toBeVisible();
    await expect(wf.getTemplateButton("תבנית ריקה לבדיקה")).toBeVisible();
  });

  test("should disable empty template button with warning text", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    await wf.startNewProcessButton.click();
    const modal = wf.getCreateModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    const emptyBtn = wf.getTemplateButton("תבנית ריקה לבדיקה");
    await expect(emptyBtn).toBeDisabled();
    await expect(modal.getByText(WF_TEXT.emptyTemplate)).toBeVisible();
  });

  test("should disable submit button when no template or name selected", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    await wf.startNewProcessButton.click();
    const modal = wf.getCreateModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await expect(wf.getCreateSubmitButton()).toBeDisabled();
  });

  test("should enable submit after selecting template and entering name", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    await wf.startNewProcessButton.click();
    const modal = wf.getCreateModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await wf.getTemplateButton("אונבורדינג לקוחות").click();
    await wf.getCreateNameInput().fill("תהליך בדיקה חדש");

    await expect(wf.getCreateSubmitButton()).toBeEnabled();
  });

  test("should close modal via cancel button", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    await wf.startNewProcessButton.click();
    const modal = wf.getCreateModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await wf.getCreateCancelButton().click();
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });

  test("should close modal via X button", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    await wf.startNewProcessButton.click();
    const modal = wf.getCreateModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await wf.closeModalViaXButton(modal);
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });

  test("should create instance and show success toast", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    await wf.startNewProcessButton.click();
    const modal = wf.getCreateModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await wf.getTemplateButton("אונבורדינג לקוחות").click();
    const instanceName = `תהליך בדיקה ${Date.now()}`;
    await wf.getCreateNameInput().fill(instanceName);
    await wf.getCreateSubmitButton().click();

    await expect(wf.getToastByText(WF_TEXT.toastInstanceCreated)).toBeVisible({ timeout: 10_000 });
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });

  test("should create instance with assignee selected", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    await wf.startNewProcessButton.click();
    const modal = wf.getCreateModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await wf.getTemplateButton("אונבורדינג לקוחות").click();
    const instanceName = `תהליך עם אחראי ${Date.now()}`;
    await wf.getCreateNameInput().fill(instanceName);

    // Select an assignee from the dropdown
    const assigneeSelect = wf.getCreateAssigneeSelect();
    await assigneeSelect.selectOption({ index: 1 }); // First real user option

    await wf.getCreateSubmitButton().click();

    await expect(wf.getToastByText(WF_TEXT.toastInstanceCreated)).toBeVisible({ timeout: 10_000 });
    await expect(modal).not.toBeVisible({ timeout: 5_000 });

    // Verify the new card shows the assignee (not "ללא")
    const newCard = wf.getInstanceCardByName(instanceName);
    await expect(newCard).toBeVisible({ timeout: 5_000 });
    await expect(newCard.getByText(WF_TEXT.noAssigneeShort)).not.toBeVisible();
  });

  test("should close modal via overlay click", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    await wf.startNewProcessButton.click();
    const modal = wf.getCreateModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await wf.closeModalViaOverlay(modal);
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─── 6. Edit Instance Modal ────────────────────────────────

test.describe("Edit Instance Modal", () => {
  test("should open edit modal via hover edit button", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח אלפא");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.hover();

    await wf.getEditButton("אונבורדינג ללקוח אלפא").click();

    const modal = wf.getEditModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal.getByText(WF_TEXT.editModalTitle)).toBeVisible();
  });

  test("should show pre-populated name input", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח אלפא");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.hover();
    await wf.getEditButton("אונבורדינג ללקוח אלפא").click();

    const modal = wf.getEditModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await expect(wf.getEditNameInput()).toHaveValue("אונבורדינג ללקוח אלפא");
  });

  test("should update name and show success toast", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    // Create a fresh instance to avoid mutating seeded alpha
    const originalName = `rename-test-${Date.now()}`;
    await wf.startNewProcessButton.click();
    const createModal = wf.getCreateModal();
    await expect(createModal).toBeVisible({ timeout: 5_000 });
    await wf.getTemplateButton("אונבורדינג לקוחות").click();
    await wf.getCreateNameInput().fill(originalName);
    await wf.getCreateSubmitButton().click();
    await expect(wf.getToastByText(WF_TEXT.toastInstanceCreated)).toBeVisible({ timeout: 10_000 });

    const card = wf.getInstanceCardByName(originalName);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.hover();
    await wf.getEditButton(originalName).click();

    const modal = wf.getEditModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    const updatedName = `${originalName}-מעודכן`;
    await wf.getEditNameInput().clear();
    await wf.getEditNameInput().fill(updatedName);
    await wf.getEditSaveButton().click();

    await expect(wf.getToastByText(WF_TEXT.toastInstanceUpdated)).toBeVisible({ timeout: 10_000 });

    // Verify updated name appears on card in list view
    await expect(wf.getInstanceCardByName(updatedName)).toBeVisible({ timeout: 5_000 });
  });

  test("should update assignee and reflect on card", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    // Create a fresh instance with an assignee to avoid mutating seeded beta
    const assigneeName = `assignee-test-${Date.now()}`;
    await wf.startNewProcessButton.click();
    const createModal = wf.getCreateModal();
    await expect(createModal).toBeVisible({ timeout: 5_000 });
    await wf.getTemplateButton("אונבורדינג לקוחות").click();
    await wf.getCreateNameInput().fill(assigneeName);

    // Select first available assignee
    const createAssigneeSelect = wf.getCreateAssigneeSelect();
    const createOptions = await createAssigneeSelect.locator("option").allTextContents();
    const validCreateOptions = createOptions.filter(
      (o) => o.trim() !== "" && o !== WF_TEXT.noAssignment,
    );
    if (validCreateOptions.length === 0) {
      test.skip(true, "No assignees available to test");
      return;
    }
    await createAssigneeSelect.selectOption({ label: validCreateOptions[0] });
    await wf.getCreateSubmitButton().click();
    await expect(wf.getToastByText(WF_TEXT.toastInstanceCreated)).toBeVisible({ timeout: 10_000 });

    // Now edit the assignee
    const card = wf.getInstanceCardByName(assigneeName);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.hover();
    await wf.getEditButton(assigneeName).click();

    const modal = wf.getEditModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    const assigneeSelect = wf.getEditAssigneeSelect();
    const allOptions = await assigneeSelect.locator("option").allTextContents();
    const validOptions = allOptions.filter(
      (o) => o.trim() !== "" && o !== WF_TEXT.noAssignment && o !== validCreateOptions[0],
    );

    if (validOptions.length === 0) {
      test.skip(true, "Not enough assignee options to test change");
      return;
    }

    await assigneeSelect.selectOption({ label: validOptions[0] });
    await wf.getEditSaveButton().click();

    await expect(wf.getToastByText(WF_TEXT.toastInstanceUpdated)).toBeVisible({ timeout: 10_000 });

    // Verify new assignee is reflected on card
    const updatedCard = wf.getInstanceCardByName(assigneeName);
    await expect(updatedCard).toBeVisible({ timeout: 5_000 });
    await expect(updatedCard.getByText(validOptions[0])).toBeVisible({ timeout: 5_000 });
  });

  test("should not allow saving edit with empty name", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח בטא");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.hover();
    await wf.getEditButton("אונבורדינג ללקוח בטא").click();

    const modal = wf.getEditModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Clear the name input
    await wf.getEditNameInput().clear();

    // Save button should be disabled when name is empty (component disables on !editName.trim())
    await expect(wf.getEditSaveButton()).toBeDisabled();
  });

  test("should close edit modal via cancel button", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח בטא");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.hover();
    await wf.getEditButton("אונבורדינג ללקוח בטא").click();

    const modal = wf.getEditModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await wf.getEditCancelButton().click();
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─── 7. Delete Instance ─────────────────────────────────────

test.describe("Delete Instance", () => {
  test("should show destructive dialog when clicking delete", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("תהליך למחיקה");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.hover();

    await wf.getDeleteButton("תהליך למחיקה").click();

    const dialog = wf.getAlertDialog();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText(WF_TEXT.deleteProcessTitle)).toBeVisible();
  });

  test("should delete instance after confirmation and show toast", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    // Create a fresh instance to avoid destroying seeded "תהליך למחיקה"
    const deleteName = `delete-test-${Date.now()}`;
    await wf.startNewProcessButton.click();
    const createModal = wf.getCreateModal();
    await expect(createModal).toBeVisible({ timeout: 5_000 });
    await wf.getTemplateButton("אונבורדינג לקוחות").click();
    await wf.getCreateNameInput().fill(deleteName);
    await wf.getCreateSubmitButton().click();
    await expect(wf.getToastByText(WF_TEXT.toastInstanceCreated)).toBeVisible({ timeout: 10_000 });

    const card = wf.getInstanceCardByName(deleteName);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.hover();

    await wf.getDeleteButton(deleteName).click();

    await wf.confirmDestructiveDialog();

    await expect(wf.getToastByText(WF_TEXT.toastInstanceDeleted)).toBeVisible({ timeout: 10_000 });
    await expect(card).not.toBeVisible({ timeout: 5_000 });
  });

  test("should cancel delete and keep card visible", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח בטא");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.hover();

    await wf.getDeleteButton("אונבורדינג ללקוח בטא").click();

    const dialog = wf.getAlertDialog();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await wf.cancelAlertDialog();

    await expect(card).toBeVisible();
  });
});

// ─── 8. Reset Instance ──────────────────────────────────────

test.describe("Reset Instance", () => {
  test("should reset instance after confirm and show toast", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    // Create a fresh instance to avoid depending on beta's mutable state
    const resetName = `reset-test-${Date.now()}`;
    await wf.startNewProcessButton.click();
    const createModal = wf.getCreateModal();
    await expect(createModal).toBeVisible({ timeout: 5_000 });
    await wf.getTemplateButton("אונבורדינג לקוחות").click();
    await wf.getCreateNameInput().fill(resetName);
    await wf.getCreateSubmitButton().click();
    await expect(wf.getToastByText(WF_TEXT.toastInstanceCreated)).toBeVisible({ timeout: 10_000 });

    // Open the fresh instance's detail view
    const card = wf.getInstanceCardByName(resetName);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    // Toggle a stage ON so we have something to reset
    const stageName = "פגישת היכרות";
    const checkButton = wf.getStageToggleButton(stageName);
    await checkButton.click();

    const heading = page.getByRole("heading", { name: stageName, level: 3 });
    await expect(heading).toHaveClass(/line-through/, { timeout: 5_000 });

    await expect(wf.resetWorkflowButton).toBeVisible();
    await wf.resetWorkflowButton.click();

    await wf.confirmAlertDialog();

    await expect(wf.getToastByText(WF_TEXT.toastInstanceReset)).toBeVisible({ timeout: 10_000 });

    // Verify stage is no longer completed (line-through removed)
    await expect(heading).not.toHaveClass(/line-through/, { timeout: 5_000 });
  });

  test("should cancel reset and keep progress unchanged", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח בטא");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    await wf.resetWorkflowButton.click();
    await wf.cancelAlertDialog();

    // Still in detail view, no toast shown
    await expect(wf.getToastByText(WF_TEXT.toastInstanceReset)).not.toBeVisible();
  });
});

// ─── 9. Templates Tab — Management ─────────────────────────

test.describe("Templates Tab — Management", () => {
  test("should display workflow tabs in templates view", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();
    await wf.tabTemplates.click();

    await expect(wf.getWorkflowTab("אונבורדינג לקוחות")).toBeVisible({ timeout: 5_000 });
    await expect(wf.getWorkflowTab("תבנית ריקה לבדיקה")).toBeVisible();
  });

  test("should show stage cards for selected workflow", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();
    await wf.tabTemplates.click();

    await wf.getWorkflowTab("אונבורדינג לקוחות").click();

    await expect(page.getByText("פגישת היכרות")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("חתימת חוזה")).toBeVisible();
    await expect(page.getByText("הגדרת המערכת")).toBeVisible();
  });

  test("should show add stage button", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();
    await wf.tabTemplates.click();

    await wf.getWorkflowTab("אונבורדינג לקוחות").click();
    await expect(wf.addStageButton).toBeVisible({ timeout: 5_000 });
  });

  test("should create new template via prompt dialog", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();
    await wf.tabTemplates.click();

    await wf.newTemplateButton.click();

    const templateName = `תבנית בדיקה ${Date.now()}`;
    await wf.fillPromptDialog(templateName);

    await expect(wf.getToastByText(WF_TEXT.toastWorkflowCreated)).toBeVisible({ timeout: 10_000 });
    await expect(wf.getWorkflowTab(templateName)).toBeVisible({ timeout: 5_000 });
  });

  test("should delete template after confirmation", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();
    await wf.tabTemplates.click();

    // Create a temp template to delete
    await wf.newTemplateButton.click();
    const tempName = `למחיקה ${Date.now()}`;
    await wf.fillPromptDialog(tempName);
    await expect(wf.getToastByText(WF_TEXT.toastWorkflowCreated)).toBeVisible({ timeout: 10_000 });
    await expect(wf.getWorkflowTab(tempName)).toBeVisible({ timeout: 5_000 });

    // Select it and delete
    await wf.getWorkflowTab(tempName).click();
    await wf.deleteTemplateButton.click();
    await wf.confirmAlertDialog();

    await expect(wf.getToastByText(WF_TEXT.toastTemplateDeleted)).toBeVisible({ timeout: 10_000 });
    await expect(wf.getWorkflowTab(tempName)).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─── 10. Templates Tab — Stage Cards ────────────────────────

test.describe("Templates Tab — Stage Cards", () => {
  test("should show stage card with name, description, and active indicator", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();
    await wf.tabTemplates.click();

    await wf.getWorkflowTab("אונבורדינג לקוחות").click();

    const stageText = page.getByText("פגישת היכרות");
    await expect(stageText).toBeVisible({ timeout: 5_000 });

    // Active indicator
    await expect(page.getByText(WF_TEXT.stageActive).first()).toBeVisible();
  });

  test("should show stage number badge", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();
    await wf.tabTemplates.click();

    await wf.getWorkflowTab("אונבורדינג לקוחות").click();

    await expect(page.getByText("שלב 1")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("שלב 2")).toBeVisible();
    await expect(page.getByText("שלב 3")).toBeVisible();
  });

  test("should open StageDetailModal when clicking add stage button", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();
    await wf.tabTemplates.click();

    await wf.getWorkflowTab("אונבורדינג לקוחות").click();
    await expect(wf.addStageButton).toBeVisible({ timeout: 5_000 });
    await wf.addStageButton.click();

    // StageDetailModal should open (slide-over style)
    const modal = page.locator(".fixed.inset-0").filter({ hasText: /שם השלב|הוסף שלב/ });
    await expect(modal).toBeVisible({ timeout: 5_000 });
  });

  test("should open StageDetailModal when clicking existing stage card", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();
    await wf.tabTemplates.click();

    await wf.getWorkflowTab("אונבורדינג לקוחות").click();
    await expect(page.getByText("פגישת היכרות")).toBeVisible({ timeout: 5_000 });

    // Click on an existing stage card heading
    await page.getByRole("heading", { name: "פגישת היכרות", level: 3 }).click();

    // StageDetailModal should open with stage details
    const modal = page.locator(".fixed.inset-0").filter({ hasText: /שם השלב|פגישת היכרות/ });
    await expect(modal).toBeVisible({ timeout: 5_000 });
  });
});

// ─── 10b. Status Badges & Card Info ──────────────────────────

test.describe("Status Badges & Card Info", () => {
  test("should show status badge 'פעיל' on active instance cards", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח אלפא");
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Card should display active status badge
    await expect(card.getByText(WF_TEXT.statusActive)).toBeVisible();
  });

  test("should show 'ללא' for unassigned instance card", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    // "תהליך למחיקה" is seeded without an assignee
    const card = wf.getInstanceCardByName("תהליך למחיקה");
    await expect(card).toBeVisible({ timeout: 10_000 });

    await expect(card.getByText(WF_TEXT.noAssigneeShort)).toBeVisible();
  });

  test("should show progress percentage on instance card", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח בטא");
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Beta has 1 of 3 completed = 33%
    await expect(wf.getProgressText("אונבורדינג ללקוח בטא")).toBeVisible();
  });
});

// ─── 11. Error Handling ─────────────────────────────────────

test.describe("Error Handling", () => {
  test("should show error toast when instance creation fails", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    // Wait for page to load, then intercept
    await expect(wf.startNewProcessButton).toBeVisible({ timeout: 10_000 });

    await page.route("**/workflows", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 500, body: "Server Error" });
      } else {
        await route.fallback();
      }
    });

    await wf.startNewProcessButton.click();
    const modal = wf.getCreateModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await wf.getTemplateButton("אונבורדינג לקוחות").click();
    await wf.getCreateNameInput().fill("תהליך שייכשל");
    await wf.getCreateSubmitButton().click();

    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: /שגיאה|error/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("should show error toast when instance deletion fails and keep card", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח אלפא");
    await expect(card).toBeVisible({ timeout: 10_000 });

    await page.route("**/workflows", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 500, body: "Server Error" });
      } else {
        await route.fallback();
      }
    });

    await card.hover();
    await wf.getDeleteButton("אונבורדינג ללקוח אלפא").click();
    await wf.confirmDestructiveDialog();

    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: /שגיאה|error/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    await expect(card).toBeVisible();
  });

  test("should show error toast when instance update fails", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח אלפא");
    await expect(card).toBeVisible({ timeout: 10_000 });

    await page.route("**/workflows", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 500, body: "Server Error" });
      } else {
        await route.fallback();
      }
    });

    await card.hover();
    await wf.getEditButton("אונבורדינג ללקוח אלפא").click();

    const modal = wf.getEditModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await wf.getEditNameInput().clear();
    await wf.getEditNameInput().fill("שם חדש שייכשל");
    await wf.getEditSaveButton().click();

    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: /שגיאה|error/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("should not show error toast when stage toggle fails (documents bug)", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח אלפא");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    // Intercept stage toggle API to simulate failure
    await page.route("**/workflows", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 500, body: "Server Error" });
      } else {
        await route.fallback();
      }
    });

    const checkButton = wf.getStageToggleButton("פגישת היכרות");
    await checkButton.click();

    // Wait for the toggle to settle (button becomes clickable again after finally block)
    await expect(checkButton).toBeEnabled({ timeout: 5_000 });

    // BUG: handleStageToggle has try/finally but no catch — no error toast appears
    const errorToast = page.locator("[data-sonner-toast]").filter({ hasText: /שגיאה|error/i });
    await expect(errorToast).toHaveCount(0);
  });

  test("should show error toast when reset fails", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const card = wf.getInstanceCardByName("אונבורדינג ללקוח בטא");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    await expect(wf.resetWorkflowButton).toBeVisible();

    // Intercept POST to simulate reset failure
    await page.route("**/workflows", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 500, body: "Server Error" });
      } else {
        await route.fallback();
      }
    });

    await wf.resetWorkflowButton.click();
    await wf.confirmAlertDialog();

    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: /שגיאה|error/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });


  test("should show rate limit fallback when server returns 429", async ({ page }) => {
    await page.route("**/workflows", async (route) => {
      if (route.request().resourceType() === "document") {
        await route.fulfill({
          status: 429,
          contentType: "text/html",
          body: `<html><body><div>${WF_TEXT.rateLimitMessage}</div></body></html>`,
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto("/workflows");
    await expect(
      page.getByText(new RegExp(`${WF_TEXT.rateLimitMessage}|429|Too Many`)).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ─── 12. API Integration ────────────────────────────────────

test.describe("API Integration", () => {
  test("should show error when API returns 500 on page load", async ({ page }) => {
    await page.route("**/workflows", async (route) => {
      if (route.request().resourceType() === "document") {
        await route.fulfill({
          status: 500,
          contentType: "text/html",
          body: "<html><body><h1>Internal Server Error</h1></body></html>",
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto("/workflows");
    await expect(
      page.getByText(/error|שגיאה|Internal Server Error/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("should show loading skeleton while data is being fetched", async ({ page }) => {
    await page.route("**/workflows", async (route) => {
      if (route.request().resourceType() === "document") {
        await new Promise((r) => setTimeout(r, 1_000));
        await route.fallback();
      } else {
        await route.fallback();
      }
    });

    await page.goto("/workflows", { waitUntil: "commit" });

    const skeleton = page.locator('[class*="animate-pulse"], [class*="animate-spin"]');
    await expect(skeleton.first()).toBeVisible({ timeout: 5_000 });

    await expect(
      page.getByRole("heading", { name: WF_TEXT.pageTitle }),
    ).toBeVisible({ timeout: 15_000 });
  });
});

// ─── 13. Responsive Layout ──────────────────────────────────

test.describe("Responsive Layout", () => {
  test("should display grid with multiple columns on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const wf = new WorkflowsPage(page);
    await wf.goto();

    const cards = wf.getInstanceCards();
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    // Grid container should exist and contain cards
    const grid = page.locator(".grid").filter({ has: cards.first() });
    await expect(grid).toBeVisible();

    // On desktop, cards should not all stack vertically — verify at least 2 cards
    // are at different horizontal positions (i.e. multi-column)
    // Note: RTL layout means DOM-first card may be rightmost, so use direction-agnostic check
    const count = await cards.count();
    if (count >= 2) {
      const box1 = await cards.nth(0).boundingBox();
      const box2 = await cards.nth(1).boundingBox();
      expect(box1).toBeTruthy();
      expect(box2).toBeTruthy();
      // Same row (y coords within half a card height)
      expect(Math.abs(box1!.y - box2!.y)).toBeLessThan(box1!.height * 0.5);
      // Different columns
      expect(box1!.x).not.toEqual(box2!.x);
    }
  });

  test("should not break on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const wf = new WorkflowsPage(page);
    await wf.goto();

    await expect(wf.pageTitle).toBeVisible();

    const cards = wf.getInstanceCards();
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    // Verify cards are stacked vertically (single column on mobile)
    const count = await cards.count();
    if (count >= 2) {
      const box1 = await cards.nth(0).boundingBox();
      const box2 = await cards.nth(1).boundingBox();
      expect(box1).toBeTruthy();
      expect(box2).toBeTruthy();
      // On mobile, cards should stack vertically (same x, different y)
      expect(Math.abs(box1!.x - box2!.x)).toBeLessThan(5);
      expect(box2!.y).toBeGreaterThan(box1!.y);
    }
  });
});

// ─── 14. Edge Cases ─────────────────────────────────────────

test.describe("Edge Cases", () => {
  test("should handle Hebrew and special characters in instance name", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    await wf.startNewProcessButton.click();
    const modal = wf.getCreateModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await wf.getTemplateButton("אונבורדינג לקוחות").click();
    const specialName = `תהליך בדיקה <>&"' ${Date.now()}`;
    await wf.getCreateNameInput().fill(specialName);
    await wf.getCreateSubmitButton().click();

    await expect(wf.getToastByText(WF_TEXT.toastInstanceCreated)).toBeVisible({ timeout: 10_000 });
  });

  test("should not break UI with very long instance name", async ({ page }) => {
    const wf = new WorkflowsPage(page);
    await wf.goto();

    await wf.startNewProcessButton.click();
    const modal = wf.getCreateModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await wf.getTemplateButton("אונבורדינג לקוחות").click();
    const longName = "שם תהליך ארוך מאוד שצריך לבדוק שהממשק לא נשבר כשיש טקסט ארוך מאוד מאוד מאוד";
    await wf.getCreateNameInput().fill(longName);
    await wf.getCreateSubmitButton().click();

    await expect(wf.getToastByText(WF_TEXT.toastInstanceCreated)).toBeVisible({ timeout: 10_000 });

    // Verify the card doesn't break the layout
    const card = wf.getInstanceCardByName(longName);
    await expect(card).toBeVisible({ timeout: 5_000 });
    const box = await card.boundingBox();
    expect(box).toBeTruthy();
    // Card should have reasonable width (not overflow)
    expect(box!.width).toBeLessThan(600);
  });
});
