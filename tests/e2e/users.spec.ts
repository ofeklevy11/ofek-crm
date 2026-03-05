import { test, expect, type Page } from "@playwright/test";
import { UsersPage, USER_TEXT } from "./pages/UsersPage";
import { STORAGE_ADMIN, STORAGE_NO_TASKS, mockApiRoute } from "./helpers/test-utils";

// ─── Defaults ────────────────────────────────────────────────
test.use({ storageState: STORAGE_ADMIN });

// ─── Mock data factories ─────────────────────────────────────

function makeUser(overrides: Partial<{
  id: number;
  name: string;
  email: string;
  role: string;
  permissions: Record<string, boolean>;
  tablePermissions: Record<string, string>;
  allowedWriteTableIds: number[];
}> = {}) {
  return {
    id: 1,
    name: "Test User",
    email: "test@test.com",
    role: "basic",
    permissions: {},
    tablePermissions: {},
    allowedWriteTableIds: [],
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

const MOCK_ADMIN = makeUser({ id: 1, name: "Admin User", email: "admin@test.com", role: "admin" });
const MOCK_MANAGER = makeUser({ id: 2, name: "Manager User", email: "manager@test.com", role: "manager", permissions: { canViewTasks: true, canViewTables: true } });
const MOCK_BASIC = makeUser({ id: 3, name: "Basic User", email: "basic@test.com", role: "basic" });

const MOCK_MANY_PERMS = makeUser({
  id: 4,
  name: "Multi Perm User",
  email: "multi@test.com",
  role: "manager",
  permissions: {
    canViewTasks: true,
    canViewTables: true,
    canViewMeetings: true,
    canViewFinance: true,
    canManageAutomations: true,
  },
});

const MOCK_USERS = [MOCK_ADMIN, MOCK_MANAGER, MOCK_BASIC];

// 65 users for pagination tests (3 pages at 30 per page)
const MANY_USERS = Array.from({ length: 65 }, (_, i) =>
  makeUser({
    id: i + 1,
    name: `User ${String(i + 1).padStart(2, "0")}`,
    email: `user${i + 1}@test.com`,
  })
);

const MOCK_TABLES = {
  data: [
    { id: 1, name: "לקוחות", slug: "customers" },
    { id: 2, name: "הזמנות", slug: "orders" },
  ],
  hasMore: false,
};

/** Intercept both /api/users and /api/tables with mock data */
async function mockUsersPage(
  page: Page,
  users = MOCK_USERS,
  tables = MOCK_TABLES,
) {
  await mockApiRoute(page, "**/api/users", { body: users });
  await mockApiRoute(page, "**/api/tables*", { body: tables });
}

/** Wait for a toast message */
async function expectToast(page: Page, message: string) {
  await expect(page.getByText(message).first()).toBeVisible({ timeout: 10_000 });
}

// ─── 1. Navigation & Page Load ───────────────────────────────

test.describe("Navigation & Page Load", () => {
  test("should load page with correct URL and title", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await expect(page).toHaveURL(/\/users/);
    await expect(usersPage.pageTitle).toBeVisible();
    await expect(usersPage.pageSubtitle).toBeVisible();
  });

  test("should show loading spinner then resolve to user table", async ({ page }) => {
    // Delay the API response to catch the spinner
    await page.route("**/api/users", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_USERS) });
    });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await page.goto("/users");
    // Spinner should appear briefly
    await expect(usersPage.loadingSpinner).toBeVisible({ timeout: 5_000 });
    // Then resolve
    await expect(usersPage.usersTable).toBeVisible({ timeout: 15_000 });
  });

  test("should display table headers correctly", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    const headers = page.locator("thead th");
    await expect(headers.nth(0)).toHaveText(USER_TEXT.headerName);
    await expect(headers.nth(1)).toHaveText(USER_TEXT.headerEmail);
    await expect(headers.nth(2)).toHaveText(USER_TEXT.headerRole);
    await expect(headers.nth(3)).toHaveText(USER_TEXT.headerPermissions);
    await expect(headers.nth(4)).toHaveText(USER_TEXT.headerActions);
  });

  test("should show mocked users in the table", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    for (const user of MOCK_USERS) {
      await expect(usersPage.getUserRowByName(user.name)).toBeVisible();
    }
  });
});

// ─── 2. Authentication & Authorization ───────────────────────

test.describe("Authentication & Authorization", () => {
  test("should redirect unauthenticated user to /login", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/users");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("should redirect user without canViewUsers to /", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE_NO_TASKS });
    const page = await context.newPage();
    await page.goto("/users");
    await page.waitForLoadState("networkidle");
    // Should NOT see the users page title
    const title = page.getByRole("heading", { name: USER_TEXT.pageTitle });
    await expect(title).not.toBeVisible({ timeout: 5_000 });
    // Verify actual redirect to root
    await expect(page).toHaveURL(/^\/?$/);
    await context.close();
  });

  test("should load page normally for admin user", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();
    await expect(usersPage.pageTitle).toBeVisible();
    await expect(usersPage.newUserButton).toBeVisible();
  });
});

