"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface SchemaField {
  name: string;
  type: string;
  label: string;
  options?: string[];
}

interface EditRecordModalProps {
  record: any;
  schema: SchemaField[];
  onClose: () => void;
}

export default function EditRecordModal({
  record,
  schema,
  onClose,
}: EditRecordModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [attachments, setAttachments] = useState<any[]>([]);
  const [newAttachmentUrl, setNewAttachmentUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (record && record.data) {
      setFormData(record.data);
      fetchAttachments();
    }
  }, [record]);

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
