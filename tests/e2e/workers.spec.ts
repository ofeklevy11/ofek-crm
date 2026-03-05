import { test, expect } from "@playwright/test";
import { WorkersPage, WORKERS_TEXT } from "./pages/WorkersPage";
import { WorkerModalPO } from "./pages/WorkerModalPO";
import { DepartmentModalPO } from "./pages/DepartmentModalPO";
import {
  STORAGE_ADMIN,
  STORAGE_NO_TASKS,
  interceptAllServerActions,
} from "./helpers/test-utils";

test.use({ storageState: STORAGE_ADMIN });

// ─────────────────────────────────────────────────────────────────────
// Navigation & Page Load
// ─────────────────────────────────────────────────────────────────────

test.describe("Workers Module", () => {
  test.describe("Navigation & Page Load", () => {
    test("page loads at /workers with heading", async ({ page }) => {
      const wp = new WorkersPage(page);
      await wp.goto();
      await expect(wp.pageTitle).toBeVisible();
      await expect(wp.pageSubtitle).toBeVisible();
    });

    test("stat cards display correct numeric values", async ({ page }) => {
      const wp = new WorkersPage(page);
      await wp.goto();

      // Verify labels exist
      await expect(wp.statTotal).toBeVisible();
      await expect(wp.statActive).toBeVisible();

      // Verify actual numeric values (seeded: 2 total, 1 active, 1 onboarding, 1 dept)
      const totalValue = wp.getStatCardValue(WORKERS_TEXT.statTotal);
      await expect(totalValue).toHaveText("2");

      const activeValue = wp.getStatCardValue(WORKERS_TEXT.statActive);
      await expect(activeValue).toHaveText("1");

      const onboardingValue = wp.getStatCardValue(WORKERS_TEXT.statOnboarding);
      await expect(onboardingValue).toHaveText("1");

      const deptValue = wp.getStatCardValue(WORKERS_TEXT.statDepartments);
      await expect(deptValue).toHaveText("1");
    });

    test("all 3 tabs are visible", async ({ page }) => {
      const wp = new WorkersPage(page);
      await wp.goto();
      await expect(wp.tabWorkers).toBeVisible();
      await expect(wp.tabDepartments).toBeVisible();
      await expect(wp.tabOnboarding).toBeVisible();
    });

    test("search input and filters visible on workers tab", async ({
      page,
    }) => {
      const wp = new WorkersPage(page);
      await wp.goto();
      await expect(wp.searchInput).toBeVisible();
      await expect(wp.statusFilter).toBeVisible();
      await expect(wp.departmentFilter).toBeVisible();
    });

    test("filters hidden when switching to departments tab", async ({
      page,
    }) => {
      const wp = new WorkersPage(page);
      await wp.goto();
      await wp.clickTab(WORKERS_TEXT.tabDepartments);
      await expect(wp.searchInput).not.toBeVisible();
    });

    test("filters hidden when switching to onboarding tab", async ({
      page,
    }) => {
      const wp = new WorkersPage(page);
      await wp.goto();
      await wp.clickTab(WORKERS_TEXT.tabOnboarding);
      await expect(wp.searchInput).not.toBeVisible();
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Authentication & Authorization
  // ─────────────────────────────────────────────────────────────────────

  test.describe("Authentication & Authorization", () => {
    test("unauthenticated user redirected to /login", async ({ browser }) => {
      const context = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const page = await context.newPage();
      await page.goto("/workers");
      await expect(page).toHaveURL(/\/(login|$)/);
      await context.close();
    });

    test("user without canViewWorkers redirected to /", async ({ browser }) => {
      const context = await browser.newContext({
        storageState: STORAGE_NO_TASKS,
      });
      const page = await context.newPage();
      await page.goto("/workers");
      await expect(page).not.toHaveURL(/\/workers/, { timeout: 10_000 });
      await context.close();
    });

    test("admin user sees new worker button", async ({ page }) => {
      const wp = new WorkersPage(page);
      await wp.goto();
      await expect(wp.pageTitle).toBeVisible();
      // Admin-specific: the "new worker" button should be available
      await expect(
        page.locator("button").filter({ hasText: WORKERS_TEXT.newWorker }),
      ).toBeVisible();
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Workers Tab
  // ─────────────────────────────────────────────────────────────────────

  test.describe("Workers Tab", () => {
    test.describe("Workers List", () => {
      test("seeded workers displayed with name, status badge, department", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        // Worker 1: ישראל כהן
        await expect(page.getByText("ישראל כהן")).toBeVisible();
        await expect(page.getByText("בקליטה").first()).toBeVisible();
        await expect(page.getByText("מחלקת בדיקות").first()).toBeVisible();

        // Worker 2: דנה לוי
        await expect(page.getByText("דנה לוי")).toBeVisible();
      });

      test("worker row shows onboarding progress for ONBOARDING status", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        await expect(
          page.getByText("מסלול קליטה בדיקה").first(),
        ).toBeVisible();
      });

      test("expand worker row shows contact info with actual values", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        // Use PO method to expand
        await wp.expandWorkerRow("ישראל", "כהן");

        // Should show expanded content with contact info
        await expect(page.getByText("פרטי קשר")).toBeVisible();
        await expect(page.getByText("פרטי העסקה")).toBeVisible();

        // Verify actual contact values
        await expect(page.getByText("israel.cohen@test.com")).toBeVisible();
        await expect(page.getByText("050-1111111")).toBeVisible();
      });

      test("collapse expanded row hides details", async ({ page }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        // Expand using PO
        await wp.expandWorkerRow("ישראל", "כהן");
        await expect(page.getByText("פרטי קשר")).toBeVisible();

        // Collapse using PO
        await wp.collapseWorkerRow("ישראל", "כהן");
        await expect(page.getByText("פרטי קשר")).not.toBeVisible();
      });
    });

    test.describe("Search & Filter", () => {
      test("search by name filters workers correctly", async ({ page }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        await wp.searchWorker("ישראל");
        await expect(page.getByText("ישראל כהן")).toBeVisible();
        await expect(page.getByText("דנה לוי")).not.toBeVisible();
      });

      test("filter by status shows only matching workers", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        await wp.filterByStatus("ACTIVE");
        await expect(page.getByText("דנה לוי")).toBeVisible();
        await expect(page.getByText("ישראל כהן")).not.toBeVisible();
      });

      test("filter by department shows only matching workers (cross-department)", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        const suffix = Date.now();
        const newDeptName = `מחלקת פיתוח ${suffix}`;
        const newWorkerFirst = `פיתוח${suffix}`;
        const newWorkerLast = `טסט${suffix}`;

        // Create a second department
        await wp.clickTab(WORKERS_TEXT.tabDepartments);
        await wp.clickNewButton();
        const deptModal = new DepartmentModalPO(page);
        await deptModal.fillDepartmentForm({ name: newDeptName });
        await deptModal.submit();
        await expect(
          wp.getToast(WORKERS_TEXT.departmentCreated),
        ).toBeVisible({ timeout: 10_000 });

        // Create a worker in the new department
        await wp.clickTab(WORKERS_TEXT.tabWorkers);
        await wp.clickNewButton();
        const modal = new WorkerModalPO(page);
        await modal.fillWorkerForm({
          firstName: newWorkerFirst,
          lastName: newWorkerLast,
          departmentName: newDeptName,
        });
        await modal.submit();
        await expect(
          wp.getToast(WORKERS_TEXT.workerCreated),
        ).toBeVisible({ timeout: 10_000 });

        // Filter by "מחלקת בדיקות" → new worker should NOT be visible
        await wp.filterByDepartment("מחלקת בדיקות");
        await expect(page.getByText("ישראל כהן")).toBeVisible();
        await expect(
          page.getByText(`${newWorkerFirst} ${newWorkerLast}`),
        ).not.toBeVisible();

        // Filter by new department → ONLY new worker visible
        await wp.filterByDepartment(newDeptName);
        await expect(
          page.getByText(`${newWorkerFirst} ${newWorkerLast}`),
        ).toBeVisible();
        await expect(page.getByText("ישראל כהן")).not.toBeVisible();

        // Reset to all → all visible
        await wp.filterByDepartment(WORKERS_TEXT.allDepartments);
        await expect(page.getByText("ישראל כהן")).toBeVisible();
        await expect(
          page.getByText(`${newWorkerFirst} ${newWorkerLast}`),
        ).toBeVisible();
      });

      test("combined search + status filter", async ({ page }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        // Search "ישראל" + filter ONBOARDING → should find ישראל כהן
        await wp.searchWorker("ישראל");
        await wp.filterByStatus("ONBOARDING");
        await expect(page.getByText("ישראל כהן")).toBeVisible();

        // Search "ישראל" + filter ACTIVE → should find nothing
        await wp.filterByStatus("ACTIVE");
        await expect(page.getByText("ישראל כהן")).not.toBeVisible();
        await expect(
          page.getByText(WORKERS_TEXT.noFilterResults),
        ).toBeVisible();
      });

      test("clear search restores all workers", async ({ page }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        await wp.searchWorker("ישראל");
        await expect(page.getByText("דנה לוי")).not.toBeVisible();

        await wp.clearSearch();
        await expect(page.getByText("דנה לוי")).toBeVisible();
        await expect(page.getByText("ישראל כהן")).toBeVisible();
      });

      test('no results shows "לא נמצאו עובדים התואמים לסינון"', async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        await wp.searchWorker("שם_שלא_קיים_בכלל");
        await expect(
          page.getByText(WORKERS_TEXT.noFilterResults),
        ).toBeVisible();
      });
    });

    test.describe("Create Worker", () => {
      test('click "עובד חדש" opens modal with heading "עובד חדש"', async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        await wp.clickNewButton();
        const modal = new WorkerModalPO(page);
        await expect(modal.heading).toHaveText("עובד חדש");
      });

      test("status field not visible in create mode", async ({ page }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        await wp.clickNewButton();
        const modal = new WorkerModalPO(page);
        await expect(modal.heading).toHaveText("עובד חדש");

        // Status select should not be present in create mode
        await expect(modal.statusSelect).not.toBeVisible();
      });

      test("fill valid data and submit → toast success, worker appears", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        const suffix = Date.now();
        await wp.clickNewButton();
        const modal = new WorkerModalPO(page);

        await modal.fillWorkerForm({
          firstName: `בדיקה${suffix}`,
          lastName: `טסט${suffix}`,
          email: `test${suffix}@example.com`,
          departmentName: "מחלקת בדיקות",
        });
        await modal.submit();

        // Wait for toast using [data-sonner-toast]
        await expect(
          wp.getToast(WORKERS_TEXT.workerCreated),
        ).toBeVisible({ timeout: 10_000 });

        // Worker should appear in list
        await expect(
          page.getByText(`בדיקה${suffix} טסט${suffix}`),
        ).toBeVisible();
      });

      test("submit empty name → alert validation message", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        await wp.clickNewButton();
        const modal = new WorkerModalPO(page);

        await modal.firstNameInput.clear();
        await modal.lastNameInput.clear();
        await modal.submit();

        await expect(
          page.getByText(WORKERS_TEXT.alertNameRequired),
        ).toBeVisible({ timeout: 5_000 });
      });

      test("cancel closes modal without creating", async ({ page }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        await wp.clickNewButton();
        const modal = new WorkerModalPO(page);
        await expect(modal.heading).toBeVisible();

        await modal.cancel();
        await expect(modal.heading).not.toBeVisible();
      });

      test("pressing Escape closes modal", async ({ page }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        await wp.clickNewButton();
        const modal = new WorkerModalPO(page);
        await expect(modal.heading).toBeVisible();

        await page.keyboard.press("Escape");
        await expect(modal.heading).not.toBeVisible();
      });
    });

    test.describe("Edit Worker", () => {
      test('click menu → "עריכה" opens modal with heading "עריכת עובד"', async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        await wp.openWorkerMenu("ישראל", "כהן");
        await page.getByText(WORKERS_TEXT.edit).click();

        const modal = new WorkerModalPO(page);
        await expect(modal.heading).toHaveText("עריכת עובד");
      });

      test("form pre-filled with actual values", async ({ page }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        await wp.openWorkerMenu("ישראל", "כהן");
        await page.getByText(WORKERS_TEXT.edit).click();

        const modal = new WorkerModalPO(page);
        await modal.expectPrefilledWith({
          firstName: "ישראל",
          lastName: "כהן",
        });
      });

      test("status field visible in edit mode", async ({ page }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        await wp.openWorkerMenu("ישראל", "כהן");
        await page.getByText(WORKERS_TEXT.edit).click();

        const modal = new WorkerModalPO(page);
        await expect(modal.statusSelect).toBeVisible();
      });

      test("update name → toast success, list reflects changes (self-contained)", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        // Create a temporary worker to edit (avoid mutating seeded data)
        const suffix = Date.now();
        await wp.clickNewButton();
        const createModal = new WorkerModalPO(page);
        await createModal.fillWorkerForm({
          firstName: `לעריכה${suffix}`,
          lastName: `טסט${suffix}`,
          departmentName: "מחלקת בדיקות",
        });
        await createModal.submit();
        await expect(
          wp.getToast(WORKERS_TEXT.workerCreated),
        ).toBeVisible({ timeout: 10_000 });

        // Now edit the temporary worker
        await wp.openWorkerMenu(`לעריכה${suffix}`, `טסט${suffix}`);
        await page.getByText(WORKERS_TEXT.edit).click();

        const editModal = new WorkerModalPO(page);
        const newLastName = `נערך-${suffix}`;
        await editModal.lastNameInput.clear();
        await editModal.lastNameInput.fill(newLastName);
        await editModal.submit();

        await expect(
          wp.getToast(WORKERS_TEXT.workerUpdated),
        ).toBeVisible({ timeout: 10_000 });

        await expect(page.getByText(newLastName)).toBeVisible();
      });
    });

    test.describe("Delete Worker", () => {
      test('click menu → "מחיקה" shows destructive confirm dialog', async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        await wp.openWorkerMenu("ישראל", "כהן");
        await page.getByText(WORKERS_TEXT.delete).click();

        await expect(
          page.locator('[role="alertdialog"]'),
        ).toBeVisible();
        await expect(
          page.getByText("מחיקת עובד"),
        ).toBeVisible();
      });

      test("dismiss confirm → worker still in list", async ({ page }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        const workerName = "ישראל כהן";
        await expect(page.getByText(workerName)).toBeVisible();

        await wp.openWorkerMenu("ישראל", "כהן");
        await page.getByText(WORKERS_TEXT.delete).click();

        await wp.dismissDestructiveDelete();
        await expect(page.getByText(workerName)).toBeVisible();
      });

      test("confirm delete → toast success, worker removed (self-contained)", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        // Create a worker to delete (avoid deleting seeded workers)
        const suffix = Date.now();
        await wp.clickNewButton();
        const modal = new WorkerModalPO(page);
        await modal.fillWorkerForm({
          firstName: `למחיקה${suffix}`,
          lastName: `טסט${suffix}`,
          departmentName: "מחלקת בדיקות",
        });
        await modal.submit();
        await expect(
          wp.getToast(WORKERS_TEXT.workerCreated),
        ).toBeVisible({ timeout: 10_000 });

        // Now delete it using PO menu method
        const workerText = `למחיקה${suffix}`;
        await expect(page.getByText(workerText)).toBeVisible();

        await wp.openWorkerMenu(`למחיקה${suffix}`, `טסט${suffix}`);
        await page.getByText(WORKERS_TEXT.delete).click();

        await wp.confirmDestructiveDelete();

        await expect(
          wp.getToast(WORKERS_TEXT.workerDeleted),
        ).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText(workerText)).not.toBeVisible();
      });
    });

    test.describe("Worker Detail Navigation", () => {
      test('click menu → "צפייה" navigates to /workers/[id]', async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        await wp.openWorkerMenu("ישראל", "כהן");
        await page.getByText(WORKERS_TEXT.view).click();

        await expect(page).toHaveURL(/\/workers\/\d+/, { timeout: 10_000 });
      });
    });

    // ─────────────────────────────────────────────────────────────────────
    // Server Error Handling
    // ─────────────────────────────────────────────────────────────────────

    test.describe("Server Error Handling", () => {
      test("server error on create worker shows error toast", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        // Mock all server actions to return 500
        const cleanup = await interceptAllServerActions(
          page,
          async (route) => {
            await route.fulfill({
              status: 500,
              contentType: "text/plain",
              body: "Internal Server Error",
            });
          },
        );

        await wp.clickNewButton();
        const modal = new WorkerModalPO(page);
        await modal.fillWorkerForm({
          firstName: "שגיאה",
          lastName: "טסט",
          departmentName: "מחלקת בדיקות",
        });
        await modal.submit();

        // Error toast should appear
        await expect(
          page
            .locator("[data-sonner-toast]")
            .filter({ hasText: /שגיאה|error/i })
            .first(),
        ).toBeVisible({ timeout: 10_000 });

        // Modal should remain open for user retry
        await expect(modal.heading).toBeVisible();

        await cleanup();
      });

      test("server error on edit worker — toast error, modal stays open", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        // Create a temporary worker to edit
        const suffix = Date.now();
        await wp.clickNewButton();
        const createModal = new WorkerModalPO(page);
        await createModal.fillWorkerForm({
          firstName: `שגיאהערך${suffix}`,
          lastName: `טסט${suffix}`,
          departmentName: "מחלקת בדיקות",
        });
        await createModal.submit();
        await expect(
          wp.getToast(WORKERS_TEXT.workerCreated),
        ).toBeVisible({ timeout: 10_000 });

        // Open edit modal
        await wp.openWorkerMenu(`שגיאהערך${suffix}`, `טסט${suffix}`);
        await page.getByText(WORKERS_TEXT.edit).click();

        const editModal = new WorkerModalPO(page);
        await expect(editModal.heading).toHaveText("עריכת עובד");

        // Mock server actions to return 500
        const cleanup = await interceptAllServerActions(
          page,
          async (route) => {
            await route.fulfill({
              status: 500,
              contentType: "text/plain",
              body: "Internal Server Error",
            });
          },
        );

        // Change name and submit
        await editModal.lastNameInput.clear();
        await editModal.lastNameInput.fill(`נכשל${suffix}`);
        await editModal.submit();

        // Error toast should appear
        await expect(
          page
            .locator("[data-sonner-toast]")
            .filter({ hasText: /שגיאה|error/i })
            .first(),
        ).toBeVisible({ timeout: 10_000 });

        // Modal should remain open for user retry
        await expect(editModal.heading).toBeVisible();

        await cleanup();
      });

      test("server error on delete worker — worker remains in list", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();

        // Create a temporary worker first
        const suffix = Date.now();
        await wp.clickNewButton();
        const modal = new WorkerModalPO(page);
        await modal.fillWorkerForm({
          firstName: `שגיאהמחק${suffix}`,
          lastName: `טסט${suffix}`,
          departmentName: "מחלקת בדיקות",
        });
        await modal.submit();
        await expect(
          wp.getToast(WORKERS_TEXT.workerCreated),
        ).toBeVisible({ timeout: 10_000 });

        const workerText = `שגיאהמחק${suffix}`;
        await expect(page.getByText(workerText)).toBeVisible();

        // Now mock server actions to fail
        const cleanup = await interceptAllServerActions(
          page,
          async (route) => {
            await route.fulfill({
              status: 500,
              contentType: "text/plain",
              body: "Internal Server Error",
            });
          },
        );

        await wp.openWorkerMenu(`שגיאהמחק${suffix}`, `טסט${suffix}`);
        await page.getByText(WORKERS_TEXT.delete).click();
        await wp.confirmDestructiveDelete();

        // Error toast should appear
        await expect(
          page
            .locator("[data-sonner-toast]")
            .filter({ hasText: /שגיאה|error/i })
            .first(),
        ).toBeVisible({ timeout: 10_000 });

        await cleanup();

        // Worker should still be visible after failed delete
        await expect(page.getByText(workerText)).toBeVisible();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Departments Tab
  // ─────────────────────────────────────────────────────────────────────

  test.describe("Departments Tab", () => {
    test.describe("Departments List", () => {
      test("switch to departments tab shows department cards", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabDepartments);

        await expect(page.getByText("מחלקת בדיקות")).toBeVisible();
      });

      test("department card shows name, worker count, color header", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabDepartments);

        await expect(page.getByText("מחלקת בדיקות")).toBeVisible();
        await expect(page.getByText("2 עובדים")).toBeVisible();
        await expect(page.getByText("1 מסלולים")).toBeVisible();
      });
    });

    test.describe("Create Department", () => {
      test('click "מחלקה חדשה" opens modal', async ({ page }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabDepartments);

        await wp.clickNewButton();
        const modal = new DepartmentModalPO(page);
        await expect(modal.heading).toHaveText("מחלקה חדשה");
      });

      test("fill name and submit → toast success, card appears in list", async ({ page }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabDepartments);

        await wp.clickNewButton();
        const modal = new DepartmentModalPO(page);

        const suffix = Date.now();
        await modal.fillDepartmentForm({
          name: `מחלקת טסט ${suffix}`,
        });
        await modal.submit();

        await expect(
          wp.getToast(WORKERS_TEXT.departmentCreated),
        ).toBeVisible({ timeout: 10_000 });

        // Verify the new department card appears in the list
        await expect(page.getByText(`מחלקת טסט ${suffix}`)).toBeVisible();
      });

      test("submit empty name → alert validation", async ({ page }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabDepartments);

        await wp.clickNewButton();
        const modal = new DepartmentModalPO(page);
        await modal.nameInput.clear();
        await modal.submit();

        await expect(
          page.getByText(WORKERS_TEXT.alertDeptNameRequired),
        ).toBeVisible({ timeout: 5_000 });
      });
    });

    test.describe("Edit Department", () => {
      test('click menu → "עריכה" opens modal pre-filled', async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabDepartments);

        await wp.openDepartmentMenu("מחלקת בדיקות");
        await page.getByText(WORKERS_TEXT.edit).click();

        const modal = new DepartmentModalPO(page);
        await expect(modal.heading).toHaveText("עריכת מחלקה");
        await expect(modal.nameInput).not.toHaveValue("");
      });

      test("update and save → toast success (self-contained)", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabDepartments);

        // Create a new department to edit
        await wp.clickNewButton();
        const createModal = new DepartmentModalPO(page);
        const suffix = Date.now();
        await createModal.fillDepartmentForm({
          name: `לעריכה ${suffix}`,
        });
        await createModal.submit();
        await expect(
          wp.getToast(WORKERS_TEXT.departmentCreated),
        ).toBeVisible({ timeout: 10_000 });

        // Now edit it using PO menu method
        await wp.openDepartmentMenu(`לעריכה ${suffix}`);
        await page.getByText(WORKERS_TEXT.edit).click();

        const editModal = new DepartmentModalPO(page);
        await editModal.nameInput.clear();
        await editModal.nameInput.fill(`נערכה ${suffix}`);
        await editModal.submit();

        await expect(
          wp.getToast(WORKERS_TEXT.departmentUpdated),
        ).toBeVisible({ timeout: 10_000 });

        // Verify the updated name appears in the list
        await expect(page.getByText(`נערכה ${suffix}`)).toBeVisible();
      });
    });

    test.describe("Delete Department", () => {
      test("empty department: confirm delete → toast success (self-contained)", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabDepartments);

        // Create an empty department to delete
        await wp.clickNewButton();
        const modal = new DepartmentModalPO(page);
        const suffix = Date.now();
        await modal.fillDepartmentForm({ name: `למחיקה ${suffix}` });
        await modal.submit();
        await expect(
          wp.getToast(WORKERS_TEXT.departmentCreated),
        ).toBeVisible({ timeout: 10_000 });

        // Delete it using PO method
        await wp.openDepartmentMenu(`למחיקה ${suffix}`);
        await page.getByText(WORKERS_TEXT.delete).click();

        await wp.confirmDestructiveDelete();

        await expect(
          wp.getToast(WORKERS_TEXT.departmentDeleted),
        ).toBeVisible({ timeout: 10_000 });

        // Verify the department card is removed from the list
        await expect(page.getByText(`למחיקה ${suffix}`)).not.toBeVisible();
      });

      test("department with workers → alert about active workers", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabDepartments);

        await wp.openDepartmentMenu("מחלקת בדיקות");
        await page.getByText(WORKERS_TEXT.delete).click();

        await expect(
          page.getByText(WORKERS_TEXT.alertDeptHasWorkers).first(),
        ).toBeVisible({ timeout: 5_000 });
      });
    });

    test.describe("Server Error Handling", () => {
      test("server error on create department — toast error, modal stays open", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabDepartments);

        // Mock all server actions to return 500
        const cleanup = await interceptAllServerActions(
          page,
          async (route) => {
            await route.fulfill({
              status: 500,
              contentType: "text/plain",
              body: "Internal Server Error",
            });
          },
        );

        await wp.clickNewButton();
        const modal = new DepartmentModalPO(page);
        await modal.fillDepartmentForm({ name: "מחלקת שגיאה" });
        await modal.submit();

        // Error toast should appear
        await expect(
          page
            .locator("[data-sonner-toast]")
            .filter({ hasText: /שגיאה|error/i })
            .first(),
        ).toBeVisible({ timeout: 10_000 });

        // Modal should remain open for user retry
        await expect(modal.heading).toBeVisible();

        await cleanup();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Onboarding Paths Tab
  // ─────────────────────────────────────────────────────────────────────

  test.describe("Onboarding Paths Tab", () => {
    test.describe("Paths List", () => {
      test("switch to onboarding tab shows paths with step count", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabOnboarding);

        await expect(page.getByText("מסלול קליטה בדיקה")).toBeVisible();
        await expect(page.getByText(/2 שלבים/)).toBeVisible();
      });

      test('default path shows "ברירת מחדל" badge', async ({ page }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabOnboarding);

        await expect(
          page.getByText(WORKERS_TEXT.defaultBadge),
        ).toBeVisible();
      });

      test("expand path shows step list with type labels and required/optional badges", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabOnboarding);

        // Expand the path using PO method
        await wp.expandPath("מסלול קליטה בדיקה");

        // Step 1 (TRAINING → "הדרכה")
        await expect(
          page.getByText("שלב ראשון - הכרת המערכת"),
        ).toBeVisible();
        await expect(page.getByText("הדרכה").first()).toBeVisible();
        await expect(
          page.getByText(WORKERS_TEXT.required).first(),
        ).toBeVisible();

        // Step 2 (DOCUMENT → "מסמך", optional)
        await expect(
          page.getByText("שלב שני - מילוי מסמכים"),
        ).toBeVisible();
        await expect(page.getByText(WORKERS_TEXT.optional)).toBeVisible();
      });

      test("collapse expanded path hides step details", async ({ page }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabOnboarding);

        // Expand the path
        await wp.expandPath("מסלול קליטה בדיקה");
        await expect(
          page.getByText("שלב ראשון - הכרת המערכת"),
        ).toBeVisible();

        // Collapse the path
        await wp.collapsePath("מסלול קליטה בדיקה");
        await expect(
          page.getByText("שלב ראשון - הכרת המערכת"),
        ).not.toBeVisible();
      });
    });

    test.describe("Create Path", () => {
      test('click "מסלול חדש" opens path modal', async ({ page }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabOnboarding);

        await wp.clickNewButton();
        await expect(
          page.getByText(WORKERS_TEXT.createPathHeading).first(),
        ).toBeVisible({
          timeout: 5_000,
        });
      });

      test("create path with name → toast success, path appears in list (self-contained)", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabOnboarding);

        await wp.clickNewButton();
        await expect(
          page.getByText(WORKERS_TEXT.createPathHeading).first(),
        ).toBeVisible({ timeout: 5_000 });

        const suffix = Date.now();
        const pathNameInput = wp.getPathNameInput();
        await expect(pathNameInput).toBeVisible({ timeout: 3_000 });
        await pathNameInput.fill(`מסלול חדש ${suffix}`);

        await wp.getCreatePathButton().click();

        await expect(
          wp.getToast(WORKERS_TEXT.pathCreated),
        ).toBeVisible({ timeout: 10_000 });

        // Verify path appears in the list
        await expect(page.getByText(`מסלול חדש ${suffix}`)).toBeVisible();
      });
    });

    test.describe("Edit Path", () => {
      test("edit path: update name → toast success, list reflects changes (self-contained)", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabOnboarding);

        // Create a temporary path to edit
        await wp.clickNewButton();
        await expect(
          page.getByText(WORKERS_TEXT.createPathHeading).first(),
        ).toBeVisible({ timeout: 5_000 });

        const suffix = Date.now();
        const pathNameInput = wp.getPathNameInput();
        await expect(pathNameInput).toBeVisible({ timeout: 3_000 });
        await pathNameInput.fill(`מסלול לעריכה ${suffix}`);

        await wp.getCreatePathButton().click();

        await expect(
          wp.getToast(WORKERS_TEXT.pathCreated),
        ).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText(`מסלול לעריכה ${suffix}`)).toBeVisible({ timeout: 10_000 });

        // Open menu → click edit
        await wp.openPathMenu(`מסלול לעריכה ${suffix}`);
        await page.getByText(WORKERS_TEXT.edit).click();

        // Verify edit modal heading
        await expect(
          page.locator("h2").filter({ hasText: WORKERS_TEXT.editPathHeading }),
        ).toBeVisible({ timeout: 5_000 });

        // Update the path name
        const editNameInput = wp.getPathNameInput();
        await editNameInput.clear();
        await editNameInput.fill(`מסלול נערך ${suffix}`);

        // Submit the edit
        await wp.getSavePathButton().click();

        // Assert update toast
        await expect(
          wp.getToast(WORKERS_TEXT.pathUpdated),
        ).toBeVisible({ timeout: 10_000 });

        // Assert new name visible in list
        await expect(page.getByText(`מסלול נערך ${suffix}`)).toBeVisible();
      });
    });

    test.describe("Delete Path", () => {
      test("confirm delete → toast success (self-contained)", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabOnboarding);

        // Create a temporary path to delete, avoiding deleting the seeded path
        await wp.clickNewButton();
        await expect(
          page.getByText(WORKERS_TEXT.createPathHeading).first(),
        ).toBeVisible({ timeout: 5_000 });

        // Fill path name
        const suffix = Date.now();
        const pathNameInput = wp.getPathNameInput();
        await expect(pathNameInput).toBeVisible({ timeout: 3_000 });
        await pathNameInput.fill(`מסלול למחיקה ${suffix}`);

        // Submit the path creation form
        const createBtn = wp.getCreatePathButton();
        await expect(createBtn).toBeVisible({ timeout: 3_000 });
        await createBtn.click();

        // Assert path was created successfully before attempting deletion
        await expect(
          wp.getToast(WORKERS_TEXT.pathCreated),
        ).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText(`מסלול למחיקה ${suffix}`)).toBeVisible({ timeout: 10_000 });

        // Now delete: open menu on the newly created path
        await wp.openPathMenu(`מסלול למחיקה ${suffix}`);
        await page.getByText(WORKERS_TEXT.delete).click();

        await wp.confirmDestructiveDelete();

        await expect(
          wp.getToast(WORKERS_TEXT.pathDeleted),
        ).toBeVisible({ timeout: 10_000 });

        // Verify path is removed from the list
        await expect(page.getByText(`מסלול למחיקה ${suffix}`)).not.toBeVisible();
      });
    });

    test.describe("Path Validation", () => {
      test("submit path with empty name → alert path name required", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabOnboarding);

        await wp.clickNewButton();
        await expect(
          page.getByText(WORKERS_TEXT.createPathHeading).first(),
        ).toBeVisible({ timeout: 5_000 });

        // Clear name input and submit
        const pathNameInput = wp.getPathNameInput();
        await expect(pathNameInput).toBeVisible({ timeout: 3_000 });
        await pathNameInput.clear();

        await wp.getCreatePathButton().click();

        await expect(
          page.getByText(WORKERS_TEXT.alertPathNameRequired),
        ).toBeVisible({ timeout: 5_000 });
      });
    });

    test.describe("Server Error Handling", () => {
      test("server error on create path — toast error, modal stays open", async ({
        page,
      }) => {
        const wp = new WorkersPage(page);
        await wp.goto();
        await wp.clickTab(WORKERS_TEXT.tabOnboarding);

        // Mock all server actions to return 500
        const cleanup = await interceptAllServerActions(
          page,
          async (route) => {
            await route.fulfill({
              status: 500,
              contentType: "text/plain",
              body: "Internal Server Error",
            });
          },
        );

        await wp.clickNewButton();
        await expect(
          page.getByText(WORKERS_TEXT.createPathHeading).first(),
        ).toBeVisible({ timeout: 5_000 });

        const pathNameInput = wp.getPathNameInput();
        await expect(pathNameInput).toBeVisible({ timeout: 3_000 });
        await pathNameInput.fill("מסלול שגיאה");

        await wp.getCreatePathButton().click();

        // Error toast should appear
        await expect(
          page
            .locator("[data-sonner-toast]")
            .filter({ hasText: /שגיאה|error/i })
            .first(),
        ).toBeVisible({ timeout: 10_000 });

        // Modal should remain open for user retry
        await expect(
          page.getByText(WORKERS_TEXT.createPathHeading).first(),
        ).toBeVisible();

        await cleanup();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Form Validation
  // ─────────────────────────────────────────────────────────────────────

  test.describe("Form Validation", () => {
    test("submit worker without department → alert department required", async ({
      page,
    }) => {
      const wp = new WorkersPage(page);
      await wp.goto();

      await wp.clickNewButton();
      const modal = new WorkerModalPO(page);

      // Fill name fields but leave department as default ("בחר מחלקה")
      await modal.firstNameInput.fill("ללא");
      await modal.lastNameInput.fill("מחלקה");
      await modal.submit();

      await expect(
        page.getByText(WORKERS_TEXT.alertDeptRequired),
      ).toBeVisible({ timeout: 5_000 });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // New Button Label Per Tab
  // ─────────────────────────────────────────────────────────────────────

  test.describe("New Button Label Per Tab", () => {
    test("new button label changes per active tab", async ({ page }) => {
      const wp = new WorkersPage(page);
      await wp.goto();

      // Workers tab → "עובד חדש"
      await expect(
        page.locator("button").filter({ hasText: WORKERS_TEXT.newWorker }),
      ).toBeVisible();

      // Departments tab → "מחלקה חדשה"
      await wp.clickTab(WORKERS_TEXT.tabDepartments);
      await expect(
        page.locator("button").filter({ hasText: WORKERS_TEXT.newDepartment }),
      ).toBeVisible();

      // Onboarding tab → "מסלול חדש"
      await wp.clickTab(WORKERS_TEXT.tabOnboarding);
      await expect(
        page.locator("button").filter({ hasText: WORKERS_TEXT.newPath }),
      ).toBeVisible();
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Worker Detail Page Content
  // ─────────────────────────────────────────────────────────────────────

  test.describe("Worker Detail Page", () => {
    test("detail page shows worker name and department", async ({ page }) => {
      const wp = new WorkersPage(page);
      await wp.goto();

      await wp.openWorkerMenu("ישראל", "כהן");
      await page.getByText(WORKERS_TEXT.view).click();

      await expect(page).toHaveURL(/\/workers\/\d+/, { timeout: 10_000 });

      // Verify worker name and department are visible on detail page
      await expect(page.getByText("ישראל כהן")).toBeVisible();
      await expect(page.getByText("מחלקת בדיקות")).toBeVisible();
    });

    test("detail page shows contact info, status badge, and onboarding progress", async ({
      page,
    }) => {
      const wp = new WorkersPage(page);
      await wp.goto();

      await wp.openWorkerMenu("ישראל", "כהן");
      await page.getByText(WORKERS_TEXT.view).click();

      await expect(page).toHaveURL(/\/workers\/\d+/, { timeout: 10_000 });

      // Status badge
      await expect(page.getByText("בקליטה").first()).toBeVisible();

      // Contact info section
      await expect(page.getByText("פרטי קשר")).toBeVisible();
      await expect(page.getByText("israel.cohen@test.com")).toBeVisible();
      await expect(page.getByText("050-1111111")).toBeVisible();
      await expect(page.getByText("מס׳ עובד: EMP001")).toBeVisible();

      // Onboarding progress
      await expect(
        page.getByText("התקדמות קליטה").first(),
      ).toBeVisible();
      await expect(
        page.getByText(/\d+ מתוך \d+ שלבים הושלמו/),
      ).toBeVisible();
    });

    test("skip non-required step shows success toast", async ({ page }) => {
      const wp = new WorkersPage(page);
      await wp.goto();

      await wp.openWorkerMenu("ישראל", "כהן");
      await page.getByText(WORKERS_TEXT.view).click();
      await expect(page).toHaveURL(/\/workers\/\d+/, { timeout: 10_000 });

      // Step 2 ("שלב שני - מילוי מסמכים") is non-required and PENDING → has "דלג" (Skip) button
      await expect(page.getByText("שלב שני - מילוי מסמכים")).toBeVisible();

      // Click the "דלג" button for step 2
      await page.getByRole("button", { name: "דלג" }).click();

      // Verify success toast
      await expect(
        wp.getToast("השלב עודכן בהצלחה"),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("back link navigates to workers list", async ({ page }) => {
      const wp = new WorkersPage(page);
      await wp.goto();

      await wp.openWorkerMenu("ישראל", "כהן");
      await page.getByText(WORKERS_TEXT.view).click();
      await expect(page).toHaveURL(/\/workers\/\d+/, { timeout: 10_000 });

      // Click back link
      await page.getByText("חזרה לרשימת העובדים").click();
      await expect(page).toHaveURL(/\/workers$/, { timeout: 10_000 });
    });

    test("navigating to invalid worker ID shows 404", async ({ page }) => {
      await page.goto("/workers/999999");

      await expect(
        page.getByRole("heading", { name: "404 - דף לא נמצא" }),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByText("מצטערים, הדף שחיפשת אינו קיים."),
      ).toBeVisible();
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Responsive
  // ─────────────────────────────────────────────────────────────────────

  test.describe("Responsive", () => {
    test("mobile viewport: page loads, tabs visible", async ({ browser }) => {
      const context = await browser.newContext({
        storageState: STORAGE_ADMIN,
        viewport: { width: 375, height: 812 },
      });
      const page = await context.newPage();
      const wp = new WorkersPage(page);
      await wp.goto();

      await expect(wp.pageTitle).toBeVisible();
      await expect(wp.tabWorkers).toBeVisible();
      await expect(wp.tabDepartments).toBeVisible();
      await expect(wp.tabOnboarding).toBeVisible();

      await context.close();
    });

    test("onboarding progress column hidden on mobile", async ({
      browser,
    }) => {
      const context = await browser.newContext({
        storageState: STORAGE_ADMIN,
        viewport: { width: 375, height: 812 },
      });
      const page = await context.newPage();
      const wp = new WorkersPage(page);
      await wp.goto();

      // On mobile, the onboarding progress column (showing path progress) should be hidden
      // Check that the progress percentage in the worker row is not visible
      const workerRow = wp.getWorkerRow("ישראל", "כהן");
      await expect(workerRow.getByText(/\d+%/).first()).not.toBeVisible();

      await context.close();
    });
  });
});
