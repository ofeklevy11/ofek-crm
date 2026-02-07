import "server-only";

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Image,
} from "@react-pdf/renderer";
import { Quote, Company, QuoteItem, Product, Client } from "@prisma/client";

// Define types (mirroring QuoteDocument.tsx for consistency)
type CompanyWithSettings = Company & {
  businessType?: string | null;
  taxId?: string | null;
  businessAddress?: string | null;
  businessWebsite?: string | null;
  businessEmail?: string | null;
  logoUrl?: string | null; // Assuming this might exist or we can pass it
};

export type FullQuote = Quote & {
  company: CompanyWithSettings;
  client: Client | null;
  items: (QuoteItem & {
    product: Product | null;
  })[];
};

interface QuotePdfTemplateProps {
  quote: FullQuote;
}

// Styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Rubik",
    fontSize: 10,
    color: "#000000",
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 20,
  },
  headerLeft: {
    width: "40%",
  },
  headerRight: {
    width: "50%",
    alignItems: "flex-end",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#4f95ff", // Blue as per guidelines
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 10,
    color: "#6b7280",
  },
  companyName: {
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 5,
  },
  section: {
    marginBottom: 20,
  },
  gridTwo: {
    flexDirection: "row-reverse", // RTL layout helper
    justifyContent: "space-between",
    marginBottom: 30,
  },
  column: {
    width: "45%",
  },
  label: {
    fontSize: 9,
    color: "#a24ec1", // Purple as per guidelines
    fontWeight: "bold",
    marginBottom: 4,
  },
  value: {
    fontSize: 10,
    marginBottom: 2,
    lineHeight: 1.4,
  },
  table: {
    width: "100%",
    marginTop: 20,
  },
  tableHeader: {
    flexDirection: "row-reverse",
    backgroundColor: "#4f95ff",
    color: "#ffffff",
    padding: 8,
    borderRadius: 4,
  },
  tableRow: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  colDesc: { flex: 4, textAlign: "right" },
  colQty: { flex: 1, textAlign: "center" },
  colPrice: { flex: 2, textAlign: "left" }, // numeric usually LTR? keeping align consistent
  colTotal: { flex: 2, textAlign: "left" },

  summary: {
    marginTop: 20,
    alignItems: "flex-start", // Left align for LTR numbers or adjust for RTL
    width: "40%",
    alignSelf: "flex-start", // PDF render is LTR by default layout, we need to handle alignment visually
    marginLeft: 0,
    marginRight: "auto", // Push to left (which is end in RTL visual flow but start in LTR coord system?)
  },
  summaryRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginBottom: 5,
    width: "100%",
  },
  summaryLabel: {
    fontWeight: "bold",
  },
  summaryValue: {
    // fontFamily: "Helvetica", // Removed to inherit Rubik
  },
  grandTotal: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    width: "100%",
  },
  grandTotalText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#4f95ff",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    color: "#9ca3af",
    fontSize: 8,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    paddingTop: 10,
  },
  hebrewText: {
    textAlign: "right", // Ensure right alignment for Hebrew
  },
});

