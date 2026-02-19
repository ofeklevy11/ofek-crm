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
    paddingTop: 0,
    paddingBottom: 40,
    paddingHorizontal: 40,
    fontFamily: "Rubik",
    fontSize: 10,
    color: colors.black,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center", // Align vertically
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
    width: "45%",
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

const CURRENCY_SYMBOLS: Record<string, string> = {
  ILS: "₪",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

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

// Import toVisual for Hebrew text handling
import RTLText from "./RTLText";
const QuotePdfTemplate = ({ quote }: QuotePdfTemplateProps) => {
  const vatRate = 0.18;
  const isVatExempt = quote.company.businessType === "exempt";
  const total = Number(quote.total);
  const isIncludeVat = (quote as any).isPriceWithVat;
  const businessTypeLabel = String(
    getBusinessTypeLabel(quote.company.businessType) || "",
  );

  const currency = (quote as any).currency || "ILS";
  const sym = CURRENCY_SYMBOLS[currency] || "₪";

  const discountType = (quote as any).discountType || null;
  const discountValue = (quote as any).discountValue ? Number((quote as any).discountValue) : 0;

  let discountAmount = 0;
  if (discountType === "percent" && discountValue > 0) {
    discountAmount = total * (discountValue / 100);
  } else if (discountType === "fixed" && discountValue > 0) {
    discountAmount = discountValue;
  }
  const totalAfterDiscount = total - discountAmount;
  const hasDiscount = discountAmount > 0;

  let displaySubtotal = totalAfterDiscount;
  let vatResult = 0;
  let finalTotal = totalAfterDiscount;

  if (!isVatExempt) {
    if (isIncludeVat) {
      finalTotal = totalAfterDiscount;
      displaySubtotal = finalTotal / (1 + vatRate);
      vatResult = finalTotal - displaySubtotal;
    } else {
      vatResult = totalAfterDiscount * vatRate;
      finalTotal = totalAfterDiscount + vatResult;
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
            <RTLText style={styles.title}>הצעת מחיר</RTLText>
            <RTLText style={styles.quoteNumber}>
              {`#${String(quoteNumber ?? "")}`}
            </RTLText>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {quote.company.logoUrl && (
              <Image
                src={quote.company.logoUrl}
                style={{ width: 120, height: 120, objectFit: "contain" }}
              />
            )}
            <View>
              <RTLText style={styles.companyName}>
                {String(quote.company.name ?? "")}
              </RTLText>
              {businessTypeLabel && (
                <RTLText style={styles.companySubtext}>
                  {`${businessTypeLabel} | ${String(quote.company.taxId ?? "")}`}
                </RTLText>
              )}
            </View>
          </View>
        </View>

        {/* Title */}
        {(quote as any).title ? (
          <RTLText style={styles.quoteTitle}>
            {String((quote as any).title ?? "")}
          </RTLText>
        ) : null}

        {/* Separator */}
        <View style={styles.separator} />

        {/* Totals BEFORE items */}
        <View style={styles.totalsRow}>
          <View style={styles.dateInfo}>
            <View
              style={{
                flexDirection: "row-reverse",
                justifyContent: "flex-start",
                marginBottom: 2,
                alignItems: "center",
              }}
            >
              <RTLText style={styles.dateText}>תאריך:</RTLText>
              <Text style={[styles.dateText, { marginRight: 4 }]}>
                {formatDate(quote.createdAt)}
              </Text>
            </View>
            {quote.validUntil ? (
              <View
                style={{
                  flexDirection: "row-reverse",
                  justifyContent: "flex-start",
                  marginBottom: 2,
                  alignItems: "center",
                }}
              >
                <RTLText style={styles.dateText}>בתוקף עד:</RTLText>
                <Text style={[styles.dateText, { marginRight: 4 }]}>
                  {formatDate(quote.validUntil)}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.totalsBlock}>
            {hasDiscount ? (
              <>
                <View style={styles.totalsLine}>
                  <RTLText style={styles.totalsLabel}>סה״כ פריטים</RTLText>
                  <Text style={styles.totalsValue}>
                    {sym}{formatCurrency(total)}
                  </Text>
                </View>
                <View style={styles.totalsLine}>
                  <RTLText style={[styles.totalsLabel, { color: "#16a34a" }]}>
                    {`הנחה${discountType === "percent" ? ` (${discountValue}%)` : ""}`}
                  </RTLText>
                  <Text style={[styles.totalsValue, { color: "#16a34a" }]}>
                    -{sym}{formatCurrency(discountAmount)}
                  </Text>
                </View>
              </>
            ) : null}
            {!isVatExempt && (
              <>
                <View style={styles.totalsLine}>
                  <RTLText style={styles.totalsLabel}>
                    {`סיכום${isIncludeVat ? " (לפני מע״מ)" : ""}`}
                  </RTLText>
                  <Text style={styles.totalsValue}>
                    {sym}{formatCurrency(displaySubtotal)}
                  </Text>
                </View>
                <View style={[styles.totalsLine, { alignItems: "center" }]}>
                  <View
                    style={{
                      flexDirection: "row-reverse",
                      alignItems: "center",
                    }}
                  >
                    <RTLText style={styles.totalsLabel}>מע״מ</RTLText>
                    <Text style={[styles.totalsLabel, { marginRight: 4 }]}>
                      (18%)
                    </Text>
                  </View>
                  <Text style={styles.totalsValue}>
                    {sym}{formatCurrency(vatResult)}
                  </Text>
                </View>
              </>
            )}
            {isVatExempt && (
              <View style={styles.totalsLine}>
                <RTLText style={styles.totalsLabel}>פטור ממע״מ</RTLText>
              </View>
            )}
            <View style={styles.grandTotalLine}>
              <RTLText style={styles.grandTotalLabel}>סה״כ</RTLText>
              <Text style={styles.grandTotalValue}>
                {sym}{formatCurrency(finalTotal)}
              </Text>
            </View>
          </View>
        </View>

        {/* Client & Company Info */}
        <View style={styles.infoGrid}>
          <View style={styles.infoColumn}>
            <RTLText style={styles.infoLabel}>עבור</RTLText>
            <RTLText style={styles.infoTextBold}>
              {String(quote.clientName ?? "")}
            </RTLText>
            {quote.clientTaxId && (
              <RTLText style={styles.infoText}>
                {`ח.פ / ת.ז: ${quote.clientTaxId}`}
              </RTLText>
            )}
            {quote.clientAddress && (
              <RTLText style={styles.infoText}>{quote.clientAddress}</RTLText>
            )}
            {quote.clientPhone && (
              <RTLText style={styles.infoText}>{quote.clientPhone}</RTLText>
            )}
          </View>
          <View style={styles.infoColumn}>
            <RTLText style={styles.infoLabel}>מאת</RTLText>
            <RTLText style={styles.infoTextBold}>
              {String(quote.company.name ?? "")}
            </RTLText>
            {quote.company.businessAddress ? (
              <RTLText style={styles.infoText}>
                {String(quote.company.businessAddress ?? "")}
              </RTLText>
            ) : null}
            {quote.company.businessEmail ? (
              <Text style={styles.infoText}>
                {String(quote.company.businessEmail ?? "")}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Items Table - no description in rows */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={styles.colNum}>
              <Text style={styles.thText}>#</Text>
            </View>
            <View style={styles.colDesc}>
              <RTLText style={styles.thText}>תיאור</RTLText>
            </View>
            <View style={styles.colQty}>
              <RTLText style={styles.thText}>כמות</RTLText>
            </View>
            <View style={styles.colPrice}>
              <RTLText style={styles.thText}>מחיר יחידה</RTLText>
            </View>
            <View style={styles.colTotal}>
              <RTLText style={styles.thText}>סה״כ</RTLText>
            </View>
          </View>

          {quote.items.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <View style={styles.colNum}>
                <Text style={styles.tdNum}>{index + 1}</Text>
              </View>
              <View style={styles.colDesc}>
                <RTLText style={styles.tdName}>
                  {String(item.product?.name || "פריט כללי")}
                </RTLText>
              </View>
              <View style={styles.colQty}>
                <Text style={styles.tdText}>{item.quantity}</Text>
              </View>
              <View style={styles.colPrice}>
                <Text style={styles.tdText}>
                  {sym}{formatCurrency(Number(item.unitPrice))}
                </Text>
              </View>
              <View style={styles.colTotal}>
                <Text style={styles.tdBold}>
                  {sym}
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
            <RTLText style={styles.descriptionHeading}>הערות נוספות</RTLText>
            {quote.items
              .filter((item) => item.description)
              .map((item, index) => (
                <View key={index} style={styles.descriptionItem}>
                  <RTLText style={styles.descriptionItemTitle}>
                    {String(item.product?.name || "פריט כללי")}
                  </RTLText>
                  <RTLText style={styles.descriptionItemText}>
                    {String(item.description ?? "")}
                  </RTLText>
                </View>
              ))}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text>מסמך זה הינו הצעת מחיר ואינו מהווה חשבונית מס</Text>
        </View>
      </Page>
    </Document>
  );
};

export default QuotePdfTemplate;
