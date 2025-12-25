"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Eye, Settings, X } from "lucide-react";

interface SchemaField {
  name: string;
  type: string;
  label: string;
}

interface SearchSettings {
  searchableFields: string[];
  displayFields: string[];
}

interface SearchSettingsModalProps {
  schema: SchemaField[];
  currentSettings: SearchSettings;
  onSave: (settings: SearchSettings) => void;
  onClose: () => void;
}

export default function SearchSettingsModal({
  schema,
  currentSettings,
  onSave,
  onClose,
}: SearchSettingsModalProps) {
  const [searchableFields, setSearchableFields] = useState<string[]>(
    currentSettings.searchableFields
  );
  const [displayFields, setDisplayFields] = useState<string[]>(
    currentSettings.displayFields
  );

  // Get fields that can be searched (exclude only files and images)
  const availableFields = schema.filter(
    (field) => field.type !== "file" && field.type !== "image"
  );

  const toggleSearchableField = (fieldName: string) => {
    setSearchableFields((prev) =>
      prev.includes(fieldName)
        ? prev.filter((f) => f !== fieldName)
        : [...prev, fieldName]
    );
  };

  const toggleDisplayField = (fieldName: string) => {
    setDisplayFields((prev) =>
      prev.includes(fieldName)
        ? prev.filter((f) => f !== fieldName)
        : [...prev, fieldName]
    );
  };

  const selectAllSearchable = () => {
    setSearchableFields(availableFields.map((f) => f.name));
  };

  const clearAllSearchable = () => {
    setSearchableFields([]);
  };

  const selectAllDisplay = () => {
    setDisplayFields(availableFields.map((f) => f.name));
  };

  const clearAllDisplay = () => {
    setDisplayFields([]);
  };

  const handleSave = () => {
    if (searchableFields.length === 0) {
      alert("יש לבחור לפחות עמודה אחת לחיפוש");
      return;
    }
    if (displayFields.length === 0) {
      alert("יש לבחור לפחות עמודה אחת להצגה");
      return;
    }
    onSave({ searchableFields, displayFields });
    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent
        className="max-w-3xl w-full max-h-[90vh] flex flex-col p-0 overflow-hidden"
        dir="rtl"
      >
        <DialogHeader className="p-6 border-b bg-muted/20">
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            הגדרות חיפוש מתקדם
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            בחר את העמודות לחיפוש והצגת תוצאות
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Searchable Fields */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Search className="h-4 w-4 text-primary" />
                  עמודות לחיפוש
                </h3>
                <div className="flex gap-2 text-xs">
                  <span
                    onClick={selectAllSearchable}
                    className="text-primary cursor-pointer hover:underline"
                  >
                    בחר הכל
                  </span>
                  <span className="text-muted-foreground">|</span>
                  <span
                    onClick={clearAllSearchable}
                    className="text-muted-foreground cursor-pointer hover:underline"
                  >
                    נקה
                  </span>
                </div>
              </div>

              <ScrollArea className="h-64 rounded-md border p-4 bg-muted/10">
                <div className="space-y-3">
                  {availableFields.map((field) => (
                    <div
                      key={field.name}
                      className="flex items-center space-x-2 space-x-reverse"
                    >
                      <Checkbox
                        id={`search-${field.name}`}
                        checked={searchableFields.includes(field.name)}
                        onCheckedChange={() =>
                          toggleSearchableField(field.name)
                        }
                      />
                      <Label
                        htmlFor={`search-${field.name}`}
                        className="flex-1 cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        <div className="flex flex-col gap-0.5">
                          <span>{field.label}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {field.type}
                          </span>
                        </div>
                      </Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="bg-primary/5 border border-primary/20 rounded-md p-3">
                <p className="text-sm text-primary">
                  <strong>{searchableFields.length}</strong> עמודות נבחרו לחיפוש
                </p>
              </div>
            </div>

            {/* Display Fields */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Eye className="h-4 w-4 text-green-600 dark:text-green-400" />
                  עמודות להצגה
                </h3>
                <div className="flex gap-2 text-xs">
                  <span
                    onClick={selectAllDisplay}
                    className="text-primary cursor-pointer hover:underline"
                  >
                    בחר הכל
                  </span>
                  <span className="text-muted-foreground">|</span>
                  <span
                    onClick={clearAllDisplay}
                    className="text-muted-foreground cursor-pointer hover:underline"
                  >
                    נקה
                  </span>
                </div>
              </div>

              <ScrollArea className="h-64 rounded-md border p-4 bg-muted/10">
                <div className="space-y-3">
                  {availableFields.map((field) => (
                    <div
                      key={field.name}
                      className="flex items-center space-x-2 space-x-reverse"
                    >
                      <Checkbox
                        id={`display-${field.name}`}
                        checked={displayFields.includes(field.name)}
                        onCheckedChange={() => toggleDisplayField(field.name)}
                        className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 dark:data-[state=checked]:bg-green-500"
                      />
                      <Label
                        htmlFor={`display-${field.name}`}
                        className="flex-1 cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        <div className="flex flex-col gap-0.5">
                          <span>{field.label}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {field.type}
                          </span>
                        </div>
                      </Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900 rounded-md p-3">
                <p className="text-sm text-green-700 dark:text-green-300">
                  <strong>{displayFields.length}</strong> עמודות נבחרו להצגה
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="md:justify-start gap-2 p-6 border-t bg-muted/20">
          <Button onClick={handleSave} className="gap-2">
            <Settings className="h-4 w-4" />
            שמור הגדרות
          </Button>
          <Button variant="outline" onClick={onClose}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
