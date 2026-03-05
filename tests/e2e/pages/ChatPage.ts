import { type Page, type Locator } from "@playwright/test";

export const CHAT_TEXT = {
  // Sidebar
  sidebarHeader: "צ'אט ארגוני",
  usersTab: "משתמשים",
  groupsTab: "קבוצות",
  createGroupButton: "+ קבוצה",
  loading: "טוען...",
  noGroups: "אין קבוצות עדיין",

  // Chat panel
  emptyState: "בחר משתמש או קבוצה להתחלת שיחה",
  messageInputPlaceholder: "הקלד הודעה...",
  sendButtonTitle: "שלח",
  loadingMessages: "טוען הודעות...",
  emptyMessages: "אין הודעות עדיין. תגיד שלום!",
  editGroupTitle: "ערוך קבוצה",
  userStatus: "מחובר (לכאורה)",

  // Create Group Modal
  createGroupModalTitle: "יצירת קבוצה חדשה",
  groupNameLabel: "שם הקבוצה",
  groupNamePlaceholder: "לדוגמה: צוות מכירות",
  groupImagePlaceholder: "https://example.com/image.jpg",
  selectParticipants: "בחר משתתפים",
  createGroupSubmit: "צור קבוצה",
  cancel: "ביטול",

  // Edit Group Modal
  editGroupModalTitle: "עריכת קבוצה",
  saveChanges: "שמור שינויים",

  // Members
  members: "חברים",
} as const;

export class ChatPage {
  readonly page: Page;

  // Sidebar
  readonly sidebarHeader: Locator;
  readonly sidebarContainer: Locator;
  readonly usersTab: Locator;
  readonly groupsTab: Locator;
  readonly createGroupButton: Locator;
  readonly loadingIndicator: Locator;
  readonly noGroupsText: Locator;

  // Chat panel
  readonly emptyState: Locator;
  readonly messageInput: Locator;
  readonly sendButton: Locator;
  readonly loadingMessages: Locator;
  readonly emptyMessages: Locator;
  readonly editGroupButton: Locator;

  // Create Group Modal
  readonly createModalContainer: Locator;
  readonly createGroupModal: Locator;
  readonly groupNameInput: Locator;
  readonly groupImageInput: Locator;
  readonly createGroupSubmit: Locator;
  readonly cancelButton: Locator;

  // Edit Group Modal
  readonly editModalContainer: Locator;
  readonly editGroupModal: Locator;
  readonly editGroupNameInput: Locator;
  readonly editGroupImageInput: Locator;
  readonly editCancelButton: Locator;
  readonly saveChangesButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Sidebar
    this.sidebarHeader = page.getByText(CHAT_TEXT.sidebarHeader);
    this.sidebarContainer = page.locator(".bg-gray-50").filter({ has: this.sidebarHeader });
    this.usersTab = page.getByText(CHAT_TEXT.usersTab);
    this.groupsTab = page.getByText(CHAT_TEXT.groupsTab);
    this.createGroupButton = page.getByText(CHAT_TEXT.createGroupButton);
    this.loadingIndicator = page.getByText(CHAT_TEXT.loading);
    this.noGroupsText = page.getByText(CHAT_TEXT.noGroups);

    // Chat panel
    this.emptyState = page.getByText(CHAT_TEXT.emptyState);
    this.messageInput = page.getByPlaceholder(CHAT_TEXT.messageInputPlaceholder);
    this.sendButton = page.locator('button[title="שלח"]');
    this.loadingMessages = page.getByText(CHAT_TEXT.loadingMessages);
    this.emptyMessages = page.getByText(CHAT_TEXT.emptyMessages);
    this.editGroupButton = page.locator('button[title="ערוך קבוצה"]');

