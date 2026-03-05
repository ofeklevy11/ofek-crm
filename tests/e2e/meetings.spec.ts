import { test, expect } from "@playwright/test";
import { MeetingsPage } from "./pages/MeetingsPage";

// ── A. Navigation & Page Load ──

test.describe("Navigation & Page Load", () => {
  test("should redirect unauthenticated user to /login", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/meetings");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("should load meetings page for authenticated user", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await expect(page).toHaveURL(/\/meetings/);
    await expect(mp.pageTitle).toBeVisible();
  });

  test("should show loading skeleton then resolve", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await expect(mp.pageTitle).toBeVisible({ timeout: 15_000 });
    await expect(mp.skeletons).toHaveCount(0, { timeout: 10_000 });
  });

  test("should display stats cards", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await expect(mp.statTotal).toBeVisible();
    await expect(mp.statPending).toBeVisible();
    await expect(mp.statConfirmed).toBeVisible();
    await expect(mp.statCompleted).toBeVisible();
  });

  test("should display all tabs for admin user", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await expect(mp.tabMeetings).toBeVisible();
    await expect(mp.tabCalendar).toBeVisible();
    await expect(mp.tabTypes).toBeVisible();
    await expect(mp.tabAvailability).toBeVisible();
  });

  test("should hide management tabs for non-manager user", async ({ browser }) => {
    const basicEmail = process.env.E2E_BASIC_USER_EMAIL;
    const basicPassword = process.env.E2E_BASIC_USER_PASSWORD;
    test.skip(!basicEmail || !basicPassword, "Basic user credentials not configured");

    const context = await browser.newContext();
    const page = await context.newPage();

    const resp = await page.request.post("/api/auth/login", {
      data: { email: basicEmail, password: basicPassword },
      headers: { "x-requested-with": "XMLHttpRequest" },
    });
    expect(resp.ok()).toBeTruthy();

    await page.goto("/meetings");
    const mp = new MeetingsPage(page);
    await mp.waitForLoad();

    await expect(mp.tabMeetings).toBeVisible();
    await expect(mp.tabCalendar).toBeVisible();
    await expect(mp.tabTypes).not.toBeVisible();
    await expect(mp.tabAvailability).not.toBeVisible();
    await context.close();
  });
});

// ── B. Meetings List Tab ──

