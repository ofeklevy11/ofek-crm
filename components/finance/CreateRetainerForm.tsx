"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar as CalendarIcon, Repeat, Info } from "lucide-react";
import ClientSelector from "./ClientSelector";
import { apiFetch } from "@/lib/api-fetch";

interface Client {
  id: number;
  name: string;
  data: any;
  tableSlug: string;
}

export default function CreateRetainerForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isNewClientMode, setIsNewClientMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Auto-select client from URL parameter
  useEffect(() => {
    const clientId = searchParams.get("clientId");
    if (clientId) {
      const fetchClient = async () => {
        try {
          const response = await fetch(`/api/finance/clients/${clientId}`);
          if (response.ok) {
            const clientData = await response.json();
            setSelectedClient({
              id: clientData.id,
              name: clientData.name,
              data: {
                email: clientData.email,
                phone: clientData.phone,
                businessName: clientData.businessName,
              },
              tableSlug: "finance-clients",
            });
          }
        } catch (error) {
          console.error("Error fetching client details:", error);
        }
      };
      fetchClient();
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!isNewClientMode && !selectedClient) {
      setError("יש לבחור לקוח");
      return;
    }

    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    // First, ensure the client exists in Finance.Client table
    let financeClientId: number;

    try {
      // If the client is selected from existing finance clients, use their ID directly
      if (!isNewClientMode && selectedClient?.tableSlug === "finance-clients") {
        financeClientId = selectedClient.id;
      } else {
        // Otherwise create a new client (either manually or imported from a table)
        let clientData;

        if (isNewClientMode) {
          clientData = {
            name: formData.get("newClientName") as string,
            email: (formData.get("newClientEmail") as string) || null,
            phone: (formData.get("newClientPhone") as string) || null,
            businessName: (formData.get("newClientCompany") as string) || null,
            notes: "Created manually during retainer creation",
          };
        } else {
          // Check if client already exists or create new one based on selection
          clientData = {
            name: selectedClient!.name,
            email: selectedClient!.data["email"] || null,
            phone:
              selectedClient!.data["phone-number"] ||
              selectedClient!.data["phone"] ||
              null,
            businessName: selectedClient!.data["company"] || null,
            notes: `Imported from ${selectedClient!.tableSlug} (Record ID: ${
              selectedClient!.id
            })`,
          };
        }

        // Create/Get finance client
        const clientResponse = await apiFetch("/api/finance/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(clientData),
        });

        if (!clientResponse.ok) {
          throw new Error("Failed to create client in finance system");
        }

        const createdClient = await clientResponse.json();
        financeClientId = createdClient.id;
      }

      // Import actions
      const { createRetainer } = await import("@/app/actions");

      // Now create the retainer
      const retainerData = {
        title: formData.get("title") as string,
        clientId: financeClientId,
        amount: parseFloat(formData.get("amount") as string),
        frequency: formData.get("frequency") as string,
        startDate: formData.get("startDate") as string,
        paymentMode:
          (formData.get("paymentMode") as "prepaid" | "postpaid") || "postpaid",
        notes: (formData.get("notes") as string) || undefined,
      };

      const result = await createRetainer(retainerData);

      if (!result.success) {
        throw new Error(result.error || "Failed to create retainer");
      }

      router.push("/finance");
      router.refresh();
    } catch (err) {
      console.error("Error creating retainer:", err);
      setError("שגיאה ביצירת הריטיינר. נסה שוב.");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 text-right" dir="rtl">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <Info className="w-4 h-4" />
          {error}
        </div>
      )}

      <div className="space-y-6">
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-semibold text-gray-900 mb-1.5"
          >
            כותרת ריטיינר *
          </label>
          <div className="relative">
            <input
              type="text"
              name="title"
              id="title"
              required
              className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-[#4f95ff] focus:ring-[#4f95ff] text-sm py-3 px-4 border transition-all hover:border-[#4f95ff]/50"
              placeholder="לדוגמה: ריטיינר SEO חודשי"
            />
          </div>
        </div>

        {/* Client Selection / Creation Toggle */}
        <div className="bg-gray-50/50 p-1 rounded-2xl border border-gray-100">
          <div className="p-4">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              לקוח *
            </label>
            <div className="flex bg-gray-100 p-1 rounded-lg mb-6 w-fit">
              <button
                type="button"
                onClick={() => setIsNewClientMode(false)}
                className={`px-5 py-2.5 text-sm font-medium rounded-md transition-all duration-200 ${
                  !isNewClientMode
                    ? "bg-white text-[#4f95ff] shadow-sm ring-1 ring-black/5"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                בחר לקוח קיים
              </button>
              <button
                type="button"
                onClick={() => setIsNewClientMode(true)}
                className={`px-5 py-2.5 text-sm font-medium rounded-md transition-all duration-200 ${
                  isNewClientMode
                    ? "bg-white text-[#4f95ff] shadow-sm ring-1 ring-black/5"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                צור לקוח חדש
              </button>
            </div>

            {!isNewClientMode ? (
              <div className="space-y-3">
                <ClientSelector
                  selectedClient={selectedClient}
                  onSelect={setSelectedClient}
                />
                {selectedClient && (
                  <div className="mt-2 p-4 bg-blue-50/50 border border-blue-100 rounded-xl flex items-center justify-between group transition-colors hover:bg-blue-50">
                    <div>
                      <p className="text-sm font-medium text-blue-900">
                        {selectedClient.name}
                      </p>
                      {selectedClient.data["company"] && (
                        <p className="text-xs text-blue-600 mt-1">
                          {selectedClient.data["company"]}
                        </p>
                      )}
                    </div>
                    <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                      {selectedClient.name.charAt(0)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div>
                  <label
                    htmlFor="newClientName"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    שם הלקוח *
                  </label>
                  <input
                    type="text"
                    name="newClientName"
                    id="newClientName"
                    required={isNewClientMode}
                    className="block w-full rounded-lg border-gray-200 shadow-sm focus:border-[#4f95ff] focus:ring-[#4f95ff] text-sm py-2.5 px-3 border transition-colors"
                    placeholder="שם מלא"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="newClientEmail"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      אימייל
                    </label>
                    <input
                      type="email"
                      name="newClientEmail"
                      id="newClientEmail"
                      className="block w-full rounded-lg border-gray-200 shadow-sm focus:border-[#4f95ff] focus:ring-[#4f95ff] text-sm py-2.5 px-3 border transition-colors"
                      placeholder="example@company.com"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="newClientPhone"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      טלפון
                    </label>
                    <input
                      type="tel"
                      name="newClientPhone"
                      id="newClientPhone"
                      className="block w-full rounded-lg border-gray-200 shadow-sm focus:border-[#4f95ff] focus:ring-[#4f95ff] text-sm py-2.5 px-3 border transition-colors"
                      placeholder="050-0000000"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="newClientCompany"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    שם חברה (אופציונלי)
                  </label>
                  <input
                    type="text"
                    name="newClientCompany"
                    id="newClientCompany"
                    className="block w-full rounded-lg border-gray-200 shadow-sm focus:border-[#4f95ff] focus:ring-[#4f95ff] text-sm py-2.5 px-3 border transition-colors"
                    placeholder="שם החברה בע''מ"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label
              htmlFor="amount"
              className="block text-sm font-semibold text-gray-900 mb-1.5"
            >
              סכום *
            </label>
            <div className="relative rounded-xl shadow-sm">
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm font-medium">₪</span>
              </div>
              <input
                type="number"
                name="amount"
                id="amount"
                required
                step="0.01"
                min="0"
                className="block w-full pr-10 rounded-xl border-gray-200 focus:border-[#4f95ff] focus:ring-[#4f95ff] text-sm py-3 border transition-colors"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="frequency"
              className="block text-sm font-semibold text-gray-900 mb-1.5"
            >
              תדירות *
            </label>
            <div className="relative rounded-xl shadow-sm">
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                <Repeat className="h-4 w-4 text-gray-400" />
              </div>
              <select
                id="frequency"
                name="frequency"
                defaultValue="monthly"
                className="block w-full pr-10 rounded-xl border-gray-200 focus:border-[#4f95ff] focus:ring-[#4f95ff] text-sm py-3 border transition-colors bg-white/50"
              >
                <option value="monthly">חודשי</option>
                <option value="quarterly">רבעוני</option>
                <option value="annually">שנתי</option>
              </select>
            </div>
          </div>
        </div>

        {/* Payment Timing Selection */}
        <div className="bg-gray-50/50 p-4 rounded-xl border border-gray-100">
          <label className="block text-sm font-semibold text-gray-900 mb-3">
            מתי מתחיל התשלום? *
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="relative flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-xl cursor-pointer hover:border-[#4f95ff] transition-all has-[:checked]:border-[#4f95ff] has-[:checked]:bg-blue-50/30">
              <input
                type="radio"
                name="paymentMode"
                value="prepaid"
                className="mt-1 h-4 w-4 text-[#4f95ff] border-gray-300 focus:ring-[#4f95ff]"
              />
              <div>
                <span className="block text-sm font-medium text-gray-900">
                  התחל מיידית
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  התשלום ייגבה כבר ביום ההתחלה (לדוגמה: עבודה שמשולמת מראש)
                </span>
              </div>
            </label>

            <label className="relative flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-xl cursor-pointer hover:border-[#4f95ff] transition-all has-[:checked]:border-[#4f95ff] has-[:checked]:bg-blue-50/30">
              <input
                type="radio"
                name="paymentMode"
                value="postpaid"
                defaultChecked
                className="mt-1 h-4 w-4 text-[#4f95ff] border-gray-300 focus:ring-[#4f95ff]"
              />
              <div>
                <span className="block text-sm font-medium text-gray-900">
                  תשלום בחודש הבא
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  התשלום הראשון יהיה בסוף המחזור (לדוגמה: תשלום שוטף לאחר עבודה)
                </span>
              </div>
            </label>
          </div>
        </div>

        <div>
          <label
            htmlFor="startDate"
            className="block text-sm font-semibold text-gray-900 mb-1.5"
          >
            תאריך התחלה *
          </label>
          <div className="relative rounded-xl shadow-sm">
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
              <CalendarIcon className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="date"
              name="startDate"
              id="startDate"
              required
              className="block w-full pr-10 rounded-xl border-gray-200 focus:border-[#4f95ff] focus:ring-[#4f95ff] text-sm py-3 border transition-colors"
            />
          </div>
          <div className="mt-3 bg-[#eef6ff] border border-[#dbeafe] rounded-xl p-4 flex gap-3">
            <Info className="w-5 h-5 text-[#4f95ff] flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-[#1e3a8a] text-sm">
                מועד חיוב והתחלה
              </p>
              <p className="text-sm text-[#1e40af]/80 leading-relaxed">
                החישוב מתבצע החל מתאריך זה. התשלום הראשון יהיה בתאריך זה או
                אחריו, בהתאם לתדירות שנבחרה.
              </p>
            </div>
          </div>
        </div>

        <div>
          <label
            htmlFor="notes"
            className="block text-sm font-semibold text-gray-900 mb-1.5"
          >
            הערות
          </label>
          <div className="mt-1">
            <textarea
              id="notes"
              name="notes"
              rows={3}
              className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-[#4f95ff] focus:ring-[#4f95ff] text-sm py-3 px-4 border transition-colors resize-none"
              placeholder="הערות נוספות..."
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4f95ff] transition-all"
        >
          ביטול
        </button>
        <button
          type="submit"
          disabled={isLoading || (!isNewClientMode && !selectedClient)}
          className="px-6 py-2.5 text-sm font-medium text-white bg-[#4f95ff] border border-transparent rounded-xl shadow-sm hover:bg-[#3d84ff] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4f95ff] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isLoading ? "יוצר..." : "צור ריטיינר"}
        </button>
      </div>
    </form>
  );
}
