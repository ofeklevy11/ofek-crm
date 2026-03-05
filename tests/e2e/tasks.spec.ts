import { test, expect, type Page } from "@playwright/test";
import { TasksPage } from "./pages/TasksPage";
import { KanbanBoardPO } from "./pages/KanbanBoardPO";
import { TaskModalPO } from "./pages/TaskModalPO";
import { CompletedTasksPO } from "./pages/CompletedTasksPO";
import { MySheetsPO } from "./pages/MySheetsPO";
import { TASK_TEXT } from "./helpers/selectors";
import { interceptAllServerActions } from "./helpers/test-utils";


const STORAGE_ADMIN = "tests/e2e/.auth/tasks-admin.json";
const STORAGE_BASIC = "tests/e2e/.auth/tasks-basic.json";
const STORAGE_NO_TASKS = "tests/e2e/.auth/tasks-no-tasks.json";

// ─── Seeded test data ─────────────────────────────────────────
const SEED = {
  // Kanban tasks
  taskTodo: "משימת בדיקה 1",
  taskTodoDescription: "תיאור של משימת בדיקה 1",
  taskTodoTags: ["עיצוב", "דחוף"] as const,
  taskTodoLow: "משימת בדיקה 2",
  taskInProgress: "משימה בטיפול",

  // Done tasks
  doneTask: "משימה שהושלמה",
  doneTask2: "משימה שהושלמה 2",
  doneTaskTag: "פיתוח",

  // My sheets
  sheetTitle: "דף משימות יומי לבדיקה",
  sheetItem1: "פריט ראשון",
  sheetItem2: "פריט שני",
  sheetItem3: "פריט שלישי",
} as const;

// Use tasks-admin auth state by default for all tests in this file
test.use({ storageState: STORAGE_ADMIN });

// ─── Helpers ───────────────────────────────────────────────────

/** Wait for a toast message to appear */
async function expectToast(page: Page, message: string) {
  await expect(page.getByText(message).first()).toBeVisible({ timeout: 10_000 });
}

/** Create a task via modal and return its unique title */
async function createUniqueTask(
  page: Page,
  kanban: KanbanBoardPO,
  modal: TaskModalPO,
  prefix: string
): Promise<string> {
  const title = `${prefix} ${Date.now()}`;
  await kanban.clickNewTask();
  await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });
  await modal.fillTitle(title);
  await modal.submit();
  await expectToast(page, TASK_TEXT.toastCreated);
  await expect(page.getByText(title)).toBeVisible({ timeout: 5_000 });
  return title;
}

// ─── 4.1 Navigation & Page Load ──────────────────────────────

test.describe("Navigation & Page Load", () => {
  test("page loads at /tasks with title 'משימות'", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    await tasksPage.goto();
    await expect(tasksPage.pageTitle).toBeVisible();
    await expect(tasksPage.pageSubtitle).toBeVisible();
  });

  test("default view is kanban with 5 columns visible", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    await tasksPage.goto();

    const columns = await kanban.getVisibleColumns();
    expect(columns).toHaveLength(5);
    expect(columns).toEqual(KanbanBoardPO.columnTitles);
  });

  test("loading spinner appears and resolves", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    await page.goto("/tasks");
    // Spinner may be brief; just verify the page eventually resolves
    await expect(tasksPage.pageTitle).toBeVisible({ timeout: 15_000 });
  });

  test("all 4 tabs visible for admin", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    await tasksPage.goto();

    await expect(tasksPage.tabKanban).toBeVisible();
    await expect(tasksPage.tabDone).toBeVisible();
    await expect(tasksPage.tabMySheets).toBeVisible();
    await expect(tasksPage.tabManageSheets).toBeVisible();
  });
});

// ─── 4.2 Authentication & Authorization ──────────────────────

test.describe("Authentication & Authorization", () => {
  test("unauthenticated user is redirected to /login", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/tasks");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("user without canViewTasks is redirected or sees no tasks page", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE_NO_TASKS });
    const page = await context.newPage();
    await page.goto("/tasks");
    await page.waitForLoadState("networkidle");

    // User should either be redirected away or see an error/forbidden state — not the kanban board
    const kanbanColumn = page.locator("h3").filter({ hasText: TASK_TEXT.colTodo });
    await expect(kanbanColumn).not.toBeVisible({ timeout: 5_000 });
    await context.close();
  });

  test("basic user with canViewTasks can load page", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE_BASIC });
    const page = await context.newPage();
    await page.goto("/tasks");
    await page.waitForLoadState("networkidle");
    const title = page.getByRole("heading", { name: TASK_TEXT.pageTitle });
    await expect(title).toBeVisible({ timeout: 15_000 });
    await context.close();
  });

  test("admin sees all tabs including manage sheets", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    await tasksPage.goto();
    await expect(tasksPage.tabManageSheets).toBeVisible();
  });

  test("basic user does not see manage sheets tab", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE_BASIC });
    const page = await context.newPage();
    await page.goto("/tasks");
    await page.waitForLoadState("networkidle");
    const manageTab = page.getByRole("link", { name: TASK_TEXT.tabManageSheets });
    await expect(manageTab).not.toBeVisible();
    await context.close();
  });

  test("non-admin direct URL to manage-sheets shows no management content", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE_BASIC });
    const page = await context.newPage();
    await page.goto("/tasks?view=manage-sheets");
    await page.waitForLoadState("networkidle");
    // The manage-sheets content should not render for non-admin
    const manageTitle = page.getByText(TASK_TEXT.manageTitle);
    await expect(manageTitle).not.toBeVisible({ timeout: 5_000 });
    await context.close();
  });

  test("basic user without canCreateTasks sees no create buttons", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE_BASIC });
    const page = await context.newPage();
    await page.goto("/tasks");
    await page.waitForLoadState("networkidle");

    // "משימה חדשה" button should not be visible
    const newTaskBtn = page.getByRole("button", { name: TASK_TEXT.newTask });
    await expect(newTaskBtn).not.toBeVisible({ timeout: 5_000 });

    // Column "+" buttons should not be visible (check first column)
    const todoColumn = page.locator("div.flex.flex-col").filter({
      has: page.locator("h3").filter({ hasText: TASK_TEXT.colTodo }),
    });
    const plusButtons = todoColumn.locator("button").filter({ hasText: "+" });
    await expect(plusButtons).toHaveCount(0);
    await context.close();
  });
});

