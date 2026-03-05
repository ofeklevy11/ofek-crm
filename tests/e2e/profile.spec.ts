import { test, expect } from "@playwright/test";
import { ProfilePage } from "./pages/ProfilePage";
import { GreenApiPage } from "./pages/GreenApiPage";
import {
  STORAGE_ADMIN,
  STORAGE_BASIC,
  interceptAllServerActions,
} from "./helpers/test-utils";

// ─────────────────────────────────────────────────────────
// 1. Authentication & Access Control
// ─────────────────────────────────────────────────────────

test.describe("Profile – Unauthenticated Access", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("redirects to /login when visiting /profile", async ({ page }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects to /login when visiting /profile/green-api", async ({
    page,
  }) => {
    await page.goto("/profile/green-api");
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects to /login when visiting /profile/whatsapp", async ({
    page,
  }) => {
    await page.goto("/profile/whatsapp");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Profile – Authenticated Access", () => {
  test("admin user can access /profile", async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.goto();
    await expect(profile.userName).toBeVisible();
  });

  test("basic user can access /profile", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: STORAGE_BASIC,
    });
    const page = await context.newPage();
    const profile = new ProfilePage(page);
    await profile.goto();
    await expect(profile.userName).toBeVisible();
    await context.close();
  });
});

// ─────────────────────────────────────────────────────────
// 2. Admin Profile View
// ─────────────────────────────────────────────────────────