// ─── 3. User List Display ────────────────────────────────────

test.describe("User List Display", () => {
  test("should display user name, email, and role badge for each user", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    // Admin user
    const adminRow = usersPage.getUserRowByName(MOCK_ADMIN.name);
    await expect(adminRow).toContainText(MOCK_ADMIN.email);
    await expect(adminRow).toContainText(USER_TEXT.roleAdmin);

    // Manager user
    const managerRow = usersPage.getUserRowByName(MOCK_MANAGER.name);
    await expect(managerRow).toContainText(MOCK_MANAGER.email);
    await expect(managerRow).toContainText(USER_TEXT.roleManager);

    // Basic user
    const basicRow = usersPage.getUserRowByName(MOCK_BASIC.name);
    await expect(basicRow).toContainText(MOCK_BASIC.email);
    await expect(basicRow).toContainText(USER_TEXT.roleBasic);
  });

  test('should show "כל ההרשאות" for admin users', async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    const permCell = usersPage.getPermissionCell(MOCK_ADMIN.name);
    await expect(permCell).toContainText(USER_TEXT.allPermissions);
  });

  test("should show permission icons for users with permissions", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    // Manager has canViewTasks + canViewTables → should show permission badges
    // Use title attribute selector which is stable across CSS changes
    await expect(usersPage.getPermissionBadges(MOCK_MANAGER.name)).toHaveCount(2);
  });

  test('should show "אין הרשאות נוספות" for users without permissions', async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    const permCell = usersPage.getPermissionCell(MOCK_BASIC.name);
    await expect(permCell).toContainText(USER_TEXT.noPermissions);
  });

  test("should show edit and delete buttons for each user", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    for (const user of MOCK_USERS) {
      const row = usersPage.getUserRowByName(user.name);
      await expect(row.getByRole("button", { name: USER_TEXT.edit })).toBeVisible();
      await expect(row.getByRole("button", { name: USER_TEXT.delete })).toBeVisible();
    }
  });
});

// ─── 4. Create User (Happy Path) ─────────────────────────────

test.describe("Create User (Happy Path)", () => {
  test("should open new user modal when clicking new user button", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    await expect(usersPage.modal).toBeVisible();
    await expect(usersPage.modalTitle).toHaveText(USER_TEXT.modalNewUser);
  });

  test("should create a basic user with valid data", async ({ page }) => {
    const updatedUsers = [...MOCK_USERS, makeUser({ id: 99, name: "New User", email: "new@test.com" })];
    let capturedBody: any;

    // Single handler that branches on method to avoid route stacking
    await page.route("**/api/users", async (route) => {
      const method = route.request().method();
      if (method === "POST") {
        capturedBody = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(makeUser({ id: 99, name: capturedBody.name, email: capturedBody.email })),
        });
      } else if (method === "GET") {
        // After save, return updated list including the new user
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(capturedBody ? updatedUsers : MOCK_USERS),
        });
      } else {
        await route.fallback();
      }
    });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    await usersPage.fillUserForm({
      name: "New User",
      email: "new@test.com",
      password: "Password123!",
    });
    await usersPage.submitForm();

    await expectToast(page, USER_TEXT.toastCreated);

    expect(capturedBody).toMatchObject({
      name: "New User",
      email: "new@test.com",
      password: "Password123!",
      role: "basic",
    });

    // After re-fetch, the new user should appear in the table DOM
    await expect(usersPage.getUserRowByName("New User")).toBeVisible({ timeout: 5_000 });
  });

  test("should create a manager user with table write permissions", async ({ page }) => {
    let capturedBody: any;
    await page.route("**/api/users", async (route) => {
      if (route.request().method() === "POST") {
        capturedBody = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(makeUser({ id: 100, ...capturedBody })),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_USERS),
        });
      }
    });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    await usersPage.fillUserForm({
      name: "Manager Test",
      email: "manager-test@test.com",
      password: "Password123!",
      role: "manager",
    });

    // Check that manager table permissions section is visible
    await expect(usersPage.modal.getByText(USER_TEXT.managerTablePermissions)).toBeVisible();

    // Toggle a table write permission
    const tableCheckbox = usersPage.modal.locator('label').filter({ hasText: 'לקוחות' }).locator('input[type=checkbox]');
    await expect(tableCheckbox).toBeVisible();
    await tableCheckbox.check();

    await usersPage.submitForm();
    await expectToast(page, USER_TEXT.toastCreated);
    expect(capturedBody.role).toBe("manager");
    expect(capturedBody.allowedWriteTableIds).toContain(1);
  });

  test("should create an admin user", async ({ page }) => {
    let capturedBody: any;
    await page.route("**/api/users", async (route) => {
      if (route.request().method() === "POST") {
        capturedBody = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(makeUser({ id: 101, ...capturedBody })),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_USERS),
        });
      }
    });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    await usersPage.fillUserForm({
      name: "Admin Test",
      email: "admin-test@test.com",
      password: "Password123!",
      role: "admin",
    });
    await usersPage.submitForm();

    await expectToast(page, USER_TEXT.toastCreated);
    expect(capturedBody.role).toBe("admin");
  });

  test("should close modal after successful creation", async ({ page }) => {
    await page.route("**/api/users", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(makeUser({ id: 99 })),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_USERS),
        });
      }
    });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    await expect(usersPage.modal).toBeVisible();
    await usersPage.fillUserForm({ name: "Test", email: "t@t.com", password: "Pass123!" });
    await usersPage.submitForm();

    await expectToast(page, USER_TEXT.toastCreated);
    await expect(usersPage.modal).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─── 5. Create User (Validation & Errors) ────────────────────

