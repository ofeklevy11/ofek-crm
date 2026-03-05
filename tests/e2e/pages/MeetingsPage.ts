import { type Page, type Locator } from "@playwright/test";

export class MeetingsPage {
  readonly page: Page;

  // Page heading
  readonly pageTitle: Locator;
  readonly pageSubtitle: Locator;

  // Stats cards
  readonly statsGrid: Locator;
  readonly statTotal: Locator;
  readonly statPending: Locator;
  readonly statConfirmed: Locator;
  readonly statCompleted: Locator;

  // Tabs
  readonly tabMeetings: Locator;
  readonly tabCalendar: Locator;
  readonly tabTypes: Locator;
  readonly tabAvailability: Locator;

  // Automations button
  readonly automationsButton: Locator;

  // Meetings list - filters
  readonly searchInput: Locator;
  readonly statusSelect: Locator;
  readonly typeSelect: Locator;

  // Meetings list - table
  readonly table: Locator;
  readonly tableHeaders: Locator;
  readonly tableRows: Locator;
  readonly emptyState: Locator;
  readonly emptyTitle: Locator;

  // Pagination
  readonly paginationText: Locator;
  readonly paginationNext: Locator;
  readonly paginationPrev: Locator;

  // Loading
  readonly skeletons: Locator;

  // Meeting detail modal
  readonly detailModal: Locator;
  readonly detailParticipantSection: Locator;
  readonly detailStatusSelect: Locator;
  readonly detailNotesBefore: Locator;
  readonly detailNotesAfter: Locator;
  readonly detailSaveNotesButton: Locator;
  readonly detailTagInput: Locator;
  readonly detailAddTagButton: Locator;
  readonly detailCopyManageLinkButton: Locator;
  readonly detailCancelButton: Locator;
  readonly detailCancelReasonTextarea: Locator;
  readonly detailConfirmCancelButton: Locator;
  readonly detailBackFromCancelButton: Locator;
  readonly detailAutomationsSection: Locator;

  // Meeting types
  readonly typesGrid: Locator;
  readonly newTypeButton: Locator;
  readonly typesEmptyState: Locator;
  readonly createFirstTypeButton: Locator;

  // Meeting type modal (wizard)
  readonly typeModal: Locator;
  readonly typeModalTitle: Locator;
  readonly typeNameInput: Locator;
  readonly typeSlugInput: Locator;
  readonly typeDescInput: Locator;
  readonly typeActiveSwitch: Locator;
  readonly wizardNextButton: Locator;
  readonly wizardBackButton: Locator;
  readonly wizardCancelButton: Locator;
  readonly wizardCreateButton: Locator;
  readonly wizardSaveButton: Locator;
  readonly wizardPreview: Locator;

  // Wizard step 2 (timing)
  readonly bufferBeforeInput: Locator;
  readonly bufferAfterInput: Locator;

  // Wizard step 3 (constraints)
  readonly dailyLimitInput: Locator;
  readonly minAdvanceInput: Locator;
  readonly maxAdvanceInput: Locator;

  // Wizard step 4 (custom fields)
  readonly addFieldButton: Locator;

  // Calendar tab
  readonly calendar: Locator;
  readonly calendarDayPanel: Locator;

