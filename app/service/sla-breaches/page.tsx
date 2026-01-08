import { getSlaBreaches } from "@/app/actions/sla-breaches";
import SlaBreachesClient from "./client";

export default async function SlaBreachesPage() {
  const result = await getSlaBreaches();
  const breaches = result.success && result.data ? result.data : [];

  return <SlaBreachesClient initialBreaches={breaches} />;
}
