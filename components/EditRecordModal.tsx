"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import RelationPicker from "./RelationPicker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Save,
  Trash2,
  Plus,
  RotateCw,
  Paperclip,
  ExternalLink,
  Pencil,
  X,
  Check,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

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
  min?: number | string;
  max?: number | string;
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
  const [updatedAt, setUpdatedAt] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [updaterName, setUpdaterName] = useState("");
  const [attachments, setAttachments] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]); // New state for files
  const [newAttachmentUrl, setNewAttachmentUrl] = useState("");
  const [newAttachmentName, setNewAttachmentName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(true);

  // State for editing existing link
  const [editingLinkId, setEditingLinkId] = useState<number | null>(null);
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const [editLinkName, setEditLinkName] = useState("");

  // State for editing existing file
  const [editingFileId, setEditingFileId] = useState<number | null>(null);
  const [editFileName, setEditFileName] = useState("");

  // Auto-focus logic already exists...
  // ...

  // Update fetchAttachments to also fetch files?
  // Or fetch files separately.
  // The record object passed in might already have files if we updated the query.
  // But for live updates after upload, we might need to fetch.
  // Let's check schema. Record now has files relation.
  // If record prop is stale, we need to fetch fresh data.

  useEffect(() => {
    // Initialize form data from record
    if (record && record.data) {
      const initialData: Record<string, any> = {};
      schema.forEach((field) => {
        if (record.data[field.name] !== undefined) {
          initialData[field.name] = record.data[field.name];
        }
      });
      setFormData(initialData);
    }

    // Initialize createdAt (date only, no time)
    if (record && record.createdAt) {
      const date = new Date(record.createdAt);
      // Format as YYYY-MM-DD for the date input
      const formattedDate = date.toISOString().split("T")[0];
      setCreatedAt(formattedDate);
    }

    // Initialize updatedAt (date only, no time)
    if (record && record.updatedAt) {
      const date = new Date(record.updatedAt);
      const formattedDate = date.toISOString().split("T")[0];
      setUpdatedAt(formattedDate);
    }

    // Initialize creator name
    if (record && record.creator) {
      setCreatorName(record.creator.name || record.creator.email || "");
    }

    // Initialize updater name
    if (record && record.updater) {
      setUpdaterName(record.updater.name || record.updater.email || "");
    }

    fetchAttachments();
    fetchFiles();
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

  // New function to fetch files (we might need a new API route or just use generic storage action?)
  // Using server action from client might be cleaner if allowed, but here we are in 'use client'.
  // We can use a server action wrapper or just assume record.files is passed?
  // record.files might be stale.
  // Let's create a small function to re-fetch record files?
  // Or use the storage action `getStorageData` but filtered?
  // The easiest way is probably to assume `saveFileMetadata` works and then we manually add to state.
  // But for deletion we need ID.
  // Let's rely on record prop initially, but we need to refresh.
  // Actually, let's fetch the record fresh from API which includes files.

  const fetchFiles = async () => {
    // We can reuse the record fetch API?
    // GET /api/tables/:id/records currently returns all records.
    // We assume there is a GET /api/records/:id route?
    // Yes, RelationPicker uses `/api/records/${val}`.
    try {
      const res = await fetch(`/api/records/${record.id}`);
      if (res.ok) {
        const freshRecord = await res.json();
        if (freshRecord.files) {
          setFiles(freshRecord.files);
        }
        if (freshRecord.attachments) {
          setAttachments(freshRecord.attachments);
        }
        // Update creator/updater info from fresh data
        if (freshRecord.creator) {
          setCreatorName(
            freshRecord.creator.name || freshRecord.creator.email || "",
          );
        }
        if (freshRecord.updater) {
          setUpdaterName(
            freshRecord.updater.name || freshRecord.updater.email || "",
          );
        }
        if (freshRecord.updatedAt) {
          const date = new Date(freshRecord.updatedAt);
          setUpdatedAt(date.toISOString().split("T")[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch fresh files", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const file = selectedFiles[0];
    if (file.size > 1024 * 1024) {
      alert("גודל הקובץ חייב להיות עד 1MB");
      return;
    }

    setUploading(true);
    try {
      // Dynamic import to avoid build issues if mixed
      const { uploadFiles } = await import("@/lib/uploadthing");
      const { saveFileMetadata } = await import("@/app/actions/storage");

      const res = await uploadFiles("companyFiles", { files: [file] });

      if (res && res.length > 0) {
        const uploaded = res[0];
        await saveFileMetadata(
          {
            name: uploaded.name,
            url: uploaded.url,
            key: uploaded.key,
            size: uploaded.size,
            type: file.type || "unknown",
          },
          null,
          record.id,
        );

        // Refresh files
        fetchFiles();
        router.refresh();
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      alert("שגיאה בהעלאה: " + error.message);
    } finally {
      setUploading(false);
      e.target.value = ""; // reset
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    if (!confirm("האם למחוק קובץ זה?")) return;
    try {
      const { deleteFile } = await import("@/app/actions/storage");
      await deleteFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      router.refresh();
    } catch (err) {
      console.error("Delete file error", err);
      alert("שגיאה במחיקת הקובץ");
    }
  };

  const handleAddAttachment = async () => {
    if (!newAttachmentUrl) return;

    let finalUrl = newAttachmentUrl.trim();
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    let filename = finalUrl.replace(/^https?:\/\//i, "");
    if (filename.includes("/")) {
      filename = filename.split("/").pop() || filename;
    }
    if (!filename || filename.length === 0) filename = "link";

    setUploading(true);
    try {
      const res = await fetch(`/api/records/${record.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename,
          url: finalUrl,
          size: 0,
          displayName: newAttachmentName.trim() || null,
        }),
      });
      if (res.ok) {
        setNewAttachmentUrl("");
        setNewAttachmentName("");
        fetchAttachments(); // re-fetch attachments
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to add attachment", error);
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateAttachment = async (attachmentId: number) => {
    if (!editLinkUrl.trim()) return;

    let finalUrl = editLinkUrl.trim();
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    setUploading(true);
    try {
      const res = await fetch(`/api/attachments/${attachmentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: finalUrl,
          displayName: editLinkName.trim() || null,
        }),
      });

      if (res.ok) {
        const updatedAttachment = await res.json();
        setAttachments((prev) =>
          prev.map((a) => (a.id === attachmentId ? updatedAttachment : a)),
        );
        setEditingLinkId(null);
        setEditLinkUrl("");
        setEditLinkName("");
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to update attachment", error);
      alert("שגיאה בעדכון הלינק");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    if (!confirm("האם למחוק לינק זה?")) return;
    try {
      const res = await fetch(`/api/attachments/${attachmentId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
        router.refresh();
      } else {
        throw new Error("Failed to delete attachment");
      }
    } catch (error) {
      console.error(error);
      alert("שגיאה במחיקת לינק");
    }
  };

  const handleUpdateFile = async (fileId: number) => {
    setUploading(true);
    try {
      const res = await fetch(`/api/files/${fileId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: editFileName.trim() || null,
        }),
      });

      if (res.ok) {
        const updatedFile = await res.json();
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? { ...f, displayName: updatedFile.displayName }
              : f,
          ),
        );
        setEditingFileId(null);
        setEditFileName("");
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to update file", error);
      alert("שגיאה בעדכון שם הקובץ");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Sanitize URL fields
      const finalData = { ...formData };
      schema.forEach((field) => {
        if (
          field.type === "url" &&
          finalData[field.name] &&
          typeof finalData[field.name] === "string"
        ) {
          const val = finalData[field.name].trim();
          if (val && !/^https?:\/\//i.test(val)) {
            finalData[field.name] = `https://${val}`;
          }
        }
      });

      const res = await fetch(`/api/records/${record.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: finalData,
        }),
      });

      if (!res.ok) throw new Error("Failed to update record");

      router.refresh();
      handleClose();
    } catch (error) {
      console.error(error);
      alert("שגיאה בעדכון הרשומה");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(onClose, 100); // Allow animation to finish
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => !val && handleClose()}
      modal={true}
    >
      <DialogContent className="max-w-[95vw] w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            עריכת רשומה{" "}
            <span className="text-muted-foreground font-mono">
              #{record.id}
            </span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {schema
              .filter(
                (field, index, self) =>
                  index === self.findIndex((t) => t.name === field.name),
              )
              .map((field) => (
                <div
                  key={field.name}
                  className={
                    field.type === "textarea" ? "col-span-1 md:col-span-2" : ""
                  }
                >
                  <Label className="text-sm font-semibold mb-1.5 block">
                    {field.label}
                  </Label>

                  {field.type === "select" ? (
                    <div className="relative">
                      <select
                        id={`field-${field.name}`}
                        value={formData[field.name] || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            [field.name]: e.target.value,
                          })
                        }
                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
                      >
                        <option value="">בחר...</option>
                        {field.options?.map((opt, i) => (
                          <option key={`${opt}-${i}`} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-2 text-gray-700">
                        <svg
                          className="fill-current h-4 w-4"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                        </svg>
                      </div>
                    </div>
                  ) : field.type === "boolean" ? (
                    <div className="relative">
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
                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
                      >
                        <option value="">בחר...</option>
                        <option value="true">כן</option>
                        <option value="false">לא</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-2 text-gray-700">
                        <svg
                          className="fill-current h-4 w-4"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                        </svg>
                      </div>
                    </div>
                  ) : field.type === "textarea" ? (
                    <Textarea
                      id={`field-${field.name}`}
                      value={formData[field.name] || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          [field.name]: e.target.value,
                        })
                      }
                      className="min-h-[80px]"
                    />
                  ) : field.type === "radio" ? (
                    <div
                      className="flex flex-wrap gap-4 pt-1"
                      id={`field-${field.name}`}
                    >
                      {field.options?.map((opt, i) => (
                        <label
                          key={`${opt}-${i}`}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <Checkbox
                            checked={formData[field.name] === opt}
                            onCheckedChange={() =>
                              setFormData({
                                ...formData,
                                [field.name]: opt,
                              })
                            }
                            className="rounded-full"
                          />
                          <span className="text-sm">{opt}</span>
                        </label>
                      ))}
                    </div>
                  ) : field.type === "multi-select" ? (
                    <div className="relative">
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
                            (option) => option.value,
                          );
                          setFormData({ ...formData, [field.name]: selected });
                        }}
                        className="flex min-h-[100px] w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {field.options?.map((opt, i) => (
                          <option key={`${opt}-${i}`} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : field.type === "tags" ? (
                    <div
                      className="flex flex-wrap gap-2 p-2 bg-muted/20 rounded-md border border-input min-h-[40px]"
                      id={`field-${field.name}`}
                    >
                      {field.options?.map((tag, i) => {
                        const rawValue = formData[field.name];
                        const currentTags = Array.isArray(rawValue)
                          ? rawValue
                          : [];
                        const isSelected = currentTags.includes(tag);
                        return (
                          <Badge
                            key={`${tag}-${i}`}
                            variant={isSelected ? "default" : "outline"}
                            className="text-xs cursor-pointer select-none hover:bg-primary/90"
                            onClick={() => {
                              const newTags = isSelected
                                ? currentTags.filter((t: string) => t !== tag)
                                : [...currentTags, tag];
                              setFormData({
                                ...formData,
                                [field.name]: newTags,
                              });
                            }}
                          >
                            {tag}
                          </Badge>
                        );
                      })}
                      {(!field.options || field.options.length === 0) && (
                        <p className="text-xs text-muted-foreground italic">
                          לא הוגדרו תגיות
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
                          const newFormData = {
                            ...formData,
                            [field.name]: val,
                          };
                          setFormData(newFormData);

                          const lookupFields = schema.filter(
                            (f) =>
                              f.type === "lookup" &&
                              f.relationField === field.name,
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
                                  error,
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
                  ) : field.type === "score" ? (
                    <div
                      id={`field-${field.name}`}
                      className="space-y-4 pt-2 px-1"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground font-mono">
                          {field.min || 0}
                        </span>
                        <div className="flex flex-col items-center">
                          <span className="text-2xl font-bold text-primary">
                            {formData[field.name] !== undefined
                              ? formData[field.name]
                              : Number(field.min || 0)}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">
                          {field.max || 10}
                        </span>
                      </div>
                      <Slider
                        value={[
                          formData[field.name] !== undefined
                            ? Number(formData[field.name])
                            : Number(field.min || 0),
                        ]}
                        min={Number(field.min || 0)}
                        max={Number(field.max || 10)}
                        step={1}
                        onValueChange={(vals) =>
                          setFormData({
                            ...formData,
                            [field.name]: vals[0],
                          })
                        }
                        className="py-2 cursor-pointer"
                      />
                    </div>
                  ) : (
                    <Input
                      id={`field-${field.name}`}
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
                      onBlur={(e) => {
                        if (field.type === "url" && e.target.value) {
                          let val = e.target.value.trim();
                          if (val && !/^https?:\/\//i.test(val)) {
                            setFormData({
                              ...formData,
                              [field.name]: `https://${val}`,
                            });
                          }
                        }
                      }}
                      className={
                        field.type === "lookup" || field.type === "automation"
                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                          : ""
                      }
                      readOnly={
                        field.type === "lookup" || field.type === "automation"
                      }
                    />
                  )}
                </div>
              ))}

            {/* Created At Field - Read Only */}
            <div>
              <Label className="text-sm font-semibold mb-1.5 block text-muted-foreground">
                נוצר בתאריך
              </Label>
              <Input
                type="date"
                value={createdAt}
                disabled
                className="bg-muted text-muted-foreground cursor-not-allowed"
              />
            </div>

            {/* Created By Field - Read Only */}
            {creatorName && (
              <div>
                <Label className="text-sm font-semibold mb-1.5 block text-muted-foreground">
                  נוצר על ידי
                </Label>
                <Input
                  type="text"
                  value={creatorName}
                  disabled
                  className="bg-muted text-muted-foreground cursor-not-allowed"
                />
              </div>
            )}

            {/* Updated At Field - Read Only */}
            <div>
              <Label className="text-sm font-semibold mb-1.5 block text-muted-foreground">
                עודכן בתאריך
              </Label>
              <Input
                type="date"
                value={updatedAt}
                disabled
                className="bg-muted text-muted-foreground cursor-not-allowed"
              />
            </div>

            {/* Updated By Field - Read Only */}
            {updaterName && (
              <div>
                <Label className="text-sm font-semibold mb-1.5 block text-muted-foreground">
                  עודכן על ידי
                </Label>
                <Input
                  type="text"
                  value={updaterName}
                  disabled
                  className="bg-muted text-muted-foreground cursor-not-allowed"
                />
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4 mt-4 space-y-3">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Paperclip className="h-4 w-4" /> קבצים ולינקים
            </h4>

            {/* Display Existing Attachments (Links) & Files */}
            <div className="space-y-2">
              {/* Legacy Attachments (Links) */}
              {attachments.map((att) => (
                <div
                  key={`att-${att.id}`}
                  className="bg-muted/30 p-2 rounded-md border border-border text-sm"
                >
                  {editingLinkId === att.id ? (
                    // Edit mode
                    <div className="flex flex-col gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          שם הלינק (אופציונלי)
                        </Label>
                        <Input
                          placeholder="שם לתצוגה..."
                          value={editLinkName}
                          onChange={(e) => setEditLinkName(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          כתובת URL
                        </Label>
                        <Input
                          placeholder="https://..."
                          value={editLinkUrl}
                          onChange={(e) => setEditLinkUrl(e.target.value)}
                          className="h-8 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleUpdateAttachment(att.id);
                            }
                            if (e.key === "Escape") {
                              setEditingLinkId(null);
                              setEditLinkUrl("");
                              setEditLinkName("");
                            }
                          }}
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingLinkId(null);
                            setEditLinkUrl("");
                            setEditLinkName("");
                          }}
                        >
                          <X className="h-4 w-4 mr-1" /> ביטול
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleUpdateAttachment(att.id)}
                          disabled={!editLinkUrl.trim() || uploading}
                        >
                          <Check className="h-4 w-4 mr-1" /> שמור
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // Display mode
                    <div className="flex items-center justify-between">
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline truncate max-w-[200px] flex items-center gap-1"
                        title={att.url}
                      >
                        {att.displayName || att.filename}{" "}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs">
                          {new Date(att.uploadedAt).toLocaleDateString()}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-primary/10 hover:text-primary text-muted-foreground"
                          onClick={() => {
                            setEditingLinkId(att.id);
                            setEditLinkUrl(att.url);
                            setEditLinkName(att.displayName || "");
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                          onClick={() => handleDeleteAttachment(att.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Files Linked to Record */}
              {files.map((file) => (
                <div
                  key={`file-${file.id}`}
                  className="flex flex-col gap-2 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-md border border-blue-100 dark:border-blue-800 text-sm"
                >
                  {editingFileId === file.id ? (
                    // Edit Mode
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground shrink-0">
                          שם:
                        </span>
                        <Input
                          placeholder={file.name}
                          value={editFileName}
                          onChange={(e) => setEditFileName(e.target.value)}
                          className="h-7 text-sm flex-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleUpdateFile(file.id);
                            if (e.key === "Escape") {
                              setEditingFileId(null);
                              setEditFileName("");
                            }
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7"
                          onClick={() => {
                            setEditingFileId(null);
                            setEditFileName("");
                          }}
                          disabled={uploading}
                        >
                          <X className="h-3 w-3 mr-1" />
                          ביטול
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7"
                          onClick={() => handleUpdateFile(file.id)}
                          disabled={uploading}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          {uploading ? "שומר..." : "שמור"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // Normal Mode
                    <div className="flex items-center justify-between">
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[200px] flex items-center gap-1"
                        title={file.url}
                      >
                        📄 {(file as any).displayName || file.name}
                      </a>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground text-xs">
                          {file.size
                            ? Math.round(file.size / 1024) + " KB"
                            : ""}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-blue-200 dark:hover:bg-blue-800 text-muted-foreground"
                          onClick={() => {
                            setEditFileName((file as any).displayName || "");
                            setEditingFileId(file.id);
                          }}
                          title="ערוך שם"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                          onClick={() => handleDeleteFile(file.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {attachments.length === 0 && files.length === 0 && (
                <p className="text-muted-foreground text-sm italic">
                  אין קבצים או לינקים
                </p>
              )}
            </div>

            {/* Upload & Add Link Section */}
            <div className="flex flex-col gap-3">
              {/* File Upload Button */}
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  id={`edit-file-upload-${record.id}`}
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10 border-dashed border-2 text-muted-foreground gap-2"
                  onClick={() =>
                    document
                      .getElementById(`edit-file-upload-${record.id}`)
                      ?.click()
                  }
                  disabled={uploading}
                >
                  <Plus className="h-4 w-4" /> העלה קובץ (עד 1MB)
                </Button>
              </div>

              {/* Add Link Input */}
              <div className="flex flex-col gap-2">
                <Input
                  type="text"
                  placeholder="שם הלינק (אופציונלי)"
                  value={newAttachmentName}
                  onChange={(e) => setNewAttachmentName(e.target.value)}
                />
                <div className="flex gap-2">
                  <Input
                    type="url"
                    placeholder="הדבק לינק..."
                    value={newAttachmentUrl}
                    onChange={(e) => setNewAttachmentUrl(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddAttachment();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleAddAttachment}
                    disabled={uploading || !newAttachmentUrl}
                  >
                    {uploading ? "מוסיף..." : "הוסף לינק"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? (
                <>
                  <RotateCw className="mr-2 h-4 w-4 animate-spin" />
                  שומר...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 ml-2" />
                  שמור שינויים
                </>
              )}
            </Button>
            <Button type="button" variant="outline" onClick={handleClose}>
              ביטול
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
