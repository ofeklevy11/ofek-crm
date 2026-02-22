"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Calendar,
  Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";
import { showConfirm } from "@/hooks/use-modal";
import {
  createFixedExpense,
  updateFixedExpense,
  deleteFixedExpense,
  markFixedExpensePaid,
} from "@/app/actions/fixed-expenses";
import { useRouter } from "next/navigation";

// Types
interface FixedExpense {
  id: number;
  title: string;
  amount: number;
  frequency: string;
  payDay: number | null;
  category: string | null;
  description: string | null;
  status: string;
  startDate?: string; // ISO Date string or Date object
  pendingCount?: number;
  paidFutureCount?: number;
  nextPaymentDate?: string;
}

export default function FixedExpensesTable({
  initialExpenses,
}: {
  initialExpenses: FixedExpense[];
}) {
  const [expenses, setExpenses] = useState<FixedExpense[]>(initialExpenses);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    amount: "",
    frequency: "MONTHLY",
    payDay: "",
    category: "",
    description: "",
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split("T")[0], // Default to 1st of month
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentExpense, setPaymentExpense] = useState<FixedExpense | null>(
    null,
  );
  const [paymentCount, setPaymentCount] = useState(1);

  const router = useRouter();

  const handleOpenModal = (expense?: FixedExpense) => {
    if (expense) {
      setEditingId(expense.id);
      setFormData({
        title: expense.title,
        amount: expense.amount.toString(),
        frequency: expense.frequency,
        payDay: expense.payDay?.toString() || "",
        category: expense.category || "",
        description: expense.description || "",
        startDate: expense.startDate
          ? new Date(expense.startDate).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
      });
    } else {
      setEditingId(null);
      setFormData({
        title: "",
        amount: "",
        frequency: "MONTHLY",
        payDay: "",
        category: "",
        description: "",
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          .toISOString()
          .split("T")[0],
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload = {
        title: formData.title,
        amount: parseFloat(formData.amount),
        frequency: formData.frequency,
        payDay: formData.payDay ? parseInt(formData.payDay) : undefined,
        category: formData.category || undefined,
        description: formData.description || undefined,
        startDate: formData.startDate
          ? new Date(formData.startDate)
          : undefined,
      };

      if (editingId) {
        await updateFixedExpense(editingId, payload);
        toast.success("ההוצאה עודכנה בהצלחה");
      } else {
        await createFixedExpense(payload);
        toast.success("ההוצאה נוצרה בהצלחה");
      }

      setIsModalOpen(false);
      router.refresh();
      // Optimistic update could be added here, but router.refresh() handles the re-fetch
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!(await showConfirm({ message: "האם אתה בטוח שברצונך למחוק הוצאה זו?", variant: "destructive" }))) return;

    try {
      await deleteFixedExpense(id);
      toast.success("ההוצאה נמחקה בהצלחה");
      router.refresh();
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    }
  };

  const handleOpenPaymentModal = (expense: FixedExpense) => {
    setPaymentExpense(expense);
    setPaymentCount(expense.pendingCount || 1);
    setIsSubmitting(false); // Reset in case
    setPaymentModalOpen(true);
  };

  const handlePaymentSubmit = async () => {
    if (!paymentExpense) return;
    setIsSubmitting(true);
    try {
      await markFixedExpensePaid(paymentExpense.id, paymentCount);
      toast.success("התשלום סומן כשולם בהצלחה");
      setPaymentModalOpen(false);
      setPaymentExpense(null);
      router.refresh();
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const frequencyLabels: Record<string, string> = {
    MONTHLY: "חודשי",
    YEARLY: "שנתי",
    WEEKLY: "שבועי",
    ONE_TIME: "חד פעמי",
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="bg-blue-50 border-r-4 border-blue-400 p-4 mb-4 rounded-md">
        <div className="flex">
          <div className="flex-shrink-0 ml-3">
            <Briefcase className="h-5 w-5 text-blue-400" />
          </div>
          <div className="flex-1 md:flex md:justify-between">
            <p className="text-sm text-blue-700">
              כל הוצאה קבועה תתווסף לדו"ח הוצאות והכנסות ברגע שתסמנו שההוצאה
              שולמה בהצלחה.
              <br />
              תאריך חיוב הבא מחושב אוטומטית לפי תדירות ההוצאה ותאריך ההתחלה. אם
              שילמתם מראש, תאריך החיוב הבא יתעדכן בהתאם.
            </p>
          </div>
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 gap-4 md:gap-0">
        <div className="relative w-full md:w-72">
          {/* Search could be implemented here */}
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pr-10 pl-3 py-2 border border-gray-300 rounded-lg leading-5 bg-gray-50 placeholder-gray-500 focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#4f95ff] focus:border-[#4f95ff] sm:text-sm transition-colors text-right"
            placeholder="חיפוש הוצאות..."
            onChange={(e) => {
              // Client side filter logic if needed
            }}
          />
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="inline-flex items-center justify-center w-full md:w-auto px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-[#4f95ff] hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4f95ff] transition-all transform hover:scale-105"
        >
          <Plus className="ml-2 -mr-1 h-5 w-5" />
          הוסף הוצאה חדשה
        </button>
      </div>

      {/* List / Table */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {initialExpenses.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
            <div className="mx-auto h-12 w-12 text-gray-400">
              <Plus className="h-12 w-12" />
            </div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              אין הוצאות קבועות
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              התחל על ידי הוספת הוצאה חדשה.
            </p>
            <div className="mt-6">
              <button
                onClick={() => handleOpenModal()}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-[#4f95ff] hover:bg-blue-600"
              >
                <Plus className="ml-2 -mr-1 h-5 w-5" />
                הוסף הוצאה
              </button>
            </div>
          </div>
        ) : (
          initialExpenses.map((expense) => (
            <div
              key={expense.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200 overflow-hidden group text-right flex flex-col"
            >
              <div className="p-6 flex-1">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#4f95ff]/10 text-[#4f95ff] rounded-lg">
                      <Briefcase className="w-6 h-6" />
                    </div>
                    <div>
                      <h3
                        className="text-lg font-bold text-gray-900 line-clamp-1"
                        title={expense.title}
                      >
                        {expense.title}
                      </h3>
                      <p className="text-sm text-gray-500 font-medium">
                        {expense.category || "ללא קטגוריה"}
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleOpenModal(expense)}
                      className="p-1.5 text-gray-400 hover:text-[#4f95ff] transition-colors"
                      title="ערוך"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(expense.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                      title="מחק"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-100 flex justify-between items-center">
                  <div className="flex items-center gap-1 text-gray-900 font-bold text-xl">
                    <span>₪{expense.amount.toLocaleString()}</span>
                  </div>
                  <div
                    className="flex items-center gap-2 text-gray-600"
                    title="יום תשלום"
                  >
                    <span className="text-sm font-medium">
                      {frequencyLabels[expense.frequency] || expense.frequency}
                      {expense.payDay ? ` (${expense.payDay} בחודש)` : ""}
                    </span>
                    <Calendar className="w-4 h-4" />
                  </div>
                </div>

                {/* Status & Actions */}
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm">
                    {(expense.pendingCount || 0) > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        ממתין לתשלום: {expense.pendingCount}
                      </span>
                    ) : (
                      <div className="flex flex-col items-start gap-1">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          שולם
                        </span>
                        {(expense.paidFutureCount || 0) > 0 && (
                          <span className="text-xs text-green-600 font-medium whitespace-nowrap">
                            שולם עד:{" "}
                            {expense.nextPaymentDate
                              ? new Date(
                                  expense.nextPaymentDate,
                                ).toLocaleDateString("he-IL")
                              : "-"}
                            <br />({expense.paidFutureCount} תשלומים עתידיים)
                          </span>
                        )}
                        {!expense.paidFutureCount &&
                          expense.pendingCount === 0 &&
                          expense.nextPaymentDate && (
                            <span className="text-xs text-gray-400 mt-1">
                              תשלום הבא:{" "}
                              {new Date(
                                expense.nextPaymentDate,
                              ).toLocaleDateString("he-IL")}
                            </span>
                          )}
                      </div>
                    )}
                    {expense.nextPaymentDate &&
                      (expense.pendingCount || 0) > 0 && (
                        <div className="mt-1">
                          <span className="text-xs text-gray-400">
                            תשלום הבא:{" "}
                            {new Date(
                              expense.nextPaymentDate,
                            ).toLocaleDateString("he-IL")}
                          </span>
                        </div>
                      )}
                  </div>

                  <button
                    onClick={() => handleOpenPaymentModal(expense)}
                    className="text-xs bg-[#4f95ff] text-white px-3 py-1 rounded-md hover:bg-blue-600 transition-colors shadow-sm font-medium"
                  >
                    {expense.pendingCount && expense.pendingCount > 0
                      ? "סמן כשולם"
                      : "הוסף תשלום עתידי"}
                  </button>
                </div>
              </div>

              <div className="h-1 bg-linear-to-r from-[#4f95ff] to-[#a24ec1] w-full" />
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto"
          aria-labelledby="modal-title"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              aria-hidden="true"
              onClick={() => setIsModalOpen(false)}
            ></div>
            <span
              className="hidden sm:inline-block sm:align-middle sm:h-screen"
              aria-hidden="true"
            >
              &#8203;
            </span>
            <div className="relative inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-right overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6 ml-auto mr-auto">
              <div className="absolute top-0 left-0 pt-4 pl-4">
                <button
                  type="button"
                  className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4f95ff]"
                  onClick={() => setIsModalOpen(false)}
                >
                  <span className="sr-only">סגור</span>
                  <svg
                    className="h-6 w-6"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <div className="sm:flex sm:items-start text-right" dir="rtl">
                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-right w-full">
                  <h3
                    className="text-lg leading-6 font-medium text-gray-900"
                    id="modal-title"
                  >
                    {editingId ? "ערוך הוצאה קבועה" : "הוסף הוצאה קבועה"}
                  </h3>
                  <div className="mt-2">
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label
                          htmlFor="title"
                          className="block text-sm font-medium text-gray-700"
                        >
                          שם ההוצאה
                        </label>
                        <input
                          type="text"
                          name="title"
                          id="title"
                          required
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-[#4f95ff] focus:border-[#4f95ff] sm:text-sm"
                          placeholder="לדוגמה: רואה חשבון"
                          value={formData.title}
                          onChange={(e) =>
                            setFormData({ ...formData, title: e.target.value })
                          }
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor="amount"
                            className="block text-sm font-medium text-gray-700"
                          >
                            סכום (₪)
                          </label>
                          <input
                            type="number"
                            name="amount"
                            id="amount"
                            required
                            min="0"
                            step="0.01"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-[#4f95ff] focus:border-[#4f95ff] sm:text-sm"
                            placeholder="0.00"
                            value={formData.amount}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                amount: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="category"
                            className="block text-sm font-medium text-gray-700"
                          >
                            קטגוריה
                          </label>
                          <input
                            type="text"
                            name="category"
                            id="category"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-[#4f95ff] focus:border-[#4f95ff] sm:text-sm"
                            placeholder="שירותים/תוכנה..."
                            value={formData.category}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                category: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor="frequency"
                            className="block text-sm font-medium text-gray-700"
                          >
                            תדירות
                          </label>
                          <select
                            id="frequency"
                            name="frequency"
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-[#4f95ff] focus:border-[#4f95ff] sm:text-sm rounded-md"
                            value={formData.frequency}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                frequency: e.target.value,
                              })
                            }
                          >
                            <option value="MONTHLY">חודשי</option>
                            <option value="YEARLY">שנתי</option>
                            <option value="WEEKLY">שבועי</option>
                            <option value="ONE_TIME">חד פעמי</option>
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="payDay"
                            className="block text-sm font-medium text-gray-700"
                          >
                            יום תשלום בחודש
                          </label>
                          <input
                            type="number"
                            name="payDay"
                            id="payDay"
                            min="1"
                            max="31"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-[#4f95ff] focus:border-[#4f95ff] sm:text-sm"
                            placeholder="1-31"
                            value={formData.payDay}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                payDay: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label
                            htmlFor="startDate"
                            className="block text-sm font-medium text-gray-700"
                          >
                            תאריך התחלה לחישוב
                          </label>
                          <div className="flex gap-2 text-xs">
                            <button
                              type="button"
                              className="text-[#4f95ff] hover:underline"
                              onClick={() => {
                                const now = new Date();
                                // Set to 1st of current month
                                const d = new Date(
                                  now.getFullYear(),
                                  now.getMonth(),
                                  1,
                                  12,
                                ); // Noon to avoid timezone issues
                                setFormData({
                                  ...formData,
                                  startDate: d.toISOString().split("T")[0],
                                });
                              }}
                            >
                              התחל חיוב החודש
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              type="button"
                              className="text-[#4f95ff] hover:underline"
                              onClick={() => {
                                const now = new Date();
                                // Set to 1st of next month
                                const d = new Date(
                                  now.getFullYear(),
                                  now.getMonth() + 1,
                                  1,
                                  12,
                                );
                                setFormData({
                                  ...formData,
                                  startDate: d.toISOString().split("T")[0],
                                });
                              }}
                            >
                              התחל חיוב חודש הבא
                            </button>
                          </div>
                        </div>
                        <input
                          type="date"
                          name="startDate"
                          id="startDate"
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-[#4f95ff] focus:border-[#4f95ff] sm:text-sm"
                          value={formData.startDate}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              startDate: e.target.value,
                            })
                          }
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="description"
                          className="block text-sm font-medium text-gray-700"
                        >
                          הערות
                        </label>
                        <textarea
                          id="description"
                          name="description"
                          rows={3}
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-[#4f95ff] focus:border-[#4f95ff] sm:text-sm"
                          placeholder="תיאור נוסף..."
                          value={formData.description}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              description: e.target.value,
                            })
                          }
                        />
                      </div>

                      <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse gap-3">
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full inline-flex justify-center items-center gap-2 rounded-md border border-transparent shadow-sm px-4 py-2 bg-[#4f95ff] text-base font-medium text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4f95ff] sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                        >
                          {isSubmitting ? <><Spinner size="sm" /> שומר...</> : "שמור"}
                        </button>
                        <button
                          type="button"
                          className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4f95ff] sm:mt-0 sm:w-auto sm:text-sm"
                          onClick={() => setIsModalOpen(false)}
                        >
                          ביטול
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {paymentModalOpen && paymentExpense && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto"
          aria-labelledby="payment-modal-title"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              aria-hidden="true"
              onClick={() => setPaymentModalOpen(false)}
            ></div>
            <span
              className="hidden sm:inline-block sm:align-middle sm:h-screen"
              aria-hidden="true"
            >
              &#8203;
            </span>
            <div className="relative inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-right overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full sm:p-6 ml-auto mr-auto">
              <div className="text-center sm:text-right">
                <h3
                  className="text-lg leading-6 font-medium text-gray-900"
                  id="payment-modal-title"
                >
                  אישור תשלום - {paymentExpense?.title}
                </h3>
                <div className="mt-2 text-right">
                  <p className="text-sm text-gray-500">
                    ישנם {paymentExpense?.pendingCount} תשלומים הממתינים לטיפול.
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    ניתן לבחור כמות גדולה יותר כדי לשלם עבור חודשים עתידיים.
                  </p>
                </div>

                <div className="mt-4">
                  <label
                    htmlFor="paymentCount"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    מספר תשלומים מבוקש:
                  </label>
                  <div className="flex items-center gap-2 justify-center sm:justify-start">
                    <button
                      type="button"
                      onClick={() =>
                        setPaymentCount(Math.max(1, paymentCount - 1))
                      }
                      className="p-2 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                    >
                      -
                    </button>
                    <span className="text-xl font-bold w-12 text-center">
                      {paymentCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPaymentCount(paymentCount + 1)}
                      className="p-2 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                    >
                      +
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    סה"כ לתשלום: ₪
                    {(
                      (paymentExpense?.amount || 0) * paymentCount
                    ).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                <button
                  type="button"
                  onClick={handlePaymentSubmit}
                  disabled={isSubmitting}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-[#4f95ff] text-base font-medium text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4f95ff] sm:col-start-2 sm:text-sm disabled:opacity-50"
                >
                  {isSubmitting ? "מבצע..." : "אשר תשלום"}
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(false)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4f95ff] sm:mt-0 sm:col-start-1 sm:text-sm"
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
