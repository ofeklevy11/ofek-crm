import { test, expect } from "@playwright/test";
import { TableDetailPage } from "./pages/TableDetailPage";
import fs from "fs";
import path from "path";

// Load seeded test data IDs
const META_PATH = path.join(__dirname, ".auth", ".e2e-meta.json");

function loadMeta() {
  if (!fs.existsSync(META_PATH)) {
    throw new Error("E2E meta file not found — did globalSetup run?");
  }
  return JSON.parse(fs.readFileSync(META_PATH, "utf-8")) as {
    companyId: number;
    table1Id: number;
    table2Id: number;
    table1Name: string;
    table2Name: string;
    table1Slug: string;
    table2Slug: string;
    categoryName: string;
  };
}

// ===========================================================================
// Table Detail Page — Happy Path
// ===========================================================================
test.describe("Table Detail Page — Happy Path", () => {
  test("shows table name, record count, and back link", async ({ page }) => {
    const meta = loadMeta();
    const detail = new TableDetailPage(page);
    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    await expect(detail.tableName).toHaveText(meta.table1Name);
    await expect(detail.recordCount).toBeVisible();
    await expect(detail.recordCount).toContainText("בסך הכל");
    await expect(detail.backLink).toBeVisible();
  });

  test("records are rendered in table rows", async ({ page }) => {
    const meta = loadMeta();
    const detail = new TableDetailPage(page);
    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    await expect(detail.recordTable).toBeVisible();
    const rows = detail.getRecordRows();
    // We seeded 5 records
    await expect(rows).toHaveCount(5);
  });

  test("search input filters records and updates URL with ?q=", async ({
    page,
  }) => {
    const meta = loadMeta();
    const detail = new TableDetailPage(page);
    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    await expect(detail.searchInput).toBeVisible();
    await detail.search("ישראל");
    await expect(page).toHaveURL(/q=/);

    // After search, only "ישראל ישראלי" should match from seeded data
    const rows = detail.getRecordRows();
    await expect(rows).toHaveCount(1);
  });

  test("back link navigates to /tables", async ({ page }) => {
    const meta = loadMeta();
    const detail = new TableDetailPage(page);
    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    await detail.navigateBack();
  });
});

// ===========================================================================
// Table Detail Page — Record Management
// ===========================================================================
test.describe("Table Detail Page — Record Management", () => {
  test("add record button opens dialog", async ({ page }) => {
    const meta = loadMeta();
    const detail = new TableDetailPage(page);
    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    await expect(detail.addRecordButton).toBeVisible();
    await detail.openAddRecordDialog();
    await expect(detail.addRecordDialog).toBeVisible();
    // Dialog title should contain table name
    await expect(detail.addRecordDialog.getByText(/רשומה חדשה/)).toBeVisible();
  });

  test("add record: full form flow — fill, submit, verify toast", async ({
    page,
  }) => {
    const meta = loadMeta();
    const detail = new TableDetailPage(page);
    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    await detail.openAddRecordDialog();

    // Fill the "שם מלא" field (uses getByPlaceholder("הזן שם מלא"))
    await detail.fillRecordField("שם מלא", "רשומת בדיקה E2E");

    // Fill email field
    await detail.fillRecordField("אימייל", "e2e-test@example.com");

    // Submit the record
    await detail.submitRecord();

    // Should show success toast
    await expect(page.getByText("הרשומה נוצרה בהצלחה")).toBeVisible({ timeout: 10_000 });

    // Dialog should close
    await expect(detail.addRecordDialog).not.toBeVisible({ timeout: 5_000 });
  });

  test("add record: empty form submission shows validation alert", async ({
    page,
  }) => {
    const meta = loadMeta();
    const detail = new TableDetailPage(page);
    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    await detail.openAddRecordDialog();

    // Submit without filling any fields
    await detail.submitRecord();

    // Should show validation alert about empty record (scoped to alertdialog)
    const alertDialog = page.getByRole("alertdialog");
    await expect(alertDialog.getByText(/לא ניתן להוסיף רשומה ריקה/)).toBeVisible({ timeout: 5_000 });
  });

  test("add record with ?new=true auto-opens dialog", async ({ page }) => {
    const meta = loadMeta();
    await page.goto(`/tables/${meta.table1Id}?new=true`);

    const detail = new TableDetailPage(page);
    await detail.waitForLoaded();

    // Dialog should auto-open
    await expect(detail.addRecordDialog).toBeVisible({ timeout: 10_000 });
    await expect(detail.addRecordDialog.getByText(/רשומה חדשה/)).toBeVisible();
  });

  test("bulk select records via checkboxes shows delete button", async ({
    page,
  }) => {
    const meta = loadMeta();
    const detail = new TableDetailPage(page);
    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    const checkboxes = detail.getRecordCheckboxes();
    const count = await checkboxes.count();
    expect(count).toBeGreaterThan(0);

    // Select first record
    await detail.selectRecord(0);

    // Bulk delete button should appear
    await expect(detail.bulkDeleteButton).toBeVisible();
  });

  test("bulk delete records with typed confirmation", async ({ page }) => {
    const meta = loadMeta();
    let capturedPayload: any = null;

    // Mock the bulk delete API to preserve seeded data
    await page.route("**/api/records/bulk", async (route) => {
      if (route.request().method() === "POST") {
        capturedPayload = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ deleted: capturedPayload?.recordIds?.length ?? 0 }),
        });
      } else {
        await route.continue();
      }
    });

    const detail = new TableDetailPage(page);
    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    const checkboxes = detail.getRecordCheckboxes();
    const initialCount = await checkboxes.count();
    expect(initialCount).toBeGreaterThan(0);

    // Select first two records
    await detail.selectRecord(0);
    if (initialCount > 1) {
      await detail.selectRecord(1);
    }

    // Click bulk delete
    await detail.bulkDeleteButton.click();

    // Destructive confirm dialog uses AlertDialog (role="alertdialog")
    const dialog = detail.getDestructiveDialog();
    await expect(dialog).toBeVisible();

    // Type confirmation phrase "מחק"
    const confirmInput = dialog.getByLabel("הקלד ביטוי אישור");
    await confirmInput.fill("מחק");

    // Click delete button
    const deleteBtn = dialog.getByRole("button", { name: "מחק" });
    await expect(deleteBtn).toBeEnabled();
    await deleteBtn.click();

    // Should show success toast
    await expect(page.getByText(/רשומות נמחקו בהצלחה/)).toBeVisible({ timeout: 10_000 });

    // Verify the payload contained record IDs
    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload).toHaveProperty("action", "delete");
    expect(capturedPayload).toHaveProperty("recordIds");
    expect(capturedPayload.recordIds.length).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// Table Detail Page — Permission-based UI