test.describe("Profile – Admin View", () => {
  let profile: ProfilePage;

  test.beforeEach(async ({ page }) => {
    profile = new ProfilePage(page);
    await profile.goto();
    await expect(profile.userName).toBeVisible();
  });

  // ── Header Section ──

  test.describe("Header Section", () => {
    test("displays user avatar with initial letter", async () => {
      await expect(profile.avatar).toBeVisible();
    });

    test("displays user name as heading", async () => {
      await expect(profile.userName).toHaveText("E2E Admin");
    });

    test("displays email in badge", async () => {
      await expect(profile.emailBadge).toBeVisible();
    });

    test("displays admin role badge as 'אדמין מערכת'", async () => {
      await expect(profile.roleBadge).toHaveText(/אדמין מערכת/);
    });
  });

  // ── Organization Card ──

  test.describe("Organization Card", () => {
    test("displays organization card with title 'פרטי ארגון'", async () => {
      await expect(profile.orgCardTitle).toBeVisible();
    });

    test("displays company name", async () => {
      await expect(profile.companyName).toHaveText("E2E Test Company");
    });

    test("displays company ID with copy button", async () => {
      await expect(profile.companyId).toBeVisible();
      await expect(profile.companyIdCopyButton).toBeVisible();
    });

    test("displays company ID usage description", async () => {
      await expect(profile.companyIdHelpText).toBeVisible();
    });

    test("copy company ID button copies ID to clipboard", async ({
      page,
    }) => {
      await page
        .context()
        .grantPermissions(["clipboard-read", "clipboard-write"]);
      await profile.companyIdCopyButton.click();
      const clipboardText = await page.evaluate(() =>
        navigator.clipboard.readText()
      );
      expect(clipboardText).toBeTruthy();
    });
  });

  // ── User Details Card ──

  test.describe("User Details Card", () => {
    test("displays user details card with title and user ID", async () => {
      await expect(profile.userDetailsCardTitle).toBeVisible();
      await expect(profile.userId).toBeVisible();
    });
  });

  // ── Organization Management Card (admin-only) ──

  test.describe("Organization Management Card", () => {
    test("displays organization management card with 'ניהול ארגון' title", async () => {
      await expect(profile.orgManagementCardTitle).toBeVisible();
    });

    test("shows 'עדכון שם הארגון' button", async () => {
      await expect(profile.updateOrgNameButton).toBeVisible();
    });
  });

  // ── Update Company Name Dialog ──

  test.describe("Update Company Name Dialog", () => {
    test.beforeEach(async () => {
      await profile.openUpdateOrgDialog();
    });

    test("opens dialog with title, description, and current company name", async () => {
      await expect(profile.dialogTitle).toBeVisible();
      await expect(profile.dialogDescription).toBeVisible();
      await expect(profile.dialogCurrentName).toBeVisible();
    });

    test("shows empty inputs with correct placeholders", async () => {
      await expect(profile.dialogNewNameInput).toBeEmpty();
      await expect(profile.dialogPasswordInput).toBeEmpty();
      await expect(profile.dialogNewNameInput).toHaveAttribute(
        "placeholder",
        "הזן שם ארגון חדש"
      );
      await expect(profile.dialogPasswordInput).toHaveAttribute(
        "placeholder",
        "הזן את הסיסמה שלך"
      );
    });

    test("submit button is disabled when fields are empty", async () => {
      await expect(profile.dialogSubmitButton).toBeDisabled();
    });

    test("submit button is disabled when only name is filled", async () => {
      await profile.dialogNewNameInput.fill("New Name");
      await expect(profile.dialogSubmitButton).toBeDisabled();
    });

    test("submit button is disabled when only password is filled", async () => {
      await profile.dialogPasswordInput.fill("password123");
      await expect(profile.dialogSubmitButton).toBeDisabled();
    });

    test("submit button is enabled when both fields are filled", async () => {
      await profile.dialogNewNameInput.fill("New Name");
      await profile.dialogPasswordInput.fill("password123");
      await expect(profile.dialogSubmitButton).toBeEnabled();
    });

    test("successful update shows success alert and toast", async ({
      page,
    }) => {
      const cleanup = await interceptAllServerActions(page, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({ success: true, message: "שם הארגון עודכן בהצלחה" })}\n`,
        });
      });

      await profile.fillAndSubmitOrgName("Updated Company", "password123");
      await expect(profile.dialogSuccessAlert).toBeVisible();
      await expect(
        page.getByText("שם הארגון עודכן בהצלחה!")
      ).toBeVisible();

      await cleanup();
    });

    test("wrong password shows error alert", async ({ page }) => {
      const cleanup = await interceptAllServerActions(page, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({ success: false, error: "סיסמה שגויה" })}\n`,
        });
      });

      await profile.fillAndSubmitOrgName("Updated Company", "wrongpassword");
      await expect(profile.dialogErrorAlert).toBeVisible();
      await expect(page.getByText("סיסמה שגויה")).toBeVisible();

      await cleanup();
    });

    test("server error shows error alert", async ({ page }) => {
      const cleanup = await interceptAllServerActions(page, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({ success: false, error: "שגיאה בעדכון שם הארגון" })}\n`,
        });
      });

      await profile.fillAndSubmitOrgName("Updated Company", "password123");
      await expect(profile.dialogErrorAlert).toBeVisible();
      await expect(page.getByText("שגיאה בעדכון שם הארגון")).toBeVisible();

      await cleanup();
    });

    test("network exception shows error alert in dialog", async ({ page }) => {
      const cleanup = await interceptAllServerActions(page, async (route) => {
        await route.abort("failed");
      });

      await profile.fillAndSubmitOrgName("Updated Company", "password123");
      await expect(profile.dialogErrorAlert).toBeVisible();
      // catch block also fires toast.error(getUserFriendlyError(error))
      await expect(
        page.locator("[data-sonner-toast][data-type='error']").first()
      ).toBeVisible();

      await cleanup();
    });

    test("submit button shows 'מעדכן...' and is disabled while updating", async ({
      page,
    }) => {
      await profile.dialogNewNameInput.fill("New Company");
      await profile.dialogPasswordInput.fill("password123");

      let resolveRequest!: () => void;
      const requestBlocked = new Promise<void>(
        (res) => (resolveRequest = res)
      );

      const cleanup = await interceptAllServerActions(page, async (route) => {
        await requestBlocked;
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({ success: true, message: "שם הארגון עודכן בהצלחה" })}\n`,
        });
      });

      await profile.dialogSubmitButton.click();

      await expect(profile.dialogSubmitButton).toBeDisabled();
      await expect(profile.dialogSubmitButton).toContainText("מעדכן...");

      resolveRequest();
      await expect(profile.dialogSuccessAlert).toBeVisible();

      await cleanup();
    });

    test("closing dialog via X button and reopening resets fields", async ({
      page,
    }) => {
      await profile.dialogNewNameInput.fill("Some Name");
      await profile.dialogPasswordInput.fill("somepass");

      // Close dialog via X button (the close button in the dialog header)
      await profile.dialogCloseButton.click();
      await expect(profile.updateDialog).not.toBeVisible();

      // Reopen
      await profile.openUpdateOrgDialog();
      await expect(profile.dialogNewNameInput).toBeEmpty();
      await expect(profile.dialogPasswordInput).toBeEmpty();
    });

    test("successful update auto-closes dialog after delay", async ({
      page,
    }) => {
      const cleanup = await interceptAllServerActions(page, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({ success: true, message: "שם הארגון עודכן בהצלחה" })}\n`,
        });
      });

      await profile.fillAndSubmitOrgName("Updated Company", "password123");
      await expect(profile.dialogSuccessAlert).toBeVisible();
      // Dialog should auto-close after ~1500ms
      await expect(profile.updateDialog).not.toBeVisible({ timeout: 3000 });

      await cleanup();
    });

    test("closing dialog and reopening resets fields", async ({ page }) => {
      await profile.dialogNewNameInput.fill("Some Name");
      await profile.dialogPasswordInput.fill("somepass");

      // Close dialog via Escape
      await page.keyboard.press("Escape");
      await expect(profile.updateDialog).not.toBeVisible();

      // Reopen
      await profile.openUpdateOrgDialog();
      await expect(profile.dialogNewNameInput).toBeEmpty();
      await expect(profile.dialogPasswordInput).toBeEmpty();
    });
  });

  // ── Integrations Card ──

  test.describe("Integrations Card", () => {
    test("displays integrations card with both integration items", async () => {
      await expect(profile.integrationsCardTitle).toBeVisible();
      await expect(profile.greenApiItem).toBeVisible();
      await expect(profile.whatsappItem).toBeVisible();
    });

    test("shows 'הגדרות' buttons for both integrations (admin)", async () => {
      await expect(profile.greenApiSettingsButton).toBeVisible();
      await expect(profile.whatsappSettingsButton).toBeVisible();
    });

    test("clicking Green API settings navigates to /profile/green-api", async ({
      page,
    }) => {
      await profile.greenApiSettingsButton.click();
      await expect(page).toHaveURL(/\/profile\/green-api/);
    });

    test("clicking WhatsApp settings navigates to /profile/whatsapp", async ({
      page,
    }) => {
      await profile.whatsappSettingsButton.click();
      await expect(page).toHaveURL(/\/profile\/whatsapp/);
    });
  });

  // ── API Keys Management ──

  test.describe("API Keys Management", () => {
    test("displays API keys card title and description", async () => {
      await expect(profile.apiKeysCardTitle).toBeVisible();
      await expect(profile.apiKeysDescription).toBeVisible();
    });

    test("shows create key input and button", async () => {
      await expect(profile.apiKeyNameInput).toBeVisible();
      await expect(profile.createKeyButton).toBeVisible();
    });

    test("create button is disabled when name input is empty", async () => {
      await expect(profile.apiKeyNameInput).toBeEmpty();
      await expect(profile.createKeyButton).toBeDisabled();
    });

    test("create button is enabled when name is entered", async () => {
      await profile.apiKeyNameInput.fill("Test Key");
      await expect(profile.createKeyButton).toBeEnabled();
    });

    test("shows empty state when no keys exist", async () => {
      await expect(profile.emptyKeysState).toBeVisible();
    });

    test("loadKeys rate limit shows specific rate-limit toast", async ({
      page,
    }) => {
      const cleanup = await interceptAllServerActions(page, async (route) => {
        await route.fulfill({
          status: 429,
          contentType: "text/plain",
          body: "Too Many Requests",
        });
      });

      await page.goto("/profile");
      await expect(
        page.getByText("יותר מדי בקשות, נסה שוב בעוד 2 דקות")
      ).toBeVisible();

      await cleanup();
    });

    test("shows loading spinner while fetching keys", async ({ page }) => {
      let resolveRequest!: () => void;
      const gate = new Promise<void>((res) => (resolveRequest = res));

      await interceptAllServerActions(page, async (route) => {
        await gate;
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({ success: true, data: [] })}\n`,
        });
      });

      await page.goto("/profile");
      await expect(profile.loadingSpinner).toBeVisible();

      resolveRequest();
      await expect(profile.loadingSpinner).not.toBeVisible();
    });
  });

  // ── Key Creation (mocked) ──

  test.describe("Key Creation (mocked)", () => {
    test("creates key and shows full key alert", async ({ page }) => {
      await profile.apiKeyNameInput.fill("My Integration Key");

      const cleanup = await interceptAllServerActions(page, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({
            success: true,
            data: { fullKey: "sk_live_test123abcdef456" },
          })}\n`,
        });
      });

      await profile.createKeyButton.click();
      await expect(profile.newKeyAlertTitle).toBeVisible();
      await expect(profile.newKeyAlertWarning).toBeVisible();
      await expect(profile.newKeyCode).toHaveText("sk_live_test123abcdef456");
      await expect(profile.newKeyCopyButton).toBeVisible();
      await expect(profile.newKeyDismissButton).toBeVisible();

      await cleanup();
    });

    test("key name input is cleared after successful creation", async ({
      page,
    }) => {
      await profile.apiKeyNameInput.fill("Cleared Key Name");

      const cleanup = await interceptAllServerActions(page, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({
            success: true,
            data: { fullKey: "sk_live_cleartest123" },
          })}\n`,
        });
      });

      await profile.createKeyButton.click();
      await expect(profile.newKeyAlertTitle).toBeVisible();
      // Input should be cleared after successful creation
      await expect(profile.apiKeyNameInput).toHaveValue("");

      await cleanup();
    });

    test("dismissing key alert hides it", async ({ page }) => {
      await profile.apiKeyNameInput.fill("Temp Key");

      const cleanup = await interceptAllServerActions(page, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({
            success: true,
            data: { fullKey: "sk_live_dismisstest123" },
          })}\n`,
        });
      });

      await profile.createKeyButton.click();
      await expect(profile.newKeyAlertTitle).toBeVisible();
      await profile.newKeyDismissButton.click();
      await expect(profile.newKeyAlertTitle).not.toBeVisible();

      await cleanup();
    });

    test("copy new API key button copies key to clipboard", async ({
      page,
    }) => {
      await profile.apiKeyNameInput.fill("Clipboard Key");

      const cleanup = await interceptAllServerActions(page, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({
            success: true,
            data: { fullKey: "sk_live_clipboard_test_key_123" },
          })}\n`,
        });
      });

      await profile.createKeyButton.click();
      await expect(profile.newKeyAlertTitle).toBeVisible();

      // Grant clipboard permissions and click copy
      await page
        .context()
        .grantPermissions(["clipboard-read", "clipboard-write"]);
      await profile.newKeyCopyButton.click();

      const clipboardText = await page.evaluate(() =>
        navigator.clipboard.readText()
      );
      expect(clipboardText).toBe("sk_live_clipboard_test_key_123");

      await cleanup();
    });

    test("creation network exception shows error toast", async ({ page }) => {
      await profile.apiKeyNameInput.fill("Network Fail Key");
      const cleanup = await interceptAllServerActions(page, async (route) => {
        await route.abort("failed");
      });
      await profile.createKeyButton.click();
      await expect(
        page.locator("[data-sonner-toast][data-type='error']").first()
      ).toBeVisible();
      await cleanup();
    });

    test("create key button is disabled and shows spinner while creating", async ({
      page,
    }) => {
      await profile.apiKeyNameInput.fill("Loading Test Key");

      let resolveRequest!: () => void;
      const gate = new Promise<void>((res) => (resolveRequest = res));

      const cleanup = await interceptAllServerActions(page, async (route) => {
        await gate;
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({
            success: true,
            data: { fullKey: "sk_live_loading_test_key" },
          })}\n`,
        });
      });

      await profile.createKeyButton.click();

      await expect(profile.createKeyButton).toBeDisabled();
      // Button shows only a Loader2 spinner (no text) when creating=true
      await expect(profile.createKeyButton.locator("svg")).toBeVisible();

      resolveRequest();
      await expect(profile.newKeyAlertTitle).toBeVisible();

      await cleanup();
    });

    test("creation failure shows error toast", async ({ page }) => {
      await profile.apiKeyNameInput.fill("Fail Key");

      const cleanup = await interceptAllServerActions(page, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({
            success: false,
            error: "שגיאה ביצירת מפתח",
          })}\n`,
        });
      });

      await profile.createKeyButton.click();
      await expect(
        page.getByText("שגיאה ביצירת מפתח")
      ).toBeVisible();

      await cleanup();
    });
  });
});

