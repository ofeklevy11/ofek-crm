import { prisma } from "@/lib/prisma";

export const testPrisma = prisma;

let counter = 0;
function uniq() {
  return `${Date.now()}-${++counter}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function seedCompany(slug?: string) {
  return testPrisma.company.create({
    data: {
      name: `Acme Corp ${uniq()}`,
      slug: slug ?? `acme-${uniq()}`,
    },
  });
}

export async function seedUser(
  companyId: number,
  overrides: Record<string, any> = {},
) {
  return testPrisma.user.create({
    data: {
      companyId,
      name: overrides.name ?? "Sarah Connor",
      email: overrides.email ?? `sarah-${uniq()}@acme.com`,
      passwordHash: overrides.passwordHash ?? "$2b$10$fakehashfortesting",
      role: overrides.role ?? "admin",
      permissions: overrides.permissions ?? {},
      tablePermissions: overrides.tablePermissions ?? {},
      allowedWriteTableIds: overrides.allowedWriteTableIds ?? [],
      ...overrides,
    },
  });
}

export async function seedClient(
  companyId: number,
  overrides: Record<string, any> = {},
) {
  return testPrisma.client.create({
    data: {
      companyId,
      name: overrides.name ?? `GlobalTech Solutions ${uniq()}`,
      ...overrides,
    },
  });
}

export async function cleanupAll() {
  // Delete in FK-safe order (children before parents)
  // Finance-specific tables
  await testPrisma.financeRecord.deleteMany();
  await testPrisma.transaction.deleteMany();
  await testPrisma.oneTimePayment.deleteMany();
  await testPrisma.retainer.deleteMany();
  await testPrisma.goal.deleteMany();
  await testPrisma.financeSyncJob.deleteMany();
  await testPrisma.financeSyncRule.deleteMany();
  // Tables that reference User (must delete before User)
  await testPrisma.ticketActivityLog.deleteMany();
  await testPrisma.ticketComment.deleteMany();
  await testPrisma.slaBreach.deleteMany();
  await testPrisma.ticket.deleteMany();
  await testPrisma.slaPolicy.deleteMany();
  await testPrisma.message.deleteMany();
  await testPrisma.groupMember.deleteMany();
  await testPrisma.group.deleteMany();
  await testPrisma.task.deleteMany();
  await testPrisma.taskSheetItem.deleteMany();
  await testPrisma.taskSheet.deleteMany();
  await testPrisma.notification.deleteMany();
  await testPrisma.auditLog.deleteMany();
  await testPrisma.importJob.deleteMany();
  await testPrisma.automationLog.deleteMany();
  await testPrisma.automationRule.deleteMany();
  await testPrisma.workflowInstance.deleteMany();
  await testPrisma.workflowStage.deleteMany();
  await testPrisma.workflow.deleteMany();
  await testPrisma.apiKey.deleteMany();
  await testPrisma.statusDuration.deleteMany();
  await testPrisma.multiEventDuration.deleteMany();
  await testPrisma.calendarEvent.deleteMany();
  await testPrisma.record.deleteMany();
  await testPrisma.tableMeta.deleteMany();
  await testPrisma.product.deleteMany();
  await testPrisma.client.deleteMany();
  await testPrisma.user.deleteMany();
  await testPrisma.company.deleteMany();
}