test.describe("Create User (Validation & Errors)", () => {
  test("should show error when submitting empty form", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    await usersPage.submitForm();

    await expect(usersPage.modalError).toContainText(USER_TEXT.nameEmailRequired);
  });

  test("should show error when password is empty on create", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    await usersPage.fillUserForm({ name: "Test", email: "t@t.com" });
    await usersPage.submitForm();

    await expect(usersPage.modalError).toContainText(USER_TEXT.passwordRequired);
  });

  test("should show error when API returns 400 (duplicate email)", async ({ page }) => {
    await page.route("**/api/users", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Email already exists" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_USERS),
        });
      }
    });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    await usersPage.fillUserForm({ name: "Test", email: "dup@test.com", password: "Pass123!" });
    await usersPage.submitForm();

    await expect(usersPage.modalError).toBeVisible();
    await expect(usersPage.modalError).toContainText("פריט עם פרטים אלו כבר קיים במערכת");
  });

  test("should show error when API returns 500", async ({ page }) => {
    await page.route("**/api/users", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal server error" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_USERS),
        });
      }
    });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    await usersPage.fillUserForm({ name: "Test", email: "t@t.com", password: "Pass123!" });
    await usersPage.submitForm();

    await expect(usersPage.modalError).toBeVisible();
    await expect(usersPage.modalError).toContainText("שגיאת שרת");
  });

  test("should disable submit button while saving", async ({ page }) => {
    // Slow API to catch the saving state
    await page.route("**/api/users", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((r) => setTimeout(r, 2000));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(makeUser({ id: 99 })),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_USERS),
        });
      }
    });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    await usersPage.fillUserForm({ name: "Test", email: "t@t.com", password: "Pass123!" });
    await usersPage.submitForm();

    // Submit button should show saving state and be disabled
    await expect(usersPage.modal.getByText(USER_TEXT.saving)).toBeVisible();
    await expect(usersPage.submitButton).toBeDisabled();
  });
});

// ─── 6. Edit User (Happy Path) ───────────────────────────────

test.describe("Edit User (Happy Path)", () => {
  test("should open edit modal with pre-filled data", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickEditUser(MOCK_MANAGER.name);

    await expect(usersPage.modalTitle).toHaveText(USER_TEXT.modalEditUser);
    await expect(usersPage.nameInput).toHaveValue(MOCK_MANAGER.name);
    await expect(usersPage.emailInput).toHaveValue(MOCK_MANAGER.email);
    // Password should be empty (not pre-filled)
    await expect(usersPage.passwordInput).toHaveValue("");
  });

  test("should update user name", async ({ page }) => {
    let capturedBody: any;

    await page.route("**/api/users/2", async (route) => {
      if (route.request().method() === "PATCH") {
        capturedBody = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...MOCK_MANAGER, name: capturedBody.name }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.route("**/api/users", async (route) => {
      const updatedUsers = capturedBody
        ? MOCK_USERS.map(u => u.id === 2 ? { ...u, name: capturedBody.name } : u)
        : MOCK_USERS;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(updatedUsers),
      });
    });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickEditUser(MOCK_MANAGER.name);
    await usersPage.fillUserForm({ name: "Updated Manager" });
    await usersPage.submitForm();

    await expectToast(page, USER_TEXT.toastUpdated);
    expect(capturedBody.name).toBe("Updated Manager");

    // Verify the updated name appears in the table DOM after re-fetch
    await expect(usersPage.getUserRowByName("Updated Manager")).toBeVisible({ timeout: 5_000 });
  });

  test("should update user email", async ({ page }) => {
    let capturedBody: any;

    await page.route("**/api/users/2", async (route) => {
      if (route.request().method() === "PATCH") {
        capturedBody = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...MOCK_MANAGER, email: capturedBody.email }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.route("**/api/users", async (route) => {
      const updatedUsers = capturedBody
        ? MOCK_USERS.map(u => u.id === 2 ? { ...u, email: capturedBody.email } : u)
        : MOCK_USERS;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(updatedUsers),
      });
    });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickEditUser(MOCK_MANAGER.name);
    await usersPage.emailInput.clear();
    await usersPage.emailInput.fill("updated@test.com");
    await usersPage.submitForm();

    await expectToast(page, USER_TEXT.toastUpdated);
    expect(capturedBody.email).toBe("updated@test.com");

    // Verify the updated email appears in the table DOM after re-fetch
    await expect(usersPage.getUserRowByName(MOCK_MANAGER.name)).toContainText("updated@test.com");
  });

  test("should not require password when editing and exclude it from payload", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    let capturedBody: any;
    await page.route("**/api/users/2", async (route) => {
      if (route.request().method() === "PATCH") {
        capturedBody = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...MOCK_MANAGER, ...capturedBody }),
        });
      } else {
        await route.fallback();
      }
    });

    await usersPage.clickEditUser(MOCK_MANAGER.name);
    // Don't fill password, just change name
    await usersPage.fillUserForm({ name: "No Password Change" });
    await usersPage.submitForm();

    await expectToast(page, USER_TEXT.toastUpdated);
    // Password should not be included in the PATCH payload
    expect(capturedBody).not.toHaveProperty("password");
  });

  test("should include password in PATCH payload when provided", async ({ page }) => {
    let capturedBody: any;

    await page.route("**/api/users/2", async (route) => {
      if (route.request().method() === "PATCH") {
        capturedBody = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...MOCK_MANAGER, ...capturedBody }),
        });
      } else {
        await route.fallback();
      }
    });

    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickEditUser(MOCK_MANAGER.name);
    await usersPage.fillUserForm({ password: "NewPassword123!" });
    await usersPage.submitForm();

    await expectToast(page, USER_TEXT.toastUpdated);
    expect(capturedBody).toHaveProperty("password", "NewPassword123!");
  });

  test("should change user role and see permission sections update", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickEditUser(MOCK_BASIC.name);

    // Basic role → permissions section visible
    await expect(usersPage.modal.getByText(USER_TEXT.permissionSection).first()).toBeVisible();

    // Switch to admin → permissions section hidden
    await usersPage.fillUserForm({ role: "admin" });
    await expect(usersPage.modal.getByText(USER_TEXT.navPermissions)).not.toBeVisible();

    // Switch to manager → permissions section visible again + table write permissions
    await usersPage.fillUserForm({ role: "manager" });
    await expect(usersPage.modal.getByText(USER_TEXT.permissionSection).first()).toBeVisible();
    await expect(usersPage.modal.getByText(USER_TEXT.managerTablePermissions)).toBeVisible();
  });
});

