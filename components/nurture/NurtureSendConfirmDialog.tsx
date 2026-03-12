"use client";

import { useState, useEffect } from "react";
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
import { Loader2, Send } from "lucide-react";

export type ChannelSelection = {
  sms?: boolean;
  whatsappGreen?: boolean;
  whatsappCloud?: boolean;
};

interface NurtureSendConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  enabledChannels: ChannelSelection;
  onConfirm: (channels: ChannelSelection) => void;
  loading?: boolean;
}

export default function NurtureSendConfirmDialog({
  open,
  onOpenChange,
  customerName,
  enabledChannels,
  onConfirm,
  loading,
}: NurtureSendConfirmDialogProps) {
  const [selected, setSelected] = useState<ChannelSelection>({});

  // Reset selection each time dialog opens
  useEffect(() => {
    if (open) {
      setSelected({
        sms: !!enabledChannels.sms,
        whatsappGreen: !!enabledChannels.whatsappGreen,
        whatsappCloud: !!enabledChannels.whatsappCloud,
      });
    }
  }, [open, enabledChannels]);

  const anySelected = selected.sms || selected.whatsappGreen || selected.whatsappCloud;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>שליחת הודעה ל-{customerName}</DialogTitle>
          <DialogDescription>בחר את הערוצים לשליחה:</DialogDescription>
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
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            ביטול
          </Button>
          <Button
            onClick={() => onConfirm(selected)}
            disabled={!anySelected || loading}
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
