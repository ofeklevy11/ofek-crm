import { getAutomationRules } from "@/app/actions/automations";
import { getCurrentUser } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import ServiceAutomationsClient from "./client";

export default async function ServiceAutomationsPage() {
  const user = await getCurrentUser();
  if (!user) return <div>Unauthorized</div>;

  const result = await getAutomationRules();
  const rules = result.success ? result.data : [];

  const users = await prisma.user.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true },
  });

  return <ServiceAutomationsClient initialAutomations={rules} users={users} />;
}
