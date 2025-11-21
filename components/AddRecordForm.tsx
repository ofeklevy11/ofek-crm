"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RelationPicker from "./RelationPicker";

interface SchemaField {
  name: string;
  type: string;
  label: string;
  options?: string[];
  relationTableId?: number;
  relationField?: string;
  lookupField?: string;
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
          {schema
            .filter(
              (field, index, self) =>
                index === self.findIndex((t) => t.name === field.name)
            )
            .map((field) => (
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
                    {field.options?.map((opt, i) => (
                      <option key={`${opt}-${i}`} value={opt}>
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
                ) : field.type === "textarea" ? (
                  <textarea
                    value={formData[field.name] || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, [field.name]: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
                  />
                ) : field.type === "radio" ? (
                  <div className="flex gap-4 pt-2">
                    {field.options?.map((opt, i) => (
                      <label
                        key={`${opt}-${i}`}
                        className="flex items-center gap-2 text-black"
                      >
                        <input
                          type="radio"
                          name={field.name}
                          value={opt}
                          checked={formData[field.name] === opt}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              [field.name]: e.target.value,
                            })
                          }
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                ) : field.type === "multi-select" ? (
                  <select
                    multiple
                    value={
                      Array.isArray(formData[field.name])
                        ? formData[field.name]
                        : []
                    }
                    onChange={(e) => {
                      const selected = Array.from(
                        e.target.selectedOptions,
                        (option) => option.value
                      );
                      setFormData({ ...formData, [field.name]: selected });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
                  >
                    {field.options?.map((opt, i) => (
                      <option key={`${opt}-${i}`} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : field.type === "tags" ? (
                  <div className="flex flex-wrap gap-2">
                    {field.options?.map((tag, i) => {
                      const rawValue = formData[field.name];
                      const currentTags = Array.isArray(rawValue)
                        ? rawValue
                        : [];
                      const isSelected = currentTags.includes(tag);
                      return (
                        <button
                          key={`${tag}-${i}`}
                          type="button"
                          onClick={() => {
                            const newTags = isSelected
                              ? currentTags.filter((t: string) => t !== tag)
                              : [...currentTags, tag];
                            setFormData({ ...formData, [field.name]: newTags });
                          }}
                          className={`px-3 py-1 rounded-full text-sm border transition ${
                            isSelected
                              ? "bg-blue-100 border-blue-300 text-blue-800"
                              : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                    {(!field.options || field.options.length === 0) && (
                      <p className="text-sm text-gray-500 italic">
                        No tags defined in schema options.
                      </p>
                    )}
                  </div>
                ) : field.type === "relation" && field.relationTableId ? (
                  <RelationPicker
                    tableId={field.relationTableId}
                    value={formData[field.name]}
                    onChange={async (val) => {
                      // Update the relation field
                      const newFormData = { ...formData, [field.name]: val };
                      setFormData(newFormData);

                      // Find dependent lookup fields
                      const lookupFields = schema.filter(
                        (f) =>
                          f.type === "lookup" && f.relationField === field.name
                      );

                      if (lookupFields.length > 0) {
                        if (val) {
                          try {
                            // Fetch the related record
                            // Assuming val is the record ID
                            const res = await fetch(`/api/records/${val}`);
                            if (res.ok) {
                              const relatedRecord = await res.json();
                              const updates: Record<string, any> = {};

                              lookupFields.forEach((lf) => {
                                if (lf.lookupField) {
                                  updates[lf.name] =
                                    relatedRecord.data[lf.lookupField];
                                }
                              });

                              setFormData({ ...newFormData, ...updates });
                            }
                          } catch (error) {
                            console.error("Failed to fetch lookup data", error);
                          }
                        } else {
                          // Clear lookup fields if relation is cleared
                          const updates: Record<string, any> = {};
                          lookupFields.forEach((lf) => {
                            updates[lf.name] = "";
                          });
                          setFormData({ ...newFormData, ...updates });
                        }
                      }
                    }}
                  />
                ) : (
                  <input
                    type={
                      field.type === "number"
                        ? "number"
                        : field.type === "date"
                        ? "date"
                        : field.type === "url"
                        ? "url"
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
                    placeholder={field.type === "lookup" ? "Read Only" : ""}
                    readOnly={
                      field.type === "lookup" || field.type === "automation"
                    }
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
