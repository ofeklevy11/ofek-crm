"use client";

import { useState, useMemo } from "react";
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

const moneyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
});

const formatMoney = (amount: number) => moneyFormatter.format(amount);

function getMarginAnalysis(price: number, cost: number) {
  const margin = price - cost;
  const marginPercent = price > 0 ? (margin / price) * 100 : 0;

  let color = "text-emerald-600";

  if (marginPercent < 10) {
    color = "text-rose-600";
  } else if (marginPercent < 30) {
    color = "text-amber-600";
  }

  return { margin, marginPercent, color };
}

function getTypeIcon(type: string) {
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
}

function getTypeLabel(type: string) {
  switch (type) {
    case "SERVICE":
      return "שירות";
    case "PRODUCT":
      return "מוצר";
    case "PACKAGE":
      return "חבילה";
    default:
      return type;
  }
}

export default function ServicesPageClient({ products }: { products: any[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);

  const stats = useMemo(() => {
    if (products.length === 0) {
      return { avgMargin: "0%", mostProfitable: "-" };
    }

    let totalMarginRatio = 0;
    let bestProduct = products[0];
    let bestProfit = products[0].price - (products[0].cost || 0);

    for (const p of products) {
      const price = p.price;
      const cost = p.cost || 0;
      const profit = price - cost;

      if (price > 0) {
        totalMarginRatio += profit / price;
      }

      if (profit > bestProfit) {
        bestProfit = profit;
        bestProduct = p;
      }
    }

    return {
      avgMargin: Math.round((totalMarginRatio / products.length) * 100) + "%",
      mostProfitable: bestProduct.name,
    };
  }, [products]);

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto text-right" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold tracking-tight  text-gray-900">
            מוצרים ושירותים
          </h1>
          <p className="text-gray-500 mt-2 text-lg">
            ניהול הקטלוג העסקי וניתוח רווחיות
          </p>
        </div>
        <button
          onClick={handleAddNew}
          className="flex items-center gap-2 px-6 py-3 bg-[#4f95ff] text-white rounded-xl hover:bg-[#3b82f6] font-medium transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
        >
          <Plus className="w-5 h-5" /> הוסף חדש
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Quick Stats */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            סה״כ פריטים בקטלוג
          </h3>
          <div className="text-4xl font-bold text-gray-900">
            {products.length}
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            ממוצע רווח גולמי
          </h3>
          <div className="text-4xl font-bold text-[#a24ec1]">
            {stats.avgMargin}
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            הפריט הרווחי ביותר
          </h3>
          <div className="text-xl font-bold text-gray-900 truncate" dir="rtl">
            {stats.mostProfitable}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/30">
          <h3 className="text-xl font-semibold text-gray-900">קטלוג</h3>
          <p className="text-sm text-gray-500 mt-1">
            רשימה מפורטת של כל השירותים, המוצרים והחבילות שלך
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-[#f4f8f8] text-gray-600">
              <tr>
                <th className="px-6 py-4 font-medium first:rounded-tr-lg">
                  שם הפריט
                </th>
                <th className="px-6 py-4 font-medium">מק״ט</th>
                <th className="px-6 py-4 font-medium">סוג</th>
                <th className="px-6 py-4 font-medium">מחיר מחירון</th>
                <th className="px-6 py-4 font-medium">עלות מוערכת</th>
                <th className="px-6 py-4 font-medium">רווח / אחוז רווח</th>
                <th className="px-6 py-4 font-medium w-[100px] last:rounded-tl-lg">
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map((product) => {
                const price = product.price;
                const cost = product.cost || 0;
                const { margin, marginPercent, color } = getMarginAnalysis(
                  price,
                  cost
                );

                return (
                  <tr
                    key={product.id}
                    className="hover:bg-[#f4f8f8]/50 transition-colors group"
                  >
                    <td className="px-6 py-4 font-medium text-gray-900">
                      <div className="flex flex-col">
                        <span className="text-base">{product.name}</span>
                        {product.description && (
                          <span className="text-xs text-gray-500 truncate max-w-[200px]">
                            {product.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {product.sku || "-"}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#f4f8f8] text-gray-700 border border-gray-200">
                        {getTypeIcon(product.type)}
                        {getTypeLabel(product.type)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-900 font-medium">
                      {formatMoney(price)}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
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
                        className="p-2 text-gray-400 hover:text-[#4f95ff] transition-all rounded-full hover:bg-blue-50"
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
                    colSpan={7}
                    className="px-6 py-16 text-center text-gray-500 bg-gray-50/20"
                  >
                    <div>
                      <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                      <p className="text-lg font-medium text-gray-900">
                        אין פריטים בקטלוג
                      </p>
                      <p className="text-sm text-gray-500">
                        הוסף את השירות או המוצר הראשון שלך כדי להתחיל
                      </p>
                    </div>
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
