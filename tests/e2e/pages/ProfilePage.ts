import { type Page, type Locator } from "@playwright/test";

export class ProfilePage {
  readonly page: Page;

  // ── Header ──
  readonly avatar: Locator;
  readonly userName: Locator;
  readonly emailBadge: Locator;
  readonly roleBadge: Locator;

  // ── Organization Card ──
  readonly orgCardTitle: Locator;
  readonly companyName: Locator;
  readonly companyId: Locator;
  readonly companyIdCopyButton: Locator;
  readonly companyIdHelpText: Locator;

  // ── User Details Card ──
  readonly userDetailsCardTitle: Locator;
  readonly userId: Locator;

  // ── Organization Management Card (admin) ──
  readonly orgManagementCardTitle: Locator;
  readonly updateOrgNameButton: Locator;

  // ── Update Dialog ──
  readonly updateDialog: Locator;
  readonly dialogTitle: Locator;
  readonly dialogDescription: Locator;
  readonly dialogCurrentName: Locator;
  readonly dialogNewNameInput: Locator;
  readonly dialogPasswordInput: Locator;
  readonly dialogSubmitButton: Locator;
  readonly dialogErrorAlert: Locator;
  readonly dialogSuccessAlert: Locator;
  readonly dialogCloseButton: Locator;

  // ── Integrations Card ──
  readonly integrationsCardTitle: Locator;
  readonly greenApiItem: Locator;
  readonly whatsappItem: Locator;
  readonly greenApiSettingsButton: Locator;
  readonly whatsappSettingsButton: Locator;
  readonly greenApiAdminOnlyBadge: Locator;
  readonly whatsappAdminOnlyBadge: Locator;

  // ── API Keys Card (admin) ──
  readonly apiKeysCardTitle: Locator;
  readonly apiKeysDescription: Locator;
  readonly apiKeyNameInput: Locator;
  readonly createKeyButton: Locator;
  readonly activeKeysHeading: Locator;
  readonly emptyKeysState: Locator;
  readonly keysTable: Locator;
  readonly loadingSpinner: Locator;

  // ── New Key Alert ──
  readonly newKeyAlertTitle: Locator;
  readonly newKeyAlertWarning: Locator;
  readonly newKeyCode: Locator;
  readonly newKeyCopyButton: Locator;
  readonly newKeyDismissButton: Locator;

  // ── Restricted Area (basic) ──
  readonly restrictedAreaAlert: Locator;

  // ── Page container ──
  readonly pageContainer: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header — avatar uses AvatarFallback with first letter of name
    this.avatar = page.locator("[data-slot='avatar']").first();
    this.userName = page.getByRole("heading", { level: 1 });
    this.emailBadge = page
      .getByText(/@/)
      .filter({ has: page.locator("svg") })
      .first();
    this.roleBadge = page
      .getByText(/אדמין מערכת|מנהל|משתמש/)
      .first();

    // Organization Card — scoped via label text
    this.orgCardTitle = page.getByText("פרטי ארגון");

    const orgNameSection = page
      .locator("label")
      .filter({ hasText: "שם הארגון" })
      .locator("..");
    this.companyName = orgNameSection.locator("div").last();

    const companyIdSection = page
      .locator("label")
      .filter({ hasText: "מזהה ארגון" })
      .locator("..");
    this.companyId = companyIdSection.locator(".font-mono").first();
    this.companyIdCopyButton = companyIdSection.getByRole("button").first();
    this.companyIdHelpText = page.getByText(
      "יש להשתמש במזהה זה בכל קריאות ה-API למערכת."
    );

    // User Details Card
    this.userDetailsCardTitle = page.getByText("פרטי משתמש");
    const userIdSection = page
      .locator("label")
      .filter({ hasText: "מזהה משתמש" })
      .locator("..");
    this.userId = userIdSection.locator(".font-mono").first();

    // Organization Management Card (admin)
    this.orgManagementCardTitle = page.getByText("ניהול ארגון");
    this.updateOrgNameButton = page.getByRole("button", {
      name: "עדכון שם הארגון",
    });

