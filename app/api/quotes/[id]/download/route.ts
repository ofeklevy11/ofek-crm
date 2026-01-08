import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { render } from "@react-email/render";
import QuoteDocument from "@/components/quotes/QuoteDocument";
import React from "react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Helper function to get browser instance
async function getBrowser() {
  // Check if we're on Vercel (serverless environment)
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    // For Vercel, we need to use puppeteer-core with @sparticuz/chromium
    // If these packages are not installed, this will fail gracefully
    try {
      const chromium = await import("@sparticuz/chromium").then(
        (m) => m.default
      );
      const puppeteerCore = await import("puppeteer-core").then(
        (m) => m.default
      );

      return await puppeteerCore.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    } catch (e) {
      console.error("Failed to load serverless chromium:", e);
      throw new Error(
        "PDF generation is not available in this environment. Please install @sparticuz/chromium and puppeteer-core for Vercel deployment."
      );
    }
  } else {
    // For local development, use regular puppeteer
    try {
      const puppeteer = await import("puppeteer").then((m) => m.default);
      return await puppeteer.launch({
        channel: "chrome",
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });
    } catch (e) {
      console.error("Failed to load puppeteer:", e);
      throw new Error(
        "PDF generation requires puppeteer to be installed locally."
      );
    }
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const quote = await prisma.quote.findUnique({
    where: { id: resolvedParams.id, companyId: user.companyId },
    include: {
      client: true,
      items: {
        include: {
          product: true,
        },
      },
      company: true,
    },
  });

  if (!quote) {
    return new NextResponse("Quote not found", { status: 404 });
  }

  // Render the component to HTML using React.createElement
  const componentHtml = await render(
    React.createElement(QuoteDocument, { quote: quote as any })
  );

  // Wrap in a full HTML document with Tailwind CDN for styling
  const fullHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700&display=swap');
        body { font-family: 'Heebo', sans-serif; }
      </style>
    </head>
    <body class="bg-white">
      ${componentHtml}
    </body>
    </html>
  `;

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();

    // Set content and wait for load
    await page.setContent(fullHtml, { waitUntil: "load", timeout: 30000 });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20px",
        bottom: "20px",
        left: "20px",
        right: "20px",
      },
    });

    await browser.close();

    return new NextResponse(pdfBuffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="quote-${quote.id.slice(
          -6
        )}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("PDF Generation Error (Details):", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    return new NextResponse(`Failed to generate PDF: ${error.message}`, {
      status: 500,
    });
  }
}
