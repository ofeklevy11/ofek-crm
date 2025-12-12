"use client";

import { useState } from "react";
import { ProductModal } from "./product-modal";
import {
  Plus,
  Edit,
  TrendingUp,
  TrendingDown,
  Package,
  Layers,
  Box,
} from "lucide-react";

const formatMoney = (amount: number) => {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
  }).format(amount);
};

export default function ServicesPageClient({ products }: { products: any[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  const getMarginAnalysis = (price: number, cost: number) => {
    const margin = price - cost;
    const marginPercent = price > 0 ? (margin / price) * 100 : 0;

    let color = "text-green-600";

    if (marginPercent < 10) {
      color = "text-red-600";
    } else if (marginPercent < 30) {
      color = "text-yellow-600";
    }

    return { margin, marginPercent, color };
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "SERVICE":
        return <Layers className="w-4 h-4" />;
      case "PRODUCT":
        return <Box className="w-4 h-4" />;
      case "PACKAGE":
        return <Package className="w-4 h-4" />;
      default:
        return <Layers className="w-4 h-4" />;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Services & Products
          </h1>
          <p className="text-gray-500 mt-1">
            Manage your offerings and analyze profitability.
          </p>
        </div>
        <button
          onClick={handleAddNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add New
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Quick Stats */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Total Offerings
          </h3>
          <div className="text-3xl font-bold text-gray-900">
            {products.length}
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Avg. Profit Margin
          </h3>
          <div className="text-3xl font-bold text-gray-900">
            {(() => {
              if (products.length === 0) return "0%";
              const totalMargin = products.reduce((acc, p) => {
                const price = Number(p.price);
                const cost = Number(p.cost || 0);
                if (price === 0) return acc;
                return acc + (price - cost) / price;
              }, 0);
              return Math.round((totalMargin / products.length) * 100) + "%";
            })()}
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Top Performer
          </h3>
          <div className="text-xl font-bold text-gray-900 truncate">
            {products.length > 0
              ? products.reduce((prev, current) =>
                  Number(current.price) - Number(current.cost || 0) >
                  Number(prev.price) - Number(prev.cost || 0)
                    ? current
                    : prev
                ).name
              : "-"}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Catalog</h3>
          <p className="text-sm text-gray-500">
            A detailed list of all your services, products, and packages.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Price</th>
                <th className="px-6 py-3 font-medium">Cost</th>
                <th className="px-6 py-3 font-medium">Profit / Margin</th>
                <th className="px-6 py-3 font-medium w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {products.map((product) => {
                const price = Number(product.price);
                const cost = Number(product.cost || 0);
                const { margin, marginPercent, color } = getMarginAnalysis(
                  price,
                  cost
                );

                return (
                  <tr
                    key={product.id}
                    className="hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-gray-900">
                      <div className="flex flex-col">
                        <span>{product.name}</span>
                        {product.description && (
                          <span className="text-xs text-gray-500 truncate max-w-[200px]">
                            {product.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {getTypeIcon(product.type)}
                        {product.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-900">
                      {formatMoney(price)}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {cost > 0 ? formatMoney(cost) : "-"}
                    </td>
                    <td className="px-6 py-4">
                      <div className={`flex items-center gap-2 ${color}`}>
                        {margin > 0 ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                        <span className="font-semibold">
                          {formatMoney(margin)}
                        </span>
                        <span className="text-xs opacity-70">
                          ({marginPercent.toFixed(1)}%)
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        className="p-2 text-gray-400 hover:text-gray-900 transition-colors rounded-full hover:bg-gray-100"
                        onClick={() => handleEdit(product)}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {products.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-gray-500"
                  >
                    No services found. Add your first service to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ProductModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        productToEdit={editingProduct}
      />
    </div>
  );
}
