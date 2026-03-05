/**
 * Playwright global teardown: cleans up seeded E2E test data.
 */
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../.env.test") });

async function globalTeardown() {
  const metaPath = path.join(__dirname, "..", ".auth", ".e2e-meta.json");

  if (!fs.existsSync(metaPath)) {
    console.log("E2E teardown: no meta file found, skipping cleanup");
    return;
  }

  const { companyId } = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

  const { prisma } = await import("@/lib/prisma");

  // Delete in order respecting foreign keys
  // Workflows
  await prisma.workflowInstance.deleteMany({ where: { companyId } });
  await prisma.workflowStage.deleteMany({ where: { workflow: { companyId } } });
  await prisma.workflow.deleteMany({ where: { companyId } });
  // Workers module
  await prisma.workerOnboardingStep.deleteMany({ where: { companyId } });
  await prisma.workerOnboarding.deleteMany({ where: { companyId } });
  await prisma.workerTask.deleteMany({ where: { companyId } });
  await prisma.worker.deleteMany({ where: { companyId } });
  await prisma.onboardingStep.deleteMany({ where: { companyId } });
  await prisma.onboardingPath.deleteMany({ where: { companyId } });
  await prisma.department.deleteMany({ where: { companyId } });
  // Analytics
  await prisma.analyticsRefreshLog.deleteMany({ where: { companyId } });
  await prisma.analyticsView.deleteMany({ where: { companyId } });
  // Tickets / Service
  await prisma.ticketActivityLog.deleteMany({ where: { ticket: { companyId } } });
  await prisma.ticketComment.deleteMany({ where: { ticket: { companyId } } });
  await prisma.slaBreach.deleteMany({ where: { ticket: { companyId } } });
  await prisma.ticket.deleteMany({ where: { companyId } });
  await prisma.slaPolicy.deleteMany({ where: { companyId } });
  // Quotes
  await prisma.quoteItem.deleteMany({ where: { quote: { companyId } } });
  await prisma.quote.deleteMany({ where: { companyId } });
  await prisma.client.deleteMany({ where: { companyId } });
  // Goals
  await prisma.goal.deleteMany({ where: { companyId } });
  // Products
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.automationRule.deleteMany({ where: { companyId } });
  await prisma.viewFolder.deleteMany({ where: { companyId } });
  await prisma.taskSheetItem.deleteMany({ where: { sheet: { companyId } } });
  await prisma.taskSheet.deleteMany({ where: { companyId } });
  await prisma.task.deleteMany({ where: { companyId } });
  await prisma.attachment.deleteMany({ where: { companyId } });
  await prisma.file.deleteMany({ where: { companyId } });
  await prisma.folder.deleteMany({ where: { companyId, parentId: { not: null } } });
  await prisma.folder.deleteMany({ where: { companyId } });
  await prisma.record.deleteMany({ where: { companyId } });
  await prisma.view.deleteMany({ where: { companyId } });
  await prisma.tableMeta.deleteMany({ where: { companyId } });
  await prisma.tableCategory.deleteMany({ where: { companyId } });
  // Chat
  await prisma.groupMember.deleteMany({ where: { companyId } });
  await prisma.message.deleteMany({ where: { companyId } });
  await prisma.group.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });

  // Clean up meta file
  fs.unlinkSync(metaPath);

  console.log(`E2E teardown complete: cleaned company=${companyId}`);
}

export default globalTeardown;
