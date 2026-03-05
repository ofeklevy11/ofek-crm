import { test, expect, type Page } from "@playwright/test";
import { ServicePage } from "./pages/ServicePage";
import { ServiceKanbanPO } from "./pages/ServiceKanbanPO";
import { TicketModalPO } from "./pages/TicketModalPO";
import { TicketDetailsPO } from "./pages/TicketDetailsPO";
import { SERVICE_TEXT } from "./helpers/service-selectors";
import { interceptAllServerActions } from "./helpers/test-utils";

const STORAGE_ADMIN = "tests/e2e/.auth/tasks-admin.json";
const STORAGE_BASIC = "tests/e2e/.auth/tasks-basic.json";
const STORAGE_NO_TASKS = "tests/e2e/.auth/tasks-no-tasks.json";

// ─── Seeded test data ─────────────────────────────────────────
const SEED = {
  clientName: "לקוח בדיקה",
  ticketOpen: "קריאת שירות פתוחה",
  ticketInProgress: "קריאה בטיפול",
  ticketWaiting: "קריאה ממתינה",
  ticketResolved: "קריאה שטופלה",
  ticketHighPriority: "קריאה דחופה",
  comment: "תגובת בדיקה ראשונה",
} as const;

// Use admin auth state by default
test.use({ storageState: STORAGE_ADMIN });

// ─── Helpers ───────────────────────────────────────────────────

/** Wait for a toast message — scoped to Sonner toast container */
async function expectToast(page: Page, message: string) {
  const toast = page
    .locator("[data-sonner-toaster] [data-sonner-toast]")
    .filter({ hasText: message })
    .first();
  await expect(toast).toBeVisible({ timeout: 10_000 });
}

/** Wait for an error toast (matches שגיאה or נכשל) — scoped to Sonner toast container */
async function expectErrorToast(page: Page) {
  const toast = page
    .locator("[data-sonner-toaster] [data-sonner-toast]")
    .filter({ hasText: /שגיאה|נכשל/ })
    .first();
  await expect(toast).toBeVisible({ timeout: 10_000 });
}

/** Helper to create a fresh ticket and return its title */
async function createFreshTicket(
  page: Page,
  prefix: string,
): Promise<string> {
  const sp = new ServicePage(page);
  const modal = new TicketModalPO(page);
  const kanban = new ServiceKanbanPO(page);

  const title = `${prefix}-${Date.now()}`;
  await sp.clickNewTicket();
  await expect(modal.heading).toBeVisible({ timeout: 5_000 });
  await modal.fillTitle(title);
  await modal.submit();
  await expectToast(page, SERVICE_TEXT.toastCreated);
  await expect(modal.heading).not.toBeVisible({ timeout: 5_000 });
  await expect(kanban.getTicketCard(title)).toBeVisible({ timeout: 10_000 });
  return title;
}

// ─── 1. Navigation & Page Load ────────────────────────────────

test.describe("Navigation & Page Load", () => {
  test("page loads at /service with correct title", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();
    await expect(sp.pageTitle).toBeVisible();
    await expect(sp.pageSubtitle).toBeVisible();
  });

  test("5 stats cards visible", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    await expect(sp.statsOpen).toBeVisible();
    await expect(sp.statsInProgress).toBeVisible();
    await expect(sp.statsUrgent).toBeVisible();
    await expect(sp.statsBreached).toBeVisible();
    await expect(sp.statsClosed).toBeVisible();
  });

  test("stats cards show non-zero numeric values", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    // Open card — seeded data has ≥2 OPEN tickets
    const openValue = sp.getStatsCardValue(SERVICE_TEXT.statsOpen);
    await expect(openValue).toBeVisible({ timeout: 5_000 });
    const openNum = parseInt(await openValue.textContent() ?? "", 10);
    expect(openNum).not.toBeNaN();
    expect(openNum).toBeGreaterThanOrEqual(2);

    // InProgress card — seeded data has ≥1
    const ipValue = sp.getStatsCardValue(SERVICE_TEXT.statsInProgress);
    const ipNum = parseInt(await ipValue.textContent() ?? "", 10);
    expect(ipNum).not.toBeNaN();
    expect(ipNum).toBeGreaterThanOrEqual(1);
  });

  test("default view is kanban with 4 columns", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    await sp.goto();

    const columns = await kanban.getVisibleColumns();
    expect(columns).toHaveLength(4);
    expect(columns).toEqual(ServiceKanbanPO.columnTitles);
  });

  test("header buttons visible", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    await expect(sp.slaBreachesBtn).toBeVisible();
    await expect(sp.automationsBtn).toBeVisible();
    await expect(sp.archiveBtn).toBeVisible();
    await expect(sp.slaSettingsBtn).toBeVisible();
    await expect(sp.newTicketBtn).toBeVisible();
  });

  test("loading resolves to loaded page", async ({ page }) => {
    await page.goto("/service");
    const sp = new ServicePage(page);
    await expect(sp.pageTitle).toBeVisible({ timeout: 15_000 });
  });
});

// ─── 2. Authentication & Authorization ────────────────────────

test.describe("Authentication & Authorization", () => {
  test("unauthenticated user redirected to /login", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/service");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("user without canViewServiceCalls redirected to /", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE_NO_TASKS });
    const page = await context.newPage();
    await page.goto("/service");
    await page.waitForLoadState("networkidle");

    // Should not see the service page
    const title = page.getByRole("heading", { name: SERVICE_TEXT.pageTitle });
    await expect(title).not.toBeVisible({ timeout: 5_000 });
    await context.close();
  });

  test("basic user with canViewServiceCalls can access page", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE_BASIC });
    const page = await context.newPage();
    await page.goto("/service");
    await page.waitForLoadState("networkidle");

    const title = page.getByRole("heading", { name: SERVICE_TEXT.pageTitle });
    await expect(title).toBeVisible({ timeout: 10_000 });
    await context.close();
  });

  test("admin user has full access", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();
    await expect(sp.pageTitle).toBeVisible();
    await expect(sp.newTicketBtn).toBeVisible();
  });
});

// ─── 3. Kanban View ───────────────────────────────────────────

