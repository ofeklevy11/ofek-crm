import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "יצירת אירועים דרך Make | BizlyCRM",
};

export default function MakeAppCalendarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
