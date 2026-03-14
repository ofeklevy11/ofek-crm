"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { uploadFiles } from "@/lib/uploadthing";
import { toast } from "sonner";
import { showAlert } from "@/hooks/use-modal";
import { getUserFriendlyError } from "@/lib/errors";
import { RATE_LIMIT_MESSAGE } from "@/lib/rate-limit-utils";
import { saveFileMetadata } from "@/app/actions/storage";
import RelationPicker from "./RelationPicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Save, RotateCw, Trash2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { apiFetch } from "@/lib/api-fetch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TabsConfig, SchemaFieldWithTab } from "@/lib/types/table-tabs";
import { getFieldsForTab } from "@/lib/types/table-tabs";

interface SchemaField {
  name: string;
  type: string;
  label: string;
  options?: string[];
  relationTableId?: number;
  relationField?: string;
  lookupField?: string;
  defaultValue?: string;
  allowMultiple?: boolean;
  displayField?: string;
  min?: number | string;
  max?: number | string;
}

import { useSearchParams } from "next/navigation";

export default function AddRecordForm({
  tableId,
  schema,
  tableName,
  tabsConfig,
}: {
  tableId: number;
  schema: SchemaField[];
  tableName: string;
  tabsConfig?: TabsConfig | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  // Cache for lookup fetches: keyed by record ID to avoid re-fetching the same related record
  const lookupCache = useRef<Record<number, any>>({});
  // Shared cache for RelationPicker: keyed by tableId, avoids duplicate fetches across pickers
  const relationPickerCache = useRef<Record<number, any[]>>({});
  // Enhanced state for files and links
  const [attachmentsData, setAttachmentsData] = useState<
    Array<{
      url: string;
      filename: string;
      displayName?: string;
      isLink: boolean;
      file?: File;
    }>
  >([]);
  const [newAttachmentUrl, setNewAttachmentUrl] = useState("");
  const [newAttachmentName, setNewAttachmentName] = useState("");

  // Initialize default values when opening
  const handleOpen = () => {
    const defaults: Record<string, any> = {};
    schema.forEach((field) => {
      if (field.defaultValue) {
        defaults[field.name] = field.defaultValue;
      }
    });
    setFormData(defaults);
    setAttachmentsData([]);
    setNewAttachmentUrl("");
    setNewAttachmentName("");
    setIsOpen(true);
  };

  // Auto-open if query param exists
  useEffect(() => {
    if (searchParams.get("new") === "true" && !isOpen) {
      handleOpen();
      // Optional: Clear the param to prevent reopening on generic refresh if desired,
      // but keeping it allows bookmarking the "create page".
    }
  }, [searchParams]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > 1024 * 1024) {
      showAlert("הקובץ גדול מדי (מקסימום 1MB)");
      return;
    }
    setAttachmentsData((prev) => [
      ...prev,
      {
        url: "", // Will be filled after upload
        filename: file.name,
        isLink: false,
        file: file,
      },
    ]);
    // Reset input
    e.target.value = "";
  };

  const handleAddAttachment = () => {
    if (!newAttachmentUrl) return;

    let finalUrl = newAttachmentUrl.trim();
    // Regex to check if protocol exists
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    // Simple filename extraction
    let filename = finalUrl.replace(/^https?:\/\//i, "");
    if (filename.includes("/")) {
      filename = filename.split("/").pop() || filename;
    }
    if (!filename || filename.length === 0) filename = "link";

    setAttachmentsData((prev) => [
      ...prev,
      {
        url: finalUrl,
        filename,
        displayName: newAttachmentName.trim() || undefined,
        isLink: true,
      },
    ]);
    setNewAttachmentUrl("");
    setNewAttachmentName("");
  };

  const removeAttachment = (index: number) => {
    setAttachmentsData((prev) => prev.filter((_, i) => i !== index));
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

      // Validation: Check if the record is completely empty (ignoring attachments)
      const hasValue = Object.values(finalData).some((val) => {
        if (val === null || val === undefined) return false;
        if (typeof val === "string" && val.trim() === "") return false;
        if (Array.isArray(val) && val.length === 0) return false;
        return true;
      });

      if (!hasValue) {
        showAlert(
          "לא ניתן להוסיף רשומה ריקה. יש למלא לפחות שדה אחד (קבצים ולינקים אינם נחשבים כשדה מלא).",
        );
        setLoading(false);
        return;
      }

      // 1. Create the record first to get an ID
      // We'll send attachments (links) directly here if the API continues to support it in the same call
      // Or we create record first then add files.
      // Based on current implementation, API accepts attachments array.
      // We will filter out purely file-based attachments for now, and handle them after record creation?
      // Actually, standard attachments (links) are just {url, filename}.
      // Files need to be uploaded to storage, then saved as File (and maybe Attachment if we keep using it for links?)

      const links = attachmentsData
        .filter((a) => a.isLink)
        .map((a) => ({
          url: a.url,
          filename: a.filename,
          displayName: a.displayName || null,
        }));

      const res = await apiFetch(`/api/tables/${tableId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: finalData,
          attachments: links, // Only legacy links sent here initially
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Failed to create record");
      }

      const newRecord = await res.json();

      // 2. Handle File Uploads
      const filesToUpload = attachmentsData.filter((a) => !a.isLink && a.file);
      if (filesToUpload.length > 0) {
        // Upload sequentially or parallel? Parallel is fine.
        // Note: using client-side uploadFiles
        const validFiles = filesToUpload
          .map((a) => a.file)
          .filter((f): f is File => !!f);

        if (validFiles.length > 0) {
          const uploadRes = await uploadFiles("companyFiles", {
            files: validFiles,
          });

          // Now save metadata linked to this record
          // We need to map upload results back to the record
          if (uploadRes && uploadRes.length > 0) {
            await Promise.all(
              uploadRes.map((uploaded) =>
                saveFileMetadata(
                  {
                    name: uploaded.name,
                    url: uploaded.url,
                    key: uploaded.key,
                    size: uploaded.size,
                    type: "unknown", // We could get type from original file if needed
                  },
                  null,
                  newRecord.id,
                ),
              ),
            );
          }
        }
      }

      toast.success("הרשומה נוצרה בהצלחה");
      setFormData({});
      setIsOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <Button onClick={handleOpen} className="gap-2">
        <Plus className="h-4 w-4" /> הוסף רשומה
      </Button>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen} modal={true}>
      <DialogContent
        className="w-[95vw] h-[95vh] max-w-[95vw] sm:max-w-[95vw] rounded-xl border flex flex-col p-0 sm:p-0 overflow-hidden bg-background shadow-2xl"
        dir="rtl"
      >
        <div className="flex flex-col h-full w-full">
          <DialogHeader className="p-6 border-b bg-background/95 backdrop-blur shrink-0">
            <DialogTitle className="text-3xl font-bold text-center">
              רשומה חדשה בטבלת {tableName}
            </DialogTitle>
            <DialogDescription className="sr-only">טופס יצירת רשומה חדשה בטבלת {tableName}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto w-full">
            <form
              id="add-record-form"
              onSubmit={handleSubmit}
              className="space-y-10 py-8 px-6 sm:px-10 w-full pb-48"
            >
              {(() => {
                const allFields = schema.filter(
                  (field, index, self) =>
                    index === self.findIndex((t) => t.name === field.name),
                );

                const renderFieldInput = (field: SchemaField) => (
                    <div key={field.name} className="space-y-4">
                      <Label htmlFor={`add-field-${field.name}`} id={`label-add-field-${field.name}`} className="uppercase tracking-wide text-lg font-bold text-muted-foreground">
                        {field.label}
                      </Label>

                      {field.type === "select" ? (
                        <div className="relative">
                          <select
                            id={`add-field-${field.name}`}
                            value={formData[field.name] || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                [field.name]: e.target.value,
                              })
                            }
                            className="flex h-11 w-full items-center justify-between rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-zinc-950 px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none shadow-sm"
                          >
                            <option value="">בחר...</option>
                            {field.options?.map((opt, i) => (
                              <option key={`${opt}-${i}`} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-4 text-gray-700">
                            <svg
                              className="fill-current h-6 w-6"
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 20"
                              aria-hidden="true"
                            >
                              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                            </svg>
                          </div>
                        </div>
                      ) : field.type === "boolean" ? (
                        <div className="relative">
                          <select
                            id={`add-field-${field.name}`}
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
                            className="flex h-11 w-full items-center justify-between rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-zinc-950 px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none shadow-sm"
                          >
                            <option value="">בחר...</option>
                            <option value="true">כן</option>
                            <option value="false">לא</option>
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-4 text-gray-700">
                            <svg
                              className="fill-current h-6 w-6"
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 20"
                              aria-hidden="true"
                            >
                              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                            </svg>
                          </div>
                        </div>
                      ) : field.type === "textarea" ? (
                        <Textarea
                          id={`add-field-${field.name}`}
                          value={formData[field.name] || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              [field.name]: e.target.value,
                            })
                          }
                          className="min-h-[120px] text-base p-3 rounded-md resize-y shadow-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-zinc-950 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          placeholder={`הזן ${field.label}...`}
                        />
                      ) : field.type === "radio" ? (
                        <div className="flex flex-wrap gap-4 pt-2" role="group" aria-labelledby={`label-add-field-${field.name}`}>
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
                                className="rounded-full" // Make it look like radio
                              />
                              <span className="text-sm font-medium">{opt}</span>
                            </label>
                          ))}
                        </div>
                      ) : field.type === "multi-select" ? (
                        <div className="relative">
                          <select
                            id={`add-field-${field.name}`}
                            multiple
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
                              setFormData({
                                ...formData,
                                [field.name]: selected,
                              });
                            }}
                            className="flex min-h-[120px] w-full items-center justify-between rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-zinc-950 px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
                          >
                            {field.options?.map((opt, i) => (
                              <option
                                key={`${opt}-${i}`}
                                value={opt}
                                className="p-2"
                              >
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : field.type === "tags" ? (
                        <div className="flex flex-wrap gap-2 p-4 bg-muted/20 rounded-xl border border-input min-h-16 items-center" role="group" aria-labelledby={`label-add-field-${field.name}`}>
                          {field.options?.map((tag, i) => {
                            const rawValue = formData[field.name];
                            const currentTags = Array.isArray(rawValue)
                              ? rawValue
                              : [];
                            const isSelected = currentTags.includes(tag);
                            return (
                              <button
                                type="button"
                                key={`${tag}-${i}`}
                                aria-pressed={isSelected}
                                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-md"
                                onClick={() => {
                                  const newTags = isSelected
                                    ? currentTags.filter(
                                        (t: string) => t !== tag,
                                      )
                                    : [...currentTags, tag];
                                  setFormData({
                                    ...formData,
                                    [field.name]: newTags,
                                  });
                                }}
                              >
                                <Badge
                                  variant={isSelected ? "default" : "outline"}
                                  className="text-xs py-1 px-3 cursor-pointer select-none hover:bg-primary/90"
                                >
                                  {tag}
                                </Badge>
                              </button>
                            );
                          })}
                          {(!field.options || field.options.length === 0) && (
                            <p className="text-xs text-muted-foreground italic">
                              לא הוגדרו תגיות.
                            </p>
                          )}
                        </div>
                      ) : field.type === "relation" && field.relationTableId ? (
                        <div className="bg-white dark:bg-zinc-950 rounded-xl border border-gray-300 dark:border-gray-600 overflow-hidden" role="group" aria-labelledby={`label-add-field-${field.name}`}>
                          <RelationPicker
                            tableId={field.relationTableId!}
                            value={formData[field.name]}
                            allowMultiple={field.allowMultiple}
                            displayField={field.displayField}
                            sharedCache={relationPickerCache}
                            className="min-h-11 text-base p-3 w-full"
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
                                    let relatedRecord = lookupCache.current[val];
                                    if (!relatedRecord) {
                                      const res = await fetch(
                                        `/api/records/${val}`,
                                      );
                                      if (res.status === 429) { toast.error(RATE_LIMIT_MESSAGE); return; }
                                      if (res.ok) {
                                        relatedRecord = await res.json();
                                        lookupCache.current[val] = relatedRecord;
                                      }
                                    }
                                    if (relatedRecord) {
                                      const updates: Record<string, any> = {};

                                      lookupFields.forEach((lf) => {
                                        if (lf.lookupField) {
                                          updates[lf.name] =
                                            relatedRecord.data[lf.lookupField];
                                        }
                                      });

                                      setFormData({
                                        ...newFormData,
                                        ...updates,
                                      });
                                    }
                                  } catch (error) {
                                    console.error(
                                      "Failed to fetch lookup data",
                                      error,
                                    );
                                    toast.error(getUserFriendlyError(error));
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
                        <div className="space-y-4 pt-2 px-1" role="group" aria-labelledby={`label-add-field-${field.name}`}>
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
                            aria-label={field.label}
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
                          id={`add-field-${field.name}`}
                          type={
                            field.type === "number"
                              ? "number"
                              : field.type === "date"
                                ? "date"
                                : field.type === "phone"
                                  ? "tel"
                                  : "text"
                          }
                          dir={field.type === "phone" ? "ltr" : "rtl"}
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
                          className={`h-11 text-base px-3 rounded-md shadow-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-zinc-950 ${
                            field.type === "lookup" ||
                            field.type === "automation"
                              ? "bg-muted text-muted-foreground cursor-not-allowed border-none"
                              : ""
                          }`}
                          placeholder={
                            field.type === "lookup"
                              ? "לקריאה בלבד"
                              : `הזן ${field.label}`
                          }
                          readOnly={
                            field.type === "lookup" ||
                            field.type === "automation"
                          }
                        />
                      )}
                    </div>
                );

                // Tab-aware rendering
                if (tabsConfig?.enabled && tabsConfig.tabs.length > 0) {
                  const schemaWithTabs = allFields as SchemaFieldWithTab[];
                  return (
                    <Tabs defaultValue={tabsConfig.tabs[0]?.id} className="w-full" dir="rtl">
                      <TabsList className="w-full justify-start mb-4 flex-wrap h-auto gap-1">
                        {tabsConfig.tabs.map((tab) => (
                          <TabsTrigger key={tab.id} value={tab.id} className="text-sm">
                            {tab.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      {tabsConfig.tabs.map((tab) => {
                        const tabFields = getFieldsForTab(schemaWithTabs, tab.id);
                        return (
                          <TabsContent key={tab.id} value={tab.id}>
                            {tabFields.length > 0 ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 w-full">
                                {tabFields.map((f) => renderFieldInput(f))}
                              </div>
                            ) : (
                              <div className="py-12 text-center text-muted-foreground">
                                אין שדות בטאב זה
                              </div>
                            )}
                          </TabsContent>
                        );
                      })}
                      {/* Fields without tab assignment */}
                      {(() => {
                        const unassigned = getFieldsForTab(schemaWithTabs, null);
                        if (unassigned.length === 0) return null;
                        return (
                          <div className="mt-6 border-t pt-6">
                            <p className="text-sm font-bold text-muted-foreground mb-4">שדות ללא טאב</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 w-full">
                              {unassigned.map((f) => renderFieldInput(f))}
                            </div>
                          </div>
                        );
                      })()}
                    </Tabs>
                  );
                }

                // No tabs: standard grid
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 w-full">
                    {allFields.map((f) => renderFieldInput(f))}
                  </div>
                );
              })()}

              {/* Attachments Section */}
              <div className="mt-8 border-t pt-6">
                <Label className="uppercase tracking-wide text-lg font-bold text-muted-foreground mb-4 block">
                  קבצים ולינקים
                </Label>

                {/* Two Column Layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Files Column */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <span className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                        📄
                      </span>
                      קבצים
                    </h4>

                    {/* Uploaded Files List */}
                    <div className="space-y-2">
                      {attachmentsData
                        .filter((att) => !att.isLink)
                        .map((att, i) => {
                          const originalIndex = attachmentsData.findIndex(
                            (a) => a === att,
                          );
                          return (
                            <div
                              key={i}
                              className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
                            >
                              <div className="flex items-center gap-2 overflow-hidden">
                                <span className="truncate text-sm">
                                  {(att as any).file?.name || att.filename}
                                  {(att as any).file?.size && (
                                    <span className="text-muted-foreground mr-1">
                                      (
                                      {Math.round(
                                        (att as any).file.size / 1024,
                                      )}{" "}
                                      KB)
                                    </span>
                                  )}
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label="הסר קובץ"
                                onClick={() => removeAttachment(originalIndex)}
                                className="text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                    </div>

                    {/* File Upload Area */}
                    <label
                      htmlFor="add-record-file-upload"
                      className="border-2 border-dashed border-blue-200 dark:border-blue-700 rounded-xl p-6 flex flex-col items-center justify-center gap-3 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors cursor-pointer group focus-within:ring-2 focus-within:ring-ring"
                    >
                      <input
                        type="file"
                        id="add-record-file-upload"
                        className="sr-only"
                        onChange={handleFileSelect}
                      />
                      <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full group-hover:scale-110 transition-transform">
                        <Plus className="w-6 h-6" />
                      </div>
                      <div className="text-center">
                        <span className="text-sm font-semibold text-blue-700 dark:text-blue-300 block">
                          לחץ להעלאת קובץ
                        </span>
                        <span className="text-xs text-blue-500 dark:text-blue-400 mt-1 block">
                          עד 1MB
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* Links Column */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <span className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                        🔗
                      </span>
                      לינקים
                    </h4>

                    {/* Added Links List */}
                    <div className="space-y-2">
                      {attachmentsData
                        .filter((att) => att.isLink)
                        .map((att, i) => {
                          const originalIndex = attachmentsData.findIndex(
                            (a) => a === att,
                          );
                          return (
                            <div
                              key={i}
                              className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg"
                            >
                              <div className="flex items-center gap-2 overflow-hidden flex-1">
                                <span
                                  className="text-purple-600 dark:text-purple-400 truncate text-sm"
                                  title={att.displayName || att.filename || "attachment"}
                                >
                                  {att.displayName || att.filename || "attachment"}
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label="הסר לינק"
                                onClick={() => removeAttachment(originalIndex)}
                                className="text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                    </div>

                    {/* Add Link Input */}
                    <div className="border-2 border-dashed border-purple-200 dark:border-purple-700 rounded-xl p-4 space-y-3">
                      <div className="text-center">
                        <span className="text-sm font-semibold text-purple-700 dark:text-purple-300 block">
                          הוסף לינק חיצוני
                        </span>
                      </div>
                      <Input
                        aria-label="שם הלינק"
                        placeholder="שם הלינק (אופציונלי)"
                        value={newAttachmentName}
                        onChange={(e) => setNewAttachmentName(e.target.value)}
                        className="h-10 text-sm bg-white dark:bg-zinc-950"
                      />
                      <div className="flex gap-2 items-center">
                        <Input
                          aria-label="כתובת לינק"
                          placeholder="הדבק לינק כאן..."
                          value={newAttachmentUrl}
                          onChange={(e) => setNewAttachmentUrl(e.target.value)}
                          className="h-10 text-sm bg-white dark:bg-zinc-950 flex-1"
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
                          aria-label="הוסף לינק"
                          onClick={handleAddAttachment}
                          className="h-10 px-4 font-medium bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 dark:text-purple-300"
                          disabled={!newAttachmentUrl}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>

        <div className="p-6 md:p-10 border-t bg-background/95 backdrop-blur z-10 sticky bottom-0 shrink-0">
          <DialogFooter className="gap-4 sm:justify-start w-full">
            <Button
              type="submit"
              form="add-record-form"
              disabled={loading}
              className="gap-2 h-14 text-lg px-8 rounded-xl flex-1 md:flex-none"
            >
              {loading ? (
                <>
                  <RotateCw className="mr-2 h-5 w-5 animate-spin" />
                  יוצר...
                </>
              ) : (
                <>
                  <Save className="h-5 w-5 ml-2" />
                  צור רשומה
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              className="h-14 text-lg px-8 rounded-xl"
            >
              ביטול
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