test.describe("Kanban View", () => {
  test("4 columns visible with correct Hebrew labels", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    await sp.goto();

    const columns = await kanban.getVisibleColumns();
    expect(columns).toEqual([
      SERVICE_TEXT.colOpen,
      SERVICE_TEXT.colInProgress,
      SERVICE_TEXT.colWaiting,
      SERVICE_TEXT.colResolved,
    ]);
  });

  test("seeded tickets appear in correct columns", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    await sp.goto();

    // OPEN column should have ticketOpen and ticketHighPriority
    await expect(kanban.getTicketInColumn(SEED.ticketOpen, SERVICE_TEXT.colOpen)).toBeVisible();
    await expect(kanban.getTicketInColumn(SEED.ticketHighPriority, SERVICE_TEXT.colOpen)).toBeVisible();

    // IN_PROGRESS column
    await expect(kanban.getTicketInColumn(SEED.ticketInProgress, SERVICE_TEXT.colInProgress)).toBeVisible();

    // WAITING column
    await expect(kanban.getTicketInColumn(SEED.ticketWaiting, SERVICE_TEXT.colWaiting)).toBeVisible();

    // RESOLVED column
    await expect(kanban.getTicketInColumn(SEED.ticketResolved, SERVICE_TEXT.colResolved)).toBeVisible();
  });

  test("ticket cards show priority badge, ticket ID, title, assignee", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    // Find a ticket card - the high priority one should show קריטי badge
    const card = page.locator("div.bg-white.p-3").filter({
      has: page.locator("h4").filter({ hasText: SEED.ticketHighPriority }),
    }).first();

    await expect(card).toBeVisible();
    // Priority badge
    await expect(card.getByText(SERVICE_TEXT.priorityCritical)).toBeVisible();
    // Ticket ID (# prefix)
    await expect(card.locator("span").filter({ hasText: /^#\d+$/ })).toBeVisible();
    // Title
    await expect(card.locator("h4")).toContainText(SEED.ticketHighPriority);
  });

  test("column count badges show correct numbers", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    await sp.goto();

    // OPEN column should have ≥2 tickets
    const openCount = await kanban.getColumnTicketCount(SERVICE_TEXT.colOpen);
    const openCountNum = parseInt(openCount?.trim() ?? "0", 10);
    expect(openCountNum).toBeGreaterThanOrEqual(2);

    // IN_PROGRESS should have ≥1
    const inProgressCount = await kanban.getColumnTicketCount(SERVICE_TEXT.colInProgress);
    const ipCountNum = parseInt(inProgressCount?.trim() ?? "0", 10);
    expect(ipCountNum).toBeGreaterThanOrEqual(1);
  });

  test("search filters tickets across all columns", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    await sp.goto();

    await sp.search("דחופה");
    // Should see the high priority ticket
    await expect(kanban.getTicketCard(SEED.ticketHighPriority)).toBeVisible();
    // Should NOT see the other tickets
    await expect(kanban.getTicketCard(SEED.ticketWaiting)).not.toBeVisible();
  });

  test("clear search restores all tickets", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    await sp.goto();

    await sp.search("דחופה");
    await expect(kanban.getTicketCard(SEED.ticketWaiting)).not.toBeVisible();

    await sp.clearSearch();
    await expect(kanban.getTicketCard(SEED.ticketWaiting)).toBeVisible();
  });

  test("ticket card shows comment count badge when comments exist", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    // Seeded ticket with comment should show MessageSquare icon + count
    const card = page.locator("div.bg-white.p-3").filter({
      has: page.locator("h4").filter({ hasText: SEED.ticketOpen }),
    }).first();
    await expect(card).toBeVisible({ timeout: 5_000 });
    await expect(card.locator("svg.lucide-message-square")).toBeVisible();
  });

  test("ticket card without comments does not show comment count badge", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    // Create a fresh ticket (no comments)
    const title = await createFreshTicket(page, "no-comments-badge");

    const card = page.locator("div.bg-white.p-3").filter({
      has: page.locator("h4").filter({ hasText: title }),
    }).first();
    await expect(card).toBeVisible({ timeout: 5_000 });
    await expect(card.locator("svg.lucide-message-square")).not.toBeVisible();
  });
});

// ─── 4. List View ─────────────────────────────────────────────

test.describe("List View", () => {
  test("switch to list view via toggle button", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    await sp.switchToListView();
    // Table headers should be visible
    await expect(page.getByRole("columnheader", { name: SERVICE_TEXT.headerTicket })).toBeVisible();
  });

  test("table headers visible", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();
    await sp.switchToListView();

    // Check that all table header th elements are visible
    const headers = [
      SERVICE_TEXT.headerTicket,
      SERVICE_TEXT.headerStatus,
      SERVICE_TEXT.headerClient,
      SERVICE_TEXT.headerAssignee,
      SERVICE_TEXT.headerPriority,
      SERVICE_TEXT.headerCreated,
      SERVICE_TEXT.headerUpdated,
    ];

    for (const header of headers) {
      await expect(page.locator("th").filter({ hasText: header })).toBeVisible();
    }
  });

  test("seeded tickets appear in table rows", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();
    await sp.switchToListView();

    await expect(page.getByText(SEED.ticketOpen)).toBeVisible();
    await expect(page.getByText(SEED.ticketInProgress)).toBeVisible();
    await expect(page.getByText(SEED.ticketWaiting)).toBeVisible();
  });

  test("delete button visible on each row", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();
    await sp.switchToListView();

    // Each row should have a delete (Trash2) button
    const rows = page.locator("tbody tr");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(4);

    // Check first row has a button with trash icon
    const firstRowBtn = rows.first().locator("button").filter({
      has: page.locator("svg.lucide-trash-2"),
    });
    await expect(firstRowBtn).toBeVisible();
  });

  test("switch back to kanban view works", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    await sp.goto();

    await sp.switchToListView();
    await expect(page.locator("th").filter({ hasText: SERVICE_TEXT.headerTicket })).toBeVisible();

    await sp.switchToKanbanView();
    const columns = await kanban.getVisibleColumns();
    expect(columns).toHaveLength(4);
  });

  test("click row opens details panel", async ({ page }) => {
    const sp = new ServicePage(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();
    await sp.switchToListView();

    // Click the row containing the seeded open ticket
    const row = page.locator("tbody tr").filter({ hasText: SEED.ticketOpen }).first();
    await row.click();

    await expect(details.sheet).toBeVisible({ timeout: 5_000 });
    await expect(details.title).toContainText(SEED.ticketOpen);
  });

  test("search in list view filters rows", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();
    await sp.switchToListView();

    await sp.search(SEED.ticketHighPriority);
    await expect(page.locator("tbody tr").filter({ hasText: SEED.ticketHighPriority })).toBeVisible();
    await expect(page.locator("tbody tr").filter({ hasText: SEED.ticketWaiting })).not.toBeVisible();
  });
});

// ─── 5. Create Ticket (Happy Path) ───────────────────────────

