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
import { cn } from "@/lib/utils";
import { showAlert } from "@/hooks/use-modal";

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
      showAlert("יש לבחור לפחות עמודה אחת לחיפוש");
      return;
    }
    if (displayFields.length === 0) {
      showAlert("יש לבחור לפחות עמודה אחת להצגה");
      return;
    }
    onSave({ searchableFields, displayFields });
    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-[95vw] md:max-w-[50vw] w-full max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden border-0 shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="bg-gradient-to-l from-blue-50/50 to-white dark:from-blue-950/20 dark:to-background border-b p-6 pb-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-sm">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                הגדרות חיפוש מתקדם
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                התאם אישית את אופן החיפוש והצגת התוצאות במערכת
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50 dark:bg-background/50 p-6 md:p-8">
          <div className="grid md:grid-cols-2 gap-8 h-full">
            {/* Searchable Fields Column */}
            <div className="flex flex-col h-full bg-white dark:bg-card border rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-blue-50/30 dark:bg-blue-900/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-blue-100/50 dark:bg-blue-800/30 text-blue-600 dark:text-blue-400">
                    <Search className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-right">
                      עמודות לחיפוש
                    </h3>
                    <p className="text-[10px] text-muted-foreground text-right">
                      לפי אילו שדות נחפש?
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectAllSearchable}
                    className="h-7 text-xs px-2 hover:bg-blue-100/50 hover:text-blue-700"
                  >
                    הכל
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllSearchable}
                    className="h-7 text-xs px-2 hover:bg-red-100/50 hover:text-red-700"
                  >
                    נקה
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1 p-2">
                <div className="space-y-1 p-1" dir="rtl">
                  {availableFields.map((field) => {
                    const isSelected = searchableFields.includes(field.name);
                    return (
                      <div
                        key={field.name}
                        onClick={() => toggleSearchableField(field.name)}
                        className={cn(
                          "flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer group hover:shadow-sm",
                          isSelected
                            ? "bg-blue-50/50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800"
                            : "bg-transparent border-transparent hover:bg-gray-50 dark:hover:bg-accent/50 hover:border-gray-200"
                        )}
                      >
                        <Checkbox
                          id={`search-${field.name}`}
                          checked={isSelected}
                          onCheckedChange={() =>
                            toggleSearchableField(field.name)
                          }
                          className={cn(
                            "transition-all data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600",
                            isSelected ? "shadow-sm scale-110" : ""
                          )}
                        />
                        <div className="flex-1 flex flex-col text-right items-start">
                          <span
                            className={cn(
                              "text-sm font-medium transition-colors",
                              isSelected
                                ? "text-blue-700 dark:text-blue-300"
                                : "text-gray-700 dark:text-gray-300"
                            )}
                          >
                            {field.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground uppercase opacity-70">
                            {field.type}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="p-3 border-t bg-gray-50 dark:bg-muted/20 text-center">
                <span className="text-xs font-medium text-muted-foreground">
                  {searchableFields.length} נבחרו
                </span>
              </div>
            </div>

            {/* Display Fields Column */}
            <div className="flex flex-col h-full bg-white dark:bg-card border rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-green-50/30 dark:bg-green-900/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-green-100/50 dark:bg-green-800/30 text-green-600 dark:text-green-400">
                    <Eye className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-right">
                      עמודות להצגה
                    </h3>
                    <p className="text-[10px] text-muted-foreground text-right">
                      מה נראה בתוצאות?
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectAllDisplay}
                    className="h-7 text-xs px-2 hover:bg-green-100/50 hover:text-green-700"
                  >
                    הכל
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllDisplay}
                    className="h-7 text-xs px-2 hover:bg-red-100/50 hover:text-red-700"
                  >
                    נקה
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1 p-2">
                <div className="space-y-1 p-1" dir="rtl">
                  {availableFields.map((field) => {
                    const isSelected = displayFields.includes(field.name);
                    return (
                      <div
                        key={field.name}
                        onClick={() => toggleDisplayField(field.name)}
                        className={cn(
                          "flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer group hover:shadow-sm",
                          isSelected
                            ? "bg-green-50/50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
                            : "bg-transparent border-transparent hover:bg-gray-50 dark:hover:bg-accent/50 hover:border-gray-200"
                        )}
                      >
                        <Checkbox
                          id={`display-${field.name}`}
                          checked={isSelected}
                          onCheckedChange={() => toggleDisplayField(field.name)}
                          className={cn(
                            "transition-all data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600",
                            isSelected ? "shadow-sm scale-110" : ""
                          )}
                        />
                        <div className="flex-1 flex flex-col text-right items-start">
                          <span
                            className={cn(
                              "text-sm font-medium transition-colors",
                              isSelected
                                ? "text-green-700 dark:text-green-300"
                                : "text-gray-700 dark:text-gray-300"
                            )}
                          >
                            {field.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground uppercase opacity-70">
                            {field.type}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="p-3 border-t bg-gray-50 dark:bg-muted/20 text-center">
                <span className="text-xs font-medium text-muted-foreground">
                  {displayFields.length} נבחרו
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="md:justify-start gap-3 p-6 border-t bg-white dark:bg-card">
          <Button
            onClick={handleSave}
            className="flex-1 md:flex-none gap-2 bg-blue-600 hover:bg-blue-700 text-white min-w-[140px] shadow-sm hover:shadow-md transition-all"
          >
            <Settings className="h-4 w-4" />
            שמור הגדרות
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 md:flex-none hover:bg-gray-100 min-w-[100px]"
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