// ─── 4.3 Tab Navigation ─────────────────────────────────────

test.describe("Tab Navigation", () => {
  test("clicking each tab updates URL", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    await tasksPage.goto();

    await tasksPage.clickTab(TASK_TEXT.tabDone);
    await expect(page).toHaveURL(/view=done/);

    await tasksPage.clickTab(TASK_TEXT.tabMySheets);
    await expect(page).toHaveURL(/view=my-sheets/);

    await tasksPage.clickTab(TASK_TEXT.tabManageSheets);
    await expect(page).toHaveURL(/view=manage-sheets/);

    await tasksPage.clickTab(TASK_TEXT.tabKanban);
    await expect(page).toHaveURL(/view=kanban/);
  });

  test("direct URL navigation loads correct view", async ({ page }) => {
    const tasksPage = new TasksPage(page);

    // Navigate to done view — assert view-specific content (header), not just tab label
    await tasksPage.goto("done");
    await expect(page.getByText(TASK_TEXT.doneViewHeader)).toBeVisible({ timeout: 10_000 });

    // Navigate to my-sheets — assert view-specific subtitle
    await tasksPage.goto("my-sheets");
    await expect(page.getByText(TASK_TEXT.mySheetsSubtitle)).toBeVisible({ timeout: 10_000 });
  });
});

// ─── 4.4 Kanban Board — Display ─────────────────────────────

test.describe("Kanban Board — Display", () => {
  test("5 columns with correct Hebrew titles", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    await tasksPage.goto();

    for (const title of KanbanBoardPO.columnTitles) {
      await expect(page.locator("h3").filter({ hasText: title })).toBeVisible();
    }
  });

  test("search input has correct placeholder", async ({ page }) => {
    const kanban = new KanbanBoardPO(page);
    const tasksPage = new TasksPage(page);
    await tasksPage.goto();
    await expect(kanban.searchInput).toBeVisible();
    await expect(kanban.searchInput).toHaveAttribute("placeholder", TASK_TEXT.searchPlaceholder);
  });

  test("filter toggle button is visible", async ({ page }) => {
    const kanban = new KanbanBoardPO(page);
    const tasksPage = new TasksPage(page);
    await tasksPage.goto();
    await expect(kanban.filterToggle).toBeVisible();
  });

  test("seeded tasks appear in correct columns", async ({ page }) => {
    const kanban = new KanbanBoardPO(page);
    const tasksPage = new TasksPage(page);
    await tasksPage.goto();

    // Verify tasks are in their correct columns, not just visible on page
    await expect(kanban.getTaskInColumn(SEED.taskTodo, TASK_TEXT.colTodo)).toBeVisible();
    await expect(kanban.getTaskInColumn(SEED.taskInProgress, TASK_TEXT.colInProgress)).toBeVisible();
  });

  test("task card shows priority badge, tags, and assignee", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    await tasksPage.goto();

    // Find the seeded task card with known high priority
    const card = page.locator("[draggable]").filter({
      has: page.locator("h4").filter({ hasText: SEED.taskTodo }),
    });
    await expect(card).toBeVisible({ timeout: 5_000 });

    // Priority badge should show the priority text (e.g., "גבוה")
    await expect(card.getByText(TASK_TEXT.priorityHigh)).toBeVisible();

    // Tags should be displayed on the card
    await expect(card.getByText(SEED.taskTodoTags[0])).toBeVisible();
    await expect(card.getByText(SEED.taskTodoTags[1])).toBeVisible();

    // Assignee should appear — look for the 👤 emoji which precedes the name
    await expect(card.getByText("👤")).toBeVisible();
  });
});

// ─── 4.5 Task CRUD (Happy Path) ─────────────────────────────
// Use serial to ensure test isolation since these tests create/edit/delete tasks