test.describe("Create Ticket", () => {
  test("click new ticket opens modal with correct title", async ({ page }) => {
    const sp = new ServicePage(page);
    const modal = new TicketModalPO(page);
    await sp.goto();

    await sp.clickNewTicket();
    await expect(modal.heading).toBeVisible({ timeout: 5_000 });
    await expect(modal.description).toBeVisible();
  });

  test("fill title and submit creates ticket", async ({ page }) => {
    const sp = new ServicePage(page);
    const modal = new TicketModalPO(page);
    const kanban = new ServiceKanbanPO(page);
    await sp.goto();

    const title = `קריאת בדיקה ${Date.now()}`;
    await sp.clickNewTicket();
    await expect(modal.heading).toBeVisible({ timeout: 5_000 });

    await modal.fillTitle(title);
    await modal.submit();

    await expectToast(page, SERVICE_TEXT.toastCreated);
    // Modal should close
    await expect(modal.heading).not.toBeVisible({ timeout: 5_000 });
    // New ticket visible in kanban (default status OPEN)
    await expect(kanban.getTicketCard(title)).toBeVisible({ timeout: 10_000 });
  });

  test("cancel button closes modal without creating", async ({ page }) => {
    const sp = new ServicePage(page);
    const modal = new TicketModalPO(page);
    await sp.goto();

    await sp.clickNewTicket();
    await expect(modal.heading).toBeVisible({ timeout: 5_000 });

    await modal.fillTitle("לא צריך להיווצר");
    await modal.cancel();

    await expect(modal.heading).not.toBeVisible({ timeout: 5_000 });
    // Ticket should NOT appear
    await expect(page.getByText("לא צריך להיווצר")).not.toBeVisible();
  });

  test("create ticket with all fields", async ({ page }) => {
    const sp = new ServicePage(page);
    const modal = new TicketModalPO(page);
    const kanban = new ServiceKanbanPO(page);
    await sp.goto();

    const title = `קריאה מלאה ${Date.now()}`;
    await sp.clickNewTicket();
    await expect(modal.heading).toBeVisible({ timeout: 5_000 });

    await modal.fillTitle(title);
    await modal.fillDescription("תיאור מפורט של הבעיה");
    await modal.selectPriority(SERVICE_TEXT.priorityHigh);
    await modal.selectType(SERVICE_TEXT.typeComplaint);
    await modal.submit();

    await expectToast(page, SERVICE_TEXT.toastCreated);
    await expect(modal.heading).not.toBeVisible({ timeout: 5_000 });
    // Ticket card should appear in kanban
    await expect(kanban.getTicketCard(title)).toBeVisible({ timeout: 10_000 });
  });

  test("create ticket with all fields — verify fields persist in details", async ({ page }) => {
    const sp = new ServicePage(page);
    const modal = new TicketModalPO(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    const title = `full-verify-${Date.now()}`;
    const description = "תיאור מפורט לבדיקת שמירת שדות";
    await sp.clickNewTicket();
    await expect(modal.heading).toBeVisible({ timeout: 5_000 });

    await modal.fillTitle(title);
    await modal.fillDescription(description);
    await modal.selectPriority(SERVICE_TEXT.priorityHigh);
    await modal.selectType(SERVICE_TEXT.typeComplaint);
    await modal.submit();

    await expectToast(page, SERVICE_TEXT.toastCreated);
    await expect(kanban.getTicketCard(title)).toBeVisible({ timeout: 10_000 });

    // Open details and verify all fields
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });
    await expect(details.title).toContainText(title);
    await expect(details.descriptionText).toContainText(description);
    await expect(details.prioritySelect).toContainText(SERVICE_TEXT.priorityHigh);
    await expect(details.typeBadge).toContainText(SERVICE_TEXT.typeComplaint);
  });
});

// ─── 6. Create Ticket (Validation) ───────────────────────────

test.describe("Create Ticket Validation", () => {
  test("submit with empty title doesn't submit (required attribute)", async ({ page }) => {
    const sp = new ServicePage(page);
    const modal = new TicketModalPO(page);
    await sp.goto();

    await sp.clickNewTicket();
    await expect(modal.heading).toBeVisible({ timeout: 5_000 });

    // Don't fill title, click submit
    await modal.submit();

    // Modal should still be open (HTML required prevents submission)
    await expect(modal.heading).toBeVisible();
  });

  test("modal fields have correct defaults", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    await sp.clickNewTicket();

    // Check default values shown in select triggers
    // Priority default: בינוני, Type default: שירות, Status default: פתוח
    await expect(page.getByText(SERVICE_TEXT.priorityMedium).first()).toBeVisible();
    await expect(page.getByText(SERVICE_TEXT.typeService).first()).toBeVisible();
    await expect(page.getByText(SERVICE_TEXT.statusOpen).first()).toBeVisible();
  });
});

// ─── 7. Ticket Details Panel ──────────────────────────────────

test.describe("Ticket Details Panel", () => {
  test("click ticket card opens side panel", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    await kanban.getTicketCard(SEED.ticketOpen).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });
  });

  test("ticket ID badge and type badge visible", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    await kanban.getTicketCard(SEED.ticketOpen).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // Ticket ID badge (e.g. #123)
    await expect(details.ticketIdBadge).toBeVisible();
    // Type badge — verify it shows the correct type value
    await expect(details.typeBadge).toBeVisible();
    await expect(details.typeBadge).toContainText(SERVICE_TEXT.typeService);
  });

  test("title, description, status/priority, client, assignee, creator visible", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    await kanban.getTicketCard(SEED.ticketOpen).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // Title
    await expect(details.title).toContainText(SEED.ticketOpen);
    // Description section
    await expect(details.descriptionSection).toBeVisible();
    // Status and priority selects
    await expect(details.statusSelect).toBeVisible();
    await expect(details.prioritySelect).toBeVisible();
    // Client and assignee labels
    await expect(details.clientLabel).toBeVisible();
    await expect(details.assigneeLabel).toBeVisible();
    // Creator
    await expect(details.creatorLabel).toBeVisible();
  });

  test("activity section and comment input visible", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    await kanban.getTicketCard(SEED.ticketOpen).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    await expect(details.activityTitle).toBeVisible();
    await expect(details.commentInput).toBeVisible();
    await expect(details.sendButton).toBeVisible();
  });

  test("close panel works", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    await kanban.getTicketCard(SEED.ticketOpen).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    await details.close();
    await expect(details.sheet).not.toBeVisible({ timeout: 5_000 });
  });

  test("seeded comment visible in activity stream", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    // Open ticket that has the seeded comment
    await kanban.getTicketCard(SEED.ticketOpen).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // Seeded comment should appear
    await expect(details.sheet.getByText(SEED.comment)).toBeVisible({ timeout: 10_000 });
  });

  test("ticket shows client name", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    // Open ticket that has a client attached
    await kanban.getTicketCard(SEED.ticketOpen).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // Client name should be visible
    await expect(details.sheet.getByText(SEED.clientName)).toBeVisible({ timeout: 5_000 });
  });

  test("creator card shows non-empty user name", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    await kanban.getTicketCard(SEED.ticketOpen).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // Creator card should be visible and contain text beyond just the label
    await expect(details.creatorCard).toBeVisible({ timeout: 5_000 });
    const cardText = await details.creatorCard.textContent();
    // Strip the label to check that a user name is present
    const nameText = cardText?.replace(SERVICE_TEXT.creatorLabel, "").trim() ?? "";
    expect(nameText.length).toBeGreaterThan(0);
  });
});

// ─── 8. Ticket Details — Edit Fields ─────────────────────────

