import { getProducts } from "@/app/actions/products";
import { getClientsForDropdown, getQuoteById } from "@/app/actions/quotes";
import QuoteEditor from "../editor";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [products, clients, quote] = await Promise.all([
    getProducts(),
    getClientsForDropdown(),
    getQuoteById(resolvedParams.id),
  ]);

  if (!quote) {
    return <div>Quote not found</div>;
  }

  const plainProducts = products.map((product) => ({
    ...product,
    price: product.price.toNumber(),
    cost: product.cost ? product.cost.toNumber() : null,
  }));

  return (
    <QuoteEditor
      products={plainProducts}
      clients={clients}
      initialQuote={quote}
    />
  );
}
