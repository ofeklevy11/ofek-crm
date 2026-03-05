import { test, expect } from "@playwright/test";
import { ChatPage, CHAT_TEXT } from "./pages/ChatPage";
import {
  STORAGE_BASIC,
  STORAGE_NO_TASKS,
  interceptAllServerActions,
} from "./helpers/test-utils";
import path from "path";
import fs from "fs";

const AUTH_DIR = path.join(__dirname, ".auth");
const meta = JSON.parse(
  fs.readFileSync(path.join(AUTH_DIR, ".e2e-meta.json"), "utf-8"),
);

// ─────────────────────────────────────────────────────────
// 1. Navigation & Page Load (admin auth — default)
// ─────────────────────────────────────────────────────────

test.describe("Chat - Navigation & Page Load", () => {
  let chat: ChatPage;

  test.beforeEach(async ({ page }) => {
    chat = new ChatPage(page);
    await chat.goto();
    await chat.waitForLoaded();
  });

  test("should load chat page at /chat URL", async ({ page }) => {
    await expect(page).toHaveURL(/\/chat/);
  });

  test('should display sidebar with "צ\'אט ארגוני" header', async () => {
    await expect(chat.sidebarHeader).toBeVisible();
  });

  test("should show users tab active by default", async () => {
    await expect(chat.usersTab).toBeVisible();
    await expect(chat.usersTab).toHaveClass(/text-blue-600/);
  });

  test("should display empty state when no conversation selected", async () => {
    await expect(chat.emptyState).toBeVisible();
  });
});

// Loading state — standalone test without beforeEach to avoid race condition
test("Chat - should show loading state before data loads", async ({ page }) => {
  // Set up intercept BEFORE navigation
  const cleanup = await interceptAllServerActions(page, async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.fallback();
  });

  await page.goto("/chat");
  await expect(page.getByText(CHAT_TEXT.loading)).toBeVisible({ timeout: 3000 });
  await cleanup();
});

// ─────────────────────────────────────────────────────────
// 2. Authentication & Authorization
// ─────────────────────────────────────────────────────────

test.describe("Chat - Authentication & Authorization", () => {
  test("should redirect unauthenticated user to /login", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto("/chat");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("should redirect user without canViewChat to /", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: STORAGE_NO_TASKS,
    });
    const page = await context.newPage();
    await page.goto("/chat");
    await expect(page).not.toHaveURL(/\/chat/);
    await context.close();
  });

  test("should load normally for admin user", async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.goto();
    await chat.waitForLoaded();
    await expect(chat.sidebarHeader).toBeVisible();
  });

  test("should load normally for basic user with canViewChat", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: STORAGE_BASIC,
    });
    const page = await context.newPage();
    await page.goto("/chat");
    await expect(page.getByText(CHAT_TEXT.sidebarHeader)).toBeVisible({
      timeout: 15000,
    });
    await context.close();
  });
});

// ─────────────────────────────────────────────────────────
// 3. User List & DM Conversations
// ─────────────────────────────────────────────────────────

