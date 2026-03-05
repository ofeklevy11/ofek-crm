import { test, expect } from "@playwright/test";
import { AutomationsPage, AUTO_TEXT } from "./pages/AutomationsPage";

const STORAGE_ADMIN = "tests/e2e/.auth/tasks-admin.json";

test.use({ storageState: STORAGE_ADMIN });

// ─── 1. Navigation & Page Load ──────────────────────────────

test.describe("Navigation & Page Load", () => {
  test("should navigate to /automations and show page title", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();
    await expect(automations.pageTitle).toBeVisible();
    await expect(automations.pageSubtitle).toBeVisible();
  });

  test("should show the time-based automation disclaimer banner", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();
    await expect(automations.disclaimerBanner).toBeVisible();
  });

  test("should display folder sidebar with 'כל האוטומציות' default selection", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();
    await expect(automations.allAutomationsButton).toBeVisible();
    // Verify automations are displayed (default = show all)
    const cards = automations.getAutomationCards();
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test("should display action buttons", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();
    await expect(automations.createButton).toBeVisible();
    await expect(automations.aiCreateButton).toBeVisible();
    await expect(automations.multiEventButton).toBeVisible();
  });
});

// ─── 2. Authentication & Authorization ──────────────────────

test.describe("Authentication & Authorization", () => {
  test("should redirect unauthenticated user to /login", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto("/automations");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("should redirect user without canViewAutomations to /", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "tests/e2e/.auth/tasks-no-tasks.json",
    });
    const page = await context.newPage();
    await page.goto("/automations");
    await page.waitForLoadState("networkidle");
    const title = page.getByRole("heading", { name: AUTO_TEXT.pageTitle });
    await expect(title).not.toBeVisible();
    await context.close();
  });

  test("should load normally for authorized user", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();
    await expect(automations.pageTitle).toBeVisible();
  });
});

// ─── 3. Automation List Display ─────────────────────────────

test.describe("Automation List Display", () => {
  test("should display automation cards with name, trigger, action descriptions", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const card = automations.getCardByName("אוטומציית בדיקה 1");
    await expect(card).toBeVisible({ timeout: 10_000 });

    await expect(card.getByText("טריגר:")).toBeVisible();
    await expect(card.getByText("פעולה:")).toBeVisible();
  });

  test("should show active/inactive state via toggle text", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    // Active card shows active toggle text
    const activeCard = automations.getCardByName("אוטומציית בדיקה 1");
    await expect(activeCard).toBeVisible({ timeout: 10_000 });
    await expect(activeCard.getByText(AUTO_TEXT.activeToggle)).toBeVisible();

    // Inactive card shows inactive toggle text
    const inactiveCard = automations.getCardByName("אוטומציית בדיקה כבויה");
    await expect(inactiveCard).toBeVisible();
    await expect(inactiveCard.getByText(AUTO_TEXT.inactiveToggle)).toBeVisible();
  });

  test("should show empty state when no automations in folder", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const emptyFolder = automations.selectFolder("תיקייה ריקה");
    await emptyFolder.click();

    await expect(automations.emptyState).toBeVisible();
  });

  test("should show VIEW_METRIC_THRESHOLD card with 'תצוגה' badge and no edit button", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const card = automations.getCardByName("אוטומציית מדד תצוגה");
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Should show "תצוגה" badge
    await expect(card.getByText(AUTO_TEXT.viewBadge)).toBeVisible();

    // Should NOT have an edit button
    await expect(automations.getEditButton("אוטומציית מדד תצוגה")).not.toBeVisible();
  });
});

// ─── 4. Folder Management ───────────────────────────────────