test.describe("Meetings List Tab", () => {
  test("should show meetings table with correct columns", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();

    const headers = mp.tableHeaders;
    await expect(headers.filter({ hasText: "משתתף" })).toBeVisible();
    await expect(headers.filter({ hasText: "סוג" })).toBeVisible();
    await expect(headers.filter({ hasText: "תאריך" })).toBeVisible();
    await expect(headers.filter({ hasText: "שעה" })).toBeVisible();
    await expect(headers.filter({ hasText: "סטטוס" })).toBeVisible();
  });

  test("should display meeting rows with participant info", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();

    const rowCount = await mp.tableRows.count();
    test.skip(rowCount === 0, "No meetings available");

    const firstRow = mp.tableRows.first();
    await expect(firstRow).toBeVisible();
    await expect(
      firstRow.locator("text=/ממתין|מאושר|הושלם|בוטל|לא הגיע/")
    ).toBeVisible();
  });

  test("should filter by status", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();

    await mp.statusSelect.click();
    await page.getByRole("option", { name: "ממתין" }).click();

    // Wait for table to update — rely on assertion auto-retry
    await expect(mp.tableRows.first()).toBeVisible({ timeout: 5_000 });

    const rows = await mp.tableRows.count();
    for (let i = 0; i < rows; i++) {
      await expect(
        mp.tableRows.nth(i).locator("text=ממתין")
      ).toBeVisible();
    }
  });

  test("should filter by meeting type", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();

    await mp.typeSelect.click();
    const options = page.getByRole("option");
    const optionCount = await options.count();
    test.skip(optionCount <= 1, "Only one option in type select");

    const typeName = await options.nth(1).textContent();
    await options.nth(1).click();

    // Wait for filter to apply — rely on assertion auto-retry
    await expect(mp.tableRows.first()).toBeVisible({ timeout: 5_000 });

    const rows = await mp.tableRows.count();
    test.skip(rows === 0 || !typeName, "No rows match the selected type filter");
    await expect(mp.tableRows.first()).toContainText(typeName!);
  });

  test("should search by participant name", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();

    const rowsBefore = await mp.tableRows.count();
    test.skip(rowsBefore === 0, "No meetings available to test search");

    await mp.searchInput.fill("test");
    await expect(mp.searchInput).toHaveValue("test");

    // Client-side search — verify search actually affects the table
    await expect(mp.table).toBeVisible();
    const rowsAfter = await mp.tableRows.count();
    expect(rowsAfter).toBeLessThanOrEqual(rowsBefore);
    // If count didn't change, verify rows contain the search term
    if (rowsAfter === rowsBefore && rowsBefore > 0) {
      const rows = await mp.tableRows.count();
      for (let i = 0; i < rows; i++) {
        await expect(mp.tableRows.nth(i)).toContainText(/test/i);
      }
    }
  });

  test("should show clear filter badge when status filtered", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();

    await mp.statusSelect.click();
    await page.getByRole("option", { name: "ממתין" }).click();

    // Badge with X icon to clear filter
    const clearBadge = page.locator("[class*='badge'], [class*='Badge']").filter({ has: page.locator("svg") });
    await expect(clearBadge.first()).toBeVisible();
  });

  test("should paginate meetings", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();

    const paginationVisible = await page.locator("text=/\\d+ \\/ \\d+/").isVisible().catch(() => false);
    test.skip(!paginationVisible, "Not enough data for pagination");

    const paginationText = await page.locator("text=/\\d+ \\/ \\d+/").textContent();
    expect(paginationText).toMatch(/1 \/ \d+/);

    if (await mp.paginationNext.isEnabled()) {
      await mp.paginationNext.click();
      await expect(page.locator("text=/2 \\/ \\d+/")).toBeVisible();
    }
  });

  test("should open meeting detail modal on row click", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();

    const rowCount = await mp.tableRows.count();
    test.skip(rowCount === 0, "No meetings available");

    await mp.openMeetingDetail(0);
    await expect(mp.detailModal).toBeVisible();
  });
});

// ── C. Meeting Detail Modal ──