test.describe("Ticket Details — Edit Fields", () => {
  test("change status shows toast, activity log, and moves card to new column", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    // Create a fresh ticket (defaults to OPEN status)
    const title = await createFreshTicket(page, "edit-status");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    await details.changeStatus(SERVICE_TEXT.statusInProgress);
    await expectToast(page, SERVICE_TEXT.toastStatusUpdated);

    // Activity log entry should appear with old→new values
    const statusLog = details.getActivityLogEntry("סטטוס");
    await expect(statusLog).toBeVisible({ timeout: 5_000 });
    await expect(statusLog).toContainText("פתוח");
    await expect(statusLog).toContainText("בטיפול");

    // Close panel and verify card moved to IN_PROGRESS column
    await details.close();
    await expect(kanban.getTicketInColumn(title, SERVICE_TEXT.colInProgress)).toBeVisible({ timeout: 5_000 });
    await expect(kanban.getTicketInColumn(title, SERVICE_TEXT.colOpen)).not.toBeVisible({ timeout: 3_000 });
  });

  test("change priority shows toast and activity log entry", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    const title = await createFreshTicket(page, "edit-priority");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    await details.changePriority(SERVICE_TEXT.priorityCritical);
    await expectToast(page, SERVICE_TEXT.toastPriorityUpdated);

    // Activity log entry should appear with old→new values
    const priorityLog = details.getActivityLogEntry("עדיפות");
    await expect(priorityLog).toBeVisible({ timeout: 5_000 });
    await expect(priorityLog).toContainText("בינוני");
    await expect(priorityLog).toContainText("קריטי");
  });

  test("edit title updates panel and shows toast", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    const title = await createFreshTicket(page, "edit-title");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    const newTitle = `כותרת-מעודכנת-${Date.now()}`;
    await details.editTitle(newTitle);
    await expectToast(page, SERVICE_TEXT.toastTitleUpdated);
    await expect(details.title).toContainText(newTitle);
  });

  test("edit description updates panel and shows toast", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    const title = await createFreshTicket(page, "edit-desc");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    await details.editDescription("תיאור מעודכן לבדיקה");
    await expectToast(page, SERVICE_TEXT.toastDescriptionUpdated);
    await expect(details.descriptionText).toContainText("תיאור מעודכן לבדיקה");
  });

  test("change assignee shows toast", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    const title = await createFreshTicket(page, "edit-assignee");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // The assignee select should be visible — pick the first available option
    await expect(details.assigneeSelect).toBeVisible({ timeout: 5_000 });
    await details.assigneeSelect.click();
    // Select any available user option and capture its name
    const option = page.getByRole("option").first();
    await expect(option).toBeVisible({ timeout: 3_000 });
    const assigneeName = await option.textContent();
    await option.click();

    await expectToast(page, SERVICE_TEXT.toastAssigneeUpdated);

    // Verify the activity log shows the assignee change
    await expect(details.sheet.getByText("נציג מטפל")).toBeVisible({ timeout: 5_000 });
    expect(assigneeName).toBeTruthy();
    await expect(details.sheet.getByText(assigneeName!).first()).toBeVisible({ timeout: 5_000 });
  });
});

// ─── 9. Ticket Details — Comments ─────────────────────────────

test.describe("Ticket Details — Comments", () => {
  test("type comment and send - comment appears", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    const title = await createFreshTicket(page, "comment-add");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    const commentText = `תגובת בדיקה ${Date.now()}`;
    await details.addComment(commentText);

    // Comment should appear in the activity stream
    await expect(details.sheet.getByText(commentText)).toBeVisible({ timeout: 10_000 });
  });

  test("empty comment - send button disabled", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    await kanban.getTicketCard(SEED.ticketOpen).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // Send button should be disabled when comment is empty
    await expect(details.sendButton).toBeDisabled();
  });
});

// ─── 10. Delete Ticket ───────────────────────────────────────

test.describe("Delete Ticket", () => {
  test("delete from details panel — confirm dialog → toast → panel closes", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    const title = await createFreshTicket(page, "delete-details");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // Delete via the details panel
    await details.deleteTicket();

    await expectToast(page, SERVICE_TEXT.toastDeleted);
    // Panel should close
    await expect(details.sheet).not.toBeVisible({ timeout: 5_000 });
    // Ticket should no longer be in kanban
    await expect(kanban.getTicketCard(title)).not.toBeVisible({ timeout: 5_000 });
  });

  test("delete from list view — confirm dialog → ticket removed from table", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    const title = await createFreshTicket(page, "delete-list");

    // Switch to list view
    await sp.switchToListView();
    await expect(page.locator("tbody tr").filter({ hasText: title })).toBeVisible({ timeout: 5_000 });

    // Click the delete button on the row
    const row = page.locator("tbody tr").filter({ hasText: title });
    const deleteBtn = row.locator("button").filter({
      has: page.locator("svg.lucide-trash-2"),
    });
    await deleteBtn.click();

    // Confirm dialog
    const confirmBtn = page.getByRole("button", { name: SERVICE_TEXT.confirmBtn });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    await expectToast(page, SERVICE_TEXT.toastDeleted);
    // Ticket removed from table
    await expect(row).not.toBeVisible({ timeout: 10_000 });
  });

  test("delete confirm dialog shows correct warning text", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    const title = await createFreshTicket(page, "delete-dialog-text");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    await details.deleteButton.click();
    await expect(page.getByText(SERVICE_TEXT.confirmDelete)).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: SERVICE_TEXT.btnCancel }).click();
  });
});

// ─── 11. SLA Config Modal ─────────────────────────────────────

