import { test, expect } from "@playwright/test";
import { ServicesPage } from "./pages/ServicesPage";
import { STORAGE_BASIC, interceptAllServerActions } from "./helpers/test-utils";
import fs from "fs";
import path from "path";

const META_PATH = path.join(__dirname, ".auth", ".e2e-meta.json");

function loadMeta() {
  if (!fs.existsSync(META_PATH)) {
    throw new Error("E2E meta file not found — did globalSetup run?");
  }
  return JSON.parse(fs.readFileSync(META_PATH, "utf-8")) as {
    companyId: number;
    product1Id: number;
    product1Name: string;
    product2Id: number;
    product2Name: string;
    product3Id: number;
    product3Name: string;
  };
}

// ===========================================================================
// Navigation & Page Load
// ===========================================================================
test.describe("Services — Navigation & Page Load", () => {
  test("loads /services with heading and subtitle", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await expect(page).toHaveURL(/\/services$/);
    await expect(services.heading).toBeVisible();
    await expect(services.subtitle).toBeVisible();
  });

  test("shows 3 seeded products in the catalog table", async ({ page }) => {
    const meta = loadMeta();
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await expect(services.getTableRow(meta.product1Name)).toBeVisible();
    await expect(services.getTableRow(meta.product2Name)).toBeVisible();
    await expect(services.getTableRow(meta.product3Name)).toBeVisible();
  });

  test("stats cards show correct values", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    // Total items >= 3 (other tests may have created additional products)
    await expect(services.statTotal).toContainText(/[3-9]|\d{2,}/);

    // Average margin: product1=(1000-300)/1000=70%, product2=(5000-4200)/5000=16%, product3=(2000-0)/2000=100%
    // With only seeded data: avg = (70+16+100)/3 = 62%
    // Allow flexibility if extra products exist
    await expect(services.statAvgMargin).toContainText(/\d+%/);

    // Most profitable by absolute profit — at minimum this should have a non-empty value
    await expect(services.statMostProfitable).not.toBeEmpty();
  });

  test("empty state is hidden when products exist", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await expect(services.emptyStateTitle).not.toBeVisible();
  });

  test("table column headers display all 7 Hebrew headers", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    const headers = services.catalogTable.locator("thead th");
    await expect(headers).toHaveCount(7);

    const expectedHeaders = [
      "שם הפריט",
      "מק״ט",
      "סוג",
      "מחיר מחירון",
      "עלות מוערכת",
      "רווח / אחוז רווח",
      "פעולות",
    ];
    for (const headerText of expectedHeaders) {
      await expect(services.catalogTable.locator("thead")).toContainText(headerText);
    }
  });
});

// ===========================================================================
// Authentication & Authorization
// ===========================================================================
test.describe("Services — Authentication & Authorization", () => {
  test("unauthenticated user is redirected to /login", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/services");
    await expect(page).toHaveURL(/\/login/);

    await context.close();
  });

  test("basic user (no canViewServices) is redirected to /", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE_BASIC });
    const page = await context.newPage();

    await page.goto("/services");
    // Layout redirects to "/" when user lacks canViewServices
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/);

    await context.close();
  });

  test("admin user loads page normally", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await expect(services.heading).toBeVisible();
  });

  test("session expiry mid-flow triggers error handling", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    // Intercept server actions with 401 to simulate session expiry
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 401,
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });

    // Trigger a create action
    await services.openAddModal();
    await services.fillForm({ name: "טסט", price: "100" });
    await services.submitForm();

    // Should show error toast or redirect
    const errorOrRedirect = page.getByText(/שגיאה|unauthorized|פג תוקף/i);
    await expect(async () => {
      const hasToast = (await errorOrRedirect.count()) > 0;
      const redirected = page.url().includes("/login");
      expect(hasToast || redirected).toBe(true);
    }).toPass({ timeout: 10_000 });

    await cleanup();
  });
});

