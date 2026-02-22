import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import MobileFeatureDisclaimer from "@/components/MobileFeatureDisclaimer";
import { ModalProvider } from "@/components/ui/modal-provider";

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
        <SonnerToaster />
        <ModalProvider />
      </body>
    </html>
  );
}