test.describe("SLA Config Modal", () => {
  test("click SLA settings opens modal with correct title", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    await sp.openSlaSettings();
    await expect(page.getByRole("heading", { name: SERVICE_TEXT.slaModalTitle })).toBeVisible({ timeout: 5_000 });
  });

  test("4 priority rows visible", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    await sp.openSlaSettings();
    await expect(page.getByRole("heading", { name: SERVICE_TEXT.slaModalTitle })).toBeVisible({ timeout: 5_000 });

    // Check all 4 priorities are shown
    await expect(page.getByText(SERVICE_TEXT.priorityCritical)).toBeVisible();
    await expect(page.getByText(SERVICE_TEXT.priorityHigh)).toBeVisible();
    await expect(page.getByText(SERVICE_TEXT.priorityMedium)).toBeVisible();
    await expect(page.getByText(SERVICE_TEXT.priorityLow)).toBeVisible();
  });

  test("response and resolve time inputs visible for each row", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    await sp.openSlaSettings();
    await expect(page.getByRole("heading", { name: SERVICE_TEXT.slaModalTitle })).toBeVisible({ timeout: 5_000 });

    // Each row has response and resolve labels
    const responseLabels = page.getByText(SERVICE_TEXT.slaResponseTime);
    const resolveLabels = page.getByText(SERVICE_TEXT.slaResolveTime);

    await expect(responseLabels.first()).toBeVisible();
    await expect(resolveLabels.first()).toBeVisible();

    // Should have 4 of each (one per priority)
    expect(await responseLabels.count()).toBe(4);
    expect(await resolveLabels.count()).toBe(4);
  });

  test("save and cancel buttons visible", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    await sp.openSlaSettings();
    await expect(page.getByRole("heading", { name: SERVICE_TEXT.slaModalTitle })).toBeVisible({ timeout: 5_000 });

    await expect(page.getByRole("button", { name: SERVICE_TEXT.slaSave })).toBeVisible();
    await expect(page.getByRole("button", { name: SERVICE_TEXT.btnCancel })).toBeVisible();
  });

  test("cancel closes modal", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    await sp.openSlaSettings();
    const heading = page.getByRole("heading", { name: SERVICE_TEXT.slaModalTitle });
    await expect(heading).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: SERVICE_TEXT.btnCancel }).click();
    await expect(heading).not.toBeVisible({ timeout: 5_000 });
  });

  test("save SLA config shows success toast", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    await sp.openSlaSettings();
    const heading = page.getByRole("heading", { name: SERVICE_TEXT.slaModalTitle });
    await expect(heading).toBeVisible({ timeout: 5_000 });

    // Modify a response time value — scoped to the SLA modal dialog
    const firstResponseInput = page.locator("[role=dialog] input[type=number]").first();
    await expect(firstResponseInput).toBeVisible({ timeout: 3_000 });

    // Change the value
    const currentValue = await firstResponseInput.inputValue();
    const newValue = String(Number(currentValue) + 1);
    await firstResponseInput.clear();
    await firstResponseInput.fill(newValue);

    // Click save
    await page.getByRole("button", { name: SERVICE_TEXT.slaSave }).click();

    await expectToast(page, SERVICE_TEXT.toastSlaUpdated);
    // Modal should close on success
    await expect(heading).not.toBeVisible({ timeout: 5_000 });

    // Restore original value
    await sp.openSlaSettings();
    await expect(heading).toBeVisible({ timeout: 5_000 });
    const input = page.locator("[role=dialog] input[type=number]").first();
    await input.clear();
    await input.fill(currentValue);
    await page.getByRole("button", { name: SERVICE_TEXT.slaSave }).click();
    await expectToast(page, SERVICE_TEXT.toastSlaUpdated);
  });

  test("blur on SLA input with value 0 snaps to minimum 1", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    await sp.openSlaSettings();
    await expect(page.getByRole("heading", { name: SERVICE_TEXT.slaModalTitle })).toBeVisible({ timeout: 5_000 });

    const firstInput = page.locator("[role=dialog] input[type=number]").first();
    await firstInput.clear();
    await firstInput.fill("0");
    await firstInput.blur();

    await expect(firstInput).toHaveValue("1");
    await page.getByRole("button", { name: SERVICE_TEXT.btnCancel }).click();
  });
});

// ─── 12. Navigation Links ─────────────────────────────────────

test.describe("Navigation Links", () => {
  test("SLA breaches link navigates to /service/sla-breaches", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    await sp.slaBreachesBtn.click();
    await expect(page).toHaveURL(/\/service\/sla-breaches/);
  });

  test("automations link navigates to /service/automations", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    await sp.automationsBtn.click();
    await expect(page).toHaveURL(/\/service\/automations/);
  });

  test("archive link navigates to /service/archive", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    await sp.archiveBtn.click();
    await expect(page).toHaveURL(/\/service\/archive/);
  });

  test("stats card 'קריאות בחריגה' links to /service/sla-breaches", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    // The breached stats card is wrapped in a Link
    await page.getByText(SERVICE_TEXT.statsBreached).click();
    await expect(page).toHaveURL(/\/service\/sla-breaches/);
  });

  test("stats card 'קריאות סגורות' links to /service/archive", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    await page.getByText(SERVICE_TEXT.statsClosed).click();
    await expect(page).toHaveURL(/\/service\/archive/);
  });
});

// ─── 13. Search & Filter ──────────────────────────────────────

test.describe("Search & Filter", () => {
  test("search by ticket title filters results", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    await sp.goto();

    await sp.search(SEED.ticketOpen);
    await expect(kanban.getTicketCard(SEED.ticketOpen)).toBeVisible();
    await expect(kanban.getTicketCard(SEED.ticketInProgress)).not.toBeVisible();
  });

  test("search by ticket title (high priority)", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    await sp.search(SEED.ticketHighPriority);
    await expect(page.getByText(SEED.ticketHighPriority).first()).toBeVisible();
  });

  test("search with no results shows empty columns", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    await sp.goto();

    await sp.search("xxxxxxxxxxxxxxx");
    // All seeded tickets should be hidden
    await expect(kanban.getTicketCard(SEED.ticketOpen)).not.toBeVisible();
    await expect(kanban.getTicketCard(SEED.ticketInProgress)).not.toBeVisible();
  });

  test("clear search restores all tickets", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    await sp.goto();

    await sp.search("xxxxxxxxxxxxxxx");
    await expect(kanban.getTicketCard(SEED.ticketOpen)).not.toBeVisible();

    await sp.clearSearch();
    await expect(kanban.getTicketCard(SEED.ticketOpen)).toBeVisible();
    await expect(kanban.getTicketCard(SEED.ticketInProgress)).toBeVisible();
  });

  test("search by client name filters to matching tickets", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    await sp.goto();

    await sp.search(SEED.clientName);
    await expect(kanban.getTicketCard(SEED.ticketOpen)).toBeVisible({ timeout: 5_000 });
    await expect(kanban.getTicketCard(SEED.ticketWaiting)).not.toBeVisible({ timeout: 3_000 });
  });

  test("search by ticket ID shows matching ticket", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    // Open a ticket to capture its ID
    await kanban.getTicketCard(SEED.ticketOpen).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });
    const idText = await details.ticketIdBadge.textContent();
    const numericId = idText?.replace("#", "") ?? "";
    expect(numericId).toBeTruthy();
    await details.close();
    await expect(details.sheet).not.toBeVisible({ timeout: 5_000 });

    await sp.search(numericId);
    await expect(kanban.getTicketCard(SEED.ticketOpen)).toBeVisible({ timeout: 5_000 });
  });
});

// ─── 14. Edit Cancel Flows ──────────────────────────────────

