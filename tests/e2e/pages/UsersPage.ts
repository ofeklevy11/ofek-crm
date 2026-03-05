import { type Page, type Locator } from "@playwright/test";

/** Hebrew UI constants for the Users page */
export const USER_TEXT = {
  // Page
  pageTitle: "ניהול משתמשים",
  pageSubtitle: "ניהול משתמשים והרשאות גישה למערכת",
  newUserButton: "+ משתמש חדש",

  // Table headers
  headerName: "שם",
  headerEmail: "אימייל",
  headerRole: "תפקיד",
  headerPermissions: "הרשאות נוספות",
  headerActions: "פעולות",

  // Actions
  edit: "ערוך",
  delete: "מחק",

  // Empty state
  emptyHeading: "אין משתמשים",
  emptyCreate: "+ צור משתמש ראשון",

  // Roles
  roleAdmin: "אדמין",
  roleManager: "מנהל",
  roleBasic: "בסיסי",

  // Permission display
  allPermissions: "כל ההרשאות",
  noPermissions: "אין הרשאות נוספות",

  // Pagination
  firstPage: "⏮ ראשון",
  prevPage: "← הקודם",
  nextPage: "הבא →",
  lastPage: "אחרון ⏭",

  // Rate limit
  rateLimitTitle: "בוצעו יותר מדי פניות",
  rateLimitRetry: "נסה שוב עכשיו",

  // Modal titles
  modalNewUser: "משתמש חדש",
  modalEditUser: "ערוך משתמש",

  // Modal form
  placeholderName: "שם מלא",
  placeholderEmail: "email@example.com",
  placeholderPassword: "••••••••",

  // Modal roles
  roleBasicRadio: "בסיסי (Basic)",
  roleManagerRadio: "מנהל (Manager)",
  roleAdminRadio: "אדמין (Admin)",

  // Modal permission sections
  permissionSection: "הרשאות נוספות",
  navPermissions: "הרשאות ניווט וגישה למודולים",
  managementPermissions: "הרשאות ניהול ותפעול",
  tableOperations: "פעולות בטבלאות",
  managerTablePermissions: "הרשאות כתיבה לטבלאות",
  basicTablePermissions: "הרשאות לטבלאות",

  // Basic table permission headers
  noAccess: "ללא גישה",
  readOnly: "קריאה בלבד",
  readWrite: "קריאה וכתיבה",

  // Modal actions
  cancel: "ביטול",
  create: "צור",
  update: "עדכן",
  saving: "שומר...",

  // Validation errors
  nameEmailRequired: "שם ואימייל הם שדות חובה",
  passwordRequired: "סיסמה נדרשת ליצירת משתמש חדש",

  // Toast messages
  toastCreated: "המשתמש נוצר בהצלחה",
  toastUpdated: "המשתמש עודכן בהצלחה",
  toastDeleted: "המשתמש נמחק בהצלחה",
  toastDeleteError: "שגיאה במחיקת המשתמש",

  // Delete confirmation
  deleteConfirmMessage: "האם אתה בטוח שברצונך למחוק משתמש זה? פעולה זו לא ניתנת לביטול.",

  // Empty tables in modal
  noTablesAvailable: "אין טבלאות זמינות",
} as const;

export class UsersPage {
  readonly page: Page;

  // Page elements
  readonly pageTitle: Locator;
  readonly pageSubtitle: Locator;
  readonly newUserButton: Locator;
  readonly usersTable: Locator;
  readonly loadingSpinner: Locator;

  // Empty state
  readonly emptyHeading: Locator;
  readonly emptyCreateButton: Locator;

  // Pagination
  readonly firstPageButton: Locator;
  readonly prevPageButton: Locator;
  readonly nextPageButton: Locator;
  readonly lastPageButton: Locator;

  // Rate limit
  readonly rateLimitTitle: Locator;
  readonly rateLimitRetryButton: Locator;

  // Modal
  readonly modal: Locator;
  readonly modalTitle: Locator;
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly cancelButton: Locator;
  readonly submitButton: Locator;
  readonly modalError: Locator;

  // Confirm dialog (Radix AlertDialog → role="alertdialog")
  readonly confirmDialog: Locator;
  readonly confirmDialogConfirmButton: Locator;
  readonly confirmDialogCancelButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Page
    this.pageTitle = page.getByRole("heading", { name: USER_TEXT.pageTitle });
    this.pageSubtitle = page.getByText(USER_TEXT.pageSubtitle);
    this.newUserButton = page.getByRole("button", { name: USER_TEXT.newUserButton });
    this.usersTable = page.locator(".bg-white.rounded-2xl table");
    this.loadingSpinner = page.locator(".animate-spin");

    // Empty state
    this.emptyHeading = page.getByRole("heading", { name: USER_TEXT.emptyHeading });
    this.emptyCreateButton = page.getByRole("button", { name: USER_TEXT.emptyCreate });

