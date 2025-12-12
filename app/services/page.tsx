import { getProducts } from "@/app/actions/products";
import ServicesPageClient from "./client";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";

export default async function ServicesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login"); // Or home
  }

  const products = await getProducts();

  const plainProducts = products.map((product) => ({
    ...product,
    price: product.price.toNumber(),
    cost: product.cost ? product.cost.toNumber() : null,
  }));

  return <ServicesPageClient products={plainProducts} />;
}
