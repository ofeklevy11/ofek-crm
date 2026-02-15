import { getProductsForDropdown } from "@/app/actions/products";
import { getClientsForDropdown } from "@/app/actions/quotes";
import { getBusinessSettings } from "@/app/actions/business-settings";
import QuoteEditor from "../editor";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import BusinessSettingsRequired from "../business-settings-required";

export default async function NewQuotePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [products, clients, businessSettings] =
    await Promise.all([
      getProductsForDropdown(),
      getClientsForDropdown(),
      getBusinessSettings(),
    ]);

  // Derive completeness from businessSettings instead of a separate DB query
  const isSettingsComplete = Boolean(
    businessSettings?.businessType &&
    businessSettings?.taxId &&
    businessSettings?.businessAddress
  );

  // If business settings are not complete, show setup form
  if (!isSettingsComplete) {
    return <BusinessSettingsRequired initialSettings={businessSettings} />;
  }

  const plainProducts = products.map((product) => ({
    ...product,
    price: product.price,
    cost: product.cost ?? null,
  }));

  return (
    <QuoteEditor
      products={plainProducts}
      clients={clients}
      isVatExempt={businessSettings?.businessType === "exempt"}
    />
  );
}
