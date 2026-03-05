import { test, expect } from "@playwright/test";
import { FinanceDashboardPage } from "./pages/FinanceDashboardPage";
import { ClientsPage } from "./pages/ClientsPage";
import { CreateClientPage } from "./pages/CreateClientPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { CreatePaymentPage } from "./pages/CreatePaymentPage";
import { RetainersPage } from "./pages/RetainersPage";
import { CreateRetainerPage } from "./pages/CreateRetainerPage";

// ─── Helper: generate unique name to avoid collisions ───
const uid = () => Math.random().toString(36).slice(2, 8);

// ─── Helper: today's date in YYYY-MM-DD ───
const todayISO = () => new Date().toISOString().split("T")[0];

// ─── Helper: future date ───
const futureDateISO = (daysAhead = 30) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split("T")[0];
};

// ─── Helper: scope interactions to a modal card by its heading text ───
function getModalByHeading(
  page: import("@playwright/test").Page,
  headingName: string
) {
  return page.locator("div.bg-white.rounded-xl", {
    has: page.getByRole("heading", { name: headingName }),
  });
}

// ─── Helper: create a finance client and return its ID ───
async function createTestClient(
  page: import("@playwright/test").Page,
  name?: string
) {
  const clientName = name ?? `לקוח-טסט-${uid()}`;
  const createPage = new CreateClientPage(page);
  await createPage.goto();
  await createPage.fillForm({ name: clientName });

  const responsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes("/api/finance/clients") &&
      resp.request().method() === "POST"
  );
  await createPage.submit();
  const response = await responsePromise;
  const body = await response.json();
  await expect(page).toHaveURL(/\/finance\/clients/);
  return { id: body.id as number, name: clientName };
}

// ═══════════════════════════════════════════════════════
// FINANCE DASHBOARD
// ═══════════════════════════════════════════════════════
test.describe("Finance Dashboard", () => {
  let dashboard: FinanceDashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new FinanceDashboardPage(page);
    await dashboard.goto();
  });

  test.describe("Page Load & Navigation", () => {
    test("should load dashboard with correct title and URL", async ({
      page,
    }) => {
      await expect(page).toHaveURL(/\/finance/);
      await expect(dashboard.pageTitle).toBeVisible();
      await expect(dashboard.pageSubtitle).toBeVisible();
    });

    test("should navigate to clients page via nav card", async ({ page }) => {
      await dashboard.getNavCard("לקוחות").click();
      await expect(page).toHaveURL(/\/finance\/clients/);
    });

    test("should navigate to retainers page via nav card", async ({
      page,
    }) => {
      await dashboard.getNavCard("ריטיינרים").click();
      await expect(page).toHaveURL(/\/finance\/retainers/);
    });

    test("should navigate to payments page via nav card", async ({ page }) => {
      await dashboard.getNavCard("תשלומים").click();
      await expect(page).toHaveURL(/\/finance\/payments/);
    });

    test("should navigate to fixed expenses via nav card", async ({
      page,
    }) => {
      await dashboard.getNavCard("הוצאות קבועות").click();
      await expect(page).toHaveURL(/\/finance\/fixed-expenses/);
    });
  });

  test.describe("Navigation Cards Display", () => {
    test("should display navigation cards for all sub-sections", async () => {
      await expect(dashboard.getNavCard("לקוחות")).toBeVisible();
      await expect(dashboard.getNavCard("ריטיינרים")).toBeVisible();
      await expect(dashboard.getNavCard("תשלומים")).toBeVisible();
      await expect(dashboard.getNavCard("הוצאות קבועות")).toBeVisible();
    });
  });

  test.describe("FinancialStats Cards", () => {
    test("should display all financial stat card labels", async () => {
      await expect(dashboard.statMRR).toBeVisible();
      await expect(dashboard.statOutstandingDebt).toBeVisible();
      await expect(dashboard.statActiveRetainers).toBeVisible();
      await expect(dashboard.statChurnRate).toBeVisible();
    });
  });

  test.describe("Quick Actions", () => {
    test("should show new retainer button and navigate", async ({ page }) => {
      await expect(dashboard.newRetainerButton).toBeVisible();
      await dashboard.newRetainerButton.click();
      await expect(page).toHaveURL(/\/finance\/retainers\/new/);
    });

    test("should show new payment button and navigate", async ({ page }) => {
      await expect(dashboard.newPaymentButton).toBeVisible();
      await dashboard.newPaymentButton.click();
      await expect(page).toHaveURL(/\/finance\/payments\/new/);
    });
  });

  test.describe("Dashboard Sections", () => {
    test("should display income-expenses banner and navigate", async ({
      page,
    }) => {
      await expect(dashboard.incomeExpensesBanner).toBeVisible();
      await dashboard.incomeExpensesBanner.click();
      await expect(page).toHaveURL(/\/finance\/income-expenses/);
    });

    test("should display goals planning section and navigate", async ({
      page,
    }) => {
      await expect(dashboard.goalsSection).toBeVisible();
      await dashboard.goalsSection.click();
      await expect(page).toHaveURL(/\/finance\/goals/);
    });

    test("should display active retainers table with view all link", async ({
      page,
    }) => {
      await expect(dashboard.activeRetainersSection).toBeVisible();
      await expect(dashboard.activeRetainersViewAll).toBeVisible();
      await dashboard.activeRetainersViewAll.click();
      await expect(page).toHaveURL(/\/finance\/retainers/);
    });

    test("should display pending payments table with view all link", async ({
      page,
    }) => {
      await expect(dashboard.pendingPaymentsSection).toBeVisible();
      await expect(dashboard.pendingPaymentsViewAll).toBeVisible();
      await dashboard.pendingPaymentsViewAll.click();
      await expect(page).toHaveURL(/\/finance\/payments/);
    });
  });
});