test.describe("Edit Cancel Flows", () => {
  test("title edit cancel reverts to original value", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    await kanban.getTicketCard(SEED.ticketOpen).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    const originalTitle = await details.title.textContent();

    // Click edit, change text, then cancel
    await details.titleEditBtn.click();
    const titleInput = details.sheet.locator("input").first();
    await titleInput.clear();
    await titleInput.fill("כותרת שלא צריכה להישמר");

    // Click X (cancel) button
    const cancelBtn = details.sheet.locator("button").filter({
      has: page.locator("svg.lucide-x"),
    }).first();
    await cancelBtn.click();

    // Title should revert to original
    await expect(details.title).toContainText(originalTitle!);
  });

  test("description edit cancel reverts to original value", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    await kanban.getTicketCard(SEED.ticketOpen).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // Get original description text
    const descSection = details.sheet.locator(`div:has(> h3:has-text('${SERVICE_TEXT.descriptionLabel}'))`).first();
    const originalDesc = await descSection.locator("p").first().textContent();

    await details.cancelEditDescription();

    // Description should revert to original (seeded ticket has a description)
    await expect(descSection.locator("p").first()).toContainText(originalDesc!);
  });

  test("save empty title is a no-op (blank guard)", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    const title = await createFreshTicket(page, "blank-title-guard");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    await details.titleEditBtn.click();
    const titleInput = details.sheet.locator("input").first();
    await titleInput.clear();
    const saveBtn = details.sheet.locator("button").filter({
      has: page.locator("svg.lucide-check"),
    }).first();
    await saveBtn.click();

    // Save is no-op — input should still be visible (edit mode not exited)
    await expect(titleInput).toBeVisible();
    // Cancel and verify original title preserved
    const cancelBtn = details.sheet.locator("button").filter({
      has: page.locator("svg.lucide-x"),
    }).first();
    await cancelBtn.click();
    await expect(details.title).toContainText(title);
  });
});

// ─── 15. Client Change Dialog ────────────────────────────────

test.describe("Client Change Dialog", () => {
  test("remove client via dialog shows toast and updates UI", async ({ page }) => {
    const sp = new ServicePage(page);
    const modal = new TicketModalPO(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    // Create fresh ticket with a client attached
    const title = `client-change-${Date.now()}`;
    await sp.clickNewTicket();
    await expect(modal.heading).toBeVisible({ timeout: 5_000 });
    await modal.fillTitle(title);
    await modal.selectClient(SEED.clientName);
    await modal.submit();
    await expectToast(page, SERVICE_TEXT.toastCreated);
    await expect(modal.heading).not.toBeVisible({ timeout: 5_000 });
    await expect(kanban.getTicketCard(title)).toBeVisible({ timeout: 10_000 });

    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // Verify client is set
    await expect(details.sheet.getByText(SEED.clientName)).toBeVisible({ timeout: 5_000 });

    // Open client dialog and remove client
    await details.openClientDialog();
    const dialog = page.locator("[role=dialog]").filter({
      hasText: SERVICE_TEXT.clientDialogTitle,
    });
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    const noClientBtn = dialog.locator("button").filter({ hasText: SERVICE_TEXT.noClientOption });
    await expect(noClientBtn).toBeVisible({ timeout: 3_000 });
    await noClientBtn.click();

    await expectToast(page, SERVICE_TEXT.toastClientUpdated);
    await expect(details.sheet.getByText(SERVICE_TEXT.noClient)).toBeVisible({ timeout: 5_000 });
  });

  test("select a different client via dialog search", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    // Create fresh ticket WITHOUT a client
    const title = await createFreshTicket(page, "select-client");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // Verify no client set
    await expect(details.sheet.getByText(SERVICE_TEXT.noClient)).toBeVisible({ timeout: 5_000 });

    // Open client dialog, search and select seeded client
    await details.openClientDialog();
    const dialog = page.locator("[role=dialog]").filter({
      hasText: SERVICE_TEXT.clientDialogTitle,
    });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Search for the client
    const searchInput = dialog.getByPlaceholder(SERVICE_TEXT.clientSearchPlaceholder);
    await searchInput.fill(SEED.clientName);

    // Click the client row
    const clientRow = dialog.locator("button").filter({ hasText: SEED.clientName });
    await expect(clientRow).toBeVisible({ timeout: 5_000 });
    await clientRow.click();

    await expectToast(page, SERVICE_TEXT.toastClientUpdated);
    // Verify client name appears in the details panel
    await expect(details.sheet.getByText(SEED.clientName)).toBeVisible({ timeout: 5_000 });
  });
});

// ─── 16. Comment Delete ──────────────────────────────────────

test.describe("Comment Delete", () => {
  test("delete comment removes it from activity stream", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    // Create a fresh ticket to add and delete a comment on (avoid polluting seeded data)
    const title = await createFreshTicket(page, "comment-delete");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // Add a comment
    const commentText = `comment-to-delete-${Date.now()}`;
    await details.addComment(commentText);
    await expect(details.sheet.getByText(commentText)).toBeVisible({ timeout: 10_000 });

    // Delete it
    await details.deleteComment(commentText);
    await expectToast(page, SERVICE_TEXT.toastCommentDeleted);

    // Comment should be removed
    await expect(details.sheet.getByText(commentText)).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─── 17. Comment Edit ───────────────────────────────────────

test.describe("Comment Edit", () => {
  test("edit comment text and save — updated text appears", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    // Create a fresh ticket and add a comment
    const title = await createFreshTicket(page, "comment-edit");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    const originalComment = `original-comment-${Date.now()}`;
    await details.addComment(originalComment);
    await expect(details.sheet.getByText(originalComment)).toBeVisible({ timeout: 10_000 });

    // Edit the comment
    const editedComment = `edited-comment-${Date.now()}`;
    await details.editComment(originalComment, editedComment);

    // Verify updated text appears
    await expect(details.sheet.getByText(editedComment)).toBeVisible({ timeout: 10_000 });
  });

  test("cancel comment edit reverts to original text", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    const title = await createFreshTicket(page, "comment-edit-cancel");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    const originalComment = `original-${Date.now()}`;
    await details.addComment(originalComment);
    await expect(details.sheet.getByText(originalComment)).toBeVisible({ timeout: 10_000 });

    // Start editing
    const commentEl = details.sheet.locator("div.bg-white.border.rounded-lg").filter({
      hasText: originalComment,
    }).first();
    await commentEl.hover();
    const pencilBtn = commentEl.locator("button").filter({
      has: page.locator("svg.lucide-pencil"),
    }).first();
    await pencilBtn.click();

    // Type different text then cancel
    const textarea = commentEl.locator("textarea").first();
    await textarea.clear();
    await textarea.fill("text-that-should-not-persist");
    await commentEl.getByRole("button", { name: SERVICE_TEXT.btnCancel }).click();

    // Original text should still be shown
    await expect(details.sheet.getByText(originalComment)).toBeVisible({ timeout: 5_000 });
    await expect(details.sheet.getByText("text-that-should-not-persist")).not.toBeVisible();
  });
});

// ─── 18. No Description Placeholder ─────────────────────────

test.describe("No Description Placeholder", () => {
  test("ticket with no description shows placeholder text", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    // Create a ticket with title only (no description)
    const title = await createFreshTicket(page, "no-desc");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // Should show the "no description" placeholder
    await expect(details.sheet.getByText(SERVICE_TEXT.noDescription)).toBeVisible({ timeout: 5_000 });
  });
});

// ─── 19. Error States ────────────────────────────────────────

