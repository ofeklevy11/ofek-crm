import { type Page, type Locator } from "@playwright/test";

export class GreenApiPage {
  readonly page: Page;

  // ── Navigation ──
  readonly backButton: Locator;

  // ── Card ──
  readonly cardTitle: Locator;
  readonly connectedBadge: Locator;

  // ── Disconnected (admin) ──
  readonly instanceIdInput: Locator;
  readonly tokenInput: Locator;
  readonly saveButton: Locator;

  // ── Connected (admin) ──
  readonly connectedInstanceId: Locator;
  readonly statusBadge: Locator;
  readonly disconnectButton: Locator;

  // ── Non-admin ──
  readonly restrictedAlertTitle: Locator;
  readonly nonAdminCardTitle: Locator;
  readonly noActiveConnection: Locator;

  // ── Info ──
  readonly infoAlert: Locator;

  // ── Confirm dialog ──
  readonly confirmDialog: Locator;

  constructor(page: Page) {
    this.page = page;

    // Navigation
    this.backButton = page.getByRole("button", { name: "חזרה לפרופיל" });

    // Card
    this.cardTitle = page.getByText("הגדרות חיבור Green API");
    this.connectedBadge = page.getByText("מחובר פעיל");

    // Disconnected (admin)
    this.instanceIdInput = page.getByPlaceholder("לדוגמה: 1101823921");
    this.tokenInput = page.locator("input[type='password']");
    this.saveButton = page.getByRole("button", { name: "שמור והתחבר" });

    // Connected (admin) — scoped via label text
    const connectedIdSection = page
      .getByText("מזהה מחובר")
      .locator("..");
    this.connectedInstanceId = connectedIdSection
      .locator(".font-mono")
      .first();

    const statusSection = page
      .getByText("סטטוס חיבור")
      .locator("..");
    this.statusBadge = statusSection.getByText(/authorized|Unknown|blocked/);

    this.disconnectButton = page.getByRole("button", {
      name: "נתק חיבור והסר פרטים",
    });

    // Non-admin
    this.restrictedAlertTitle = page.getByText("גישה מוגבלת");
    this.nonAdminCardTitle = page.getByText("חיבור WhatsApp (Green API)");
    this.noActiveConnection = page.getByText("לא מוגדר חיבור פעיל כרגע.");

    // Info alert
    this.infoAlert = page.getByText("שים לב: חיבור ארגוני");

    // Confirm dialog (for disconnect flow)
    this.confirmDialog = page.getByRole("alertdialog");
  }

  async goto() {
    await this.page.goto("/profile/green-api");
  }

  async fillCredentials(instanceId: string, token: string) {
    await this.instanceIdInput.fill(instanceId);
    await this.tokenInput.fill(token);
  }
}