// ═══════════════════════════════════════════════════════
// CLIENTS MANAGEMENT
// ═══════════════════════════════════════════════════════
test.describe("Clients Management", () => {
  test.describe("Clients List Page", () => {
    test("should load clients list page", async ({ page }) => {
      const clientsPage = new ClientsPage(page);
      await clientsPage.goto();
      await expect(clientsPage.pageTitle).toBeVisible();
      await expect(clientsPage.createButton).toBeVisible();
      // Verify table headers
      await expect(page.locator("th").filter({ hasText: "שם" })).toBeVisible();
      await expect(page.locator("th").filter({ hasText: "פרטי קשר" })).toBeVisible();
      await expect(page.locator("th").filter({ hasText: "פעולות" })).toBeVisible();
    });

  });

  test.describe("Create Client", () => {
    test("should create a new client successfully", async ({ page }) => {
      const createPage = new CreateClientPage(page);
      await createPage.goto();

      const clientName = `לקוח-טסט-${uid()}`;

      await createPage.fillForm({
        name: clientName,
        email: "test@example.com",
        phone: "050-1234567",
        company: "חברה בע״מ",
        notes: "הערות בדיקה",
      });

      // Intercept the API call
      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/finance/clients") &&
          resp.request().method() === "POST"
      );

      await createPage.submit();

      const response = await responsePromise;
      expect(response.status()).toBe(200);

      // Verify success toast
      await expect(page.getByText("הלקוח נוצר בהצלחה")).toBeVisible();

      // Verify redirect
      await expect(page).toHaveURL(/\/finance\/clients/);
    });

    test("should show validation error when name is empty", async ({
      page,
    }) => {
      const createPage = new CreateClientPage(page);
      await createPage.goto();

      // Try to submit empty form — HTML native required validation
      await createPage.submit();

      // Should stay on the same page (browser prevents submission)
      await expect(page).toHaveURL(/\/finance\/clients\/new/);
    });

    test("should cancel client creation and navigate back", async ({
      page,
    }) => {
      const createPage = new CreateClientPage(page);

      // First go to clients list, then to new
      const clientsPage = new ClientsPage(page);
      await clientsPage.goto();
      await clientsPage.createButton.click();
      await expect(page).toHaveURL(/\/finance\/clients\/new/);

      await createPage.cancelButton.click();

      // Should navigate back
      await expect(page).toHaveURL(/\/finance\/clients/);
    });
  });

  test.describe("Client Actions", () => {
    let testClientName: string;

    test.beforeEach(async ({ page }) => {
      // Create a client first
      const result = await createTestClient(page);
      testClientName = result.name;
    });

    test("should navigate to client detail page", async ({ page }) => {
      const clientsPage = new ClientsPage(page);
      // Click on the client row (not the action buttons)
      await clientsPage.getClientRow(testClientName).click();
      await expect(page).toHaveURL(/\/finance\/clients\/\d+/);
    });

    test("should navigate to edit client page", async ({ page }) => {
      const clientsPage = new ClientsPage(page);
      await clientsPage.getEditButton(testClientName).click();
      await expect(page).toHaveURL(/\/finance\/clients\/\d+\/edit/);
    });

    test("should delete a client with confirmation", async ({ page }) => {
      const clientsPage = new ClientsPage(page);

      // Click delete
      await clientsPage.getDeleteButton(testClientName).click();

      // Confirmation dialog MUST appear
      const confirmInput = page.getByLabel("הקלד ביטוי אישור");
      await expect(confirmInput).toBeVisible();
      await confirmInput.fill("מחק");

      // Click the confirm/delete button in the dialog
      const confirmButton = page
        .locator('[role="alertdialog"], [role="dialog"]')
        .getByRole("button", { name: /מחק|אישור/ });
      await confirmButton.click();

      // Verify toast
      await expect(page.getByText("הלקוח נמחק בהצלחה")).toBeVisible();

      // Verify row removal
      await expect(clientsPage.getClientRow(testClientName)).not.toBeVisible();
    });

    test("should cancel delete and keep client intact", async ({ page }) => {
      const clientsPage = new ClientsPage(page);

      // Click delete
      await clientsPage.getDeleteButton(testClientName).click();

      // Confirmation dialog must appear
      const confirmInput = page.getByLabel("הקלד ביטוי אישור");
      await expect(confirmInput).toBeVisible();

      // Click cancel instead of confirming
      const cancelButton = page
        .locator('[role="alertdialog"], [role="dialog"]')
        .getByRole("button", { name: "ביטול" });
      await cancelButton.click();

      // Client should still be in the table
      await expect(clientsPage.getClientRow(testClientName)).toBeVisible();
    });
  });

  test.describe("Client Detail Page", () => {
    test("should display client info on detail page", async ({ page }) => {
      const clientName = `לקוח-פרטים-${uid()}`;
      const createPage = new CreateClientPage(page);
      await createPage.goto();
      await createPage.fillForm({
        name: clientName,
        email: "detail@test.com",
        phone: "053-1112222",
        company: "חברת פרטים",
        notes: "הערות לבדיקת פרטים",
      });

      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/finance/clients") &&
          resp.request().method() === "POST"
      );
      await createPage.submit();
      const response = await responsePromise;
      const body = await response.json();
      const clientId = body.id;

      // Navigate to detail page
      await page.goto(`/finance/clients/${clientId}`);

      // Verify client name
      await expect(
        page.getByRole("heading", { name: clientName })
      ).toBeVisible();

      // Verify back link
      await expect(page.getByText("חזרה ללקוחות")).toBeVisible();

      // Verify contact info displayed
      await expect(page.getByText("detail@test.com")).toBeVisible();
      await expect(page.getByText("053-1112222")).toBeVisible();
      await expect(page.getByText("חברת פרטים")).toBeVisible();

      // Verify outstanding debt section
      await expect(page.getByText("חוב פתוח")).toBeVisible();

      // Verify action buttons
      await expect(page.getByText("ריטיינר חדש")).toBeVisible();
      await expect(page.getByText("תשלום חדש")).toBeVisible();

      // Verify notes section
      await expect(page.getByText("הערות לקוח")).toBeVisible();
      await expect(page.getByText("הערות לבדיקת פרטים")).toBeVisible();
    });
  });

  test.describe("Client Edit Page", () => {
    test("should edit client name successfully", async ({ page }) => {
      const result = await createTestClient(page);

      // Navigate to edit page
      await page.goto(`/finance/clients/${result.id}/edit`);

      // Verify page title
      await expect(
        page.getByRole("heading", { name: "עריכת לקוח" })
      ).toBeVisible();

      // Change the name
      const nameInput = page.locator("#name");
      await nameInput.clear();
      const updatedName = `לקוח-מעודכן-${uid()}`;
      await nameInput.fill(updatedName);

      // Intercept the PATCH request and verify payload
      const requestPromise = page.waitForRequest(
        (req) =>
          req.url().includes(`/api/finance/clients/${result.id}`) &&
          req.method() === "PATCH"
      );

      await page.getByRole("button", { name: "שמור שינויים" }).click();
      const request = await requestPromise;
      const body = request.postDataJSON();
      expect(body.name).toBe(updatedName);

      // Should redirect back to client detail
      await expect(page).toHaveURL(
        new RegExp(`/finance/clients/${result.id}`)
      );

      // Verify the detail page shows the updated name
      await expect(
        page.getByRole("heading", { name: updatedName })
      ).toBeVisible();
    });
  });
});

