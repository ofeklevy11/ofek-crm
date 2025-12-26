"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar as CalendarIcon } from "lucide-react";
import ClientSelector from "./ClientSelector";

interface Client {
  id: number;
  name: string;
  data: any;
  tableSlug: string;
}

export default function CreatePaymentForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedClient) {
      setError("יש לבחור לקוח");
      return;
    }

    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    // First, ensure the client exists in Finance.Client table
    let financeClientId: number;

    try {
      // Check if client already exists or create new one
      const clientData = {
        name: selectedClient.name,
        email: selectedClient.data["email"] || null,
        phone:
          selectedClient.data["phone-number"] ||
          selectedClient.data["phone"] ||
          null,
        company: selectedClient.data["company"] || null,
        notes: `Imported from ${selectedClient.tableSlug} (Record ID: ${selectedClient.id})`,
      };

      const clientResponse = await fetch("/api/finance/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientData),
      });

      if (clientResponse.ok) {
        const createdClient = await clientResponse.json();
        financeClientId = createdClient.id;
      } else {
        throw new Error("Failed to create client in finance system");
      }

      // Now create the payment
      const paymentData = {
        title: formData.get("title"),
        clientId: financeClientId,
        amount: parseFloat(formData.get("amount") as string),
        dueDate: formData.get("dueDate"),
        notes: formData.get("notes") || "",
      };

      const response = await fetch("/api/finance/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentData),
      });

      if (!response.ok) {
        throw new Error("Failed to create payment");
      }

      router.push("/finance");
      router.refresh();
    } catch (err) {
      console.error("Error creating payment:", err);
      setError("שגיאה ביצירת התשלום. נסה שוב.");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-right" dir="rtl">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium text-gray-700"
          >
            כותרת התשלום *
          </label>
          <div className="mt-1">
            <input
              type="text"
              name="title"
              id="title"
              required
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
              placeholder="לדוגמה: עיצוב אתר"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            בחר לקוח *
          </label>
          <ClientSelector
            selectedClient={selectedClient}
            onSelect={setSelectedClient}
          />
          {selectedClient && (
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <span className="font-medium">לקוח נבחר:</span>{" "}
                {selectedClient.name}
              </p>
              {selectedClient.data["company"] && (
                <p className="text-xs text-blue-600 mt-1">
                  חברה: {selectedClient.data["company"]}
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor="amount"
            className="block text-sm font-medium text-gray-700"
          >
            סכום *
          </label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-500 sm:text-sm">₪</span>
            </div>
            <input
              type="number"
              name="amount"
              id="amount"
              required
              step="0.01"
              min="0"
              className="block w-full pl-7 rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
              placeholder="0.00"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="dueDate"
            className="block text-sm font-medium text-gray-700"
          >
            תאריך יעד *
          </label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <CalendarIcon className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="date"
              name="dueDate"
              id="dueDate"
              required
              className="block w-full pl-10 rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="notes"
            className="block text-sm font-medium text-gray-700"
          >
            הערות
          </label>
          <div className="mt-1">
            <textarea
              id="notes"
              name="notes"
              rows={3}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
              placeholder="הערות נוספות..."
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          ביטול
        </button>
        <button
          type="submit"
          disabled={isLoading || !selectedClient}
          className="px-4 py-2 text-sm font-medium text-white bg-[#4f95ff] border border-transparent rounded-md shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "יוצר..." : "צור תשלום"}
        </button>
      </div>
    </form>
  );
}
