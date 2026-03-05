import { type Page, type Locator } from "@playwright/test";

export const WF_TEXT = {
  // Page
  pageTitle: "תהליכי עבודה",
  pageSubtitle: "נהל את הפייפליינים ותהליכי העבודה של הארגון",

  // Tabs
  tabActive: "תהליכים פעילים (Checklists)",
  tabTemplates: "הגדרת תבניות",

  // Active instances
  activeTitle: "תהליכים פעילים",
  activeSubtitle: "ניהול ומעקב אחר ביצוע תהליכי עבודה שוטפים",
  startNewProcess: "התחל תהליך חדש",
  resetWorkflow: "אפס את תהליך העבודה",

  // Status badges
  statusActive: "פעיל",
  statusCompleted: "הושלם",
  noAssigneeShort: "ללא",
  noAssigneeDetail: "ללא משויך",
  noAssignment: "ללא שיוך",
  progress: "התקדמות",

  // Create modal
  createModalTitle: "תהליך חדש",
  workflowTypeLabel: "סוג תהליך",
  instanceNameLabel: "שם התהליך (לזיהוי)",
  assigneeLabel: "אחראי ראשי (אופציונלי)",
  selectUserPlaceholder: "בחר משתמש...",
  emptyTemplate: "תבנית ריקה",
  createSubmit: "צור והתחל",

  // Edit modal
  editModalTitle: "עריכת תהליך",
  editNameLabel: "שם התהליך",
  editAssigneeLabel: "משויך ל...",
  saveChanges: "שמור שינויים",

  // Template management
  newTemplate: "תבנית חדשה",
  deleteTemplate: "מחק תבנית",
  addStage: "הוסף שלב",
  chooseTemplate: "בחר תבנית לעריכה או צור חדשה",
  promptNewWorkflowName: "שם התהליך החדש:",

  // Empty states
  noTemplates: "לא קיימות תבניות תהליך",
  noActiveProcesses: "אין תהליכים פעילים",
  startProcessEmpty: "התחל תהליך חדש כדי לראות אותו כאן",
  createProcessNow: "צור תהליך עכשיו",

  // Toast messages
  toastWorkflowCreated: "תהליך העבודה נוצר בהצלחה",
  toastTemplateDeleted: "התבנית נמחקה בהצלחה",
  toastInstanceCreated: "התהליך נוצר בהצלחה",
  toastStageCreated: "השלב נוצר בהצלחה",
  toastInstanceUpdated: "התהליך עודכן בהצלחה",
  toastInstanceDeleted: "התהליך נמחק בהצלחה",
  toastInstanceReset: "התהליך אופס בהצלחה",
  // Rendered as a banner in detail view when status === "completed", not a toast
  completionBannerText: "התהליך הושלם בהצלחה!",

  // Confirm dialogs
  confirmBtn: "אישור",
  cancelBtn: "ביטול",
  deleteBtn: "מחק",
  deleteProcessTitle: "מחיקת תהליך",

  // Stage card
  stageActive: "פעיל",

  // Rate limit
  rateLimitMessage: "בוצעו יותר מדי פניות",

  // Tooltips
  editTooltip: "ערוך תהליך",
  deleteTooltip: "מחק תהליך",
} as const;

export class WorkflowsPage {
  readonly page: Page;

  // Page elements
  readonly pageTitle: Locator;
  readonly pageSubtitle: Locator;

  // Tabs
  readonly tabActive: Locator;
  readonly tabTemplates: Locator;

  // Active instances view
  readonly startNewProcessButton: Locator;
  readonly resetWorkflowButton: Locator;

  // Template view
  readonly newTemplateButton: Locator;
  readonly deleteTemplateButton: Locator;
  readonly addStageButton: Locator;
  readonly chooseTemplateEmpty: Locator;

  // Empty states
  readonly noTemplatesMessage: Locator;
  readonly noActiveProcessesMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    this.pageTitle = page.getByRole("heading", { name: WF_TEXT.pageTitle });
    this.pageSubtitle = page.getByText(WF_TEXT.pageSubtitle);

    this.tabActive = page.getByRole("button", { name: WF_TEXT.tabActive });
    this.tabTemplates = page.getByRole("button", { name: WF_TEXT.tabTemplates });

    this.startNewProcessButton = page.getByRole("button", { name: WF_TEXT.startNewProcess });
    this.resetWorkflowButton = page.getByRole("button", { name: WF_TEXT.resetWorkflow });

    this.newTemplateButton = page.getByRole("button", { name: WF_TEXT.newTemplate });
    this.deleteTemplateButton = page.getByRole("button", { name: WF_TEXT.deleteTemplate });
    this.addStageButton = page.getByRole("button", { name: WF_TEXT.addStage });
    this.chooseTemplateEmpty = page.getByText(WF_TEXT.chooseTemplate);