test.describe("Error States", () => {
  test("create ticket fails (500) shows error toast", async ({ page }) => {
    const sp = new ServicePage(page);
    const modal = new TicketModalPO(page);
    await sp.goto();

    // Wait for page to fully load
    await expect(page.locator("h4").first()).toBeVisible({ timeout: 10_000 });

    // Open modal and fill title BEFORE intercepting — avoids blocking modal data fetches
    await sp.clickNewTicket();
    await expect(modal.heading).toBeVisible({ timeout: 5_000 });
    await modal.fillTitle(`error-test-${Date.now()}`);

    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: "Internal Server Error",
      });
    });

    await modal.submit();

    // 500 triggers catch path → error toast
    await expectErrorToast(page);
    await cleanup();
  });

  test("update ticket fails shows error toast", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    // Open a ticket details panel
    await kanban.getTicketCard(SEED.ticketWaiting).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // Intercept AFTER panel is open to not block initial data loads
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: "Internal Server Error",
      });
    });

    // Try to change status
    await details.changeStatus(SERVICE_TEXT.statusResolved);

    await expectErrorToast(page);
    await cleanup();

    // Verify UI is not stuck — status select still interactive
    await expect(details.statusSelect).toBeVisible();
  });

  test("delete ticket fails shows error toast", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    // Open a ticket details panel
    await kanban.getTicketCard(SEED.ticketResolved).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // Click delete button to open confirm dialog
    await details.deleteButton.click();
    const confirmBtn = page.getByRole("button", { name: SERVICE_TEXT.confirmBtn });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });

    // Intercept BEFORE confirming
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: "Internal Server Error",
      });
    });

    await confirmBtn.click();

    await expectErrorToast(page);
    await cleanup();
  });

  test("comment add fails shows error toast", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    // Open a ticket details panel
    await kanban.getTicketCard(SEED.ticketOpen).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // Intercept AFTER panel is open
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: "Internal Server Error",
      });
    });

    // Try to add a comment
    await details.addComment(`error-comment-${Date.now()}`);

    await expectErrorToast(page);
    await cleanup();
  });

  test("comment edit fails shows error toast", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    const title = await createFreshTicket(page, "comment-edit-fail");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // Add a comment first (no intercept yet)
    const commentText = `edit-fail-${Date.now()}`;
    await details.addComment(commentText);
    await expect(details.sheet.getByText(commentText)).toBeVisible({ timeout: 10_000 });

    // Start editing
    const commentEl = details.sheet.locator("div.bg-white.border.rounded-lg").filter({
      hasText: commentText,
    }).first();
    await commentEl.hover();
    const pencilBtn = commentEl.locator("button").filter({
      has: page.locator("svg.lucide-pencil"),
    }).first();
    await pencilBtn.click();

    const textarea = commentEl.locator("textarea").first();
    await textarea.clear();
    await textarea.fill("edited-text-should-fail");

    // Intercept AFTER UI is ready
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: "Internal Server Error",
      });
    });

    await commentEl.getByRole("button", { name: SERVICE_TEXT.btnSave }).click();
    await expectErrorToast(page);
    await cleanup();
  });

  test("comment delete fails shows error toast", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    const title = await createFreshTicket(page, "comment-delete-fail");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // Add a comment first
    const commentText = `delete-fail-${Date.now()}`;
    await details.addComment(commentText);
    await expect(details.sheet.getByText(commentText)).toBeVisible({ timeout: 10_000 });

    // Hover to reveal trash button
    const commentEl = details.sheet.locator("div.bg-white.border.rounded-lg").filter({
      hasText: commentText,
    }).first();
    await commentEl.hover();
    const trashBtn = commentEl.locator("button").filter({
      has: page.locator("svg.lucide-trash-2"),
    }).first();
    await trashBtn.click();

    // Confirm dialog appears
    const confirmBtn = page.getByRole("button", { name: SERVICE_TEXT.confirmBtn });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });

    // Intercept BEFORE confirming
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: "Internal Server Error",
      });
    });

    await confirmBtn.click();
    await expectErrorToast(page);
    await cleanup();
  });

  test("client change fails shows error toast", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    const title = await createFreshTicket(page, "client-change-fail");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // Open client dialog
    await details.openClientDialog();
    const dialog = page.locator("[role=dialog]").filter({
      hasText: SERVICE_TEXT.clientDialogTitle,
    });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Search for the client
    const searchInput = dialog.getByPlaceholder(SERVICE_TEXT.clientSearchPlaceholder);
    await searchInput.fill(SEED.clientName);
    const clientRow = dialog.locator("button").filter({ hasText: SEED.clientName });
    await expect(clientRow).toBeVisible({ timeout: 5_000 });

    // Intercept AFTER dialog is ready
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: "Internal Server Error",
      });
    });

    await clientRow.click();
    await expectErrorToast(page);
    await cleanup();
  });

  test("SLA save fails shows error toast and modal stays open", async ({ page }) => {
    const sp = new ServicePage(page);
    await sp.goto();

    await sp.openSlaSettings();
    const heading = page.getByRole("heading", { name: SERVICE_TEXT.slaModalTitle });
    await expect(heading).toBeVisible({ timeout: 5_000 });

    // Modify a value
    const firstInput = page.locator("[role=dialog] input[type=number]").first();
    await expect(firstInput).toBeVisible({ timeout: 3_000 });
    const currentValue = await firstInput.inputValue();
    await firstInput.clear();
    await firstInput.fill(String(Number(currentValue) + 1));

    // Intercept AFTER modal is ready
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: "Internal Server Error",
      });
    });

    await page.getByRole("button", { name: SERVICE_TEXT.slaSave }).click();
    await expectErrorToast(page);

    // Modal should stay open after failure
    await expect(heading).toBeVisible();

    await cleanup();
    // Cancel to clean up
    await page.getByRole("button", { name: SERVICE_TEXT.btnCancel }).click();
  });
});

// ─── 20. Empty Activity State ────────────────────────────────

test.describe("Empty Activity State", () => {
  test("fresh ticket shows empty activity message", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    const title = await createFreshTicket(page, "empty-activity");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });
    await expect(details.sheet.getByText(SERVICE_TEXT.noActivity)).toBeVisible({ timeout: 10_000 });
  });
});

// ─── 21. No Assignee Placeholder ────────────────────────────

test.describe("No Assignee Placeholder", () => {
  test("fresh ticket shows 'not assigned' in assignee select", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    const title = await createFreshTicket(page, "no-assignee");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });
    await expect(details.assigneeSelect).toContainText(SERVICE_TEXT.noAssignee);
  });
});

// ─── 22. Responsive Layout ──────────────────────────────────

test.describe("Responsive Layout", () => {
  test("desktop viewport: stats cards and kanban columns visible", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await sp.goto();

    await expect(sp.statsOpen).toBeVisible();
    await expect(sp.statsBreached).toBeVisible();
    const columns = await kanban.getVisibleColumns();
    expect(columns).toHaveLength(4);
  });

  test("mobile viewport: layout adapts", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const sp = new ServicePage(page);
    await sp.goto();

    // Page title should still be visible
    await expect(sp.pageTitle).toBeVisible();
    // At least some stats should still be visible (stacked)
    await expect(sp.statsOpen).toBeVisible();
  });
});