// Serial: these tests mutate real data (status, notes, tags, cancel). Cancel is last.
test.describe.serial("Meeting Detail Modal", () => {
  async function openFirstMeeting(page: import("@playwright/test").Page) {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    const count = await mp.tableRows.count();
    test.skip(count === 0, "No meetings available to test detail modal");
    await mp.openMeetingDetail(0);
    return mp;
  }

  test("should display participant info", async ({ page }) => {
    const mp = await openFirstMeeting(page);
    await expect(mp.detailParticipantSection).toBeVisible();
  });

  test("should display date and time", async ({ page }) => {
    const mp = await openFirstMeeting(page);
    // Verify Hebrew weekday name is visible (component uses toLocaleDateString he-IL)
    await expect(
      mp.detailModal.locator("text=/יום|ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת/").first()
    ).toBeVisible({ timeout: 3_000 });
    // Verify time in HH:MM format
    await expect(
      mp.detailModal.locator("text=/\\d{2}:\\d{2}/").first()
    ).toBeVisible({ timeout: 3_000 });
  });

  test("should allow status change via dropdown", async ({ page }) => {
    const mp = await openFirstMeeting(page);

    const statusLabel = mp.detailModal.getByText("שנה סטטוס:");
    const isVisible = await statusLabel.isVisible().catch(() => false);
    test.skip(!isVisible, "Status change not available for this meeting");

    await mp.detailStatusSelect.click();
    await page.getByRole("option", { name: "מאושר" }).click();
    await expect(page.getByText("סטטוס עודכן")).toBeVisible({ timeout: 5_000 });
  });

  test("should save notes", async ({ page }) => {
    const mp = await openFirstMeeting(page);
    await mp.detailNotesBefore.fill("הערה לפני");
    await mp.detailNotesAfter.fill("הערה אחרי");
    await mp.detailSaveNotesButton.click();

    await expect(page.getByText("הערות נשמרו")).toBeVisible({ timeout: 5_000 });
  });

  test("should add a tag", async ({ page }) => {
    const mp = await openFirstMeeting(page);
    await mp.detailTagInput.fill("VIP");
    await mp.detailAddTagButton.click();

    await expect(page.getByText("תגית נוספה")).toBeVisible({ timeout: 5_000 });
  });

  test("should add a tag via Enter key", async ({ page }) => {
    const mp = await openFirstMeeting(page);
    await mp.detailTagInput.fill("urgent");
    await mp.detailTagInput.press("Enter");

    await expect(page.getByText("תגית נוספה")).toBeVisible({ timeout: 5_000 });
  });

  test("should remove a tag", async ({ page }) => {
    const mp = await openFirstMeeting(page);

    const tagBadges = mp.detailModal.locator("[class*='badge'], [class*='Badge']").filter({ has: page.locator("svg") });
    const tagCount = await tagBadges.count();
    test.skip(tagCount === 0, "No tags to remove");

    await tagBadges.first().locator("svg").click();
    await expect(page.getByText("תגית הוסרה")).toBeVisible({ timeout: 5_000 });
  });

  test("should copy manage link to clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const mp = await openFirstMeeting(page);
    await mp.detailCopyManageLinkButton.click();
    await expect(page.getByText("קישור ניהול הועתק")).toBeVisible({ timeout: 5_000 });
  });

  test("should show cancellation info for cancelled meeting", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();

    await mp.statusSelect.click();
    await page.getByRole("option", { name: "בוטל" }).click();

    // Wait for table to reflect the cancelled filter
    await expect(
      mp.tableRows.first().or(page.getByText("אין פגישות"))
    ).toBeVisible({ timeout: 8_000 });

    const count = await mp.tableRows.count();
    test.skip(count === 0, "No cancelled meetings available");

    await mp.openMeetingDetail(0);
    await expect(
      mp.detailModal.locator("text=/בוטל על ידי/")
    ).toBeVisible();
  });

  test("should show per-meeting automations section", async ({ page }) => {
    const mp = await openFirstMeeting(page);
    const isVisible = await mp.detailAutomationsSection.isVisible().catch(() => false);
    test.skip(!isVisible, "Automations not shown for this meeting status");

    await expect(mp.detailAutomationsSection).toBeVisible();
    await expect(
      mp.detailModal.getByRole("button", { name: "הוסף אוטומציה" })
    ).toBeVisible();
  });

  test("should show linked client info in detail modal", async ({ page }) => {
    const mp = await openFirstMeeting(page);
    // If this meeting has a linked client, we should see client section
    const clientSection = mp.detailModal.getByText(/לקוח מקושר|פרטי לקוח/);
    const isVisible = await clientSection.isVisible().catch(() => false);
    test.skip(!isVisible, "No linked client for this meeting");
    await expect(clientSection).toBeVisible();
  });

  // Last: permanently changes meeting status
  test("should show cancel form and cancel meeting", async ({ page }) => {
    const mp = await openFirstMeeting(page);

    const cancelVisible = await mp.detailCancelButton.isVisible().catch(() => false);
    test.skip(!cancelVisible, "Cancel button not available for this meeting");

    await mp.detailCancelButton.click();
    await expect(mp.detailCancelReasonTextarea).toBeVisible();
    await mp.detailCancelReasonTextarea.fill("סיבת ביטול טסט");
    await mp.detailConfirmCancelButton.click();
    await expect(page.getByText("הפגישה בוטלה")).toBeVisible({ timeout: 5_000 });
  });
});

