"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, ArrowRight, Send, Image, FileText, Film } from "lucide-react";
import { getWhatsAppTemplates } from "@/app/actions/whatsapp";
import { toast } from "sonner";

interface TemplateComponent {
  type: string;
  text?: string;
  format?: string;
  buttons?: { type: string; text: string; url?: string; phone_number?: string }[];
  example?: { body_text?: string[][]; header_text?: string[]; header_handle?: string[] };
}

interface Template {
  name: string;
  language: string;
  category: string;
  components: TemplateComponent[];
}

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: number;
  onSend: (templateName: string, languageCode: string, components?: any[]) => Promise<void>;
}

interface ParamSlot {
  key: string;
  placeholder: string;
  section: "header" | "body";
}

const CATEGORY_LABELS: Record<string, string> = {
  MARKETING: "שיווק",
  UTILITY: "שירות",
  AUTHENTICATION: "אימות",
};

const MEDIA_HEADER_FORMATS = ["IMAGE", "VIDEO", "DOCUMENT"];

export default function TemplatePicker({
  open,
  onOpenChange,
  conversationId,
  onSend,
}: TemplatePickerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Template | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [headerMediaUrl, setHeaderMediaUrl] = useState("");
  const [sending, setSending] = useState(false);

  // Load templates on open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSelected(null);
    setSearch("");
    setParams({});
    setHeaderMediaUrl("");
    setLoading(true);
    getWhatsAppTemplates(conversationId)
      .then((data) => { if (!cancelled) setTemplates(data); })
      .catch(() => { if (!cancelled) toast.error("שגיאה בטעינת תבניות"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, conversationId]);

  // Filter templates by search
  const filtered = useMemo(() => {
    if (!search) return templates;
    const q = search.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        getBodyText(t).toLowerCase().includes(q),
    );
  }, [templates, search]);

  // Extract header component info
  const headerComponent = selected?.components.find((c) => c.type === "HEADER");
  const headerFormat = headerComponent?.format; // TEXT, IMAGE, VIDEO, DOCUMENT
  const isMediaHeader = headerFormat ? MEDIA_HEADER_FORMATS.includes(headerFormat) : false;

  // Extract parameter placeholders from both HEADER and BODY
  const bodyComponent = selected?.components.find((c) => c.type === "BODY");
  const bodyText = bodyComponent?.text || "";
  const headerText = headerComponent?.format === "TEXT" ? (headerComponent.text || "") : "";

  const paramSlots = useMemo(() => {
    const slots: ParamSlot[] = [];

    // Header text params
    if (headerText) {
      const matches = headerText.match(/\{\{(\d+)\}\}/g);
      if (matches) {
        for (const m of [...new Set(matches)]) {
          const num = m.replace(/[{}]/g, "");
          slots.push({ key: `h_${num}`, placeholder: m, section: "header" });
        }
      }
    }

    // Body params
    const bodyMatches = bodyText.match(/\{\{(\d+)\}\}/g);
    if (bodyMatches) {
      for (const m of [...new Set(bodyMatches)]) {
        const num = m.replace(/[{}]/g, "");
        slots.push({ key: `b_${num}`, placeholder: m, section: "body" });
      }
    }

    return slots;
  }, [bodyText, headerText]);

  const headerSlots = paramSlots.filter((s) => s.section === "header");
  const bodySlots = paramSlots.filter((s) => s.section === "body");

  // Live preview
  const preview = useMemo(() => {
    let text = bodyText;
    for (const slot of bodySlots) {
      text = text.replaceAll(
        slot.placeholder,
        params[slot.key] || slot.placeholder,
      );
    }
    return text;
  }, [bodyText, bodySlots, params]);

  const headerPreview = useMemo(() => {
    if (!headerText) return "";
    let text = headerText;
    for (const slot of headerSlots) {
      text = text.replaceAll(
        slot.placeholder,
        params[slot.key] || slot.placeholder,
      );
    }
    return text;
  }, [headerText, headerSlots, params]);

  const allTextParamsFilled = paramSlots.every((s) => params[s.key]?.trim());
  const mediaRequired = isMediaHeader && !headerMediaUrl.trim();
  const canSend = allTextParamsFilled && !mediaRequired;

  const handleSend = async () => {
    if (!selected || sending) return;
    setSending(true);
    try {
      const metaComponents: any[] = [];

      // Header component params
      if (headerSlots.length > 0) {
        metaComponents.push({
          type: "header",
          parameters: headerSlots.map((s) => ({
            type: "text",
            text: params[s.key],
          })),
        });
      } else if (isMediaHeader && headerMediaUrl.trim()) {
        const mediaType = headerFormat!.toLowerCase() as "image" | "video" | "document";
        metaComponents.push({
          type: "header",
          parameters: [
            {
              type: mediaType,
              [mediaType]: { link: headerMediaUrl.trim() },
            },
          ],
        });
      }

      // Body component params
      if (bodySlots.length > 0) {
        metaComponents.push({
          type: "body",
          parameters: bodySlots.map((s) => ({
            type: "text",
            text: params[s.key],
          })),
        });
      }

      await onSend(
        selected.name,
        selected.language,
        metaComponents.length > 0 ? metaComponents : undefined,
      );
      onOpenChange(false);
    } catch {
      toast.error("שגיאה בשליחת הודעת תבנית");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {selected ? (
              <button
                onClick={() => { setSelected(null); setParams({}); setHeaderMediaUrl(""); }}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
              >
                <ArrowRight className="w-4 h-4" />
                חזרה לרשימה
              </button>
            ) : (
              "בחר הודעת תבנית"
            )}
          </DialogTitle>
        </DialogHeader>

        {!selected ? (
          /* ── List View ── */
          <div className="flex flex-col gap-3 min-h-0">
            {/* Search */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חפש תבנית..."
                className="w-full pr-9 pl-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {/* Templates list */}
            <div className="overflow-y-auto flex-1 min-h-0 max-h-[50vh] space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <span className="animate-spin h-6 w-6 border-2 border-green-500 border-t-transparent rounded-full" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">
                  {templates.length === 0 ? "אין תבניות מאושרות" : "לא נמצאו תבניות"}
                </p>
              ) : (
                filtered.map((t, i) => (
                  <button
                    key={`${t.name}-${t.language}-${i}`}
                    onClick={() => setSelected(t)}
                    className="w-full text-start p-3 rounded-lg border hover:border-green-500 hover:bg-green-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{t.name}</span>
                      <span className="text-[10px] text-gray-400">{t.language}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                        {CATEGORY_LABELS[t.category] || t.category}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2">
                      {getBodyText(t) || "—"}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          /* ── Parameter Fill View ── */
          <div className="flex flex-col gap-4 min-h-0 overflow-y-auto">
            {/* Template info */}
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{selected.name}</span>
              <span className="text-[10px] text-gray-400">{selected.language}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                {CATEGORY_LABELS[selected.category] || selected.category}
              </span>
            </div>

            {/* Header media input */}
            {isMediaHeader && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  {headerFormat === "IMAGE" && <Image className="w-3.5 h-3.5" />}
                  {headerFormat === "VIDEO" && <Film className="w-3.5 h-3.5" />}
                  {headerFormat === "DOCUMENT" && <FileText className="w-3.5 h-3.5" />}
                  <span>
                    {headerFormat === "IMAGE" ? "כותרת - תמונה" :
                     headerFormat === "VIDEO" ? "כותרת - וידאו" :
                     "כותרת - מסמך"}
                  </span>
                </div>
                <input
                  type="url"
                  value={headerMediaUrl}
                  onChange={(e) => setHeaderMediaUrl(e.target.value)}
                  placeholder={
                    headerFormat === "IMAGE" ? "הכנס קישור לתמונה (URL)" :
                    headerFormat === "VIDEO" ? "הכנס קישור לוידאו (URL)" :
                    "הכנס קישור למסמך (URL)"
                  }
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  dir="ltr"
                />
              </div>
            )}

            {/* Header text params */}
            {headerSlots.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">פרמטרי כותרת:</p>
                {headerSlots.map((slot) => (
                  <div key={slot.key}>
                    <label className="block text-xs text-gray-600 mb-1">
                      כותרת {slot.placeholder}
                    </label>
                    <input
                      type="text"
                      value={params[slot.key] || ""}
                      onChange={(e) =>
                        setParams((prev) => ({ ...prev, [slot.key]: e.target.value }))
                      }
                      placeholder={`ערך עבור ${slot.placeholder}`}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Body parameter inputs */}
            {bodySlots.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  {headerSlots.length > 0 || isMediaHeader ? "פרמטרי גוף ההודעה:" : "מלא את הפרמטרים:"}
                </p>
                {bodySlots.map((slot) => (
                  <div key={slot.key}>
                    <label className="block text-xs text-gray-600 mb-1">
                      פרמטר {slot.placeholder}
                    </label>
                    <input
                      type="text"
                      value={params[slot.key] || ""}
                      onChange={(e) =>
                        setParams((prev) => ({ ...prev, [slot.key]: e.target.value }))
                      }
                      placeholder={`ערך עבור ${slot.placeholder}`}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                ))}
              </div>
            ) : !isMediaHeader && headerSlots.length === 0 ? (
              <p className="text-xs text-gray-500">תבנית זו לא דורשת פרמטרים</p>
            ) : null}

            {/* Live preview */}
            <div className="bg-gray-50 rounded-lg p-3 border">
              <p className="text-[10px] text-gray-400 mb-1">תצוגה מקדימה:</p>
              {headerPreview && (
                <p className="text-sm font-semibold mb-1">{headerPreview}</p>
              )}
              {isMediaHeader && headerMediaUrl && (
                <p className="text-xs text-blue-600 mb-1 truncate" dir="ltr">{headerMediaUrl}</p>
              )}
              <p className="text-sm whitespace-pre-wrap">{preview || "—"}</p>
            </div>

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={sending || !canSend}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? (
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  שלח
                </>
              )}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getBodyText(t: Template): string {
  return t.components.find((c) => c.type === "BODY")?.text || "";
}