// ─── 7. Edit User (Errors) ───────────────────────────────────

test.describe("Edit User (Errors)", () => {
  test("should show error when API returns failure on edit", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await page.route("**/api/users/2", async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Server error" }),
        });
      } else {
        await route.fallback();
      }
    });

    await usersPage.clickEditUser(MOCK_MANAGER.name);
    await usersPage.fillUserForm({ name: "Fail" });
    await usersPage.submitForm();

    await expect(usersPage.modalError).toBeVisible();
    await expect(usersPage.modalError).toContainText("שגיאת שרת");
  });

  test("should show error when clearing name/email", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickEditUser(MOCK_MANAGER.name);
    await usersPage.nameInput.clear();
    await usersPage.emailInput.clear();
    await usersPage.submitForm();

    await expect(usersPage.modalError).toContainText(USER_TEXT.nameEmailRequired);
  });
});

// ─── 8. Delete User ──────────────────────────────────────────

test.describe("Delete User", () => {
  test("should show confirmation dialog when clicking delete", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickDeleteUser(MOCK_BASIC.name);

    // Radix AlertDialog renders with role="alertdialog"
    await expect(usersPage.confirmDialog).toBeVisible();
    await expect(usersPage.confirmDialog).toContainText(USER_TEXT.deleteConfirmMessage);
  });

  test("should delete user after confirming", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    // Mock DELETE endpoint
    await page.route("**/api/users/3", async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.fallback();
      }
    });

    await usersPage.clickDeleteUser(MOCK_BASIC.name);

    // Confirm the alert dialog
    await usersPage.confirmDelete();

    await expectToast(page, USER_TEXT.toastDeleted);
    // The user should be removed from the table (client-side filter)
    await expect(usersPage.getUserRowByName(MOCK_BASIC.name)).not.toBeVisible({ timeout: 5_000 });
  });

  test("should not delete when canceling confirmation dialog", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickDeleteUser(MOCK_BASIC.name);

    await usersPage.cancelDelete();

    // User should still be in the table
    await expect(usersPage.getUserRowByName(MOCK_BASIC.name)).toBeVisible();
  });

  test("should show error toast when delete API fails", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await page.route("**/api/users/3", async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Server error" }),
        });
      } else {
        await route.fallback();
      }
    });

    await usersPage.clickDeleteUser(MOCK_BASIC.name);

    await usersPage.confirmDelete();

    await expectToast(page, USER_TEXT.toastDeleteError);

    // User should still be in the table (not removed)
    await expect(usersPage.getUserRowByName(MOCK_BASIC.name)).toBeVisible();
  });

  test("should show error when trying to delete yourself (self-delete prevention)", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await page.route("**/api/users/1", async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Cannot delete yourself" }),
        });
      } else {
        await route.fallback();
      }
    });

    await usersPage.clickDeleteUser(MOCK_ADMIN.name);
    await usersPage.confirmDelete();

    await expectToast(page, USER_TEXT.toastDeleteError);
    // User should still be in the table (not removed)
    await expect(usersPage.getUserRowByName(MOCK_ADMIN.name)).toBeVisible();
  });
});

