import type { Metadata } from "next";
import { getProducts } from "@/app/actions/products";
import ServicesPageClient from "./client";

export const metadata: Metadata = { title: "מוצרים ושירותים" };
export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const products = await getProducts();
  return <ServicesPageClient products={products} />;
}