// ── D. Meeting Types Tab (Admin) ──

test.describe("Meeting Types Tab", () => {
  test("should display meeting type cards or empty state", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("types");

    // Either cards or empty state must be present
    const hasCards = (await mp.typesGrid.locator("> div").count()) > 0;
    const hasEmpty = await mp.typesEmptyState.isVisible().catch(() => false);
    expect(hasCards || hasEmpty).toBe(true);
  });

  test('should open create wizard on "סוג חדש" click', async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("types");

    await mp.openNewTypeWizard();
    await expect(mp.typeModal).toBeVisible();
    await expect(mp.typeModalTitle).toContainText("סוג פגישה חדש");
  });

  test("should walk through 4-step wizard", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("types");
    await mp.openNewTypeWizard();

    // Step 1 - Basic info
    await mp.fillTypeStep1("פגישת ייעוץ", "תיאור טסט");
    await expect(mp.typeNameInput).toHaveValue("פגישת ייעוץ");

    // Advance to step 2
    await mp.advanceWizardStep();
    await expect(mp.bufferBeforeInput).toBeVisible();

    // Advance to step 3
    await mp.advanceWizardStep();
    await expect(mp.dailyLimitInput).toBeVisible();

    // Advance to step 4
    await mp.advanceWizardStep();
    await expect(mp.addFieldButton).toBeVisible();
  });

  test("should validate name is required in step 1", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("types");
    await mp.openNewTypeWizard();

    await mp.typeNameInput.fill("");
    await expect(mp.wizardNextButton).toBeDisabled();
  });

  test("should auto-generate slug from name", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("types");
    await mp.openNewTypeWizard();

    // Use ASCII name so generateSlug produces a non-empty result
    await mp.typeNameInput.fill("test meeting");
    await expect(mp.typeSlugInput).toHaveValue(/test-meeting/, { timeout: 2_000 });
  });

  test("should show live preview panel updating in real-time", async ({ page }) => {
    test.skip(page.viewportSize()!.width < 640, "Preview hidden on mobile");

    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("types");
    await mp.openNewTypeWizard();

    await mp.typeNameInput.fill("פגישת ייעוץ חדשה");

    const preview = mp.typeModal.locator(".hidden.sm\\:block, [class*='sm:block']");
    await expect(preview).toContainText("פגישת ייעוץ חדשה");
  });

  test("should create meeting type and show confetti", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("types");
    await mp.openNewTypeWizard();

    const uniqueName = `טסט-${Date.now()}`;
    await mp.fillTypeStep1(uniqueName);
    await mp.advanceWizardStep();
    await mp.advanceWizardStep();
    await mp.advanceWizardStep();

    await mp.wizardCreateButton.click();
    await expect(page.getByText("סוג פגישה נוצר")).toBeVisible({ timeout: 10_000 });
  });

  test("should edit existing meeting type", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("types");

    // Icon-only edit button uses lucide-pencil SVG
    const editButton = page.locator("button").filter({ has: page.locator("svg.lucide-pencil") }).first();
    const exists = await editButton.isVisible().catch(() => false);
    test.skip(!exists, "No meeting types to edit");

    await editButton.click();
    await expect(mp.typeModal).toBeVisible();
    await expect(mp.typeModalTitle).toContainText("עריכת סוג פגישה");
    const nameValue = await mp.typeNameInput.inputValue();
    expect(nameValue.length).toBeGreaterThan(0);
  });

  test("should toggle active/inactive", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("types");

    const switchButton = page.locator("[role='switch']").first();
    const exists = await switchButton.isVisible().catch(() => false);
    test.skip(!exists, "No meeting types with toggle");

    await switchButton.click();
    await expect(
      page.getByText(/סוג פגישה הופעל|סוג פגישה כובה/)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("should delete meeting type", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("types");

    // First create one to delete
    await mp.openNewTypeWizard();
    const name = `למחיקה-${Date.now()}`;
    await mp.fillTypeStep1(name);
    await mp.advanceWizardStep();
    await mp.advanceWizardStep();
    await mp.advanceWizardStep();
    await mp.wizardCreateButton.click();
    await expect(page.getByText("סוג פגישה נוצר")).toBeVisible({ timeout: 10_000 });

    // Wait for modal to close and card to appear
    await expect(mp.typeModal).not.toBeVisible({ timeout: 5_000 });

    // Find and delete the created type using icon-only trash button
    const card = mp.getTypeCardByName(name);
    const deleteButton = mp.getTypeDeleteButton(card);
    await deleteButton.click();

    // Confirm delete in AlertDialog
    const confirmDelete = page.getByRole("alertdialog").getByRole("button", { name: "מחק" });
    await confirmDelete.click();

    await expect(page.getByText("סוג פגישה נמחק")).toBeVisible({ timeout: 5_000 });
  });

  test("should copy share link on meeting type card", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("types");

    const copyButton = page.locator("button").filter({ has: page.locator("svg.lucide-link") }).first();
    const exists = await copyButton.isVisible().catch(() => false);
    test.skip(!exists, "No meeting types with copy link");

    await copyButton.click();
    // After clicking, icon changes to check mark
    await expect(
      page.locator("svg.lucide-check").first()
    ).toBeVisible({ timeout: 3_000 });
  });
});