// ─── 23. Drag-and-Drop ──────────────────────────────────────

test.describe("Drag-and-Drop", () => {
  test("drag ticket from OPEN to IN_PROGRESS updates status", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    await sp.goto();

    const title = await createFreshTicket(page, "drag-drop");

    // Locate the drag handle on the fresh ticket's card
    const handle = kanban.getDragHandle(title);
    await expect(handle).toBeVisible({ timeout: 5_000 });

    // Locate the IN_PROGRESS column droppable area
    const targetColumn = kanban.getColumn(SERVICE_TEXT.colInProgress);
    await expect(targetColumn).toBeVisible();

    const handleBox = await handle.boundingBox();
    const targetBox = await targetColumn.boundingBox();
    expect(handleBox).toBeTruthy();
    expect(targetBox).toBeTruthy();

    // Perform drag: mousedown → move > 8px activation distance → drop on target column
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    // Move in steps to trigger PointerSensor (distance > 8px)
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 10 });
    await page.mouse.up();

    // Verify: card now in IN_PROGRESS column, not in OPEN
    await expect(kanban.getTicketInColumn(title, SERVICE_TEXT.colInProgress)).toBeVisible({ timeout: 10_000 });
    await expect(kanban.getTicketInColumn(title, SERVICE_TEXT.colOpen)).not.toBeVisible({ timeout: 3_000 });

    // Verify status persisted — open details and check statusSelect
    await kanban.getTicketCard(title).click();
    const details = new TicketDetailsPO(page);
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });
    await expect(details.statusSelect).toContainText(SERVICE_TEXT.statusInProgress);
  });

  test("drag-and-drop failure rolls back card to original column", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    await sp.goto();

    const title = await createFreshTicket(page, "drag-fail");

    const handle = kanban.getDragHandle(title);
    await expect(handle).toBeVisible({ timeout: 5_000 });

    const targetColumn = kanban.getColumn(SERVICE_TEXT.colInProgress);
    await expect(targetColumn).toBeVisible();

    const handleBox = await handle.boundingBox();
    const targetBox = await targetColumn.boundingBox();
    expect(handleBox).toBeTruthy();
    expect(targetBox).toBeTruthy();

    // Intercept server actions to return 500 before dragging
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: "Internal Server Error",
      });
    });

    // Perform drag
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 10 });
    await page.mouse.up();

    // Should show error toast and card should revert to OPEN column
    await expectErrorToast(page);
    await expect(kanban.getTicketInColumn(title, SERVICE_TEXT.colOpen)).toBeVisible({ timeout: 10_000 });

    await cleanup();
  });
});

// ─── 24. Admin Activity Log Delete ───────────────────────────

test.describe("Admin Activity Log Delete", () => {
  test("admin can delete an activity log entry", async ({ page }) => {
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    // Create a fresh ticket and change status to generate a log entry
    const title = await createFreshTicket(page, "log-delete");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    await details.changeStatus(SERVICE_TEXT.statusInProgress);
    await expectToast(page, SERVICE_TEXT.toastStatusUpdated);

    // Verify activity log entry exists
    const logEntry = details.getActivityLogEntry("סטטוס");
    await expect(logEntry).toBeVisible({ timeout: 5_000 });

    // Hover to reveal trash button and click it
    await logEntry.hover();
    const trashBtn = logEntry.locator("button").filter({
      has: page.locator("svg.lucide-trash-2"),
    }).first();
    await trashBtn.click({ force: true });

    // Confirm deletion
    const confirmBtn = page.getByRole("button", { name: SERVICE_TEXT.confirmBtn });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    await expectToast(page, SERVICE_TEXT.toastLogDeleted);
    // Log entry should be removed
    await expect(logEntry).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─── 25. Basic User Permission Scoping ───────────────────────

test.describe("Basic User Permission Scoping", () => {
  test("basic user cannot see edit/delete buttons on other users' comments", async ({ browser }) => {
    // Use basic user context
    const context = await browser.newContext({ storageState: STORAGE_BASIC });
    const page = await context.newPage();
    const sp = new ServicePage(page);
    const kanban = new ServiceKanbanPO(page);
    const details = new TicketDetailsPO(page);
    await sp.goto();

    // Open seeded ticket that has admin's comment
    await kanban.getTicketCard(SEED.ticketOpen).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });

    // Wait for seeded comment to appear
    await expect(details.sheet.getByText(SEED.comment)).toBeVisible({ timeout: 10_000 });

    // Hover over the comment — pencil and trash should NOT be visible for basic user
    const commentEl = details.sheet.locator("div.bg-white.border.rounded-lg").filter({
      hasText: SEED.comment,
    }).first();
    await commentEl.hover();

    const pencilBtn = commentEl.locator("button").filter({
      has: page.locator("svg.lucide-pencil"),
    }).first();
    const trashBtn = commentEl.locator("button").filter({
      has: page.locator("svg.lucide-trash-2"),
    }).first();

    await expect(pencilBtn).not.toBeVisible({ timeout: 3_000 });
    await expect(trashBtn).not.toBeVisible({ timeout: 3_000 });

    await context.close();
  });

  test("basic user cannot see activity log delete button", async ({ browser, page: adminPage }) => {
    const sp = new ServicePage(adminPage);
    const kanban = new ServiceKanbanPO(adminPage);
    const details = new TicketDetailsPO(adminPage);
    await sp.goto();

    // As admin: create ticket + change status to generate a log entry
    const title = await createFreshTicket(adminPage, "perm-log");
    await kanban.getTicketCard(title).click();
    await expect(details.sheet).toBeVisible({ timeout: 5_000 });
    await details.changeStatus(SERVICE_TEXT.statusInProgress);
    await expectToast(adminPage, SERVICE_TEXT.toastStatusUpdated);
    await details.close();

    // As basic user: open the same ticket
    const basicContext = await browser.newContext({ storageState: STORAGE_BASIC });
    const basicPage = await basicContext.newPage();
    const basicSp = new ServicePage(basicPage);
    const basicKanban = new ServiceKanbanPO(basicPage);
    const basicDetails = new TicketDetailsPO(basicPage);
    await basicSp.goto();

    await basicKanban.getTicketCard(title).click();
    await expect(basicDetails.sheet).toBeVisible({ timeout: 5_000 });

    // Verify activity log entry exists
    const logEntry = basicDetails.getActivityLogEntry("סטטוס");
    await expect(logEntry).toBeVisible({ timeout: 5_000 });

    // Hover log entry — trash button should NOT be visible for basic user
    await logEntry.hover();
    const trashBtn = logEntry.locator("button").filter({
      has: basicPage.locator("svg.lucide-trash-2"),
    }).first();
    await expect(trashBtn).not.toBeVisible({ timeout: 3_000 });

    await basicContext.close();
  });
});
