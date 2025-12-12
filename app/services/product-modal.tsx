"use client";

import { useState, useEffect } from "react";
import { createProduct, updateProduct } from "@/app/actions/products";
import { useRouter } from "next/navigation";
// Removed sonner and UI imports

interface Product {
  id: number;
  name: string;
  description: string | null;
  type: string;
  price: any;
  cost: any | null;
  isActive: boolean;
}

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit?: Product | null;
}

export function ProductModal({
  isOpen,
  onClose,
  productToEdit,
}: ProductModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "SERVICE",
    price: "",
    cost: "",
  });

  useEffect(() => {
    if (productToEdit) {
      setFormData({
        name: productToEdit.name,
        description: productToEdit.description || "",
        type: productToEdit.type,
        price: productToEdit.price.toString(),
        cost: productToEdit.cost?.toString() || "",
      });
    } else {
      setFormData({
        name: "",
        description: "",
        type: "SERVICE",
        price: "",
        cost: "",
      });
    }
  }, [productToEdit, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        type: formData.type,
        price: parseFloat(formData.price) || 0,
        cost: parseFloat(formData.cost) || 0,
      };

      if (productToEdit) {
        await updateProduct(productToEdit.id, payload);
      } else {
        await createProduct(payload);
      }

      router.refresh();
      onClose();
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {productToEdit
                ? "Edit Service / Product"
                : "Add New Service / Product"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Configure your offering details.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <span className="sr-only">Close</span>
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Name
              </label>
              <input
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., SEO Audit"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Type
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.type}
                onChange={(e) =>
                  setFormData({ ...formData, type: e.target.value })
                }
              >
                <option value="SERVICE">Service</option>
                <option value="PRODUCT">Product</option>
                <option value="PACKAGE">Package</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Internal or customer facing description..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Price (Revenue)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-500">₪</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData({ ...formData, price: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Cost (Expense)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-500">₪</span>
                <input
                  type="number"
                  step="0.01"
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.cost}
                  onChange={(e) =>
                    setFormData({ ...formData, cost: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          <div className="bg-gray-50 p-3 rounded-md text-sm flex justify-between items-center border border-gray-100">
            <span className="text-gray-600">Estimated Margin:</span>
            <div className="font-semibold">
              {(() => {
                const p = parseFloat(formData.price) || 0;
                const c = parseFloat(formData.cost) || 0;
                const margin = p - c;
                const percent = p > 0 ? ((margin / p) * 100).toFixed(1) : 0;
                return (
                  <span
                    className={margin >= 0 ? "text-green-600" : "text-red-600"}
                  >
                    ₪{margin.toFixed(2)} ({percent}%)
                  </span>
                );
              })()}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading
                ? "Saving..."
                : productToEdit
                ? "Save Changes"
                : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