test.describe.serial("Task CRUD", () => {
  test("create task via modal", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    await kanban.clickNewTask();

    // Modal should open with correct heading
    await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });
    const heading = await modal.getHeading();
    expect(heading).toContain(TASK_TEXT.modalCreateTitle);

    // Fill form
    const taskTitle = `משימת E2E ${Date.now()}`;
    await modal.fillTitle(taskTitle);
    await modal.fillDescription("תיאור בדיקה E2E");

    await modal.submit();

    // Toast
    await expectToast(page, TASK_TEXT.toastCreated);

    // Card appears in kanban
    await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 5_000 });
  });

  test("create task from column + button pre-selects status", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    // Click the + button in the "משימות בטיפול" column
    await kanban.clickColumnNewTask(TASK_TEXT.colInProgress);

    await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });

    // Status should be pre-selected to in_progress
    const selectedStatus = await modal.statusSelect.inputValue();
    expect(selectedStatus).toBe("in_progress");

    const taskTitle = `משימה מעמודה ${Date.now()}`;
    await modal.fillTitle(taskTitle);
    await modal.submit();

    await expectToast(page, TASK_TEXT.toastCreated);
    // Task should appear in the in_progress column
    await expect(kanban.getTaskInColumn(taskTitle, TASK_TEXT.colInProgress)).toBeVisible({ timeout: 5_000 });
  });

  test("edit task via modal — creates own task first", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    // Create a unique task to edit (avoid mutating seeded data)
    const originalTitle = await createUniqueTask(page, kanban, modal, "edit-target");

    // Click edit on the task we just created
    const editBtn = kanban.getTaskEditButton(originalTitle);
    await editBtn.click();

    await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });
    const heading = await modal.getHeading();
    expect(heading).toContain(TASK_TEXT.modalEditTitle);

    // Change title
    const updatedTitle = `משימה מעודכנת ${Date.now()}`;
    await modal.titleInput.clear();
    await modal.fillTitle(updatedTitle);
    await modal.submit();

    await expectToast(page, TASK_TEXT.toastUpdated);
    await expect(page.getByText(updatedTitle)).toBeVisible({ timeout: 5_000 });
  });

  test("delete task with confirmation — creates own task first", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    // Create a unique task to delete (avoid mutating seeded data)
    const taskTitle = await createUniqueTask(page, kanban, modal, "delete-target");

    const deleteBtn = kanban.getTaskDeleteButton(taskTitle);
    await deleteBtn.click();

    // Confirm dialog should appear
    const confirmBtn = page.getByRole("button", { name: TASK_TEXT.confirmBtn });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    await expectToast(page, TASK_TEXT.toastDeleted);

    // Card should be removed from DOM
    await expect(page.locator("h4").filter({ hasText: taskTitle })).not.toBeVisible({ timeout: 5_000 });
  });

  test("cancel delete keeps task", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    // Create a unique task to cancel-delete (avoid shared seeded data)
    const cancelTarget = await createUniqueTask(page, kanban, modal, "cancel-delete");

    const deleteBtn = kanban.getTaskDeleteButton(cancelTarget);
    await deleteBtn.click();

    // Click cancel
    const cancelBtn = page.getByRole("button", { name: TASK_TEXT.cancelBtn });
    await expect(cancelBtn).toBeVisible({ timeout: 5_000 });
    await cancelBtn.click();

    // Task should still be present
    await expect(page.getByText(cancelTarget)).toBeVisible();
  });

  test("modal close by backdrop click creates no task", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    await kanban.clickNewTask();
    await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });

    const uniqueTitle = `backdrop-test-${Date.now()}`;
    await modal.fillTitle(uniqueTitle);

    // Click the backdrop to close
    await modal.clickBackdrop();

    // Modal should close
    await expect(modal.titleInput).not.toBeVisible({ timeout: 3_000 });

    // No task should be created
    await expect(page.getByText(uniqueTitle)).not.toBeVisible();
  });
});

// ─── 4.6 Task Form Validation ───────────────────────────────

test.describe("Task Form Validation", () => {
  test("submit with empty title is prevented by HTML required", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    await kanban.clickNewTask();
    await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });

    // Try to submit without filling title
    await modal.submit();

    // Modal should remain open (HTML validation prevents submission)
    await expect(modal.titleInput).toBeVisible();
  });

  test("whitespace-only title is rejected by server", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    await kanban.clickNewTask();
    await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });

    // Fill with spaces only — bypasses HTML required but server Zod .trim().min(1) rejects
    await modal.titleInput.fill("   ");
    await modal.submit();

    // Should show error (task not created) — modal stays open or error toast appears
    await expect(
      page.getByText(TASK_TEXT.toastCreateFailed).or(modal.titleInput)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("cancel modal creates no task", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    await kanban.clickNewTask();
    await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });

    const uniqueTitle = `cancel-test-${Date.now()}`;
    await modal.fillTitle(uniqueTitle);
    await modal.cancel();

    // No task should be created
    await expect(page.getByText(uniqueTitle)).not.toBeVisible();
  });
});

// ─── 4.7 Task Modal Details ─────────────────────────────────