// ── Key Deletion (mocked) — standalone describe ──

test.describe("Profile – Key Deletion (mocked)", () => {
  let profile: ProfilePage;

  test.beforeEach(async ({ page }) => {
    // Mock getApiKeys to return a key in the table — set up BEFORE navigation
    await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/x-component",
        body: `0:${JSON.stringify({
          success: true,
          data: [
            {
              id: 1,
              name: "Test Key",
              key: "sk_live_abc123def456",
              createdAt: new Date().toISOString(),
            },
          ],
        })}\n`,
      });
    });

    profile = new ProfilePage(page);
    await page.goto("/profile");
    await expect(profile.keysTable).toBeVisible();
  });

  test("clicking delete shows destructive confirm dialog", async ({
    page,
  }) => {
    const row = profile.getKeyRow(0);
    await row.hover();
    await profile.getKeyDeleteButton(0).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("מחיקת מפתח API")).toBeVisible();
    await expect(
      dialog.getByText("האם אתה בטוח שברצונך למחוק מפתח API זה?")
    ).toBeVisible();

    const confirmInput = dialog.locator(
      'input[aria-label="הקלד ביטוי אישור"]'
    );
    await expect(confirmInput).toBeVisible();

    // Confirm button should be disabled initially
    const confirmButton = dialog.getByRole("button", { name: "מחק" });
    await expect(confirmButton).toBeDisabled();
  });

  test("confirm button enabled after typing 'מחק'", async ({ page }) => {
    const row = profile.getKeyRow(0);
    await row.hover();
    await profile.getKeyDeleteButton(0).click();

    const dialog = page.getByRole("alertdialog");
    const confirmInput = dialog.locator(
      'input[aria-label="הקלד ביטוי אישור"]'
    );
    await confirmInput.fill("מחק");

    const confirmButton = dialog.getByRole("button", { name: "מחק" });
    await expect(confirmButton).toBeEnabled();
  });

  test("cancel dismisses dialog without deleting", async ({ page }) => {
    const row = profile.getKeyRow(0);
    await row.hover();
    await profile.getKeyDeleteButton(0).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "ביטול" }).click();
    await expect(dialog).not.toBeVisible();

    // Key should still be in table
    await expect(profile.keysTable.getByText("Test Key")).toBeVisible();
  });

  test("confirming deletion shows success toast", async ({ page }) => {
    const row = profile.getKeyRow(0);
    await row.hover();
    await profile.getKeyDeleteButton(0).click();

    const dialog = page.getByRole("alertdialog");
    const confirmInput = dialog.locator(
      'input[aria-label="הקלד ביטוי אישור"]'
    );
    await confirmInput.fill("מחק");

    // Re-mock for the delete action
    await page.unroute("**/*");
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/x-component",
        body: `0:${JSON.stringify({ success: true })}\n`,
      });
    });

    const confirmButton = dialog.getByRole("button", { name: "מחק" });
    await confirmButton.click();

    await expect(page.getByText("המפתח נמחק בהצלחה")).toBeVisible();

    await cleanup();
  });

  test("deletion failure shows error toast", async ({ page }) => {
    const row = profile.getKeyRow(0);
    await row.hover();
    await profile.getKeyDeleteButton(0).click();

    const dialog = page.getByRole("alertdialog");
    const confirmInput = dialog.locator(
      'input[aria-label="הקלד ביטוי אישור"]'
    );
    await confirmInput.fill("מחק");

    // Re-mock for the delete action — return failure
    await page.unroute("**/*");
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/x-component",
        body: `0:${JSON.stringify({ success: false, error: "שגיאה במחיקת מפתח" })}\n`,
      });
    });

    await dialog.getByRole("button", { name: "מחק" }).click();
    await expect(page.getByText("שגיאה במחיקת מפתח")).toBeVisible();

    await cleanup();
  });

  test("key table shows masked key prefix", async () => {
    // The key "sk_live_abc123def456" should display as "sk_live_abc1..." (first 12 chars + "...")
    await expect(profile.keysTable.getByText("sk_live_abc1...")).toBeVisible();
  });

  test("multiple keys display correctly in table", async ({ page }) => {
    // Re-navigate with multiple keys mock
    await page.unroute("**/*");
    await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/x-component",
        body: `0:${JSON.stringify({
          success: true,
          data: [
            {
              id: 1,
              name: "Make Integration",
              key: "sk_live_make111222333",
              createdAt: new Date().toISOString(),
            },
            {
              id: 2,
              name: "Zapier Hook",
              key: "sk_live_zapier444555",
              createdAt: new Date().toISOString(),
            },
            {
              id: 3,
              name: "Custom App",
              key: "sk_live_custom666777",
              createdAt: new Date().toISOString(),
            },
          ],
        })}\n`,
      });
    });

    await page.goto("/profile");
    await expect(profile.keysTable).toBeVisible();
    await expect(profile.keysTable.getByText("Make Integration")).toBeVisible();
    await expect(profile.keysTable.getByText("Zapier Hook")).toBeVisible();
    await expect(profile.keysTable.getByText("Custom App")).toBeVisible();
    // Verify 3 rows
    await expect(profile.keysTable.locator("tbody tr")).toHaveCount(3);
  });

  test("deletion network exception — key remains in table", async ({
    page,
  }) => {
    const row = profile.getKeyRow(0);
    await row.hover();
    await profile.getKeyDeleteButton(0).click();

    const dialog = page.getByRole("alertdialog");
    const confirmInput = dialog.locator(
      'input[aria-label="הקלד ביטוי אישור"]'
    );
    await confirmInput.fill("מחק");

    await page.unroute("**/*");
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.abort("failed");
    });

    await dialog.getByRole("button", { name: "מחק" }).click();

    // Brief wait for any potential state change to render
    await page.waitForTimeout(300);
    // Key should remain — handleDeleteKey has no try/catch, unhandled rejection doesn't remove the key
    await expect(profile.keysTable.getByText("Test Key")).toBeVisible();

    await cleanup();
  });
});

