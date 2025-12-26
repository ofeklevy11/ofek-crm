"use client";

import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Save, RotateCw } from "lucide-react";

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
}

export default function AddRecordForm({
  tableId,
  schema,
  tableName,
}: {
  tableId: number;
  schema: SchemaField[];
  tableName: string;
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
        }),
      });

      if (!res.ok) throw new Error("Failed to create record");

      setFormData({});
      setIsOpen(false);
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("שגיאה ביצירת הרשומה");
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
          </DialogHeader>

          <div className="flex-1 overflow-y-auto w-full">
            <form
              id="add-record-form"
              onSubmit={handleSubmit}
              className="space-y-10 py-8 px-6 sm:px-10 w-full"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 w-full">
                {schema
                  .filter(
                    (field, index, self) =>
                      index === self.findIndex((t) => t.name === field.name)
                  )
                  .map((field) => (
                    <div key={field.name} className="space-y-4">
                      <Label className="uppercase tracking-wide text-lg font-bold text-muted-foreground">
                        {field.label}
                      </Label>

                      {field.type === "select" ? (
                        <div className="relative">
                          <select
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
                            >
                              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                            </svg>
                          </div>
                        </div>
                      ) : field.type === "boolean" ? (
                        <div className="relative">
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
                            >
                              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                            </svg>
                          </div>
                        </div>
                      ) : field.type === "textarea" ? (
                        <Textarea
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
                        <div className="flex flex-wrap gap-4 pt-2">
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
                        <div className="flex flex-wrap gap-2 p-4 bg-muted/20 rounded-xl border border-input min-h-16 items-center">
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
                                className="text-xs py-1 px-3 cursor-pointer select-none hover:bg-primary/90"
                                onClick={() => {
                                  const newTags = isSelected
                                    ? currentTags.filter(
                                        (t: string) => t !== tag
                                      )
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
                              לא הוגדרו תגיות.
                            </p>
                          )}
                        </div>
                      ) : field.type === "relation" && field.relationTableId ? (
                        <div className="bg-white dark:bg-zinc-950 rounded-xl border border-gray-300 dark:border-gray-600 overflow-hidden">
                          <RelationPicker
                            tableId={field.relationTableId!}
                            value={formData[field.name]}
                            allowMultiple={field.allowMultiple}
                            displayField={field.displayField}
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
                                  f.relationField === field.name
                              );

                              if (lookupFields.length > 0) {
                                if (val && !Array.isArray(val)) {
                                  try {
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

                                      setFormData({
                                        ...newFormData,
                                        ...updates,
                                      });
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
                  ))}
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