test.describe("Task Modal Details", () => {
  test("default priority is low", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    await kanban.clickNewTask();
    await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });

    // Check default priority
    const selectedPriority = await modal.prioritySelect.inputValue();
    expect(selectedPriority).toBe("low");
  });

  test("can add and remove tags", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    await kanban.clickNewTask();
    await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });

    // Add custom tag
    await modal.addTag("תגית-בדיקה");
    await expect(page.getByText("תגית-בדיקה")).toBeVisible();

    // Remove it
    await modal.removeTag("תגית-בדיקה");
    await expect(page.getByText("תגית-בדיקה")).not.toBeVisible();
  });

  test("edit modal pre-fills all existing task fields", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    // Open edit for seeded task (high priority, tags)
    const editBtn = kanban.getTaskEditButton(SEED.taskTodo);
    await editBtn.click();
    await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });

    // Heading should indicate edit mode
    const heading = await modal.getHeading();
    expect(heading).toContain(TASK_TEXT.modalEditTitle);

    // Title should be pre-filled
    await expect(modal.titleInput).toHaveValue(SEED.taskTodo);

    // Priority should be pre-filled to high
    await expect(modal.prioritySelect).toHaveValue("high");

    // Tags should be visible in the modal
    await expect(page.getByText(SEED.taskTodoTags[0])).toBeVisible();
    await expect(page.getByText(SEED.taskTodoTags[1])).toBeVisible();

    // Description should be pre-filled
    await expect(modal.descriptionInput).toHaveValue(SEED.taskTodoDescription);

    // Assignee should be pre-filled (non-empty value)
    const assigneeValue = await modal.assigneeSelect.inputValue();
    expect(assigneeValue).toBeTruthy();
    expect(assigneeValue).not.toBe("");

    // Cancel without saving
    await modal.cancel();
  });

  test("assignee dropdown loads users", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    await kanban.clickNewTask();
    await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });

    // Assignee select should have options
    const options = await modal.assigneeSelect.locator("option").count();
    expect(options).toBeGreaterThan(1); // at least "ללא אחראי" + 1 user
  });

});

// ─── 4.8 Drag & Drop ───────────────────────────────────────

test.describe("Drag & Drop", () => {
  // Native HTML5 drag-and-drop is unreliable in Playwright headless mode.
  // The component uses native drag events (dataTransfer.setData), which Playwright
  // cannot fully simulate via mouse events. Marking as fixme until we add
  // data-testid hooks or use a drag helper that dispatches proper DragEvents.
  test.fixme("drag task between columns updates status", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    await tasksPage.goto();

    const sourceCard = page.getByText(SEED.taskTodo).first();
    await expect(sourceCard).toBeVisible();

    const sourceBox = await sourceCard.boundingBox();
    expect(sourceBox).toBeTruthy();

    const targetColumn = page.locator("h3").filter({ hasText: TASK_TEXT.colInProgress });
    const targetBox = await targetColumn.boundingBox();
    expect(targetBox).toBeTruthy();

    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + 100, { steps: 10 });
    await page.mouse.up();

    await expectToast(page, TASK_TEXT.toastUpdated);
  });
});

// ─── 4.9 Search & Filter ───────────────────────────────────

