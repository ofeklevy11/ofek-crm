import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow time for PDF Monkey polling

const PDFMONKEY_API_KEY = process.env.PDFMONKEY_API_KEY;
const PDFMONKEY_TEMPLATE_ID = process.env.PDFMONKEY_TEMPLATE_ID;

// Helper to format currency
const formatCurrency = (amount: number | string | null | undefined) => {
  if (amount == null) return "0.00";
  return Number(amount).toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Helper to format dates
const formatDate = (date: Date | string | null) => {
  if (!date) return "";
  return new Date(date).toLocaleDateString("he-IL");
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;

  // No auth check for public route - relying on ID secrecy (UUID/CUID)

  // Check configuration
  if (!PDFMONKEY_API_KEY || !PDFMONKEY_TEMPLATE_ID) {
    console.error("Missing PDF Monkey configuration");
    return new NextResponse(
      "PDF generation configuration is missing. Please contact support.",
      { status: 500 },
    );
  }

  const quote = await prisma.quote.findUnique({
    where: { id: resolvedParams.id },
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

  // Prepare Data for PDF Monkey (Same as private route)
  const vatRate = 0.18;
  const isVatExempt = quote.company.businessType === "exempt";
  const subtotal = Number(quote.total);
  const vatAmount = subtotal * vatRate;
  const grandTotal = isVatExempt ? subtotal : subtotal + vatAmount;

  // Map business type to label
  let businessTypeLabel = "";
  switch (quote.company.businessType) {
    case "exempt":
      businessTypeLabel = "עוסק פטור";
      break;
    case "licensed":
      businessTypeLabel = "עוסק מורשה";
      break;
    case "ltd":
      businessTypeLabel = "חברה בע״מ";
      break;
  }

  const payload = {
    quote_number: quote.quoteNumber
      ? String(quote.quoteNumber).padStart(5, "0")
      : quote.id.slice(-6).toUpperCase(),
    created_at: formatDate(quote.createdAt),
    valid_until: formatDate(quote.validUntil),

    // Quote Title Removed from Schema
    quote_title: null,

    // Company (Sender)
    company_name: quote.company.name,
    company_business_type: quote.company.businessType,
    company_business_type_label: businessTypeLabel,
    company_tax_id: quote.company.taxId,
    company_address: quote.company.businessAddress,
    company_email: quote.company.businessEmail,
    company_website: quote.company.businessWebsite,
    // Logo Removed from Schema
    company_logo_url: null,

    // Client (Receiver)
    client_name: quote.clientName,
    client_tax_id: quote.clientTaxId,
    client_email: quote.clientEmail,
    client_phone: quote.clientPhone,
    client_address: quote.clientAddress,

    // Items
    items: quote.items.map((item) => ({
      name: item.product?.name || "פריט כללי",
      description: item.description,
      quantity: item.quantity,
      unit_price: formatCurrency(item.unitPrice),
      total: formatCurrency(Number(item.quantity) * Number(item.unitPrice)),
    })),

    // Totals
    subtotal: formatCurrency(subtotal),
    is_vat_exempt: isVatExempt,
    vat_amount: formatCurrency(vatAmount),
    grand_total: formatCurrency(grandTotal),
  };

  try {
    // 1. Create Document
    const createRes = await fetch("https://api.pdfmonkey.io/api/v1/documents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PDFMONKEY_API_KEY}`,
      },
      body: JSON.stringify({
        document: {
          document_template_id: PDFMONKEY_TEMPLATE_ID,
          payload: payload,
          status: "pending",
        },
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error("PDF Monkey Create Error:", errText);
      throw new Error(`PDF Provider Error: ${createRes.statusText}`);
    }

    const createData = await createRes.json();
    const documentId = createData.document.id;
    let downloadUrl = createData.document.download_url;
    let status = createData.document.status;

    // 2. Poll for completion
    let attempts = 0;
    while (status !== "success" && attempts < 15) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const checkRes = await fetch(
        `https://api.pdfmonkey.io/api/v1/documents/${documentId}`,
        {
          headers: {
            Authorization: `Bearer ${PDFMONKEY_API_KEY}`,
          },
        },
      );

      if (!checkRes.ok) throw new Error("Failed to check document status");

      const checkData = await checkRes.json();
      status = checkData.document.status;
      downloadUrl = checkData.document.download_url;

      if (status === "failure") {
        throw new Error("PDF Generation failed on provider side");
      }

      attempts++;
    }

    if (status !== "success" || !downloadUrl) {
      throw new Error("PDF Generation timed out");
    }

    // 3. Fetch the actual PDF content
    const pdfRes = await fetch(downloadUrl);
    if (!pdfRes.ok) throw new Error("Failed to download generated PDF");

    const pdfBuffer = await pdfRes.arrayBuffer();

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="quote-${quote.id.slice(
          -6,
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
