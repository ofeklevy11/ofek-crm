import type { Metadata } from "next";
import { getSlaBreaches } from "@/app/actions/sla-breaches";
import SlaBreachesClient from "./client";

export const metadata: Metadata = {
  title: "חריגות SLA",
};

export default async function SlaBreachesPage() {
  const result = await getSlaBreaches();
  const breaches = result.success && result.data ? result.data.items : [];

  return <SlaBreachesClient initialBreaches={breaches} />;
}