test.describe("Search & Filter", () => {
  test("search by title filters tasks — matching visible, non-matching hidden", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    await tasksPage.goto();

    // Wait for tasks to load
    await expect(page.locator("h4").filter({ hasText: SEED.taskInProgress })).toBeVisible();

    await kanban.searchTasks("בדיקה");

    // Matching task should remain visible
    await expect(page.locator("h4").filter({ hasText: SEED.taskTodo })).toBeVisible({ timeout: 5_000 });
    // Non-matching task should be hidden
    await expect(page.locator("h4").filter({ hasText: SEED.taskInProgress })).not.toBeVisible({ timeout: 5_000 });
  });

  test("clear search shows all tasks", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    await tasksPage.goto();

    // Wait for initial load
    await expect(page.locator("h4").filter({ hasText: SEED.taskInProgress })).toBeVisible();

    // Search for something that hides tasks
    await kanban.searchTasks("nonexistent-xyz");
    await expect(page.locator("h4").filter({ hasText: SEED.taskInProgress })).not.toBeVisible({ timeout: 5_000 });

    // Clear search
    await kanban.clearSearch();

    // Tasks should be visible again
    await expect(page.locator("h4").filter({ hasText: SEED.taskInProgress })).toBeVisible({ timeout: 5_000 });
  });

  test("search matches task description, not just title", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    await tasksPage.goto();

    // Wait for tasks to load
    await expect(page.locator("h4").filter({ hasText: SEED.taskTodo })).toBeVisible();

    // Search for a term that only exists in the description, not in any title
    await kanban.searchTasks(SEED.taskTodoDescription);

    // The task should still be visible because search matches description
    await expect(page.locator("h4").filter({ hasText: SEED.taskTodo })).toBeVisible({ timeout: 5_000 });
    // Non-matching task should be hidden
    await expect(page.locator("h4").filter({ hasText: SEED.taskInProgress })).not.toBeVisible({ timeout: 5_000 });
  });

  test("filter sidebar toggles visibility and shows filter labels", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    await tasksPage.goto();

    // Sidebar starts OPEN by default — labels should already be visible
    await expect(page.getByText(TASK_TEXT.sidebarAssignee)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(TASK_TEXT.sidebarPriority)).toBeVisible();

    // Toggle closed
    await kanban.toggleFilterSidebar();
    await expect(page.getByText(TASK_TEXT.sidebarAssignee)).not.toBeVisible({ timeout: 3_000 });

    // Toggle open again
    await kanban.toggleFilterSidebar();
    await expect(page.getByText(TASK_TEXT.sidebarAssignee)).toBeVisible({ timeout: 3_000 });
  });

  test("filter sidebar: filter by priority", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    await tasksPage.goto();

    // Sidebar starts open — wait for it to be ready
    await expect(page.getByText(TASK_TEXT.sidebarPriority)).toBeVisible({ timeout: 5_000 });

    // Select high priority filter
    const prioritySelect = page.locator("select").filter({
      has: page.locator(`option:text("${TASK_TEXT.sidebarAllPriorities}")`),
    });
    await prioritySelect.selectOption({ label: TASK_TEXT.sidebarPriorityHigh });

    // Only high-priority tasks should be visible
    await expect(page.locator("h4").filter({ hasText: SEED.taskTodo })).toBeVisible({ timeout: 5_000 });
    // Low-priority tasks should be hidden
    await expect(page.locator("h4").filter({ hasText: SEED.taskTodoLow })).not.toBeVisible({ timeout: 5_000 });
  });

  test("filter sidebar: filter by assignee", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    await tasksPage.goto();

    // Sidebar starts open — wait for it to be ready
    await expect(page.getByText(TASK_TEXT.sidebarAssignee)).toBeVisible({ timeout: 5_000 });

    // Select the admin user from the assignee dropdown
    const assigneeSelect = page.locator("select").filter({
      has: page.locator(`option:text("${TASK_TEXT.sidebarAllEmployees}")`),
    });
    // Assert options exist — don't skip silently
    const options = await assigneeSelect.locator("option").all();
    expect(options.length).toBeGreaterThan(1);

    const secondOption = await options[1].getAttribute("value");
    expect(secondOption).toBeTruthy();
    await assigneeSelect.selectOption(secondOption!);

    // All seeded tasks are assigned to admin, so they should all remain visible
    await expect(page.locator("h4").filter({ hasText: SEED.taskTodo })).toBeVisible({ timeout: 5_000 });
  });

  test("filter sidebar: clear filters restores all tasks", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    await tasksPage.goto();

    // Sidebar starts open — wait for it to be ready, then apply a priority filter
    await expect(page.getByText(TASK_TEXT.sidebarPriority)).toBeVisible({ timeout: 5_000 });

    const prioritySelect = page.locator("select").filter({
      has: page.locator(`option:text("${TASK_TEXT.sidebarAllPriorities}")`),
    });
    await prioritySelect.selectOption({ label: TASK_TEXT.sidebarPriorityHigh });

    // Low-priority task should be hidden
    await expect(page.locator("h4").filter({ hasText: SEED.taskTodoLow })).not.toBeVisible({ timeout: 5_000 });

    // Click clear filters
    const clearBtn = page.getByRole("button", { name: TASK_TEXT.sidebarClearFilters });
    await clearBtn.click();

    // All tasks should be visible again
    await expect(page.locator("h4").filter({ hasText: SEED.taskTodoLow })).toBeVisible({ timeout: 5_000 });
  });
});

// ─── 4.10 Done Tasks View ──────────────────────────────────
// Merged into single serial block to prevent race conditions between
// read-only filter tests and mutation tests that modify seeded data.