// ═══════════════════════════════════════════════════════
// PAYMENTS MANAGEMENT
// ═══════════════════════════════════════════════════════
test.describe("Payments Management", () => {
  test.describe("Payments List Page", () => {
    test("should load payments list page", async ({ page }) => {
      const paymentsPage = new PaymentsPage(page);
      await paymentsPage.goto();
      await expect(paymentsPage.pageTitle).toBeVisible();
      await expect(paymentsPage.createButton).toBeVisible();
    });

    test("should display payment stat badges", async ({ page }) => {
      const paymentsPage = new PaymentsPage(page);
      await paymentsPage.goto();
      await expect(paymentsPage.statPending).toBeVisible();
      await expect(paymentsPage.statOverdue).toBeVisible();
      await expect(paymentsPage.statPaid).toBeVisible();
      await expect(paymentsPage.statTotalOutstanding).toBeVisible();
    });

  });

  test.describe("Create Payment", () => {
    test("should create payment with new client inline", async ({ page }) => {
      const createPage = new CreatePaymentPage(page);
      await createPage.goto();

      const paymentTitle = `תשלום-טסט-${uid()}`;
      const clientName = `לקוח-חדש-${uid()}`;

      await createPage.fillForm({
        title: paymentTitle,
        amount: "5000",
        dueDate: futureDateISO(),
        notes: "הערות תשלום",
      });

      await createPage.fillNewClient({
        name: clientName,
        email: "payment-client@test.com",
        phone: "052-9876543",
      });

      // Wait for payment creation
      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/finance/payments") &&
          resp.request().method() === "POST"
      );

      await createPage.submit();
      const response = await responsePromise;
      expect(response.status()).toBe(200);

      await expect(page.getByText("התשלום נוצר בהצלחה")).toBeVisible();
    });

    test("should create payment with existing finance client via ClientSelector", async ({
      page,
    }) => {
      // First create a finance client
      const client = await createTestClient(page);

      // Go to create payment page
      const createPage = new CreatePaymentPage(page);
      await createPage.goto();

      // Click the "בחר לקוח קיים" tab (default mode)
      // Open the client selector dropdown
      await page.getByText("בחר לקוח מטבלה קיימת").click();

      // Click the "לקוחות (כספים)" tab in the dropdown
      await page.getByRole("button", { name: "לקוחות (כספים)" }).click();

      // Search for the client
      const searchInput = page.getByPlaceholder(
        "חפש לקוח לפי שם, אימייל או חברה..."
      );
      await searchInput.fill(client.name);

      // Select the client from the results
      await page.getByText(client.name).click();

      // Fill payment details
      const paymentTitle = `תשלום-קיים-${uid()}`;
      await createPage.fillForm({
        title: paymentTitle,
        amount: "4000",
        dueDate: futureDateISO(),
      });

      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/finance/payments") &&
          resp.request().method() === "POST"
      );

      await createPage.submit();
      const response = await responsePromise;
      expect(response.status()).toBe(200);

      await expect(page.getByText("התשלום נוצר בהצלחה")).toBeVisible();
    });

    test("should auto-select client from URL parameter", async ({ page }) => {
      // Create a client first
      const client = await createTestClient(page);

      // Navigate to create payment with clientId param
      await page.goto(`/finance/payments/new?clientId=${client.id}`);

      // Verify the client name is shown as pre-selected
      await expect(page.getByText(client.name)).toBeVisible();

      // Submit button should be enabled (client is selected)
      await expect(
        page.getByRole("button", { name: "צור תשלום" })
      ).toBeEnabled();
    });

    test("should disable submit when no client selected", async ({ page }) => {
      const createPage = new CreatePaymentPage(page);
      await createPage.goto();

      // In existing client mode (default), submit should be disabled
      await expect(createPage.submitButton).toBeDisabled();
    });
  });

  test.describe("Edit Payment Modal", () => {
    let paymentTitle: string;

    test.beforeEach(async ({ page }) => {
      // Create a payment first
      paymentTitle = `תשלום-עריכה-${uid()}`;
      const createPage = new CreatePaymentPage(page);
      await createPage.goto();
      await createPage.fillNewClient({ name: `לקוח-${uid()}` });
      await createPage.fillForm({
        title: paymentTitle,
        amount: "3000",
        dueDate: futureDateISO(),
      });

      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/finance/payments") &&
          resp.request().method() === "POST"
      );
      await createPage.submit();
      await responsePromise;
      await page.goto("/finance/payments");
    });

    test("should open edit payment modal", async ({ page }) => {
      const paymentsPage = new PaymentsPage(page);
      await paymentsPage.getEditButton(paymentTitle).click();

      // Verify modal appears
      await expect(
        page.getByRole("heading", { name: "עריכת תשלום" })
      ).toBeVisible();
    });

    test("should edit payment title and amount with PATCH payload verification", async ({
      page,
    }) => {
      const paymentsPage = new PaymentsPage(page);
      await paymentsPage.getEditButton(paymentTitle).click();

      // Wait for modal heading
      const modalHeading = page.getByRole("heading", { name: "עריכת תשלום" });
      await expect(modalHeading).toBeVisible();

      // Scope inputs to the modal container
      const modalCard = getModalByHeading(page, "עריכת תשלום");
      const titleInput = modalCard.locator('input[type="text"]').first();
      await titleInput.clear();
      await titleInput.fill("תשלום מעודכן");

      const amountInput = modalCard.locator('input[type="number"]');
      await amountInput.clear();
      await amountInput.fill("7500");

      // Intercept PATCH and verify payload
      const requestPromise = page.waitForRequest(
        (req) =>
          req.url().includes("/api/finance/payments/") &&
          req.method() === "PATCH"
      );

      await page.getByRole("button", { name: /שמור שינויים/ }).click();

      const request = await requestPromise;
      const body = request.postDataJSON();
      expect(body.title).toBe("תשלום מעודכן");
      expect(body.amount).toBe(7500);

      await expect(page.getByText("התשלום עודכן בהצלחה")).toBeVisible();

      // Verify the table shows the updated title after router.refresh()
      await expect(paymentsPage.getPaymentRow("תשלום מעודכן")).toBeVisible();
    });

    test("should change payment status", async ({ page }) => {
      const paymentsPage = new PaymentsPage(page);
      await paymentsPage.getEditButton(paymentTitle).click();

      const modalHeading = page.getByRole("heading", { name: "עריכת תשלום" });
      await expect(modalHeading).toBeVisible();

      // Change status to paid
      const modalCard = getModalByHeading(page, "עריכת תשלום");
      const statusSelect = modalCard.locator("select");
      await statusSelect.selectOption("paid");

      const requestPromise = page.waitForRequest(
        (req) =>
          req.url().includes("/api/finance/payments/") &&
          req.method() === "PATCH"
      );

      await page.getByRole("button", { name: /שמור שינויים/ }).click();
      const request = await requestPromise;
      const body = request.postDataJSON();
      expect(body.status).toBe("paid");

      await expect(page.getByText("התשלום עודכן בהצלחה")).toBeVisible();

      // Verify the status badge changed to "שולם" in the table row
      await expect(
        paymentsPage.getPaymentRow(paymentTitle).getByText("שולם")
      ).toBeVisible();
    });

    test("should cancel edit payment modal without saving", async ({ page }) => {
      const paymentsPage = new PaymentsPage(page);
      await paymentsPage.getEditButton(paymentTitle).click();

      const modalHeading = page.getByRole("heading", { name: "עריכת תשלום" });
      await expect(modalHeading).toBeVisible();

      // Change the title
      const modalCard = getModalByHeading(page, "עריכת תשלום");
      const titleInput = modalCard.locator('input[type="text"]').first();
      await titleInput.clear();
      await titleInput.fill("תשלום-שונה-לא-נשמר");

      // Close modal via Cancel button
      await page.getByRole("button", { name: "ביטול" }).click();
      await expect(modalHeading).not.toBeVisible();

      // Re-open and verify original title persists
      await paymentsPage.getEditButton(paymentTitle).click();
      await expect(modalHeading).toBeVisible();
      const titleInputAgain = modalCard.locator('input[type="text"]').first();
      await expect(titleInputAgain).toHaveValue(paymentTitle);
    });

    test("should delete payment from edit modal", async ({ page }) => {
      const paymentsPage = new PaymentsPage(page);
      await paymentsPage.getEditButton(paymentTitle).click();

      const modalHeading = page.getByRole("heading", { name: "עריכת תשלום" });
      await expect(modalHeading).toBeVisible();

      // Click delete in modal
      const modalCard = getModalByHeading(page, "עריכת תשלום");
      await modalCard.getByRole("button", { name: /מחק/ }).click();

      // Confirmation dialog MUST appear
      const confirmButton = page
        .locator('[role="alertdialog"], [role="dialog"]')
        .getByRole("button", { name: /אישור|כן/ });
      await expect(confirmButton).toBeVisible();
      await confirmButton.click();

      await expect(page.getByText("התשלום נמחק בהצלחה")).toBeVisible();

      // Verify row removal
      await expect(paymentsPage.getPaymentRow(paymentTitle)).not.toBeVisible();
    });
  });
});