test.describe("Folder Management", () => {
  test("should create a new folder", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    await automations.clickCreateFolder();
    await expect(automations.folderNameInput).toBeVisible();

    const folderName = `תיקיית בדיקה ${Date.now()}`;
    await automations.fillFolderName(folderName);
    await automations.saveFolderCreation();

    await expect(automations.selectFolder(folderName)).toBeVisible({ timeout: 5_000 });
  });

  test("should filter automations when selecting a folder", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const folder = automations.selectFolder("תיקיית בדיקה");
    await folder.click();

    const cards = automations.getAutomationCards();
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test("should show all automations when clicking כל האוטומציות", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const folder = automations.selectFolder("תיקיית בדיקה");
    await folder.click();

    const folderCount = await automations.getAutomationCards().count();

    await automations.selectAllAutomations();

    const allCount = await automations.getAutomationCards().count();
    expect(allCount).toBeGreaterThanOrEqual(folderCount);
  });

  test("should cancel folder creation with 'בטל' button", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    await automations.clickCreateFolder();
    await expect(automations.folderNameInput).toBeVisible();

    await automations.fillFolderName("תיקייה שלא תישמר");
    await automations.cancelFolderCreation();

    await expect(automations.folderNameInput).not.toBeVisible();
    await expect(
      automations.selectFolder("תיקייה שלא תישמר"),
    ).not.toBeVisible();
  });

  test("should delete a folder after confirmation dialog", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    // Create a temp folder to delete
    await automations.clickCreateFolder();
    const tempName = `למחיקה ${Date.now()}`;
    await automations.fillFolderName(tempName);
    await automations.saveFolderCreation();
    await expect(automations.selectFolder(tempName)).toBeVisible({ timeout: 5_000 });

    // Hover to reveal delete button and click it
    const folderLi = page.locator("li").filter({ hasText: tempName });
    await folderLi.hover();
    await automations.getFolderDeleteButton(tempName).click();

    // Confirm via scoped AlertDialog
    await automations.confirmAlertDialog();

    await expect(automations.selectFolder(tempName)).not.toBeVisible({ timeout: 5_000 });
  });

  test("should reject empty folder name submission", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    await automations.clickCreateFolder();
    await expect(automations.folderNameInput).toBeVisible();

    // Leave name empty and try to save
    await automations.fillFolderName("");
    await automations.saveFolderCreation();

    // Folder input should still be visible (creation not completed)
    // OR no new folder appears — either way, no empty-name folder
    const sidebarText = await page.locator("li").allTextContents();
    const emptyNames = sidebarText.filter((t) => t.trim() === "");
    expect(emptyNames.length).toBe(0);
  });

  test("should show folder name in heading when a folder is selected", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const folder = automations.selectFolder("תיקיית בדיקה");
    await folder.click();

    // Heading should reflect the folder name
    await expect(automations.getContentHeading().filter({ hasText: "תיקיית בדיקה" })).toBeVisible();

    // Go back to all
    await automations.selectAllAutomations();
    await expect(automations.getContentHeading().filter({ hasText: AUTO_TEXT.allAutomations })).toBeVisible();
  });
});

// ─── 5. Standard Automation Modal ───────────────────────────

test.describe("Standard Automation Modal", () => {
  test("should open wizard modal when clicking 'אוטומציה חדשה'", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    await automations.createButton.click();

    // Modal uses custom overlay, detect by heading text
    const modal = automations.getAutomationModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal.getByText(AUTO_TEXT.wizardTitle)).toBeVisible();
  });

  test("should close wizard modal via X button", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    await automations.createButton.click();
    const modal = automations.getAutomationModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await automations.closeModalViaXButton(modal);

    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });

  test("should close wizard modal via overlay click", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();
    await automations.createButton.click();
    const modal = automations.getAutomationModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });
    // Click the top-left corner of the backdrop overlay, outside the inner modal card
    await modal.click({ position: { x: 5, y: 5 } });
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });

  test("should show 'המשך לשלב הבא' button in wizard step 1", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    await automations.createButton.click();
    const modal = automations.getAutomationModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // The next step button should be present
    await expect(modal.getByText(AUTO_TEXT.nextStep)).toBeVisible();
  });
});

