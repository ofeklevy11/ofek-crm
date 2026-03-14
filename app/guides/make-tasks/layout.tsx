import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "יצירת משימות אוטומטית | BizlyCRM",
};

export default function MakeTasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