    // Pagination
    this.firstPageButton = page.getByRole("button", { name: USER_TEXT.firstPage });
    this.prevPageButton = page.getByRole("button", { name: USER_TEXT.prevPage });
    this.nextPageButton = page.getByRole("button", { name: USER_TEXT.nextPage });
    this.lastPageButton = page.getByRole("button", { name: USER_TEXT.lastPage });

    // Rate limit
    this.rateLimitTitle = page.getByRole("heading", { name: USER_TEXT.rateLimitTitle });
    this.rateLimitRetryButton = page.getByRole("button", { name: USER_TEXT.rateLimitRetry });

    // Modal — scoped to the fixed overlay
    this.modal = page.locator(".fixed.inset-0").filter({
      has: page.locator(".bg-white.rounded-2xl.shadow-2xl"),
    });
    this.modalTitle = this.modal.getByRole("heading");
    this.nameInput = this.modal.getByPlaceholder(USER_TEXT.placeholderName);
    this.emailInput = this.modal.getByPlaceholder(USER_TEXT.placeholderEmail);
    this.passwordInput = this.modal.getByPlaceholder(USER_TEXT.placeholderPassword);
    this.cancelButton = this.modal.getByRole("button", { name: USER_TEXT.cancel });
    this.submitButton = this.modal.getByRole("button", { name: /צור|עדכן|שומר/ });
    this.modalError = this.modal.locator(".bg-red-50");

    // Confirm dialog (Radix AlertDialog)
    this.confirmDialog = page.getByRole("alertdialog");
    this.confirmDialogConfirmButton = this.confirmDialog.getByRole("button", {
      name: "אישור",
    });
    this.confirmDialogCancelButton = this.confirmDialog.getByRole("button", {
      name: "ביטול",
    });
  }

  async goto() {
    await this.page.goto("/users");
  }

  async waitForLoad() {
    await this.pageTitle.waitFor({ state: "visible", timeout: 15_000 });
    await this.loadingSpinner.waitFor({ state: "hidden", timeout: 15_000 });
  }

  async clickNewUser() {
    await this.newUserButton.click();
    await this.modalTitle.waitFor({ state: "visible" });
  }

  async clickEditUser(name: string) {
    const row = this.getUserRowByName(name);
    await row.getByRole("button", { name: USER_TEXT.edit }).click();
    await this.modalTitle.waitFor({ state: "visible" });
  }

  async clickDeleteUser(name: string) {
    const row = this.getUserRowByName(name);
    await row.getByRole("button", { name: USER_TEXT.delete }).click();
  }

  async fillUserForm(data: {
    name?: string;
    email?: string;
    password?: string;
    role?: "basic" | "manager" | "admin";
  }) {
    if (data.name !== undefined) {
      await this.nameInput.clear();
      if (data.name) await this.nameInput.fill(data.name);
    }
    if (data.email !== undefined) {
      await this.emailInput.clear();
      if (data.email) await this.emailInput.fill(data.email);
    }
    if (data.password !== undefined) {
      await this.passwordInput.clear();
      if (data.password) await this.passwordInput.fill(data.password);
    }
    if (data.role) {
      const roleLabel =
        data.role === "basic"
          ? USER_TEXT.roleBasicRadio
          : data.role === "manager"
            ? USER_TEXT.roleManagerRadio
            : USER_TEXT.roleAdminRadio;
      await this.modal.getByText(roleLabel).click();
    }
  }

  async submitForm() {
    await this.submitButton.click();
  }

  async cancelForm() {
    await this.cancelButton.click();
  }

  getUserRowByName(name: string): Locator {
    return this.page.locator("tbody tr").filter({ hasText: name });
  }

  getPageInfo(): Locator {
    return this.page.locator("text=/עמוד \\d+ מתוך \\d+/");
  }

  getRoleBadge(name: string): Locator {
    return this.getUserRowByName(name).locator("span.rounded-full");
  }

  getPermissionCell(name: string): Locator {
    return this.getUserRowByName(name).locator("td").nth(3);
  }

  /** Select a role radio in the modal */
  getModalRoleRadio(role: "basic" | "manager" | "admin"): Locator {
    const text =
      role === "basic"
        ? USER_TEXT.roleBasicRadio
        : role === "manager"
          ? USER_TEXT.roleManagerRadio
          : USER_TEXT.roleAdminRadio;
    return this.modal.getByText(text);
  }

  /** Confirm the delete alert dialog */
  async confirmDelete() {
    await this.confirmDialog.waitFor({ state: "visible" });
    await this.confirmDialogConfirmButton.click();
  }

  /** Cancel the delete alert dialog */
  async cancelDelete() {
    await this.confirmDialog.waitFor({ state: "visible" });
    await this.confirmDialogCancelButton.click();
  }

  /** Get permission badge elements by title attribute (each badge has title={permissionKey}) */
  getPermissionBadges(name: string): Locator {
    return this.getPermissionCell(name).locator("span[title]");
  }

  /** Get the "+N" overflow badge for users with >3 permissions */
  getOverflowBadge(name: string): Locator {
    return this.getPermissionCell(name).locator("span").filter({ hasText: /^\+\d+$/ });
  }
}
