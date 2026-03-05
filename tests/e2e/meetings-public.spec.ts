import { test, expect } from "@playwright/test";
import { PublicBookingPage } from "./pages/PublicBookingPage";
import { ManageMeetingPage } from "./pages/ManageMeetingPage";
import { mockApiRoute } from "./helpers/test-utils";

const SHARE_TOKEN = process.env.E2E_MEETING_SHARE_TOKEN || "testtoken123";
const MANAGE_TOKEN = process.env.E2E_MEETING_MANAGE_TOKEN || "managetoken123";

const MOCK_MEETING_TYPE = {
  id: 1,
  name: "פגישת ייעוץ",
  description: "פגישת ייעוץ אישית",
  duration: 30,
  color: "#8B5CF6",
  customFields: [] as { label: string; type: string; required: boolean }[],
  minAdvanceHours: 2,
  maxAdvanceDays: 30,
  company: { name: "חברת טסט", logoUrl: null },
  availableDays: [0, 1, 2, 3, 4, 5, 6],
};

// Use tomorrow's date for all slot mocks
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowISO = tomorrow.toISOString().replace(/T.*/, "");
const tomorrowDay = tomorrow.getDate();

const MOCK_SLOTS = {
  slots: [
    { start: `${tomorrowISO}T09:00:00.000Z`, end: `${tomorrowISO}T09:30:00.000Z` },
    { start: `${tomorrowISO}T10:00:00.000Z`, end: `${tomorrowISO}T10:30:00.000Z` },
    { start: `${tomorrowISO}T11:00:00.000Z`, end: `${tomorrowISO}T11:30:00.000Z` },
  ],
};

const MOCK_BOOK_RESPONSE = {
  success: true,
  manageToken: "manage123",
};

const MOCK_MANAGE_MEETING = {
  participantName: "ישראל ישראלי",
  participantEmail: "israel@example.com",
  participantPhone: "050-1234567",
  startTime: `${tomorrowISO}T09:00:00.000Z`,
  endTime: `${tomorrowISO}T09:30:00.000Z`,
  status: "CONFIRMED",
  notesBefore: null,
  cancelReason: null,
  cancelledAt: null,
  meetingType: { name: "פגישת ייעוץ", duration: 30, color: "#8B5CF6", shareToken: SHARE_TOKEN },
  company: { name: "חברת טסט", logoUrl: null },
};

/** Setup mocks for booking page: meeting type + slots */
async function setupBookingMocks(
  page: import("@playwright/test").Page,
  options?: { slots?: typeof MOCK_SLOTS; bookResponse?: unknown }
) {
  await mockApiRoute(page, `**/api/p/meetings/${SHARE_TOKEN}`, {
    body: MOCK_MEETING_TYPE,
  });
  await mockApiRoute(page, `**/api/p/meetings/${SHARE_TOKEN}/slots*`, {
    body: options?.slots ?? MOCK_SLOTS,
  });
  if (options?.bookResponse) {
    await mockApiRoute(page, `**/api/p/meetings/${SHARE_TOKEN}/book`, {
      body: options.bookResponse,
    });
  }
}

/** Navigate to form step: load page → select date → select slot */
async function navigateToForm(booking: PublicBookingPage, page: import("@playwright/test").Page) {
  await booking.goto(SHARE_TOKEN);
  await expect(page.getByText(MOCK_MEETING_TYPE.name)).toBeVisible({ timeout: 10_000 });
  await booking.navigateToForm(tomorrowDay);
}

// ── G. Public Booking Page ──

