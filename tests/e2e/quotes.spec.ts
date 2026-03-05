import { test, expect, type Page } from "@playwright/test";
import { QuotesListPage } from "./pages/QuotesListPage";
import { QuoteEditorPage } from "./pages/QuoteEditorPage";
import { QuotePdfPage } from "./pages/QuotePdfPage";
import * as path from "path";
import * as fs from "fs";

// ─── Auth storage paths ──────────────────────────────────────────
const STORAGE_ADMIN = "tests/e2e/.auth/tasks-admin.json";
const STORAGE_BASIC = "tests/e2e/.auth/tasks-basic.json";
const STORAGE_NO_TASKS = "tests/e2e/.auth/tasks-no-tasks.json";

// ─── Seeded test data (matches auth-setup.ts) ────────────────────
const SEED = {
  client1Name: "לקוח הצעות 1",
  client1Email: "quote-client1@test.com",
  client1Phone: "050-1112233",
  client2Name: "לקוח הצעות 2",
  client2Email: "quote-client2@test.com",
  draftTitle: "הצעה טיוטה לבדיקה",
  sentTitle: "הצעה שנשלחה",
  acceptedTitle: "הצעה מאושרת",
  acceptedClient: "לקוח מאושר",
  trashedClient: "לקוח למחיקה",
  product1: "ייעוץ עסקי",
  product1Price: 1000,
  product2: "מחשב נייד Pro",
  product2Price: 5000,
  companyName: "E2E Test Company",
} as const;

// ─── Helpers ─────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 8);

function loadMeta() {
  const metaPath = path.join(__dirname, ".auth", ".e2e-meta.json");
  return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
}

async function expectToast(page: Page, message: string | RegExp) {
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: message }).first();
  await expect(toast).toBeVisible({ timeout: 10_000 });
}

// ─── Default auth ────────────────────────────────────────────────
test.use({ storageState: STORAGE_ADMIN });

