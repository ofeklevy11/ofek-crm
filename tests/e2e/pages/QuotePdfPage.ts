import { type Page, type Locator } from "@playwright/test";

export class QuotePdfPage {
  readonly page: Page;

  // Navigation
  readonly backLink: Locator;

  // Preview header
  readonly previewHeading: Locator;

  // Action buttons
  readonly printButton: Locator;
  readonly downloadButton: Locator;
  readonly whatsappButton: Locator;
  readonly emailButton: Locator;

  // WhatsApp modal
  readonly whatsappModalTitle: Locator;
  readonly clientPhoneRadio: Locator;
  readonly customPhoneRadio: Locator;
  readonly customPhoneInput: Locator;
  readonly sendButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Navigation
    this.backLink = page.getByRole("link", { name: "חזור להצעות מחיר" });

    // Preview header
    this.previewHeading = page.getByText("תצוגה מקדימה להדפסה");

    // Action buttons
    this.printButton = page.getByRole("button", { name: "הדפסה" });
    this.downloadButton = page.getByRole("button", { name: "הורד PDF" });
    this.whatsappButton = page.getByRole("button", { name: "וואטסאפ" });
    // Use regex to match Hebrew geresh ״ in דוא״ל
    this.emailButton = page.getByRole("button", { name: /דוא.ל/ });

    // WhatsApp modal
    this.whatsappModalTitle = page.getByText("שליחת הצעה בוואטסאפ");
    this.clientPhoneRadio = page.getByLabel(/שלח למספר של הלקוח/);
    this.customPhoneRadio = page.getByLabel("הזן מספר אחר");
    this.customPhoneInput = page.getByPlaceholder("הכנס מספר טלפון (050...)");
    this.sendButton = page.getByRole("button", { name: "שלח הצעת מחיר" });
    this.cancelButton = page.getByRole("button", { name: "ביטול" });
  }

  async goto(id: string) {
    await this.page.goto(`/quotes/${id}/pdf`);
  }
}