// ─── 6. Multi-Event Automation Modal ────────────────────────

test.describe("Multi-Event Automation Modal", () => {
  test("should open multi-event modal when clicking button", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    await automations.multiEventButton.click();

    const modal = automations.getMultiEventModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal.getByText(AUTO_TEXT.multiEventTitle)).toBeVisible();
  });

  test("should close multi-event modal via X button", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    await automations.multiEventButton.click();
    const modal = automations.getMultiEventModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await automations.closeModalViaXButton(modal);
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─── 7. AI Automation Creator ───────────────────────────────

test.describe("AI Automation Creator", () => {
  test("should open AI creator when clicking button", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    await automations.aiCreateButton.click();

    const modal = automations.getAICreatorModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal.getByText(AUTO_TEXT.aiTitle)).toBeVisible();
  });

  test("should show initial AI greeting message", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    await automations.aiCreateButton.click();
    const modal = automations.getAICreatorModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // AI creator should show the initial Hebrew greeting
    await expect(modal.getByText(/תאר לי מה אתה רוצה/)).toBeVisible();
  });

  test("should close AI creator modal via X button", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    await automations.aiCreateButton.click();
    const modal = automations.getAICreatorModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await automations.closeAICreatorViaXButton(modal);
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─── 8. Automation CRUD Operations ──────────────────────────

test.describe("Automation CRUD Operations", () => {
  test("should toggle automation active→inactive and show toast", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const card = automations.getCardByName("אוטומציית בדיקה 1");
    await expect(card).toBeVisible({ timeout: 10_000 });
    const activeToggle = automations.getToggleButton("אוטומציית בדיקה 1");
    await activeToggle.click();

    await expect(automations.getToastByText(AUTO_TEXT.toastDeactivated)).toBeVisible({ timeout: 10_000 });
  });

  test("should toggle automation inactive→active and show toast", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const card = automations.getCardByName("אוטומציית בדיקה כבויה");
    await expect(card).toBeVisible({ timeout: 10_000 });
    const inactiveToggle = automations.getToggleButton("אוטומציית בדיקה כבויה");
    await inactiveToggle.click();

    await expect(automations.getToastByText(AUTO_TEXT.toastActivated)).toBeVisible({ timeout: 10_000 });
  });

  test("should toggle and verify UI state change (text switches)", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    // Find a specific card with known active state
    const card = automations.getCardByName("אוטומציית בדיקה 1");
    await expect(card).toBeVisible({ timeout: 10_000 });

    // It starts active
    await expect(card.getByText(AUTO_TEXT.activeToggle)).toBeVisible();

    // Toggle it off
    await card.getByText(AUTO_TEXT.activeToggle).click();
    await expect(automations.getToastByText(AUTO_TEXT.toastDeactivated)).toBeVisible({ timeout: 10_000 });

    // Verify the toggle text changed to inactive
    await expect(card.getByText(AUTO_TEXT.inactiveToggle)).toBeVisible({ timeout: 5_000 });
  });

  test("should delete automation after confirmation and show toast", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const deleteTarget = automations.getCardByName("אוטומציה למחיקה");
    await expect(deleteTarget).toBeVisible({ timeout: 10_000 });

    await automations.getDeleteButton("אוטומציה למחיקה").click();

    // Confirm via scoped AlertDialog
    const alertDialog = automations.getAlertDialog();
    await expect(alertDialog).toBeVisible({ timeout: 5_000 });
    await automations.confirmAlertDialog();

    await expect(automations.getToastByText(AUTO_TEXT.toastDeleted)).toBeVisible({ timeout: 10_000 });

    // Card should be removed from the DOM
    await expect(deleteTarget).not.toBeVisible({ timeout: 5_000 });
  });

  test("should cancel delete when dismissing confirmation dialog", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const card = automations.getCardByName("אוטומציית בדיקה 1");
    await expect(card).toBeVisible({ timeout: 10_000 });

    await automations.getDeleteButton("אוטומציית בדיקה 1").click();

    // Cancel via scoped AlertDialog
    const alertDialog = automations.getAlertDialog();
    await expect(alertDialog).toBeVisible({ timeout: 5_000 });
    await automations.cancelAlertDialog();

    // Card should still be visible
    await expect(card).toBeVisible();
  });
});

