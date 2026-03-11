"use client";

import React, { useState } from "react";
import { MessageSquare, Smartphone, Plus, Trash2, Check, Pencil } from "lucide-react";
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

export interface NurtureMessage {
  id: string;
  name: string;
  isActive: boolean;
  smsBody: string;
  whatsappGreenBody: string;
  whatsappCloudTemplateName: string;
  whatsappCloudLanguageCode: string;
}

/** Migrate old flat-field config to messages array */
export function migrateConfigMessages(config: any): NurtureMessage[] {
  if (Array.isArray(config.messages) && config.messages.length > 0) {
    return config.messages;
  }
  return [{
    id: "msg_default",
    name: "הודעה ראשית",
    isActive: true,
    smsBody: config.smsBody || "",
    whatsappGreenBody: config.whatsappGreenBody || "",
    whatsappCloudTemplateName: config.whatsappCloudTemplateName || "",
    whatsappCloudLanguageCode: config.whatsappCloudLanguageCode || "he",
  }];
}

/** Get the active message from the array */
export function getActiveMessage(messages: NurtureMessage[]): NurtureMessage | null {
  return messages.find((m) => m.isActive) || null;
}

interface NurtureMessageEditorProps {
  channels: ChannelState;
  messages: NurtureMessage[];
  onMessagesChange: (messages: NurtureMessage[]) => void;
  placeholders?: string[];
}

export default function NurtureMessageEditor({
  channels,
  messages,
  onMessagesChange,
  placeholders = ["{first_name}"],
}: NurtureMessageEditorProps) {
  const [selectedIdx, setSelectedIdx] = useState(
    () => Math.max(0, messages.findIndex((m) => m.isActive))
  );
  const [renamingIdx, setRenamingIdx] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const selected = messages[selectedIdx] || messages[0];
  if (!selected) return null;

  const hasAny = channels.sms || channels.whatsappGreen || channels.whatsappCloud;
  if (!hasAny) return null;

  const updateSelected = (patch: Partial<NurtureMessage>) => {
    const updated = messages.map((m, i) => i === selectedIdx ? { ...m, ...patch } : m);
    onMessagesChange(updated);
  };

  const handleAdd = () => {
    const newMsg: NurtureMessage = {
      id: `msg_${Date.now()}`,
      name: `הודעה ${messages.length + 1}`,
      isActive: false,
      smsBody: "",
      whatsappGreenBody: "",
      whatsappCloudTemplateName: "",
      whatsappCloudLanguageCode: "he",
    };
    onMessagesChange([...messages, newMsg]);
    setSelectedIdx(messages.length);
  };

  const handleActivate = (idx: number) => {
    const updated = messages.map((m, i) => ({ ...m, isActive: i === idx }));
    onMessagesChange(updated);
  };

  const handleDelete = (idx: number) => {
    if (messages.length <= 1) return;
    const wasActive = messages[idx].isActive;
    const updated = messages.filter((_, i) => i !== idx);
    if (wasActive && updated.length > 0) updated[0].isActive = true;
    onMessagesChange(updated);
    setSelectedIdx((prev) => Math.min(prev, updated.length - 1));
  };

  const startRename = (idx: number) => {
    setRenamingIdx(idx);
    setRenameValue(messages[idx].name);
  };

  const commitRename = () => {
    if (renamingIdx === null) return;
    const updated = messages.map((m, i) =>
      i === renamingIdx ? { ...m, name: renameValue.trim() || m.name } : m
    );
    onMessagesChange(updated);
    setRenamingIdx(null);
  };

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

  return (
    <div className="space-y-4">
      {/* Message tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {messages.map((m, i) => (
          <div key={m.id} className="group relative flex items-center">
            {renamingIdx === i ? (
              <div className="flex items-center gap-1">
                <input
                  className="text-xs border border-indigo-300 rounded px-2 py-1 w-28 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => { if (e.key === "Enter") commitRename(); }}
                  autoFocus
                />
              </div>
            ) : (
              <button
                onClick={() => setSelectedIdx(i)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5 ${
                  selectedIdx === i
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700 font-medium"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {m.isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                )}
                {m.name}
              </button>
            )}
            {/* Action buttons on hover */}
            {selectedIdx === i && renamingIdx !== i && (
              <div className="flex items-center gap-0.5 mr-1">
                {!m.isActive && (
                  <button
                    onClick={() => handleActivate(i)}
                    className="p-1 rounded text-green-600 hover:bg-green-50 transition-colors"
                    title="הפעל תבנית זו"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => startRename(i)}
                  className="p-1 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                  title="שנה שם"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {messages.length > 1 && (
                  <button
                    onClick={() => handleDelete(i)}
                    className="p-1 rounded text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="מחק תבנית"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        <button
          onClick={handleAdd}
          className="text-xs px-2.5 py-1.5 rounded-full border border-dashed border-slate-300 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          הוסף
        </button>
      </div>

      {/* Active indicator */}
      {selected.isActive ? (
        <div className="text-xs text-green-600 bg-green-50 border border-green-100 rounded px-3 py-1.5 inline-block">
          תבנית פעילה — זו ההודעה שתישלח ללקוחות
        </div>
      ) : (
        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded px-3 py-1.5 flex items-center gap-2">
          <span>תבנית לא פעילה</span>
          <button
            onClick={() => handleActivate(selectedIdx)}
            className="underline hover:no-underline"
          >
            הפעל עכשיו
          </button>
        </div>
      )}

      {/* Channel editors for selected message */}
      <div className="space-y-6">
        {channels.sms && (
          <div className="space-y-3">
            <h3 className="font-medium flex items-center gap-2 text-pink-700">
              <MessageSquare className="w-4 h-4" />
              תוכן SMS
            </h3>
            <Textarea
              rows={3}
              value={selected.smsBody}
              onChange={(e) => updateSelected({ smsBody: e.target.value })}
              placeholder="הזן את תוכן הודעת ה-SMS..."
            />
            <div className="flex items-center justify-between">
              <PlaceholderTags />
              <span className="text-xs text-slate-400">{selected.smsBody.length} תווים</span>
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
              value={selected.whatsappGreenBody}
              onChange={(e) => updateSelected({ whatsappGreenBody: e.target.value })}
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
                    value={selected.whatsappCloudTemplateName}
                    onChange={(e) => updateSelected({ whatsappCloudTemplateName: e.target.value })}
                    placeholder="e.g. birthday_greeting"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>שפה (Language Code)</Label>
                  <Select
                    value={selected.whatsappCloudLanguageCode}
                    onValueChange={(v) => updateSelected({ whatsappCloudLanguageCode: v })}
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
    </div>
  );
}
