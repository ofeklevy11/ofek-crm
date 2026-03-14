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
  title: {
    default: "BizlyCRM",
    template: "%s | BizlyCRM",
  },
  description:
    "BizlyCRM — A cloud-based CRM platform for small and medium businesses. Manage leads, customers, sales, invoicing, tasks, scheduling, and analytics in one place. | מערכת ניהול קשרי לקוחות לעסקים קטנים ובינוניים.",
};

function NavbarSkeleton() {
  return (
    <nav aria-label="ניווט ראשי" className="bg-background/95 border-b border-border/40 sticky top-0 z-50">
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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:z-100 focus:top-2 focus:right-2 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg"
        >
          דלג לתוכן הראשי
        </a>
        <MobileFeatureDisclaimer />
        <Suspense fallback={<NavbarSkeleton />}>
          <Navbar />
        </Suspense>
        <main id="main-content">{children}</main>
        <MiniFooter />
        <SonnerToaster />
        <ModalProvider />
      </body>
    </html>
  );
}
