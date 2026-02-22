import { Suspense } from "react";
import { getServiceAutomationRules, getServiceUsers } from "@/app/actions/tickets";
import ServiceAutomationsClient from "./client";
import { isRateLimitError } from "@/lib/rate-limit-utils";
import RateLimitFallback from "@/components/RateLimitFallback";

export default async function ServiceAutomationsPage() {
  let rules, users;
  try {
    [rules, users] = await Promise.all([
      getServiceAutomationRules(),
      getServiceUsers(),
    ]);
  } catch (e) {
    if (isRateLimitError(e)) return <RateLimitFallback />;
    throw e;
  }

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