test.describe("Chat - User List & DM Conversations", () => {
  let chat: ChatPage;

  test.beforeEach(async ({ page }) => {
    chat = new ChatPage(page);
    await chat.goto();
    await chat.waitForLoaded();
    await expect(chat.loadingIndicator).toBeHidden({ timeout: 10000 });
  });

  test("should display other users in sidebar", async () => {
    await expect(chat.userListItem(meta.basicUserName)).toBeVisible();
  });

  test("should display user email in sidebar", async () => {
    const emailEl = chat.userEmail(meta.basicUserName);
    await expect(emailEl).toBeVisible();
    await expect(emailEl).toHaveText(/@/);
  });

  test("should open conversation when clicking a user", async () => {
    await chat.selectUser(meta.basicUserName);
    await expect(chat.chatHeader(meta.basicUserName)).toBeVisible();
  });

  test("should display chat header with user name", async () => {
    await chat.selectUser(meta.basicUserName);
    await expect(chat.chatHeader(meta.basicUserName)).toBeVisible();
    await expect(
      chat.page.getByText(CHAT_TEXT.userStatus),
    ).toBeVisible();
  });

  test("should show existing messages in conversation", async () => {
    await chat.selectUser(meta.basicUserName);
    await expect(chat.loadingMessages).toBeHidden({ timeout: 10000 });
    await expect(chat.messageContent("שלום, מה שלומך?")).toBeVisible();
    await expect(chat.messageContent("הכל טוב, תודה!")).toBeVisible();
  });

  test('should show "אין הודעות עדיין" for user with no messages', async () => {
    // noTasksUser is in the same company and appears in getUsers()
    await chat.selectUser("E2E No Tasks User");
    await expect(chat.emptyMessages).toBeVisible({ timeout: 10000 });
  });

  test("should distinguish sent vs received messages", async () => {
    await chat.selectUser(meta.basicUserName);
    await expect(chat.loadingMessages).toBeHidden({ timeout: 10000 });
    await expect(chat.sentMessages.first()).toBeVisible();
    await expect(chat.receivedMessages.first()).toBeVisible();
  });

  test("should display message timestamps", async () => {
    await chat.selectUser(meta.basicUserName);
    await expect(chat.loadingMessages).toBeHidden({ timeout: 10000 });
    await expect(chat.messageTimestamps.first()).toBeVisible();
  });

  test("should not show current user in own user list", async () => {
    await expect(chat.userListItem(meta.adminUserName)).toBeHidden();
  });

  test("should display messages in chronological order", async () => {
    await chat.selectUser(meta.basicUserName);
    await expect(chat.loadingMessages).toBeHidden({ timeout: 10000 });
    const allBubbles = chat.page.locator(".rounded-2xl p");
    const texts = await allBubbles.allTextContents();
    const idx1 = texts.indexOf("שלום, מה שלומך?");
    const idx2 = texts.indexOf("הכל טוב, תודה!");
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx2).toBeGreaterThanOrEqual(0);
    expect(idx1).toBeLessThan(idx2);
  });
});

// ─────────────────────────────────────────────────────────
// 4. Sending Messages (DM)
// ─────────────────────────────────────────────────────────

test.describe("Chat - Sending DM Messages", () => {
  let chat: ChatPage;

  test.beforeEach(async ({ page }) => {
    chat = new ChatPage(page);
    await chat.goto();
    await chat.waitForLoaded();
    await expect(chat.loadingIndicator).toBeHidden({ timeout: 10000 });
    await chat.selectUser(meta.basicUserName);
    await expect(chat.loadingMessages).toBeHidden({ timeout: 10000 });
  });

  test("should type message in input field", async () => {
    await chat.messageInput.fill("הודעת בדיקה");
    await expect(chat.messageInput).toHaveValue("הודעת בדיקה");
  });

  test("should have send button disabled when input is empty", async () => {
    await expect(chat.sendButton).toBeDisabled();
  });

  test("should have send button disabled for whitespace-only input", async () => {
    await chat.messageInput.fill("   ");
    await expect(chat.sendButton).toBeDisabled();
  });

  test("should send message and display it in conversation", async () => {
    const testMsg = `הודעת בדיקה ${Date.now()}`;
    await chat.sendMessageText(testMsg);
    await expect(chat.messageContent(testMsg)).toBeVisible({ timeout: 10000 });
  });

  test("should send message via Enter key", async () => {
    const testMsg = `הודעת Enter ${Date.now()}`;
    await chat.messageInput.fill(testMsg);
    await chat.messageInput.press("Enter");
    await expect(chat.messageContent(testMsg)).toBeVisible({ timeout: 10000 });
  });

  test("should clear input after sending", async () => {
    await chat.sendMessageText("הודעה לניקוי");
    await expect(chat.messageInput).toHaveValue("");
  });

  test("should show error toast on send failure", async ({ page }) => {
    // Abort server actions to simulate network failure
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.abort("failed");
    });

    await chat.messageInput.fill("הודעה שתיכשל");
    await chat.sendButton.click();

    await expect(chat.errorToast.first()).toBeVisible({ timeout: 10000 });
    await expect(chat.errorToast.first()).toContainText(/שגיאה/);

    await cleanup();
  });

  test("should send correct message content to server action", async ({ page }) => {
    let capturedBody: string | null = null;
    await page.route("**/*", async (route) => {
      const headers = route.request().headers();
      if (route.request().method() === "POST" && headers["next-action"]) {
        capturedBody = route.request().postData();
      }
      await route.fallback();
    });

    const testMsg = `payload-test-${Date.now()}`;
    await chat.sendMessageText(testMsg);
    await expect(chat.messageContent(testMsg)).toBeVisible({ timeout: 10000 });

    expect(capturedBody).toBeTruthy();
    expect(capturedBody).toContain(testMsg);

    await page.unroute("**/*");
  });
});

