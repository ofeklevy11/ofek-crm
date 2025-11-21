"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface FieldRow {
  name: string;
  type: string;
  label: string;
  options: string;
  relationTableId?: string;
  relationField?: string;
  lookupField?: string;
}

interface TableOption {
  id: number;
  name: string;
  schemaJson: any;
}

interface EditTableModalProps {
  tableId: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function EditTableModal({
  tableId,
  isOpen,
  onClose,
}: EditTableModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [tableName, setTableName] = useState("");
  const [slug, setSlug] = useState("");
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [availableTables, setAvailableTables] = useState<TableOption[]>([]);

  useEffect(() => {
    fetch("/api/tables")
      .then((res) => res.json())
      .then((data) => setAvailableTables(data))
      .catch((err) => console.error("Failed to load tables", err));
  }, []);

  useEffect(() => {
    if (isOpen && tableId) {
      loadTableData();
    }
  }, [isOpen, tableId]);

  const loadTableData = async () => {
    setLoadingData(true);
    try {
      const res = await fetch(`/api/tables/${tableId}`);
      if (!res.ok) throw new Error("Failed to fetch table");

      const table = await res.json();
      setTableName(table.name);
      setSlug(table.slug);

      // Parse schema
      const schema = table.schemaJson as any[];
      const parsedFields = schema.map((field) => ({
        name: field.name,
        type: field.type,
        label: field.label,
        options: field.options ? field.options.join(", ") : "",
        relationTableId: field.relationTableId
          ? String(field.relationTableId)
          : undefined,
        relationField: field.relationField,
        lookupField: field.lookupField,
      }));
      setFields(parsedFields);
    } catch (error) {
      console.error(error);
      alert("Error loading table data");
    } finally {
      setLoadingData(false);
    }
  };

  const handleAddField = () => {
    setFields([...fields, { name: "", type: "text", label: "", options: "" }]);
  };

  const handleRemoveField = (index: number) => {
    const newFields = [...fields];
    newFields.splice(index, 1);
    setFields(newFields);
  };

  const handleFieldChange = (
    index: number,
    key: keyof FieldRow,
    value: string
  ) => {
    const newFields = [...fields];
    newFields[index][key] = value;

    if (key === "label" && newFields[index].name === "") {
      newFields[index].name = value.toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    setFields(newFields);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate duplicate field names
    const names = fields.map((f) => f.name);
    const uniqueNames = new Set(names);
    if (uniqueNames.size !== names.length) {
      alert(
        "Field names must be unique. Please check your field system names."
      );
      setLoading(false);
      return;
    }

    try {
      const schemaJson = fields.map((f) => ({
        name: f.name,
        type: f.type,
        label: f.label,
        options: ["select", "multi-select", "radio", "tags"].includes(f.type)
          ? f.options
              .split(",")
              .map((o) => o.trim())
              .filter(Boolean)
          : undefined,
        relationTableId: f.relationTableId
          ? Number(f.relationTableId)
          : undefined,
        relationField: f.relationField,
        lookupField: f.lookupField,
      }));

      const res = await fetch(`/api/tables/${tableId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tableName,
          slug: slug,
          schemaJson,
        }),
      });

      if (!res.ok) throw new Error("Failed to update table");

      router.refresh();
      onClose();
    } catch (error) {
      console.error(error);
      alert("Error updating table");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-8 py-6 flex justify-between items-center rounded-t-2xl">
          <h2 className="text-2xl font-bold text-gray-900">Edit Table</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {loadingData ? (
          <div className="p-8 text-center text-gray-600">Loading...</div>
        ) : (
          <form onSubmit={handleSubmit} className="p-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-black mb-2">
                  Table Name
                </label>
                <input
                  type="text"
                  required
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-black"
                  placeholder="e.g. Projects"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-black mb-2">
                  Slug
                </label>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-black"
                  placeholder="e.g. projects"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-black">Fields</h3>
                <button
                  type="button"
                  onClick={handleAddField}
                  className="text-sm bg-gray-100 hover:bg-gray-200 text-black px-3 py-1 rounded-lg transition font-medium"
                >
                  + Add Field
                </button>
              </div>

              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div
                    key={index}
                    className="flex flex-col md:flex-row gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 items-start"
                  >
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-black mb-1">
                        Label
                      </label>
                      <input
                        type="text"
                        required
                        value={field.label}
                        onChange={(e) =>
                          handleFieldChange(index, "label", e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none text-black text-sm"
                        placeholder="Field Label"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-black mb-1">
                        System Name
                      </label>
                      <input
                        type="text"
                        required
                        value={field.name}
                        onChange={(e) =>
                          handleFieldChange(index, "name", e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none text-black text-sm font-mono"
                        placeholder="field_name"
                      />
                    </div>
                    <div className="w-32">
                      <label className="block text-xs font-bold text-black mb-1">
                        Type
                      </label>
                      <select
                        value={field.type}
                        onChange={(e) =>
                          handleFieldChange(index, "type", e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none text-black text-sm"
                      >
                        <option value="text">Text</option>
                        <option value="textarea">Textarea</option>
                        <option value="number">Number</option>
                        <option value="date">Date</option>
                        <option value="boolean">Boolean</option>
                        <option value="url">URL</option>
                        <option value="select">Select</option>
                        <option value="multi-select">Multi Select</option>
                        <option value="tags">Tags</option>
                        <option value="radio">Radio Buttons</option>
                        <option value="relation">Relation</option>
                        <option value="lookup">Lookup</option>
                        <option value="automation">Automation Trigger</option>
                      </select>
                    </div>

                    {["select", "multi-select", "radio", "tags"].includes(
                      field.type
                    ) && (
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-black mb-1">
                          Options (comma separated)
                        </label>
                        <input
                          type="text"
                          value={field.options}
                          onChange={(e) =>
                            handleFieldChange(index, "options", e.target.value)
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none text-black text-sm"
                          placeholder="Option 1, Option 2"
                        />
                      </div>
                    )}

                    {field.type === "relation" && (
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-black mb-1">
                          Related Table
                        </label>
                        <select
                          value={field.relationTableId || ""}
                          onChange={(e) =>
                            handleFieldChange(
                              index,
                              "relationTableId",
                              e.target.value
                            )
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none text-black text-sm"
                        >
                          <option value="">Select a table...</option>
                          {availableTables.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {field.type === "lookup" && (
                      <div className="flex-[2] grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-bold text-black mb-1">
                            Relation Field
                          </label>
                          <select
                            value={field.relationField || ""}
                            onChange={(e) =>
                              handleFieldChange(
                                index,
                                "relationField",
                                e.target.value
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none text-black text-sm"
                          >
                            <option value="">Select relation...</option>
                            {fields
                              .filter((f) => f.type === "relation" && f.name)
                              .map((f) => (
                                <option key={f.name} value={f.name}>
                                  {f.label || f.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-black mb-1">
                            Target Field
                          </label>
                          <select
                            value={field.lookupField || ""}
                            onChange={(e) =>
                              handleFieldChange(
                                index,
                                "lookupField",
                                e.target.value
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none text-black text-sm"
                          >
                            <option value="">Select Target Field...</option>
                            {(() => {
                              const relationField = fields.find(
                                (f) => f.name === field.relationField
                              );
                              if (!relationField?.relationTableId) return null;
                              const relatedTable = availableTables.find(
                                (t) =>
                                  t.id === Number(relationField.relationTableId)
                              );
                              if (!relatedTable?.schemaJson) return null;

                              let relatedSchema: any[] = [];
                              try {
                                relatedSchema =
                                  typeof relatedTable.schemaJson === "string"
                                    ? JSON.parse(relatedTable.schemaJson)
                                    : relatedTable.schemaJson;
                              } catch (e) {
                                return null;
                              }

                              return relatedSchema.map((f: any) => (
                                <option key={f.name} value={f.name}>
                                  {f.label || f.name}
                                </option>
                              ));
                            })()}
                          </select>
                        </div>
                      </div>
                    )}

                    <div className="pt-6">
                      <button
                        type="button"
                        onClick={() => handleRemoveField(index)}
                        className="text-red-600 hover:text-red-800 p-2"
                        title="Remove Field"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="bg-gray-100 text-black py-3 px-8 rounded-lg hover:bg-gray-200 transition font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-black text-white py-3 px-8 rounded-lg hover:bg-gray-800 transition disabled:opacity-50 font-medium"
              >
                {loading ? "Updating..." : "Update Table"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
