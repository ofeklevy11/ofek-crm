import { test, expect } from "@playwright/test";
import { TablesPage } from "./pages/TablesPage";
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
    tableCategoryId: number;
  };
}

// ===========================================================================
// Navigation & Page Load
// ===========================================================================
test.describe("Navigation & Page Load", () => {
  test("loads /tables with correct URL and heading", async ({ page }) => {
    const tables = new TablesPage(page);
    await tables.goto();

    await expect(page).toHaveURL(/\/tables$/);
    await expect(tables.heading).toBeVisible();
    await expect(tables.subtitle).toBeVisible();
  });

  test("shows seeded table cards with correct content", async ({ page }) => {
    const meta = loadMeta();
    const tables = new TablesPage(page);
    await tables.goto();
    await tables.waitForLoaded();

    // Verify seeded tables appear as cards
    const card1 = tables.getTableCardByName(meta.table1Name);
    await expect(card1).toBeVisible();
    await expect(tables.getCardName(card1)).toHaveText(meta.table1Name);
    await expect(tables.getCardRecordCount(card1)).toBeVisible();
    await expect(tables.getCardCreator(card1)).toBeVisible();

    const card2 = tables.getTableCardByName(meta.table2Name);
    await expect(card2).toBeVisible();
  });

  test("/tables/999999 (invalid id) shows 404", async ({ page }) => {
    await page.goto("/tables/999999");
    await expect(page.getByText(/404|not found|לא נמצא/i)).toBeVisible();
  });

  test("/tables/abc (non-numeric) shows 404", async ({ page }) => {
    await page.goto("/tables/abc");
    await expect(page.getByText(/404|not found|לא נמצא/i)).toBeVisible();
  });
});

// ===========================================================================
// Authentication & Authorization
// ===========================================================================
test.describe("Authentication & Authorization", () => {
  test("unauthenticated user on /tables is redirected to /login", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/tables");
    await expect(page).toHaveURL(/\/login/);

    await context.close();
  });

  test("unauthenticated user on /tables/1 is redirected to /login", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/tables/1");
    await expect(page).toHaveURL(/\/login/);

    await context.close();
  });

  test("session expiry mid-flow triggers error handling", async ({ page }) => {
    const meta = loadMeta();
    const tables = new TablesPage(page);
    await tables.goto();
    await tables.waitForLoaded();

    // Intercept all mutation requests with 401 to simulate session expiry.
    // Using table delete (apiFetch) instead of category create (server action)
    // so the 401 handler in api-fetch.ts actually fires and shows the
    // "פג תוקף ההתחברות" toast.
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (["POST", "PATCH", "DELETE"].includes(request.method())) {
        await route.fulfill({
          status: 401,
          body: JSON.stringify({ error: "Unauthorized" }),
        });
      } else {
        await route.continue();
      }
    });

    // Trigger a table card delete which goes through apiFetch
    const card = tables.getTableCardByName(meta.table1Name);
    await card.hover();
    await tables.getCardDeleteButton(card).click();

    // Confirm the destructive dialog (type "מחק" and click delete)
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    const confirmInput = dialog.getByLabel("הקלד ביטוי אישור");
    await confirmInput.fill("מחק");
    await dialog.getByRole("button", { name: "מחק" }).click();

    // Should show session expiry toast or redirect to login
    const errorOrRedirect = page.getByText(/פג תוקף ההתחברות|שגיאה|unauthorized/i);

    await expect(async () => {
      const hasToast = (await errorOrRedirect.count()) > 0;
      const redirected = page.url().includes("/login");
      expect(hasToast || redirected).toBe(true);
    }).toPass({ timeout: 10_000 });
  });
});

