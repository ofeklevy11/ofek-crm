import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { Toaster } from "@/components/ui/toaster";
import MobileFeatureDisclaimer from "@/components/MobileFeatureDisclaimer";

const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  variable: "--font-rubik",
});

export const metadata: Metadata = {
  title: "CRM למנהל",
  description: "מערכת ניהול לעסקים",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body
        className={`${rubik.variable} antialiased font-rubik`}
        suppressHydrationWarning
      >
        <MobileFeatureDisclaimer />
        <Navbar />
        <main>{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