// ─── 9. Modal Behavior ───────────────────────────────────────

test.describe("Modal Behavior", () => {
  test("should close modal when clicking cancel", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    await expect(usersPage.modal).toBeVisible();
    await usersPage.cancelForm();
    await expect(usersPage.modal).not.toBeVisible();
  });

  test("should close modal when clicking outside (backdrop)", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    await expect(usersPage.modal).toBeVisible();

    // Click the backdrop at a corner far from the centered modal content
    const box = await usersPage.modal.boundingBox();
    await page.mouse.click(box!.x + 2, box!.y + 2);
    await expect(usersPage.modal).not.toBeVisible();
  });

  test("should show permissions section only for non-admin roles", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();

    // Default role is basic → permissions visible
    await expect(usersPage.modal.getByText(USER_TEXT.navPermissions)).toBeVisible();

    // Switch to admin → permissions hidden
    await usersPage.fillUserForm({ role: "admin" });
    await expect(usersPage.modal.getByText(USER_TEXT.navPermissions)).not.toBeVisible();

    // Switch back to basic → permissions visible again
    await usersPage.fillUserForm({ role: "basic" });
    await expect(usersPage.modal.getByText(USER_TEXT.navPermissions)).toBeVisible();
  });

  test("should show manager table write permissions when role is manager", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    await usersPage.fillUserForm({ role: "manager" });

    await expect(usersPage.modal.getByText(USER_TEXT.managerTablePermissions)).toBeVisible();
    // Should show table names
    await expect(usersPage.modal.getByText("לקוחות")).toBeVisible();
  });

  test("should show basic table permission radios when role is basic", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();

    // Default is basic → should show basic table permissions with radio headers
    await expect(usersPage.modal.getByText(USER_TEXT.noAccess)).toBeVisible();
    await expect(usersPage.modal.getByText(USER_TEXT.readOnly)).toBeVisible();
    await expect(usersPage.modal.getByText(USER_TEXT.readWrite)).toBeVisible();
  });

  test("should hide permission sections when switching to admin role", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    // Start as basic → permissions visible
    await expect(usersPage.modal.getByText(USER_TEXT.permissionSection).first()).toBeVisible();

    // Switch to admin
    await usersPage.fillUserForm({ role: "admin" });

    // All permission sections should be hidden
    await expect(usersPage.modal.getByText(USER_TEXT.navPermissions)).not.toBeVisible();
    await expect(usersPage.modal.getByText(USER_TEXT.managementPermissions)).not.toBeVisible();
  });
});

// ─── 10. API Integration ─────────────────────────────────────

test.describe("API Integration", () => {
  test("should call GET /api/users on page load", async ({ page }) => {
    let usersRequested = false;
    await page.route("**/api/users", async (route) => {
      if (route.request().method() === "GET") {
        usersRequested = true;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_USERS),
      });
    });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    expect(usersRequested).toBe(true);
  });

  test("should call GET /api/tables on page load", async ({ page }) => {
    let tablesRequested = false;
    await mockApiRoute(page, "**/api/users", { body: MOCK_USERS });
    await page.route("**/api/tables*", async (route) => {
      if (route.request().method() === "GET") {
        tablesRequested = true;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_TABLES),
      });
    });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    expect(tablesRequested).toBe(true);
  });

  test("should send correct payload when creating user", async ({ page }) => {
    let capturedBody: any;
    await page.route("**/api/users", async (route) => {
      if (route.request().method() === "POST") {
        capturedBody = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(makeUser({ id: 99 })),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_USERS),
        });
      }
    });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    await usersPage.fillUserForm({
      name: "Payload Test",
      email: "payload@test.com",
      password: "Secure123!",
      role: "basic",
    });
    await usersPage.submitForm();

    await expectToast(page, USER_TEXT.toastCreated);
    expect(capturedBody).toMatchObject({
      name: "Payload Test",
      email: "payload@test.com",
      password: "Secure123!",
      role: "basic",
    });
    expect(capturedBody).toHaveProperty("permissions");
    expect(capturedBody).toHaveProperty("tablePermissions");
    expect(capturedBody).toHaveProperty("allowedWriteTableIds");
  });

  test("should send correct payload when updating user (PATCH)", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    let capturedBody: any;
    let capturedMethod: string = "";
    await page.route("**/api/users/2", async (route) => {
      capturedMethod = route.request().method();
      if (capturedMethod === "PATCH") {
        capturedBody = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...MOCK_MANAGER, ...capturedBody }),
        });
      } else {
        await route.fallback();
      }
    });

    await usersPage.clickEditUser(MOCK_MANAGER.name);
    await usersPage.fillUserForm({ name: "Changed Name" });
    await usersPage.submitForm();

    await expectToast(page, USER_TEXT.toastUpdated);
    expect(capturedMethod).toBe("PATCH");
    expect(capturedBody.name).toBe("Changed Name");
  });

  test("should handle rate limit (429) and show RateLimitFallback", async ({ page }) => {
    await mockApiRoute(page, "**/api/users", { status: 429, body: { error: "Too many requests" } });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();

    await expect(usersPage.rateLimitTitle).toBeVisible({ timeout: 10_000 });
    await expect(usersPage.rateLimitRetryButton).toBeVisible();
  });
});

