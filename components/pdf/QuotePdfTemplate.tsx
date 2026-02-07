import "server-only";

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";
import { Quote, Company, QuoteItem, Product, Client } from "@prisma/client";

type CompanyWithSettings = Company & {
  businessType?: string | null;
  taxId?: string | null;
  businessAddress?: string | null;
  businessWebsite?: string | null;
  businessEmail?: string | null;
  logoUrl?: string | null;
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

// Color palette - light black instead of gray
const colors = {
  black: "#111827",
  dark: "#1f2937",
  medium: "#374151",
  light: "#4b5563",
  subtle: "#6b7280",
  border: "#e5e7eb",
  borderLight: "#f3f4f6",
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Rubik",
    fontSize: 10,
    color: colors.black,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.black,
  },
  quoteNumber: {
    fontSize: 9,
    color: colors.subtle,
    marginTop: 2,
  },
  companyName: {
    fontSize: 11,
    fontWeight: "bold",
    color: colors.black,
    textAlign: "left",
  },
  companySubtext: {
    fontSize: 8,
    color: colors.subtle,
    textAlign: "left",
    marginTop: 2,
  },
  quoteTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: colors.medium,
    textAlign: "right",
    marginBottom: 8,
  },
  separator: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 16,
  },
  totalsRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 20,
  },
  dateInfo: {
    textAlign: "right",
  },
  dateText: {
    fontSize: 8,
    color: colors.light,
    marginBottom: 2,
  },
  totalsBlock: {
    alignItems: "flex-start",
    width: "35%",
  },
  totalsLine: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 3,
  },
  totalsLabel: {
    fontSize: 8,
    color: colors.light,
    textAlign: "right",
  },
  totalsValue: {
    fontSize: 8,
    color: colors.light,
  },
  grandTotalLine: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 4,
    marginTop: 2,
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: colors.black,
    textAlign: "right",
  },
  grandTotalValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: colors.black,
  },
  infoGrid: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  infoColumn: {
    width: "45%",
  },
  infoLabel: {
    fontSize: 8,
    color: colors.subtle,
    marginBottom: 3,
    textAlign: "right",
  },
  infoText: {
    fontSize: 9,
    color: colors.medium,
    marginBottom: 1,
    textAlign: "right",
  },
  infoTextBold: {
    fontSize: 9,
    fontWeight: "bold",
    color: colors.black,
    marginBottom: 1,
    textAlign: "right",
  },
  table: {
    width: "100%",
    marginTop: 8,
  },
  tableHeader: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 6,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingVertical: 6,
  },
  colNum: { width: "5%", textAlign: "right" },
  colDesc: { width: "45%", textAlign: "right", paddingHorizontal: 4 },
  colQty: { width: "12%", textAlign: "center" },
  colPrice: { width: "18%", textAlign: "left" },
  colTotal: { width: "20%", textAlign: "left" },
  thText: {
    fontSize: 8,
    color: colors.subtle,
  },
  tdNum: {
    fontSize: 8,
    color: colors.subtle,
  },
  tdName: {
    fontSize: 9,
    fontWeight: "bold",
    color: colors.black,
    textAlign: "right",
  },
  tdText: {
    fontSize: 9,
    color: colors.medium,
  },
  tdBold: {
    fontSize: 9,
    fontWeight: "bold",
    color: colors.black,
  },
  // Full-width description section
  descriptionSection: {
    marginTop: 20,
  },
  descriptionHeading: {
    fontSize: 10,
    fontWeight: "bold",
    color: colors.black,
    textAlign: "right",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 6,
    marginBottom: 10,
  },
  descriptionItem: {
    marginBottom: 10,
  },
  descriptionItemTitle: {
    fontSize: 9,
    fontWeight: "bold",
    color: colors.dark,
    textAlign: "right",
    marginBottom: 3,
  },
  descriptionItemText: {
    fontSize: 9,
    color: colors.medium,
    textAlign: "right",
    lineHeight: 1.6,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    color: colors.subtle,
    fontSize: 7,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: 8,
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

import { toVisual } from "@/lib/bidi-engine";

const QuotePdfTemplate = ({ quote }: QuotePdfTemplateProps) => {
  const vatRate = 0.18;
  const isVatExempt = quote.company.businessType === "exempt";
  const total = Number(quote.total);
  const isIncludeVat = (quote as any).isPriceWithVat;
  const businessTypeLabel = getBusinessTypeLabel(quote.company.businessType);

  let displaySubtotal = total;
  let vatResult = 0;
  let finalTotal = total;

  if (!isVatExempt) {
    if (isIncludeVat) {
      finalTotal = total;
      displaySubtotal = finalTotal / (1 + vatRate);
      vatResult = finalTotal - displaySubtotal;
    } else {
      vatResult = total * vatRate;
      finalTotal = total + vatResult;
    }
  }

  const quoteNumber = quote.quoteNumber
    ? String(quote.quoteNumber).padStart(5, "0")
    : quote.id.slice(-6).toUpperCase();

  const hasDescriptions = quote.items.some((item) => item.description);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{toVisual("הצעת מחיר")}</Text>
            <Text style={styles.quoteNumber}>#{toVisual(quoteNumber)}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {quote.company.logoUrl && (
              <Image
                src={quote.company.logoUrl}
                style={{ width: 40, height: 40, objectFit: "contain" }}
              />
            )}
            <View>
              <Text style={styles.companyName}>
                {toVisual(quote.company.name)}
              </Text>
              {businessTypeLabel && quote.company.taxId && (
                <Text style={styles.companySubtext}>
                  {toVisual(`${businessTypeLabel} | ${quote.company.taxId}`)}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Title */}
        {(quote as any).title && (
          <Text style={styles.quoteTitle}>
            {toVisual((quote as any).title)}
          </Text>
        )}

        {/* Separator */}
        <View style={styles.separator} />

        {/* Totals BEFORE items */}
        <View style={styles.totalsRow}>
          <View style={styles.dateInfo}>
            <Text style={styles.dateText}>
              {toVisual(`תאריך: ${formatDate(quote.createdAt)}`)}
            </Text>
            {quote.validUntil && (
              <Text style={styles.dateText}>
                {toVisual(`בתוקף עד: ${formatDate(quote.validUntil)}`)}
              </Text>
            )}
          </View>
          <View style={styles.totalsBlock}>
            {!isVatExempt && (
              <>
                <View style={styles.totalsLine}>
                  <Text style={styles.totalsLabel}>
                    {toVisual(`סיכום${isIncludeVat ? " (לפני מע״מ)" : ""}`)}
                  </Text>
                  <Text style={styles.totalsValue}>
                    ₪{formatCurrency(displaySubtotal)}
                  </Text>
                </View>
                <View style={styles.totalsLine}>
                  <Text style={styles.totalsLabel}>
                    {toVisual("מע״מ (18%)")}
                  </Text>
                  <Text style={styles.totalsValue}>
                    ₪{formatCurrency(vatResult)}
                  </Text>
                </View>
              </>
            )}
            {isVatExempt && (
              <View style={styles.totalsLine}>
                <Text style={styles.totalsLabel}>{toVisual("פטור ממע״מ")}</Text>
              </View>
            )}
            <View style={styles.grandTotalLine}>
              <Text style={styles.grandTotalLabel}>{toVisual("סה״כ")}</Text>
              <Text style={styles.grandTotalValue}>
                ₪{formatCurrency(finalTotal)}
              </Text>
            </View>
          </View>
        </View>

        {/* Client & Company Info */}
        <View style={styles.infoGrid}>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>{toVisual("עבור")}</Text>
            <Text style={styles.infoTextBold}>
              {toVisual(quote.clientName)}
            </Text>
            {quote.clientTaxId && (
              <Text style={styles.infoText}>
                {toVisual(`ח.פ / ת.ז: ${quote.clientTaxId}`)}
              </Text>
            )}
            {quote.clientAddress && (
              <Text style={styles.infoText}>
                {toVisual(quote.clientAddress)}
              </Text>
            )}
            {quote.clientPhone && (
              <Text style={styles.infoText}>{toVisual(quote.clientPhone)}</Text>
            )}
          </View>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>{toVisual("מאת")}</Text>
            <Text style={styles.infoTextBold}>
              {toVisual(quote.company.name)}
            </Text>
            {quote.company.businessAddress && (
              <Text style={styles.infoText}>
                {toVisual(quote.company.businessAddress)}
              </Text>
            )}
            {quote.company.businessEmail && (
              <Text style={styles.infoText}>{quote.company.businessEmail}</Text>
            )}
          </View>
        </View>

        {/* Items Table - no description in rows */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={styles.colNum}>
              <Text style={styles.thText}>#</Text>
            </View>
            <View style={styles.colDesc}>
              <Text style={styles.thText}>{toVisual("תיאור")}</Text>
            </View>
            <View style={styles.colQty}>
              <Text style={styles.thText}>{toVisual("כמות")}</Text>
            </View>
            <View style={styles.colPrice}>
              <Text style={styles.thText}>{toVisual("מחיר יחידה")}</Text>
            </View>
            <View style={styles.colTotal}>
              <Text style={styles.thText}>{toVisual("סה״כ")}</Text>
            </View>
          </View>

          {quote.items.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <View style={styles.colNum}>
                <Text style={styles.tdNum}>{index + 1}</Text>
              </View>
              <View style={styles.colDesc}>
                <Text style={styles.tdName}>
                  {toVisual(item.product?.name || "פריט כללי")}
                </Text>
              </View>
              <View style={styles.colQty}>
                <Text style={styles.tdText}>{item.quantity}</Text>
              </View>
              <View style={styles.colPrice}>
                <Text style={styles.tdText}>
                  ₪{formatCurrency(Number(item.unitPrice))}
                </Text>
              </View>
              <View style={styles.colTotal}>
                <Text style={styles.tdBold}>
                  ₪
                  {formatCurrency(
                    Number(item.quantity) * Number(item.unitPrice),
                  )}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Full-width descriptions section */}
        {hasDescriptions && (
          <View style={styles.descriptionSection}>
            <Text style={styles.descriptionHeading}>
              {toVisual("הערות נוספות")}
            </Text>
            {quote.items.map((item, index) =>
              item.description ? (
                <View key={index} style={styles.descriptionItem}>
                  <Text style={styles.descriptionItemTitle}>
                    {toVisual(item.product?.name || "פריט כללי")}
                  </Text>
                  <Text style={styles.descriptionItemText}>
                    {toVisual(item.description!)}
                  </Text>
                </View>
              ) : null,
            )}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text>מסמך זה הינו הצעת מחיר ואינו מהווה חשבונית מס.</Text>
        </View>
      </Page>
    </Document>
  );
};

export default QuotePdfTemplate;