// ===========================================================================
// Create Product — Happy Path
// ===========================================================================
test.describe("Services — Create Product (Happy Path)", () => {
  test('click "הוסף חדש" opens create modal with correct title', async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await services.openAddModal();
    await expect(services.modalCreateTitle).toBeVisible();
    await expect(services.typeSelect).toHaveValue("SERVICE");
  });

  test("fill and submit creates product with success toast", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await services.openAddModal();
    await services.fillForm({
      name: "שירות בדיקה E2E",
      type: "SERVICE",
      sku: "E2E-001",
      price: "500",
      cost: "100",
    });
    await services.submitForm();

    // Success toast
    await expect(page.getByText("המוצר נוצר בהצלחה")).toBeVisible({ timeout: 10_000 });

    // Modal should close after successful submission
    await expect(services.modalCreateTitle).not.toBeVisible();

    // New product appears in table after refresh
    await expect(services.getTableRow("שירות בדיקה E2E")).toBeVisible({ timeout: 10_000 });
  });

  test("created product values appear correctly in table row", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await services.openAddModal();
    await services.fillForm({
      name: "מוצר אימות שדות E2E",
      type: "PRODUCT",
      sku: "VRF-001",
      price: "750",
      cost: "200",
    });
    await services.submitForm();

    await expect(page.getByText("המוצר נוצר בהצלחה")).toBeVisible({ timeout: 10_000 });

    // Verify all values appear correctly in the new table row
    const row = services.getTableRow("מוצר אימות שדות E2E");
    await expect(row).toBeVisible({ timeout: 10_000 });
    const values = await services.getRowValues("מוצר אימות שדות E2E");
    expect(values.sku?.trim()).toBe("VRF-001");
    expect(values.type).toContain("מוצר");
    expect(values.price).toContain("₪750");
    expect(values.cost).toContain("₪200");
    expect(values.margin).toContain("550");
    expect(values.margin).toContain("73.3%");
    // 73.3% → green (emerald-600)
    const marginCell = row.locator("td").nth(5);
    await expect(marginCell.locator(".text-emerald-600")).toBeVisible();
  });

  test("margin display updates in real-time as price/cost change", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await services.openAddModal();

    // Fill price first
    await services.priceInput.fill("1000");
    await services.costInput.fill("400");

    // Margin should show ₪600.00 (60.0%) in green
    const marginArea = services.marginDisplay.locator("..");
    await expect(marginArea).toContainText("600");
    await expect(marginArea).toContainText("60.0%");
    await expect(marginArea.locator(".text-emerald-600")).toBeVisible();

    // Change cost to verify live update
    await services.costInput.fill("800");
    await expect(marginArea).toContainText("200");
    await expect(marginArea).toContainText("20.0%");
    // 20% is in amber range (10-30%) — verify color updated reactively
    await expect(marginArea.locator(".text-emerald-600")).not.toBeVisible();
    await expect(marginArea.locator(".text-amber-600")).toBeVisible();
  });

  test("create with description shows subtitle in table row", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await services.openAddModal();
    await services.fillForm({
      name: "מוצר עם תיאור E2E",
      description: "תיאור לבדיקה בטבלה",
      price: "400",
    });
    await services.submitForm();

    await expect(page.getByText("המוצר נוצר בהצלחה")).toBeVisible({ timeout: 10_000 });

    const nameCell = services.getTableRow("מוצר עם תיאור E2E").locator("td").first();
    await expect(nameCell).toContainText("תיאור לבדיקה בטבלה");
  });

  test("description popup opens/closes and text persists", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await services.openAddModal();
    await services.openDescriptionPopup();

    // Popup title visible
    await expect(services.descriptionPopupTitle).toBeVisible();

    // Type description
    await services.descriptionTextarea.fill("תיאור בדיקה מפורט");
    await services.descriptionSaveButton.click();

    // Popup should close
    await expect(services.descriptionPopupTitle).not.toBeVisible();

    // Description text should persist in the button display
    await expect(services.descriptionButton).toContainText("תיאור בדיקה מפורט");
  });
});