// ===========================================================================
test.describe("Table Detail Page — Permission-based UI", () => {
  test("basic user with read-only permission sees table but no add/settings buttons", async ({
    browser,
  }) => {
    const meta = loadMeta();
    const basicStoragePath = path.join(__dirname, ".auth", "basic.json");
    test.skip(!fs.existsSync(basicStoragePath), "basic.json not present");

    const context = await browser.newContext({
      storageState: basicStoragePath,
    });
    const page = await context.newPage();
    const detail = new TableDetailPage(page);

    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    // Should see the table name (has read permission)
    await expect(detail.tableName).toHaveText(meta.table1Name);

    // Should NOT see add record button or settings (no write permission)
    await expect(detail.addRecordButton).not.toBeVisible();
    await expect(detail.settingsButton).not.toBeVisible();

    await context.close();
  });

  test("basic user without table permission sees permission denied", async ({
    browser,
  }) => {
    const meta = loadMeta();
    const basicStoragePath = path.join(__dirname, ".auth", "basic.json");
    test.skip(!fs.existsSync(basicStoragePath), "basic.json not present");

    const context = await browser.newContext({
      storageState: basicStoragePath,
    });
    const page = await context.newPage();
    const detail = new TableDetailPage(page);

    // table2 has no permission set for basic user
    await detail.goto(meta.table2Id);

    // Should show permission denied or 404
    const permDenied = detail.permissionDenied;
    const notFound = page.getByText(/404|not found|לא נמצא/i);

    await expect(permDenied.or(notFound)).toBeVisible({ timeout: 10_000 });

    await context.close();
  });
});

// ===========================================================================
// API Integration — Real interactions
// ===========================================================================
test.describe("Table Detail — API Integration", () => {
  test("add record POST sends correct payload shape", async ({ page }) => {
    const meta = loadMeta();
    let capturedPayload: any = null;

    // Intercept record creation API
    await page.route(`**/api/tables/${meta.table1Id}/records`, async (route) => {
      if (route.request().method() === "POST") {
        capturedPayload = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: 9999, data: capturedPayload?.data || {} }),
        });
      } else {
        await route.continue();
      }
    });

    const detail = new TableDetailPage(page);
    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    await detail.openAddRecordDialog();
    await detail.fillRecordField("שם מלא", "Payload Test");
    await detail.submitRecord();

    // Wait for the toast to confirm the request was processed
    await expect(
      page.getByText("הרשומה נוצרה בהצלחה").or(page.getByText(/שגיאה/))
    ).toBeVisible({ timeout: 5_000 });

    // Verify payload was captured
    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload).toHaveProperty("data");
    expect(capturedPayload.data.fullName).toBe("Payload Test");
  });

  test("500 error on record create shows error feedback", async ({ page }) => {
    const meta = loadMeta();

    // Intercept with 500
    await page.route(`**/api/tables/${meta.table1Id}/records`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
      } else {
        await route.continue();
      }
    });

    const detail = new TableDetailPage(page);
    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    await detail.openAddRecordDialog();
    await detail.fillRecordField("שם מלא", "Error Test");
    await detail.submitRecord();

    // Should show error toast or error message
    await expect(page.getByText(/שגיאה|error|נכשל/i)).toBeVisible({ timeout: 10_000 });
  });

  test("429 rate limit on record create shows error feedback", async ({ page }) => {
    const meta = loadMeta();

    // Intercept with 429
    await page.route(`**/api/tables/${meta.table1Id}/records`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ error: "Too Many Requests" }),
        });
      } else {
        await route.continue();
      }
    });

    const detail = new TableDetailPage(page);
    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    await detail.openAddRecordDialog();
    await detail.fillRecordField("שם מלא", "Rate Limit Test");
    await detail.submitRecord();

    // Should show error toast about rate limit or general error
    await expect(page.getByText(/שגיאה|error|נכשל|rate|limit/i)).toBeVisible({ timeout: 10_000 });
  });
});

