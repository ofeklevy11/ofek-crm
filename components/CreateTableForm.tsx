"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface FieldRow {
  name: string;
  type: string;
  label: string;
  options: string; // Comma separated for UI
}

export default function CreateTableForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [tableName, setTableName] = useState("");
  const [slug, setSlug] = useState("");

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

    // Auto-generate name from label if name is empty
    if (key === "label" && newFields[index].name === "") {
      newFields[index].name = value.toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    setFields(newFields);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Construct schema from fields
      const schemaJson = fields.map((f) => ({
        name: f.name,
        type: f.type,
        label: f.label,
        options:
          f.type === "select"
            ? f.options
                .split(",")
                .map((o) => o.trim())
                .filter(Boolean)
            : undefined,
      }));

      const res = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tableName,
          slug: slug,
          schemaJson,
          createdBy: 1, // Hardcoded for MVP
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
              className="p-6 bg-gradient-to-br from-gray-50 to-white rounded-xl border-2 border-gray-200 hover:border-gray-300 transition shadow-sm"
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
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="boolean">Boolean</option>
                    <option value="select">Select</option>
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

              {field.type === "select" && (
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
          className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-10 rounded-xl hover:from-blue-700 hover:to-blue-800 transition disabled:opacity-50 font-medium shadow-lg"
        >
          {loading ? "Creating Table..." : "Create Table"}
        </button>
      </div>
    </form>
  );
}
