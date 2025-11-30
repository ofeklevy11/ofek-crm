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
  defaultValue?: string;
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

  // Initialize default values when opening
  const handleOpen = () => {
    const defaults: Record<string, any> = {};
    schema.forEach((field) => {
      if (field.defaultValue) {
        defaults[field.name] = field.defaultValue;
      }
    });
    setFormData(defaults);
    setIsOpen(true);
  };

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
        onClick={handleOpen}
        className="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition shadow-sm font-medium"
      >
        + Add Record
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] h-[90vh] flex flex-col">
        <div className="flex justify-between items-center px-8 py-6 border-b border-gray-100">
          <h3 className="text-2xl font-bold text-gray-900">New Record</h3>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <form
            id="add-record-form"
            onSubmit={handleSubmit}
            className="space-y-8"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {schema
                .filter(
                  (field, index, self) =>
                    index === self.findIndex((t) => t.name === field.name)
                )
                .map((field) => (
                  <div key={field.name} className="space-y-2">
                    <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide">
                      {field.label}
                    </label>
                    {field.type === "select" ? (
                      <select
                        value={formData[field.name] || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            [field.name]: e.target.value,
                          })
                        }
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white text-black"
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
                        value={
                          formData[field.name] === undefined
                            ? ""
                            : String(formData[field.name])
                        }
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            [field.name]: e.target.value === "true",
                          })
                        }
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white text-black"
                      >
                        <option value="">Select...</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : field.type === "textarea" ? (
                      <textarea
                        value={formData[field.name] || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            [field.name]: e.target.value,
                          })
                        }
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-h-[120px] transition text-black"
                        placeholder={`Enter ${field.label}...`}
                      />
                    ) : field.type === "radio" ? (
                      <div className="flex flex-wrap gap-4 pt-2">
                        {field.options?.map((opt, i) => (
                          <label
                            key={`${opt}-${i}`}
                            className="flex items-center gap-3 text-black cursor-pointer bg-gray-50 px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-100 transition"
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
                              className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                            />
                            <span className="font-medium">{opt}</span>
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
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-h-[120px] transition text-black"
                      >
                        {field.options?.map((opt, i) => (
                          <option key={`${opt}-${i}`} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : field.type === "tags" ? (
                      <div className="flex flex-wrap gap-2 p-4 bg-gray-50 rounded-xl border border-gray-200">
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
                                setFormData({
                                  ...formData,
                                  [field.name]: newTags,
                                });
                              }}
                              className={`px-4 py-2 rounded-lg text-sm font-medium transition shadow-sm ${
                                isSelected
                                  ? "bg-blue-600 text-white shadow-blue-200"
                                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
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
                      <div className="bg-gray-50 p-1 rounded-xl border border-gray-200">
                        <RelationPicker
                          tableId={field.relationTableId}
                          value={formData[field.name]}
                          onChange={async (val) => {
                            // Update the relation field
                            const newFormData = {
                              ...formData,
                              [field.name]: val,
                            };
                            setFormData(newFormData);

                            // Find dependent lookup fields
                            const lookupFields = schema.filter(
                              (f) =>
                                f.type === "lookup" &&
                                f.relationField === field.name
                            );

                            if (lookupFields.length > 0) {
                              if (val) {
                                try {
                                  // Fetch the related record
                                  // Assuming val is the record ID
                                  const res = await fetch(
                                    `/api/records/${val}`
                                  );
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
                                  console.error(
                                    "Failed to fetch lookup data",
                                    error
                                  );
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
                      </div>
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
                        className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-black ${
                          field.type === "lookup" || field.type === "automation"
                            ? "bg-gray-100 text-gray-500"
                            : ""
                        }`}
                        placeholder={
                          field.type === "lookup"
                            ? "Read Only"
                            : `Enter ${field.label}`
                        }
                        readOnly={
                          field.type === "lookup" || field.type === "automation"
                        }
                      />
                    )}
                  </div>
                ))}
            </div>
          </form>
        </div>

        <div className="border-t border-gray-100 px-8 py-6 flex justify-end gap-4 bg-gray-50 rounded-b-2xl">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="px-6 py-3 bg-white border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition shadow-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-record-form"
            disabled={loading}
            className="px-8 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition shadow-lg disabled:opacity-50 disabled:shadow-none"
          >
            {loading ? "Creating..." : "Create Record"}
          </button>
        </div>
      </div>
    </div>
  );
}
