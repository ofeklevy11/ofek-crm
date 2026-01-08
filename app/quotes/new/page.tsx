import { getProducts } from "@/app/actions/products";
import { getClientsForDropdown } from "@/app/actions/quotes";
import {
  getBusinessSettings,
  checkBusinessSettingsComplete,
} from "@/app/actions/business-settings";
import QuoteEditor from "../editor";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import BusinessSettingsRequired from "../business-settings-required";

export default async function NewQuotePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [products, clients, isSettingsComplete, businessSettings] =
    await Promise.all([
      getProducts(),
      getClientsForDropdown(),
      checkBusinessSettingsComplete(),
      getBusinessSettings(),
    ]);

  // If business settings are not complete, show setup form
  if (!isSettingsComplete) {
    return <BusinessSettingsRequired initialSettings={businessSettings} />;
  }

  const plainProducts = products.map((product) => ({
    ...product,
    price: product.price,
    cost: product.cost ?? null,
  }));

  return <QuoteEditor products={plainProducts} clients={clients} />;
}
