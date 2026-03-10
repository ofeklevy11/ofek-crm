"use client";

import React from "react";
import { MessageSquare, Smartphone } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ChannelState {
  sms: boolean;
  whatsappGreen: boolean;
  whatsappCloud: boolean;
}

interface NurtureMessageEditorProps {
  channels: ChannelState;
  smsBody: string;
  whatsappGreenBody: string;
  whatsappCloudTemplateName: string;
  whatsappCloudLanguageCode: string;
  onSmsBodyChange: (v: string) => void;
  onWhatsappGreenBodyChange: (v: string) => void;
  onWhatsappCloudTemplateNameChange: (v: string) => void;
  onWhatsappCloudLanguageCodeChange: (v: string) => void;
  placeholders?: string[];
}

export default function NurtureMessageEditor({
  channels,
  smsBody,
  whatsappGreenBody,
  whatsappCloudTemplateName,
  whatsappCloudLanguageCode,
  onSmsBodyChange,
  onWhatsappGreenBodyChange,
  onWhatsappCloudTemplateNameChange,
  onWhatsappCloudLanguageCodeChange,
  placeholders = ["{first_name}"],
}: NurtureMessageEditorProps) {
  const PlaceholderTags = () => (
    <div className="flex gap-2 text-xs text-slate-500 flex-wrap">
      {placeholders.map((p) => (
        <span
          key={p}
          className="bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer hover:bg-slate-200"
        >
          {p}
        </span>
      ))}
    </div>
  );

  const hasAny = channels.sms || channels.whatsappGreen || channels.whatsappCloud;
  if (!hasAny) return null;

  return (
    <div className="space-y-6">
      {channels.sms && (
        <div className="space-y-3">
          <h3 className="font-medium flex items-center gap-2 text-pink-700">
            <MessageSquare className="w-4 h-4" />
            תוכן SMS
          </h3>
          <Textarea
            rows={3}
            value={smsBody}
            onChange={(e) => onSmsBodyChange(e.target.value)}
            placeholder="הזן את תוכן הודעת ה-SMS..."
          />
          <div className="flex items-center justify-between">
            <PlaceholderTags />
            <span className="text-xs text-slate-400">{smsBody.length} תווים</span>
          </div>
        </div>
      )}

      {channels.whatsappGreen && (
        <div className="space-y-3">
          <h3 className="font-medium flex items-center gap-2 text-green-700">
            <Smartphone className="w-4 h-4" />
            תוכן WhatsApp (Green API)
          </h3>
          <Textarea
            rows={4}
            value={whatsappGreenBody}
            onChange={(e) => onWhatsappGreenBodyChange(e.target.value)}
            placeholder="הזן את תוכן הודעת WhatsApp..."
          />
          <PlaceholderTags />
        </div>
      )}

      {channels.whatsappCloud && (
        <div className="space-y-3">
          <h3 className="font-medium flex items-center gap-2 text-blue-700">
            <Smartphone className="w-4 h-4" />
            WhatsApp (WhatsApp API) - תבנית
          </h3>
          <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 space-y-4">
            <p className="text-xs text-blue-700">
              Meta דורשת שימוש בתבניות מאושרות מראש להודעות יזומות מחוץ לחלון 24 השעות.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>שם התבנית (Template Name)</Label>
                <Input
                  value={whatsappCloudTemplateName}
                  onChange={(e) => onWhatsappCloudTemplateNameChange(e.target.value)}
                  placeholder="e.g. birthday_greeting"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>שפה (Language Code)</Label>
                <Select
                  value={whatsappCloudLanguageCode}
                  onValueChange={onWhatsappCloudLanguageCodeChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="he">עברית (he)</SelectItem>
                    <SelectItem value="en">English (en)</SelectItem>
                    <SelectItem value="ar">عربي (ar)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