// ===========================================================================
// Export
// ===========================================================================
test.describe("Table Detail — Export", () => {
  test("export button is visible for admin and shows dropdown", async ({ page }) => {
    const meta = loadMeta();
    const detail = new TableDetailPage(page);
    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    // Select at least one record to enable the export button
    const checkboxes = detail.getRecordCheckboxes();
    const count = await checkboxes.count();
    expect(count).toBeGreaterThan(0);
    await detail.selectRecord(0);

    // Admin has canExport permission — export button should be visible
    const exportButton = page.getByRole("button", { name: /ייצוא נבחרים/ });
    await expect(exportButton).toBeVisible();

    // Click export and verify dropdown appears
    await exportButton.click();

    // Dropdown should show both export format options
    await expect(page.getByText("CSV (Excel)")).toBeVisible();
    await expect(page.getByText("TXT (Text)")).toBeVisible();
  });
});

// ===========================================================================
// Responsive Layout (Detail Page)
// ===========================================================================
test.describe("Table Detail — Responsive", () => {
  test("desktop layout shows full table", async ({ page }) => {
    const meta = loadMeta();
    await page.setViewportSize({ width: 1280, height: 720 });
    const detail = new TableDetailPage(page);
    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    await expect(detail.recordTable).toBeVisible();
  });

  test("mobile: export button shows disabled variant", async ({ page }) => {
    const meta = loadMeta();
    await page.setViewportSize({ width: 375, height: 667 });
    const detail = new TableDetailPage(page);
    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    // Select a record to trigger bulk action buttons
    const checkboxes = detail.getRecordCheckboxes();
    const count = await checkboxes.count();
    expect(count).toBeGreaterThan(0);
    await detail.selectRecord(0);

    // Mobile export button should be visible but disabled
    const mobileExport = detail.getExportMobileButton();
    await expect(mobileExport).toBeVisible();
    await expect(mobileExport).toBeDisabled();
  });

  test("mobile layout adapts gracefully", async ({ page }) => {
    const meta = loadMeta();
    await page.setViewportSize({ width: 375, height: 667 });
    const detail = new TableDetailPage(page);
    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    // Page should load without crashing
    await expect(detail.tableName).toBeVisible();
  });
});

// ===========================================================================
// Edge Cases (Detail Page)
// ===========================================================================
test.describe("Table Detail — Edge Cases", () => {
  test("refresh on /tables/[id] with search query preserves ?q= param", async ({
    page,
  }) => {
    const meta = loadMeta();
    const detail = new TableDetailPage(page);
    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    await detail.search("hello");

    // Reload the page
    await page.reload();
    expect(page.url()).toContain("q=hello");

    // Search input should retain the value
    await expect(detail.searchInput).toHaveValue("hello");
  });

  test("Hebrew text in search works correctly", async ({ page }) => {
    const meta = loadMeta();
    const detail = new TableDetailPage(page);
    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    await detail.search("בדיקה");
    await expect(page).toHaveURL(/q=/);
  });

  test("special characters in search don't break the page", async ({
    page,
  }) => {
    const meta = loadMeta();
    const detail = new TableDetailPage(page);
    await detail.goto(meta.table1Id);
    await detail.waitForLoaded();

    await detail.searchInput.fill("%_\\");
    // Page should remain functional
    await expect(detail.tableName).toBeVisible();
  });

  test("browser back from detail page returns to /tables", async ({
    page,
  }) => {
    const meta = loadMeta();
    // First navigate to /tables, then to detail
    await page.goto("/tables");
    await page.goto(`/tables/${meta.table1Id}`);
    const detail = new TableDetailPage(page);
    await detail.waitForLoaded();

    await page.goBack();
    await expect(page).toHaveURL(/\/tables$/);
  });

  test("/tables/999999 returns 404", async ({ page }) => {
    await page.goto("/tables/999999");
    await expect(page.getByText(/404|not found|לא נמצא/i)).toBeVisible();
  });

  test("/tables/abc returns 404", async ({ page }) => {
    await page.goto("/tables/abc");
    await expect(page.getByText(/404|not found|לא נמצא/i)).toBeVisible();
  });
});
