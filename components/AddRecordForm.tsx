"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SchemaField {
  name: string;
  type: string;
  label: string;
  options?: string[];
}

export default function AddRecordForm({
  tableId,
  schema,
}: {
  tableId: number;
  schema: SchemaField[];
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/tables/${tableId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: formData,
          createdBy: 1, // Hardcoded user
        }),
      });

      if (!res.ok) throw new Error("Failed to create record");

      setFormData({});
      setIsOpen(false);
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Error creating record");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition"
      >
        + Add Record
      </button>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-black">New Record</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-black hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {schema.map((field) => (
            <div key={field.name}>
              <label className="block text-sm font-medium text-black mb-1">
                {field.label}
              </label>
              {field.type === "select" ? (
                <select
                  value={formData[field.name] || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, [field.name]: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Select...</option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : field.type === "boolean" ? (
                <select
                  value={formData[field.name] || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      [field.name]: e.target.value === "true",
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Select...</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <input
                  type={
                    field.type === "number"
                      ? "number"
                      : field.type === "date"
                      ? "date"
                      : "text"
                  }
                  value={formData[field.name] || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      [field.name]:
                        field.type === "number"
                          ? Number(e.target.value)
                          : e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Record"}
          </button>
        </div>
      </form>
    </div>
  );
}