// ─── 11. Pagination ──────────────────────────────────────────

test.describe("Pagination", () => {
  test("should show pagination controls when >30 users", async ({ page }) => {
    await mockApiRoute(page, "**/api/users", { body: MANY_USERS });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await expect(usersPage.firstPageButton).toBeVisible();
    await expect(usersPage.prevPageButton).toBeVisible();
    await expect(usersPage.nextPageButton).toBeVisible();
    await expect(usersPage.lastPageButton).toBeVisible();
  });

  test("should not show pagination when <=30 users", async ({ page }) => {
    await mockUsersPage(page); // Only 3 users
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await expect(usersPage.firstPageButton).not.toBeVisible();
    await expect(usersPage.nextPageButton).not.toBeVisible();
  });

  test("should navigate to next page", async ({ page }) => {
    await mockApiRoute(page, "**/api/users", { body: MANY_USERS });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    // Page 1 → shows first 30 users
    await expect(page.getByText("עמוד 1 מתוך 3")).toBeVisible();

    await usersPage.nextPageButton.click();
    await expect(page.getByText("עמוד 2 מתוך 3")).toBeVisible();
  });

  test("should navigate to previous page", async ({ page }) => {
    await mockApiRoute(page, "**/api/users", { body: MANY_USERS });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    // Go to page 2
    await usersPage.nextPageButton.click();
    await expect(page.getByText("עמוד 2 מתוך 3")).toBeVisible();

    // Go back to page 1
    await usersPage.prevPageButton.click();
    await expect(page.getByText("עמוד 1 מתוך 3")).toBeVisible();
  });

  test("should navigate to first/last page", async ({ page }) => {
    await mockApiRoute(page, "**/api/users", { body: MANY_USERS });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    // Go to last page
    await usersPage.lastPageButton.click();
    await expect(page.getByText("עמוד 3 מתוך 3")).toBeVisible();

    // Go to first page
    await usersPage.firstPageButton.click();
    await expect(page.getByText("עמוד 1 מתוך 3")).toBeVisible();
  });

  test("should show correct page info text", async ({ page }) => {
    await mockApiRoute(page, "**/api/users", { body: MANY_USERS });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await expect(page.getByText("עמוד 1 מתוך 3")).toBeVisible();
  });

  test("should disable first/previous buttons on first page", async ({ page }) => {
    await mockApiRoute(page, "**/api/users", { body: MANY_USERS });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await expect(usersPage.firstPageButton).toBeDisabled();
    await expect(usersPage.prevPageButton).toBeDisabled();
  });

  test("should disable next/last buttons on last page", async ({ page }) => {
    await mockApiRoute(page, "**/api/users", { body: MANY_USERS });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.lastPageButton.click();
    await expect(page.getByText("עמוד 3 מתוך 3")).toBeVisible();

    await expect(usersPage.nextPageButton).toBeDisabled();
    await expect(usersPage.lastPageButton).toBeDisabled();
  });
});

// ─── 12. Edge Cases ──────────────────────────────────────────

test.describe("Edge Cases", () => {
  test("should handle very long user names without breaking layout", async ({ page }) => {
    const longNameUser = makeUser({
      id: 1,
      name: "A".repeat(200),
      email: "long@test.com",
    });
    await mockApiRoute(page, "**/api/users", { body: [longNameUser] });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await expect(usersPage.getUserRowByName("A".repeat(200))).toBeVisible();
    // Page should not overflow horizontally (table has overflow-x-auto)
    const tableContainer = page.locator(".bg-white.rounded-2xl");
    await expect(tableContainer).toBeVisible();
  });

  test("should handle Hebrew/emoji in user name", async ({ page }) => {
    const emojiUser = makeUser({
      id: 1,
      name: "ישראל ישראלי 🎉",
      email: "emoji@test.com",
    });
    await mockApiRoute(page, "**/api/users", { body: [emojiUser] });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await expect(usersPage.getUserRowByName("ישראל ישראלי 🎉")).toBeVisible();
  });

  test('should handle empty user list and show empty state', async ({ page }) => {
    await mockApiRoute(page, "**/api/users", { body: [] });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await expect(usersPage.emptyHeading).toBeVisible();
    await expect(usersPage.emptyCreateButton).toBeVisible();
  });

  test('should handle empty tables list and show "אין טבלאות זמינות" in modal', async ({ page }) => {
    await mockApiRoute(page, "**/api/users", { body: MOCK_USERS });
    await mockApiRoute(page, "**/api/tables*", { body: { data: [], hasMore: false } });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    // Switch to manager to see table permissions section
    await usersPage.fillUserForm({ role: "manager" });
    await expect(usersPage.modal.getByText(USER_TEXT.noTablesAvailable)).toBeVisible();
  });
});