  constructor(page: Page) {
    this.page = page;

    // Heading
    this.pageTitle = page.getByRole("heading", { name: "פגישות" });
    this.pageSubtitle = page.getByText("ניהול פגישות, סוגים וזמינות");

    // Stats cards
    this.statsGrid = page.locator(".grid-cols-2.sm\\:grid-cols-4, .grid.grid-cols-2");
    this.statTotal = page.getByText("סה״כ החודש");
    this.statPending = page.getByText("ממתינות");
    this.statConfirmed = page.getByText("מאושרות");
    this.statCompleted = page.getByText("הושלמו");

    // Tabs
    this.tabMeetings = page.getByRole("tab", { name: "פגישות" });
    this.tabCalendar = page.getByRole("tab", { name: "יומן פגישות" });
    this.tabTypes = page.getByRole("tab", { name: /סוגי פגישות/ });
    this.tabAvailability = page.getByRole("tab", { name: "זמינות" });

    // Automations
    this.automationsButton = page.getByRole("button", { name: "אוטומציות" });

    // Filters
    this.searchInput = page.getByPlaceholder("חיפוש משתתף...");
    this.statusSelect = page.locator("button").filter({ hasText: "כל הסטטוסים" });
    this.typeSelect = page.locator("button").filter({ hasText: "כל הסוגים" });

    // Table
    this.table = page.locator("table");
    this.tableHeaders = page.locator("thead th");
    this.tableRows = page.locator("tbody tr");
    this.emptyState = page.locator("[class*='empty']");
    this.emptyTitle = page.getByText("אין פגישות");

    // Pagination — lucide icons use kebab-case class names
    this.paginationText = page.locator("text=/\\d+ \\/ \\d+/");
    this.paginationNext = page.locator("button").filter({ has: page.locator("svg.lucide-chevron-left") });
    this.paginationPrev = page.locator("button").filter({ has: page.locator("svg.lucide-chevron-right") });

    // Loading
    this.skeletons = page.locator(".mtg-skeleton-shimmer");

    // Detail modal
    this.detailModal = page.getByRole("dialog");
    this.detailParticipantSection = page.getByText("פרטי משתתף");
    this.detailStatusSelect = this.detailModal.locator("button").filter({ hasText: /ממתין|מאושר|הושלם|בוטל|לא הגיע/ }).first();
    // Source placeholders include trailing "..."
    this.detailNotesBefore = this.detailModal.getByPlaceholder("הערות לפני הפגישה...");
    this.detailNotesAfter = this.detailModal.getByPlaceholder("הערות אחרי הפגישה...");
    this.detailSaveNotesButton = this.detailModal.getByRole("button", { name: "שמור הערות" });
    this.detailTagInput = this.detailModal.getByPlaceholder("תגית חדשה...");
    this.detailAddTagButton = this.detailModal.getByRole("button", { name: "הוסף" });
    this.detailCopyManageLinkButton = this.detailModal.getByRole("button", { name: "העתק קישור ניהול למשתתף" });
    this.detailCancelButton = this.detailModal.getByRole("button", { name: "בטל פגישה" });
    this.detailCancelReasonTextarea = this.detailModal.getByPlaceholder("סיבת ביטול (אופציונלי)...");
    this.detailConfirmCancelButton = this.detailModal.getByRole("button", { name: "אשר ביטול" });
    this.detailBackFromCancelButton = this.detailModal.getByRole("button", { name: "חזור" });
    this.detailAutomationsSection = this.detailModal.getByText("אוטומציות לפגישה זו");

    // Meeting types
    this.typesGrid = page.locator(".grid.grid-cols-1");
    this.newTypeButton = page.getByRole("button", { name: "סוג חדש" });
    this.typesEmptyState = page.getByText("אין סוגי פגישות עדיין");
    this.createFirstTypeButton = page.getByRole("button", { name: "צור סוג פגישה ראשון" });

    // Type modal
    this.typeModal = page.getByRole("dialog");
    this.typeModalTitle = page.getByRole("dialog").locator("h2, [class*='DialogTitle']");
    this.typeNameInput = page.locator("#mt-name");
    this.typeSlugInput = page.locator("#mt-slug");
    this.typeDescInput = page.locator("#mt-desc");
    this.typeActiveSwitch = page.locator("#mt-active");
    this.wizardNextButton = page.getByRole("button", { name: "הבא" });
    this.wizardBackButton = page.getByRole("dialog").getByRole("button", { name: "חזרה" });
    this.wizardCancelButton = page.getByRole("dialog").getByRole("button", { name: "ביטול" });
    this.wizardCreateButton = page.getByRole("button", { name: "צור סוג פגישה" });
    this.wizardSaveButton = page.getByRole("button", { name: "שמור שינויים" });
    this.wizardPreview = page.locator(".hidden.sm\\:block, [class*='preview']");

    // Wizard step 2
    this.bufferBeforeInput = page.locator("#mt-buf-before");
    this.bufferAfterInput = page.locator("#mt-buf-after");

    // Wizard step 3
    this.dailyLimitInput = page.locator("#mt-limit");
    this.minAdvanceInput = page.locator("#mt-min-adv");
    this.maxAdvanceInput = page.locator("#mt-max-adv");

    // Wizard step 4
    this.addFieldButton = page.getByRole("button", { name: "הוסף שדה" });

    // Calendar
    this.calendar = page.locator(".mtg-dark-calendar, [class*='calendar']");
    this.calendarDayPanel = page.getByText("לחצו על יום כדי לראות את הפגישות");
  }

  async goto() {
    await this.page.goto("/meetings");
  }

  async waitForLoad() {
    await this.pageTitle.waitFor({ state: "visible", timeout: 15_000 });
  }

  async switchToTab(tab: "meetings" | "calendar" | "types" | "availability") {
    const tabMap = {
      meetings: this.tabMeetings,
      calendar: this.tabCalendar,
      types: this.tabTypes,
      availability: this.tabAvailability,
    };
    await tabMap[tab].click();
  }

  async openMeetingDetail(rowIndex: number) {
    await this.tableRows.nth(rowIndex).click();
    await this.detailModal.waitFor({ state: "visible" });
  }

  async openNewTypeWizard() {
    await this.newTypeButton.click();
    await this.typeModal.waitFor({ state: "visible" });
  }

  async fillTypeStep1(name: string, description?: string) {
    await this.typeNameInput.fill(name);
    if (description) {
      await this.typeDescInput.fill(description);
    }
  }

  async advanceWizardStep() {
    await this.wizardNextButton.click();
  }

  /** Find a meeting type card by its name text content */
  getTypeCardByName(name: string): Locator {
    return this.typesGrid
      .locator("> div")
      .filter({ hasText: name });
  }

  /** Get edit button (icon-only, has Pencil icon) on a type card */
  getTypeEditButton(cardLocator: Locator): Locator {
    return cardLocator.locator("button").filter({ has: this.page.locator("svg.lucide-pencil") });
  }

  /** Get delete button (icon-only, has Trash2 icon) on a type card */
  getTypeDeleteButton(cardLocator: Locator): Locator {
    return cardLocator.locator("button").filter({ has: this.page.locator("svg.lucide-trash-2") });
  }

  /** Get copy share link button on a type card */
  getTypeCopyLinkButton(cardLocator: Locator): Locator {
    return cardLocator.locator("button").filter({ has: this.page.locator("svg.lucide-link") });
  }
}