// ═══════════════════════════════════════════════════════
// RETAINERS MANAGEMENT
// ═══════════════════════════════════════════════════════
test.describe("Retainers Management", () => {
  test.describe("Retainers List Page", () => {
    test("should load retainers list page", async ({ page }) => {
      const retainersPage = new RetainersPage(page);
      await retainersPage.goto();
      await expect(retainersPage.pageTitle).toBeVisible();
      await expect(retainersPage.createButton).toBeVisible();
    });

    test("should display retainer status badges", async ({ page }) => {
      const retainersPage = new RetainersPage(page);
      await retainersPage.goto();
      await expect(retainersPage.statActive).toBeVisible();
      await expect(retainersPage.statPaused).toBeVisible();
      await expect(retainersPage.statCancelled).toBeVisible();
    });

  });

  test.describe("Create Retainer", () => {
    test("should create retainer with monthly frequency", async ({ page }) => {
      const createPage = new CreateRetainerPage(page);
      await createPage.goto();

      const retainerTitle = `ריטיינר-חודשי-${uid()}`;

      await createPage.fillNewClient({ name: `לקוח-ריטיינר-${uid()}` });
      await createPage.fillForm({
        title: retainerTitle,
        amount: "8000",
        frequency: "monthly",
        startDate: todayISO(),
      });

      // Retainer uses server action, so wait for navigation
      await createPage.submit();

      await expect(page.getByText("הריטיינר נוצר בהצלחה")).toBeVisible();
    });

    test("should create retainer with quarterly frequency", async ({
      page,
    }) => {
      const createPage = new CreateRetainerPage(page);
      await createPage.goto();

      await createPage.fillNewClient({ name: `לקוח-רבעוני-${uid()}` });
      await createPage.fillForm({
        title: `ריטיינר-רבעוני-${uid()}`,
        amount: "15000",
        frequency: "quarterly",
        startDate: todayISO(),
      });

      await createPage.submit();
      await expect(page.getByText("הריטיינר נוצר בהצלחה")).toBeVisible();
    });

    test("should create retainer with annually frequency", async ({
      page,
    }) => {
      const createPage = new CreateRetainerPage(page);
      await createPage.goto();

      await createPage.fillNewClient({ name: `לקוח-שנתי-${uid()}` });
      await createPage.fillForm({
        title: `ריטיינר-שנתי-${uid()}`,
        amount: "50000",
        frequency: "annually",
        startDate: todayISO(),
      });

      await createPage.submit();
      await expect(page.getByText("הריטיינר נוצר בהצלחה")).toBeVisible();
    });

    test("should select prepaid payment mode", async ({ page }) => {
      const createPage = new CreateRetainerPage(page);
      await createPage.goto();

      await createPage.prepaidRadio.check();
      await expect(createPage.prepaidRadio).toBeChecked();
      await expect(createPage.postpaidRadio).not.toBeChecked();
    });

    test("should have postpaid payment mode as default", async ({ page }) => {
      const createPage = new CreateRetainerPage(page);
      await createPage.goto();

      await expect(createPage.postpaidRadio).toBeChecked();
    });

    test("should create retainer with existing finance client", async ({
      page,
    }) => {
      const client = await createTestClient(page);

      const createPage = new CreateRetainerPage(page);
      await createPage.goto();

      // Open client selector dropdown
      await page.getByText("בחר לקוח מטבלה קיימת").click();

      // Click "לקוחות (כספים)" tab
      await page.getByRole("button", { name: "לקוחות (כספים)" }).click();

      // Search and select client
      const searchInput = page.getByPlaceholder(
        "חפש לקוח לפי שם, אימייל או חברה..."
      );
      await searchInput.fill(client.name);
      await page.getByText(client.name).click();

      // Fill retainer details
      await createPage.fillForm({
        title: `ריטיינר-קיים-${uid()}`,
        amount: "7000",
        startDate: todayISO(),
      });

      await createPage.submit();
      await expect(page.getByText("הריטיינר נוצר בהצלחה")).toBeVisible();
    });

    test("should auto-select client from URL parameter", async ({ page }) => {
      const client = await createTestClient(page);

      // Navigate to create retainer with clientId param
      await page.goto(`/finance/retainers/new?clientId=${client.id}`);

      // Verify the client name is shown as pre-selected
      await expect(page.getByText(client.name)).toBeVisible();

      // Submit button should be enabled (client is selected)
      await expect(
        page.getByRole("button", { name: "צור ריטיינר" })
      ).toBeEnabled();
    });

    test("should show error when no client selected", async ({ page }) => {
      const createPage = new CreateRetainerPage(page);
      await createPage.goto();

      await createPage.fillForm({
        title: "ריטיינר ללא לקוח",
        amount: "5000",
        startDate: todayISO(),
      });

      await createPage.submit();
      await expect(createPage.clientError).toBeVisible();
    });
  });

  test.describe("Edit Retainer Modal", () => {
    let retainerTitle: string;

    test.beforeEach(async ({ page }) => {
      retainerTitle = `ריטיינר-עריכה-${uid()}`;
      const createPage = new CreateRetainerPage(page);
      await createPage.goto();
      await createPage.fillNewClient({ name: `לקוח-${uid()}` });
      await createPage.fillForm({
        title: retainerTitle,
        amount: "6000",
        startDate: todayISO(),
      });
      await createPage.submit();
      await expect(page.getByText("הריטיינר נוצר בהצלחה")).toBeVisible();
      await page.goto("/finance/retainers");
    });

    test("should edit retainer via modal", async ({ page }) => {
      const retainersPage = new RetainersPage(page);
      await retainersPage.getEditButton(retainerTitle).click();

      const modalHeading = page.getByRole("heading", {
        name: "עריכת ריטיינר",
      });
      await expect(modalHeading).toBeVisible();

      // Scope inputs to the modal container
      const modalCard = getModalByHeading(page, "עריכת ריטיינר");
      const titleInput = modalCard.locator('input[type="text"]').first();
      await titleInput.clear();
      await titleInput.fill("ריטיינר מעודכן");

      const requestPromise = page.waitForRequest(
        (req) =>
          req.url().includes("/api/finance/retainers/") &&
          req.method() === "PATCH"
      );

      await page.getByRole("button", { name: /שמור שינויים/ }).click();
      const request = await requestPromise;
      const body = request.postDataJSON();
      expect(body.title).toBe("ריטיינר מעודכן");

      await expect(page.getByText("הריטיינר עודכן בהצלחה")).toBeVisible();

      // Verify the table shows the updated title after router.refresh()
      await expect(retainersPage.getRetainerRow("ריטיינר מעודכן")).toBeVisible();
    });

    test("should change retainer status to paused", async ({ page }) => {
      const retainersPage = new RetainersPage(page);
      await retainersPage.getEditButton(retainerTitle).click();

      const modalHeading = page.getByRole("heading", {
        name: "עריכת ריטיינר",
      });
      await expect(modalHeading).toBeVisible();

      const modalCard = getModalByHeading(page, "עריכת ריטיינר");
      // Status is the 2nd select in the modal (1st is frequency)
      const statusSelect = modalCard.locator("select").nth(1);
      await statusSelect.selectOption("paused");

      const requestPromise = page.waitForRequest(
        (req) =>
          req.url().includes("/api/finance/retainers/") &&
          req.method() === "PATCH"
      );

      await page.getByRole("button", { name: /שמור שינויים/ }).click();
      const request = await requestPromise;
      const body = request.postDataJSON();
      expect(body.status).toBe("paused");

      await expect(page.getByText("הריטיינר עודכן בהצלחה")).toBeVisible();

      // Verify the status badge changed to "מושהה" in the table row
      await expect(
        retainersPage.getRetainerRow(retainerTitle).getByText("מושהה")
      ).toBeVisible();
    });

    test("should cancel edit retainer modal without saving", async ({ page }) => {
      const retainersPage = new RetainersPage(page);
      await retainersPage.getEditButton(retainerTitle).click();

      const modalHeading = page.getByRole("heading", {
        name: "עריכת ריטיינר",
      });
      await expect(modalHeading).toBeVisible();

      // Change the title
      const modalCard = getModalByHeading(page, "עריכת ריטיינר");
      const titleInput = modalCard.locator('input[type="text"]').first();
      await titleInput.clear();
      await titleInput.fill("ריטיינר-שונה-לא-נשמר");

      // Close modal via Cancel button
      await page.getByRole("button", { name: "ביטול" }).click();
      await expect(modalHeading).not.toBeVisible();

      // Re-open and verify original title persists
      await retainersPage.getEditButton(retainerTitle).click();
      await expect(modalHeading).toBeVisible();
      const titleInputAgain = modalCard.locator('input[type="text"]').first();
      await expect(titleInputAgain).toHaveValue(retainerTitle);
    });

    test("should delete retainer from edit modal", async ({ page }) => {
      const retainersPage = new RetainersPage(page);
      await retainersPage.getEditButton(retainerTitle).click();

      const modalHeading = page.getByRole("heading", {
        name: "עריכת ריטיינר",
      });
      await expect(modalHeading).toBeVisible();

      // Click delete in modal
      const modalCard = getModalByHeading(page, "עריכת ריטיינר");
      await modalCard.getByRole("button", { name: /מחק/ }).click();

      // Simple confirm dialog (showConfirm, not showDestructiveConfirm)
      const confirmButton = page
        .locator('[role="alertdialog"], [role="dialog"]')
        .getByRole("button", { name: /אישור|כן|מחק/ });
      await expect(confirmButton).toBeVisible();
      await confirmButton.click();

      await expect(page.getByText("הריטיינר נמחק בהצלחה")).toBeVisible();

      // Verify row removal
      await expect(retainersPage.getRetainerRow(retainerTitle)).not.toBeVisible();
    });
  });

  test.describe("Delete Retainer", () => {
    let retainerTitle: string;

    test.beforeEach(async ({ page }) => {
      retainerTitle = `ריטיינר-מחיקה-${uid()}`;
      const createPage = new CreateRetainerPage(page);
      await createPage.goto();
      await createPage.fillNewClient({ name: `לקוח-${uid()}` });
      await createPage.fillForm({
        title: retainerTitle,
        amount: "6000",
        startDate: todayISO(),
      });
      await createPage.submit();
      await expect(page.getByText("הריטיינר נוצר בהצלחה")).toBeVisible();
      await page.goto("/finance/retainers");
    });

    test("should delete retainer", async ({ page }) => {
      const retainersPage = new RetainersPage(page);
      await retainersPage.getDeleteButton(retainerTitle).click();

      // Confirmation dialog MUST appear
      const confirmInput = page.getByLabel("הקלד ביטוי אישור");
      await expect(confirmInput).toBeVisible();
      await confirmInput.fill("מחק");

      const confirmButton = page
        .locator('[role="alertdialog"], [role="dialog"]')
        .getByRole("button", { name: /מחק|אישור/ });
      await confirmButton.click();

      await expect(page.getByText("הריטיינר נמחק בהצלחה")).toBeVisible();

      // Verify row removal
      await expect(retainersPage.getRetainerRow(retainerTitle)).not.toBeVisible();
    });
  });

  test.describe("Retainer Payment Recording", () => {
    let retainerTitle: string;

    test.beforeEach(async ({ page }) => {
      retainerTitle = `ריטיינר-תשלום-${uid()}`;
      const createPage = new CreateRetainerPage(page);
      await createPage.goto();
      await createPage.fillNewClient({ name: `לקוח-${uid()}` });

      // Use a past start date + prepaid mode to trigger overdue state
      const pastDate = new Date();
      pastDate.setMonth(pastDate.getMonth() - 2);
      const pastISO = pastDate.toISOString().split("T")[0];

      await createPage.fillForm({
        title: retainerTitle,
        amount: "5000",
        startDate: pastISO,
        paymentMode: "prepaid",
      });
      await createPage.submit();
      await expect(page.getByText("הריטיינר נוצר בהצלחה")).toBeVisible();
      await page.goto("/finance/retainers");
    });

    test("should record retainer payment via סמן כשולם button", async ({
      page,
    }) => {
      const retainersPage = new RetainersPage(page);
      const row = retainersPage.getRetainerRow(retainerTitle);

      // Click "סמן כשולם" in the retainer row
      await row.getByText("סמן כשולם").click();

      // Verify payment modal opens
      await expect(
        page.getByRole("heading", { name: "אישור תשלום ריטיינר" })
      ).toBeVisible();

      // Verify confirm button and click
      const confirmButton = page.getByRole("button", { name: /אשר תשלום/ });
      await expect(confirmButton).toBeVisible();
      await confirmButton.click();

      // Verify success toast (server action, no API route to intercept)
      await expect(
        page.getByText(/התשלום נקלט בהצלחה/)
      ).toBeVisible({ timeout: 10000 });
    });
  });
});

