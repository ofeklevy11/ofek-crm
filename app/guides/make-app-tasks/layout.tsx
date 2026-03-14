import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "יצירת משימות דרך Make | BizlyCRM",
};

export default function MakeAppTasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