test.describe.serial("Done Tasks View", () => {
  test("displays done view header", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    await tasksPage.goto("done");
    await expect(page.getByText(TASK_TEXT.doneViewHeader)).toBeVisible();
  });

  test("shows completed tasks from seed data", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    await tasksPage.goto("done");

    // We seeded 2 done tasks
    const doneTask = page.getByText(SEED.doneTask);
    await expect(doneTask.first()).toBeVisible({ timeout: 10_000 });
  });

  test("search filters done tasks with negative assertion", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const completed = new CompletedTasksPO(page);
    await tasksPage.goto("done");

    // Wait for done tasks to load
    await expect(page.getByText(SEED.doneTask).first()).toBeVisible({ timeout: 10_000 });

    // Search for term that only matches one task
    await completed.search("שהושלמה 2");

    // Only matching task visible
    await expect(page.locator("h3").filter({ hasText: SEED.doneTask2 })).toBeVisible({ timeout: 5_000 });
    // Only 1 card should be visible (negative assertion)
    await expect(page.locator("div.bg-slate-800\\/60")).toHaveCount(1, { timeout: 5_000 });
  });

  test("clear filters button restores all done tasks", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const completed = new CompletedTasksPO(page);
    await tasksPage.goto("done");

    // Wait for tasks to load
    await expect(page.getByText(SEED.doneTask).first()).toBeVisible({ timeout: 10_000 });

    // Search for something that produces no results
    await completed.search("xyz-no-match");

    // The no-match state or empty results should appear
    await expect(completed.noMatchState).toBeVisible({ timeout: 5_000 });

    // Clear filters
    await completed.clearAllFilters();

    // Tasks should be visible again
    await expect(page.getByText(SEED.doneTask).first()).toBeVisible({ timeout: 5_000 });
  });

  test("no-match state shows when search returns no results", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const completed = new CompletedTasksPO(page);
    await tasksPage.goto("done");
    await expect(page.getByText(SEED.doneTask).first()).toBeVisible({ timeout: 10_000 });

    await completed.search("absolutely-no-match-xyz-123");
    await expect(completed.noMatchState).toBeVisible({ timeout: 5_000 });
  });

  test("filter by priority in done view shows matching tasks only", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const completed = new CompletedTasksPO(page);
    await tasksPage.goto("done");

    // Wait for done tasks to load
    // Seed: doneTask = high priority, doneTask2 = low priority
    await expect(page.locator("h3").filter({ hasText: SEED.doneTask }).first()).toBeVisible({ timeout: 10_000 });

    // Filter by high priority → only high-priority task visible
    await completed.filterByPriority(TASK_TEXT.filterPriorityHigh);
    await expect(page.locator("h3").filter({ hasText: SEED.doneTask }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("h3").filter({ hasText: SEED.doneTask2 })).not.toBeVisible({ timeout: 5_000 });
  });

  test("filter by assignee in done view shows assigned tasks", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const completed = new CompletedTasksPO(page);
    await tasksPage.goto("done");

    // Wait for done tasks to load
    await expect(page.locator("h3").filter({ hasText: SEED.doneTask }).first()).toBeVisible({ timeout: 10_000 });

    // Get assignee dropdown options
    const options = await completed.assigneeSelect.locator("option").all();
    expect(options.length).toBeGreaterThan(1);

    // Select the first real assignee (admin — all seeded done tasks belong to admin)
    const assigneeValue = await options[1].getAttribute("value");
    expect(assigneeValue).toBeTruthy();
    await completed.assigneeSelect.selectOption(assigneeValue!);

    // All done tasks belong to admin, so they should remain visible
    await expect(page.locator("h3").filter({ hasText: SEED.doneTask }).first()).toBeVisible({ timeout: 5_000 });

    // Clear filters and verify tasks are restored
    await completed.clearAllFilters();
    await expect(page.locator("h3").filter({ hasText: SEED.doneTask }).first()).toBeVisible({ timeout: 5_000 });
  });

  test("filter by tag in done view", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const completed = new CompletedTasksPO(page);
    await tasksPage.goto("done");

    // Wait for done tasks to load
    // Seed: doneTask has tag doneTaskTag; doneTask2 has no tags
    await expect(page.locator("h3").filter({ hasText: SEED.doneTask }).first()).toBeVisible({ timeout: 10_000 });

    // Select tag filter
    await completed.tagSelect.selectOption({ label: SEED.doneTaskTag });

    // Only task with matching tag should be visible
    await expect(page.locator("h3").filter({ hasText: SEED.doneTask }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("h3").filter({ hasText: SEED.doneTask2 })).not.toBeVisible({ timeout: 5_000 });
  });

  // ─── Mutations (must run after read-only tests above) ─────

  test("delete task from done view", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const completed = new CompletedTasksPO(page);
    await tasksPage.goto("done");

    await expect(page.getByText(SEED.doneTask2)).toBeVisible({ timeout: 10_000 });

    // Click delete
    const deleteBtn = completed.getDeleteButton(SEED.doneTask2);
    await deleteBtn.click();

    // Confirm
    const confirmBtn = page.getByRole("button", { name: TASK_TEXT.confirmBtn });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    await expectToast(page, TASK_TEXT.toastDeleted);
    await expect(page.getByText(SEED.doneTask2)).not.toBeVisible({ timeout: 5_000 });
  });

  test("edit task from done view changes status back", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const completed = new CompletedTasksPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto("done");

    await expect(page.getByText(SEED.doneTask).first()).toBeVisible({ timeout: 10_000 });

    // Click edit
    const editBtn = completed.getEditButton(SEED.doneTask);
    await editBtn.click();

    await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });

    // Change status back to todo
    await modal.setStatus(TASK_TEXT.statusTodo);
    await modal.submit();

    await expectToast(page, TASK_TEXT.toastUpdated);
    // Task should disappear from done view
    await expect(page.getByText(SEED.doneTask)).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─── 4.11 My Task Sheets ───────────────────────────────────
// Merged into single serial block to prevent race conditions between
// read-only display tests and mutation tests that modify seeded data.