// ─────────────────────────────────────────────────────────
// 3. Basic User Profile View
// ─────────────────────────────────────────────────────────

test.describe("Profile – Basic User View", () => {
  test.use({ storageState: STORAGE_BASIC });

  let profile: ProfilePage;

  test.beforeEach(async ({ page }) => {
    profile = new ProfilePage(page);
    await profile.goto();
    await expect(profile.userName).toBeVisible();
  });

  // ── Header ──

  test("displays basic user name", async () => {
    await expect(profile.userName).toHaveText("E2E Basic User");
  });

  test("displays role badge as 'משתמש'", async () => {
    await expect(profile.roleBadge).toHaveText(/משתמש/);
  });

  // ── Admin-only sections hidden ──

  test("organization management card is NOT visible", async () => {
    await expect(profile.orgManagementCardTitle).not.toBeVisible();
  });

  test("API keys management card is NOT visible", async () => {
    await expect(profile.apiKeysCardTitle).not.toBeVisible();
  });

  // ── Restricted area ──

  test("shows 'אזור מוגבל' alert with admin-only message", async ({
    page,
  }) => {
    await expect(profile.restrictedAreaAlert).toBeVisible();
    await expect(
      page.getByText("ניהול מפתחות API זמין למנהלי מערכת")
    ).toBeVisible();
  });

  // ── Integrations (non-admin) ──

  test("shows 'גישה לאדמין בלבד' badge for both integrations", async () => {
    await expect(profile.greenApiAdminOnlyBadge).toBeVisible();
    await expect(profile.whatsappAdminOnlyBadge).toBeVisible();
  });

  test("does NOT show 'הגדרות' buttons", async () => {
    await expect(profile.greenApiSettingsButton).not.toBeVisible();
    await expect(profile.whatsappSettingsButton).not.toBeVisible();
  });

  // ── Shared sections visible ──

  test("organization card is visible", async () => {
    await expect(profile.orgCardTitle).toBeVisible();
  });

  test("user details card is visible", async () => {
    await expect(profile.userDetailsCardTitle).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 4. Green API Page
// ─────────────────────────────────────────────────────────

test.describe("Green API Page – Admin Disconnected", () => {
  let greenApi: GreenApiPage;

  test.beforeEach(async ({ page }) => {
    await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/x-component",
        body: `0:${JSON.stringify({
          isAdmin: true,
          greenApiInstanceId: null,
        })}\n`,
      });
    });

    greenApi = new GreenApiPage(page);
    await greenApi.goto();
    await expect(greenApi.cardTitle).toBeVisible();
  });

  test("shows back button, card title, info alert", async () => {
    await expect(greenApi.backButton).toBeVisible();
    await expect(greenApi.cardTitle).toBeVisible();
    await expect(greenApi.infoAlert).toBeVisible();
  });

  test("shows instance ID and token inputs", async () => {
    await expect(greenApi.instanceIdInput).toBeVisible();
    await expect(greenApi.tokenInput).toBeVisible();
  });

  test("shows 'שמור והתחבר' button", async () => {
    await expect(greenApi.saveButton).toBeVisible();
  });

  test("does NOT show connected badge or disconnect button", async () => {
    await expect(greenApi.connectedBadge).not.toBeVisible();
    await expect(greenApi.disconnectButton).not.toBeVisible();
  });

  test("back button navigates to profile", async ({ page }) => {
    await greenApi.backButton.click();
    await expect(page).toHaveURL("/profile");
  });

  test("save with empty fields shows validation alert", async ({ page }) => {
    await greenApi.saveButton.click();
    const alertDialog = page.getByRole("alertdialog");
    await expect(alertDialog).toBeVisible();
    await expect(alertDialog.getByText("אנא הזן את כל השדות")).toBeVisible();
  });

  test("save failure shows error toast", async ({ page }) => {
    await greenApi.fillCredentials("1101823921", "badtoken");

    // Replace existing mock with one that fails
    await page.unroute("**/*");
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.abort("failed");
    });

    await greenApi.saveButton.click();
    await expect(
      page.locator("[data-sonner-toast][data-type='error']").first()
    ).toBeVisible();

    await cleanup();
  });

  test("whitespace-only fields bypass validation — save fires without alert", async ({
    page,
  }) => {
    await greenApi.fillCredentials("   ", "   ");

    await page.unroute("**/*");
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/x-component",
        body: `0:${JSON.stringify({ success: true })}\n`,
      });
    });

    await greenApi.saveButton.click();
    // Validation alert should NOT appear — whitespace passes `!instanceId` check
    await expect(page.getByRole("alertdialog")).not.toBeVisible();

    await cleanup();
  });

  test("loadData rate limit shows specific rate-limit toast", async ({
    page,
  }) => {
    // Override the beforeEach mock — navigate fresh with 429
    await page.unroute("**/*");
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "text/plain",
        body: "Too Many Requests",
      });
    });

    await page.goto("/profile/green-api");
    await expect(
      page.getByText("יותר מדי בקשות, נסה שוב בעוד 2 דקות")
    ).toBeVisible();

    await cleanup();
  });

  test("save/connect flow shows success toast", async ({ page }) => {
    await greenApi.fillCredentials("1101823921", "mytoken123");

    // Replace existing mock with one that handles save + status calls
    await page.unroute("**/*");
    let callCount = 0;
    const cleanup = await interceptAllServerActions(page, async (route) => {
      callCount++;
      if (callCount === 1) {
        // saveGreenApiCredentials
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({ success: true })}\n`,
        });
      } else {
        // getGreenApiStatus
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({ state: "authorized" })}\n`,
        });
      }
    });

    await greenApi.saveButton.click();
    await expect(page.getByText("החיבור נשמר בהצלחה")).toBeVisible();
    // Should now show connected state
    await expect(greenApi.connectedBadge).toBeVisible();

    await cleanup();
  });
});