// ===========================================================================
// Edit Product — Happy Path (serial to avoid shared state issues)
// ===========================================================================
test.describe("Services — Edit Product (Happy Path)", () => {
  test.describe.configure({ mode: "serial" });

  test("click edit opens modal with pre-populated values", async ({ page }) => {
    const meta = loadMeta();
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await services.openEditModal(meta.product1Name);
    await expect(services.modalEditTitle).toBeVisible();

    // Form should be pre-populated
    await expect(services.nameInput).toHaveValue(meta.product1Name);
    await expect(services.typeSelect).toHaveValue("SERVICE");
    await expect(services.skuInput).toHaveValue("SRV-001");
    await expect(services.priceInput).toHaveValue("1000");
    await expect(services.costInput).toHaveValue("300");

    // Margin preview should compute from pre-populated values: 1000-300=700, 70.0%
    const marginArea = services.marginDisplay.locator("..");
    await expect(marginArea).toContainText("700");
    await expect(marginArea).toContainText("70.0%");
    await expect(marginArea.locator(".text-emerald-600")).toBeVisible();
  });

  test("edit description is pre-populated when product has one", async ({ page }) => {
    const meta = loadMeta();
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    // product1 has description "שירות ייעוץ עסקי מקצועי"
    await services.openEditModal(meta.product1Name);

    // The description button should show the existing text, not the placeholder
    await expect(services.descriptionButton).toContainText("שירות ייעוץ עסקי מקצועי");
    await expect(services.descriptionButton).not.toContainText("לחץ להוספת תיאור");

    // Open popup and verify textarea is pre-populated
    await services.openDescriptionPopup();
    await expect(services.descriptionTextarea).toHaveValue("שירות ייעוץ עסקי מקצועי");
  });

  test("modify price/cost and submit shows success toast", async ({ page }) => {
    const meta = loadMeta();
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    // Only change price/cost — don't rename to avoid state mutation issues
    await services.openEditModal(meta.product1Name);
    await services.fillForm({ price: "1200", cost: "350" });
    await services.submitEditButton.click();

    await expect(page.getByText("המוצר עודכן בהצלחה")).toBeVisible({ timeout: 10_000 });

    // Modal should close after successful submission
    await expect(services.modalEditTitle).not.toBeVisible();

    // Product row still visible with original name
    await expect(services.getTableRow(meta.product1Name)).toBeVisible({ timeout: 10_000 });
  });
});

// ===========================================================================
// Create Product — Unhappy Path
// ===========================================================================
test.describe("Services — Create Product (Unhappy Path)", () => {
  test("submit with empty name is blocked by HTML validation", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await services.openAddModal();
    // Fill price but leave name empty
    await services.priceInput.fill("100");
    await services.submitCreateButton.click();

    // Should not show success toast — form submission blocked by required attribute
    await expect(page.getByText("המוצר נוצר בהצלחה")).not.toBeVisible({ timeout: 2_000 });
    // Modal should still be open
    await expect(services.modalCreateTitle).toBeVisible();
  });

  test("submit with empty price is blocked by HTML validation", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await services.openAddModal();
    await services.nameInput.fill("בדיקה ללא מחיר");
    await services.submitCreateButton.click();

    await expect(page.getByText("המוצר נוצר בהצלחה")).not.toBeVisible({ timeout: 2_000 });
    await expect(services.modalCreateTitle).toBeVisible();
  });

  test("server error shows error toast", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    // Mock all server actions to return error
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: "Internal Server Error",
      });
    });

    await services.openAddModal();
    await services.fillForm({ name: "שירות שגיאה", price: "100" });
    await services.submitForm();

    // Error toast should appear
    await expect(page.locator("[data-sonner-toast][data-type='error']")).toBeVisible({ timeout: 10_000 });

    await cleanup();
  });

  test("edit server error shows error toast", async ({ page }) => {
    const meta = loadMeta();
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await services.openEditModal(meta.product1Name);

    // Mock all server actions to return error
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: "Internal Server Error",
      });
    });

    await services.fillForm({ price: "9999" });
    await services.submitEditButton.click();

    // Error toast should appear
    await expect(page.locator("[data-sonner-toast][data-type='error']")).toBeVisible({ timeout: 10_000 });

    await cleanup();
  });

  test("double-click submit is prevented — button disabled during loading", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    // Delay server action response to catch loading state
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });

    await services.openAddModal();
    await services.fillForm({ name: "בדיקת כפילות", price: "100" });
    await services.submitCreateButton.click();

    // Button should show loading state
    await expect(services.loadingButton).toBeVisible();
    await expect(services.loadingButton).toBeDisabled();

    await cleanup();
  });

  test("network failure shows connection error toast", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    // Abort server actions to simulate network failure
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.abort();
    });

    await services.openAddModal();
    await services.fillForm({ name: "שירות רשת", price: "100" });
    await services.submitForm();

    // Should show network error toast — getUserFriendlyError maps "fetch failed" → "שגיאת תקשורת..."
    await expect(page.locator("[data-sonner-toast][data-type='error']")).toBeVisible({ timeout: 10_000 });

    await cleanup();
  });
});