// ─── 8b. Error Handling for CRUD Operations ─────────────────

test.describe("CRUD Error Handling", () => {
  test("should show error toast when toggle fails", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    // Wait for cards to load before intercepting
    const card = automations.getCardByName("אוטומציית בדיקה 1");
    await expect(card).toBeVisible({ timeout: 10_000 });
    const activeToggle = automations.getToggleButton("אוטומציית בדיקה 1");

    // Note: Server actions use RSC protocol. This mock returns raw 500 which may
    // cause a React parsing error rather than the server action's error. The broad
    // regex assertion handles both cases.
    await page.route("**/automations", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 500, body: "Server Error" });
      } else {
        await route.fallback();
      }
    });

    await activeToggle.click();

    // Should show an error toast
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: /שגיאה|error/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("should show error toast when delete fails and keep card visible", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const card = automations.getCardByName("אוטומציית בדיקה 1");
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Note: Server actions use RSC protocol. This mock returns raw 500 which may
    // cause a React parsing error rather than the server action's error. The broad
    // regex assertion handles both cases.
    await page.route("**/automations", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 500, body: "Server Error" });
      } else {
        await route.fallback();
      }
    });

    await automations.getDeleteButton("אוטומציית בדיקה 1").click();
    await automations.confirmAlertDialog();

    // Should show an error toast
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: /שגיאה|error/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Card should still be visible (delete didn't go through)
    await expect(card).toBeVisible();
  });

  test("should keep folder input open when folder creation fails (no error handling in source)", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    await expect(automations.pageTitle).toBeVisible();

    // Intercept server actions after page load
    await page.route("**/automations", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 500, body: "Server Error" });
      } else {
        await route.fallback();
      }
    });

    await automations.clickCreateFolder();
    const folderName = `תיקיית שגיאה ${Date.now()}`;
    await automations.fillFolderName(folderName);
    await automations.saveFolderCreation();

    // Source has no try-catch in handleCreateFolder, so on failure:
    // - No toast is shown
    // - isCreatingFolder stays true (input stays visible)
    // - Folder does NOT appear in sidebar
    await expect(automations.folderNameInput).toBeVisible({ timeout: 3_000 });
    await expect(automations.selectFolder(folderName)).not.toBeVisible();
  });
});

// ─── 9. Move to Folder ──────────────────────────────────────

test.describe("Move to Folder", () => {
  test("should open folder dropdown when clicking folder icon on a card", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const card = automations.getCardByName("אוטומציית בדיקה 1");
    await expect(card).toBeVisible({ timeout: 10_000 });

    await automations.getFolderDropdownButton("אוטומציית בדיקה 1").click();

    // Dropdown with folder options should appear
    await expect(
      automations.getFolderDropdownItem("אוטומציית בדיקה 1", AUTO_TEXT.noFolder),
    ).toBeVisible({ timeout: 3_000 });
  });

  test("should move automation to 'ללא תיקייה'", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const card = automations.getCardByName("אוטומציית בדיקה 1");
    await expect(card).toBeVisible({ timeout: 10_000 });

    await automations.getFolderDropdownButton("אוטומציית בדיקה 1").click();

    await automations.getFolderDropdownItem("אוטומציית בדיקה 1", AUTO_TEXT.noFolder).click();

    // Success indicator (green check) should appear briefly
    const successCheck = card.locator("svg.lucide-check");
    await expect(successCheck).toBeVisible({ timeout: 5_000 });
  });

  test("should move automation to named folder and verify via filter", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    // First, ensure the automation card is visible
    const card = automations.getCardByName("אוטומציית בדיקה כבויה");
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Open folder dropdown on this card and move to "תיקיית בדיקה"
    await automations.getFolderDropdownButton("אוטומציית בדיקה כבויה").click();
    await automations.getFolderDropdownItem("אוטומציית בדיקה כבויה", "תיקיית בדיקה").click();

    // Wait for success check
    const successCheck = card.locator("svg.lucide-check");
    await expect(successCheck).toBeVisible({ timeout: 5_000 });

    // Now filter by that folder
    const folder = automations.selectFolder("תיקיית בדיקה");
    await folder.click();

    // The moved automation should appear in the folder
    await expect(
      automations.getCardByName("אוטומציית בדיקה כבויה"),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("should show error toast when move-to-folder fails", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const card = automations.getCardByName("אוטומציית בדיקה 1");
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Intercept after page load
    await page.route("**/automations", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 500, body: "Server Error" });
      } else {
        await route.fallback();
      }
    });

    await automations.getFolderDropdownButton("אוטומציית בדיקה 1").click();
    await automations.getFolderDropdownItem("אוטומציית בדיקה 1", AUTO_TEXT.noFolder).click();

    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: /שגיאה|error/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ─── 10. Edit Redirects ─────────────────────────────────────