test.describe("Green API Page – Admin Connected", () => {
  let greenApi: GreenApiPage;

  test.beforeEach(async ({ page }) => {
    let callCount = 0;
    await interceptAllServerActions(page, async (route) => {
      callCount++;
      if (callCount === 1) {
        // getGreenApiCredentials
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({
            isAdmin: true,
            greenApiInstanceId: "1101823921",
            greenApiToken: "****...abc",
          })}\n`,
        });
      } else {
        // getGreenApiStatus
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: `0:${JSON.stringify({ state: "authorized" })}\n`,
        });
      }
    });

    greenApi = new GreenApiPage(page);
    await greenApi.goto();
    await expect(greenApi.cardTitle).toBeVisible();
  });

  test("shows 'מחובר פעיל' badge", async () => {
    await expect(greenApi.connectedBadge).toBeVisible();
  });

  test("shows connected instance ID and status", async () => {
    await expect(greenApi.connectedInstanceId).toHaveText("1101823921");
  });

  test("shows disconnect button", async () => {
    await expect(greenApi.disconnectButton).toBeVisible();
  });

  test("does NOT show credential inputs", async () => {
    await expect(greenApi.instanceIdInput).not.toBeVisible();
    await expect(greenApi.saveButton).not.toBeVisible();
  });

  test("disconnect failure shows error toast", async ({ page }) => {
    await greenApi.disconnectButton.click();
    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();

    await page.unroute("**/*");
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.abort("failed");
    });

    await confirmDialog.getByRole("button", { name: "אישור" }).click();
    await expect(
      page.locator("[data-sonner-toast][data-type='error']").first()
    ).toBeVisible();
    await cleanup();
  });

  test("disconnect flow shows success toast and disconnected state", async ({
    page,
  }) => {
    await greenApi.disconnectButton.click();

    // Confirm dialog should appear (showConfirm)
    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await expect(
      confirmDialog.getByText("האם אתה בטוח שברצונך לנתק את החיבור?")
    ).toBeVisible();

    // Re-mock for disconnect action
    await page.unroute("**/*");
    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/x-component",
        body: `0:${JSON.stringify({ success: true })}\n`,
      });
    });

    await confirmDialog.getByRole("button", { name: "אישור" }).click();
    await expect(page.getByText("החיבור נותק בהצלחה")).toBeVisible();
    // Should now show disconnected state (inputs visible)
    await expect(greenApi.instanceIdInput).toBeVisible();
    await expect(greenApi.saveButton).toBeVisible();
    await expect(greenApi.connectedBadge).not.toBeVisible();

    await cleanup();
  });
});

test.describe("Green API Page – Non-admin", () => {
  test.use({ storageState: STORAGE_BASIC });

  test("shows restricted access alert when disconnected", async ({ page }) => {
    await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/x-component",
        body: `0:${JSON.stringify({
          isAdmin: false,
          greenApiInstanceId: null,
        })}\n`,
      });
    });

    const greenApi = new GreenApiPage(page);
    await greenApi.goto();
    await expect(greenApi.restrictedAlertTitle).toBeVisible();
    await expect(greenApi.noActiveConnection).toBeVisible();
  });

  test("shows restricted access alert with connection status when connected", async ({
    page,
  }) => {
    await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/x-component",
        body: `0:${JSON.stringify({
          isAdmin: false,
          greenApiInstanceId: "****1234",
        })}\n`,
      });
    });

    const greenApi = new GreenApiPage(page);
    await greenApi.goto();
    await expect(greenApi.restrictedAlertTitle).toBeVisible();
    await expect(greenApi.nonAdminCardTitle).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 5. RTL & Responsive
// ─────────────────────────────────────────────────────────

test.describe("Profile – RTL & Responsive", () => {
  test("page container has dir='rtl'", async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.goto();
    await expect(profile.pageContainer).toHaveAttribute("dir", "rtl");
  });

  test("mobile viewport — key elements visible, layout stacks", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
      storageState: STORAGE_ADMIN,
    });
    const page = await context.newPage();
    const profile = new ProfilePage(page);
    await profile.goto();

    await expect(profile.userName).toBeVisible();
    await expect(profile.orgCardTitle).toBeVisible();
    await expect(profile.integrationsCardTitle).toBeVisible();

    await context.close();
  });

  test("desktop viewport — grid layout renders correctly", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      storageState: STORAGE_ADMIN,
    });
    const page = await context.newPage();
    const profile = new ProfilePage(page);
    await profile.goto();

    await expect(profile.userName).toBeVisible();
    await expect(profile.orgCardTitle).toBeVisible();
    await expect(profile.integrationsCardTitle).toBeVisible();
    await expect(profile.apiKeysCardTitle).toBeVisible();

    await context.close();
  });
});

// ─────────────────────────────────────────────────────────
// 6. Edge Cases
// ─────────────────────────────────────────────────────────

test.describe("Profile – Edge Cases", () => {
  let profile: ProfilePage;

  test.beforeEach(async ({ page }) => {
    profile = new ProfilePage(page);
    await profile.goto();
    await expect(profile.userName).toBeVisible();
  });

  test("whitespace-only company name keeps submit button disabled", async () => {
    await profile.openUpdateOrgDialog();
    await profile.dialogNewNameInput.fill("   ");
    await profile.dialogPasswordInput.fill("password123");
    await expect(profile.dialogSubmitButton).toBeDisabled();
  });

  test("whitespace-only API key name enables button (uses !newKeyName not .trim())", async () => {
    // This documents current behavior: whitespace-only enables the button
    // because the disabled check is `!newKeyName` not `!newKeyName.trim()`
    await profile.apiKeyNameInput.fill("   ");
    await expect(profile.createKeyButton).toBeEnabled();
  });

  test("whitespace-only key name — clicking create does nothing", async ({
    page,
  }) => {
    await profile.apiKeyNameInput.fill("   ");

    const cleanup = await interceptAllServerActions(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/x-component",
        body: `0:${JSON.stringify({ success: true, data: { fullKey: "sk_test" } })}\n`,
      });
    });

    await profile.createKeyButton.click();
    // Handler returns early due to .trim() check — no alert or toast
    await expect(profile.newKeyAlertTitle).not.toBeVisible();

    await cleanup();
  });

});