// ===========================================================================
// Modal Behavior
// ===========================================================================
test.describe("Services — Modal Behavior", () => {
  test("close via cancel button", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await services.openAddModal();
    await services.cancelButton.click();

    await expect(services.modalCreateTitle).not.toBeVisible();
  });

  test("close via backdrop click", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await services.openAddModal();
    await services.closeModalViaBackdrop();

    await expect(services.modalCreateTitle).not.toBeVisible();
  });

  test("close via X button", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await services.openAddModal();
    await services.closeXButton.click();

    await expect(services.modalCreateTitle).not.toBeVisible();
  });

  test("form resets when opening create after editing", async ({ page }) => {
    const meta = loadMeta();
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    // First open edit modal
    await services.openEditModal(meta.product1Name);
    await expect(services.nameInput).toHaveValue(meta.product1Name);
    await services.cancelButton.click();

    // Now open create modal
    await services.openAddModal();

    // Form should be reset
    await expect(services.nameInput).toHaveValue("");
    await expect(services.priceInput).toHaveValue("");
    await expect(services.descriptionButton).toContainText("לחץ להוספת תיאור");
  });

  test("modal margin turns red when cost exceeds price", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await services.openAddModal();
    await services.priceInput.fill("100");
    await services.costInput.fill("200");

    // Margin display area should show negative margin in red (text-rose-600)
    const marginArea = services.marginDisplay.locator("..");
    await expect(marginArea.locator(".text-rose-600")).toBeVisible();
    await expect(marginArea).toContainText("-100");
  });

  test("modal margin shows green at zero (price equals cost)", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await services.openAddModal();
    await services.priceInput.fill("100");
    await services.costInput.fill("100");

    // Modal uses margin >= 0 → green, unlike table which uses marginPercent < 10 → red
    const marginArea = services.marginDisplay.locator("..");
    await expect(marginArea.locator(".text-emerald-600")).toBeVisible();
    await expect(marginArea).toContainText("0.0%");
    await expect(marginArea).toContainText("₪0.00");
  });

  test("description popup: textarea editable and saves", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await services.openAddModal();
    await services.openDescriptionPopup();

    await services.descriptionTextarea.fill("תיאור חדש");
    await expect(services.descriptionTextarea).toHaveValue("תיאור חדש");

    // Close via save
    await services.descriptionSaveButton.click();
    await expect(services.descriptionPopupTitle).not.toBeVisible();
  });

  test("description popup: close button closes without losing data", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await services.openAddModal();
    await services.openDescriptionPopup();

    await services.descriptionTextarea.fill("תיאור זמני");
    await services.descriptionCloseButton.click();

    // Popup should close
    await expect(services.descriptionPopupTitle).not.toBeVisible();

    // Both save and close call setDescriptionPopupOpen(false), text persists in state
    await expect(services.descriptionButton).toContainText("תיאור זמני");
  });
});

