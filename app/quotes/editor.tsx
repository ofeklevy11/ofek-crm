"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Trash, Plus, Printer, Save, ArrowRight } from "lucide-react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { addWeeks, addMonths, format } from "date-fns";
import { createQuote, updateQuote } from "@/app/actions/quotes";
import { getExchangeRate } from "@/app/actions/exchange-rate";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";
import { showAlert } from "@/hooks/use-modal";
import { isRateLimitError, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit-utils";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
// removed ui imports

const CURRENCY_SYMBOLS: Record<string, string> = {
  ILS: "₪",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

const CURRENCY_NAMES: Record<string, string> = {
  ILS: "₪ שקל ישראלי",
  USD: "$ דולר אמריקאי",
  EUR: "€ אירו",
  GBP: "£ לירה שטרלינג",
};

interface QuoteEditorProps {
  initialQuote?: any;
  clients: any[];
  products: any[];
  isVatExempt?: boolean;
}

export default function QuoteEditor({
  initialQuote,
  clients,
  products,
  isVatExempt = false,
}: QuoteEditorProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  useUnsavedChanges(isDirty);
  const [descriptionPopupIndex, setDescriptionPopupIndex] = useState<
    number | null
  >(null);
  const descFocusTrapRef = useFocusTrap(() => setDescriptionPopupIndex(null), descriptionPopupIndex !== null);

  const [formData, setFormData] = useState({
    clientId: initialQuote?.clientId?.toString() || "new",
    clientName: initialQuote?.clientName || "",
    clientEmail: initialQuote?.clientEmail || "",
    clientPhone: initialQuote?.clientPhone || "",
    clientAddress: initialQuote?.clientAddress || "",
    clientTaxId: initialQuote?.clientTaxId || "",
    validUntil: initialQuote?.validUntil
      ? new Date(initialQuote.validUntil).toISOString().split("T")[0]
      : "",
    status: initialQuote?.status || "DRAFT",
    isPriceWithVat: initialQuote?.isPriceWithVat ?? false,
    title: initialQuote?.title || "",
  });

  const [items, setItems] = useState<any[]>(initialQuote?.items || []);

  const [currency, setCurrency] = useState(initialQuote?.currency || "ILS");
  const [exchangeRate, setExchangeRate] = useState<number | null>(
    initialQuote?.exchangeRate ? Number(initialQuote.exchangeRate) : null,
  );
  const [loadingRate, setLoadingRate] = useState(false);

  const currencySymbol = CURRENCY_SYMBOLS[currency] || "₪";

  const prevCurrencyRef = useRef(currency);
  const prevExchangeRateRef = useRef(exchangeRate);
  const isUserCurrencyChange = useRef(false);

  useEffect(() => {
    const convertItems = (converter: (price: number) => number) => {
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          unitPrice: Math.round(converter(Number(item.unitPrice)) * 100) / 100,
          unitCost: Math.round(converter(Number(item.unitCost || 0)) * 100) / 100,
        })),
      );
      if (discountTypeRef.current === "fixed" && discountValueRef.current > 0) {
        setDiscountValue(Math.round(converter(discountValueRef.current) * 100) / 100);
      }
    };

    if (!isUserCurrencyChange.current) {
      // Initial load or programmatic change — just fetch rate, don't convert
      if (currency === "ILS") {
        setExchangeRate(null);
        return;
      }
      setLoadingRate(true);
      getExchangeRate(currency)
        .then((rate) => setExchangeRate(rate))
        .catch((err: any) => {
          toast.error(isRateLimitError(err) ? RATE_LIMIT_MESSAGE : "שגיאה בשליפת שער יציג", { id: "exchange-rate-error" });
          setCurrency("ILS");
          setExchangeRate(null);
        })
        .finally(() => setLoadingRate(false));
      return;
    }

    isUserCurrencyChange.current = false;
    const oldCurrency = prevCurrencyRef.current;
    const oldRate = prevExchangeRateRef.current;

    if (currency === "ILS") {
      // Switching to ILS: convert from foreign → ILS (multiply by old rate)
      if (oldCurrency !== "ILS" && oldRate) {
        convertItems((price) => price * oldRate);
      }
      setExchangeRate(null);
      return;
    }

    // Switching to a foreign currency — fetch new rate, then convert
    setLoadingRate(true);
    getExchangeRate(currency)
      .then((newRate) => {
        setExchangeRate(newRate);
        if (oldCurrency === "ILS") {
          // ILS → foreign: divide by new rate
          convertItems((price) => price / newRate);
        } else if (oldRate) {
          // Foreign → foreign: convert back to ILS then to new currency
          convertItems((price) => (price * oldRate) / newRate);
        }
      })
      .catch((err: any) => {
        toast.error(isRateLimitError(err) ? RATE_LIMIT_MESSAGE : "שגיאה בשליפת שער יציג", { id: "exchange-rate-error" });
        // Revert to previous currency
        setCurrency(oldCurrency);
        setExchangeRate(oldRate);
      })
      .finally(() => setLoadingRate(false));
  }, [currency]);

  const [discountType, setDiscountType] = useState<"none" | "percent" | "fixed">(
    initialQuote?.discountType || "none",
  );
  const [discountValue, setDiscountValue] = useState<number>(
    initialQuote?.discountValue ? Number(initialQuote.discountValue) : 0,
  );

  const discountTypeRef = useRef(discountType);
  const discountValueRef = useRef(discountValue);
  useEffect(() => { discountTypeRef.current = discountType; }, [discountType]);
  useEffect(() => { discountValueRef.current = discountValue; }, [discountValue]);

  const [customDuration, setCustomDuration] = useState(1);
  const [customUnit, setCustomUnit] = useState<"weeks" | "months">("months");

  const applyDuration = (duration: number, unit: "weeks" | "months") => {
    const today = new Date();
    const newDate =
      unit === "weeks" ? addWeeks(today, duration) : addMonths(today, duration);

    setFormData((prev) => ({
      ...prev,
      validUntil: format(newDate, "yyyy-MM-dd"),
    }));
    setIsDirty(true);
  };

  const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    // ... existing client logic ...
    const clientId = e.target.value;
    setIsDirty(true);
    if (clientId === "new") {
      setFormData((prev) => ({
        ...prev,
        clientId: "new",
        clientName: "",
        clientEmail: "",
        clientPhone: "",
        clientAddress: "",
        clientTaxId: "",
      }));
      return;
    }
    const client = clients.find((c) => c.id.toString() === clientId);
    if (client) {
      setFormData((prev) => ({
        ...prev,
        clientId: client.id.toString(),
        clientName: client.name,
        clientEmail: client.email || "",
        clientPhone: client.phone || "",
        clientAddress: client.address || "",
        clientTaxId: "",
      }));
    } else {
      setFormData((prev) => ({ ...prev, clientId }));
    }
  };

  const addItem = () => {
    // ... existing addItem logic ...
    setItems([
      ...items,
      {
        productId: null,
        description: "",
        quantity: 1,
        unitPrice: 0,
        unitCost: 0,
      },
    ]);
    setIsDirty(true);
  };

  // ... removeItem and others ...

  const removeItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
    setIsDirty(true);
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];

    if (field === "productId") {
      if (value === "custom") {
        newItems[index] = { ...newItems[index], productId: null };
      } else {
        const product = products.find(
          (p) => p.id.toString() === value.toString(),
        );
        if (product) {
          const ilsPrice = Number(product.price);
          const ilsCost = Number(product.cost || 0);
          const displayPrice = currency !== "ILS" && exchangeRate ? ilsPrice / exchangeRate : ilsPrice;
          const displayCost = currency !== "ILS" && exchangeRate ? ilsCost / exchangeRate : ilsCost;
          newItems[index] = {
            ...newItems[index],
            productId: product.id,
            description: product.description || product.name,
            unitPrice: Math.round(displayPrice * 100) / 100,
            unitCost: Math.round(displayCost * 100) / 100,
          };
        }
      }
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setItems(newItems);
    setIsDirty(true);
  };

  const updateFormData = (updates: Partial<typeof formData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
    setIsDirty(true);
  };

  const handleBack = () => {
    if (isDirty) {
      toast.warning("יש שינויים שלא נשמרו בהצעת המחיר");
      return;
    }
    router.push("/quotes");
  };

  const total = useMemo(
    () => items.reduce((acc, item) => acc + Number(item.quantity) * Number(item.unitPrice), 0),
    [items],
  );

  const totalCost = useMemo(
    () => items.reduce((acc, item) => acc + Number(item.quantity) * Number(item.unitCost || 0), 0),
    [items],
  );

  const discount = useMemo(() => {
    if (discountType === "none" || discountValue <= 0) return 0;
    if (discountType === "percent") return total * (discountValue / 100);
    return discountValue;
  }, [discountType, discountValue, total]);

  const totalAfterDiscount = total - discount;

  const vatRate = 0.18;

  const {
    subtotalBeforeDiscount: displaySubtotalBeforeDiscount,
    discount: displayDiscount,
    subtotal: displaySubtotal,
    vat: displayVat,
    finalTotal: displayTotal,
  } = useMemo(() => {
    if (isVatExempt) {
      return {
        subtotalBeforeDiscount: total,
        discount,
        subtotal: totalAfterDiscount,
        vat: 0,
        finalTotal: totalAfterDiscount,
      };
    }
    if (formData.isPriceWithVat) {
      const net = totalAfterDiscount / (1 + vatRate);
      const vat = totalAfterDiscount - net;
      return { subtotalBeforeDiscount: total, discount, subtotal: net, vat, finalTotal: totalAfterDiscount };
    }
    const vat = totalAfterDiscount * vatRate;
    return { subtotalBeforeDiscount: total, discount, subtotal: totalAfterDiscount, vat, finalTotal: totalAfterDiscount + vat };
  }, [total, discount, totalAfterDiscount, isVatExempt, formData.isPriceWithVat]);

  // Margin always calculated from Net Income vs Cost
  const revenue = isVatExempt
    ? totalAfterDiscount
    : formData.isPriceWithVat
      ? totalAfterDiscount / (1 + vatRate)
      : totalAfterDiscount;

  const margin = revenue - totalCost;
  const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;

  const handleSave = async () => {
    if (loading) return;

    if (!formData.clientName) {
      showAlert("נדרש שם לקוח");
      return;
    }
    if (items.length === 0) {
      showAlert("הוסף לפחות פריט אחד");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        clientId:
          formData.clientId === "new" ? undefined : parseInt(formData.clientId),
        clientName: formData.clientName,
        clientEmail: formData.clientEmail,
        clientPhone: formData.clientPhone,
        clientTaxId: formData.clientTaxId || undefined,
        clientAddress: formData.clientAddress,
        validUntil: formData.validUntil
          ? new Date(formData.validUntil)
          : undefined,
        status: formData.status,
        title: formData.title || undefined,
        items: items.map((item) => ({
          productId: item.productId ? parseInt(item.productId) : undefined,
          description: item.description,
          quantity: Math.round(parseFloat(item.quantity.toString())), // Ensure integer for schema compatibility
          unitPrice: parseFloat(item.unitPrice.toString()),
          unitCost: parseFloat(item.unitCost?.toString() || "0"),
        })),
        isPriceWithVat: formData.isPriceWithVat,
        currency,
        exchangeRate: exchangeRate || undefined,
        discountType: discountType !== "none" ? discountType : undefined,
        discountValue: discountType !== "none" && discountValue > 0 ? discountValue : undefined,
      };

      if (initialQuote) {
        await updateQuote(initialQuote.id, payload);
        router.refresh();
        toast.success("הצעת המחיר עודכנה בהצלחה");
        setIsDirty(false);
        setLoading(false);
      } else {
        const newQuote = await createQuote(payload);
        toast.success("הצעת המחיר נוצרה בהצלחה");
        setIsDirty(false);
        // Redirect to print/pdf page as requested
        router.push(`/quotes/${newQuote.id}/pdf`);
        router.refresh();
      }
    } catch (error: any) {
      console.error(error);
      toast.error(getUserFriendlyError(error));
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button onClick={handleBack} data-testid="back-button" className="p-2 hover:bg-gray-100 rounded-full text-gray-600" aria-label="חזרה להצעות מחיר">
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              {initialQuote
                ? `עריכת הצעה #${
                    initialQuote.quoteNumber
                      ? String(initialQuote.quoteNumber).padStart(5, "0")
                      : initialQuote.id.slice(-6).toUpperCase()
                  }`
                : "הצעת מחיר חדשה"}
            </h1>
            <p className="text-gray-500">
              {initialQuote ? "ניהול פרטי ההצעה" : "יצירת הצעה חדשה"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {initialQuote && (
            <button
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 font-medium transition-colors"
              onClick={() =>
                window.open(`/quotes/${initialQuote.id}/pdf`, "_blank")
              }
              aria-label="הדפסה / PDF / שליחה בWhatsapp (נפתח בחלון חדש)"
            >
              <Printer className="w-4 h-4" aria-hidden="true" /> הדפסה / PDF / שליחה בWhatsapp
            </button>
          )}
          <button
            className="flex items-center gap-2 px-4 py-2 bg-[#4f95ff] text-white rounded-md hover:bg-[#3d7de0] font-medium transition-colors disabled:opacity-50"
            onClick={handleSave}
            disabled={loading}
            aria-live="polite"
          >
            <Save className="w-4 h-4" aria-hidden="true" /> {loading ? "שומר..." : "שמור הצעה"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="font-semibold text-gray-900">פרטי לקוח</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="client-select" className="block text-sm font-medium text-gray-700">
                בחר לקוח
              </label>
              <select
                id="client-select"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#4f95ff] outline-none bg-white"
                value={formData.clientId}
                onChange={handleClientChange}
              >
                <option value="new">+ לקוח חדש (הזנה ידנית)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="client-name" className="block text-sm font-medium text-gray-700">
                  שם לקוח <span className="text-red-500" aria-hidden="true">*</span>
                </label>
                <input
                  id="client-name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#4f95ff] outline-none bg-white"
                  value={formData.clientName}
                  onChange={(e) =>
                    updateFormData({ clientName: e.target.value })
                  }
                  aria-required="true"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="client-email" className="block text-sm font-medium text-gray-700">
                  דוא״ל
                </label>
                <input
                  id="client-email"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#4f95ff] outline-none bg-white"
                  value={formData.clientEmail}
                  onChange={(e) =>
                    updateFormData({ clientEmail: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="client-phone" className="block text-sm font-medium text-gray-700">
                  טלפון
                </label>
                <input
                  id="client-phone"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#4f95ff] outline-none bg-white"
                  value={formData.clientPhone}
                  onChange={(e) =>
                    updateFormData({ clientPhone: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="client-taxid" className="block text-sm font-medium text-gray-700">
                  ח.פ / ת.ז
                </label>
                <input
                  id="client-taxid"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#4f95ff] outline-none bg-white"
                  placeholder="מספר ח.פ או ת.ז"
                  value={formData.clientTaxId}
                  onChange={(e) =>
                    updateFormData({ clientTaxId: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="client-address" className="block text-sm font-medium text-gray-700">
                  כתובת / פרטים נוספים
                </label>
                <input
                  id="client-address"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#4f95ff] outline-none bg-white"
                  value={formData.clientAddress}
                  onChange={(e) =>
                    updateFormData({ clientAddress: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden h-fit">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="font-semibold text-gray-900">הגדרות וסטטוס</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                כותרת הצעה (אופציונלי)
              </label>
              <input
                id="title"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#4f95ff] outline-none bg-white"
                placeholder="לדוגמה: הצעת מחיר לפרויקט בניית אתר"
                value={formData.title}
                onChange={(e) =>
                  updateFormData({ title: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                סטטוס
              </label>
              <select
                id="status"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#4f95ff] outline-none bg-white"
                value={formData.status}
                onChange={(e) =>
                  updateFormData({ status: e.target.value })
                }
              >
                <option value="DRAFT">טיוטה</option>
                <option value="SENT">נשלחה</option>
                <option value="ACCEPTED">אושרה</option>
                <option value="REJECTED">נדחתה</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="currency" className="block text-sm font-medium text-gray-700">
                מטבע
              </label>
              <select
                id="currency"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#4f95ff] outline-none bg-white"
                value={currency}
                onChange={(e) => {
                  prevCurrencyRef.current = currency;
                  prevExchangeRateRef.current = exchangeRate;
                  isUserCurrencyChange.current = true;
                  setCurrency(e.target.value);
                }}
              >
                {Object.entries(CURRENCY_NAMES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
              {loadingRate && (
                <p className="text-xs text-gray-400">טוען שער יציג...</p>
              )}
              {currency !== "ILS" && exchangeRate && !loadingRate && (
                <p className="text-xs text-green-600">
                  שער יציג: 1{currencySymbol} = ₪{exchangeRate.toFixed(4)}
                </p>
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="valid-until" className="block text-sm font-medium text-gray-700">
                  בתוקף עד
                </label>
                <input
                  id="valid-until"
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#4f95ff] outline-none bg-white"
                  value={formData.validUntil}
                  onChange={(e) =>
                    updateFormData({ validUntil: e.target.value })
                  }
                />
              </div>

              <div className="space-y-3 pt-2 border-t border-gray-100">
                <label className="text-xs font-medium text-gray-500">
                  קיצורי דרך לתוקף
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => applyDuration(1, "weeks")}
                    className="px-3 py-1.5 text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md text-gray-700 transition-colors"
                  >
                    שבוע מהיום
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDuration(1, "months")}
                    className="px-3 py-1.5 text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md text-gray-700 transition-colors"
                  >
                    חודש מהיום
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="quote-custom-duration" className="text-xs text-gray-500 whitespace-nowrap">
                    עוד:
                  </label>
                  <input
                    id="quote-custom-duration"
                    type="number"
                    min="1"
                    className="w-16 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-[#4f95ff] outline-none bg-white"
                    value={customDuration}
                    onChange={(e) =>
                      setCustomDuration(parseInt(e.target.value) || 1)
                    }
                  />
                  <label htmlFor="quote-custom-unit" className="sr-only">יחידת זמן</label>
                  <select
                    id="quote-custom-unit"
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-[#4f95ff] outline-none bg-white"
                    value={customUnit}
                    onChange={(e) =>
                      setCustomUnit(e.target.value as "weeks" | "months")
                    }
                  >
                    <option value="weeks">שבועות</option>
                    <option value="months">חודשים</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => applyDuration(customDuration, customUnit)}
                    className="px-3 py-1.5 text-xs bg-[#4f95ff] text-white rounded-md hover:bg-[#3d7de0] transition-colors"
                  >
                    החל
                  </button>
                </div>
              </div>
            </div>

            {!isVatExempt && (
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isPriceWithVat"
                  className="w-4 h-4 text-[#4f95ff] border-gray-300 rounded focus:ring-[#4f95ff]"
                  checked={formData.isPriceWithVat}
                  onChange={(e) =>
                    updateFormData({ isPriceWithVat: e.target.checked })
                  }
                />
                <label
                  htmlFor="isPriceWithVat"
                  className="text-sm text-gray-700 select-none"
                >
                  המחיר כולל מע״מ
                </label>
              </div>
            )}

            {/* Removed orphaned div start */}

            <div className="border-t pt-4 mt-4">
              <label className="text-sm font-medium text-gray-700">
                רווחיות פנימית
              </label>
              <div className="mt-2 text-sm space-y-1 bg-gray-50 p-3 rounded-md border border-gray-100">
                <div className="flex justify-between">
                  <span>הכנסה (נטו):</span> <span>{currencySymbol}{revenue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>עלות משוערת:</span> <span>{currencySymbol}{totalCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t border-gray-200 mt-1">
                  <span>רווח:</span>
                  <span
                    className={margin >= 0 ? "text-green-600" : "text-red-600"}
                  >
                    {currencySymbol}{margin.toFixed(2)} ({marginPercent.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="font-semibold text-gray-900">פריטים</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-4">
            {items.map((item, index) => (
              <div
                key={index}
                className="flex gap-4 items-start border-b border-gray-100 pb-4 last:border-0 last:pb-0"
              >
                <div className="flex-1 space-y-2">
                  <label htmlFor={`quote-item-${index}-product`} className="text-xs font-medium text-gray-500">
                    מוצר/שירות
                  </label>
                  <select
                    id={`quote-item-${index}-product`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#4f95ff] outline-none text-sm bg-white"
                    value={
                      item.productId ? item.productId.toString() : "custom"
                    }
                    onChange={(e) =>
                      updateItem(index, "productId", e.target.value)
                    }
                  >
                    <option value="custom">פריט מותאם אישית</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} - {currencySymbol}{(currency !== "ILS" && exchangeRate ? Number(p.price) / exchangeRate : Number(p.price)).toFixed(2)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setDescriptionPopupIndex(index)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md hover:border-[#4f95ff] outline-none text-sm bg-white text-right flex items-center justify-between gap-2 transition-colors"
                    aria-label={`ערוך תיאור עבור פריט ${index + 1}`}
                  >
                    <span className="text-gray-400">
                      לחץ כאן להוספת/קריאת התיאור
                    </span>
                    <svg
                      className="w-4 h-4 text-gray-400 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </button>
                </div>

                <div className="w-24 space-y-2">
                  <label htmlFor={`quote-item-${index}-qty`} className="text-xs font-medium text-gray-500">
                    כמות
                  </label>
                  <input
                    id={`quote-item-${index}-qty`}
                    type="number"
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#4f95ff] outline-none text-sm bg-white"
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(index, "quantity", e.target.value)
                    }
                  />
                </div>

                <div className="w-32 space-y-2">
                  <label htmlFor={`quote-item-${index}-price`} className="text-xs font-medium text-gray-500">
                    מחיר ({currencySymbol})
                  </label>
                  <input
                    id={`quote-item-${index}-price`}
                    type="number"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#4f95ff] outline-none text-sm bg-white"
                    value={item.unitPrice}
                    onChange={(e) =>
                      updateItem(index, "unitPrice", e.target.value)
                    }
                  />
                </div>

                <div className="w-24 space-y-2 pt-8 text-left font-medium text-sm">
                  {currencySymbol}{(Number(item.quantity) * Number(item.unitPrice)).toFixed(2)}
                </div>

                <button
                  className="mt-8 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  onClick={() => removeItem(index)}
                  aria-label={`הסר פריט ${index + 1}`}
                >
                  <Trash className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>

          <button
            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-[#4f95ff] hover:text-[#4f95ff] font-medium transition-all flex items-center justify-center gap-2"
            onClick={addItem}
          >
            <Plus className="w-4 h-4" aria-hidden="true" /> הוסף פריט
          </button>

          {/* Discount section */}
          <div className="flex items-end gap-3 pt-4 border-t border-gray-100">
            <div className="space-y-1">
              <label htmlFor="discount-type" className="text-xs font-medium text-gray-500">הנחה</label>
              <select
                id="discount-type"
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#4f95ff] outline-none text-sm bg-white"
                value={discountType}
                onChange={(e) => { setDiscountType(e.target.value as "none" | "percent" | "fixed"); setIsDirty(true); }}
              >
                <option value="none">ללא הנחה</option>
                <option value="percent">אחוז (%)</option>
                <option value="fixed">סכום קבוע ({currencySymbol})</option>
              </select>
            </div>
            {discountType !== "none" && (
              <div className="space-y-1">
                <label htmlFor="discount-value" className="text-xs font-medium text-gray-500">
                  {discountType === "percent" ? "אחוז הנחה" : `סכום (${currencySymbol})`}
                </label>
                <input
                  id="discount-value"
                  type="number"
                  min="0"
                  step={discountType === "percent" ? "1" : "0.01"}
                  max={discountType === "percent" ? "100" : undefined}
                  className="w-28 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#4f95ff] outline-none text-sm bg-white"
                  value={discountValue}
                  onChange={(e) => { setDiscountValue(parseFloat(e.target.value) || 0); setIsDirty(true); }}
                />
              </div>
            )}
          </div>

          <div className="flex justify-end pt-6">
            <div className="w-72 space-y-2 bg-gray-50 p-4 rounded-lg border border-gray-100" role="region" aria-label="סיכום מחירים" aria-live="polite">
              <div className="flex justify-between text-gray-600 text-sm">
                <span>סה״כ פריטים:</span>
                <span className="font-mono">{currencySymbol}{displaySubtotalBeforeDiscount.toFixed(2)}</span>
              </div>

              {displayDiscount > 0 && (
                <div className="flex justify-between text-green-600 text-sm">
                  <span>
                    הנחה{discountType === "percent" ? ` (${discountValue}%)` : ""}:
                  </span>
                  <span className="font-mono">-{currencySymbol}{displayDiscount.toFixed(2)}</span>
                </div>
              )}

              {displayDiscount > 0 && (
                <div className="flex justify-between text-gray-600 text-sm">
                  <span>
                    סה״כ אחרי הנחה{formData.isPriceWithVat ? " (לפני מע״מ)" : ""}:
                  </span>
                  <span className="font-mono">{currencySymbol}{displaySubtotal.toFixed(2)}</span>
                </div>
              )}

              {!displayDiscount && (
                <div className="flex justify-between text-gray-600 text-sm">
                  <span>
                    סה״כ ביניים{formData.isPriceWithVat ? " (לפני מע״מ)" : ""}:
                  </span>
                  <span className="font-mono">{currencySymbol}{displaySubtotal.toFixed(2)}</span>
                </div>
              )}

              {!isVatExempt && (
                <div className="flex justify-between text-gray-600 text-sm">
                  <span>מע״מ (18%):</span>
                  <span className="font-mono">{currencySymbol}{displayVat.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between border-t border-gray-200 pt-2 text-xl font-bold text-gray-900">
                <span>סה״כ לתשלום:</span>
                <span className="font-mono">{currencySymbol}{displayTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {descriptionPopupIndex !== null && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="desc-modal-title"
        >
          <div ref={descFocusTrapRef} className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh]">
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h3 id="desc-modal-title" className="text-lg font-semibold text-gray-900">
                תיאור הפריט
              </h3>
              <button
                type="button"
                onClick={() => setDescriptionPopupIndex(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
                aria-label="סגור"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-5">
              <textarea
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4f95ff] focus:border-[#4f95ff] outline-none transition-all bg-white resize-none"
                value={items[descriptionPopupIndex]?.description || ""}
                onChange={(e) =>
                  updateItem(
                    descriptionPopupIndex,
                    "description",
                    e.target.value,
                  )
                }
                aria-label="תיאור הפריט"
                placeholder="כתוב תיאור מפורט לפריט..."
                rows={22}
                autoFocus
              />
            </div>
            <div className="flex justify-start gap-3 p-5 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setDescriptionPopupIndex(null)}
                className="px-6 py-2.5 text-sm font-medium text-white bg-[#4f95ff] rounded-xl hover:bg-[#3b82f6] transition-all shadow-lg hover:shadow-xl"
              >
                שמור
              </button>
              <button
                type="button"
                onClick={() => setDescriptionPopupIndex(null)}
                className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
