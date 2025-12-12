"use client";

import { useState } from "react";
import { Trash, Plus, Printer, Save, ArrowLeft } from "lucide-react";
import { createQuote, updateQuote } from "@/app/actions/quotes";
import { useRouter } from "next/navigation";
import Link from "next/link";
// removed ui imports

interface QuoteEditorProps {
  initialQuote?: any;
  clients: any[];
  products: any[];
}

export default function QuoteEditor({
  initialQuote,
  clients,
  products,
}: QuoteEditorProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    clientId: initialQuote?.clientId?.toString() || "new",
    clientName: initialQuote?.clientName || "",
    clientEmail: initialQuote?.clientEmail || "",
    clientPhone: initialQuote?.clientPhone || "",
    clientAddress: initialQuote?.clientAddress || "",
    validUntil: initialQuote?.validUntil
      ? new Date(initialQuote.validUntil).toISOString().split("T")[0]
      : "",
    status: initialQuote?.status || "DRAFT",
  });

  const [items, setItems] = useState<any[]>(initialQuote?.items || []);

  const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const clientId = e.target.value;
    if (clientId === "new") {
      setFormData((prev) => ({
        ...prev,
        clientId: "new",
        clientName: "",
        clientEmail: "",
        clientPhone: "",
        clientAddress: "",
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
      }));
    } else {
      setFormData((prev) => ({ ...prev, clientId }));
    }
  };

  const addItem = () => {
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
  };

  const removeItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];

    if (field === "productId") {
      if (value === "custom") {
        newItems[index] = { ...newItems[index], productId: null };
      } else {
        const product = products.find(
          (p) => p.id.toString() === value.toString()
        );
        if (product) {
          newItems[index] = {
            ...newItems[index],
            productId: product.id,
            description: product.description || product.name,
            unitPrice: Number(product.price),
            unitCost: Number(product.cost || 0),
          };
        }
      }
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setItems(newItems);
  };

  const calculateTotal = () => {
    return items.reduce(
      (acc, item) => acc + Number(item.quantity) * Number(item.unitPrice),
      0
    );
  };

  const calculateTotalCost = () => {
    return items.reduce(
      (acc, item) => acc + Number(item.quantity) * Number(item.unitCost || 0),
      0
    );
  };

  const total = calculateTotal();
  const totalCost = calculateTotalCost();
  const margin = total - totalCost;
  const marginPercent = total > 0 ? (margin / total) * 100 : 0;

  const handleSave = async () => {
    if (loading) return;

    if (!formData.clientName) {
      alert("Client name is required");
      return;
    }
    if (items.length === 0) {
      alert("Add at least one item");
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
        clientAddress: formData.clientAddress,
        validUntil: formData.validUntil
          ? new Date(formData.validUntil)
          : undefined,
        status: formData.status,
        items: items.map((item) => ({
          productId: item.productId ? parseInt(item.productId) : undefined,
          description: item.description,
          quantity: parseFloat(item.quantity.toString()),
          unitPrice: parseFloat(item.unitPrice.toString()),
          unitCost: parseFloat(item.unitCost?.toString() || "0"),
        })),
      };

      if (initialQuote) {
        await updateQuote(initialQuote.id, payload);
        router.refresh();
        alert("Quote updated successfully");
        setLoading(false);
      } else {
        const newQuote = await createQuote(payload);
        // Redirect to print/pdf page as requested
        router.push(`/quotes/${newQuote.id}/pdf`);
        router.refresh();
      }
    } catch (error: any) {
      console.error(error);
      alert("Failed to save quote: " + (error.message || "Unknown error"));
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/quotes">
            <button className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              {initialQuote
                ? `Edit Quote #${initialQuote.id.slice(-6).toUpperCase()}`
                : "New Quote"}
            </h1>
            <p className="text-gray-500">
              {initialQuote ? "Manage quote details" : "Draft a new proposal"}
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
            >
              <Printer className="w-4 h-4" /> Print / PDF
            </button>
          )}
          <button
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium transition-colors disabled:opacity-50"
            onClick={handleSave}
            disabled={loading}
          >
            <Save className="w-4 h-4" /> {loading ? "Saving..." : "Save Quote"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-gray-900">Client Details</h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Select Client
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.clientId}
                onChange={handleClientChange}
              >
                <option value="new">+ Create New Customer (Manual)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Client Name
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.clientName}
                  onChange={(e) =>
                    setFormData({ ...formData, clientName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.clientEmail}
                  onChange={(e) =>
                    setFormData({ ...formData, clientEmail: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Phone
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.clientPhone}
                  onChange={(e) =>
                    setFormData({ ...formData, clientPhone: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Address / Details
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.clientAddress}
                  onChange={(e) =>
                    setFormData({ ...formData, clientAddress: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden h-fit">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-gray-900">Settings & Status</h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
              >
                <option value="DRAFT">Draft</option>
                <option value="SENT">Sent</option>
                <option value="ACCEPTED">Accepted</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Valid Until
              </label>
              <input
                type="date"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.validUntil}
                onChange={(e) =>
                  setFormData({ ...formData, validUntil: e.target.value })
                }
              />
            </div>

            <div className="border-t pt-4 mt-4">
              <label className="text-sm font-medium text-gray-700">
                Internal Profitability
              </label>
              <div className="mt-2 text-sm space-y-1 bg-gray-50 p-3 rounded-md border border-gray-100">
                <div className="flex justify-between">
                  <span>Revenue:</span> <span>₪{total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>Est. Cost:</span> <span>₪{totalCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t border-gray-200 mt-1">
                  <span>Margin:</span>
                  <span
                    className={margin >= 0 ? "text-green-600" : "text-red-600"}
                  >
                    ₪{margin.toFixed(2)} ({marginPercent.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="font-semibold text-gray-900">Items</h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-4">
            {items.map((item, index) => (
              <div
                key={index}
                className="flex gap-4 items-start border-b border-gray-100 pb-4 last:border-0 last:pb-0"
              >
                <div className="flex-1 space-y-2">
                  <label className="text-xs font-medium text-gray-500">
                    Product/Service
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    value={
                      item.productId ? item.productId.toString() : "custom"
                    }
                    onChange={(e) =>
                      updateItem(index, "productId", e.target.value)
                    }
                  >
                    <option value="custom">Custom Item</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} - ₪{p.price}
                      </option>
                    ))}
                  </select>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    placeholder="Item description"
                    value={item.description}
                    onChange={(e) =>
                      updateItem(index, "description", e.target.value)
                    }
                    rows={2}
                  />
                </div>

                <div className="w-24 space-y-2">
                  <label className="text-xs font-medium text-gray-500">
                    Qty
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(index, "quantity", e.target.value)
                    }
                  />
                </div>

                <div className="w-32 space-y-2">
                  <label className="text-xs font-medium text-gray-500">
                    Price (₪)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    value={item.unitPrice}
                    onChange={(e) =>
                      updateItem(index, "unitPrice", e.target.value)
                    }
                  />
                </div>

                <div className="w-24 space-y-2 pt-8 text-right font-medium text-sm">
                  ₪{(item.quantity * item.unitPrice).toFixed(2)}
                </div>

                <button
                  className="mt-8 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  onClick={() => removeItem(index)}
                >
                  <Trash className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-500 hover:text-blue-500 font-medium transition-all flex items-center justify-center gap-2"
            onClick={addItem}
          >
            <Plus className="w-4 h-4" /> Add Item
          </button>

          <div className="flex justify-end pt-4">
            <div className="text-right space-y-1">
              <div className="text-sm text-gray-500">Subtotal</div>
              <div className="text-3xl font-bold text-gray-900">
                ₪{total.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