    this.noTemplatesMessage = page.getByText(WF_TEXT.noTemplates);
    this.noActiveProcessesMessage = page.getByText(WF_TEXT.noActiveProcesses);
  }

  async goto() {
    await this.page.goto("/workflows");
    await this.page.waitForLoadState("networkidle");
  }

  // ── Instance card selectors ────────────────────────────────

  getInstanceCards() {
    return this.page.locator(".grid > div.group");
  }

  getInstanceCardByName(name: string) {
    return this.page.locator(".grid > div.group").filter({ hasText: name });
  }

  getEditButton(name: string) {
    return this.getInstanceCardByName(name).locator(`button[title="${WF_TEXT.editTooltip}"]`);
  }

  getDeleteButton(name: string) {
    return this.getInstanceCardByName(name).locator(`button[title="${WF_TEXT.deleteTooltip}"]`);
  }

  // ── Create instance modal ─────────────────────────────────

  getCreateModal() {
    return this.page
      .locator(".fixed.inset-0")
      .filter({ hasText: WF_TEXT.createModalTitle });
  }

  getTemplateButton(templateName: string) {
    return this.getCreateModal().getByRole("button").filter({ hasText: templateName });
  }

  getCreateNameInput() {
    return this.getCreateModal().getByPlaceholder("לדוגמה: אונבורדינג ללקוח X");
  }

  getCreateAssigneeSelect() {
    return this.getCreateModal().locator("select");
  }

  getCreateSubmitButton() {
    return this.getCreateModal().getByRole("button", { name: WF_TEXT.createSubmit });
  }

  getCreateCancelButton() {
    return this.getCreateModal().getByRole("button", { name: WF_TEXT.cancelBtn });
  }

  // ── Edit instance modal ───────────────────────────────────

  getEditModal() {
    return this.page
      .locator(".fixed.inset-0")
      .filter({ hasText: WF_TEXT.editModalTitle });
  }

  getEditNameInput() {
    return this.getEditModal().getByLabel(WF_TEXT.editNameLabel);
  }

  getEditAssigneeSelect() {
    return this.getEditModal().locator("select");
  }

  getEditSaveButton() {
    return this.getEditModal().getByRole("button", { name: WF_TEXT.saveChanges });
  }

  getEditCancelButton() {
    return this.getEditModal().getByRole("button", { name: WF_TEXT.cancelBtn });
  }

  // ── Detail view ───────────────────────────────────────────

  getBackButton() {
    return this.page.locator("button:has(svg.lucide-arrow-left)").first();
  }

  getStageToggleButton(stageName: string) {
    return this.page
      .locator("div.rounded-xl.border")
      .filter({ has: this.page.getByRole("heading", { name: stageName, level: 3 }) })
      .locator("button.rounded-full.w-8.h-8");
  }

  // ── Template view ─────────────────────────────────────────

  getWorkflowTab(name: string) {
    return this.page.getByRole("button", { name, exact: true });
  }

  getStageCards() {
    return this.page.locator(".overflow-x-auto div.rounded-xl.shadow-sm");
  }

  // ── Instance card helpers ────────────────────────────────

  getStatusBadge(instanceName: string) {
    return this.getInstanceCardByName(instanceName).locator("div.rounded.text-xs.font-medium");
  }

  getProgressText(instanceName: string) {
    return this.getInstanceCardByName(instanceName).getByText(/\d+%/);
  }

  getAssigneeText(instanceName: string) {
    return this.getInstanceCardByName(instanceName)
      .locator("div.flex.items-center.gap-1")
      .filter({ has: this.page.locator("svg.lucide-user") });
  }

  // ── Alert dialog (Radix) ──────────────────────────────────

  getAlertDialog() {
    return this.page.locator('[role="alertdialog"]');
  }

  async confirmAlertDialog() {
    const dialog = this.getAlertDialog();
    await dialog.getByRole("button", { name: WF_TEXT.confirmBtn }).click();
  }

  async cancelAlertDialog() {
    const dialog = this.getAlertDialog();
    await dialog.getByRole("button", { name: WF_TEXT.cancelBtn }).click();
  }

  // ── Destructive confirm dialog ────────────────────────────

  async confirmDestructiveDialog() {
    const dialog = this.getAlertDialog();
    const input = dialog.locator('input[aria-label="הקלד ביטוי אישור"]');
    await input.fill(WF_TEXT.deleteBtn);
    await dialog.getByRole("button", { name: WF_TEXT.deleteBtn }).click();
  }

  // ── Prompt dialog ─────────────────────────────────────────

  async fillPromptDialog(value: string) {
    const dialog = this.getAlertDialog();
    await dialog.locator("input").fill(value);
    await dialog.getByRole("button", { name: WF_TEXT.confirmBtn }).click();
  }

  // ── Modal close helpers ───────────────────────────────────

  async closeModalViaXButton(modal: Locator) {
    await modal.locator("button:has(svg.lucide-x)").first().click();
  }

  async closeModalViaOverlay(_modal: Locator) {
    await this.page.mouse.click(10, 10);
  }

  // ── Toast selectors ───────────────────────────────────────

  getToast() {
    return this.page.locator("[data-sonner-toast]");
  }

  getToastByText(text: string) {
    return this.page.locator("[data-sonner-toast]").filter({ hasText: text });
  }
}
