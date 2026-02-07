import "server-only";

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { Quote, Company, QuoteItem, Product, Client } from "@prisma/client";

type CompanyWithSettings = Company & {
  businessType?: string | null;
  taxId?: string | null;
  businessAddress?: string | null;
  businessWebsite?: string | null;
  businessEmail?: string | null;
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

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Rubik",
    fontSize: 10,
    color: "#111827",
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
    color: "#111827",
  },
  quoteNumber: {
    fontSize: 9,
    color: "#9ca3af",
    marginTop: 2,
  },
  companyName: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#111827",
    textAlign: "left",
  },
  companySubtext: {
    fontSize: 8,
    color: "#9ca3af",
    textAlign: "left",
    marginTop: 2,
  },
  quoteTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#374151",
    textAlign: "right",
    marginBottom: 8,
  },
  separator: {
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
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
    color: "#6b7280",
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
    color: "#6b7280",
    textAlign: "right",
  },
  totalsValue: {
    fontSize: 8,
    color: "#6b7280",
  },
  grandTotalLine: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 4,
    marginTop: 2,
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#111827",
    textAlign: "right",
  },
  grandTotalValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#111827",
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
    color: "#9ca3af",
    marginBottom: 3,
    textAlign: "right",
  },
  infoText: {
    fontSize: 9,
    color: "#374151",
    marginBottom: 1,
    textAlign: "right",
  },
  infoTextBold: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#111827",
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
    borderBottomColor: "#e5e7eb",
    paddingBottom: 6,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    paddingVertical: 6,
  },
  colNum: { width: "5%", textAlign: "right" },
  colDesc: { width: "45%", textAlign: "right", paddingHorizontal: 4 },
  colQty: { width: "12%", textAlign: "center" },
  colPrice: { width: "18%", textAlign: "left" },
  colTotal: { width: "20%", textAlign: "left" },
  thText: {
    fontSize: 8,
    color: "#9ca3af",
  },
  tdNum: {
    fontSize: 8,
    color: "#9ca3af",
  },
  tdName: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#111827",
    textAlign: "right",
  },
  tdDesc: {
    fontSize: 8,
    color: "#9ca3af",
    textAlign: "right",
    marginTop: 1,
  },
  tdText: {
    fontSize: 9,
    color: "#374151",
  },
  tdBold: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#111827",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    color: "#9ca3af",
    fontSize: 7,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    paddingTop: 8,
  },
  hebrewText: {
    textAlign: "right",
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

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>הצעת מחיר</Text>
            <Text style={styles.quoteNumber}>#{quoteNumber}</Text>
          </View>
          <View>
            <Text style={styles.companyName}>{quote.company.name}</Text>
            {businessTypeLabel && quote.company.taxId && (
              <Text style={styles.companySubtext}>
                {businessTypeLabel} | {quote.company.taxId}
              </Text>
            )}
          </View>
        </View>

        {/* Title */}
        {(quote as any).title && (
          <Text style={styles.quoteTitle}>{(quote as any).title}</Text>
        )}

        {/* Separator */}
        <View style={styles.separator} />

        {/* Totals BEFORE items */}
        <View style={styles.totalsRow}>
          <View style={styles.dateInfo}>
            <Text style={styles.dateText}>
              תאריך: {formatDate(quote.createdAt)}
            </Text>
            {quote.validUntil && (
              <Text style={styles.dateText}>
                בתוקף עד: {formatDate(quote.validUntil)}
              </Text>
            )}
          </View>
          <View style={styles.totalsBlock}>
            {!isVatExempt && (
              <>
                <View style={styles.totalsLine}>
                  <Text style={styles.totalsLabel}>
                    סיכום{isIncludeVat ? " (לפני מע״מ)" : ""}
                  </Text>
                  <Text style={styles.totalsValue}>
                    ₪{formatCurrency(displaySubtotal)}
                  </Text>
                </View>
                <View style={styles.totalsLine}>
                  <Text style={styles.totalsLabel}>מע״מ (18%)</Text>
                  <Text style={styles.totalsValue}>
                    ₪{formatCurrency(vatResult)}
                  </Text>
                </View>
              </>
            )}
            {isVatExempt && (
              <View style={styles.totalsLine}>
                <Text style={styles.totalsLabel}>פטור ממע״מ</Text>
              </View>
            )}
            <View style={styles.grandTotalLine}>
              <Text style={styles.grandTotalLabel}>סה״כ</Text>
              <Text style={styles.grandTotalValue}>
                ₪{formatCurrency(finalTotal)}
              </Text>
            </View>
          </View>
        </View>

        {/* Client & Company Info */}
        <View style={styles.infoGrid}>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>עבור</Text>
            <Text style={styles.infoTextBold}>{quote.clientName}</Text>
            {quote.clientTaxId && (
              <Text style={styles.infoText}>
                ח.פ / ת.ז: {quote.clientTaxId}
              </Text>
            )}
            {quote.clientAddress && (
              <Text style={styles.infoText}>{quote.clientAddress}</Text>
            )}
            {quote.clientPhone && (
              <Text style={styles.infoText}>{quote.clientPhone}</Text>
            )}
          </View>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>מאת</Text>
            <Text style={styles.infoTextBold}>{quote.company.name}</Text>
            {quote.company.businessAddress && (
              <Text style={styles.infoText}>
                {quote.company.businessAddress}
              </Text>
            )}
            {quote.company.businessEmail && (
              <Text style={styles.infoText}>
                {quote.company.businessEmail}
              </Text>
            )}
          </View>
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={styles.colNum}>
              <Text style={styles.thText}>#</Text>
            </View>
            <View style={styles.colDesc}>
              <Text style={styles.thText}>תיאור</Text>
            </View>
            <View style={styles.colQty}>
              <Text style={styles.thText}>כמות</Text>
            </View>
            <View style={styles.colPrice}>
              <Text style={styles.thText}>מחיר יחידה</Text>
            </View>
            <View style={styles.colTotal}>
              <Text style={styles.thText}>סה״כ</Text>
            </View>
          </View>

          {quote.items.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <View style={styles.colNum}>
                <Text style={styles.tdNum}>{index + 1}</Text>
              </View>
              <View style={styles.colDesc}>
                <Text style={styles.tdName}>
                  {item.product?.name || "פריט כללי"}
                </Text>
                {item.description && (
                  <Text style={styles.tdDesc}>{item.description}</Text>
                )}
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
                  ₪{formatCurrency(Number(item.quantity) * Number(item.unitPrice))}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>
            מסמך זה הינו הצעת מחיר ואינו מהווה חשבונית מס.
          </Text>
        </View>
      </Page>
    </Document>
  );
};

export default QuotePdfTemplate;
