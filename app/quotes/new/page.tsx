import { getProducts } from "@/app/actions/products";
import { getClientsForDropdown } from "@/app/actions/quotes";
import QuoteEditor from "../editor";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";

export default async function NewQuotePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [products, clients] = await Promise.all([
    getProducts(),
    getClientsForDropdown(),
  ]);

  const plainProducts = products.map((product) => ({
    ...product,
    price: product.price.toNumber(),
    cost: product.cost ? product.cost.toNumber() : null,
  }));

  return <QuoteEditor products={plainProducts} clients={clients} />;
}