    // Create Group Modal — scoped to the modal content container
    this.createModalContainer = page.locator("div.rounded-lg").filter({
      has: page.getByText(CHAT_TEXT.createGroupModalTitle),
    });
    this.createGroupModal = page.getByText(CHAT_TEXT.createGroupModalTitle);
    this.groupNameInput = this.createModalContainer.getByPlaceholder(CHAT_TEXT.groupNamePlaceholder);
    this.groupImageInput = this.createModalContainer.getByPlaceholder(CHAT_TEXT.groupImagePlaceholder);
    this.createGroupSubmit = page.getByText(CHAT_TEXT.createGroupSubmit);
    this.cancelButton = this.createModalContainer.getByText(CHAT_TEXT.cancel);

    // Edit Group Modal — scoped to the edit modal content container
    this.editModalContainer = page.locator("div.rounded-lg").filter({
      has: page.getByText(CHAT_TEXT.editGroupModalTitle),
    });
    this.editGroupModal = page.getByText(CHAT_TEXT.editGroupModalTitle);
    this.editGroupNameInput = this.editModalContainer.getByPlaceholder(CHAT_TEXT.groupNamePlaceholder);
    this.editGroupImageInput = this.editModalContainer.getByPlaceholder(CHAT_TEXT.groupImagePlaceholder);
    this.editCancelButton = this.editModalContainer.getByText(CHAT_TEXT.cancel);
    this.saveChangesButton = page.getByText(CHAT_TEXT.saveChanges);
  }

  async goto() {
    await this.page.goto("/chat");
  }

  async waitForLoaded() {
    await this.sidebarHeader.waitFor({ state: "visible", timeout: 15000 });
  }

  // Sidebar item locators — scoped to sidebar container
  userListItem(name: string): Locator {
    return this.sidebarContainer
      .locator(".cursor-pointer")
      .filter({ hasText: name });
  }

  groupListItem(name: string): Locator {
    return this.sidebarContainer
      .locator(".cursor-pointer")
      .filter({ hasText: name });
  }

  // User email in sidebar list item
  userEmail(name: string): Locator {
    return this.userListItem(name).locator(".text-gray-500");
  }

  // Chat header with contact name
  chatHeader(name: string): Locator {
    return this.page.locator("h3").filter({ hasText: name });
  }

  // Message content
  messageContent(text: string): Locator {
    return this.page.getByText(text);
  }

  // Member checkbox in create modal — uses label association (htmlFor)
  memberCheckbox(name: string): Locator {
    return this.createModalContainer.getByLabel(name);
  }

  // Member checkbox in edit modal — uses label association (htmlFor)
  editMemberCheckbox(name: string): Locator {
    return this.editModalContainer.getByLabel(name);
  }

  // Actions
  async selectUser(name: string) {
    await this.userListItem(name).click();
  }

  async selectGroup(name: string) {
    await this.groupListItem(name).click();
  }

  async sendMessageText(text: string) {
    await this.messageInput.fill(text);
    await this.sendButton.click();
  }

  async openCreateGroupModal() {
    await this.createGroupButton.click();
  }

  async switchToGroupsTab() {
    await this.groupsTab.click();
  }

  async switchToUsersTab() {
    await this.usersTab.click();
  }

  // Back button (mobile) — targets the button containing the back arrow SVG
  get backButton(): Locator {
    return this.page.locator("button").filter({
      has: this.page.locator('path[d*="10.5 19.5"]'),
    });
  }

  // Sent messages (right-aligned) — flex column with items-end containing message bubbles
  get sentMessages(): Locator {
    return this.page.locator(".flex.flex-col.items-end .rounded-2xl");
  }

  // Received messages (left-aligned) — flex column with items-start containing message bubbles
  get receivedMessages(): Locator {
    return this.page.locator(".flex.flex-col.items-start .rounded-2xl");
  }

  // Message timestamps inside bubbles
  get messageTimestamps(): Locator {
    return this.page.locator(".rounded-2xl .mt-1.text-right");
  }

  // Error toast (Sonner)
  get errorToast(): Locator {
    return this.page.locator("[data-sonner-toast][data-type='error']");
  }

  // Modal backdrop (create group) — the overlay containing the modal
  get createGroupBackdrop(): Locator {
    return this.page.locator(".bg-opacity-50").filter({
      has: this.page.getByText(CHAT_TEXT.createGroupModalTitle),
    });
  }
}