const formatCurrency = (amount: number | string | null | undefined) => {
  if (amount == null) return "0.00";
  return Number(amount).toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = (date: Date | string | null) => {
  if (!date) return "";
  return new Date(date).toLocaleDateString("he-IL");
};

const getBusinessTypeLabel = (type: string | null | undefined): string => {
  switch (type) {
    case "exempt":
      return "עוסק פטור";
    case "licensed":
      return "עוסק מורשה";
    case "ltd":
      return "חברה בע״מ";
    default:
      return "";
  }
};

const QuotePdfTemplate = ({ quote }: QuotePdfTemplateProps) => {
  const vatRate = 0.18;
  const isVatExempt = quote.company.businessType === "exempt";
  const subtotal = Number(quote.total);
  // Cast to any since types might not be regenerated yet
  const isIncludeVat = (quote as any).isPriceWithVat;
  const businessTypeLabel = getBusinessTypeLabel(quote.company.businessType);

  let displaySubtotal = subtotal;
  let vatResult = 0;
  let finalTotal = subtotal;

  if (!isVatExempt) {
    if (isIncludeVat) {
      // Total includes VAT
      finalTotal = subtotal;
      displaySubtotal = finalTotal / (1 + vatRate);
      vatResult = finalTotal - displaySubtotal;
    } else {
      // Total is before VAT
      vatResult = subtotal * vatRate;
      finalTotal = subtotal + vatResult;
    }
  } else {
    // Exempt
    vatResult = 0;
    finalTotal = subtotal;
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRight}>
            <Text style={styles.title}>הצעת מחיר</Text>
            <Text style={styles.subtitle}>
              #
              {quote.quoteNumber
                ? String(quote.quoteNumber).padStart(5, "0")
                : quote.id.slice(-6).toUpperCase()}
            </Text>
            <Text style={[styles.subtitle, { marginTop: 4 }]}>
              תאריך: {formatDate(quote.createdAt)}
            </Text>
            {quote.validUntil && (
              <Text style={styles.subtitle}>
                בתוקף עד: {formatDate(quote.validUntil)}
              </Text>
            )}
          </View>

          <View style={styles.headerLeft}>
            {quote.company.logoUrl && (
              <Image
                src={quote.company.logoUrl}
                style={{ width: 50, height: 50, marginBottom: 5 }}
              />
            )}
            <Text style={[styles.companyName, styles.hebrewText]}>
              {quote.company.name}
            </Text>
            <Text style={[styles.subtitle, styles.hebrewText]}>
              {businessTypeLabel}{" "}
              {quote.company.taxId ? `/ ${quote.company.taxId}` : ""}
            </Text>
          </View>
        </View>

        {/* Client & Company Details */}
        <View style={styles.gridTwo}>
          <View style={styles.column}>
            <Text style={[styles.label, styles.hebrewText]}>עבור:</Text>
            <Text style={[styles.value, styles.hebrewText]}>
              {quote.clientName}
            </Text>
            {quote.clientTaxId && (
              <Text style={[styles.value, styles.hebrewText]}>
                ח.פ / ת.ז: {quote.clientTaxId}
              </Text>
            )}
            {quote.clientAddress && (
              <Text style={[styles.value, styles.hebrewText]}>
                {quote.clientAddress}
              </Text>
            )}
            {quote.clientPhone && (
              <Text style={[styles.value, styles.hebrewText]}>
                {quote.clientPhone}
              </Text>
            )}
          </View>

          <View style={styles.column}>
            <Text style={[styles.label, styles.hebrewText]}>מאת:</Text>
            <Text style={[styles.value, styles.hebrewText]}>
              {quote.company.name}
            </Text>
            {quote.company.businessAddress && (
              <Text style={[styles.value, styles.hebrewText]}>
                {quote.company.businessAddress}
              </Text>
            )}
            {quote.company.businessEmail && (
              <Text style={[styles.value, styles.hebrewText]}>
                {quote.company.businessEmail}
              </Text>
            )}
          </View>
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDesc}>תיאור</Text>
            <Text style={styles.colQty}>כמות</Text>
            <Text style={styles.colPrice}>מחיר יחידה</Text>
            <Text style={styles.colTotal}>סה״כ</Text>
          </View>

          {quote.items.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <View style={styles.colDesc}>
                <Text style={[styles.hebrewText, { fontWeight: "bold" }]}>
                  {item.product?.name || "פריט כללי"}
                </Text>
                {item.description && (
                  <Text
                    style={[
                      styles.hebrewText,
                      { color: "#6b7280", fontSize: 9 },
                    ]}
                  >
                    {item.description}
                  </Text>
                )}
              </View>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colPrice}>
                ₪{formatCurrency(Number(item.unitPrice))}
              </Text>
              <Text style={styles.colTotal}>
                ₪
                {formatCurrency(Number(item.quantity) * Number(item.unitPrice))}
              </Text>
            </View>
          ))}
        </View>

        {/* Summary */}
        <View style={{ flexDirection: "row", marginTop: 20 }}>
          <View style={{ flex: 1 }} />
          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                סיכום ביניים{isIncludeVat && !isVatExempt ? " (לפני מע״מ)" : ""}
                :
              </Text>
              <Text style={styles.summaryValue}>
                ₪{formatCurrency(displaySubtotal)}
              </Text>
            </View>
            {!isVatExempt ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  מע״מ ({(vatRate * 100).toFixed(0)}%):
                </Text>
                <Text style={styles.summaryValue}>
                  ₪{formatCurrency(vatResult)}
                </Text>
              </View>
            ) : (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>מע״מ:</Text>
                <Text style={styles.summaryValue}>פטור</Text>
              </View>
            )}
            <View style={styles.grandTotal}>
              <Text style={[styles.grandTotalText, { fontSize: 12 }]}>
                סה״כ לתשלום:
              </Text>
              <Text style={styles.grandTotalText}>
                ₪{formatCurrency(finalTotal)}
              </Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Powered by COOL CRM</Text>
          <Text style={{ marginTop: 4 }}>
            מסמך זה הינו הצעת מחיר ואינו מהווה חשבונית מס.
          </Text>
        </View>
      </Page>
    </Document>
  );
};

export default QuotePdfTemplate;