// ─── 13. Responsive Layout ──────────────────────────────────

test.describe("Responsive Layout", () => {
  test("should display correctly on desktop viewport (1280x720)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await expect(usersPage.pageTitle).toBeVisible();
    await expect(usersPage.newUserButton).toBeVisible();
    await expect(usersPage.usersTable).toBeVisible();
  });

  test("should display correctly on mobile viewport (375x667)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await expect(usersPage.pageTitle).toBeVisible();
    await expect(usersPage.newUserButton).toBeVisible();
    // Table should still be accessible (with horizontal scroll)
    await expect(usersPage.usersTable).toBeAttached();
  });
});

// ─── 14. Additional Coverage ─────────────────────────────────

test.describe("Empty State & CTA", () => {
  test("should open new user modal from empty state CTA button", async ({ page }) => {
    await mockApiRoute(page, "**/api/users", { body: [] });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await expect(usersPage.emptyCreateButton).toBeVisible();
    await usersPage.emptyCreateButton.click();
    await expect(usersPage.modal).toBeVisible();
    await expect(usersPage.modalTitle).toHaveText(USER_TEXT.modalNewUser);
  });

  test("should create first user from empty state CTA and see user in table", async ({ page }) => {
    const newUser = makeUser({ id: 50, name: "First User", email: "first@test.com" });
    let capturedBody: any;

    await page.route("**/api/users", async (route) => {
      const method = route.request().method();
      if (method === "POST") {
        capturedBody = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(newUser),
        });
      } else if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(capturedBody ? [newUser] : []),
        });
      } else {
        await route.fallback();
      }
    });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    // Should show empty state
    await expect(usersPage.emptyHeading).toBeVisible();

    // Click CTA, fill form, submit
    await usersPage.emptyCreateButton.click();
    await expect(usersPage.modal).toBeVisible();
    await usersPage.fillUserForm({
      name: "First User",
      email: "first@test.com",
      password: "Password123!",
    });
    await usersPage.submitForm();

    await expectToast(page, USER_TEXT.toastCreated);

    // Empty state should be gone, user should appear
    await expect(usersPage.emptyHeading).not.toBeVisible({ timeout: 5_000 });
    await expect(usersPage.getUserRowByName("First User")).toBeVisible();
  });
});

test.describe("Permission Overflow Badge", () => {
  test('should show "+N" overflow badge for user with >3 permissions', async ({ page }) => {
    await mockApiRoute(page, "**/api/users", { body: [MOCK_MANY_PERMS] });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    // Should show exactly 3 permission badges (sliced to 3)
    await expect(usersPage.getPermissionBadges(MOCK_MANY_PERMS.name)).toHaveCount(3);
    // Should show "+2" overflow badge (5 total - 3 shown = 2 more)
    await expect(usersPage.getOverflowBadge(MOCK_MANY_PERMS.name)).toBeVisible();
    await expect(usersPage.getOverflowBadge(MOCK_MANY_PERMS.name)).toHaveText("+2");
  });
});

test.describe("Permission & Table Payload Tests", () => {
  test("should include toggled permission checkboxes in create payload", async ({ page }) => {
    let capturedBody: any;
    await page.route("**/api/users", async (route) => {
      if (route.request().method() === "POST") {
        capturedBody = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(makeUser({ id: 99 })),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_USERS),
        });
      }
    });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    await usersPage.fillUserForm({
      name: "Perm Test",
      email: "perm@test.com",
      password: "Pass123!",
      role: "basic",
    });

    // Toggle a permission checkbox in the nav permissions section
    const permCheckboxes = usersPage.modal.locator("input[type=checkbox]");
    await expect(permCheckboxes.first()).toBeVisible();
    await permCheckboxes.first().check();

    await usersPage.submitForm();
    await expectToast(page, USER_TEXT.toastCreated);

    // Verify permissions object has at least one true value
    expect(capturedBody).toHaveProperty("permissions");
    const truePerms = Object.values(capturedBody.permissions).filter(Boolean);
    expect(truePerms.length).toBeGreaterThan(0);
  });

  test("should include basic table radio selection in create payload", async ({ page }) => {
    let capturedBody: any;
    await page.route("**/api/users", async (route) => {
      if (route.request().method() === "POST") {
        capturedBody = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(makeUser({ id: 99 })),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_USERS),
        });
      }
    });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    await usersPage.fillUserForm({
      name: "Table Perm Test",
      email: "table@test.com",
      password: "Pass123!",
      role: "basic",
    });

    // Each table row has 3 radios: none(0), read(1), write(2). Select write for first table.
    const firstTableRadios = usersPage.modal.locator('input[type=radio][name="perm-1"]');
    await expect(firstTableRadios).toHaveCount(3);
    await firstTableRadios.nth(2).click(); // write = 3rd radio

    await usersPage.submitForm();
    await expectToast(page, USER_TEXT.toastCreated);

    expect(capturedBody.tablePermissions).toMatchObject({ "1": "write" });
  });
});

