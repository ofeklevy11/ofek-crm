"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Search, Users } from "lucide-react";

export type ChannelSelection = {
  sms?: boolean;
  whatsappGreen?: boolean;
  whatsappCloud?: boolean;
  email?: boolean;
};

export type BulkCustomer = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  phoneActive: boolean;
  emailActive: boolean;
  alreadySent: boolean;
  lastSentAt?: string;
};

export type QuotaInfo = {
  used: number;
  limit: number;
  remaining: number;
  resetInSeconds: number;
  tier: string;
  isUnlimited: boolean;
};

interface NurtureSendConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enabledChannels: ChannelSelection;
  onConfirm: (channels: ChannelSelection, subscriberIds?: string[]) => void;
  loading?: boolean;
  mode: "single" | "bulk";
  // Single mode
  customerName?: string;
  customerLastSentAt?: string;
  // Bulk mode
  customers?: BulkCustomer[];
  quota?: QuotaInfo | null;
  selectedOnly?: boolean;
}

export default function NurtureSendConfirmDialog({
  open,
  onOpenChange,
  enabledChannels,
  onConfirm,
  loading,
  mode,
  customerName,
  customerLastSentAt,
  customers,
  quota,
  selectedOnly,
}: NurtureSendConfirmDialogProps) {
  const [selected, setSelected] = useState<ChannelSelection>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [excludeSent, setExcludeSent] = useState(true);
  const [search, setSearch] = useState("");

  // Reset state each time dialog opens
  useEffect(() => {
    if (open) {
      setSelected({
        sms: !!enabledChannels.sms,
        whatsappGreen: !!enabledChannels.whatsappGreen,
        whatsappCloud: !!enabledChannels.whatsappCloud,
        email: !!enabledChannels.email,
      });
      setSearch("");
      setExcludeSent(true);

      if (mode === "bulk" && customers) {
        // Pre-select all eligible customers (phoneActive + not already sent)
        const ids = new Set<string>();
        for (const c of customers) {
          if ((c.phoneActive || c.emailActive) && !c.alreadySent) ids.add(c.id);
        }
        setSelectedIds(ids);
      }
    }
  }, [open, enabledChannels, mode, customers]);

  const anyChannelSelected = selected.sms || selected.whatsappGreen || selected.whatsappCloud || selected.email;
  const channelCount = (selected.sms ? 1 : 0) + (selected.whatsappGreen ? 1 : 0) + (selected.whatsappCloud ? 1 : 0) + (selected.email ? 1 : 0);

  // ─── Bulk mode computations ───
  const filteredCustomers = useMemo(() => {
    if (mode !== "bulk" || !customers) return [];
    return customers.filter((c) => {
      if (excludeSent && c.alreadySent) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.name.toLowerCase().includes(q) && !(c.phone || "").includes(q)) return false;
      }
      return true;
    });
  }, [mode, customers, excludeSent, search]);

  const selectedCount = selectedIds.size;
  const totalMessages = selectedCount * channelCount;

  const quotaColor = !quota || quota.isUnlimited
    ? "text-green-600"
    : quota.remaining > quota.limit * 0.3
      ? "text-green-600"
      : quota.remaining > 0
        ? "text-yellow-600"
        : "text-red-600";

  const exceedsQuota = quota && !quota.isUnlimited && totalMessages > quota.remaining;

  // ─── Single mode ───
  if (mode === "single") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>שליחת הודעה ל-{customerName}</DialogTitle>
            <DialogDescription>בחר את הערוצים לשליחה:</DialogDescription>
            {customerLastSentAt && (
              <p className="text-xs text-slate-500 mt-1">
                נשלח לאחרונה: {new Date(customerLastSentAt).toLocaleDateString("he-IL")}
              </p>
            )}
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            {enabledChannels.sms && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="ch-sms"
                  checked={!!selected.sms}
                  onCheckedChange={(v) => setSelected((p) => ({ ...p, sms: !!v }))}
                  disabled={loading}
                />
                <Label htmlFor="ch-sms" className="cursor-pointer text-sm">
                  שלח SMS ל-{customerName}
                </Label>
              </div>
            )}
            {enabledChannels.whatsappGreen && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="ch-wa-green"
                  checked={!!selected.whatsappGreen}
                  onCheckedChange={(v) => setSelected((p) => ({ ...p, whatsappGreen: !!v }))}
                  disabled={loading}
                />
                <Label htmlFor="ch-wa-green" className="cursor-pointer text-sm">
                  שלח WhatsApp Green API ל-{customerName}
                </Label>
              </div>
            )}
            {enabledChannels.whatsappCloud && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="ch-wa-cloud"
                  checked={!!selected.whatsappCloud}
                  onCheckedChange={(v) => setSelected((p) => ({ ...p, whatsappCloud: !!v }))}
                  disabled={loading}
                />
                <Label htmlFor="ch-wa-cloud" className="cursor-pointer text-sm">
                  שלח WhatsApp Cloud API ל-{customerName}
                </Label>
              </div>
            )}
            {enabledChannels.email && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="ch-email"
                  checked={!!selected.email}
                  onCheckedChange={(v) => setSelected((p) => ({ ...p, email: !!v }))}
                  disabled={loading}
                />
                <Label htmlFor="ch-email" className="cursor-pointer text-sm">
                  שלח אימייל ל-{customerName}
                </Label>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              ביטול
            </Button>
            <Button
              onClick={() => onConfirm(selected)}
              disabled={!anyChannelSelected || loading}
              className="gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              שלח
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Bulk mode ───
  const toggleCustomer = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const c of filteredCustomers) {
        if (c.phoneActive || c.emailActive) next.add(c.id);
      }
      return next;
    });
  };

  const deselectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const c of filteredCustomers) {
        next.delete(c.id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const ids = Array.from(selectedIds);
    onConfirm(selected, ids);
  };

  const tierLabel = quota?.tier === "super" ? "סופר" : quota?.tier === "premium" ? "פרימיום" : "בסיסי";

  const channelLabels: string[] = [];
  if (selected.sms) channelLabels.push("SMS");
  if (selected.whatsappGreen) channelLabels.push("WhatsApp");
  if (selected.whatsappCloud) channelLabels.push("WhatsApp Cloud");
  if (selected.email) channelLabels.push("אימייל");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            {selectedOnly ? "שליחה לנבחרים" : "שליחה לכל הרשימה"} — {customers?.length || 0} לקוחות
          </DialogTitle>
          <DialogDescription>בחר ערוצים ולקוחות לשליחה</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-y-auto flex-1 min-h-0 py-2">
          {/* Section 1: Channel Selection */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-slate-700">ערוצי שליחה</h4>
            <div className="flex flex-wrap gap-4">
              {enabledChannels.sms && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="bulk-ch-sms"
                    checked={!!selected.sms}
                    onCheckedChange={(v) => setSelected((p) => ({ ...p, sms: !!v }))}
                    disabled={loading}
                  />
                  <Label htmlFor="bulk-ch-sms" className="cursor-pointer text-sm">SMS</Label>
                </div>
              )}
              {enabledChannels.whatsappGreen && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="bulk-ch-wa-green"
                    checked={!!selected.whatsappGreen}
                    onCheckedChange={(v) => setSelected((p) => ({ ...p, whatsappGreen: !!v }))}
                    disabled={loading}
                  />
                  <Label htmlFor="bulk-ch-wa-green" className="cursor-pointer text-sm">WhatsApp Green</Label>
                </div>
              )}
              {enabledChannels.whatsappCloud && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="bulk-ch-wa-cloud"
                    checked={!!selected.whatsappCloud}
                    onCheckedChange={(v) => setSelected((p) => ({ ...p, whatsappCloud: !!v }))}
                    disabled={loading}
                  />
                  <Label htmlFor="bulk-ch-wa-cloud" className="cursor-pointer text-sm">WhatsApp Cloud</Label>
                </div>
              )}
              {enabledChannels.email && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="bulk-ch-email"
                    checked={!!selected.email}
                    onCheckedChange={(v) => setSelected((p) => ({ ...p, email: !!v }))}
                    disabled={loading}
                  />
                  <Label htmlFor="bulk-ch-email" className="cursor-pointer text-sm">אימייל</Label>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Message Unit Calculator */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
            <p className="text-xs text-blue-600">1 SMS = 1 יחידה &nbsp;|&nbsp; 1 WhatsApp = 1 יחידה &nbsp;|&nbsp; 1 אימייל = 1 יחידה</p>
            <p className="text-sm font-medium text-blue-800">
              {selectedCount} לקוחות × {channelCount} ערוצים = {totalMessages} הודעות בסה״כ
            </p>
            {exceedsQuota && (
              <p className="text-xs text-red-600 font-medium">
                חריגה ממכסה! נותרו רק {quota!.remaining} יחידות מכסה.
                רק {Math.floor(quota!.remaining / channelCount)} לקוחות יישלחו.
              </p>
            )}
          </div>

          {/* Section 3: Quota Status */}
          {quota && (
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {tierLabel}
              </Badge>
              {quota.isUnlimited ? (
                <span className="text-sm text-green-600">ללא מגבלה</span>
              ) : (
                <span className={`text-sm ${quotaColor}`}>
                  נותרו {quota.remaining} הודעות מתוך {quota.limit} | איפוס בעוד {quota.resetInSeconds}s
                </span>
              )}
            </div>
          )}

          {/* Section 4: Customer Selection List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="exclude-sent"
                  checked={excludeSent}
                  onCheckedChange={(v) => setExcludeSent(!!v)}
                />
                <Label htmlFor="exclude-sent" className="cursor-pointer text-sm">
                  הסתר לקוחות שכבר נשלחו
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={selectAllVisible} disabled={loading}>
                  בחר הכל
                </Button>
                <Button variant="ghost" size="sm" onClick={deselectAllVisible} disabled={loading}>
                  נקה הכל
                </Button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="חפש לפי שם..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="חפש לפי שם"
                className="pr-9"
                disabled={loading}
              />
            </div>

            <ScrollArea className="max-h-60 border rounded-md">
              <div className="p-2 space-y-1">
                {filteredCustomers.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">לא נמצאו לקוחות</p>
                ) : (
                  filteredCustomers.map((c) => {
                    const disabled = !c.phoneActive && !c.emailActive;
                    const checked = selectedIds.has(c.id);
                    return (
                      <div
                        key={c.id}
                        className={`flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-50 ${disabled ? "opacity-50" : ""}`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleCustomer(c.id)}
                          disabled={disabled || loading}
                          aria-label={c.name}
                        />
                        <span className="text-sm flex-1 truncate">{c.name}</span>
                        {c.phone && (
                          <span className="text-xs text-slate-400 font-mono" dir="ltr">
                            {c.phone.replace(/(\d{3})\d{4}(\d+)/, "$1-****-$2")}
                          </span>
                        )}
                        {c.alreadySent && !excludeSent && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            נשלח {c.lastSentAt ? new Date(c.lastSentAt).toLocaleDateString("he-IL") : ""}
                          </Badge>
                        )}
                        {!c.phoneActive && !c.emailActive && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">אין פרטי קשר</Badge>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
          <span className="text-sm text-slate-500 ml-auto">
            {selectedCount}/{filteredCustomers.filter((c) => c.phoneActive || c.emailActive).length} לקוחות נבחרו
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            ביטול
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!anyChannelSelected || selectedCount === 0 || loading}
            className="gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            שלח {totalMessages} הודעות {channelLabels.length > 0 ? `via ${channelLabels.join(", ")}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