// ─────────────────────────────────────────────────────────
// 5. Groups Tab
// ─────────────────────────────────────────────────────────

test.describe("Chat - Groups Tab", () => {
  let chat: ChatPage;

  test.beforeEach(async ({ page }) => {
    chat = new ChatPage(page);
    await chat.goto();
    await chat.waitForLoaded();
    await expect(chat.loadingIndicator).toBeHidden({ timeout: 10000 });
  });

  test("should switch to groups tab and show groups", async () => {
    await chat.switchToGroupsTab();
    await expect(chat.groupsTab).toHaveClass(/text-blue-600/);
    await expect(chat.groupListItem(meta.chatGroupName)).toBeVisible();
  });

  test("should open group conversation when clicking a group", async () => {
    await chat.switchToGroupsTab();
    await chat.selectGroup(meta.chatGroupName);
    await expect(chat.chatHeader(meta.chatGroupName)).toBeVisible();
  });

  test("should display group header with name and member count", async () => {
    await chat.switchToGroupsTab();
    await chat.selectGroup(meta.chatGroupName);
    await expect(chat.chatHeader(meta.chatGroupName)).toBeVisible();
    await expect(chat.page.getByText(/\d+ חברים/)).toBeVisible();
  });

  test("should show edit group button in group chat header", async () => {
    await chat.switchToGroupsTab();
    await chat.selectGroup(meta.chatGroupName);
    await expect(chat.editGroupButton).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 6. Group Messages
// ─────────────────────────────────────────────────────────

test.describe("Chat - Group Messages", () => {
  let chat: ChatPage;

  test.beforeEach(async ({ page }) => {
    chat = new ChatPage(page);
    await chat.goto();
    await chat.waitForLoaded();
    await expect(chat.loadingIndicator).toBeHidden({ timeout: 10000 });
    await chat.switchToGroupsTab();
    await chat.selectGroup(meta.chatGroupName);
    await expect(chat.loadingMessages).toBeHidden({ timeout: 10000 });
  });

  test("should display group messages", async () => {
    await expect(chat.messageContent("ברוכים הבאים לקבוצה!")).toBeVisible();
    await expect(chat.messageContent("תודה, שמח להיות כאן")).toBeVisible();
  });

  test("should show sender name on messages from others in group", async () => {
    await expect(chat.page.getByText(meta.basicUserName).first()).toBeVisible();
  });

  test("should send group message", async () => {
    const testMsg = `הודעה קבוצתית ${Date.now()}`;
    await chat.sendMessageText(testMsg);
    await expect(chat.messageContent(testMsg)).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────
// 7. Create Group Modal
// ─────────────────────────────────────────────────────────

test.describe("Chat - Create Group Modal", () => {
  let chat: ChatPage;

  test.beforeEach(async ({ page }) => {
    chat = new ChatPage(page);
    await chat.goto();
    await chat.waitForLoaded();
    await expect(chat.loadingIndicator).toBeHidden({ timeout: 10000 });
  });

  test('should open create group modal on "+ קבוצה" click', async () => {
    await chat.openCreateGroupModal();
    await expect(chat.createGroupModal).toBeVisible();
  });

  test('should close modal on "ביטול" click', async () => {
    await chat.openCreateGroupModal();
    await expect(chat.createGroupModal).toBeVisible();
    await chat.cancelButton.click();
    await expect(chat.createGroupModal).toBeHidden();
  });

  test("should close modal on backdrop click", async () => {
    await chat.openCreateGroupModal();
    await expect(chat.createGroupModal).toBeVisible();
    await chat.createGroupBackdrop.click({ position: { x: 10, y: 10 } });
    await expect(chat.createGroupModal).toBeHidden();
  });

  test("should have submit disabled when name is empty", async () => {
    await chat.openCreateGroupModal();
    await chat.memberCheckbox(meta.basicUserName).check();
    await expect(chat.createGroupSubmit).toBeDisabled();
  });

  test("should have submit disabled when no members selected", async () => {
    await chat.openCreateGroupModal();
    await chat.groupNameInput.fill("קבוצת בדיקה");
    await expect(chat.createGroupSubmit).toBeDisabled();
  });

  test("should create group with name and selected members", async () => {
    await chat.openCreateGroupModal();
    const groupName = `קבוצה חדשה ${Date.now()}`;
    await chat.groupNameInput.fill(groupName);
    await chat.memberCheckbox(meta.basicUserName).check();
    await chat.createGroupSubmit.click();

    await expect(chat.createGroupModal).toBeHidden({ timeout: 10000 });
    // Should switch to groups tab
    await expect(chat.groupsTab).toHaveClass(/text-blue-600/);
    // New group should appear
    await expect(chat.groupListItem(groupName)).toBeVisible({ timeout: 10000 });
  });

  test("should show error toast on group creation failure", async ({ page }) => {
    await chat.openCreateGroupModal();
    await chat.groupNameInput.fill("קבוצה שתיכשל");
    await chat.memberCheckbox(meta.basicUserName).check();

    // Intercept server actions to simulate failure
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.abort("failed");
    });

    await chat.createGroupSubmit.click();

    await expect(chat.errorToast.first()).toBeVisible({ timeout: 10000 });
    await expect(chat.errorToast.first()).toContainText(/שגיאה/);

    await cleanup();
  });

  test("should show error toast when group name exceeds maximum length (101 chars)", async () => {
    await chat.openCreateGroupModal();
    const overMaxName = "א".repeat(101);
    await chat.groupNameInput.fill(overMaxName);
    await chat.memberCheckbox(meta.basicUserName).check();

    await chat.createGroupSubmit.click();
    await expect(chat.errorToast.first()).toBeVisible({ timeout: 10000 });
    await expect(chat.errorToast.first()).toContainText(/שגיאה/);
  });
});

// ─────────────────────────────────────────────────────────
// 8. Edit Group Modal
// ─────────────────────────────────────────────────────────

test.describe("Chat - Edit Group Modal", () => {
  test.describe.configure({ mode: "serial" });

  let chat: ChatPage;

  test.beforeEach(async ({ page }) => {
    chat = new ChatPage(page);
    await chat.goto();
    await chat.waitForLoaded();
    await expect(chat.loadingIndicator).toBeHidden({ timeout: 10000 });
    await chat.switchToGroupsTab();
    await chat.selectGroup(meta.chatGroupName);
    await expect(chat.loadingMessages).toBeHidden({ timeout: 10000 });
  });

  test("should open edit modal with pre-filled group name", async () => {
    await chat.editGroupButton.click();
    await expect(chat.editGroupModal).toBeVisible();
    await expect(chat.editGroupNameInput).toHaveValue(meta.chatGroupName);
  });

  test("should have pre-selected member checkboxes in edit modal", async () => {
    await chat.editGroupButton.click();
    await expect(chat.editGroupModal).toBeVisible();
    // The basic user is a member of the seeded group — checkbox should be checked
    await expect(chat.editMemberCheckbox(meta.basicUserName)).toBeChecked();
  });

  test("should have save disabled when group name is cleared", async () => {
    await chat.editGroupButton.click();
    await expect(chat.editGroupModal).toBeVisible();
    await chat.editGroupNameInput.clear();
    await expect(chat.saveChangesButton).toBeDisabled();
  });

  test("should have save disabled when all members are unchecked", async () => {
    await chat.editGroupButton.click();
    await expect(chat.editGroupModal).toBeVisible();
    // Uncheck all currently checked members
    const checkedBoxes = chat.editModalContainer.locator('input[type="checkbox"]:checked');
    const count = await checkedBoxes.count();
    for (let i = 0; i < count; i++) {
      await checkedBoxes.first().uncheck();
    }
    await expect(chat.saveChangesButton).toBeDisabled();
  });

  test("should close edit modal on cancel", async () => {
    await chat.editGroupButton.click();
    await expect(chat.editGroupModal).toBeVisible();
    await chat.editCancelButton.click();
    await expect(chat.editGroupModal).toBeHidden();
  });

  test("should close edit modal on backdrop click", async () => {
    await chat.editGroupButton.click();
    await expect(chat.editGroupModal).toBeVisible();
    const editBackdrop = chat.page.locator(".bg-opacity-50").filter({
      has: chat.page.getByText(CHAT_TEXT.editGroupModalTitle),
    });
    await editBackdrop.click({ position: { x: 10, y: 10 } });
    await expect(chat.editGroupModal).toBeHidden();
  });

  test("should show error toast on group edit failure", async ({ page }) => {
    await chat.editGroupButton.click();
    await expect(chat.editGroupModal).toBeVisible();

    await chat.editGroupNameInput.clear();
    await chat.editGroupNameInput.fill("שם שייכשל");

    // Intercept server actions to simulate failure
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.abort("failed");
    });

    await chat.saveChangesButton.click();

    await expect(chat.errorToast.first()).toBeVisible({ timeout: 10000 });
    await expect(chat.errorToast.first()).toContainText(/שגיאה/);

    await cleanup();
  });

  test("should add a member to group and update member count", async () => {
    // Get current member count
    const memberCountText = await chat.page.getByText(/\d+ חברים/).textContent();
    const originalCount = parseInt(memberCountText!.match(/(\d+)/)![1]);

    await chat.editGroupButton.click();
    await expect(chat.editGroupModal).toBeVisible();

    // Find an unchecked member and capture their label for targeted restore
    const uncheckedBox = chat.editModalContainer.locator('input[type="checkbox"]:not(:checked)').first();
    const hasUnchecked = await uncheckedBox.count();
    if (hasUnchecked === 0) return; // Skip if all members already selected

    const addedMemberLabel = await uncheckedBox.evaluate(
      (el) => el.closest("div")?.querySelector("label")?.textContent ?? ""
    );
    await uncheckedBox.check();
    await chat.saveChangesButton.click();
    await expect(chat.editGroupModal).toBeHidden({ timeout: 10000 });

    // Verify member count increased
    await expect(chat.page.getByText(`${originalCount + 1} חברים`)).toBeVisible({ timeout: 10000 });

    // Restore: uncheck the specific member we added
    try {
      await chat.editGroupButton.click();
      await expect(chat.editGroupModal).toBeVisible();
      if (addedMemberLabel) {
        await chat.editMemberCheckbox(addedMemberLabel).uncheck();
      }
      await chat.saveChangesButton.click();
      await expect(chat.editGroupModal).toBeHidden({ timeout: 10000 });
    } catch {
      // Best effort restore
    }
  });

  test("should remove a member from group and update member count", async () => {
    const memberCountText = await chat.page.getByText(/\d+ חברים/).textContent();
    const originalCount = parseInt(memberCountText!.match(/(\d+)/)![1]);
    if (originalCount <= 1) return; // Can't remove if only 1 member

    await chat.editGroupButton.click();
    await expect(chat.editGroupModal).toBeVisible();

    // Find a checked member (not self — admin is excluded from list) and capture their label
    const checkedBox = chat.editModalContainer.locator('input[type="checkbox"]:checked').first();
    const removedMemberLabel = await checkedBox.evaluate(
      (el) => el.closest("div")?.querySelector("label")?.textContent ?? ""
    );
    await checkedBox.uncheck();
    await chat.saveChangesButton.click();
    await expect(chat.editGroupModal).toBeHidden({ timeout: 10000 });

    // Verify member count decreased
    await expect(chat.page.getByText(`${originalCount - 1} חברים`)).toBeVisible({ timeout: 10000 });

    // Restore: re-add the removed member
    try {
      await chat.editGroupButton.click();
      await expect(chat.editGroupModal).toBeVisible();
      if (removedMemberLabel) {
        await chat.editMemberCheckbox(removedMemberLabel).check();
      }
      await chat.saveChangesButton.click();
      await expect(chat.editGroupModal).toBeHidden({ timeout: 10000 });
    } catch {
      // Best effort restore
    }
  });

  test("should not show current user in edit modal member list", async () => {
    await chat.editGroupButton.click();
    await expect(chat.editGroupModal).toBeVisible();
    await expect(chat.editMemberCheckbox(meta.adminUserName)).toBeHidden();
  });

  // LAST: mutates DB — renames group then restores original name
  test("should update group name", async () => {
    await chat.editGroupButton.click();
    await expect(chat.editGroupModal).toBeVisible();
    const newName = `שם מעודכן ${Date.now()}`;
    await chat.editGroupNameInput.clear();
    await chat.editGroupNameInput.fill(newName);
    await chat.saveChangesButton.click();

    await expect(chat.editGroupModal).toBeHidden({ timeout: 10000 });
    await expect(chat.chatHeader(newName)).toBeVisible({ timeout: 10000 });

    // Restore original group name
    try {
      await chat.editGroupButton.click();
      await expect(chat.editGroupModal).toBeVisible();
      await chat.editGroupNameInput.clear();
      await chat.editGroupNameInput.fill(meta.chatGroupName);
      await chat.saveChangesButton.click();
      await expect(chat.editGroupModal).toBeHidden({ timeout: 10000 });
      await expect(chat.chatHeader(meta.chatGroupName)).toBeVisible({ timeout: 10000 });
    } catch {
      // Best effort — don't mask original assertion failure
    }
  });
});

// ─────────────────────────────────────────────────────────
// 9. Responsive Layout (Mobile)
// ─────────────────────────────────────────────────────────

test.describe("Chat - Responsive Layout", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  let chat: ChatPage;

  test.beforeEach(async ({ page }) => {
    chat = new ChatPage(page);
    await chat.goto();
    await chat.waitForLoaded();
    await expect(chat.loadingIndicator).toBeHidden({ timeout: 10000 });
  });

  test("should show sidebar and hide chat panel on mobile when no conversation selected", async () => {
    await expect(chat.sidebarHeader).toBeVisible();
    await expect(chat.emptyState).toBeHidden();
  });

  test("should show chat panel and hide sidebar on mobile when conversation selected", async () => {
    await chat.selectUser(meta.basicUserName);
    await expect(chat.chatHeader(meta.basicUserName)).toBeVisible();
    await expect(chat.sidebarHeader).toBeHidden();
  });

  test("should show back button on mobile in chat view", async () => {
    await chat.selectUser(meta.basicUserName);
    await expect(chat.backButton).toBeVisible();
  });

  test("should return to sidebar when clicking back button on mobile", async () => {
    await chat.selectUser(meta.basicUserName);
    await expect(chat.chatHeader(meta.basicUserName)).toBeVisible();
    await chat.backButton.click();
    // Sidebar should be visible again
    await expect(chat.sidebarHeader).toBeVisible();
    // Chat panel should be hidden
    await expect(chat.chatHeader(meta.basicUserName)).toBeHidden();
  });

  test("should handle group conversation on mobile", async () => {
    await chat.switchToGroupsTab();
    await chat.selectGroup(meta.chatGroupName);
    await expect(chat.chatHeader(meta.chatGroupName)).toBeVisible();
    await expect(chat.sidebarHeader).toBeHidden();
    // Back button should return to sidebar
    await chat.backButton.click();
    await expect(chat.sidebarHeader).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 10. Switching Conversations
// ─────────────────────────────────────────────────────────

test.describe("Chat - Switching Conversations", () => {
  let chat: ChatPage;

  test.beforeEach(async ({ page }) => {
    chat = new ChatPage(page);
    await chat.goto();
    await chat.waitForLoaded();
    await expect(chat.loadingIndicator).toBeHidden({ timeout: 10000 });
  });

  test("should switch from DM to group conversation", async () => {
    // First, open a DM
    await chat.selectUser(meta.basicUserName);
    await expect(chat.chatHeader(meta.basicUserName)).toBeVisible();

    // Switch to groups tab and select a group
    await chat.switchToGroupsTab();
    await chat.selectGroup(meta.chatGroupName);

    // Group header should be visible, DM header should be gone
    await expect(chat.chatHeader(meta.chatGroupName)).toBeVisible();
    await expect(chat.chatHeader(meta.basicUserName)).toBeHidden();
  });

  test("should switch from group to DM conversation", async () => {
    // First, open a group
    await chat.switchToGroupsTab();
    await chat.selectGroup(meta.chatGroupName);
    await expect(chat.chatHeader(meta.chatGroupName)).toBeVisible();

    // Switch to users tab and select a user
    await chat.switchToUsersTab();
    await chat.selectUser(meta.basicUserName);

    // DM header should be visible, group header should be gone
    await expect(chat.chatHeader(meta.basicUserName)).toBeVisible();
    await expect(chat.chatHeader(meta.chatGroupName)).toBeHidden();
  });
});

// ─────────────────────────────────────────────────────────
// 11. Edge Cases
// ─────────────────────────────────────────────────────────

test.describe("Chat - Edge Cases", () => {
  let chat: ChatPage;

  test.beforeEach(async ({ page }) => {
    chat = new ChatPage(page);
    await chat.goto();
    await chat.waitForLoaded();
    await expect(chat.loadingIndicator).toBeHidden({ timeout: 10000 });
    await chat.selectUser(meta.basicUserName);
    await expect(chat.loadingMessages).toBeHidden({ timeout: 10000 });
  });

  test("should handle very long message text without UI breaking", async ({
    page,
  }) => {
    const longMsg = "א".repeat(500);
    await chat.sendMessageText(longMsg);
    await expect(chat.messageContent(longMsg)).toBeVisible({ timeout: 10000 });
    const bubble = chat.messageContent(longMsg);
    const box = await bubble.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      const viewport = page.viewportSize()!;
      expect(box.width).toBeLessThanOrEqual(viewport.width);
    }
  });

  test("should handle Hebrew and emoji in messages", async () => {
    const emojiMsg = "שלום עולם! 🎉🚀 בדיקה";
    await chat.sendMessageText(emojiMsg);
    await expect(chat.messageContent(emojiMsg)).toBeVisible({ timeout: 10000 });
  });

  test("should handle message at maximum allowed length (5000 chars)", async () => {
    // Use a unique prefix so substring match doesn't collide with the 500-char "א" test
    const prefix = "ב";
    const maxMsg = prefix + "א".repeat(4999);
    await chat.sendMessageText(maxMsg);
    const msgBubble = chat.page.locator(".rounded-2xl").filter({ hasText: prefix + "א".repeat(49) });
    await expect(msgBubble.first()).toBeVisible({ timeout: 15000 });
  });

  test("should show error toast when message exceeds maximum length (5001 chars)", async () => {
    const overMaxMsg = "א".repeat(5001);
    await chat.messageInput.fill(overMaxMsg);
    await chat.sendButton.click();
    await expect(chat.errorToast.first()).toBeVisible({ timeout: 10000 });
  });

  test("should handle special characters in group name", async () => {
    await chat.openCreateGroupModal();
    const specialName = `קבוצה (בדיקה) - #1 & "מיוחד"`;
    await chat.groupNameInput.fill(specialName);
    await chat.memberCheckbox(meta.basicUserName).check();
    await chat.createGroupSubmit.click();
    await expect(chat.createGroupModal).toBeHidden({ timeout: 10000 });
    await expect(chat.groupListItem(specialName)).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────
// 12. Error States
// ─────────────────────────────────────────────────────────

test("Chat - should show error toast on initial data load failure", async ({ page }) => {
  const chat = new ChatPage(page);
  // Intercept server actions BEFORE navigation to simulate load failure
  const cleanup = await interceptAllServerActions(page, async (route) => {
    await route.abort("failed");
  });

  await page.goto("/chat");

  // Toast should appear for the data load error
  await expect(chat.errorToast.first()).toBeVisible({ timeout: 15000 });
  await expect(chat.errorToast.first()).toContainText(/שגיאה/);

  await cleanup();
});

// ─────────────────────────────────────────────────────────
// 13. Message Fetch Failure
// ─────────────────────────────────────────────────────────

test("Chat - should show error toast on message fetch failure", async ({ page }) => {
  const chat = new ChatPage(page);
  await chat.goto();
  await chat.waitForLoaded();
  await expect(chat.loadingIndicator).toBeHidden({ timeout: 10000 });

  // Intercept server actions AFTER page load to only fail message fetch
  const cleanup = await interceptAllServerActions(page, async (route) => {
    await route.abort("failed");
  });

  await chat.selectUser(meta.basicUserName);

  await expect(chat.errorToast.first()).toBeVisible({ timeout: 10000 });
  await expect(chat.errorToast.first()).toContainText(/שגיאה/);

  await cleanup();
});

// ─────────────────────────────────────────────────────────
// 14. Group Message Fetch Failure
// ─────────────────────────────────────────────────────────

test("Chat - should show error toast on group message fetch failure", async ({ page }) => {
  const chat = new ChatPage(page);
  await chat.goto();
  await chat.waitForLoaded();
  await expect(chat.loadingIndicator).toBeHidden({ timeout: 10000 });

  await chat.switchToGroupsTab();

  // Intercept server actions AFTER page load to only fail group message fetch
  const cleanup = await interceptAllServerActions(page, async (route) => {
    await route.abort("failed");
  });

  await chat.selectGroup(meta.chatGroupName);

  await expect(chat.errorToast.first()).toBeVisible({ timeout: 10000 });
  await expect(chat.errorToast.first()).toContainText(/שגיאה/);

  await cleanup();
});