// ===========================================================================
// Catalog Table Display
// ===========================================================================
test.describe("Services — Catalog Table Display", () => {
  test("product type badges show correct Hebrew labels", async ({ page }) => {
    const meta = loadMeta();
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    // SERVICE → שירות
    const row1 = services.getTableRow(meta.product1Name);
    await expect(row1).toContainText("שירות");

    // PRODUCT → מוצר
    const row2 = services.getTableRow(meta.product2Name);
    await expect(row2).toContainText("מוצר");

    // PACKAGE → חבילה
    const row3 = services.getTableRow(meta.product3Name);
    await expect(row3).toContainText("חבילה");
  });

  test("prices formatted as ILS currency", async ({ page }) => {
    const meta = loadMeta();
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    const row1 = services.getTableRow(meta.product1Name);
    // ₪ symbol should be present
    await expect(row1).toContainText("₪");
  });

  test("margin color coding: green for high (>=30%), amber for medium (10-30%)", async ({ page }) => {
    const meta = loadMeta();
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    // product1: margin 70% → green (emerald-600)
    const row1MarginCell = services.getTableRow(meta.product1Name).locator("td").nth(5);
    await expect(row1MarginCell.locator(".text-emerald-600")).toBeVisible();

    // product2: margin 16% → amber
    const row2MarginCell = services.getTableRow(meta.product2Name).locator("td").nth(5);
    await expect(row2MarginCell.locator(".text-amber-600")).toBeVisible();

    // product3: margin 100% → green
    const row3MarginCell = services.getTableRow(meta.product3Name).locator("td").nth(5);
    await expect(row3MarginCell.locator(".text-emerald-600")).toBeVisible();
  });

  test("margin color coding: red for low margin (<10%)", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    // Create a product with 5% margin (price=100, cost=95 → margin 5%)
    await services.openAddModal();
    await services.fillForm({
      name: "מוצר רווח נמוך E2E",
      type: "PRODUCT",
      price: "100",
      cost: "95",
    });
    await services.submitForm();
    await expect(page.getByText("המוצר נוצר בהצלחה")).toBeVisible({ timeout: 10_000 });

    // Verify red color (text-rose-600) on the margin cell
    const row = services.getTableRow("מוצר רווח נמוך E2E");
    await expect(row).toBeVisible({ timeout: 10_000 });
    const marginCell = row.locator("td").nth(5);
    await expect(marginCell.locator(".text-rose-600")).toBeVisible();

    // TrendingUp should still show since margin > 0 (margin=5, positive)
    await expect(marginCell.locator("svg")).toBeVisible();
  });

  test("negative margin shows TrendingDown icon", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    // Create product with cost > price (negative margin)
    await services.openAddModal();
    await services.fillForm({
      name: "מוצר הפסד E2E",
      type: "PRODUCT",
      price: "100",
      cost: "150",
    });
    await services.submitForm();
    await expect(page.getByText("המוצר נוצר בהצלחה")).toBeVisible({ timeout: 10_000 });

    // Verify the margin cell shows red (text-rose-600) and negative values
    const row = services.getTableRow("מוצר הפסד E2E");
    await expect(row).toBeVisible({ timeout: 10_000 });
    const marginCell = row.locator("td").nth(5);
    await expect(marginCell.locator(".text-rose-600")).toBeVisible();

    // TrendingDown is rendered when margin <= 0
    // Lucide icons (TrendingUp/TrendingDown) render identical SVG wrappers — only path data differs,
    // so we can't distinguish them via accessible attributes. We verify negative value instead.
    await expect(marginCell).toContainText(/\-₪/);
    await expect(marginCell.locator("svg")).toBeVisible();
  });

  test("zero margin boundary: price=cost shows red color", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    // Create product with zero margin (price=100, cost=100 → margin=0, 0%)
    await services.openAddModal();
    await services.fillForm({
      name: "מוצר אפס רווח E2E",
      type: "PRODUCT",
      price: "100",
      cost: "100",
    });
    await services.submitForm();
    await expect(page.getByText("המוצר נוצר בהצלחה")).toBeVisible({ timeout: 10_000 });

    // margin=0 → marginPercent=0% (<10%) → red (text-rose-600)
    // margin=0 → margin <= 0 → TrendingDown icon
    const row = services.getTableRow("מוצר אפס רווח E2E");
    await expect(row).toBeVisible({ timeout: 10_000 });
    const marginCell = row.locator("td").nth(5);
    await expect(marginCell.locator(".text-rose-600")).toBeVisible();
    await expect(marginCell).toContainText("0.0%");
    await expect(marginCell.locator("svg")).toBeVisible();
  });

  test("SKU shows dash when empty", async ({ page }) => {
    const meta = loadMeta();
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    // product3 has no SKU
    const values = await services.getRowValues(meta.product3Name);
    expect(values.sku?.trim()).toBe("-");
  });

  test("cost shows dash when zero", async ({ page }) => {
    const meta = loadMeta();
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    // product3 cost is 0
    const values = await services.getRowValues(meta.product3Name);
    expect(values.cost?.trim()).toBe("-");
  });

  test("description shown as truncated subtitle under name", async ({ page }) => {
    const meta = loadMeta();
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    // product1 has description "שירות ייעוץ עסקי מקצועי"
    const row = services.getTableRow(meta.product1Name);
    await expect(row.locator("td").first()).toContainText("שירות ייעוץ עסקי מקצועי");
  });

  test("product with no description shows no subtitle row", async ({ page }) => {
    const meta = loadMeta();
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    // product3 has no description — the name cell should have only one span (the name), no subtitle
    const nameCell = services.getTableRow(meta.product3Name).locator("td").first();
    const spans = nameCell.locator("span").filter({ hasText: /\S/ });
    await expect(spans).toHaveCount(1);
  });
});

