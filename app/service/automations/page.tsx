import { Suspense } from "react";
import { getServiceAutomationRules, getServiceUsers } from "@/app/actions/tickets";
import ServiceAutomationsClient from "./client";

export default async function ServiceAutomationsPage() {
  const [rules, users] = await Promise.all([
    getServiceAutomationRules(),
    getServiceUsers(),
  ]);

  if (!rules.length && !users.length) return <div>Unauthorized</div>;

  return (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center p-8 bg-[#f4f8f8]">
          טוען...
        </div>
      }
    >
      <ServiceAutomationsClient initialAutomations={rules} users={users} />
    </Suspense>
  );
}