test.describe("Public Booking Page", () => {
  test("should load booking page with meeting type info", async ({ page }) => {
    await setupBookingMocks(page, { slots: { slots: [] } });

    const booking = new PublicBookingPage(page);
    await booking.goto(SHARE_TOKEN);

    await expect(page.getByText(MOCK_MEETING_TYPE.name)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("30 דקות")).toBeVisible();
    await expect(page.getByText(MOCK_MEETING_TYPE.company.name)).toBeVisible();
  });

  test("should show 404 for invalid token", async ({ page }) => {
    await mockApiRoute(page, "**/api/p/meetings/invalidtoken*", {
      status: 404,
      body: { error: "Not found" },
    });

    await page.goto("/p/meetings/invalidtoken");
    await expect(page.getByText("לא ניתן לטעון את פרטי הפגישה").first()).toBeVisible({ timeout: 10_000 });
  });

  test("should display calendar for date selection", async ({ page }) => {
    await setupBookingMocks(page, { slots: { slots: [] } });

    const booking = new PublicBookingPage(page);
    await booking.goto(SHARE_TOKEN);
    await expect(page.getByText(MOCK_MEETING_TYPE.name)).toBeVisible({ timeout: 10_000 });

    await expect(booking.datePrompt).toBeVisible();
  });

  test("should display timezone on booking page", async ({ page }) => {
    await setupBookingMocks(page, { slots: { slots: [] } });

    const booking = new PublicBookingPage(page);
    await booking.goto(SHARE_TOKEN);
    await expect(page.getByText(MOCK_MEETING_TYPE.name)).toBeVisible({ timeout: 10_000 });

    await expect(booking.timezone).toBeVisible();
  });

  test("should load time slots when date is selected", async ({ page }) => {
    await setupBookingMocks(page);

    const booking = new PublicBookingPage(page);
    await booking.goto(SHARE_TOKEN);
    await expect(page.getByText(MOCK_MEETING_TYPE.name)).toBeVisible({ timeout: 10_000 });

    const dayButton = page.locator("button").filter({ hasText: new RegExp(`^${tomorrowDay}$`) }).first();
    await expect(dayButton).toBeVisible();
    await dayButton.click();

    // Wait for slot buttons to appear
    const slotButtons = page.locator("button").filter({ hasText: /^\d{2}:\d{2}$/ });
    await expect(slotButtons.first()).toBeVisible({ timeout: 5_000 });
    expect(await slotButtons.count()).toBeGreaterThan(0);
  });

  test('should show "no slots" message for unavailable date', async ({ page }) => {
    await setupBookingMocks(page, { slots: { slots: [] } });

    const booking = new PublicBookingPage(page);
    await booking.goto(SHARE_TOKEN);
    await expect(page.getByText(MOCK_MEETING_TYPE.name)).toBeVisible({ timeout: 10_000 });

    const dayButton = page.locator("button").filter({ hasText: new RegExp(`^${tomorrowDay}$`) }).first();
    await expect(dayButton).toBeVisible();
    await dayButton.click();

    await expect(booking.noSlotsMessage).toBeVisible({ timeout: 5_000 });
  });

  test('should show "pick another date" link after no slots', async ({ page }) => {
    await setupBookingMocks(page, { slots: { slots: [] } });

    const booking = new PublicBookingPage(page);
    await booking.goto(SHARE_TOKEN);
    await expect(page.getByText(MOCK_MEETING_TYPE.name)).toBeVisible({ timeout: 10_000 });

    const dayButton = page.locator("button").filter({ hasText: new RegExp(`^${tomorrowDay}$`) }).first();
    await expect(dayButton).toBeVisible();
    await dayButton.click();

    await expect(booking.noSlotsMessage).toBeVisible({ timeout: 5_000 });
    await expect(booking.pickAnotherDateLink).toBeVisible();
  });

  test("should fill booking form and submit", async ({ page }) => {
    await setupBookingMocks(page, { bookResponse: MOCK_BOOK_RESPONSE });

    const booking = new PublicBookingPage(page);
    await navigateToForm(booking, page);

    await booking.fillBookingForm({
      name: "ישראל ישראלי",
      email: "test@test.com",
      phone: "050-1234567",
    });

    // Capture the booking request payload
    const bookRequestPromise = page.waitForRequest(
      (req) => req.url().includes(`/api/p/meetings/${SHARE_TOKEN}/book`) && req.method() === "POST"
    );

    await booking.submitBooking();

    const bookRequest = await bookRequestPromise;
    const body = bookRequest.postDataJSON();
    expect(body).toHaveProperty("participantName", "ישראל ישראלי");
    expect(body).toHaveProperty("participantEmail", "test@test.com");
    expect(body).toHaveProperty("participantPhone", "050-1234567");
    expect(body).toHaveProperty("startTime");

    await expect(booking.successTitle).toBeVisible({ timeout: 10_000 });
  });

  test("should navigate back from form to slot selection", async ({ page }) => {
    await setupBookingMocks(page);

    const booking = new PublicBookingPage(page);
    await navigateToForm(booking, page);

    // Click back button
    await booking.backButton.click();

    // Should see time slots again
    const slotButtons = page.locator("button").filter({ hasText: /^\d{2}:\d{2}$/ });
    await expect(slotButtons.first()).toBeVisible({ timeout: 5_000 });
  });

  test("should show validation error when name is empty", async ({ page }) => {
    await setupBookingMocks(page);

    const booking = new PublicBookingPage(page);
    await navigateToForm(booking, page);

    // Submit without filling name
    await booking.submitBooking();

    // Should show validation error
    await expect(booking.formError).toBeVisible({ timeout: 3_000 });
  });

  test("should show success state with confetti after booking", async ({ page }) => {
    await setupBookingMocks(page, { bookResponse: MOCK_BOOK_RESPONSE });

    const booking = new PublicBookingPage(page);
    await navigateToForm(booking, page);

    await booking.fillBookingForm({ name: "ישראל" });
    await booking.submitBooking();

    await expect(booking.successTitle).toBeVisible({ timeout: 10_000 });
    await expect(booking.googleCalendarLink).toBeVisible();
  });

  test("should cancel meeting from booking success screen", async ({ page }) => {
    await setupBookingMocks(page, { bookResponse: MOCK_BOOK_RESPONSE });

    // Mock the cancel endpoint that will be called with the manageToken from MOCK_BOOK_RESPONSE
    await page.route("**/api/p/meetings/manage/manage123/cancel", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.fallback();
      }
    });

    const booking = new PublicBookingPage(page);
    await navigateToForm(booking, page);

    await booking.fillBookingForm({ name: "ישראל" });
    await booking.submitBooking();
    await expect(booking.successTitle).toBeVisible({ timeout: 10_000 });

    // Click cancel on success screen
    await booking.cancelButton.click();
    await expect(booking.cancelTitle).toBeVisible();

    // Fill reason and confirm
    await booking.cancelReasonTextarea.fill("סיבת ביטול");
    await booking.confirmCancelButton.click();

    await expect(booking.cancelledTitle).toBeVisible({ timeout: 10_000 });
    await expect(booking.bookNewLink).toBeVisible();
  });

  test("should reschedule meeting from booking success screen", async ({ page }) => {
    await setupBookingMocks(page, { bookResponse: MOCK_BOOK_RESPONSE });

    // Mock reschedule endpoint
    await page.route("**/api/p/meetings/manage/manage123/reschedule", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            startTime: `${tomorrowISO}T10:00:00.000Z`,
            endTime: `${tomorrowISO}T10:30:00.000Z`,
          }),
        });
      } else {
        await route.fallback();
      }
    });

    const booking = new PublicBookingPage(page);
    await navigateToForm(booking, page);

    await booking.fillBookingForm({ name: "ישראל" });
    await booking.submitBooking();
    await expect(booking.successTitle).toBeVisible({ timeout: 10_000 });

    // Click reschedule on success screen
    await booking.rescheduleButton.click();
    await expect(booking.rescheduleTitle).toBeVisible({ timeout: 5_000 });

    // Select a date from the 7-column grid
    const dateGrid = page.locator(".grid.grid-cols-7");
    const enabledDateButton = dateGrid.locator("button:enabled").first();
    await expect(enabledDateButton).toBeVisible({ timeout: 5_000 });
    await enabledDateButton.click();

    // Wait for slots to load and select one
    const slotButtons = page.locator("button").filter({ hasText: /^\d{2}:\d{2}$/ });
    await expect(slotButtons.first()).toBeVisible({ timeout: 5_000 });
    await slotButtons.first().click();

    // Confirm reschedule
    const confirmButton = page.getByRole("button", { name: /אישור|שמור|עדכן/ });
    await confirmButton.click();

    // Reschedule panel should close and return to success screen
    await expect(booking.rescheduleTitle).not.toBeVisible({ timeout: 10_000 });
    await expect(booking.successTitle).toBeVisible({ timeout: 5_000 });
  });

  test("should handle booking race condition (slot taken)", async ({ page }) => {
    await setupBookingMocks(page);
    // Override book response with error
    await page.route(`**/api/p/meetings/${SHARE_TOKEN}/book`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Slot is no longer available" }),
        });
      } else {
        await route.fallback();
      }
    });

    const booking = new PublicBookingPage(page);
    await navigateToForm(booking, page);

    await booking.fillBookingForm({ name: "ישראל" });
    await booking.submitBooking();

    // Should show error (not success screen)
    await expect(booking.successTitle).not.toBeVisible({ timeout: 5_000 });
    // Should show error message
    await expect(page.getByText("Slot is no longer available").first()).toBeVisible({ timeout: 5_000 });
  });

  test("should render custom fields from meeting type", async ({ page }) => {
    const typeWithCustomFields = {
      ...MOCK_MEETING_TYPE,
      customFields: [
        { id: "company", label: "חברה", type: "text", required: true },
        { id: "employee-count", label: "מספר עובדים", type: "number", required: false },
      ],
    };

    await mockApiRoute(page, `**/api/p/meetings/${SHARE_TOKEN}`, {
      body: typeWithCustomFields,
    });
    await mockApiRoute(page, `**/api/p/meetings/${SHARE_TOKEN}/slots*`, {
      body: MOCK_SLOTS,
    });

    const booking = new PublicBookingPage(page);
    await navigateToForm(booking, page);

    await expect(page.getByText("חברה")).toBeVisible();
    await expect(page.getByText("מספר עובדים")).toBeVisible();
  });

  test("should handle API 500 on public booking", async ({ page }) => {
    await mockApiRoute(page, `**/api/p/meetings/${SHARE_TOKEN}`, {
      status: 500,
      body: { error: "Internal server error" },
    });

    const booking = new PublicBookingPage(page);
    await booking.goto(SHARE_TOKEN);

    await expect(page.getByText("לא ניתן לטעון את פרטי הפגישה").first()).toBeVisible({ timeout: 10_000 });
  });

  test("should show error when neither email nor phone provided", async ({ page }) => {
    await setupBookingMocks(page);
    // Override book route to return 400 with validation error
    await page.route(`**/api/p/meetings/${SHARE_TOKEN}/book`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "נדרש אימייל או טלפון" }),
        });
      } else {
        await route.fallback();
      }
    });

    const booking = new PublicBookingPage(page);
    await navigateToForm(booking, page);
    await booking.fillBookingForm({ name: "ישראל" });
    await booking.submitBooking();

    await expect(page.getByText("נדרש אימייל או טלפון")).toBeVisible({ timeout: 5_000 });
  });

  test("should show empty slots when slots API fails (silent degradation)", async ({ page }) => {
    await mockApiRoute(page, `**/api/p/meetings/${SHARE_TOKEN}`, {
      body: MOCK_MEETING_TYPE,
    });
    await mockApiRoute(page, `**/api/p/meetings/${SHARE_TOKEN}/slots*`, {
      status: 500,
      body: { error: "Internal server error" },
    });

    const booking = new PublicBookingPage(page);
    await booking.goto(SHARE_TOKEN);
    await expect(page.getByText(MOCK_MEETING_TYPE.name)).toBeVisible({ timeout: 10_000 });

    const dayButton = page.locator("button").filter({ hasText: new RegExp(`^${tomorrowDay}$`) }).first();
    await expect(dayButton).toBeVisible();
    await dayButton.click();

    // Component catches fetch error with .catch(() => setSlots([])) — shows normal empty message
    await expect(booking.noSlotsMessage).toBeVisible({ timeout: 5_000 });
  });

  test("should show error for invalid email format", async ({ page }) => {
    await setupBookingMocks(page);
    await page.route(`**/api/p/meetings/${SHARE_TOKEN}/book`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "כתובת אימייל לא תקינה" }),
        });
      } else {
        await route.fallback();
      }
    });

    const booking = new PublicBookingPage(page);
    await navigateToForm(booking, page);
    await booking.fillBookingForm({ name: "ישראל", email: "notanemail" });
    await booking.submitBooking();

    await expect(page.getByText("כתובת אימייל לא תקינה")).toBeVisible({ timeout: 5_000 });
  });

  test("should show error for invalid phone format", async ({ page }) => {
    await setupBookingMocks(page);
    await page.route(`**/api/p/meetings/${SHARE_TOKEN}/book`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "מספר טלפון לא תקין" }),
        });
      } else {
        await route.fallback();
      }
    });

    const booking = new PublicBookingPage(page);
    await navigateToForm(booking, page);
    await booking.fillBookingForm({ name: "ישראל", phone: "abc" });
    await booking.submitBooking();

    await expect(page.getByText("מספר טלפון לא תקין")).toBeVisible({ timeout: 5_000 });
  });

  test("should render custom field of type select with options", async ({ page }) => {
    const typeWithSelect = {
      ...MOCK_MEETING_TYPE,
      customFields: [
        {
          id: "topic",
          label: "נושא הפגישה",
          type: "select",
          required: true,
          options: ["ייעוץ עסקי", "ייעוץ משפטי", "ייעוץ כללי"],
        },
      ],
    };

    await mockApiRoute(page, `**/api/p/meetings/${SHARE_TOKEN}`, { body: typeWithSelect });
    await mockApiRoute(page, `**/api/p/meetings/${SHARE_TOKEN}/slots*`, { body: MOCK_SLOTS });

    const booking = new PublicBookingPage(page);
    await navigateToForm(booking, page);

    await expect(page.getByText("נושא הפגישה")).toBeVisible();
    // Should render a select/dropdown element
    const selectTrigger = page.locator("select, [role='combobox']").first();
    await expect(selectTrigger).toBeVisible({ timeout: 3_000 });
  });

  test("should successfully book with phone only (no email)", async ({ page }) => {
    await setupBookingMocks(page, { bookResponse: MOCK_BOOK_RESPONSE });

    const booking = new PublicBookingPage(page);
    await navigateToForm(booking, page);

    await booking.fillBookingForm({ name: "ישראל", phone: "050-1234567" });
    await booking.submitBooking();
    await expect(booking.successTitle).toBeVisible({ timeout: 10_000 });
  });

  test("should successfully book with email only (no phone)", async ({ page }) => {
    await setupBookingMocks(page, { bookResponse: MOCK_BOOK_RESPONSE });

    const booking = new PublicBookingPage(page);
    await navigateToForm(booking, page);

    await booking.fillBookingForm({ name: "ישראל", email: "israel@example.com" });
    await booking.submitBooking();
    await expect(booking.successTitle).toBeVisible({ timeout: 10_000 });
  });

  test("should show validation error when required custom field is empty", async ({ page }) => {
    const typeWithRequired = {
      ...MOCK_MEETING_TYPE,
      customFields: [
        { id: "company", label: "חברה", type: "text", required: true },
      ],
    };

    await mockApiRoute(page, `**/api/p/meetings/${SHARE_TOKEN}`, { body: typeWithRequired });
    await mockApiRoute(page, `**/api/p/meetings/${SHARE_TOKEN}/slots*`, { body: MOCK_SLOTS });

    const booking = new PublicBookingPage(page);
    await navigateToForm(booking, page);

    // Fill name but leave required custom field empty
    await booking.fillBookingForm({ name: "ישראל" });
    await booking.submitBooking();

    // HTML5 required attribute prevents form submission — success never shows, form stays visible
    await expect(booking.successTitle).not.toBeVisible({ timeout: 3_000 });
    await expect(booking.nameInput).toBeVisible();
  });

  test("should show error when reschedule API fails from booking success screen", async ({ page }) => {
    await setupBookingMocks(page, { bookResponse: MOCK_BOOK_RESPONSE });

    await page.route("**/api/p/meetings/manage/manage123/reschedule", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "שגיאה בשינוי המועד" }),
        });
      } else {
        await route.fallback();
      }
    });

    const booking = new PublicBookingPage(page);
    await navigateToForm(booking, page);

    await booking.fillBookingForm({ name: "ישראל" });
    await booking.submitBooking();
    await expect(booking.successTitle).toBeVisible({ timeout: 10_000 });

    // Start reschedule flow
    await booking.rescheduleButton.click();
    await expect(booking.rescheduleTitle).toBeVisible({ timeout: 5_000 });

    // Select a date from the 7-column grid
    const dateGrid = page.locator(".grid.grid-cols-7");
    const enabledDateButton = dateGrid.locator("button:enabled").first();
    await expect(enabledDateButton).toBeVisible({ timeout: 5_000 });
    await enabledDateButton.click();

    // Wait for slots to load and select one
    const slotButtons = page.locator("button").filter({ hasText: /^\d{2}:\d{2}$/ });
    await expect(slotButtons.first()).toBeVisible({ timeout: 5_000 });
    await slotButtons.first().click();

    // Confirm reschedule
    const confirmButton = page.getByRole("button", { name: /אישור|שמור|עדכן/ });
    await confirmButton.click();

    // Should show error — not return to success screen
    await expect(page.getByText("שגיאה בשינוי המועד").first()).toBeVisible({ timeout: 5_000 });
  });

  test("should show error when cancel API fails from booking success screen", async ({ page }) => {
    await setupBookingMocks(page, { bookResponse: MOCK_BOOK_RESPONSE });

    await page.route("**/api/p/meetings/manage/manage123/cancel", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "שגיאה בביטול הפגישה" }),
        });
      } else {
        await route.fallback();
      }
    });

    const booking = new PublicBookingPage(page);
    await navigateToForm(booking, page);

    await booking.fillBookingForm({ name: "ישראל" });
    await booking.submitBooking();
    await expect(booking.successTitle).toBeVisible({ timeout: 10_000 });

    await booking.cancelButton.click();
    await expect(booking.cancelTitle).toBeVisible();
    await booking.cancelReasonTextarea.fill("ביטול טסט");
    await booking.confirmCancelButton.click();

    // Should show error — not navigate to cancelled state
    await expect(booking.cancelledTitle).not.toBeVisible({ timeout: 3_000 });
    await expect(page.getByText("שגיאה בביטול הפגישה").first()).toBeVisible({ timeout: 5_000 });
  });
});

