import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "מדריכים ותיעוד | BizlyCRM",
};

export default function GuidesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
