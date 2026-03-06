/**
 * Playwright global setup: seeds test company, users, tasks, and task sheets.
 * Generates storageState files for admin, basic, and no-tasks users.
 */
import { type FullConfig } from "@playwright/test";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

// Load test env so SESSION_SECRET and DATABASE_URL are available
dotenv.config({ path: path.resolve(__dirname, "../../../.env.test") });

const AUTH_DIR = path.join(__dirname, "..", ".auth");

export const STORAGE_ADMIN = path.join(AUTH_DIR, "tasks-admin.json");
export const STORAGE_BASIC = path.join(AUTH_DIR, "tasks-basic.json");
export const STORAGE_NO_TASKS = path.join(AUTH_DIR, "tasks-no-tasks.json");

/** Build a storageState JSON with auth_token cookie */
function buildStorageState(token: string, baseURL: string) {
  const url = new URL(baseURL);
  return {
    cookies: [
      {
        name: "auth_token",
        value: token,
        domain: url.hostname,
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
        expires: Math.floor(Date.now() / 1000) + 86_400,
      },
    ],
    origins: [],
  };
}

async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects[0]?.use?.baseURL || "http://localhost:3000";

  // Dynamic imports to ensure env is loaded
  const { prisma } = require("../../../lib/prisma");
  const { signUserId } = require("../../../lib/auth");

  // Ensure .auth dir exists
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  // --- Seed company (with business settings for quotes) ---
  const company = await prisma.company.create({
    data: {
      name: "E2E Test Company",
      slug: `e2e-test-${Date.now()}`,
      businessType: "licensed",
      taxId: "123456789",
      businessAddress: "רחוב הבדיקה 1, תל אביב",
      businessEmail: "test@e2e-company.com",
      businessWebsite: "https://e2e-company.com",
    },
  });

  // --- Seed users ---
  const adminUser = await prisma.user.create({
    data: {
      companyId: company.id,
      name: "E2E Admin",
      email: `e2e-admin-${Date.now()}@test.com`,
      passwordHash: "not-a-real-hash",
      role: "admin",
      permissions: {},
      tablePermissions: {},
      allowedWriteTableIds: [],
    },
  });

  const basicUser = await prisma.user.create({
    data: {
      companyId: company.id,
      name: "E2E Basic User",
      email: `e2e-basic-${Date.now()}@test.com`,
      passwordHash: "not-a-real-hash",
      role: "basic",
      permissions: { canViewTasks: true },
      tablePermissions: {},
      allowedWriteTableIds: [],
    },
  });

  const noTasksUser = await prisma.user.create({
    data: {
      companyId: company.id,
      name: "E2E No Tasks User",
      email: `e2e-notasks-${Date.now()}@test.com`,
      passwordHash: "not-a-real-hash",
      role: "basic",
      permissions: {},
      tablePermissions: {},
      allowedWriteTableIds: [],
    },
  });

  // --- Generate auth tokens and save storage states ---
  const adminToken = signUserId(adminUser.id);
  const basicToken = signUserId(basicUser.id);
  const noTasksToken = signUserId(noTasksUser.id);

  const adminState = JSON.stringify(buildStorageState(adminToken, baseURL), null, 2);
  const basicState = JSON.stringify(buildStorageState(basicToken, baseURL), null, 2);
  const noTasksState = JSON.stringify(buildStorageState(noTasksToken, baseURL), null, 2);

  // Write both naming conventions (tasks-*.json for task tests, *.json for config default)
  fs.writeFileSync(STORAGE_ADMIN, adminState);
  fs.writeFileSync(STORAGE_BASIC, basicState);
  fs.writeFileSync(STORAGE_NO_TASKS, noTasksState);
  fs.writeFileSync(path.join(AUTH_DIR, "admin.json"), adminState);
  fs.writeFileSync(path.join(AUTH_DIR, "basic.json"), basicState);
  fs.writeFileSync(path.join(AUTH_DIR, "no-tasks.json"), noTasksState);

  // --- Seed sample tasks across different statuses ---
  const statuses = [
    "todo",
    "in_progress",
    "waiting_client",
    "on_hold",
    "completed_month",
    "done",
  ] as const;
  const priorities = ["low", "medium", "high"] as const;

  const taskData = [
    { title: "משימת בדיקה 1", status: "todo", priority: "high", tags: ["עיצוב", "דחוף"] },
    { title: "משימת בדיקה 2", status: "todo", priority: "low", tags: ["פיתוח"] },
    { title: "משימה בטיפול", status: "in_progress", priority: "medium", tags: [] },
    { title: "ממתין לאישור", status: "waiting_client", priority: "high", tags: ["דחוף"] },
    { title: "משימה בהשהייה", status: "on_hold", priority: "low", tags: [] },
    { title: "בוצע החודש", status: "completed_month", priority: "medium", tags: ["עיצוב"] },
    { title: "משימה שהושלמה", status: "done", priority: "high", tags: ["פיתוח", "עיצוב"] },
    { title: "משימה שהושלמה 2", status: "done", priority: "low", tags: [] },
  ];

  for (const task of taskData) {
    await prisma.task.create({
      data: {
        companyId: company.id,
        title: task.title,
        description: `תיאור של ${task.title}`,
        status: task.status as any,
        priority: task.priority as any,
        tags: task.tags,
        assigneeId: adminUser.id,
        creatorId: adminUser.id,
        dueDate: new Date(),
      },
    });
  }

  // --- Seed task sheets ---
  const dailySheet = await prisma.taskSheet.create({
    data: {
      companyId: company.id,
      title: "דף משימות יומי לבדיקה",
      description: "דף משימות לבדיקות E2E",
      type: "DAILY",
      assigneeId: adminUser.id,
      createdById: adminUser.id,
      isActive: true,
      validFrom: new Date("2020-01-01"),
    },
  });

  // Add items to the sheet
  await prisma.taskSheetItem.createMany({
    data: [
      {
        sheetId: dailySheet.id,
        title: "פריט ראשון",
        priority: "NORMAL",
        order: 0,
        isCompleted: false,
      },
      {
        sheetId: dailySheet.id,
        title: "פריט שני",
        priority: "URGENT",
        order: 1,
        isCompleted: true,
        completedAt: new Date(),
      },
      {
        sheetId: dailySheet.id,
        title: "פריט שלישי",
        priority: "HIGH",
        order: 2,
        isCompleted: false,
      },
    ],
  });

  // --- Seed automation folders ---
  const autoFolder = await prisma.viewFolder.create({
    data: {
      companyId: company.id,
      name: "תיקיית בדיקה",
      type: "AUTOMATION",
    },
  });

  await prisma.viewFolder.create({
    data: {
      companyId: company.id,
      name: "תיקייה ריקה",
      type: "AUTOMATION",
    },
  });

  // --- Seed automation rules ---
  const automationData = [
    {
      name: "אוטומציית בדיקה 1",
      triggerType: "TASK_STATUS_CHANGE" as const,
      triggerConfig: { fromStatus: "todo", toStatus: "in_progress" },
      actionType: "SEND_NOTIFICATION" as const,
      actionConfig: { recipientId: adminUser.id, message: "משימה עברה לבטיפול" },
      isActive: true,
      folderId: autoFolder.id,
    },
    {
      name: "אוטומציית בדיקה כבויה",
      triggerType: "NEW_RECORD" as const,
      triggerConfig: {},
      actionType: "CREATE_TASK" as const,
      actionConfig: { title: "משימה חדשה", assigneeId: adminUser.id },
      isActive: false,
      folderId: null,
    },
    {
      name: "אוטומציה למחיקה",
      triggerType: "TASK_STATUS_CHANGE" as const,
      triggerConfig: { fromStatus: "any", toStatus: "done" },
      actionType: "SEND_NOTIFICATION" as const,
      actionConfig: { recipientId: adminUser.id, message: "הושלם" },
      isActive: true,
      folderId: null,
    },
    {
      name: "אוטומציה עם שם ארוך מאוד שצריך להיות יותר משלושים תווים",
      triggerType: "RECORD_FIELD_CHANGE" as const,
      triggerConfig: {},
      actionType: "WEBHOOK" as const,
      actionConfig: { url: "https://example.com", method: "POST" },
      isActive: true,
      folderId: null,
    },
    {
      name: "אוטומציית יומן",
      triggerType: "EVENT_TIME" as const,
      triggerConfig: {},
      actionType: "SEND_NOTIFICATION" as const,
      actionConfig: { recipientId: adminUser.id, message: "אירוע" },
      isActive: true,
      folderId: null,
    },
    {
      name: "אוטומציית SLA",
      triggerType: "SLA_BREACH" as const,
      triggerConfig: { breachType: "RESPONSE", priority: "HIGH" },
      actionType: "SEND_NOTIFICATION" as const,
      actionConfig: { recipientId: adminUser.id, message: "חריגת SLA" },
      isActive: true,
      folderId: null,
    },
    {
      name: "אוטומציית אירועים מרובים",
      triggerType: "MULTI_EVENT_DURATION" as const,
      triggerConfig: {},
      actionType: "SEND_NOTIFICATION" as const,
      actionConfig: { recipientId: adminUser.id, message: "אירועים מרובים" },
      isActive: true,
      folderId: null,
    },
    {
      name: "אוטומציית תפוצה",
      triggerType: "NEW_RECORD" as const,
      triggerConfig: {},
      actionType: "ADD_TO_NURTURE_LIST" as const,
      actionConfig: { listId: "birthday" },
      isActive: true,
      folderId: null,
    },
    {
      name: "אוטומציית סטטוס פנייה",
      triggerType: "TICKET_STATUS_CHANGE" as const,
      triggerConfig: { fromStatus: "OPEN", toStatus: "IN_PROGRESS" },
      actionType: "SEND_NOTIFICATION" as const,
      actionConfig: { recipientId: adminUser.id, message: "סטטוס פנייה השתנה" },
      isActive: true,
      folderId: null,
    },
    {
      name: "אוטומציית מדד תצוגה",
      triggerType: "VIEW_METRIC_THRESHOLD" as const,
      triggerConfig: { metricId: "test", threshold: 100 },
      actionType: "SEND_NOTIFICATION" as const,
      actionConfig: { recipientId: adminUser.id, message: "חריגת מדד" },
      isActive: true,
      folderId: null,
    },
  ];

  for (const auto of automationData) {
    await prisma.automationRule.create({
      data: {
        companyId: company.id,
        createdBy: adminUser.id,
        name: auto.name,
        triggerType: auto.triggerType,
        triggerConfig: auto.triggerConfig,
        actionType: auto.actionType,
        actionConfig: auto.actionConfig,
        isActive: auto.isActive,
        folderId: auto.folderId,
      },
    });
  }

  // --- Seed table categories ---
  const tableCategory = await prisma.tableCategory.create({
    data: {
      companyId: company.id,
      name: "מכירות",
    },
  });

  // --- Seed tables ---
  const table1 = await prisma.tableMeta.create({
    data: {
      companyId: company.id,
      name: "לקוחות לבדיקה",
      slug: `e2e-customers-${Date.now()}`,
      createdBy: adminUser.id,
      categoryId: tableCategory.id,
      order: 0,
      schemaJson: [
        { name: "fullName", label: "שם מלא", type: "text" },
        { name: "email", label: "אימייל", type: "email" },
        { name: "phone", label: "טלפון", type: "phone" },
        { name: "status", label: "סטטוס", type: "select", options: ["פעיל", "לא פעיל"] },
      ],
    },
  });

  const table2 = await prisma.tableMeta.create({
    data: {
      companyId: company.id,
      name: "הזמנות לבדיקה",
      slug: `e2e-orders-${Date.now()}`,
      createdBy: adminUser.id,
      categoryId: null, // uncategorized
      order: 1,
      schemaJson: [
        { name: "product", label: "מוצר", type: "text" },
        { name: "quantity", label: "כמות", type: "number" },
      ],
    },
  });

  // --- Seed records for table1 ---
  const recordData = [
    { fullName: "ישראל ישראלי", email: "israel@test.com", phone: "050-1234567", status: "פעיל" },
    { fullName: "דנה כהן", email: "dana@test.com", phone: "052-7654321", status: "פעיל" },
    { fullName: "אבי לוי", email: "avi@test.com", phone: "054-1111111", status: "לא פעיל" },
    { fullName: "מיכל רוזן", email: "michal@test.com", phone: "053-2222222", status: "פעיל" },
    { fullName: "יוסי ברק", email: "yossi@test.com", phone: "058-3333333", status: "לא פעיל" },
  ];

  for (const data of recordData) {
    await prisma.record.create({
      data: {
        companyId: company.id,
        tableId: table1.id,
        data,
        createdBy: adminUser.id,
      },
    });
  }

  // --- Seed records for table2 ---
  await prisma.record.create({
    data: {
      companyId: company.id,
      tableId: table2.id,
      data: { product: "מחשב נייד", quantity: 2 },
      createdBy: adminUser.id,
    },
  });

  // --- Seed folders for files tests ---
  const folderDocs = await prisma.folder.create({
    data: {
      companyId: company.id,
      name: "מסמכים",
    },
  });

  const folderImages = await prisma.folder.create({
    data: {
      companyId: company.id,
      name: "תמונות",
    },
  });

  const folderContracts = await prisma.folder.create({
    data: {
      companyId: company.id,
      name: "חוזים",
      parentId: folderDocs.id,
    },
  });

  // --- Seed files for files tests ---
  const fileImage = await prisma.file.create({
    data: {
      companyId: company.id,
      name: "logo.png",
      displayName: "לוגו החברה",
      url: "https://utfs.io/f/fake-image-key",
      key: "fake-image-key",
      size: 204800, // 200 KB
      type: "image/png",
      source: "ידנית",
    },
  });

  const filePdf = await prisma.file.create({
    data: {
      companyId: company.id,
      name: "contract.pdf",
      displayName: "חוזה שירות",
      url: "https://utfs.io/f/fake-pdf-key",
      key: "fake-pdf-key",
      size: 1048576, // 1 MB
      type: "application/pdf",
      source: "ידנית",
    },
  });

  const fileText = await prisma.file.create({
    data: {
      companyId: company.id,
      name: "notes.txt",
      url: "https://utfs.io/f/fake-text-key",
      key: "fake-text-key",
      size: 5120, // 5 KB
      type: "text/plain",
      source: "ידנית",
    },
  });

  const fileInFolder = await prisma.file.create({
    data: {
      companyId: company.id,
      folderId: folderDocs.id,
      name: "report.pdf",
      displayName: "דוח חודשי",
      url: "https://utfs.io/f/fake-report-key",
      key: "fake-report-key",
      size: 524288, // 512 KB
      type: "application/pdf",
      source: "ידנית",
    },
  });

  // --- Seed products for services tests ---
  const product1 = await prisma.product.create({
    data: {
      companyId: company.id,
      name: "ייעוץ עסקי",
      description: "שירות ייעוץ עסקי מקצועי",
      sku: "SRV-001",
      type: "SERVICE",
      price: 1000,
      cost: 300,
      isActive: true,
    },
  });

  const product2 = await prisma.product.create({
    data: {
      companyId: company.id,
      name: "מחשב נייד Pro",
      description: "מחשב נייד לעבודה",
      sku: "PRD-002",
      type: "PRODUCT",
      price: 5000,
      cost: 4200,
      isActive: true,
    },
  });

  const product3 = await prisma.product.create({
    data: {
      companyId: company.id,
      name: "חבילת פרימיום",
      sku: null,
      type: "PACKAGE",
      price: 2000,
      cost: 0,
      isActive: true,
    },
  });

  // --- Update basic user with table view permission (read-only for table1) ---
  await prisma.user.update({
    where: { id: basicUser.id },
    data: {
      permissions: { canViewTasks: true, canViewTables: true, canViewAnalytics: true, canViewServiceCalls: true, canViewChat: true, canViewQuotes: true },
      tablePermissions: { [table1.id.toString()]: "read" },
    },
  });

  // --- Update admin user with analytics permissions ---
  await prisma.user.update({
    where: { id: adminUser.id },
    data: {
      permissions: { canViewAnalytics: true, canManageAnalytics: true },
    },
  });

  // --- Seed analytics folder ---
  const analyticsFolder = await prisma.viewFolder.create({
    data: {
      companyId: company.id,
      name: "תיקיית אנליטיקות",
      type: "ANALYTICS",
    },
  });

  await prisma.viewFolder.create({
    data: {
      companyId: company.id,
      name: "תיקייה ריקה אנליטיקות",
      type: "ANALYTICS",
    },
  });

  // --- Seed analytics views ---
  const analyticsView1 = await prisma.analyticsView.create({
    data: {
      companyId: company.id,
      title: "ספירת משימות לפי סטטוס",
      type: "COUNT",
      config: {
        model: "Task",
        filter: { status: "todo" },
        groupByField: "status",
        dateRangeType: "all",
      },
      order: 0,
      color: "bg-blue-50",
      cachedStats: {
        stats: { mainMetric: "8", label: "משימות", subMetric: "" },
        items: [
          { name: "todo", value: 2 },
          { name: "in_progress", value: 1 },
          { name: "done", value: 3 },
        ],
        tableName: "System",
      },
      lastCachedAt: new Date(),
    },
  });

  const analyticsView2 = await prisma.analyticsView.create({
    data: {
      companyId: company.id,
      title: "אחוז המרת לקוחות",
      type: "CONVERSION",
      config: {
        tableId: table1.id,
        totalFilter: {},
        successFilter: { status: "פעיל" },
        dateRangeType: "all",
      },
      order: 1,
      color: "bg-green-50",
      cachedStats: {
        stats: { mainMetric: "60%", label: "אחוז המרה", subMetric: "3/5" },
        items: [],
        tableName: table1.name,
      },
      lastCachedAt: new Date(),
    },
  });

  const analyticsView3 = await prisma.analyticsView.create({
    data: {
      companyId: company.id,
      title: "משימות בתיקייה",
      type: "COUNT",
      config: {
        model: "Task",
        filter: {},
        dateRangeType: "all",
      },
      order: 2,
      color: "bg-white",
      folderId: analyticsFolder.id,
      cachedStats: {
        stats: { mainMetric: "5", label: "משימות", subMetric: "" },
        items: [{ name: "total", value: 5 }],
        tableName: "System",
      },
      lastCachedAt: new Date(),
    },
  });

  // --- Seed workers module data ---
  const workerDepartment = await prisma.department.create({
    data: {
      companyId: company.id,
      name: "מחלקת בדיקות",
      description: "מחלקת בדיקות לטסטים",
      color: "#3B82F6",
    },
  });

  const onboardingPath = await prisma.onboardingPath.create({
    data: {
      companyId: company.id,
      name: "מסלול קליטה בדיקה",
      description: "מסלול קליטה לצורך בדיקות E2E",
      departmentId: workerDepartment.id,
      isDefault: true,
      isActive: true,
      estimatedDays: 30,
    },
  });

  const step1 = await prisma.onboardingStep.create({
    data: {
      companyId: company.id,
      pathId: onboardingPath.id,
      title: "שלב ראשון - הכרת המערכת",
      description: "לימוד בסיסי של המערכת",
      type: "TRAINING",
      order: 0,
      estimatedMinutes: 60,
      isRequired: true,
    },
  });

  const step2 = await prisma.onboardingStep.create({
    data: {
      companyId: company.id,
      pathId: onboardingPath.id,
      title: "שלב שני - מילוי מסמכים",
      description: "מילוי טפסים והגשת מסמכים",
      type: "DOCUMENT",
      order: 1,
      estimatedMinutes: 30,
      isRequired: false,
    },
  });

  // Worker 1: ONBOARDING status, with onboarding path assigned
  const worker1 = await prisma.worker.create({
    data: {
      companyId: company.id,
      firstName: "ישראל",
      lastName: "כהן",
      email: "israel.cohen@test.com",
      phone: "050-1111111",
      departmentId: workerDepartment.id,
      position: "מפתח",
      employeeId: "EMP001",
      status: "ONBOARDING",
      startDate: new Date(),
    },
  });

  // Assign onboarding path to worker1
  const workerOnboarding1 = await prisma.workerOnboarding.create({
    data: {
      companyId: company.id,
      workerId: worker1.id,
      pathId: onboardingPath.id,
      status: "IN_PROGRESS",
    },
  });

  // Create step progress for worker1 (first step completed)
  await prisma.workerOnboardingStep.create({
    data: {
      companyId: company.id,
      onboardingId: workerOnboarding1.id,
      stepId: step1.id,
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  await prisma.workerOnboardingStep.create({
    data: {
      companyId: company.id,
      onboardingId: workerOnboarding1.id,
      stepId: step2.id,
      status: "PENDING",
    },
  });

  // Worker 2: ACTIVE status
  const worker2 = await prisma.worker.create({
    data: {
      companyId: company.id,
      firstName: "דנה",
      lastName: "לוי",
      email: "dana.levi@test.com",
      phone: "052-2222222",
      departmentId: workerDepartment.id,
      position: "מעצבת",
      employeeId: "EMP002",
      status: "ACTIVE",
      startDate: new Date("2024-01-15"),
    },
  });

  // --- Seed client for service/ticket tests ---
  const testClient = await prisma.client.create({
    data: {
      companyId: company.id,
      name: "לקוח בדיקה",
      email: "test-client@test.com",
      phone: "050-9999999",
      businessName: "עסק בדיקה",
    },
  });

  // --- Seed tickets across different statuses ---
  const ticketOpen = await prisma.ticket.create({
    data: {
      companyId: company.id,
      title: "קריאת שירות פתוחה",
      description: "תיאור של קריאת שירות פתוחה",
      status: "OPEN",
      priority: "MEDIUM",
      type: "SERVICE",
      clientId: testClient.id,
      assigneeId: adminUser.id,
      creatorId: adminUser.id,
    },
  });

  const ticketInProgress = await prisma.ticket.create({
    data: {
      companyId: company.id,
      title: "קריאה בטיפול",
      description: "תיאור של קריאה בטיפול",
      status: "IN_PROGRESS",
      priority: "HIGH",
      type: "COMPLAINT",
      assigneeId: adminUser.id,
      creatorId: adminUser.id,
    },
  });

  const ticketWaiting = await prisma.ticket.create({
    data: {
      companyId: company.id,
      title: "קריאה ממתינה",
      description: "תיאור של קריאה ממתינה",
      status: "WAITING",
      priority: "LOW",
      type: "SERVICE",
      clientId: testClient.id,
      creatorId: adminUser.id,
    },
  });

  const ticketResolved = await prisma.ticket.create({
    data: {
      companyId: company.id,
      title: "קריאה שטופלה",
      description: "תיאור של קריאה שטופלה",
      status: "RESOLVED",
      priority: "MEDIUM",
      type: "RETENTION",
      assigneeId: adminUser.id,
      creatorId: adminUser.id,
    },
  });

  const ticketHighPriority = await prisma.ticket.create({
    data: {
      companyId: company.id,
      title: "קריאה דחופה",
      description: "תיאור של קריאה דחופה",
      status: "OPEN",
      priority: "CRITICAL",
      type: "SERVICE",
      clientId: testClient.id,
      assigneeId: adminUser.id,
      creatorId: adminUser.id,
    },
  });

  // --- Seed a comment on the first ticket ---
  await prisma.ticketComment.create({
    data: {
      ticketId: ticketOpen.id,
      userId: adminUser.id,
      content: "תגובת בדיקה ראשונה",
    },
  });

  // --- Seed workflow templates ---
  const workflowTemplate = await prisma.workflow.create({
    data: {
      companyId: company.id,
      name: "אונבורדינג לקוחות",
      description: "תהליך קליטת לקוח חדש",
      color: "blue",
      icon: "GitBranch",
    },
  });

  const wfStage1 = await prisma.workflowStage.create({
    data: {
      workflowId: workflowTemplate.id,
      name: "פגישת היכרות",
      description: "פגישת היכרות ראשונה עם הלקוח",
      color: "blue",
      icon: "User",
      order: 0,
      details: { systemActions: [{ type: "SEND_NOTIFICATION", config: { message: "פגישה נקבעה" } }] },
    },
  });

  const wfStage2 = await prisma.workflowStage.create({
    data: {
      workflowId: workflowTemplate.id,
      name: "חתימת חוזה",
      description: "חתימה על הסכם שירות",
      color: "green",
      icon: "FileText",
      order: 1,
      details: { systemActions: [{ type: "CREATE_TASK", config: { title: "הכנת חוזה" } }] },
    },
  });

  const wfStage3 = await prisma.workflowStage.create({
    data: {
      workflowId: workflowTemplate.id,
      name: "הגדרת המערכת",
      description: "הגדרת המערכת ללקוח החדש",
      color: "purple",
      icon: "Settings",
      order: 2,
    },
  });

  const emptyWorkflowTemplate = await prisma.workflow.create({
    data: {
      companyId: company.id,
      name: "תבנית ריקה לבדיקה",
      color: "gray",
      icon: "Circle",
    },
  });

  // --- Seed workflow instances ---
  const wfInstanceAlpha = await prisma.workflowInstance.create({
    data: {
      companyId: company.id,
      workflowId: workflowTemplate.id,
      name: "אונבורדינג ללקוח אלפא",
      status: "active",
      currentStageId: wfStage1.id,
      creatorId: adminUser.id,
      assigneeId: adminUser.id,
      completedStages: [],
    },
  });

  const wfInstanceBeta = await prisma.workflowInstance.create({
    data: {
      companyId: company.id,
      workflowId: workflowTemplate.id,
      name: "אונבורדינג ללקוח בטא",
      status: "active",
      currentStageId: wfStage2.id,
      creatorId: adminUser.id,
      assigneeId: basicUser.id,
      completedStages: [wfStage1.id],
    },
  });

  const wfInstanceDelete = await prisma.workflowInstance.create({
    data: {
      companyId: company.id,
      workflowId: workflowTemplate.id,
      name: "תהליך למחיקה",
      status: "active",
      currentStageId: wfStage1.id,
      creatorId: adminUser.id,
      completedStages: [],
    },
  });

  // --- Seed chat data (DM messages + group) ---
  const chatMessages = [
    { senderId: adminUser.id, receiverId: basicUser.id, content: "שלום, מה שלומך?" },
    { senderId: basicUser.id, receiverId: adminUser.id, content: "הכל טוב, תודה!" },
    { senderId: adminUser.id, receiverId: basicUser.id, content: "יש לנו פגישה מחר" },
    { senderId: basicUser.id, receiverId: adminUser.id, content: "כן, אני יודע. אהיה שם" },
    { senderId: adminUser.id, receiverId: basicUser.id, content: "מצוין, נתראה" },
  ];

  for (const msg of chatMessages) {
    await prisma.message.create({
      data: {
        companyId: company.id,
        senderId: msg.senderId,
        receiverId: msg.receiverId,
        content: msg.content,
        read: true,
      },
    });
  }

  const chatGroup = await prisma.group.create({
    data: {
      companyId: company.id,
      name: "צוות בדיקות E2E",
      creatorId: adminUser.id,
    },
  });

  await prisma.groupMember.createMany({
    data: [
      { companyId: company.id, groupId: chatGroup.id, userId: adminUser.id },
      { companyId: company.id, groupId: chatGroup.id, userId: basicUser.id },
    ],
  });

  const groupMessages = [
    { senderId: adminUser.id, content: "ברוכים הבאים לקבוצה!" },
    { senderId: basicUser.id, content: "תודה, שמח להיות כאן" },
    { senderId: adminUser.id, content: "בואו נתחיל לעבוד" },
  ];

  for (const msg of groupMessages) {
    await prisma.message.create({
      data: {
        companyId: company.id,
        senderId: msg.senderId,
        groupId: chatGroup.id,
        content: msg.content,
      },
    });
  }

  // --- Seed clients for quotes tests ---
  const quoteClient1 = await prisma.client.create({
    data: {
      companyId: company.id,
      name: "לקוח הצעות 1",
      email: "quote-client1@test.com",
      phone: "050-1112233",
      businessName: "עסק לקוח 1",
    },
  });

  const quoteClient2 = await prisma.client.create({
    data: {
      companyId: company.id,
      name: "לקוח הצעות 2",
      email: "quote-client2@test.com",
      phone: "052-4455667",
    },
  });

  // --- Seed quotes with different statuses ---
  const quoteDraft = await prisma.quote.create({
    data: {
      companyId: company.id,
      quoteNumber: 1,
      clientId: quoteClient1.id,
      clientName: "לקוח הצעות 1",
      clientEmail: "quote-client1@test.com",
      clientPhone: "050-1112233",
      total: 3000,
      status: "DRAFT",
      currency: "ILS",
      title: "הצעה טיוטה לבדיקה",
      items: {
        create: [
          { description: "ייעוץ עסקי", quantity: 2, unitPrice: 1000, productId: product1.id },
          { description: "שירות נוסף", quantity: 1, unitPrice: 1000 },
        ],
      },
    },
  });

  const quoteSent = await prisma.quote.create({
    data: {
      companyId: company.id,
      quoteNumber: 2,
      clientId: quoteClient2.id,
      clientName: "לקוח הצעות 2",
      clientEmail: "quote-client2@test.com",
      clientPhone: "052-4455667",
      total: 5000,
      status: "SENT",
      currency: "ILS",
      title: "הצעה שנשלחה",
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      items: {
        create: [
          { description: "מחשב נייד Pro", quantity: 1, unitPrice: 5000, productId: product2.id },
        ],
      },
    },
  });

  const quoteAccepted = await prisma.quote.create({
    data: {
      companyId: company.id,
      quoteNumber: 3,
      clientName: "לקוח מאושר",
      clientEmail: "approved@test.com",
      total: 7000,
      status: "ACCEPTED",
      currency: "ILS",
      title: "הצעה מאושרת",
      items: {
        create: [
          { description: "חבילת פרימיום", quantity: 2, unitPrice: 2000, productId: product3.id },
          { description: "ייעוץ עסקי", quantity: 3, unitPrice: 1000, productId: product1.id },
        ],
      },
    },
  });

  const quoteTrashed = await prisma.quote.create({
    data: {
      companyId: company.id,
      quoteNumber: 4,
      clientName: "לקוח למחיקה",
      total: 1500,
      status: "DRAFT",
      currency: "ILS",
      isTrashed: true,
      items: {
        create: [
          { description: "פריט למחיקה", quantity: 1, unitPrice: 1500 },
        ],
      },
    },
  });

  // Store company ID and seeded IDs for teardown and tests
  process.env.E2E_COMPANY_ID = String(company.id);
  const meta = {
    companyId: company.id,
    adminUserId: adminUser.id,
    basicUserId: basicUser.id,
    tableCategoryId: tableCategory.id,
    table1Id: table1.id,
    table2Id: table2.id,
    table1Name: table1.name,
    table2Name: table2.name,
    table1Slug: table1.slug,
    table2Slug: table2.slug,
    categoryName: tableCategory.name,
    // Files & folders
    folderDocsId: folderDocs.id,
    folderImagesId: folderImages.id,
    folderContractsId: folderContracts.id,
    fileImageId: fileImage.id,
    filePdfId: filePdf.id,
    fileTextId: fileText.id,
    fileInFolderId: fileInFolder.id,
    // Products
    product1Id: product1.id,
    product1Name: product1.name,
    product2Id: product2.id,
    product2Name: product2.name,
    product3Id: product3.id,
    product3Name: product3.name,
    // Workers module
    workerDepartmentId: workerDepartment.id,
    workerDepartmentName: workerDepartment.name,
    onboardingPathId: onboardingPath.id,
    onboardingPathName: onboardingPath.name,
    worker1Id: worker1.id,
    worker2Id: worker2.id,
    step1Id: step1.id,
    step2Id: step2.id,
    // Tickets / Service
    testClientId: testClient.id,
    ticketOpenId: ticketOpen.id,
    ticketInProgressId: ticketInProgress.id,
    ticketWaitingId: ticketWaiting.id,
    ticketResolvedId: ticketResolved.id,
    ticketHighPriorityId: ticketHighPriority.id,
    // Analytics
    analyticsFolderId: analyticsFolder.id,
    analyticsView1Id: analyticsView1.id,
    analyticsView2Id: analyticsView2.id,
    analyticsView3Id: analyticsView3.id,
    // Workflows
    workflowTemplateId: workflowTemplate.id,
    emptyWorkflowTemplateId: emptyWorkflowTemplate.id,
    wfStage1Id: wfStage1.id,
    wfStage2Id: wfStage2.id,
    wfStage3Id: wfStage3.id,
    wfInstanceAlphaId: wfInstanceAlpha.id,
    wfInstanceBetaId: wfInstanceBeta.id,
    wfInstanceDeleteId: wfInstanceDelete.id,
    // Chat
    chatGroupId: chatGroup.id,
    chatGroupName: chatGroup.name,
    basicUserName: basicUser.name,
    adminUserName: adminUser.name,
    // Quotes
    quoteClient1Id: quoteClient1.id,
    quoteClient1Name: quoteClient1.name,
    quoteClient2Id: quoteClient2.id,
    quoteClient2Name: quoteClient2.name,
    quoteDraftId: quoteDraft.id,
    quoteSentId: quoteSent.id,
    quoteAcceptedId: quoteAccepted.id,
    quoteTrashedId: quoteTrashed.id,
  };
  fs.writeFileSync(
    path.join(AUTH_DIR, ".e2e-meta.json"),
    JSON.stringify(meta, null, 2),
  );

  console.log(`E2E setup complete: company=${company.id}, admin=${adminUser.id}, tables=[${table1.id}, ${table2.id}], workers=[${worker1.id}, ${worker2.id}]`);
}

export default globalSetup;
