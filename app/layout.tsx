import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import MobileFeatureDisclaimer from "@/components/MobileFeatureDisclaimer";
import MiniFooter from "@/components/MiniFooter";
import { ModalProvider } from "@/components/ui/modal-provider";

const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  variable: "--font-rubik",
});

export const metadata: Metadata = {
  title: "BizlyCRM",
  description:
    "BizlyCRM — A cloud-based CRM platform for small and medium businesses. Manage leads, customers, sales, invoicing, tasks, scheduling, and analytics in one place. | מערכת ניהול קשרי לקוחות לעסקים קטנים ובינוניים.",
};

function NavbarSkeleton() {
  return (
    <nav className="bg-background/95 border-b border-border/40 sticky top-0 z-50">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16" />
      </div>
    </nav>
  );
}

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
        <Suspense fallback={<NavbarSkeleton />}>
          <Navbar />
        </Suspense>
        <main>{children}</main>
        <MiniFooter />
        <SonnerToaster />
        <ModalProvider />
      </body>
    </html>
  );
}
