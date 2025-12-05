"use client";

import { useState, useEffect, useRef } from "react";
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
  allowMultiple?: boolean;
  displayField?: string;
}

interface EditRecordModalProps {
  record: any;
  schema: SchemaField[];
  onClose: () => void;
  initialFocusField?: string;
}

export default function EditRecordModal({
  record,
  schema,
  onClose,
  initialFocusField,
}: EditRecordModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [createdAt, setCreatedAt] = useState("");
  const [attachments, setAttachments] = useState<any[]>([]);
  const [newAttachmentUrl, setNewAttachmentUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // Auto-focus logic
  useEffect(() => {
    if (initialFocusField) {
      // Small timeout to ensure DOM is ready
      setTimeout(() => {
        const element = document.getElementById(`field-${initialFocusField}`);
        if (element) {
          element.focus();
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
    }
  }, [initialFocusField]);

  useEffect(() => {
    if (record && record.data) {
      const parsedData = { ...record.data };
      schema.forEach((field) => {
        if (
          (field.type === "tags" || field.type === "multi-select") &&
          typeof parsedData[field.name] === "string"
        ) {
          try {
            parsedData[field.name] = JSON.parse(parsedData[field.name]);
          } catch (e) {
            // keep as string if parse fails
          }
        }
      });
      setFormData(parsedData);
      if (record.createdAt) {
        // Format for datetime-local input: YYYY-MM-DDTHH:mm
        const date = new Date(record.createdAt);
        const formatted = new Date(
          date.getTime() - date.getTimezoneOffset() * 60000
        )
          .toISOString()
          .slice(0, 16);
        setCreatedAt(formatted);
      }
      fetchAttachments();
    }
  }, [record, schema]);

  const fetchAttachments = async () => {
    try {
      const res = await fetch(`/api/records/${record.id}/attachments`);
      if (res.ok) {
        const data = await res.json();
        setAttachments(data);
      }
    } catch (error) {
      console.error("Failed to fetch attachments", error);
    }
  };

  const handleAddAttachment = async () => {
    if (!newAttachmentUrl) return;
    setUploading(true);
    try {
      const res = await fetch(`/api/records/${record.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: newAttachmentUrl.split("/").pop() || "file",
          url: newAttachmentUrl,
          size: 0,
          uploadedBy: 1,
        }),
      });
      if (res.ok) {
        setNewAttachmentUrl("");
        fetchAttachments();
      }
    } catch (error) {
      console.error("Failed to add attachment", error);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/records/${record.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: formData,
          createdAt: new Date(createdAt).toISOString(),
          updatedBy: 1, // Hardcoded user
        }),
      });

      if (!res.ok) throw new Error("Failed to update record");

      router.refresh();
      onClose();
    } catch (error) {
      console.error(error);
      alert("Error updating record");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-black">
            Edit Record #{record.id}
          </h3>
          <button onClick={onClose} className="text-black hover:text-gray-700">
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 gap-4">
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
                      id={`field-${field.name}`}
                      value={formData[field.name] || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          [field.name]: e.target.value,
                        })
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
                      id={`field-${field.name}`}
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">Select...</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea
                      id={`field-${field.name}`}
                      value={formData[field.name] || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          [field.name]: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
                    />
                  ) : field.type === "radio" ? (
                    <div className="flex gap-4 pt-2" id={`field-${field.name}`}>
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
                      id={`field-${field.name}`}
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
                    <div
                      className="flex flex-wrap gap-2"
                      id={`field-${field.name}`}
                    >
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
                    <div id={`field-${field.name}`}>
                      <RelationPicker
                        tableId={field.relationTableId}
                        value={formData[field.name]}
                        allowMultiple={field.allowMultiple}
                        displayField={field.displayField}
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
                            if (val && !Array.isArray(val)) {
                              try {
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
                                console.error(
                                  "Failed to fetch lookup data",
                                  error
                                );
                              }
                            } else {
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
                      id={`field-${field.name}`}
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

            {/* Created At Field */}
            <div>
              <label className="block text-sm font-medium text-black mb-1">
                Created At
              </label>
              <input
                type="datetime-local"
                value={createdAt}
                onChange={(e) => setCreatedAt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 mt-4">
            <h4 className="font-medium text-black mb-3">Attachments</h4>
            <div className="space-y-3 mb-4">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between bg-gray-50 p-2 rounded text-sm"
                >
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline truncate max-w-[200px]"
                  >
                    {att.filename}
                  </a>
                  <span className="text-black text-xs">
                    {new Date(att.uploadedAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
              {attachments.length === 0 && (
                <p className="text-black text-sm italic">No attachments</p>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="Paste file URL..."
                value={newAttachmentUrl}
                onChange={(e) => setNewAttachmentUrl(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button
                type="button"
                onClick={handleAddAttachment}
                disabled={uploading || !newAttachmentUrl}
                className="bg-gray-100 text-black px-3 py-2 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50"
              >
                {uploading ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
          <div className="flex justify-end pt-4 gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-black hover:bg-gray-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
