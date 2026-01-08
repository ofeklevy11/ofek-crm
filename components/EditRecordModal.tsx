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
} from "lucide-react";
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
  const [open, setOpen] = useState(true);

  // Auto-focus logic
  useEffect(() => {
    if (initialFocusField) {
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
        // Format for datetime-local: YYYY-MM-DDTHH:mm
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
      <DialogContent className="max-w-xl w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            עריכת רשומה{" "}
            <span className="text-muted-foreground font-mono">
              #{record.id}
            </span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-4">
            {schema
              .filter(
                (field, index, self) =>
                  index === self.findIndex((t) => t.name === field.name)
              )
              .map((field) => (
                <div key={field.name}>
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
                            (option) => option.value
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
                    <Input
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

            {/* Created At Field */}
            <div>
              <Label className="text-sm font-semibold mb-1.5 block">
                נוצר בתאריך
              </Label>
              <Input
                type="datetime-local"
                value={createdAt}
                onChange={(e) => setCreatedAt(e.target.value)}
              />
            </div>
          </div>

          <div className="border-t border-border pt-4 mt-4 space-y-3">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Paperclip className="h-4 w-4" /> קבצים מצורפים
            </h4>
            <div className="space-y-2">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between bg-muted/30 p-2 rounded-md border border-border text-sm"
                >
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline truncate max-w-[200px] flex items-center gap-1"
                  >
                    {att.filename} <ExternalLink className="h-3 w-3" />
                  </a>
                  <span className="text-muted-foreground text-xs">
                    {new Date(att.uploadedAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
              {attachments.length === 0 && (
                <p className="text-muted-foreground text-sm italic">
                  אין קבצים מצורפים
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="הדבק קישור לקובץ..."
                value={newAttachmentUrl}
                onChange={(e) => setNewAttachmentUrl(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleAddAttachment}
                disabled={uploading || !newAttachmentUrl}
              >
                {uploading ? "מוסיף..." : "הוסף"}
              </Button>
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