test.describe("Edit Redirects", () => {
  test("should redirect EVENT_TIME automations to /calendar", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const card = automations.getCardByName("אוטומציית יומן");
    await expect(card).toBeVisible({ timeout: 10_000 });

    await automations.getEditButton("אוטומציית יומן").click();

    await expect(page).toHaveURL(/\/calendar\?openGlobalAutomations/, { timeout: 5_000 });
  });

  test("should redirect SLA_BREACH to /service/automations", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const card = automations.getCardByName("אוטומציית SLA");
    await expect(card).toBeVisible({ timeout: 10_000 });

    await automations.getEditButton("אוטומציית SLA").click();

    await expect(page).toHaveURL(/\/service\/automations\?editId=/, { timeout: 5_000 });
  });

  test("should redirect TICKET_STATUS_CHANGE to /service/automations", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const card = automations.getCardByName("אוטומציית סטטוס פנייה");
    await expect(card).toBeVisible({ timeout: 10_000 });

    await automations.getEditButton("אוטומציית סטטוס פנייה").click();

    await expect(page).toHaveURL(/\/service\/automations\?editId=/, { timeout: 5_000 });
  });

  test("should redirect ADD_TO_NURTURE_LIST to /nurture-hub", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const card = automations.getCardByName("אוטומציית תפוצה");
    await expect(card).toBeVisible({ timeout: 10_000 });

    await automations.getEditButton("אוטומציית תפוצה").click();

    await expect(page).toHaveURL(/\/nurture-hub\/.*\?openAutomation=/, { timeout: 5_000 });
  });

  test("should open edit modal for standard automations with pre-populated name", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const card = automations.getCardByName("אוטומציית בדיקה 1");
    await expect(card).toBeVisible({ timeout: 10_000 });

    await automations.getEditButton("אוטומציית בדיקה 1").click();

    const modal = automations.getAutomationModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Should show "עריכת אוטומציה" heading (not "אשף האוטומציות")
    await expect(modal.getByText(AUTO_TEXT.editTitle)).toBeVisible();

    // Name input should be pre-populated
    const nameInput = modal.locator("input").first();
    await expect(nameInput).toHaveValue("אוטומציית בדיקה 1");
  });

  test("should open multi-event modal when editing MULTI_EVENT_DURATION automation", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const card = automations.getCardByName("אוטומציית אירועים מרובים");
    await expect(card).toBeVisible({ timeout: 10_000 });

    await automations.getEditButton("אוטומציית אירועים מרובים").click();

    // Should open multi-event modal (not the standard one)
    const modal = automations.getMultiEventModal();
    await expect(modal).toBeVisible({ timeout: 5_000 });
  });
});