// ═════════════════════════════════════════════════════════════════
// List Page - /quotes
// ═════════════════════════════════════════════════════════════════
test.describe("Quotes Feature", () => {
  test.describe("List Page - /quotes", () => {
    let list: QuotesListPage;

    test.beforeEach(async ({ page }) => {
      list = new QuotesListPage(page);
      await list.goto();
    });

    test("should load page with correct title and URL", async ({ page }) => {
      await expect(list.pageTitle).toBeVisible();
      expect(page.url()).toContain("/quotes");
    });

    test("should display seeded quotes in table", async () => {
      await expect(list.tableRows.first()).toBeVisible({ timeout: 10_000 });
      const count = await list.tableRows.count();
      expect(count).toBeGreaterThanOrEqual(3);
    });

    test("should show quote number in #00001 format", async ({ page }) => {
      await expect(list.tableRows.first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("#00001")).toBeVisible();
    });

    test("should show quote number, client, amount, status columns", async ({
      page,
    }) => {
      await expect(list.tableRows.first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("מספר הצעה")).toBeVisible();
      await expect(page.getByText("לקוח").first()).toBeVisible();
      await expect(page.getByText("סכום")).toBeVisible();
      await expect(page.getByText("סטטוס").first()).toBeVisible();
    });

    test("should filter quotes by client name search", async ({ page }) => {
      await expect(list.tableRows.first()).toBeVisible({ timeout: 10_000 });
      await list.searchInput.fill(SEED.client1Name);
      await expect(list.getRowByClient(SEED.client1Name)).toBeVisible();
      await expect(list.getRowByClient(SEED.acceptedClient)).not.toBeVisible();
    });

    test("should filter quotes by quote number search", async ({ page }) => {
      await expect(list.tableRows.first()).toBeVisible({ timeout: 10_000 });
      await list.searchInput.fill("00001");
      await expect(list.tableRows).toHaveCount(1);
    });

    test("should show empty state when search has no results", async ({
      page,
    }) => {
      await expect(list.tableRows.first()).toBeVisible({ timeout: 10_000 });
      await list.searchInput.fill("nonexistent-xyz-12345");
      await expect(list.emptyState).toBeVisible();
    });

    test("should navigate to new quote page via button", async ({ page }) => {
      await list.newQuoteButton.click();
      await page.waitForURL("**/quotes/new");
      expect(page.url()).toContain("/quotes/new");
    });

    test("should navigate to edit page when clicking a row", async ({
      page,
    }) => {
      await expect(list.tableRows.first()).toBeVisible({ timeout: 10_000 });
      const row = list.getRowByClient(SEED.client1Name);
      await list.clickEdit(row);
      await page.waitForURL("**/quotes/*");
      expect(page.url()).toMatch(/\/quotes\/[a-z0-9]+$/i);
    });

    test("should open PDF preview in new tab via eye icon", async ({
      page,
      context,
    }) => {
      await expect(list.tableRows.first()).toBeVisible({ timeout: 10_000 });
      const row = list.getRowByClient(SEED.client1Name);
      const [newPage] = await Promise.all([
        context.waitForEvent("page"),
        list.clickPreview(row),
      ]);
      await newPage.waitForLoadState();
      expect(newPage.url()).toContain("/pdf");
      await newPage.close();
    });

    test("should navigate to trash view", async ({ page }) => {
      await list.trashButton.click();
      await page.waitForURL("**/quotes?trash=true");
      expect(page.url()).toContain("trash=true");
    });

    test("should show business settings modal", async ({ page }) => {
      await list.settingsButton.click();
      await expect(page.getByText("סוג עוסק")).toBeVisible();
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // Trash & Restore — serial to avoid shared state issues (W6/W7)
  // ═════════════════════════════════════════════════════════════════
  test.describe("Trash & Restore", () => {
    test.describe.configure({ mode: "serial" });

    let trashedQuoteClient: string;

    test("should trash a quote with confirmation dialog", async ({ page }) => {
      // Create a fresh quote specifically for trashing
      const editor = new QuoteEditorPage(page);
      await editor.goto();
      trashedQuoteClient = `לקוח-מחיקה-${uid()}`;
      await editor.fillClientDetails({ name: trashedQuoteClient });
      await editor.ensureItem();
      await editor.getItemQuantityInput(0).fill("1");
      await editor.getItemPriceInput(0).fill("100");
      await editor.save();
      await expectToast(page, "הצעת המחיר נוצרה בהצלחה");
      await page.waitForURL("**/quotes/*/pdf", { timeout: 10_000 });

      // Go to list and trash it
      const list = new QuotesListPage(page);
      await list.goto();
      await expect(list.tableRows.first()).toBeVisible({ timeout: 10_000 });
      const row = list.getRowByClient(trashedQuoteClient);
      await list.clickTrash(row);
      const confirmBtn = page
        .getByRole("alertdialog")
        .getByRole("button", { name: "אישור" });
      await expect(confirmBtn).toBeVisible();
      await confirmBtn.click();
      await expectToast(page, "ההצעה הועברה לפח");
    });

    test("should show trashed quotes in trash view", async ({ page }) => {
      const list = new QuotesListPage(page);
      await list.gotoTrash();
      await expect(list.tableRows.first()).toBeVisible({ timeout: 10_000 });
      // The seeded trashed quote should be there
      await expect(list.getRowByClient(SEED.trashedClient)).toBeVisible();
    });

    test("should restore a trashed quote", async ({ page }) => {
      const list = new QuotesListPage(page);
      await list.gotoTrash();
      await expect(list.tableRows.first()).toBeVisible({ timeout: 10_000 });
      const row = list.getRowByClient(SEED.trashedClient);
      await list.clickRestore(row);
      await expectToast(page, "ההצעה שוחזרה בהצלחה");
      // Verify quote reappears in main list
      await list.goto();
      await expect(list.tableRows.first()).toBeVisible({ timeout: 10_000 });
      await expect(list.getRowByClient(SEED.trashedClient)).toBeVisible();

      // Re-trash SEED.trashedClient to restore seed data integrity for downstream tests
      const restoredRow = list.getRowByClient(SEED.trashedClient);
      await list.clickTrash(restoredRow);
      const reTrashConfirm = page.getByRole("alertdialog").getByRole("button", { name: "אישור" });
      await reTrashConfirm.click();
      await expectToast(page, "ההצעה הועברה לפח");
    });

    test("should navigate back to quotes list from trash", async ({ page }) => {
      const list = new QuotesListPage(page);
      await list.gotoTrash();
      await list.backToQuotesButton.click();
      await page.waitForURL("**/quotes");
      expect(page.url()).toMatch(/\/quotes$/);
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // Trash View heading
  // ═════════════════════════════════════════════════════════════════
  test.describe("Trash View - /quotes?trash=true", () => {
    test("should show trash page title", async ({ page }) => {
      const list = new QuotesListPage(page);
      await list.gotoTrash();
      await expect(
        page.getByRole("heading", { name: /פח זבל/ })
      ).toBeVisible();
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // Create Quote - /quotes/new
  // ═════════════════════════════════════════════════════════════════
  test.describe("Create Quote - /quotes/new", () => {
    let editor: QuoteEditorPage;

    test.beforeEach(async ({ page }) => {
      editor = new QuoteEditorPage(page);
      await editor.goto();
      // New quotes start with 0 items — add one so item(0) selectors work
      await editor.addItemButton.click();
    });

    test("should load create page with correct heading", async ({ page }) => {
      await expect(editor.pageHeading).toBeVisible();
      await expect(
        page.getByText("הצעת מחיר חדשה").first()
      ).toBeVisible();
    });

    test("should show client dropdown with existing clients", async ({
      page,
    }) => {
      await expect(editor.clientSelect).toBeVisible();
      await expect(
        editor.clientSelect.locator(
          `option:has-text("${SEED.client1Name}")`
        )
      ).toBeAttached();
    });

    test("should auto-fill fields when selecting existing client", async ({
      page,
    }) => {
      await editor.clientSelect.selectOption({ label: SEED.client1Name });
      await expect(editor.clientNameInput).toHaveValue(SEED.client1Name);
      await expect(editor.clientEmailInput).toHaveValue(SEED.client1Email);
      await expect(editor.clientPhoneInput).toHaveValue(SEED.client1Phone);
    });

    test("should clear fields when selecting new client", async ({ page }) => {
      await editor.clientSelect.selectOption({ label: SEED.client1Name });
      await expect(editor.clientNameInput).toHaveValue(SEED.client1Name);
      await editor.clientSelect.selectOption({
        label: "+ לקוח חדש (הזנה ידנית)",
      });
      await expect(editor.clientNameInput).toHaveValue("");
    });

    test("should show validation alert when saving without client name", async ({
      page,
    }) => {
      await editor.addLineItem("1", "100");
      await editor.save();
      await expect(
        page.getByRole("alertdialog").getByText("נדרש שם לקוח")
      ).toBeVisible();
    });

    test("should show validation alert when saving without items", async ({
      page,
    }) => {
      // Remove the item added by beforeEach to test zero-items validation
      await editor.removeItem(0);
      await editor.fillClientDetails({ name: `לקוח-${uid()}` });
      await editor.save();
      await expect(
        page.getByRole("alertdialog").getByText("הוסף לפחות פריט אחד")
      ).toBeVisible();
    });

    test("should add and remove line items", async ({ page }) => {
      await editor.addLineItem("2", "500");
      await editor.addLineItem("1", "300");

      const countBefore = await editor.getItemCount();
      expect(countBefore).toBeGreaterThanOrEqual(3);

      await editor.removeItem(0);
      const countAfter = await editor.getItemCount();
      expect(countAfter).toBe(countBefore - 1);
    });

    test("should calculate subtotal, VAT, and total correctly", async ({
      page,
    }) => {
      // Fill first item: 2 * 1000 = 2000
      await editor.getItemQuantityInput(0).fill("2");
      await editor.getItemPriceInput(0).fill("1000");

      // Subtotal should show 2000
      await expect(editor.subtotalDisplay).toContainText("2,000");
      // Total (with 18% VAT) should show 2360
      await expect(editor.totalDisplay).toContainText("2,360");
    });

    test("should apply percent discount and show correct total", async ({ page }) => {
      await editor.getItemQuantityInput(0).fill("1");
      await editor.getItemPriceInput(0).fill("1000");

      await editor.discountSelect.selectOption("percent");
      await editor.discountValueInput.fill("10");

      // 1000 - 10% = 900, + 18% VAT = 1062
      await expect(page.getByText(/הנחה.*10%/).first()).toBeVisible();
      await expect(editor.totalDisplay).toContainText("1,062");
    });

    test("should apply fixed discount and show correct total", async ({ page }) => {
      await editor.getItemQuantityInput(0).fill("1");
      await editor.getItemPriceInput(0).fill("1000");

      await editor.discountSelect.selectOption("fixed");
      await editor.discountValueInput.fill("200");

      // 1000 - 200 = 800, + 18% VAT = 944
      await expect(editor.totalDisplay).toContainText("944");
    });

    test("should set valid-until via week shortcut button", async ({ page }) => {
      await editor.weekButton.click();
      const value = await editor.validUntilInput.inputValue();
      expect(value).toBeTruthy();
      const date = new Date(value);
      const diffDays = Math.round(
        (date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      expect(diffDays).toBeGreaterThanOrEqual(6);
      expect(diffDays).toBeLessThanOrEqual(8);
    });

    test("should set valid-until via month shortcut button", async ({ page }) => {
      await editor.monthButton.click();
      const value = await editor.validUntilInput.inputValue();
      expect(value).toBeTruthy();
      const date = new Date(value);
      const diffDays = Math.round(
        (date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      expect(diffDays).toBeGreaterThanOrEqual(27);
      expect(diffDays).toBeLessThanOrEqual(32);
    });

    test("should set valid-until via custom duration input", async ({ page }) => {
      // Custom duration: 2 weeks via the "עוד:" number input + unit select + "החל" button
      const durationContainer = page.locator("div").filter({ hasText: /^עוד:$/ }).filter({ has: page.locator("input[type='number']") });
      const durationInput = durationContainer.locator("input[type='number']");
      const unitSelect = durationContainer.locator("select");
      await durationInput.fill("2");
      await unitSelect.selectOption("weeks");
      await editor.applyButton.click();
      const value = await editor.validUntilInput.inputValue();
      expect(value).toBeTruthy();
      const date = new Date(value);
      const diffDays = Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(13);
      expect(diffDays).toBeLessThanOrEqual(15);
    });

    test("should toggle VAT included mode", async ({ page }) => {
      await expect(editor.vatCheckbox).toBeVisible();
      await editor.vatCheckbox.check();
      await expect(editor.vatCheckbox).toBeChecked();
      await editor.vatCheckbox.uncheck();
      await expect(editor.vatCheckbox).not.toBeChecked();
    });

    test("should recalculate total when toggling VAT included mode", async ({ page }) => {
      await editor.getItemQuantityInput(0).fill("1");
      await editor.getItemPriceInput(0).fill("1180");

      // Without VAT included: 1180 + 18% = 1392.40
      await expect(editor.totalDisplay).toContainText("1,392");

      // With VAT included: 1180 already includes VAT, total stays 1180
      await editor.vatCheckbox.check();
      await expect(editor.totalDisplay).toContainText("1,180");
    });

    test("should auto-fill price when selecting a product", async ({ page }) => {
      const productSelects = editor.getProductSelects();
      const options = productSelects.first().locator("option");
      const matchingOption = options.filter({ hasText: SEED.product1 });
      const value = await matchingOption.getAttribute("value");
      if (value) await productSelects.first().selectOption(value);

      // Product1 price is 1000 ILS
      await expect(editor.getItemPriceInput(0)).toHaveValue("1000");
    });

    test("should create quote successfully and redirect to PDF page", async ({
      page,
    }) => {
      const clientName = `לקוח-יצירה-${uid()}`;
      await editor.fillClientDetails({
        name: clientName,
        email: "new@test.com",
      });

      await editor.getItemQuantityInput(0).fill("3");
      await editor.getItemPriceInput(0).fill("500");

      await editor.save();
      await expectToast(page, "הצעת המחיר נוצרה בהצלחה");
      await page.waitForURL("**/quotes/*/pdf", { timeout: 10_000 });
      expect(page.url()).toContain("/pdf");
    });

    test("should show margin calculation", async ({ page }) => {
      const productSelects = editor.getProductSelects();
      const options = productSelects.first().locator("option");
      const matchingOption = options.filter({ hasText: SEED.product1 });
      const value = await matchingOption.getAttribute("value");
      if (value) await productSelects.first().selectOption(value);

      await expect(page.getByText("הכנסה (נטו):").first()).toBeVisible();
      await expect(page.getByText("עלות משוערת:").first()).toBeVisible();
      await expect(page.getByText("רווח:").first()).toBeVisible();
    });

    test("should show warning toast when clicking back with unsaved changes", async ({ page }) => {
      await editor.fillClientDetails({ name: `לקוח-${uid()}` });
      await editor.backButton.click();
      await expectToast(page, "יש שינויים שלא נשמרו בהצעת המחיר");
      // Should NOT navigate away
      expect(page.url()).toContain("/quotes/new");
    });

    test("should prevent double-submit while saving", async ({ page }) => {
      const clientName = `לקוח-כפול-${uid()}`;
      await editor.fillClientDetails({ name: clientName });
      await editor.getItemQuantityInput(0).fill("1");
      await editor.getItemPriceInput(0).fill("100");

      // Click save and verify button becomes disabled
      await editor.saveButton.click();
      const savingBtn = page.getByRole("button", { name: "שומר..." });
      await expect(savingBtn).toBeVisible();
      await expect(savingBtn).toBeDisabled();
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // Edit Quote - /quotes/[id]
  // ═════════════════════════════════════════════════════════════════
  test.describe("Edit Quote - /quotes/[id]", () => {
    test("should load edit page with pre-filled data", async ({ page }) => {
      const meta = loadMeta();
      const editor = new QuoteEditorPage(page);
      await editor.gotoEdit(meta.quoteDraftId);
      await expect(editor.pageHeading).toBeVisible();
      await expect(editor.clientNameInput).toHaveValue(SEED.client1Name);
      await expect(editor.titleInput).toHaveValue(SEED.draftTitle);
    });

    test("should show pre-filled items from seed data", async ({ page }) => {
      const meta = loadMeta();
      const editor = new QuoteEditorPage(page);
      await editor.gotoEdit(meta.quoteDraftId);
      // Draft quote has 2 items
      const itemCount = await editor.getItemCount();
      expect(itemCount).toBe(2);
    });

    test("should show print/PDF button in edit mode", async ({ page }) => {
      const meta = loadMeta();
      const editor = new QuoteEditorPage(page);
      await editor.gotoEdit(meta.quoteDraftId);
      await expect(editor.printPdfButton).toBeVisible();
    });

    test("should update quote and show success toast", async ({ page }) => {
      const meta = loadMeta();
      const editor = new QuoteEditorPage(page);
      await editor.gotoEdit(meta.quoteSentId);
      const newTitle = `הצעה מעודכנת ${uid()}`;
      await editor.titleInput.fill(newTitle);
      await editor.save();
      await expectToast(page, "הצעת המחיר עודכנה בהצלחה");
    });

    test("should show status badges correctly", async ({ page }) => {
      const meta = loadMeta();
      const editor = new QuoteEditorPage(page);
      await editor.gotoEdit(meta.quoteDraftId);
      await expect(editor.statusSelect).toHaveValue("DRAFT");
    });

    test("should persist status change after save", async ({ page }) => {
      const meta = loadMeta();
      const editor = new QuoteEditorPage(page);
      await editor.gotoEdit(meta.quoteDraftId);
      await expect(editor.statusSelect).toHaveValue("DRAFT");
      await editor.statusSelect.selectOption("SENT");
      await editor.save();
      await expectToast(page, "הצעת המחיר עודכנה בהצלחה");
      // Reload and verify status persisted
      await editor.gotoEdit(meta.quoteDraftId);
      await expect(editor.statusSelect).toHaveValue("SENT");
      // Restore original status for test isolation
      await editor.statusSelect.selectOption("DRAFT");
      await editor.save();
      await expectToast(page, "הצעת המחיר עודכנה בהצלחה");
    });

    test("should show not-found message for non-existent quote ID", async ({ page }) => {
      const editor = new QuoteEditorPage(page);
      await editor.gotoEdit("cxxxxxxxxxxxxxxxxxxxxxxxxx");
      await expect(page.getByText("הצעת המחיר לא נמצאה")).toBeVisible();
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // PDF Preview - /quotes/[id]/pdf
  // ═════════════════════════════════════════════════════════════════
  test.describe("PDF Preview - /quotes/[id]/pdf", () => {
    test("should load PDF preview page", async ({ page }) => {
      const meta = loadMeta();
      const pdf = new QuotePdfPage(page);
      await pdf.goto(meta.quoteDraftId);
      await expect(pdf.previewHeading).toBeVisible();
    });

    test("should show quote document with company name, client name, and items", async ({ page }) => {
      const meta = loadMeta();
      const pdf = new QuotePdfPage(page);
      await pdf.goto(meta.quoteDraftId);
      await expect(pdf.previewHeading).toBeVisible();
      // Verify document content
      await expect(page.getByText(SEED.companyName)).toBeVisible();
      await expect(page.getByText(SEED.client1Name)).toBeVisible();
      await expect(page.getByText("הצעת מחיר")).toBeVisible();
    });

    test("should show back link to quotes", async ({ page }) => {
      const meta = loadMeta();
      const pdf = new QuotePdfPage(page);
      await pdf.goto(meta.quoteDraftId);
      await expect(pdf.backLink).toBeVisible();
      await pdf.backLink.click();
      await page.waitForURL("**/quotes");
    });

    test("should show print, download, whatsapp buttons", async ({
      page,
    }) => {
      const meta = loadMeta();
      const pdf = new QuotePdfPage(page);
      await pdf.goto(meta.quoteDraftId);
      await expect(pdf.printButton).toBeVisible();
      await expect(pdf.downloadButton).toBeVisible();
      await expect(pdf.whatsappButton).toBeVisible();
    });

    test("should show email button as disabled", async ({ page }) => {
      const meta = loadMeta();
      const pdf = new QuotePdfPage(page);
      await pdf.goto(meta.quoteDraftId);
      await expect(pdf.emailButton).toBeVisible();
      await expect(pdf.emailButton).toHaveAttribute(
        "title",
        /בקרוב/
      );
    });

    test("should open WhatsApp modal", async ({ page }) => {
      const meta = loadMeta();
      const pdf = new QuotePdfPage(page);
      await pdf.goto(meta.quoteSentId);
      await pdf.whatsappButton.click();
      await expect(pdf.whatsappModalTitle).toBeVisible();
      await expect(pdf.sendButton).toBeVisible();
      await expect(pdf.cancelButton).toBeVisible();
    });

    test("should show client phone option in WhatsApp modal", async ({
      page,
    }) => {
      const meta = loadMeta();
      const pdf = new QuotePdfPage(page);
      await pdf.goto(meta.quoteSentId);
      await pdf.whatsappButton.click();
      await expect(pdf.clientPhoneRadio).toBeVisible();
      await expect(pdf.customPhoneRadio).toBeVisible();
    });

    test("should close WhatsApp modal on cancel", async ({ page }) => {
      const meta = loadMeta();
      const pdf = new QuotePdfPage(page);
      await pdf.goto(meta.quoteSentId);
      await pdf.whatsappButton.click();
      await expect(pdf.whatsappModalTitle).toBeVisible();
      await pdf.cancelButton.click();
      await expect(pdf.whatsappModalTitle).not.toBeVisible();
    });

    test("should show custom phone input when selecting custom radio", async ({ page }) => {
      const meta = loadMeta();
      const pdf = new QuotePdfPage(page);
      await pdf.goto(meta.quoteSentId);
      await pdf.whatsappButton.click();
      await pdf.customPhoneRadio.check();
      await expect(pdf.customPhoneInput).toBeVisible();
    });

    test("should show alert when sending WhatsApp without phone number", async ({ page }) => {
      const meta = loadMeta();
      const pdf = new QuotePdfPage(page);
      await pdf.goto(meta.quoteSentId);
      await pdf.whatsappButton.click();
      await pdf.customPhoneRadio.check();
      // Don't fill phone, just click send
      await pdf.sendButton.click();
      await expect(page.getByRole("alertdialog").getByText("נא להזין מספר טלפון")).toBeVisible();
    });

    test("should show not-found message for non-existent quote ID on PDF page", async ({ page }) => {
      const pdf = new QuotePdfPage(page);
      await pdf.goto("cxxxxxxxxxxxxxxxxxxxxxxxxx");
      await expect(page.getByText("הצעת המחיר לא נמצאה")).toBeVisible();
    });

    test("should show error toast when PDF download fails", async ({ page }) => {
      const meta = loadMeta();
      const pdf = new QuotePdfPage(page);
      await pdf.goto(meta.quoteDraftId);
      await expect(pdf.downloadButton).toBeVisible();

      // Intercept the download API route (regular fetch, not server action)
      await page.route("**/api/quotes/*/download", async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Internal Server Error" }),
        });
      });

      await pdf.downloadButton.click();
      const downloadErrorToast = page.locator("[data-sonner-toast][data-type='error']").first();
      await expect(downloadErrorToast).toBeVisible({ timeout: 10_000 });
      await expect(downloadErrorToast).not.toBeEmpty();
      await page.unroute("**/api/quotes/*/download");
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // Authorization
  // ═════════════════════════════════════════════════════════════════
  test.describe("Authorization", () => {
    test("should redirect user without canViewQuotes to home", async ({
      browser,
    }) => {
      const context = await browser.newContext({
        storageState: STORAGE_NO_TASKS,
      });
      const page = await context.newPage();
      await page.goto("/quotes");
      // Should redirect away from /quotes (to / root)
      await page.waitForURL((url) => !url.pathname.startsWith("/quotes"), { timeout: 10_000 });
      expect(page.url()).not.toContain("/quotes");
      await context.close();
    });

    test("should redirect to login when not authenticated", async ({
      browser,
    }) => {
      const context = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const page = await context.newPage();
      await page.goto("/quotes");
      await page.waitForURL("**/login**", { timeout: 10_000 });
      expect(page.url()).toContain("/login");
      await context.close();
    });

    test("should allow basic user with canViewQuotes to access", async ({
      browser,
    }) => {
      const context = await browser.newContext({
        storageState: STORAGE_BASIC,
      });
      const page = await context.newPage();
      await page.goto("/quotes");
      const list = new QuotesListPage(page);
      await expect(list.pageTitle).toBeVisible({ timeout: 10_000 });
      expect(page.url()).toContain("/quotes");
      await context.close();
    });

    test("should redirect to login when accessing PDF page unauthenticated", async ({
      browser,
    }) => {
      const meta = loadMeta();
      const context = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const page = await context.newPage();
      await page.goto(`/quotes/${meta.quoteDraftId}/pdf`);
      await page.waitForURL("**/login**", { timeout: 10_000 });
      expect(page.url()).toContain("/login");
      await context.close();
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // Responsive (W5 — strengthened assertions)
  // ═════════════════════════════════════════════════════════════════
  test.describe("Responsive", () => {
    test("should display correctly on desktop viewport", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      const list = new QuotesListPage(page);
      await list.goto();
      await expect(list.pageTitle).toBeVisible();
      await expect(list.newQuoteButton).toBeVisible();
      await expect(list.searchInput).toBeVisible();
      await expect(list.trashButton).toBeVisible();
      await expect(list.settingsButton).toBeVisible();
      // Table column headers should be visible
      await expect(page.getByText("מספר הצעה")).toBeVisible();
      await expect(page.getByText("סכום")).toBeVisible();
      await expect(page.getByText("פעולות")).toBeVisible();
    });

    test("should show list page correctly on mobile", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      const list = new QuotesListPage(page);
      await list.goto();
      await expect(list.pageTitle).toBeVisible();
      await expect(list.searchInput).toBeVisible();
    });

    test("should hide email button on mobile PDF page", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      const meta = loadMeta();
      const pdf = new QuotePdfPage(page);
      await pdf.goto(meta.quoteDraftId);
      await expect(pdf.previewHeading).toBeVisible();
      // The email button has `hidden md:flex` — should not be visible on mobile
      await expect(pdf.emailButton).not.toBeVisible();
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // Edge Cases
  // ═════════════════════════════════════════════════════════════════
  test.describe("Edge Cases", () => {
    test("should handle special characters and Hebrew in inputs", async ({
      page,
    }) => {
      const editor = new QuoteEditorPage(page);
      await editor.goto();
      const specialName = `לקוח "מיוחד" - ${uid()} <>&`;
      await editor.fillClientDetails({ name: specialName });
      await expect(editor.clientNameInput).toHaveValue(specialName);
    });

    test("should handle very long text in description popup", async ({
      page,
    }) => {
      const editor = new QuoteEditorPage(page);
      await editor.goto();
      await editor.ensureItem();
      const descButton = page
        .getByText("לחץ כאן להוספת/קריאת התיאור")
        .first();
      await descButton.click();
      await expect(page.getByText("תיאור הפריט")).toBeVisible();
      const textarea = page.getByPlaceholder(
        "כתוב תיאור מפורט לפריט..."
      );
      const longText = "א".repeat(500);
      await textarea.fill(longText);
      await page.getByRole("button", { name: "שמור" }).click();
      // Verify popup closed
      await expect(page.getByText("תיאור הפריט")).not.toBeVisible();
      // Re-open and verify text persisted
      await descButton.click();
      await expect(textarea).toHaveValue(longText);
    });

    test("should show description popup and close it", async ({ page }) => {
      const editor = new QuoteEditorPage(page);
      await editor.goto();
      await editor.ensureItem();
      const descButton = page
        .getByText("לחץ כאן להוספת/קריאת התיאור")
        .first();
      await descButton.click();
      await expect(page.getByText("תיאור הפריט")).toBeVisible();
      await page.getByRole("button", { name: "סגור" }).click();
      await expect(page.getByText("תיאור הפריט")).not.toBeVisible();
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // Error Handling (server action interception via Next-Action header)
  // ═════════════════════════════════════════════════════════════════
  test.describe("Error Handling", () => {
    test("should show error toast when server action fails on save", async ({ page }) => {
      const editor = new QuoteEditorPage(page);
      await editor.goto();
      await editor.ensureItem();

      // Intercept server action POSTs by detecting the Next-Action header.
      // Returning HTTP 500 causes Next.js to throw in the client-side action caller,
      // which hits the catch block in handleSave and triggers an error toast.
      await page.route("**/*", async (route) => {
        const headers = route.request().headers();
        if (headers["next-action"]) {
          await route.fulfill({
            status: 500,
            contentType: "text/x-component",
            body: '0:{"error":"Internal Server Error"}',
          });
        } else {
          await route.continue();
        }
      });

      await editor.fillClientDetails({ name: `לקוח-שגיאה-${uid()}` });
      await editor.getItemQuantityInput(0).fill("1");
      await editor.getItemPriceInput(0).fill("100");

      await editor.save();
      // Should show error toast (getUserFriendlyError)
      const saveErrorToast = page.locator("[data-sonner-toast][data-type='error']").first();
      await expect(saveErrorToast).toBeVisible({ timeout: 10_000 });
      await expect(saveErrorToast).not.toBeEmpty();
      await page.unroute("**/*");
    });

    test("should show error toast when trash server action fails", async ({ page }) => {
      const list = new QuotesListPage(page);
      await list.goto();
      await expect(list.tableRows.first()).toBeVisible({ timeout: 10_000 });

      // Intercept server actions to simulate failure
      await page.route("**/*", async (route) => {
        const headers = route.request().headers();
        if (headers["next-action"]) {
          await route.fulfill({
            status: 500,
            contentType: "text/x-component",
            body: '0:{"error":"Internal Server Error"}',
          });
        } else {
          await route.continue();
        }
      });

      const row = list.getRowByClient(SEED.client1Name);
      await list.clickTrash(row);
      const confirmBtn = page.getByRole("alertdialog").getByRole("button", { name: "אישור" });
      await confirmBtn.click();
      const trashErrorToast = page.locator("[data-sonner-toast][data-type='error']").first();
      await expect(trashErrorToast).toBeVisible({ timeout: 10_000 });
      await expect(trashErrorToast).not.toBeEmpty();
      await page.unroute("**/*");
    });

    test("should show error toast when restore server action fails", async ({ page }) => {
      const list = new QuotesListPage(page);
      await list.gotoTrash();
      await expect(list.tableRows.first()).toBeVisible({ timeout: 10_000 });

      await page.route("**/*", async (route) => {
        const headers = route.request().headers();
        if (headers["next-action"]) {
          await route.fulfill({
            status: 500,
            contentType: "text/x-component",
            body: '0:{"error":"Internal Server Error"}',
          });
        } else {
          await route.continue();
        }
      });

      const row = list.tableRows.first();
      await list.clickRestore(row);
      const restoreErrorToast = page.locator("[data-sonner-toast][data-type='error']").first();
      await expect(restoreErrorToast).toBeVisible({ timeout: 10_000 });
      await expect(restoreErrorToast).not.toBeEmpty();
      await page.unroute("**/*");
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // Currency Switching
  // ═════════════════════════════════════════════════════════════════
  test.describe("Currency", () => {
    test("should switch currency to USD and show $ symbol", async ({ page }) => {
      const editor = new QuoteEditorPage(page);
      await editor.goto();
      await editor.addItemButton.click();
      await editor.getItemQuantityInput(0).fill("1");
      await editor.getItemPriceInput(0).fill("100");
      await editor.currencySelect.selectOption("USD");
      await expect(editor.subtotalDisplay).toContainText("$");
    });

    test("should show error toast and revert currency when exchange rate fetch fails", async ({ page }) => {
      const editor = new QuoteEditorPage(page);
      await editor.goto();
      await editor.addItemButton.click();
      await editor.getItemQuantityInput(0).fill("1");
      await editor.getItemPriceInput(0).fill("100");

      // Intercept server action (getExchangeRate) to simulate failure
      await page.route("**/*", async (route) => {
        const headers = route.request().headers();
        if (headers["next-action"]) {
          await route.fulfill({
            status: 500,
            contentType: "text/x-component",
            body: '0:{"error":"Internal Server Error"}',
          });
        } else {
          await route.continue();
        }
      });

      await editor.currencySelect.selectOption("USD");
      await expectToast(page, /שגיאה בשליפת שער יציג/);
      // Currency should revert to ILS
      await expect(editor.currencySelect).toHaveValue("ILS");
      await page.unroute("**/*");
    });
  });
});
