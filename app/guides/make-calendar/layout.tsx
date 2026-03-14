import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "יצירת אירועים ביומן | BizlyCRM",
};

export default function MakeCalendarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