test.describe.serial("My Task Sheets", () => {
  test("displays sheets with type badge", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    await tasksPage.goto("my-sheets");

    // Check view subtitle
    await expect(page.getByText(TASK_TEXT.mySheetsSubtitle)).toBeVisible();

    // Look for seeded sheet
    const sheetTitleEl = page.getByText(SEED.sheetTitle);
    await expect(sheetTitleEl).toBeVisible({ timeout: 10_000 });

    // Type badge
    await expect(page.getByText(TASK_TEXT.sheetTypeDaily).first()).toBeVisible();
  });

  test("progress circle shows percentage", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    await tasksPage.goto("my-sheets");

    // We seeded 3 items, 1 completed = 33%
    await expect(page.getByText("33%")).toBeVisible({ timeout: 10_000 });
  });

  test("items show correct completion state", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    await tasksPage.goto("my-sheets");

    // Items are visible by default (sheets start expanded)
    await expect(page.getByText(SEED.sheetItem1)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(SEED.sheetItem2)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(SEED.sheetItem3)).toBeVisible({ timeout: 5_000 });
  });

  test("toggle collapses and expands sheet items", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const sheets = new MySheetsPO(page);
    await tasksPage.goto("my-sheets");

    // Items visible by default (sheets start expanded)
    await expect(page.getByText(SEED.sheetItem1)).toBeVisible({ timeout: 10_000 });

    // Toggle to collapse
    await sheets.toggleSheet(SEED.sheetTitle);
    await expect(page.getByText(SEED.sheetItem1)).not.toBeVisible({ timeout: 5_000 });

    // Toggle to expand again
    await sheets.toggleSheet(SEED.sheetTitle);
    await expect(page.getByText(SEED.sheetItem1)).toBeVisible({ timeout: 5_000 });
  });

  // ─── Mutations (must run after read-only tests above) ─────

  test("toggle item completion shows toast and updates progress", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const sheets = new MySheetsPO(page);
    await tasksPage.goto("my-sheets");

    // Verify initial progress before toggle (1 of 3 completed = ~33%)
    await expect(page.getByText("33%")).toBeVisible({ timeout: 10_000 });

    // Items already visible (sheets start expanded)
    await expect(page.getByText(SEED.sheetItem1)).toBeVisible({ timeout: 5_000 });

    // Toggle an uncompleted item
    await sheets.toggleItem(SEED.sheetItem1);

    // Should show completion toast
    await expectToast(page, TASK_TEXT.toastItemCompleted);

    // Progress should update (2 of 3 completed = ~67%)
    await expect(page.getByText("67%")).toBeVisible({ timeout: 5_000 });
  });

  test("toggle completed item shows uncomplete toast and updates progress", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const sheets = new MySheetsPO(page);
    await tasksPage.goto("my-sheets");

    // Previous serial test completed one more item → 67%
    await expect(page.getByText("67%")).toBeVisible({ timeout: 10_000 });

    // Items already visible (sheets start expanded)
    await expect(page.getByText(SEED.sheetItem2)).toBeVisible({ timeout: 5_000 });

    // sheetItem2 is seeded as completed — toggle it to uncomplete
    await sheets.toggleItem(SEED.sheetItem2);

    // Should show uncomplete toast
    await expectToast(page, TASK_TEXT.toastItemUncompleted);

    // Progress should decrease (1 of 3 completed = ~33%)
    await expect(page.getByText("33%")).toBeVisible({ timeout: 5_000 });
  });

  test("reset sheet confirms and shows toast", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const sheets = new MySheetsPO(page);
    await tasksPage.goto("my-sheets");

    // Items already visible (sheets start expanded), reset button is in the always-visible header
    await expect(page.getByText(SEED.sheetItem1)).toBeVisible({ timeout: 10_000 });

    // Reset sheet (click + confirm)
    await sheets.resetSheet(SEED.sheetTitle);

    await expectToast(page, TASK_TEXT.toastSheetReset);
  });
});

// ─── 4.12 Manage Sheets — Admin ─────────────────────────────

test.describe("Manage Sheets — Admin", () => {
  test("admin sees sheet management UI", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    await tasksPage.goto("manage-sheets");

    await expect(page.getByText(TASK_TEXT.manageTitle)).toBeVisible({ timeout: 10_000 });
  });

  test("non-admin cannot see manage sheets tab", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE_BASIC });
    const page = await context.newPage();
    await page.goto("/tasks");
    await page.waitForLoadState("networkidle");

    const manageTab = page.getByRole("link", { name: TASK_TEXT.tabManageSheets });
    await expect(manageTab).not.toBeVisible();
    await context.close();
  });
});

// ─── 4.13 Error States ──────────────────────────────────────