// ── E. Calendar Tab ──

test.describe("Calendar Tab", () => {
  test("should render calendar with month view", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("calendar");

    await expect(page.locator("table, [class*='calendar']")).toBeVisible();
  });

  test("should show meetings for selected day", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("calendar");

    const today = new Date().getDate().toString();
    const dayButton = page.locator("button").filter({ hasText: new RegExp(`^${today}$`) }).first();
    await expect(dayButton).toBeVisible({ timeout: 3_000 });
    await dayButton.click();

    // Side panel should show meetings or empty message
    const panelContent = page.locator("text=/פגישות ליום|אין פגישות ביום זה/");
    await expect(panelContent).toBeVisible({ timeout: 5_000 });
  });

  test("should filter calendar by status and type", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("calendar");

    const statusSelect = page.locator("button").filter({ hasText: "כל הסטטוסים" });
    await expect(statusSelect).toBeVisible({ timeout: 3_000 });

    await statusSelect.click();
    await page.getByRole("option", { name: "מאושר" }).click();

    // After selecting, the trigger text changes — verify "מאושר" is now shown
    await expect(page.locator("button").filter({ hasText: "מאושר" })).toBeVisible({ timeout: 3_000 });
  });
});

// ── E2. Availability Tab ──

test.describe("Availability Tab", () => {
  test("should display weekly schedule editor", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("availability");

    // Should show day names for the weekly schedule
    await expect(page.getByText("ראשון")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("שני")).toBeVisible();

    // Should show the save button
    await expect(page.getByRole("button", { name: "שמור זמינות" })).toBeVisible();
  });

  test("should apply preset schedule", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("availability");

    // Click the "עסקי רגיל 9-17" preset button
    const presetButton = page.getByRole("button", { name: /עסקי רגיל 9-17/ });
    await expect(presetButton).toBeVisible({ timeout: 5_000 });
    await presetButton.click();

    // After applying preset, time inputs should contain 09:00 and 17:00
    const timeInputs = page.locator("input[type='time']");
    await expect(timeInputs.first()).toHaveValue("09:00");
  });

  test("should toggle day on/off", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("availability");

    // Find a day toggle switch
    const daySwitch = page.locator("[role='switch']").first();
    await expect(daySwitch).toBeVisible({ timeout: 5_000 });

    // Toggle it
    const wasChecked = await daySwitch.getAttribute("data-state");
    await daySwitch.click();

    // State should change
    const newState = await daySwitch.getAttribute("data-state");
    expect(newState).not.toBe(wasChecked);
  });

  test("should save availability and show success toast", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("availability");

    // Apply a preset to ensure there are unsaved changes
    const presetButton = page.getByRole("button", { name: /עסקי רגיל 9-17/ });
    await expect(presetButton).toBeVisible({ timeout: 5_000 });
    await presetButton.click();

    // Click save — note: this modifies real company availability data
    const saveButton = page.getByRole("button", { name: "שמור זמינות" });
    await saveButton.click();

    // Should show success toast
    await expect(page.getByText("הזמינות נשמרה בהצלחה")).toBeVisible({ timeout: 10_000 });
  });

  test("should display availability blocks section", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("availability");

    // Blocks section should be visible with add button
    await expect(page.getByText("חסימות זמינות")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /הוסף חסימה/ })).toBeVisible();
  });

  test("should create and delete an availability block", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("availability");

    // Click add block button
    const addBlockBtn = page.getByRole("button", { name: /הוסף חסימה/ });
    await expect(addBlockBtn).toBeVisible({ timeout: 5_000 });
    await addBlockBtn.click();

    // Fill block form — title field with placeholder "חופשה, חג..."
    const titleInput = page.getByPlaceholder("חופשה, חג...");
    await expect(titleInput).toBeVisible({ timeout: 3_000 });
    const blockName = `חסימת-טסט-${Date.now()}`;
    await titleInput.fill(blockName);

    // Fill start and end dates (tomorrow and day after)
    const dateInputs = page.locator("input[type='date']");
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 2);
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    await dateInputs.first().fill(fmt(startDate));
    await dateInputs.nth(1).fill(fmt(endDate));

    // Save the block — scope button to the dialog to avoid matching "שמור זמינות"
    const dialog = page.getByRole("dialog");
    const saveBlockBtn = dialog.getByRole("button", { name: /שמור|צור|הוסף/ });
    await saveBlockBtn.click();

    // Verify block appears
    await expect(page.getByText(blockName)).toBeVisible({ timeout: 5_000 });

    // Delete the block — find trash button near the block text
    const blockRow = page.locator("div.border-r-red-300").filter({ hasText: blockName });
    const deleteBtn = blockRow.locator("button[title='מחק חסימה']");
    await deleteBtn.click();

    // Confirm deletion in AlertDialog (always shown per source)
    const confirmDelete = page.getByRole("alertdialog").getByRole("button", { name: "מחק" });
    await expect(confirmDelete).toBeVisible({ timeout: 3_000 });
    await confirmDelete.click();

    await expect(page.getByText(blockName)).not.toBeVisible({ timeout: 5_000 });
  });

  test("should show error toast when availability save fails", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("availability");

    // Apply preset to create a dirty state
    const presetButton = page.getByRole("button", { name: /עסקי רגיל 9-17/ });
    await expect(presetButton).toBeVisible({ timeout: 5_000 });
    await presetButton.click();

    // Intercept server action to fail
    await page.route("**/*", async (route) => {
      const headers = route.request().headers();
      if (route.request().method() === "POST" && headers["next-action"]) {
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({ success: false, error: "Save failed" })}\n`,
        });
        return;
      }
      await route.fallback();
    });

    const saveButton = page.getByRole("button", { name: "שמור זמינות" });
    await saveButton.click();

    await expect(page.getByText("שגיאה בשמירת הזמינות")).toBeVisible({ timeout: 5_000 });
  });

  test("should show validation toast when block dates are missing", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("availability");

    const addBlockBtn = page.getByRole("button", { name: /הוסף חסימה/ });
    await addBlockBtn.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 3_000 });

    // Try to save without filling dates
    const saveBlockBtn = dialog.getByRole("button", { name: /שמור|צור|הוסף/ });
    await saveBlockBtn.click();

    await expect(page.getByText("יש לבחור תאריך התחלה ותאריך סיום")).toBeVisible({ timeout: 3_000 });
  });

  test("should show validation toast when block end date is before start date", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("availability");

    const addBlockBtn = page.getByRole("button", { name: /הוסף חסימה/ });
    await addBlockBtn.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 3_000 });

    const dateInputs = dialog.locator("input[type='date']");
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const fmt = (d: Date) => d.toISOString().split("T")[0];

    await dateInputs.first().fill(fmt(today));
    await dateInputs.nth(1).fill(fmt(yesterday));

    const saveBlockBtn = dialog.getByRole("button", { name: /שמור|צור|הוסף/ });
    await saveBlockBtn.click();

    await expect(page.getByText("תאריך הסיום חייב להיות אחרי תאריך ההתחלה")).toBeVisible({ timeout: 3_000 });
  });
});

// ── F. Automations ──

test.describe("Automations", () => {
  test("should open global automations modal", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();

    const isVisible = await mp.automationsButton.isVisible().catch(() => false);
    test.skip(!isVisible, "Automations button not visible");

    await mp.automationsButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

// ── I. Error Handling ──

test.describe("Error Handling", () => {
  test("should show error toast on meetings fetch failure", async ({ page }) => {
    await page.route("**/*", async (route) => {
      const headers = route.request().headers();
      if (route.request().method() === "POST" && headers["next-action"]) {
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({ success: false, error: "Server error" })}\n`,
        });
        return;
      }
      await route.fallback();
    });

    await page.goto("/meetings");

    // Should show error toast or error state — use specific text to catch regressions
    await expect(page.getByText("שגיאה בטעינת פגישות").first()).toBeVisible({ timeout: 10_000 });
  });

  test("should handle status update error", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();

    const rowCount = await mp.tableRows.count();
    test.skip(rowCount === 0, "No meetings available");

    await mp.openMeetingDetail(0);

    // Mock the status update to fail
    await page.route("**/*", async (route) => {
      const headers = route.request().headers();
      if (route.request().method() === "POST" && headers["next-action"]) {
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({ success: false, error: "Update failed" })}\n`,
        });
        return;
      }
      await route.fallback();
    });

    const statusLabel = mp.detailModal.getByText("שנה סטטוס:");
    const isVisible = await statusLabel.isVisible().catch(() => false);
    test.skip(!isVisible, "Status change not available for this meeting");

    await mp.detailStatusSelect.click();
    await page.getByRole("option", { name: "מאושר" }).click();

    // Should show error toast
    await expect(page.getByText("שגיאה בעדכון סטטוס")).toBeVisible({ timeout: 5_000 });
  });

  test("should handle notes save error", async ({ page }) => {
    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();

    const rowCount = await mp.tableRows.count();
    test.skip(rowCount === 0, "No meetings available");

    await mp.openMeetingDetail(0);

    // Mock failure after modal opens
    await page.route("**/*", async (route) => {
      const headers = route.request().headers();
      if (route.request().method() === "POST" && headers["next-action"]) {
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({ success: false, error: "Save failed" })}\n`,
        });
        return;
      }
      await route.fallback();
    });

    await mp.detailNotesBefore.fill("טסט הערה");
    await mp.detailSaveNotesButton.click();

    // Should show error toast
    await expect(page.getByText("שגיאה בשמירת הערות")).toBeVisible({ timeout: 5_000 });
  });
});

// ── J. Responsive Layout ──

test.describe("Responsive Layout", () => {
  test("should hide preview panel on mobile in meeting type wizard", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();
    await mp.switchToTab("types");
    await mp.openNewTypeWizard();

    const previewPanel = mp.typeModal.locator(".hidden.sm\\:block");
    await expect(previewPanel).toBeHidden();
  });

  test("should stack stats cards on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const mp = new MeetingsPage(page);
    await mp.goto();
    await mp.waitForLoad();

    const grid = page.locator("[class*='grid-cols-2']").first();
    await expect(grid).toBeVisible();
  });
});