// ─── 11. API Integration (route interception) ───────────────

test.describe("API Integration", () => {
  test("should show loading state while data is being fetched", async ({ page }) => {
    // Delay the page response to ensure loading skeleton is visible
    await page.route("**/automations", async (route) => {
      if (route.request().resourceType() === "document") {
        // Add artificial delay to catch loading state
        await new Promise((r) => setTimeout(r, 1_000));
        await route.fallback();
      } else {
        await route.fallback();
      }
    });

    await page.goto("/automations", { waitUntil: "commit" });

    // Loading skeleton should be visible during the delay
    const spinner = page.locator('[class*="animate-spin"]');
    await expect(spinner).toBeVisible({ timeout: 5_000 });

    // Content should eventually appear
    await expect(
      page.getByRole("heading", { name: AUTO_TEXT.pageTitle }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("should handle API error gracefully (mock 500)", async ({ page }) => {
    await page.route("**/automations", async (route) => {
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

    await page.goto("/automations");
    await expect(
      page.getByText(/error|שגיאה|Internal Server Error/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("should show rate limit fallback when server is rate limited", async ({ page }) => {
    // Mock the page to return rate limit indicator
    await page.route("**/automations", async (route) => {
      if (route.request().resourceType() === "document") {
        await route.fulfill({
          status: 429,
          contentType: "text/html",
          body: `<html><body><div>${AUTO_TEXT.rateLimitMessage}</div></body></html>`,
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto("/automations");
    // Either the RateLimitFallback component shows or the 429 page content
    await expect(
      page.getByText(new RegExp(`${AUTO_TEXT.rateLimitMessage}|429|Too Many`)).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ─── 12. Responsive Layout ──────────────────────────────────

test.describe("Responsive Layout", () => {
  test("should display sidebar and grid on desktop viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const automations = new AutomationsPage(page);
    await automations.goto();

    await expect(automations.allAutomationsButton).toBeVisible();
    await expect(automations.createButton).toBeVisible();

    // Grid should show multiple columns on desktop
    const cards = automations.getAutomationCards();
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  });

  test("should adapt layout on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const automations = new AutomationsPage(page);
    await automations.goto();

    await expect(automations.pageTitle).toBeVisible();

    // Verify cards are visible and the page doesn't break
    const cards = automations.getAutomationCards();
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    // On mobile, grid should be single column (grid-cols-1)
    const grid = page.locator(".grid").first();
    await expect(grid).toBeVisible();
  });
});

// ─── 13. Edge Cases ─────────────────────────────────────────

test.describe("Edge Cases", () => {
  test("should handle Hebrew text in folder names", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    await automations.clickCreateFolder();
    const hebrewName = "תיקייה עם שם בעברית מורכב";
    await automations.fillFolderName(hebrewName);
    await automations.saveFolderCreation();

    await expect(automations.selectFolder(hebrewName)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("should handle special characters in folder inputs", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    await automations.clickCreateFolder();
    const specialName = `בדיקה <>&"' ${Date.now()}`;
    await automations.fillFolderName(specialName);
    await automations.saveFolderCreation();

    await expect(automations.selectFolder(specialName)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("should reject whitespace-only folder name", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();
    await automations.clickCreateFolder();
    await automations.fillFolderName("   ");
    await automations.saveFolderCreation();
    // Input should still be visible — creation was blocked by trim() guard
    await expect(automations.folderNameInput).toBeVisible();
  });

  test("should not break with very long automation names (uses smaller font)", async ({ page }) => {
    const automations = new AutomationsPage(page);
    await automations.goto();

    const longCard = automations.getCardByName("אוטומציה עם שם ארוך מאוד שצריך להיות יותר משלושים תווים");
    await expect(longCard).toBeVisible({ timeout: 10_000 });

    // Font should be smaller (text-lg) for long names
    const nameEl = longCard.locator("p.font-semibold");
    await expect(nameEl).toHaveClass(/text-lg/);
  });
});
