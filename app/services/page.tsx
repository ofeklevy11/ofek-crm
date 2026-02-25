import { getProducts } from "@/app/actions/products";
import ServicesPageClient from "./client";

export default async function ServicesPage() {
  const products = await getProducts();
  return <ServicesPageClient products={products} />;
}