// ═══════════════════════════════════════════════════════
// AUTHENTICATION & AUTHORIZATION
// ═══════════════════════════════════════════════════════
test.describe("Authentication & Authorization", () => {
  test("should redirect unauthenticated user to login", async ({
    browser,
  }) => {
    // Create a fresh context without stored auth
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/finance");
    await expect(page).toHaveURL(/\/login|\/$/);

    await context.close();
  });

  test("should show toast and redirect on 401 during API call", async ({
    page,
  }) => {
    // Navigate to create client form (uses client-side apiFetch on submit)
    const createPage = new CreateClientPage(page);
    await createPage.goto();

    // Fill in the form
    await createPage.fillForm({ name: `לקוח-401-${uid()}` });

    // Mock a 401 response on the POST to clients API
    await page.route("**/api/finance/clients", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unauthorized" }),
        });
      } else {
        await route.continue();
      }
    });

    // Submit the form — triggers a client-side apiFetch POST
    await createPage.submit();

    // Verify the session expiry toast appears
    await expect(
      page.getByText("פג תוקף ההתחברות, מעביר לדף ההתחברות...")
    ).toBeVisible({ timeout: 5000 });

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════════════
// API INTEGRATION
// ═══════════════════════════════════════════════════════
test.describe("API Integration", () => {
  test("should send correct payload when creating client", async ({
    page,
  }) => {
    const createPage = new CreateClientPage(page);
    await createPage.goto();

    const clientName = `לקוח-API-${uid()}`;

    await createPage.fillForm({
      name: clientName,
      email: "api-test@example.com",
      phone: "054-1111111",
      company: "חברת API",
      notes: "הערות API",
    });

    const requestPromise = page.waitForRequest(
      (req) =>
        req.url().includes("/api/finance/clients") &&
        req.method() === "POST"
    );

    await createPage.submit();

    const request = await requestPromise;
    const body = request.postDataJSON();

    expect(body.name).toBe(clientName);
    expect(body.email).toBe("api-test@example.com");
    expect(body.phone).toBe("054-1111111");
    expect(body.businessName).toBe("חברת API");
    expect(body.notes).toBe("הערות API");
  });

  test("should send correct payload when creating payment", async ({
    page,
  }) => {
    const createPage = new CreatePaymentPage(page);
    await createPage.goto();

    const paymentTitle = `תשלום-API-${uid()}`;
    const dueDate = futureDateISO();

    await createPage.fillNewClient({ name: `לקוח-${uid()}` });
    await createPage.fillForm({
      title: paymentTitle,
      amount: "2500",
      dueDate,
    });

    // Intercept the payment POST (not the client POST)
    const requestPromise = page.waitForRequest(
      (req) =>
        req.url().includes("/api/finance/payments") &&
        req.method() === "POST"
    );

    await createPage.submit();

    const request = await requestPromise;
    const body = request.postDataJSON();

    expect(body.title).toBe(paymentTitle);
    expect(body.amount).toBe(2500);
    expect(body.dueDate).toBe(dueDate);
    expect(body.clientId).toBeDefined();
  });

  test("should include X-Requested-With header on API calls", async ({
    page,
  }) => {
    const createPage = new CreateClientPage(page);
    await createPage.goto();

    await createPage.fillForm({ name: `לקוח-header-${uid()}` });

    const requestPromise = page.waitForRequest(
      (req) =>
        req.url().includes("/api/finance/clients") &&
        req.method() === "POST"
    );

    await createPage.submit();

    const request = await requestPromise;
    expect(request.headers()["x-requested-with"]).toBe("XMLHttpRequest");
  });

  test("should show error state on server 500 for client creation", async ({
    page,
  }) => {
    const createPage = new CreateClientPage(page);
    await createPage.goto();

    // Mock 500 response
    await page.route("**/api/finance/clients", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
      } else {
        await route.continue();
      }
    });

    await createPage.fillForm({ name: `לקוח-שגיאה-${uid()}` });
    await createPage.submit();

    // Should show an error toast
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: /שגיאה|נכשל|Failed/ })
    ).toBeVisible({ timeout: 5000 });
  });

  test("should show error state on server 500 for payment creation", async ({
    page,
  }) => {
    const createPage = new CreatePaymentPage(page);
    await createPage.goto();

    await createPage.fillNewClient({ name: `לקוח-${uid()}` });
    await createPage.fillForm({
      title: `תשלום-שגיאה-${uid()}`,
      amount: "1000",
      dueDate: futureDateISO(),
    });

    // Mock 500 on payment endpoint
    await page.route("**/api/finance/payments", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
      } else {
        await route.continue();
      }
    });

    await createPage.submit();

    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: /שגיאה|נכשל|Failed/ })
    ).toBeVisible({ timeout: 5000 });
  });

  test("should show error state on server 500 for retainer PATCH", async ({
    page,
  }) => {
    // Create a retainer first
    const retainerTitle = `ריטיינר-500-${uid()}`;
    const createPage = new CreateRetainerPage(page);
    await createPage.goto();
    await createPage.fillNewClient({ name: `לקוח-${uid()}` });
    await createPage.fillForm({
      title: retainerTitle,
      amount: "5000",
      startDate: todayISO(),
    });
    await createPage.submit();
    await expect(page.getByText("הריטיינר נוצר בהצלחה")).toBeVisible();

    // Navigate to retainers list
    await page.goto("/finance/retainers");
    const retainersPage = new RetainersPage(page);

    // Open edit modal
    await retainersPage.getEditButton(retainerTitle).click();
    await expect(
      page.getByRole("heading", { name: "עריכת ריטיינר" })
    ).toBeVisible();

    // Mock 500 on retainer PATCH
    await page.route("**/api/finance/retainers/*", async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByRole("button", { name: /שמור שינויים/ }).click();

    // Should show an error toast
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: /שגיאה|נכשל|Failed/ })
    ).toBeVisible({ timeout: 5000 });
  });

  test("should show error state on server 500 for payment PATCH", async ({
    page,
  }) => {
    // Create a payment first
    const paymentTitle = `תשלום-500-${uid()}`;
    const createPage = new CreatePaymentPage(page);
    await createPage.goto();
    await createPage.fillNewClient({ name: `לקוח-${uid()}` });
    await createPage.fillForm({
      title: paymentTitle,
      amount: "3000",
      dueDate: futureDateISO(),
    });

    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/finance/payments") &&
        resp.request().method() === "POST"
    );
    await createPage.submit();
    await responsePromise;

    // Navigate to payments list
    await page.goto("/finance/payments");
    const paymentsPage = new PaymentsPage(page);

    // Open edit modal
    await paymentsPage.getEditButton(paymentTitle).click();
    await expect(
      page.getByRole("heading", { name: "עריכת תשלום" })
    ).toBeVisible();

    // Mock 500 on payment PATCH
    await page.route("**/api/finance/payments/*", async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByRole("button", { name: /שמור שינויים/ }).click();

    // EditPaymentModal uses toast.error() on PATCH failure
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: /שגיאה|נכשל|Failed/ })
    ).toBeVisible({ timeout: 5000 });
  });

  test("should show error toast on server 500 for payment DELETE", async ({
    page,
  }) => {
    // Create a payment first
    const paymentTitle = `תשלום-del500-${uid()}`;
    const createPage = new CreatePaymentPage(page);
    await createPage.goto();
    await createPage.fillNewClient({ name: `לקוח-${uid()}` });
    await createPage.fillForm({
      title: paymentTitle,
      amount: "2000",
      dueDate: futureDateISO(),
    });

    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/finance/payments") &&
        resp.request().method() === "POST"
    );
    await createPage.submit();
    await responsePromise;

    // Navigate to payments list
    await page.goto("/finance/payments");
    const paymentsPage = new PaymentsPage(page);

    // Open edit modal
    await paymentsPage.getEditButton(paymentTitle).click();
    await expect(
      page.getByRole("heading", { name: "עריכת תשלום" })
    ).toBeVisible();

    // Mock 500 on payment DELETE
    await page.route("**/api/finance/payments/*", async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
      } else {
        await route.continue();
      }
    });

    // Click delete in modal
    const modalCard = getModalByHeading(page, "עריכת תשלום");
    await modalCard.getByRole("button", { name: /מחק/ }).click();

    // Confirm deletion in simple dialog
    const confirmButton = page
      .locator('[role="alertdialog"], [role="dialog"]')
      .getByRole("button", { name: /אישור|כן/ });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // EditPaymentModal uses toast.error() on DELETE failure
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: /שגיאה|נכשל|Failed/ })
    ).toBeVisible({ timeout: 5000 });

    // Payment should still be in the table (not deleted)
    await page.getByRole("button", { name: "ביטול" }).click();
    await expect(paymentsPage.getPaymentRow(paymentTitle)).toBeVisible();
  });

  test("should show error state on server 500 for client PATCH", async ({
    page,
  }) => {
    const client = await createTestClient(page);
    await page.goto(`/finance/clients/${client.id}/edit`);

    await expect(
      page.getByRole("heading", { name: "עריכת לקוח" })
    ).toBeVisible();

    // Mock 500 on client PATCH
    await page.route(`**/api/finance/clients/${client.id}`, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByRole("button", { name: "שמור שינויים" }).click();

    // Edit client page shows inline error, not a toast
    await expect(page.getByText("נכשל בעדכון לקוח")).toBeVisible({
      timeout: 5000,
    });
  });

  test("should show error toast on server 500 for client DELETE", async ({
    page,
  }) => {
    const client = await createTestClient(page);

    // Mock 500 on client DELETE
    await page.route(`**/api/finance/clients/${client.id}`, async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
      } else {
        await route.continue();
      }
    });

    const clientsPage = new ClientsPage(page);

    // Click delete button
    await clientsPage.getDeleteButton(client.name).click();

    // Destructive confirm dialog (requires typing "מחק")
    const confirmInput = page.getByLabel("הקלד ביטוי אישור");
    await expect(confirmInput).toBeVisible();
    await confirmInput.fill("מחק");

    const confirmButton = page
      .locator('[role="alertdialog"], [role="dialog"]')
      .getByRole("button", { name: /מחק|אישור/ });
    await confirmButton.click();

    // ClientsTable uses toast.error() on DELETE failure
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: /שגיאה|נכשל|Failed/ })
    ).toBeVisible({ timeout: 5000 });

    // Client should still be in the table
    await expect(clientsPage.getClientRow(client.name)).toBeVisible();
  });

  test("should show loading state during form submission", async ({
    page,
  }) => {
    const createPage = new CreateClientPage(page);
    await createPage.goto();

    await createPage.fillForm({ name: `לקוח-loading-${uid()}` });

    // Slow down the network
    await page.route("**/api/finance/clients", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((r) => setTimeout(r, 2000));
        await route.continue();
      } else {
        await route.continue();
      }
    });

    await createPage.submit();

    // Verify loading state
    await expect(page.getByRole("button", { name: "יוצר..." })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════
// INCOME & EXPENSES PAGE
// ═══════════════════════════════════════════════════════
test.describe("Income & Expenses Page", () => {
  test("should load income-expenses page with heading and stat cards", async ({
    page,
  }) => {
    await page.goto("/finance/income-expenses");

    await expect(
      page.getByRole("heading", { name: "הכנסות והוצאות" })
    ).toBeVisible();

    // Verify stat card labels
    await expect(page.getByText("סה״כ הכנסות")).toBeVisible();
    await expect(page.getByText("סה״כ הוצאות")).toBeVisible();
    await expect(page.getByText("רווח נקי")).toBeVisible();

    // Verify back link
    await expect(page.getByText("חזרה למרכז הפיננסי")).toBeVisible();

    // Verify info alert about sync
    await expect(page.getByText("סנכרון נתונים")).toBeVisible();

    // Verify action button
    await expect(page.getByText("איסוף נתונים דינמי")).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════
// GOALS PAGE
// ═══════════════════════════════════════════════════════
test.describe("Goals Page", () => {
  test("should load goals page with heading, create button, and stat cards", async ({
    page,
  }) => {
    await page.goto("/finance/goals");

    await expect(
      page.getByRole("heading", { name: "תכנון יעדים" })
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "יעד חדש" })
    ).toBeVisible();

    // Verify stat cards
    await expect(page.getByText("יעדים פעילים")).toBeVisible();
    await expect(page.getByText("במסלול להצלחה")).toBeVisible();

    // Verify archive link
    await expect(
      page.getByRole("link", { name: "ארכיון יעדים" })
    ).toBeVisible();

    // Verify goals board heading
    await expect(
      page.getByRole("heading", { name: "לוח היעדים שלך" })
    ).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════
// FIXED EXPENSES PAGE
// ═══════════════════════════════════════════════════════
test.describe("Fixed Expenses Page", () => {
  test("should load fixed expenses page with heading and create button", async ({ page }) => {
    await page.goto("/finance/fixed-expenses");

    await expect(
      page.getByRole("heading", { name: /הוצאות קבועות/ })
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "הוסף הוצאה חדשה" })
    ).toBeVisible();

    // Verify info cards
    await expect(page.getByText("סך הכל חודשי (משוער)")).toBeVisible();
    await expect(page.getByText("הוצאות פעילות")).toBeVisible();

    // Verify help alert
    await expect(
      page.getByText(/כל הוצאה קבועה תתווסף לדו"ח הוצאות והכנסות/)
    ).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════
// RESPONSIVE DESIGN
// ═══════════════════════════════════════════════════════
test.describe("Responsive Design", () => {
  test("should display dashboard correctly on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const dashboard = new FinanceDashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.pageTitle).toBeVisible();
    await expect(dashboard.getNavCard("לקוחות")).toBeVisible();
    await expect(dashboard.getNavCard("ריטיינרים")).toBeVisible();
    await expect(dashboard.getNavCard("תשלומים")).toBeVisible();
    await expect(dashboard.getNavCard("הוצאות קבועות")).toBeVisible();
  });

  test("should display dashboard correctly on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const dashboard = new FinanceDashboardPage(page);
    await dashboard.goto();

    // All elements should still be visible
    await expect(dashboard.pageTitle).toBeVisible();
    await expect(dashboard.newPaymentButton).toBeVisible();
    await expect(dashboard.getNavCard("לקוחות")).toBeVisible();
    await expect(dashboard.getNavCard("ריטיינרים")).toBeVisible();
    await expect(dashboard.getNavCard("תשלומים")).toBeVisible();
    await expect(dashboard.getNavCard("הוצאות קבועות")).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════
test.describe("Edge Cases", () => {
  test("should handle Hebrew text in all form fields", async ({ page }) => {
    const createPage = new CreateClientPage(page);
    await createPage.goto();

    const clientName = `ישראל ישראלי ${uid()}`;

    await createPage.fillForm({
      name: clientName,
      company: "חברת הייטק בע״מ",
      email: "israel@example.com",
      phone: "050-1234567",
      notes: "הערות בעברית עם תווים מיוחדים: אבגדהוזחטי",
    });

    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/finance/clients") &&
        resp.request().method() === "POST"
    );

    await createPage.submit();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    await expect(page.getByText("הלקוח נוצר בהצלחה")).toBeVisible();
  });

  test("should handle special characters in notes", async ({
    page,
  }) => {
    const createPage = new CreateClientPage(page);
    await createPage.goto();

    await createPage.fillForm({
      name: `לקוח-מיוחד-${uid()}`,
      notes: "אבג 123 !@# test",
    });

    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/finance/clients") &&
        resp.request().method() === "POST"
    );

    await createPage.submit();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    await expect(page.getByText("הלקוח נוצר בהצלחה")).toBeVisible();
  });

  test("should handle page refresh and maintain URL", async ({ page }) => {
    await page.goto("/finance/clients");
    await expect(page).toHaveURL(/\/finance\/clients/);

    await page.reload();
    await expect(page).toHaveURL(/\/finance\/clients/);

    const clientsPage = new ClientsPage(page);
    await expect(clientsPage.pageTitle).toBeVisible();
  });

  test("should handle back button navigation", async ({ page }) => {
    // Dashboard → Clients → New Client → Cancel → Back to clients
    await page.goto("/finance");
    await page.getByRole("link").filter({ hasText: "לקוחות" }).click();
    await expect(page).toHaveURL(/\/finance\/clients/);

    const clientsPage = new ClientsPage(page);
    await clientsPage.createButton.click();
    await expect(page).toHaveURL(/\/finance\/clients\/new/);

    // Click cancel
    await page.getByRole("button", { name: "ביטול" }).click();
    await expect(page).toHaveURL(/\/finance\/clients/);
  });

  test("should prevent double submission", async ({ page }) => {
    const createPage = new CreateClientPage(page);
    await createPage.goto();

    await createPage.fillForm({ name: `לקוח-כפול-${uid()}` });

    // Slow down the API
    await page.route("**/api/finance/clients", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((r) => setTimeout(r, 2000));
        await route.continue();
      } else {
        await route.continue();
      }
    });

    await createPage.submit();

    // Button should show loading state and be disabled
    const loadingButton = page.getByRole("button", { name: "יוצר..." });
    await expect(loadingButton).toBeVisible();
    await expect(loadingButton).toBeDisabled();
  });
});
