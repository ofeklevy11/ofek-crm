import { test, expect } from "@playwright/test";
import { FilesPage } from "./pages/FilesPage";
import { STORAGE_NO_TASKS, interceptAllServerActions } from "./helpers/test-utils";
import fs from "fs";
import path from "path";

// Load seeded test data IDs
const META_PATH = path.join(__dirname, ".auth", ".e2e-meta.json");

function loadMeta() {
  if (!fs.existsSync(META_PATH)) {
    throw new Error("E2E meta file not found — did globalSetup run?");
  }
  return JSON.parse(fs.readFileSync(META_PATH, "utf-8")) as {
    companyId: number;
    adminUserId: number;
    basicUserId: number;
    folderDocsId: number;
    folderImagesId: number;
    folderContractsId: number;
    fileImageId: number;
    filePdfId: number;
    fileTextId: number;
    fileInFolderId: number;
  };
}

// ===========================================================================
// File-level serial wrapper: ensures all describe blocks run in declaration
// order (read-only first, mutations last) to prevent cross-block DB conflicts
// when running with multiple Playwright workers.
// ===========================================================================
test.describe("Files Page", () => {
  test.describe.configure({ mode: "serial" });

  // ===========================================================================
  // Navigation & Page Load (read-only)
  // ===========================================================================
  test.describe("Navigation & Page Load", () => {
    test("loads /files with correct URL, heading, and subtitle", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      await expect(page).toHaveURL(/\/files$/);
      await expect(files.heading).toBeVisible();
      await expect(files.subtitle).toBeVisible();
    });

    test("shows seeded folders and files", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      // Seeded folders
      await expect(files.getFolderByName("מסמכים")).toBeVisible();
      await expect(files.getFolderByName("תמונות")).toBeVisible();

      // Seeded root files
      await expect(files.getFileByName("לוגו החברה")).toBeVisible();
      await expect(files.getFileByName("חוזה שירות")).toBeVisible();
      await expect(files.getFileByName("notes.txt")).toBeVisible();
    });

    test("storage usage bar is visible", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      await expect(files.storageUsage).toBeVisible();
      await expect(files.progressBar).toBeVisible();
    });

    test("storage bar shows usage format", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      // Storage bar shows "{used} / 100 MB" format
      await expect(page.getByText(/[\d.]+\s*(B|KB|MB)\s*\/\s*100\s*MB/)).toBeVisible();
    });

    test("folder cards display file count and total size", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      // "מסמכים" folder has seeded content — should show file count
      const docsFolder = files.getFolderByName("מסמכים");
      await expect(docsFolder).toBeVisible();
      await expect(docsFolder.getByText(/\d+\s*קבצים?/)).toBeVisible();

      // "תמונות" folder is empty — should show "ריק"
      const imagesFolder = files.getFolderByName("תמונות");
      await expect(imagesFolder.getByText("ריק")).toBeVisible();
    });

    test("empty folder shows empty state message", async ({ page }) => {
      const meta = loadMeta();
      const files = new FilesPage(page);
      // Navigate to the empty "תמונות" folder
      await files.goto(meta.folderImagesId);
      await files.waitForLoaded();

      await expect(files.emptyState).toBeVisible();
    });

    test("breadcrumbs show when navigating into a folder", async ({ page }) => {
      const meta = loadMeta();
      const files = new FilesPage(page);
      await files.goto(meta.folderDocsId);
      await files.waitForLoaded();

      // Root breadcrumb always visible
      await expect(files.breadcrumbRoot).toBeVisible();
      // Current folder in breadcrumbs
      await expect(files.getBreadcrumb("מסמכים")).toBeVisible();
    });

    test("back to library button appears inside folders", async ({ page }) => {
      const meta = loadMeta();
      const files = new FilesPage(page);
      await files.goto(meta.folderDocsId);
      await files.waitForLoaded();

      await expect(files.locationBanner).toBeVisible();
      await expect(files.backToLibraryBtn).toBeVisible();

      // Click back → returns to root
      await files.backToLibraryBtn.click();
      await expect(page).toHaveURL(/\/files$/);
    });
  });

  // ===========================================================================
  // Authentication & Authorization (fresh contexts)
  // ===========================================================================
  test.describe("Authentication & Authorization", () => {
    test("unauthenticated user is redirected to /login", async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto("/files");
      await expect(page).toHaveURL(/\/login/);

      await context.close();
    });

    test("basic user without canViewFiles is redirected to /", async ({ browser }) => {
      const context = await browser.newContext({
        storageState: STORAGE_NO_TASKS,
      });
      const page = await context.newPage();

      await page.goto("/files");
      // Layout redirects to "/" when canViewFiles is false
      await expect(page).not.toHaveURL(/\/files/);

      await context.close();
    });

    test("admin user loads page normally", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      await expect(files.heading).toBeVisible();
      await expect(files.createFolderBtn).toBeVisible();
      await expect(files.uploadFileBtn).toBeVisible();
    });

    test("session expiry mid-flow shows error", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      // Intercept server actions specifically (not all POSTs)
      const cleanup = await interceptAllServerActions(page, async (route) => {
        await route.fulfill({
          status: 401,
          body: JSON.stringify({ error: "Unauthorized" }),
        });
      });

      await files.createFolderBtn.click();
      await expect(files.createFolderDialog).toBeVisible();
      await files.folderNameInput.fill("תיקיית בדיקה");
      await files.createFolderSubmitBtn.click();

      // Should show error toast
      await expect(page.getByText(/שגיאה|אין לך הרשאה/)).toBeVisible({ timeout: 10_000 });

      await cleanup();
    });

    // NOTE: "basic user WITH canViewFiles can access /files" requires a
    // dedicated storage state with canViewFiles:true. Add one in auth-setup.ts
    // if coverage of this permission flag for basic users is needed.
  });

  // ===========================================================================
  // View Modes (read-only, client-side state)
  // ===========================================================================
  test.describe("View Modes", () => {
    test("default view is grid layout", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      // Content should be visible
      const folder1 = files.getFolderByName("מסמכים");
      const folder2 = files.getFolderByName("תמונות");
      await expect(folder1).toBeVisible();
      await expect(folder2).toBeVisible();

      // In grid layout, items are laid out horizontally (same row)
      const box1 = await folder1.boundingBox();
      const box2 = await folder2.boundingBox();
      expect(box1).not.toBeNull();
      expect(box2).not.toBeNull();
      expect(Math.abs(box1!.y - box2!.y)).toBeLessThan(10);
    });

    test("switch to list view shows files and folders", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      await files.switchView("list");

      // Content should remain visible in list view
      await expect(files.getFolderByName("מסמכים")).toBeVisible({ timeout: 5_000 });
      await expect(files.getFileByName("לוגו החברה")).toBeVisible();
    });

    test("list view shows file metadata inline", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      await files.switchView("list");

      const fileCard = files.getFileByName("לוגו החברה");
      await expect(fileCard).toBeVisible({ timeout: 5_000 });

      // In list view, file size and source should still be visible
      await expect(fileCard.getByText(/\d+(\.\d+)?\s*(B|KB|MB)/)).toBeVisible();
      await expect(fileCard.getByText("ידנית")).toBeVisible();
    });

    test("switch to compact view shows table headers and content", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      await files.switchView("compact");

      // Compact headers
      await expect(page.getByText("שם").first()).toBeVisible();
      await expect(page.getByText("גודל").first()).toBeVisible();
      await expect(page.getByText("תאריך שינוי")).toBeVisible();

      // Content should remain visible in compact view
      await expect(files.getFolderByName("מסמכים")).toBeVisible();
      await expect(files.getFileByName("לוגו החברה")).toBeVisible();
    });

    test("compact view shows file metadata in table columns", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      await files.switchView("compact");

      const fileCard = files.getFileByName("לוגו החברה");
      await expect(fileCard).toBeVisible({ timeout: 5_000 });

      // In compact view, file size, date, and source render as table cells
      await expect(fileCard.getByText(/\d+(\.\d+)?\s*(B|KB|MB)/)).toBeVisible();
      await expect(fileCard.getByText("ידנית")).toBeVisible();
    });

    test("switching views preserves all content", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      // Grid → List → Compact → Grid — verify content each time
      for (const mode of ["list", "compact", "grid"] as const) {
        await files.switchView(mode);
        await expect(files.getFolderByName("מסמכים")).toBeVisible({ timeout: 5_000 });
        await expect(files.getFileByName("לוגו החברה")).toBeVisible();
        await expect(files.getFileByName("חוזה שירות")).toBeVisible();
      }
    });
  });

  // ===========================================================================
  // File Type Filters (read-only)
  // ===========================================================================
  test.describe("File Type Filters", () => {
    test('"כל הקבצים" filter shows everything with correct count', async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      const allFilter = files.getFilterButton("כל הקבצים");
      await expect(allFilter).toBeVisible();
      // Count should include both folders and files
      const count = await files.getFilterCount("כל הקבצים");
      expect(count).toBeGreaterThanOrEqual(5); // 2 folders + 3 files minimum
    });

    test('"תיקיות" filter shows only folders', async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      await files.selectFilter("תיקיות");

      // Folders should be visible
      await expect(files.getFolderByName("מסמכים")).toBeVisible();

      // Files should NOT be visible
      await expect(files.getFileByName("לוגו החברה")).not.toBeVisible();
    });

    test("type-specific filter shows only matching files", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      // Filter by images
      await files.selectFilter("תמונות");

      // Image file should be visible
      await expect(files.getFileByName("לוגו החברה")).toBeVisible();

      // PDF file should NOT be visible
      await expect(files.getFileByName("חוזה שירות")).not.toBeVisible();

      // Folders should NOT be visible
      await expect(files.getFolderByName("מסמכים")).not.toBeVisible();
    });

    test("filter counts update correctly", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      // Check "תיקיות" filter has count of at least 2
      const folderCount = await files.getFilterCount("תיקיות");
      expect(folderCount).toBeGreaterThanOrEqual(2);
    });

    test("filters with zero matches are hidden (except all/folders)", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      // "כל הקבצים" and "תיקיות" always visible
      await expect(files.getFilterButton("כל הקבצים")).toBeVisible();
      await expect(files.getFilterButton("תיקיות")).toBeVisible();

      // No seeded audio or video files → these filters should not appear
      await expect(files.getFilterButton("שמע")).not.toBeVisible();
      await expect(files.getFilterButton("וידאו")).not.toBeVisible();
    });

    test("filter-specific empty state shows correct message", async ({ page }) => {
      const meta = loadMeta();
      const files = new FilesPage(page);
      await files.goto(meta.folderImagesId);
      await files.waitForLoaded();

      // Default "all" filter shows generic empty state
      await expect(page.getByText("התיקייה ריקה")).toBeVisible();

      // Switch to folders filter → specific empty message
      await files.selectFilter("תיקיות");
      await expect(page.getByText("לא נמצאו תיקיות")).toBeVisible();
    });
  });

  // ===========================================================================
  // Responsive Layout (read-only)
  // ===========================================================================
  test.describe("Responsive Layout", () => {
    test("desktop viewport — items laid out horizontally", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      // Verify two known items are on the same row at desktop width
      const folder1 = files.getFolderByName("מסמכים");
      const folder2 = files.getFolderByName("תמונות");
      await expect(folder1).toBeVisible();
      await expect(folder2).toBeVisible();

      const box1 = await folder1.boundingBox();
      const box2 = await folder2.boundingBox();
      expect(box1).not.toBeNull();
      expect(box2).not.toBeNull();
      // Both should be in the same row on desktop
      expect(Math.abs(box1!.y - box2!.y)).toBeLessThan(10);
    });

    test("mobile viewport — items wrap to multiple rows", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      // On mobile with 2-column grid, the 3rd item should be on a different row
      const folder1 = files.getFolderByName("מסמכים");
      const folder2 = files.getFolderByName("תמונות");
      const file1 = files.getFileByName("לוגו החברה");
      await expect(folder1).toBeVisible();
      await expect(file1).toBeVisible();

      const box1 = await folder1.boundingBox();
      const box2 = await folder2.boundingBox();
      const box3 = await file1.boundingBox();
      expect(box1).not.toBeNull();
      expect(box3).not.toBeNull();

      // First two items in the same row
      expect(Math.abs(box1!.y - box2!.y)).toBeLessThan(10);
      // Third item wraps to next row
      expect(box3!.y).toBeGreaterThan(box1!.y + 10);
    });
  });

  // ===========================================================================
  // Edge Cases (read-only)
  // ===========================================================================
  test.describe("Edge Cases", () => {
    test("invalid folderId shows empty or root", async ({ page }) => {
      const files = new FilesPage(page);
      await page.goto("/files?folderId=999999");
      await files.waitForLoaded();

      // Should still render the page (not crash)
      await expect(files.heading).toBeVisible();
    });

    test("non-numeric folderId param is handled gracefully", async ({ page }) => {
      const files = new FilesPage(page);
      await page.goto("/files?folderId=abc");
      await files.waitForLoaded();

      // parseInt("abc") → NaN → treated as null → shows root
      await expect(files.heading).toBeVisible();
      // Should show root-level content
      await expect(files.getFolderByName("מסמכים")).toBeVisible();
    });

    test("breadcrumb navigation works for nested folders", async ({ page }) => {
      const meta = loadMeta();
      const files = new FilesPage(page);

      // Navigate to nested folder (חוזים inside מסמכים)
      await files.goto(meta.folderContractsId);
      await files.waitForLoaded();

      // Breadcrumbs: כל הקבצים > מסמכים > חוזים
      await expect(files.breadcrumbRoot).toBeVisible();
      await expect(files.getBreadcrumb("מסמכים")).toBeVisible();
      await expect(files.getBreadcrumb("חוזים")).toBeVisible();

      // Click "מסמכים" breadcrumb to navigate up
      await files.getBreadcrumb("מסמכים").click();
      await expect(page).toHaveURL(new RegExp(`folderId=${meta.folderDocsId}`));
    });

    test("Hebrew text renders correctly with RTL direction", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      // Verify the file explorer container has RTL direction (not tied to Tailwind classes)
      const rtlContainer = page.locator("[dir='rtl']").filter({ hasText: "ספריית קבצים" });
      await expect(rtlContainer).toBeVisible();
    });
  });

  // ===========================================================================
  // Upload Flow (modal-only, no DB mutation)
  // ===========================================================================
  test.describe("Upload Flow", () => {
    test("open upload modal shows dropzone", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      await files.uploadFileBtn.click();
      await expect(files.uploadDialog).toBeVisible();
      await expect(files.uploadDropzone).toBeVisible();
    });

    test("cancel button closes upload modal", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      await files.uploadFileBtn.click();
      await expect(files.uploadDialog).toBeVisible();

      await files.uploadCancelBtn.click();
      await expect(files.uploadDialog).not.toBeVisible();
    });

    test("upload button is disabled when no files selected", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      await files.uploadFileBtn.click();
      await expect(files.uploadDialog).toBeVisible();

      // Upload submit should be disabled without files
      await expect(files.uploadSubmitBtn).toBeDisabled();
    });

    test("upload modal shows per-file display name input after file selection", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      await files.uploadFileBtn.click();
      await expect(files.uploadDialog).toBeVisible();

      // Use filechooser to add a file
      const fileChooserPromise = page.waitForEvent("filechooser");
      await files.uploadDropzone.click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: "test-file.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("test content"),
      });

      // File list should appear
      await expect(files.selectedFilesHeading).toBeVisible();
      // Verify file size is displayed in KB
      await expect(files.uploadDialog.getByText(/[\d.]+\s*KB/)).toBeVisible();
      // Display name input is visible and functional
      const displayNameInput = page.getByPlaceholder("השאר ריק לשימוש בשם המקורי...");
      await expect(displayNameInput).toBeVisible();
      await displayNameInput.fill("שם מותאם");
      await expect(displayNameInput).toHaveValue("שם מותאם");
    });

    test("remove file from list before upload", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      await files.uploadFileBtn.click();

      // Add file
      const fileChooserPromise = page.waitForEvent("filechooser");
      await files.uploadDropzone.click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: "remove-me.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("data"),
      });

      await expect(page.getByText("remove-me.txt")).toBeVisible();

      // Remove it — go up one level from the filename text to find
      // the remove button in the same file item container
      await files.getUploadFileRemoveBtn("remove-me.txt").click();

      // File should be gone
      await expect(page.getByText("remove-me.txt")).not.toBeVisible();
    });

    test("upload button becomes enabled after selecting files", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      await files.uploadFileBtn.click();
      await expect(files.uploadSubmitBtn).toBeDisabled();

      const fileChooserPromise = page.waitForEvent("filechooser");
      await files.uploadDropzone.click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: "enable-test.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("test"),
      });

      await expect(files.uploadSubmitBtn).toBeEnabled();
    });

    test("multi-file upload shows individual display name inputs", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      await files.uploadFileBtn.click();
      await expect(files.uploadDialog).toBeVisible();

      const fileChooserPromise = page.waitForEvent("filechooser");
      await files.uploadDropzone.click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles([
        { name: "file-a.txt", mimeType: "text/plain", buffer: Buffer.from("aaa") },
        { name: "file-b.txt", mimeType: "text/plain", buffer: Buffer.from("bbb") },
      ]);

      // Both files should appear
      await expect(page.getByText("file-a.txt")).toBeVisible();
      await expect(page.getByText("file-b.txt")).toBeVisible();

      // Should have 2 display name inputs (one per file)
      const displayNameInputs = files.uploadDialog.getByPlaceholder("השאר ריק לשימוש בשם המקורי...");
      await expect(displayNameInputs).toHaveCount(2);

      // Submit button should be enabled (files selected)
      await expect(files.uploadSubmitBtn).toBeEnabled();
    });
  });

  // ===========================================================================
  // Folder CRUD — Happy Path (MUTATES DB)
  // ===========================================================================
  test.describe("Folder CRUD — Happy Path", () => {
    test("create folder via modal", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      await files.createFolderBtn.click();
      await expect(files.createFolderDialog).toBeVisible();

      await files.folderNameInput.fill("תיקיית E2E");
      await files.createFolderSubmitBtn.click();

      // Dialog closes and folder appears
      await expect(files.createFolderDialog).not.toBeVisible({ timeout: 10_000 });
      await expect(files.getFolderByName("תיקיית E2E")).toBeVisible({ timeout: 10_000 });
    });

    test("navigate into folder via click updates URL", async ({ page }) => {
      const meta = loadMeta();
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      // Click the "מסמכים" folder
      await files.getFolderByName("מסמכים").click();

      await expect(page).toHaveURL(new RegExp(`folderId=${meta.folderDocsId}`));
      // File inside folder should be visible
      await expect(files.getFileByName("דוח חודשי")).toBeVisible({ timeout: 10_000 });
    });

    test.describe("Rename Folder", () => {
      test.describe.configure({ mode: "serial" });

      test("rename folder via dropdown menu", async ({ page }) => {
        const files = new FilesPage(page);
        await files.goto();
        await files.waitForLoaded();

        // Open dropdown on the "תמונות" folder using POM method
        await files.openFolderDropdown("תמונות");

        // Click "שנה שם"
        await page.getByRole("menuitem", { name: "שנה שם" }).click();

        // Rename dialog
        const renameDialog = files.getRenameDialog();
        await expect(renameDialog).toBeVisible();

        // Clear and type new name
        const input = renameDialog.getByLabel("שם התיקייה");
        await input.clear();
        await input.fill("תמונות מעודכן");
        await renameDialog.getByRole("button", { name: /שמור/ }).click();

        // Success toast
        await expect(page.getByText("שם התיקייה עודכן בהצלחה")).toBeVisible({ timeout: 10_000 });
      });

      test("rename folder via Enter key in dialog", async ({ page }) => {
        const files = new FilesPage(page);
        await files.goto();
        await files.waitForLoaded();

        // Previous test renamed "תמונות" → "תמונות מעודכן", so target that name
        await files.openFolderDropdown("תמונות מעודכן");
        await page.getByRole("menuitem", { name: "שנה שם" }).click();

        const renameDialog = files.getRenameDialog();
        await expect(renameDialog).toBeVisible();

        const input = renameDialog.getByLabel("שם התיקייה");
        await input.clear();
        await input.fill("תמונות אחרות");
        await input.press("Enter");

        await expect(page.getByText("שם התיקייה עודכן בהצלחה")).toBeVisible({ timeout: 10_000 });
      });
    });

    test("create folder inside subfolder", async ({ page }) => {
      const meta = loadMeta();
      const files = new FilesPage(page);
      await files.goto(meta.folderDocsId);
      await files.waitForLoaded();

      await files.createFolderBtn.click();
      await expect(files.createFolderDialog).toBeVisible();
      await files.folderNameInput.fill("תיקיית משנה חדשה");
      await files.createFolderSubmitBtn.click();

      await expect(files.createFolderDialog).not.toBeVisible({ timeout: 10_000 });
      await expect(files.getFolderByName("תיקיית משנה חדשה")).toBeVisible({ timeout: 10_000 });
    });

    test("create folder dialog cancel closes without creating", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      await files.createFolderBtn.click();
      await expect(files.createFolderDialog).toBeVisible();
      await files.folderNameInput.fill("לא ליצור");
      await files.createFolderCancelBtn.click();

      await expect(files.createFolderDialog).not.toBeVisible();
      await expect(files.getFolderByName("לא ליצור")).not.toBeVisible();
    });

    test("delete empty folder via dropdown", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      // First create a folder to delete
      await files.createFolderBtn.click();
      await expect(files.createFolderDialog).toBeVisible();
      await files.folderNameInput.fill("למחיקה");
      await files.createFolderSubmitBtn.click();
      await expect(files.createFolderDialog).not.toBeVisible({ timeout: 10_000 });
      await expect(files.getFolderByName("למחיקה")).toBeVisible({ timeout: 10_000 });

      // Now delete it using POM method
      await files.openFolderDropdown("למחיקה");
      await page.getByRole("menuitem", { name: "מחק" }).click();

      // Confirm dialog — scoped to alertdialog
      await files.confirmAction();

      // Success toast
      await expect(page.getByText("התיקייה נמחקה בהצלחה")).toBeVisible({ timeout: 10_000 });
      // Verify folder actually disappeared from the page
      await expect(files.getFolderByName("למחיקה")).not.toBeVisible({ timeout: 10_000 });
    });
  });

  // ===========================================================================
  // File Operations — Happy Path (MUTATES DB)
  // ===========================================================================
  test.describe("File Operations — Happy Path", () => {
    // Read-only tests — no serial needed (these don't mutate)
    test("file cards display name, size, date, source", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      const fileCard = files.getFileByName("לוגו החברה");
      await expect(fileCard).toBeVisible();

      // Size should be visible (formatted as "200 B", "1.5 KB", etc.)
      await expect(fileCard.getByText(/\d+(\.\d+)?\s*(B|KB|MB)/)).toBeVisible();
      // Date should be visible (he-IL long format: e.g., "5 במרץ 2026")
      await expect(fileCard.getByText(/\d{1,2}\s+\S+\s+\d{4}/)).toBeVisible();
      // Source
      await expect(fileCard.getByText("ידנית")).toBeVisible();
    });

    test("open file link has correct href", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      // Open actions dropdown using POM method
      await files.openFileDropdown("לוגו החברה");

      // "פתח" is a menuitem rendered as an <a> tag via asChild —
      // the menuitem IS the link, not a child of it
      const openLink = page.getByRole("menuitem", { name: "פתח" });
      await expect(openLink).toHaveAttribute("target", "_blank");
      await expect(openLink).toHaveAttribute("href", /utfs\.io/);
    });

    test("download file triggers API call", async ({ page }) => {
      const meta = loadMeta();
      const files = new FilesPage(page);

      // Mock the download API to return a fake blob
      await page.route(`**/api/files/${meta.fileImageId}/download`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "image/png",
          body: Buffer.from("fake-image-data"),
          headers: {
            "Content-Disposition": "attachment; filename=\"logo.png\"",
          },
        });
      });

      await files.goto();
      await files.waitForLoaded();

      // Open actions dropdown using POM method
      await files.openFileDropdown("לוגו החברה");

      // Click "הורד"
      const downloadPromise = page.waitForRequest(`**/api/files/${meta.fileImageId}/download`);
      await page.getByRole("menuitem", { name: "הורד" }).click();
      await downloadPromise;
    });

    // NOTE: This test mutates "לוגו החברה" → "לוגו מעודכן". Tests that reference
    // "לוגו החברה" (file info, open link, download) must run before this one.
    // Guaranteed by file-level serial wrapper.
    test("edit file display name", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      // Open actions dropdown using POM method
      await files.openFileDropdown("לוגו החברה");

      // Click "ערוך שם"
      await page.getByRole("menuitem", { name: "ערוך שם" }).click();

      // Edit mode should appear with input
      const fileCard = files.getFileByName("לוגו החברה");
      const editInput = fileCard.locator("input[type='text']");
      await expect(editInput).toBeVisible();
      await editInput.clear();
      await editInput.fill("לוגו מעודכן");

      // Click save
      await fileCard.getByText("שמור").click();

      // Success toast
      await expect(page.getByText("שם הקובץ עודכן בהצלחה")).toBeVisible({ timeout: 10_000 });
    });

    test.describe("Edit cancel and keyboard shortcuts", () => {
      test.describe.configure({ mode: "serial" });

      test("cancel edit display name reverts to normal mode", async ({ page }) => {
        const files = new FilesPage(page);
        await files.goto();
        await files.waitForLoaded();

        await files.openFileDropdown("חוזה שירות");
        await page.getByRole("menuitem", { name: "ערוך שם" }).click();

        const fileCard = files.getFileByName("חוזה שירות");
        const editInput = fileCard.locator("input[type='text']");
        await expect(editInput).toBeVisible();

        // Click cancel
        await fileCard.getByText("ביטול").click();

        // Edit input should disappear
        await expect(editInput).not.toBeVisible();
        // File name still shown
        await expect(fileCard.getByText("חוזה שירות")).toBeVisible();
      });

      test("Escape key cancels file edit mode", async ({ page }) => {
        const files = new FilesPage(page);
        await files.goto();
        await files.waitForLoaded();

        await files.openFileDropdown("חוזה שירות");
        await page.getByRole("menuitem", { name: "ערוך שם" }).click();

        const fileCard = files.getFileByName("חוזה שירות");
        const editInput = fileCard.locator("input[type='text']");
        await expect(editInput).toBeVisible();
        await editInput.press("Escape");

        await expect(editInput).not.toBeVisible();
        await expect(fileCard.getByText("חוזה שירות")).toBeVisible();
      });

      test("edit file display name via Enter key", async ({ page }) => {
        const files = new FilesPage(page);
        await files.goto();
        await files.waitForLoaded();

        await files.openFileDropdown("חוזה שירות");
        await page.getByRole("menuitem", { name: "ערוך שם" }).click();

        const fileCard = files.getFileByName("חוזה שירות");
        const editInput = fileCard.locator("input[type='text']");
        await expect(editInput).toBeVisible();
        await editInput.clear();
        await editInput.fill("חוזה עדכני");
        await editInput.press("Enter");

        await expect(page.getByText("שם הקובץ עודכן בהצלחה")).toBeVisible({ timeout: 10_000 });
      });
    });

    test("delete file via dropdown", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      // Delete the text file (least important)
      await files.openFileDropdown("notes.txt");

      // Click "מחק"
      await page.getByRole("menuitem", { name: "מחק" }).click();

      // Confirm dialog — scoped to alertdialog
      await files.confirmAction();

      // Success toast
      await expect(page.getByText("הקובץ נמחק בהצלחה")).toBeVisible({ timeout: 10_000 });
      // Verify file actually disappeared from the page
      await expect(files.getFileByName("notes.txt")).not.toBeVisible({ timeout: 10_000 });
    });
  });

  // ===========================================================================
  // Unhappy Path (server errors mocked via interceptAllServerActions;
  // validation tests hit real server but expect rejection without DB mutation)
  // ===========================================================================
  test.describe("Unhappy Path", () => {
    test("create folder with empty name disables submit", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      await files.createFolderBtn.click();
      await expect(files.createFolderDialog).toBeVisible();

      // Empty name → submit should be disabled
      await files.folderNameInput.fill("");
      await expect(files.createFolderSubmitBtn).toBeDisabled();
    });

    test("rename folder with empty name closes without renaming", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      await files.openFolderDropdown("מסמכים");
      await page.getByRole("menuitem", { name: "שנה שם" }).click();

      const renameDialog = files.getRenameDialog();
      await expect(renameDialog).toBeVisible();

      const input = renameDialog.getByLabel("שם התיקייה");
      await input.clear();

      // Save button should be disabled when name is empty
      await expect(renameDialog.getByRole("button", { name: /שמור/ })).toBeDisabled();

      // Close via cancel
      await renameDialog.getByRole("button", { name: "ביטול" }).click();
      await expect(renameDialog).not.toBeVisible();

      // Folder name unchanged
      await expect(files.getFolderByName("מסמכים")).toBeVisible();
    });

    test("edit display name with 256+ chars shows error", async ({ page }) => {
      const meta = loadMeta();
      const files = new FilesPage(page);
      // Navigate to מסמכים subfolder to use "דוח חודשי" — a file not mutated by File Operations
      await files.goto(meta.folderDocsId);
      await files.waitForLoaded();

      await files.openFileDropdown("דוח חודשי");
      await page.getByRole("menuitem", { name: "ערוך שם" }).click();

      const fileCard = files.getFileByName("דוח חודשי");
      const editInput = fileCard.locator("input[type='text']");
      await expect(editInput).toBeVisible();
      await editInput.fill("א".repeat(256));
      await fileCard.getByText("שמור").click();

      // Server rejects via displayNameSchema.safeParse → throws "Invalid display name"
      // which doesn't match any ERROR_MAP pattern → falls through to GENERIC_ERROR ("אירעה שגיאה...")
      await expect(page.getByText(/שגיאה/)).toBeVisible({ timeout: 10_000 });
    });

    test("server error on create folder shows error toast", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      // Mock server action to fail with HTTP 500. This triggers a fetch-level error
      // (not a structured server-action error), but the component's catch block calls
      // getUserFriendlyError() which produces a Hebrew error toast either way.
      const cleanup = await interceptAllServerActions(page, async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
      });

      await files.createFolderBtn.click();
      await expect(files.createFolderDialog).toBeVisible();
      await files.folderNameInput.fill("תיקייה שנכשלת");
      await files.createFolderSubmitBtn.click();

      // Should show error toast
      await expect(page.getByText(/שגיאה/)).toBeVisible({ timeout: 10_000 });

      await cleanup();
    });

    test("delete folder with subfolders shows error toast", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      // "מסמכים" has subfolder "חוזים" — deleting it should fail
      await files.openFolderDropdown("מסמכים");
      await page.getByRole("menuitem", { name: "מחק" }).click();

      // Confirm the deletion attempt
      await files.confirmAction();

      // Server throws "Folder must be empty of subfolders to delete."
      // getUserFriendlyError maps this to generic error
      await expect(page.getByText(/שגיאה/)).toBeVisible({ timeout: 10_000 });
    });

    test("delete file server error shows error toast", async ({ page }) => {
      const meta = loadMeta();
      const files = new FilesPage(page);
      // Navigate to מסמכים subfolder to use "דוח חודשי" — a file not mutated by File Operations
      await files.goto(meta.folderDocsId);
      await files.waitForLoaded();

      // Mock deleteFile server action to fail with HTTP 500 (fetch-level error).
      // The component's catch block handles this the same as a structured error.
      const cleanup = await interceptAllServerActions(page, async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
      });

      await files.openFileDropdown("דוח חודשי");
      await page.getByRole("menuitem", { name: "מחק" }).click();

      // Confirm the deletion attempt
      await files.confirmAction();

      // Should show error toast
      await expect(page.getByText(/שגיאה/)).toBeVisible({ timeout: 10_000 });

      await cleanup();
    });

    test("rename folder server error shows error toast", async ({ page }) => {
      const files = new FilesPage(page);
      await files.goto();
      await files.waitForLoaded();

      const cleanup = await interceptAllServerActions(page, async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
      });

      await files.openFolderDropdown("מסמכים");
      await page.getByRole("menuitem", { name: "שנה שם" }).click();

      const renameDialog = files.getRenameDialog();
      await expect(renameDialog).toBeVisible();

      const input = renameDialog.getByLabel("שם התיקייה");
      await input.clear();
      await input.fill("שם חדש");
      await renameDialog.getByRole("button", { name: /שמור/ }).click();

      await expect(page.getByText(/שגיאה/)).toBeVisible({ timeout: 10_000 });

      await cleanup();
    });
  });

}); // end "Files Page"
