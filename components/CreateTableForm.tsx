"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface FieldRow {
  name: string;
  type: string;
  label: string;
  options: string; // Comma separated for UI
  relationTableId?: string; // For relation
  relationField?: string; // For lookup (which relation field to use)
  lookupField?: string; // For lookup (which field from related table to show)
  defaultValue?: string;
  allowMultiple?: boolean; // For relation (many-to-many)
  displayField?: string; // For relation (which field to show in picker)
}

interface TableOption {
  id: number;
  name: string;
  schemaJson: any;
}

export default function CreateTableForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [tableName, setTableName] = useState("");
  const [slug, setSlug] = useState("");
  const [availableTables, setAvailableTables] = useState<TableOption[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>(
    []
  );
  const [categoryId, setCategoryId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/tables")
      .then((res) => res.json())
      .then((data) => setAvailableTables(data))
      .catch((err) => console.error("Failed to load tables", err));

    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => setCategories(data))
      .catch((err) => console.error("Failed to load categories", err));
  }, []);

  const [fields, setFields] = useState<FieldRow[]>([
    { name: "title", type: "text", label: "Title", options: "" },
    {
      name: "status",
      type: "select",
      label: "Status",
      options: "New, Active, Closed",
    },
  ]);

  const handleAddField = () => {
    setFields([
      ...fields,
      { name: "", type: "text", label: "", options: "", defaultValue: "" },
    ]);
  };

  const handleRemoveField = (index: number) => {
    const newFields = [...fields];
    newFields.splice(index, 1);
    setFields(newFields);
  };

  const handleFieldChange = (
    index: number,
    key: keyof FieldRow,
    value: string | boolean
  ) => {
    const newFields = [...fields];
    (newFields[index][key] as any) = value;

    // Auto-generate name from label if name is empty
    if (
      key === "label" &&
      newFields[index].name === "" &&
      typeof value === "string"
    ) {
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
      // Construct schema from fields
      const schemaJson = fields.map((f) => ({
        name: f.name,
        type: f.type,
        label: f.label,
        options: ["select", "multi-select", "radio", "tags"].includes(f.type)
          ? Array.from(
              new Set(
                f.options
                  .split(",")
                  .map((o) => o.trim())
                  .filter(Boolean)
              )
            )
          : undefined,
        relationTableId: f.relationTableId
          ? Number(f.relationTableId)
          : undefined,
        relationField: f.relationField,
        lookupField: f.lookupField,
        defaultValue: f.defaultValue,
        allowMultiple: f.allowMultiple,
        displayField: f.displayField,
      }));

      const res = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tableName,
          slug: slug,
          schemaJson,
          createdBy: 1, // Hardcoded for MVP
          categoryId,
        }),
      });

      if (!res.ok) throw new Error("Failed to create table");

      router.push("/tables");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Error creating table");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-8 bg-white p-10 rounded-2xl shadow-lg border border-gray-200 text-black"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <label className="block text-sm font-bold text-black mb-3">
            Table Name
          </label>
          <input
            type="text"
            required
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            className="w-full px-5 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-black text-lg"
            placeholder="e.g. Projects"
          />
          <p className="text-xs text-gray-500 mt-2">
            The display name for your table
          </p>
        </div>

        <div>
          <label className="block text-sm font-bold text-black mb-3">
            Slug
          </label>
          <input
            type="text"
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full px-5 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-black text-lg font-mono"
            placeholder="e.g. projects"
          />
          <p className="text-xs text-gray-500 mt-2">
            URL-friendly identifier (lowercase, no spaces)
          </p>
        </div>

        <div className="col-span-full">
          <label className="block text-sm font-bold text-black mb-3">
            Category
          </label>
          <select
            value={categoryId || ""}
            onChange={(e) =>
              setCategoryId(e.target.value ? Number(e.target.value) : null)
            }
            className="w-full px-5 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-black text-lg"
          >
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-2">
            Group this table under a category
          </p>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-bold text-black">Fields</h3>
            <p className="text-sm text-gray-600 mt-1">
              Define the structure of your table
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddField}
            className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl transition font-medium shadow-sm"
          >
            + Add Field
          </button>
        </div>

        <div className="space-y-5">
          {fields.map((field, index) => (
            <div
              key={index}
              className="p-6 bg-linear-to-br from-gray-50 to-white rounded-xl border-2 border-gray-200 hover:border-gray-300 transition shadow-sm"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className="lg:col-span-1">
                  <label className="block text-xs font-bold text-black mb-2 uppercase tracking-wide">
                    Label
                  </label>
                  <input
                    type="text"
                    required
                    value={field.label}
                    onChange={(e) =>
                      handleFieldChange(index, "label", e.target.value)
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black"
                    placeholder="Field Label"
                  />
                </div>
                <div className="lg:col-span-1">
                  <label className="block text-xs font-bold text-black mb-2 uppercase tracking-wide">
                    System Name
                  </label>
                  <input
                    type="text"
                    required
                    value={field.name}
                    onChange={(e) =>
                      handleFieldChange(index, "name", e.target.value)
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black font-mono text-sm"
                    placeholder="field_name"
                  />
                </div>
                <div className="lg:col-span-1">
                  <label className="block text-xs font-bold text-black mb-2 uppercase tracking-wide">
                    Type
                  </label>
                  <select
                    value={field.type}
                    onChange={(e) =>
                      handleFieldChange(index, "type", e.target.value)
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black"
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
                <div className="lg:col-span-1 flex items-end">
                  <button
                    type="button"
                    onClick={() => handleRemoveField(index)}
                    className="w-full bg-red-50 text-red-600 hover:bg-red-100 px-4 py-2.5 rounded-lg transition font-medium border border-red-200"
                    title="Remove Field"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200">
                <label className="block text-xs font-bold text-black mb-2 uppercase tracking-wide">
                  Default Value
                </label>
                <input
                  type="text"
                  value={field.defaultValue || ""}
                  onChange={(e) =>
                    handleFieldChange(index, "defaultValue", e.target.value)
                  }
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black"
                  placeholder="Optional default value"
                />
              </div>

              {["select", "multi-select", "radio", "tags"].includes(
                field.type
              ) && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <label className="block text-xs font-bold text-black mb-2 uppercase tracking-wide">
                    Options (comma separated)
                  </label>
                  <input
                    type="text"
                    value={field.options}
                    onChange={(e) =>
                      handleFieldChange(index, "options", e.target.value)
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black"
                    placeholder="Option 1, Option 2, Option 3"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Separate each option with a comma
                  </p>
                </div>
              )}

              {field.type === "relation" && (
                <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-black mb-2 uppercase tracking-wide">
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
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black"
                    >
                      <option value="">Select a table...</option>
                      {availableTables.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {field.relationTableId && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-black mb-2 uppercase tracking-wide">
                          Display Field
                        </label>
                        <select
                          value={field.displayField || ""}
                          onChange={(e) =>
                            handleFieldChange(
                              index,
                              "displayField",
                              e.target.value
                            )
                          }
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black"
                        >
                          <option value="">Default (First Field)</option>
                          {(() => {
                            const relatedTable = availableTables.find(
                              (t) => t.id === Number(field.relationTableId)
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
                        <p className="text-xs text-gray-500 mt-1">
                          Which field to show in the picker
                        </p>
                      </div>

                      <div className="flex items-center">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={field.allowMultiple || false}
                            onChange={(e) =>
                              handleFieldChange(
                                index,
                                "allowMultiple",
                                e.target.checked
                              )
                            }
                            className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                          />
                          <span className="text-sm font-medium text-black">
                            Allow Multiple Selection
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {field.type === "lookup" && (
                <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-black mb-2 uppercase tracking-wide">
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
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black"
                    >
                      <option value="">Select relation field...</option>
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
                    <label className="block text-xs font-bold text-black mb-2 uppercase tracking-wide">
                      Target Field
                    </label>
                    <select
                      value={field.lookupField || ""}
                      onChange={(e) =>
                        handleFieldChange(index, "lookupField", e.target.value)
                      }
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black"
                    >
                      <option value="">Select Target Field...</option>
                      {(() => {
                        const relationField = fields.find(
                          (f) => f.name === field.relationField
                        );
                        if (!relationField?.relationTableId) return null;
                        const relatedTable = availableTables.find(
                          (t) => t.id === Number(relationField.relationTableId)
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
            </div>
          ))}
        </div>

        {fields.length === 0 && (
          <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
            <p className="text-gray-500 mb-4">No fields added yet</p>
            <button
              type="button"
              onClick={handleAddField}
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl transition font-medium"
            >
              + Add Your First Field
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="bg-gray-100 text-black py-3 px-10 rounded-xl hover:bg-gray-200 transition font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="bg-linear-to-r from-blue-600 to-blue-700 text-white py-3 px-10 rounded-xl hover:from-blue-700 hover:to-blue-800 transition disabled:opacity-50 font-medium shadow-lg"
        >
          {loading ? "Creating Table..." : "Create Table"}
        </button>
      </div>
    </form>
  );
}