test.describe("Edit Pre-fill", () => {
  test("should pre-fill role radio correctly when editing manager", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickEditUser(MOCK_MANAGER.name);

    // The manager radio should be checked
    const managerRadio = usersPage.modal.getByText(USER_TEXT.roleManagerRadio);
    await expect(managerRadio).toBeVisible();
    // The manager radio input should be checked — find the actual input near the label
    const managerInput = usersPage.modal.locator("input[type=radio][value=manager]");
    await expect(managerInput).toBeVisible();
    await expect(managerInput).toBeChecked();
  });
});

test.describe("Rate Limit & Error Edge Cases", () => {
  test("should show RateLimitFallback when /api/tables returns 429", async ({ page }) => {
    await mockApiRoute(page, "**/api/users", { body: MOCK_USERS });
    await mockApiRoute(page, "**/api/tables*", { status: 429, body: { error: "Too many requests" } });

    const usersPage = new UsersPage(page);
    await usersPage.goto();

    await expect(usersPage.rateLimitTitle).toBeVisible({ timeout: 10_000 });
    await expect(usersPage.rateLimitRetryButton).toBeVisible();
  });

  test("should show error toast on network failure (fetch rejects)", async ({ page }) => {
    await page.route("**/api/users", async (route) => {
      await route.abort("connectionrefused");
    });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();

    // Should show an error — either a toast or inline error
    const errorText = page.getByText(/שגיאת תקשורת|אירעה שגיאה/);
    await expect(errorText.first()).toBeVisible({ timeout: 10_000 });
  });

  test("should show RateLimitFallback when delete returns 429", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await page.route("**/api/users/3", async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ error: "Too many requests" }),
        });
      } else {
        await route.fallback();
      }
    });

    await usersPage.clickDeleteUser(MOCK_BASIC.name);
    await usersPage.confirmDelete();

    await expect(usersPage.rateLimitTitle).toBeVisible({ timeout: 10_000 });
  });

  test("should reload users after clicking rate limit retry button", async ({ page }) => {
    let requestCount = 0;
    await page.route("**/api/users", async (route) => {
      requestCount++;
      if (requestCount === 1) {
        // First request: rate limited
        await route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ error: "Too many requests" }),
        });
      } else {
        // Subsequent requests: success
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_USERS),
        });
      }
    });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();

    // Should show rate limit fallback
    await expect(usersPage.rateLimitTitle).toBeVisible({ timeout: 10_000 });

    // Click retry
    await usersPage.rateLimitRetryButton.click();

    // Should now show the users table
    await expect(usersPage.usersTable).toBeVisible({ timeout: 15_000 });
    await expect(usersPage.getUserRowByName(MOCK_ADMIN.name)).toBeVisible();
  });
});

test.describe("Save Button State", () => {
  test("should disable cancel button while saving", async ({ page }) => {
    // Slow API to catch the saving state
    await page.route("**/api/users", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((r) => setTimeout(r, 2000));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(makeUser({ id: 99 })),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_USERS),
        });
      }
    });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    await usersPage.fillUserForm({ name: "Test", email: "t@t.com", password: "Pass123!" });
    await usersPage.submitForm();

    // Cancel button should be disabled while saving
    await expect(usersPage.cancelButton).toBeDisabled();
  });
});

test.describe("Pagination Page Number", () => {
  test("should navigate to specific page when clicking page number button", async ({ page }) => {
    await mockApiRoute(page, "**/api/users", { body: MANY_USERS });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await expect(page.getByText("עמוד 1 מתוך 3")).toBeVisible();

    // Click page number "2" button directly
    const page2Button = page.getByRole("button", { name: "2", exact: true });
    await expect(page2Button).toBeVisible();
    await page2Button.click();
    await expect(page.getByText("עמוד 2 מתוך 3")).toBeVisible();
  });
});

// ─── 15. Error Clears on Resubmit ──────────────────────────

test.describe("Error Clears on Resubmit", () => {
  test("should clear validation error when resubmitting with valid data", async ({ page }) => {
    await page.route("**/api/users", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(makeUser({ id: 99 })),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_USERS),
        });
      }
    });
    await mockApiRoute(page, "**/api/tables*", { body: MOCK_TABLES });

    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    // Submit empty form → should show validation error
    await usersPage.clickNewUser();
    await usersPage.submitForm();
    await expect(usersPage.modalError).toBeVisible();
    await expect(usersPage.modalError).toContainText(USER_TEXT.nameEmailRequired);

    // Fill form with valid data and resubmit → error should disappear
    await usersPage.fillUserForm({ name: "Test", email: "t@t.com", password: "Pass123!" });
    await usersPage.submitForm();

    await expect(usersPage.modalError).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─── 16. Validation: Only Email Missing ─────────────────────

test.describe("Validation: Single Field Missing", () => {
  test("should show error when only email is missing (name provided)", async ({ page }) => {
    await mockUsersPage(page);
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.waitForLoad();

    await usersPage.clickNewUser();
    await usersPage.fillUserForm({ name: "Test User" });
    await usersPage.submitForm();

    await expect(usersPage.modalError).toContainText(USER_TEXT.nameEmailRequired);
  });
});
