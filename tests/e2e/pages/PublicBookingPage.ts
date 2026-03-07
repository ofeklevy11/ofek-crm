import { type Page, type Locator } from "@playwright/test";

export class PublicBookingPage {
  readonly page: Page;

  // Meeting info (left panel)
  readonly meetingName: Locator;
  readonly companyName: Locator;
  readonly duration: Locator;
  readonly timezone: Locator;

  // Step 1 - Calendar / date selection
  readonly calendarWrapper: Locator;
  readonly datePrompt: Locator;

  // Step 2 - Time slots
  readonly slotsContainer: Locator;
  readonly noSlotsMessage: Locator;
  readonly pickAnotherDateLink: Locator;

  // Step 3 - Form
  readonly formTitle: Locator;
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly phoneInput: Locator;
  readonly notesInput: Locator;
  readonly backButton: Locator;
  readonly submitButton: Locator;
  readonly submitLoadingButton: Locator;
  readonly formError: Locator;

  // Success state
  readonly successTitle: Locator;
  readonly googleCalendarLink: Locator;
  readonly rescheduleButton: Locator;
  readonly cancelButton: Locator;

  // Cancel sub-flow (post-booking)
  readonly cancelTitle: Locator;
  readonly cancelReasonTextarea: Locator;
  readonly confirmCancelButton: Locator;
  readonly cancelBackButton: Locator;
  readonly cancelledTitle: Locator;
  readonly bookNewLink: Locator;

  // Reschedule sub-flow
  readonly rescheduleTitle: Locator;

  // Footer
  readonly footer: Locator;

  constructor(page: Page) {
    this.page = page;

    // Meeting info
    this.meetingName = page.locator("h1, h2").first();
    this.companyName = page.locator("[class*='text-white']").filter({ hasText: /\S/ }).first();
    this.duration = page.getByText(/דקות/);
    this.timezone = page.getByText("שעון ישראל");

    // Step 1
    this.calendarWrapper = page.locator(".mtg-dark-calendar, [class*='calendar']");
    this.datePrompt = page.getByText("בחר יום כדי לראות זמנים זמינים");

    // Step 2 — match slot buttons by HH:MM pattern
    this.slotsContainer = page.locator("button").filter({ hasText: /^\d{2}:\d{2}$/ });
    this.noSlotsMessage = page.getByText("אין משבצות פנויות בתאריך זה");
    this.pickAnotherDateLink = page.getByText("בחרו תאריך אחר");

    // Step 3
    this.formTitle = page.getByText("המידע שלך");
    this.nameInput = page.getByPlaceholder("ישראל ישראלי");
    this.emailInput = page.getByPlaceholder("email@example.com");
    this.phoneInput = page.getByPlaceholder("050-1234567");
    this.notesInput = page.getByPlaceholder("הוסיפו הערה או בקשה מיוחדת...");
    this.backButton = page.getByRole("button", { name: "חזרה" });
    this.submitButton = page.getByRole("button", { name: "קביעת אירוע" });
    this.submitLoadingButton = page.getByRole("button", { name: "קובע פגישה..." });
    this.formError = page.locator("p[class*='text-red']").filter({ hasText: /\S/ }).first();

    // Success
    this.successTitle = page.getByText("!הפגישה נקבעה בהצלחה");
    this.googleCalendarLink = page.getByText("הוסף ליומן Google");
    this.rescheduleButton = page.getByRole("button", { name: "שנה מועד" });
    this.cancelButton = page.getByRole("button", { name: "בטל פגישה" });

    // Cancel sub-flow
    this.cancelTitle = page.getByText("ביטול פגישה");
    this.cancelReasonTextarea = page.getByPlaceholder("סיבת הביטול (אופציונלי)...");
    this.confirmCancelButton = page.getByRole("button", { name: "אישור ביטול" });
    this.cancelBackButton = page.getByRole("button", { name: "חזרה" });
    this.cancelledTitle = page.getByText("הפגישה בוטלה");
    this.bookNewLink = page.getByText("קבעו פגישה חדשה");

    // Reschedule
    this.rescheduleTitle = page.getByText("שינוי מועד");

    // Footer
    this.footer = page.getByText("מוגש באמצעות מערכת BizlyCRM");
  }

  async goto(token: string) {
    await this.page.goto(`/p/meetings/${token}`);
  }

  async selectTimeSlot(index: number) {
    const slots = this.page.locator("button").filter({ hasText: /^\d{2}:\d{2}$/ });
    await slots.nth(index).click();
  }

  async fillBookingForm(data: { name: string; email?: string; phone?: string; notes?: string }) {
    await this.nameInput.fill(data.name);
    if (data.email) await this.emailInput.fill(data.email);
    if (data.phone) await this.phoneInput.fill(data.phone);
    if (data.notes) await this.notesInput.fill(data.notes);
  }

  async submitBooking() {
    await this.submitButton.click();
  }

  /** Navigate through booking: select date → slot → reach form */
  async navigateToForm(tomorrowDate: number) {
    const dayButton = this.page
      .locator("button")
      .filter({ hasText: new RegExp(`^${tomorrowDate}$`) })
      .first();
    await dayButton.click();
    // Wait for slots to appear
    await this.page.locator("button").filter({ hasText: /^\d{2}:\d{2}$/ }).first().waitFor({ state: "visible", timeout: 5_000 });
    await this.selectTimeSlot(0);
    // Wait for form to appear
    await this.formTitle.waitFor({ state: "visible", timeout: 5_000 });
  }
}
