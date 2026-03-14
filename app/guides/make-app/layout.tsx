import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "הוספת רשומות דרך Make | BizlyCRM",
};

export default function MakeAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
