import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "חיבור Make לטבלאות | BizlyCRM",
};

export default function MakeIntegrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