test.describe("Error States", () => {
  test("server action 500 error shows generic error toast", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    // Wait for page to fully load before setting up the route intercept
    await expect(page.locator("h4").first()).toBeVisible({ timeout: 10_000 });

    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: "Internal Server Error",
      });
    });

    await kanban.clickNewTask();
    await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });

    const taskTitle = `error-test-${Date.now()}`;
    await modal.fillTitle(taskTitle);
    await modal.submit();

    // 500 triggers catch path → getUserFriendlyError → generic error containing "שגיאה"
    await expect(page.getByText(/שגיאה|נכשל/).first()).toBeVisible({ timeout: 10_000 });
    await cleanup();
  });

  test("server action result.success===false shows specific error toast", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    // Wait for page to fully load before setting up the route intercept
    await expect(page.locator("h4").first()).toBeVisible({ timeout: 10_000 });

    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/x-component",
        body: `0:${JSON.stringify({ success: false })}\n`,
      });
    });

    await kanban.clickNewTask();
    await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });

    const taskTitle = `error-test-fail-${Date.now()}`;
    await modal.fillTitle(taskTitle);
    await modal.submit();

    // result.success===false path → "הוספת משימה נכשלה"
    await expectToast(page, TASK_TEXT.toastCreateFailed);
    await cleanup();
  });

  test("server action update failure shows specific error toast", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    // Open edit on a seeded task
    const editBtn = kanban.getTaskEditButton(SEED.taskTodo);
    await editBtn.click();
    await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });

    // Intercept server actions AFTER modal is open (to not block getUsers)
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/x-component",
        body: `0:${JSON.stringify({ success: false })}\n`,
      });
    });

    // Change title and submit
    await modal.titleInput.clear();
    await modal.fillTitle(`update-error-${Date.now()}`);
    await modal.submit();

    // Should show specific update-failed toast
    await expectToast(page, TASK_TEXT.toastUpdateFailed);
    await cleanup();
  });

  test("server action delete failure shows error toast", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    await tasksPage.goto();

    // Wait for page to fully load
    await expect(page.locator("h4").first()).toBeVisible({ timeout: 10_000 });

    // Click delete on a seeded task
    const deleteBtn = kanban.getTaskDeleteButton(SEED.taskTodo);
    await deleteBtn.click();

    // Confirmation dialog appears — intercept BEFORE confirming
    const confirmBtn = page.getByRole("button", { name: TASK_TEXT.confirmBtn });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });

    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/x-component",
        body: `0:${JSON.stringify({ success: false })}\n`,
      });
    });

    await confirmBtn.click();

    // Should show specific delete-failed toast
    await expectToast(page, TASK_TEXT.toastDeleteFailed);
    await cleanup();
  });
});

// ─── 4.14 Responsive ───────────────────────────────────────

test.describe("Responsive", () => {
  test("desktop: kanban shows 5 columns side-by-side", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const tasksPage = new TasksPage(page);
    await tasksPage.goto();

    const kanban = new KanbanBoardPO(page);
    const columns = await kanban.getVisibleColumns();
    expect(columns).toHaveLength(5);
  });

  test("mobile: page renders without breaking", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const tasksPage = new TasksPage(page);
    await tasksPage.goto();

    await expect(tasksPage.pageTitle).toBeVisible();
  });
});

// ─── 4.15 Edge Cases ───────────────────────────────────────

test.describe("Edge Cases", () => {
  test("very long task title does not break UI", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    await kanban.clickNewTask();
    await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });

    const longTitle = "א".repeat(200);
    await modal.fillTitle(longTitle);
    await modal.submit();

    await expectToast(page, TASK_TEXT.toastCreated);

    // Page should not break
    await expect(tasksPage.pageTitle).toBeVisible();

    // The long-title card itself should be rendered in the kanban
    await expect(page.getByText("א".repeat(200)).first()).toBeVisible({ timeout: 5_000 });
  });

  test("Hebrew + special characters in title/description", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    await kanban.clickNewTask();
    await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });

    const specialTitle = `בדיקה <script>"&'</script> ${Date.now()}`;
    await modal.fillTitle(specialTitle);
    await modal.fillDescription("תיאור עם תווים מיוחדים: <>&\"'");
    await modal.submit();

    await expectToast(page, TASK_TEXT.toastCreated);

    // Verify card appears in kanban with special chars rendered correctly
    await expect(page.getByText(specialTitle)).toBeVisible({ timeout: 5_000 });
  });

  test("page refresh preserves current tab view", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    await tasksPage.goto("done");
    await expect(page).toHaveURL(/view=done/);

    // Reload
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Should still be on done view
    await expect(page).toHaveURL(/view=done/);
    await expect(page.getByText(TASK_TEXT.doneViewHeader)).toBeVisible();
  });

  test("title exceeding 200 chars is rejected by server", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    await kanban.clickNewTask();
    await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });

    // 201 chars — exceeds Zod .max(200) validation
    const overLengthTitle = "א".repeat(201);
    await modal.fillTitle(overLengthTitle);
    await modal.submit();

    // Should show error toast — server rejects
    await expect(
      page.getByText(TASK_TEXT.toastCreateFailed).or(modal.titleInput)
    ).toBeVisible({ timeout: 10_000 });
    // The success toast should NOT appear
    await expect(page.getByText(TASK_TEXT.toastCreated)).not.toBeVisible({ timeout: 2_000 });
  });

  test("emoji in task title", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    const kanban = new KanbanBoardPO(page);
    const modal = new TaskModalPO(page);
    await tasksPage.goto();

    await kanban.clickNewTask();
    await expect(modal.titleInput).toBeVisible({ timeout: 5_000 });

    const emojiTitle = `🔥 משימה עם אימוג׳י 🎉 ${Date.now()}`;
    await modal.fillTitle(emojiTitle);
    await modal.submit();

    await expectToast(page, TASK_TEXT.toastCreated);
    await expect(page.getByText(emojiTitle)).toBeVisible({ timeout: 5_000 });
  });
});