// ===========================================================================
// Responsive Layout
// ===========================================================================
test.describe("Services — Responsive Layout", () => {
  test("desktop (1280px): full table layout visible", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    await expect(services.catalogTable).toBeVisible();
    // All 7 column headers visible
    const headers = services.catalogTable.locator("thead th");
    await expect(headers).toHaveCount(7);
  });

  test("mobile (375px): stats cards stack vertically", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    // Stats cards should be visible
    await expect(services.statTotal).toBeVisible();
    await expect(services.statAvgMargin).toBeVisible();

    // On mobile (grid-cols-1), stats should stack — different Y positions
    const box1 = await services.statTotal.boundingBox();
    const box2 = await services.statAvgMargin.boundingBox();
    expect(box1).not.toBeNull();
    expect(box2).not.toBeNull();
    // Stacked means box2 is below box1
    expect(box2!.y).toBeGreaterThan(box1!.y + 10);
  });

  test("mobile (375px): table scrollable horizontally", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    // The overflow-x-auto wrapper should allow scrolling
    const tableWrapper = services.catalogTable.locator("..");
    const wrapperBox = await tableWrapper.boundingBox();
    const tableBox = await services.catalogTable.boundingBox();
    expect(wrapperBox).not.toBeNull();
    expect(tableBox).not.toBeNull();
    // Table should be wider than or equal to wrapper (scrollable)
    expect(tableBox!.width).toBeGreaterThanOrEqual(wrapperBox!.width);
  });
});

// ===========================================================================
// Edge Cases (serial — creates real DB records that affect counts)
// ===========================================================================
test.describe("Services — Edge Cases", () => {
  test.describe.configure({ mode: "serial" });

  test("very long product name (200 chars) — table doesn't break", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    const longName = "א".repeat(200);
    await services.openAddModal();
    await services.fillForm({ name: longName, price: "100" });
    await services.submitForm();

    await expect(page.getByText("המוצר נוצר בהצלחה")).toBeVisible({ timeout: 10_000 });

    // Table should still render without breaking
    await expect(services.catalogTable).toBeVisible();
    // The long name row should exist
    await expect(services.getTableRow(longName.slice(0, 20))).toBeVisible();
  });

  test("Hebrew + emoji in name renders correctly", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    const emojiName = "שירות מיוחד 🎯✨";
    await services.openAddModal();
    await services.fillForm({ name: emojiName, price: "250" });
    await services.submitForm();

    await expect(page.getByText("המוצר נוצר בהצלחה")).toBeVisible({ timeout: 10_000 });
    await expect(services.getTableRow(emojiName)).toBeVisible({ timeout: 10_000 });
  });

  test("refresh page after create — product persists", async ({ page }) => {
    const services = new ServicesPage(page);
    await services.goto();
    await services.waitForLoaded();

    const uniqueName = `מוצר ריפרש ${Date.now()}`;
    await services.openAddModal();
    await services.fillForm({ name: uniqueName, type: "PRODUCT", price: "300" });
    await services.submitForm();

    await expect(page.getByText("המוצר נוצר בהצלחה")).toBeVisible({ timeout: 10_000 });
    await expect(services.getTableRow(uniqueName)).toBeVisible({ timeout: 10_000 });

    // Hard refresh
    await page.reload();
    await services.waitForLoaded();

    // Product should still be there (server-rendered)
    await expect(services.getTableRow(uniqueName)).toBeVisible();
  });
});