// ── H. Participant Manage Page ──

test.describe("Participant Manage Page", () => {
  test("should load meeting details", async ({ page }) => {
    await mockApiRoute(page, `**/api/p/meetings/manage/${MANAGE_TOKEN}`, {
      body: MOCK_MANAGE_MEETING,
    });

    const manage = new ManageMeetingPage(page);
    await manage.goto(MANAGE_TOKEN);

    await expect(manage.title).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(MOCK_MANAGE_MEETING.participantName)).toBeVisible();
    await expect(page.getByText(MOCK_MANAGE_MEETING.meetingType.name)).toBeVisible();
  });

  test("should show error for invalid manage token", async ({ page }) => {
    await mockApiRoute(page, "**/api/p/meetings/manage/badtoken*", {
      status: 404,
      body: { error: "Not found" },
    });

    await page.goto("/p/meetings/manage/badtoken");
    await expect(page.getByText("לא ניתן לטעון את פרטי הפגישה").first()).toBeVisible({ timeout: 10_000 });
  });

  test("should cancel meeting from manage page", async ({ page }) => {
    await mockApiRoute(page, `**/api/p/meetings/manage/${MANAGE_TOKEN}`, {
      body: MOCK_MANAGE_MEETING,
    });
    await page.route(`**/api/p/meetings/manage/${MANAGE_TOKEN}/cancel`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.fallback();
      }
    });

    const manage = new ManageMeetingPage(page);
    await manage.goto(MANAGE_TOKEN);
    await expect(manage.title).toBeVisible({ timeout: 10_000 });

    // Capture cancel request payload
    const cancelRequestPromise = page.waitForRequest(
      (req) => req.url().includes(`/api/p/meetings/manage/${MANAGE_TOKEN}/cancel`) && req.method() === "POST"
    );

    await manage.cancelMeeting("סיבת ביטול טסט");

    const cancelRequest = await cancelRequestPromise;
    const cancelBody = cancelRequest.postDataJSON();
    expect(cancelBody).toHaveProperty("reason", "סיבת ביטול טסט");

    await expect(manage.cancelledTitle).toBeVisible({ timeout: 10_000 });
    await expect(manage.bookNewLink).toBeVisible();
  });

  test("should reschedule meeting", async ({ page }) => {
    await mockApiRoute(page, `**/api/p/meetings/manage/${MANAGE_TOKEN}`, {
      body: MOCK_MANAGE_MEETING,
    });
    await mockApiRoute(page, `**/api/p/meetings/${SHARE_TOKEN}/slots*`, {
      body: MOCK_SLOTS,
    });
    await page.route(`**/api/p/meetings/manage/${MANAGE_TOKEN}/reschedule`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            startTime: `${tomorrowISO}T10:00:00.000Z`,
            endTime: `${tomorrowISO}T10:30:00.000Z`,
          }),
        });
      } else {
        await route.fallback();
      }
    });

    const manage = new ManageMeetingPage(page);
    await manage.goto(MANAGE_TOKEN);
    await expect(manage.title).toBeVisible({ timeout: 10_000 });

    await manage.rescheduleButton.click();
    await expect(manage.rescheduleTitle).toBeVisible();

    // Select date from 7-column grid
    await manage.selectRescheduleDate(0);

    // Wait for slots to load
    const slotButtons = page.locator("button").filter({ hasText: /^\d{2}:\d{2}$/ });
    await expect(slotButtons.first()).toBeVisible({ timeout: 5_000 });

    await manage.selectRescheduleSlot(0);

    // Capture reschedule request payload
    const rescheduleRequestPromise = page.waitForRequest(
      (req) => req.url().includes(`/api/p/meetings/manage/${MANAGE_TOKEN}/reschedule`) && req.method() === "POST"
    );

    // Confirm
    await manage.confirmReschedule();

    const rescheduleRequest = await rescheduleRequestPromise;
    const body = rescheduleRequest.postDataJSON();
    expect(body).toHaveProperty("startTime");
    expect(body).toHaveProperty("endTime");

    await expect(manage.rescheduleSuccessTitle).toBeVisible({ timeout: 10_000 });
  });

  test("should hide actions for cancelled meetings", async ({ page }) => {
    const cancelledMeeting = {
      ...MOCK_MANAGE_MEETING,
      status: "CANCELLED",
      cancelReason: "ביטול על ידי המשתתף",
      cancelledAt: new Date().toISOString(),
    };

    await mockApiRoute(page, `**/api/p/meetings/manage/${MANAGE_TOKEN}`, {
      body: cancelledMeeting,
    });

    const manage = new ManageMeetingPage(page);
    await manage.goto(MANAGE_TOKEN);
    await expect(manage.title).toBeVisible({ timeout: 10_000 });

    await expect(manage.rescheduleButton).not.toBeVisible();
    await expect(manage.cancelButton).not.toBeVisible();
  });

  test("should hide actions for completed meetings", async ({ page }) => {
    const completedMeeting = {
      ...MOCK_MANAGE_MEETING,
      status: "COMPLETED",
    };

    await mockApiRoute(page, `**/api/p/meetings/manage/${MANAGE_TOKEN}`, {
      body: completedMeeting,
    });

    const manage = new ManageMeetingPage(page);
    await manage.goto(MANAGE_TOKEN);
    await expect(manage.title).toBeVisible({ timeout: 10_000 });

    await expect(manage.rescheduleButton).not.toBeVisible();
    await expect(manage.cancelButton).not.toBeVisible();
  });

  test("should hide actions for NO_SHOW status on manage page", async ({ page }) => {
    const noShowMeeting = {
      ...MOCK_MANAGE_MEETING,
      status: "NO_SHOW",
    };

    await mockApiRoute(page, `**/api/p/meetings/manage/${MANAGE_TOKEN}`, {
      body: noShowMeeting,
    });

    const manage = new ManageMeetingPage(page);
    await manage.goto(MANAGE_TOKEN);
    await expect(manage.title).toBeVisible({ timeout: 10_000 });

    await expect(manage.rescheduleButton).not.toBeVisible();
    await expect(manage.cancelButton).not.toBeVisible();
  });

  test("should show both actions for PENDING status on manage page", async ({ page }) => {
    const pendingMeeting = {
      ...MOCK_MANAGE_MEETING,
      status: "PENDING",
    };

    await mockApiRoute(page, `**/api/p/meetings/manage/${MANAGE_TOKEN}`, {
      body: pendingMeeting,
    });

    const manage = new ManageMeetingPage(page);
    await manage.goto(MANAGE_TOKEN);
    await expect(manage.title).toBeVisible({ timeout: 10_000 });

    // PENDING meetings should show both reschedule and cancel buttons
    await expect(manage.rescheduleButton).toBeVisible();
    await expect(manage.cancelButton).toBeVisible();

    // Status badge should show "ממתין לאישור"
    await expect(manage.statusBadge).toBeVisible();
  });

  test("should show both actions for CONFIRMED status on manage page", async ({ page }) => {
    await mockApiRoute(page, `**/api/p/meetings/manage/${MANAGE_TOKEN}`, {
      body: { ...MOCK_MANAGE_MEETING, status: "CONFIRMED" },
    });

    const manage = new ManageMeetingPage(page);
    await manage.goto(MANAGE_TOKEN);
    await expect(manage.title).toBeVisible({ timeout: 10_000 });

    await expect(manage.rescheduleButton).toBeVisible();
    await expect(manage.cancelButton).toBeVisible();
  });

  test("should show reschedule success with Google Calendar link", async ({ page }) => {
    await mockApiRoute(page, `**/api/p/meetings/manage/${MANAGE_TOKEN}`, {
      body: MOCK_MANAGE_MEETING,
    });
    await mockApiRoute(page, `**/api/p/meetings/${SHARE_TOKEN}/slots*`, {
      body: MOCK_SLOTS,
    });
    await page.route(`**/api/p/meetings/manage/${MANAGE_TOKEN}/reschedule`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            startTime: `${tomorrowISO}T10:00:00.000Z`,
            endTime: `${tomorrowISO}T10:30:00.000Z`,
          }),
        });
      } else {
        await route.fallback();
      }
    });

    const manage = new ManageMeetingPage(page);
    await manage.goto(MANAGE_TOKEN);
    await expect(manage.title).toBeVisible({ timeout: 10_000 });

    await manage.rescheduleButton.click();
    await expect(manage.rescheduleTitle).toBeVisible();

    await manage.selectRescheduleDate(0);

    const slotButtons = page.locator("button").filter({ hasText: /^\d{2}:\d{2}$/ });
    await expect(slotButtons.first()).toBeVisible({ timeout: 5_000 });
    await manage.selectRescheduleSlot(0);

    await manage.confirmReschedule();
    await expect(manage.rescheduleSuccessTitle).toBeVisible({ timeout: 10_000 });
    await expect(manage.googleCalendarLink).toBeVisible();
    await expect(manage.copyLinkButton).toBeVisible();
  });

  test("should show error when cancel API fails on manage page", async ({ page }) => {
    await mockApiRoute(page, `**/api/p/meetings/manage/${MANAGE_TOKEN}`, {
      body: MOCK_MANAGE_MEETING,
    });
    await page.route(`**/api/p/meetings/manage/${MANAGE_TOKEN}/cancel`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "text/plain",
          body: "Internal server error",
        });
      } else {
        await route.fallback();
      }
    });

    const manage = new ManageMeetingPage(page);
    await manage.goto(MANAGE_TOKEN);
    await expect(manage.title).toBeVisible({ timeout: 10_000 });

    await manage.cancelMeeting("סיבת ביטול טסט");

    // Should show error — not navigate to cancelled state
    await expect(manage.cancelledTitle).not.toBeVisible({ timeout: 3_000 });
    await expect(page.getByText("שגיאה בביטול הפגישה").first()).toBeVisible({ timeout: 5_000 });
  });

  test("should show error when reschedule slot is taken on manage page", async ({ page }) => {
    await mockApiRoute(page, `**/api/p/meetings/manage/${MANAGE_TOKEN}`, {
      body: MOCK_MANAGE_MEETING,
    });
    await mockApiRoute(page, `**/api/p/meetings/${SHARE_TOKEN}/slots*`, {
      body: MOCK_SLOTS,
    });
    await page.route(`**/api/p/meetings/manage/${MANAGE_TOKEN}/reschedule`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "text/plain",
          body: "Server error",
        });
      } else {
        await route.fallback();
      }
    });

    const manage = new ManageMeetingPage(page);
    await manage.goto(MANAGE_TOKEN);
    await expect(manage.title).toBeVisible({ timeout: 10_000 });

    await manage.rescheduleButton.click();
    await expect(manage.rescheduleTitle).toBeVisible();

    // Select date and slot
    await manage.selectRescheduleDate(0);
    const slotButtons = page.locator("button").filter({ hasText: /^\d{2}:\d{2}$/ });
    await expect(slotButtons.first()).toBeVisible({ timeout: 5_000 });
    await manage.selectRescheduleSlot(0);

    // Confirm reschedule
    await manage.confirmReschedule();

    // Should show error — not success
    await expect(manage.rescheduleSuccessTitle).not.toBeVisible({ timeout: 3_000 });
    await expect(page.getByText("שגיאה בשינוי המועד").first()).toBeVisible({ timeout: 5_000 });
  });
});
