import { type Page, type Locator } from "@playwright/test";

export class ManageMeetingPage {
  readonly page: Page;

  // Header
  readonly title: Locator;
  readonly companyName: Locator;
  readonly meetingTypeName: Locator;

  // Status badge
  readonly statusBadge: Locator;

  // Details card
  readonly detailsCard: Locator;

  // Action buttons
  readonly rescheduleButton: Locator;
  readonly cancelButton: Locator;

  // Cancel flow
  readonly cancelTitle: Locator;
  readonly cancelReasonTextarea: Locator;
  readonly confirmCancelButton: Locator;
  readonly cancelBackButton: Locator;
  readonly cancelledTitle: Locator;
  readonly bookNewLink: Locator;

  // Reschedule flow
  readonly rescheduleTitle: Locator;
  readonly rescheduleSuccessTitle: Locator;
  readonly googleCalendarLink: Locator;
  readonly copyLinkButton: Locator;

  // Error state
  readonly errorState: Locator;

  // Footer
  readonly footer: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.title = page.getByText("ניהול פגישה");
    this.companyName = page.locator("[class*='font-bold'], [class*='font-semibold']").first();
    this.meetingTypeName = page.locator("[class*='text-gray']").first();

    // Status — match badge with status text
    this.statusBadge = page.locator("span.rounded-full").filter({ hasText: /ממתין|מאושר|הושלם|בוטל|לא הגיע/ }).first();

    // Details
    this.detailsCard = page.locator("[class*='bg-\\[\\#F8FAFC\\]'], .bg-gray-50\\/50").first();

    // Actions
    this.rescheduleButton = page.getByRole("button", { name: "שנה מועד" });
    this.cancelButton = page.getByRole("button", { name: "בטל פגישה" });

    // Cancel flow
    this.cancelTitle = page.getByText("ביטול פגישה");
    this.cancelReasonTextarea = page.getByPlaceholder("סיבת הביטול (אופציונלי)...");
    this.confirmCancelButton = page.getByRole("button", { name: "אישור ביטול" });
    this.cancelBackButton = page.getByRole("button", { name: "חזרה" });
    this.cancelledTitle = page.getByText("הפגישה בוטלה");
    this.bookNewLink = page.getByText("קבעו פגישה חדשה");

    // Reschedule
    this.rescheduleTitle = page.getByText("שינוי מועד");
    this.rescheduleSuccessTitle = page.getByText("המועד עודכן בהצלחה!");
    this.googleCalendarLink = page.getByText("הוסף ליומן Google");
    this.copyLinkButton = page.getByRole("button", { name: "העתק קישור" });

    // Error
    this.errorState = page.getByText("שגיאה");

    // Footer
    this.footer = page.getByText("מוגש באמצעות מערכת COOL CRM");
  }

  async goto(manageToken: string) {
    await this.page.goto(`/p/meetings/manage/${manageToken}`);
  }

  async cancelMeeting(reason?: string) {
    await this.cancelButton.click();
    if (reason) {
      await this.cancelReasonTextarea.fill(reason);
    }
    await this.confirmCancelButton.click();
  }

  /**
   * Select a reschedule date from the 7-column grid.
   * Manage page date buttons have 3 text nodes: day name, number, month.
   * We target buttons in the grid that contain a digit and are enabled.
   */
  async selectRescheduleDate(index = 0) {
    const dateGrid = this.page.locator(".grid.grid-cols-7");
    const dateButtons = dateGrid.locator("button");
    let selected = 0;
    const count = await dateButtons.count();
    for (let i = 0; i < count; i++) {
      const btn = dateButtons.nth(i);
      if (await btn.isEnabled()) {
        if (selected === index) {
          await btn.click();
          return;
        }
        selected++;
      }
    }
  }

  /** Select a time slot from the reschedule slot list */
  async selectRescheduleSlot(index = 0) {
    const slots = this.page.locator("button").filter({ hasText: /^\d{2}:\d{2}$/ });
    await slots.nth(index).click();
  }

  /** Confirm the reschedule action */
  async confirmReschedule() {
    const confirmButton = this.page.getByRole("button", { name: /אישור|שמור|עדכן/ });
    await confirmButton.click();
  }
}