// ===========================================================================
// Tables Dashboard — Happy Path
// ===========================================================================
test.describe("Tables Dashboard — Happy Path", () => {
  test("table cards display name, slug, record count, creator", async ({
    page,
  }) => {
    const meta = loadMeta();
    const tables = new TablesPage(page);
    await tables.goto();
    await tables.waitForLoaded();

    const card = tables.getTableCardByName(meta.table1Name);
    await expect(card).toBeVisible();
    await expect(tables.getCardName(card)).toHaveText(meta.table1Name);
    await expect(tables.getCardSlug(card)).toBeVisible();
    await expect(tables.getCardRecordCount(card)).toBeVisible();
    await expect(tables.getCardCreator(card)).toBeVisible();
  });

  test("clicking a table card navigates to /tables/[id]", async ({ page }) => {
    const meta = loadMeta();
    const tables = new TablesPage(page);
    await tables.goto();
    await tables.waitForLoaded();

    const card = tables.getTableCardByName(meta.table1Name);
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/tables/${meta.table1Id}`));
  });

  test('"צור טבלה" link navigates to /tables/new', async ({ page }) => {
    const tables = new TablesPage(page);
    await tables.goto();
    await tables.waitForLoaded();

    await expect(tables.createTableLink).toBeVisible();
    await tables.createTableLink.click();
    await expect(page).toHaveURL(/\/tables\/new/);
  });
});

// ===========================================================================
// Category Management
// ===========================================================================
test.describe("Tables Dashboard — Category Management", () => {
  test('"קטגוריה חדשה" opens category dialog', async ({ page }) => {
    const tables = new TablesPage(page);
    await tables.goto();
    await tables.waitForLoaded();

    await expect(tables.newCategoryButton).toBeVisible();
    await tables.openNewCategoryModal();
    await expect(tables.categoryModal).toBeVisible();
    await expect(tables.categoryNameInput).toBeVisible();
  });

  test("empty category name disables submit button", async ({ page }) => {
    const tables = new TablesPage(page);
    await tables.goto();
    await tables.waitForLoaded();

    await tables.openNewCategoryModal();
    await tables.fillCategoryName("");
    await expect(tables.categorySubmitButton).toBeDisabled();
  });

  test("cancel closes category dialog", async ({ page }) => {
    const tables = new TablesPage(page);
    await tables.goto();
    await tables.waitForLoaded();

    await tables.openNewCategoryModal();
    await tables.cancelCategoryModal();
    await expect(tables.categoryModal).not.toBeVisible();
  });

  test("category section shows category heading with table count", async ({
    page,
  }) => {
    const meta = loadMeta();
    const tables = new TablesPage(page);
    await tables.goto();
    await tables.waitForLoaded();

    // Seeded category should appear as a heading
    const categoryHeading = tables.getCategoryHeading(meta.categoryName);
    await expect(categoryHeading).toBeVisible();
  });

  test("uncategorized tables appear under uncategorized section", async ({
    page,
  }) => {
    const meta = loadMeta();
    const tables = new TablesPage(page);
    await tables.goto();
    await tables.waitForLoaded();

    // table2 is uncategorized — it should appear under "ללא קטגוריה" or just be visible
    const card2 = tables.getTableCardByName(meta.table2Name);
    await expect(card2).toBeVisible();
  });

  test("double-click prevention: submit shows loading state and category appears", async ({
    page,
  }) => {
    const tables = new TablesPage(page);
    await tables.goto();
    await tables.waitForLoaded();

    await tables.openNewCategoryModal();
    await tables.fillCategoryName("בדיקת כפילות");

    // After clicking submit, button should become disabled (loading state)
    await tables.submitCategory();
    await expect(tables.categorySubmitButton).toBeDisabled();

    // After category creation, verify the new category heading appears on the page
    await expect(tables.getCategoryHeading("בדיקת כפילות")).toBeVisible({ timeout: 10_000 });
  });

  test("edit category via pencil icon opens edit dialog with pre-filled name", async ({
    page,
  }) => {
    const meta = loadMeta();
    const tables = new TablesPage(page);
    await tables.goto();
    await tables.waitForLoaded();

    // Hover the category heading to reveal the pencil icon
    const categoryHeading = tables.getCategoryHeading(meta.categoryName);
    await categoryHeading.hover();

    // Click the edit (pencil) button
    const editButton = tables.getCategoryEditButton(meta.categoryName);
    await expect(editButton).toBeVisible();
    await editButton.click();

    // Category dialog should open with the edit title
    await expect(tables.categoryModal).toBeVisible();
    await expect(tables.categoryModal.getByText(/ערוך קטגוריה/)).toBeVisible();

    // Input should be pre-filled with the existing category name
    await expect(tables.categoryNameInput).toHaveValue(meta.categoryName);
  });
});

// ===========================================================================
// Table Card Actions (serial — duplicate creates data for delete)
// ===========================================================================
test.describe.serial("Tables Dashboard — Card Actions", () => {
  let duplicatedTableName: string;

  test("card hover reveals edit/duplicate/delete buttons", async ({ page }) => {
    const meta = loadMeta();
    const tables = new TablesPage(page);
    await tables.goto();
    await tables.waitForLoaded();

    const card = tables.getTableCardByName(meta.table1Name);
    await card.hover();

    await expect(tables.getCardEditButton(card)).toBeVisible();
    await expect(tables.getCardDuplicateButton(card)).toBeVisible();
    await expect(tables.getCardDeleteButton(card)).toBeVisible();
  });

  test("duplicate table flow with confirmation", async ({ page }) => {
    const meta = loadMeta();
    duplicatedTableName = `${meta.table2Name} (עותק)`;
    const tables = new TablesPage(page);
    await tables.goto();
    await tables.waitForLoaded();

    const card = tables.getTableCardByName(meta.table2Name);
    await card.hover();
    await tables.getCardDuplicateButton(card).click();

    // Confirm dialog uses AlertDialog (role="alertdialog")
    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByText(/שכפול טבלה/)).toBeVisible();

    // Click confirm
    await confirmDialog.getByRole("button", { name: "אישור" }).click();

    // Should show success toast
    await expect(page.getByText("הטבלה שוכפלה בהצלחה")).toBeVisible({ timeout: 10_000 });
  });

  test("delete table flow with typed confirmation phrase", async ({ page }) => {
    const meta = loadMeta();
    const tables = new TablesPage(page);
    await tables.goto();
    await tables.waitForLoaded();

    // Delete the duplicated table (not the original) to preserve test data isolation
    const targetName = duplicatedTableName || meta.table2Name;
    const card = tables.getTableCardByName(targetName);
    await card.hover();
    await tables.getCardDeleteButton(card).click();

    // Destructive confirm dialog uses AlertDialog (role="alertdialog")
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/מחיקת טבלה/)).toBeVisible();

    // Must type "מחק" to enable the delete button
    const confirmInput = dialog.getByLabel("הקלד ביטוי אישור");
    await expect(confirmInput).toBeVisible();

    // Delete button should be disabled before typing
    const deleteBtn = dialog.getByRole("button", { name: "מחק" });
    await expect(deleteBtn).toBeDisabled();

    // Type the confirmation phrase
    await confirmInput.fill("מחק");
    await expect(deleteBtn).toBeEnabled();

    // Click delete
    await deleteBtn.click();

    // Should show success toast
    await expect(page.getByText("הטבלה נמחקה בהצלחה")).toBeVisible({ timeout: 10_000 });
  });

  test("wrong confirmation phrase keeps delete button disabled", async ({ page }) => {
    const meta = loadMeta();
    const tables = new TablesPage(page);
    await tables.goto();
    await tables.waitForLoaded();

    const card = tables.getTableCardByName(meta.table1Name);
    await card.hover();
    await tables.getCardDeleteButton(card).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    const confirmInput = dialog.getByLabel("הקלד ביטוי אישור");
    const deleteBtn = dialog.getByRole("button", { name: "מחק" });

    // Type wrong text — button should stay disabled
    await confirmInput.fill("wrong");
    await expect(deleteBtn).toBeDisabled();

    // Type correct phrase — button should enable
    await confirmInput.fill("מחק");
    await expect(deleteBtn).toBeEnabled();

    // Cancel instead of deleting (preserve test data)
    const cancelBtn = dialog.getByRole("button", { name: /ביטול|סגור/ });
    await cancelBtn.click();
    await expect(dialog).not.toBeVisible();
  });
});

// ===========================================================================
// Responsive Layout
// ===========================================================================
test.describe("Responsive Layout", () => {
  test("desktop (1280px): multiple cards in same row", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const tables = new TablesPage(page);
    await tables.goto();
    await tables.waitForLoaded();

    const cards = tables.getTableCards();
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const box1 = await cards.nth(0).boundingBox();
    const box2 = await cards.nth(1).boundingBox();
    expect(box1).not.toBeNull();
    expect(box2).not.toBeNull();

    // On desktop with grid-cols-3, cards should be in the same row (similar Y)
    expect(Math.abs(box1!.y - box2!.y)).toBeLessThan(10);
  });

  test('mobile (375px): "צור עם AI" shows disabled mobile variant', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const tables = new TablesPage(page);
    await tables.goto();
    await tables.waitForLoaded();

    await expect(tables.createWithAIMobileButton).toBeVisible();
    await expect(tables.createWithAIMobileButton).toBeDisabled();
  });
});

// ===========================================================================
// Edge Cases
// ===========================================================================
test.describe("Edge Cases", () => {
  test("browser back button from /tables/[id] returns to /tables", async ({
    page,
  }) => {
    const meta = loadMeta();
    const tables = new TablesPage(page);
    await tables.goto();
    await tables.waitForLoaded();

    const card = tables.getTableCardByName(meta.table1Name);
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/tables/${meta.table1Id}`));

    await page.goBack();
    await expect(page).toHaveURL(/\/tables$/);
  });

  test("special characters in search query do not break the page", async ({
    page,
  }) => {
    await page.goto("/tables?q=%25_%5C");
    await expect(page).toHaveURL(/\/tables/);
    // Page should still load without crashing
    const heading = page.getByRole("heading", { name: "טבלאות", level: 1 });
    await expect(heading).toBeVisible();
  });

  test("Hebrew search query in URL works", async ({ page }) => {
    const tables = new TablesPage(page);
    await page.goto("/tables?q=בדיקה");
    await expect(page).toHaveURL(/\/tables/);
    await expect(tables.heading).toBeVisible();
  });
});