    // Update Dialog
    this.updateDialog = page.getByRole("dialog");
    this.dialogTitle = this.updateDialog.getByText("עדכון שם הארגון");
    this.dialogDescription = this.updateDialog.getByText(
      "שנה את שם הארגון. נדרשת אימות סיסמה לאישור השינוי."
    );
    // Current name is shown next to the "שם ארגון נוכחי" label
    const currentNameSection = this.updateDialog
      .locator("label")
      .filter({ hasText: "שם ארגון נוכחי" })
      .locator("..");
    this.dialogCurrentName = currentNameSection.locator("div").last();
    this.dialogNewNameInput = this.updateDialog.getByPlaceholder(
      "הזן שם ארגון חדש"
    );
    this.dialogPasswordInput = this.updateDialog.getByPlaceholder(
      "הזן את הסיסמה שלך"
    );
    this.dialogSubmitButton = this.updateDialog.getByRole("button", {
      name: "עדכן שם ארגון",
    });
    // Error/success alerts scoped to dialog using role
    this.dialogErrorAlert = this.updateDialog
      .getByRole("alert")
      .filter({ hasText: /שגיאה|שגויה|נא למלא/ });
    this.dialogSuccessAlert = this.updateDialog
      .getByRole("alert")
      .filter({ hasText: "עודכן בהצלחה" });
    this.dialogCloseButton = this.updateDialog.locator(
      '[data-slot="dialog-close"]'
    );

    // Integrations Card — scope rows by their heading text
    this.integrationsCardTitle = page.getByText("ניהול אינטגרציות");
    this.greenApiItem = page.getByText("Green API (WhatsApp)");
    this.whatsappItem = page.getByText("WhatsApp Business (Cloud API)");

    const greenApiRow = page
      .locator("h4")
      .filter({ hasText: "Green API (WhatsApp)" })
      .locator("../..");
    const whatsappRow = page
      .locator("h4")
      .filter({ hasText: "WhatsApp Business" })
      .locator("../..");

    this.greenApiSettingsButton = greenApiRow.getByRole("button", {
      name: "הגדרות",
    });
    this.whatsappSettingsButton = whatsappRow.getByRole("button", {
      name: "הגדרות",
    });
    this.greenApiAdminOnlyBadge = greenApiRow.getByText("גישה לאדמין בלבד");
    this.whatsappAdminOnlyBadge = whatsappRow.getByText("גישה לאדמין בלבד");

    // API Keys Card (admin)
    this.apiKeysCardTitle = page.getByText("ניהול מפתחות API");
    this.apiKeysDescription = page.getByText(
      "מפתחות גישה לחיבור מערכות חיצוניות"
    );
    this.apiKeyNameInput = page.getByPlaceholder(
      "שם המפתח (לדוגמה: Make Integration)"
    );
    this.createKeyButton = page.getByRole("button", { name: "צור מפתח" });
    this.activeKeysHeading = page.getByText("מפתחות פעילים");
    this.emptyKeysState = page.getByText("לא נמצאו מפתחות פעילים");
    this.keysTable = page.locator("table");
    this.loadingSpinner = page.getByText("טוען מפתחות...");

    // New Key Alert — scoped to the alert containing the success title
    const newKeyAlert = page
      .getByRole("alert")
      .filter({ hasText: "המפתח נוצר בהצלחה" });
    this.newKeyAlertTitle = page.getByText("המפתח נוצר בהצלחה");
    this.newKeyAlertWarning = page.getByText("העתק את המפתח עכשיו");
    this.newKeyCode = page.locator("code[dir='ltr']");
    this.newKeyCopyButton = newKeyAlert
      .getByRole("button")
      .filter({ has: page.locator("svg") })
      .first();
    this.newKeyDismissButton = page.getByRole("button", {
      name: "הבנתי, העתקתי",
    });

    // Restricted Area (basic)
    this.restrictedAreaAlert = page.getByText("אזור מוגבל");

    // Page container
    this.pageContainer = page.locator("[dir='rtl']").first();
  }

  async goto() {
    await this.page.goto("/profile");
  }

  async openUpdateOrgDialog() {
    await this.updateOrgNameButton.click();
    await this.updateDialog.waitFor({ state: "visible" });
  }

  async fillAndSubmitOrgName(name: string, password: string) {
    await this.dialogNewNameInput.fill(name);
    await this.dialogPasswordInput.fill(password);
    await this.dialogSubmitButton.click();
  }

  getKeyRow(index: number): Locator {
    return this.keysTable.locator("tbody tr").nth(index);
  }

  getKeyDeleteButton(index: number): Locator {
    return this.getKeyRow(index).getByRole("button");
  }
}
