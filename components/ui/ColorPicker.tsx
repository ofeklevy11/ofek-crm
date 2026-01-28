"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Input } from "./input";

// Curated preset colors - beautiful, modern colors
export const PRESET_COLORS = [
  { name: "תכלת", value: "#60A5FA", textColor: "#1E3A5F" }, // Light blue
  { name: "ירוק בהיר", value: "#4ADE80", textColor: "#14532D" }, // Light green
  { name: "ורוד", value: "#F472B6", textColor: "#831843" }, // Pink/rose
  { name: "צהוב", value: "#FACC15", textColor: "#713F12" }, // Yellow
  { name: "כתום", value: "#FB923C", textColor: "#7C2D12" }, // Orange
  { name: "אפור", value: "#9CA3AF", textColor: "#1F2937" }, // Gray
  { name: "שחור", value: "#374151", textColor: "#FFFFFF" }, // Dark gray/black
  { name: "סגול", value: "#A78BFA", textColor: "#4C1D95" }, // Purple
  { name: "טורקיז", value: "#2DD4BF", textColor: "#134E4A" }, // Teal
  { name: "אדום", value: "#F87171", textColor: "#7F1D1D" }, // Red
] as const;

interface ColorPickerProps {
  value?: string;
  onChange: (color: string) => void;
  label?: string;
}

export function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customColor, setCustomColor] = useState("");

  const selectedPreset = PRESET_COLORS.find((c) => c.value === value);
  const displayColor = value || "#9CA3AF";

  const handleCustomColorApply = () => {
    if (customColor && /^#[0-9A-Fa-f]{6}$/.test(customColor)) {
      onChange(customColor);
      setIsOpen(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full border border-input",
            "hover:border-primary/50 transition-colors cursor-pointer",
            "bg-background text-sm",
          )}
        >
          <span
            className="w-4 h-4 rounded-full border border-black/10"
            style={{ backgroundColor: displayColor }}
          />
          <span className="text-muted-foreground text-xs">
            {selectedPreset?.name || (value ? "מותאם" : "בחר צבע")}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-3" align="start">
        <div className="space-y-3">
          {label && <div className="text-sm font-medium mb-2">{label}</div>}

          {/* Preset Colors Grid */}
          <div className="grid grid-cols-5 gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                onClick={() => {
                  onChange(color.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-10 h-10 rounded-lg border-2 transition-all flex items-center justify-center",
                  "hover:scale-110 hover:shadow-md",
                  value === color.value
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-transparent",
                )}
                style={{ backgroundColor: color.value }}
                title={color.name}
              >
                {value === color.value && (
                  <Check
                    className="w-4 h-4"
                    style={{ color: color.textColor }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Custom Color */}
          <div className="pt-2 border-t border-border">
            <div className="text-xs text-muted-foreground mb-2">
              צבע מותאם אישית:
            </div>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="#FF5733"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                className="h-8 text-xs font-mono flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCustomColorApply();
                  }
                }}
              />
              <input
                type="color"
                value={customColor || "#9CA3AF"}
                onChange={(e) => setCustomColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-input"
              />
              <Button
                type="button"
                size="sm"
                onClick={handleCustomColorApply}
                disabled={
                  !customColor || !/^#[0-9A-Fa-f]{6}$/.test(customColor)
                }
                className="h-8 px-2"
              >
                <Check className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Clear Button */}
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange("");
                setIsOpen(false);
              }}
              className="w-full h-7 text-xs text-muted-foreground"
            >
              <X className="w-3 h-3 mr-1" />
              הסר צבע
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Helper to get text color for a background
export function getTextColorForBackground(bgColor: string): string {
  const preset = PRESET_COLORS.find((c) => c.value === bgColor);
  if (preset) return preset.textColor;

  // Calculate luminance for custom colors
  if (!bgColor || !bgColor.startsWith("#")) return "#000000";

  const hex = bgColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? "#1F2937" : "#FFFFFF";
}
