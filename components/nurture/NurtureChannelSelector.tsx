"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { MessageSquare, Smartphone, Mail, CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";

interface ChannelState {
  sms: boolean;
  whatsappGreen: boolean;
  whatsappCloud: boolean;
}

interface NurtureChannelSelectorProps {
  channels: ChannelState;
  onChange: (channels: ChannelState) => void;
  availableChannels: ChannelState;
}

const channelDefs = [
  {
    key: "sms" as const,
    label: "SMS",
    icon: MessageSquare,
    activeColor: "border-pink-500 bg-pink-50/50",
    iconActiveColor: "bg-pink-100 text-pink-600",
    checkColor: "text-pink-600",
  },
  {
    key: "whatsappGreen" as const,
    label: "WhatsApp (Green API)",
    icon: Smartphone,
    activeColor: "border-green-500 bg-green-50/50",
    iconActiveColor: "bg-green-100 text-green-600",
    checkColor: "text-green-600",
  },
  {
    key: "whatsappCloud" as const,
    label: "WhatsApp (WhatsApp API)",
    icon: Smartphone,
    activeColor: "border-blue-500 bg-blue-50/50",
    iconActiveColor: "bg-blue-100 text-blue-600",
    checkColor: "text-blue-600",
  },
];

export default function NurtureChannelSelector({
  channels,
  onChange,
  availableChannels,
}: NurtureChannelSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {channelDefs.map((ch) => {
        const isActive = channels[ch.key];
        const isAvailable = availableChannels[ch.key];
        return (
          <div
            key={ch.key}
            className={cn(
              "cursor-pointer border rounded-xl p-4 flex flex-col items-center gap-3 transition-all relative",
              isActive ? ch.activeColor : "border-slate-200 hover:border-slate-300",
              !isAvailable && "opacity-70"
            )}
            onClick={() => {
              if (!isAvailable) return;
              onChange({ ...channels, [ch.key]: !isActive });
            }}
          >
            <div
              className={cn(
                "p-2 rounded-full",
                isActive ? ch.iconActiveColor : "bg-slate-100 text-slate-400"
              )}
            >
              <ch.icon className="w-5 h-5" />
            </div>
            <span className="font-medium text-sm">{ch.label}</span>
            {isActive && <CheckCircle2 className={cn("w-4 h-4", ch.checkColor)} />}
            {!isAvailable && (
              <Link
                href="/profile"
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] text-red-500 flex items-center gap-1 hover:underline"
              >
                <AlertCircle className="w-3 h-3" />
                לא מחובר
              </Link>
            )}
          </div>
        );
      })}

      {/* Email - greyed out */}
      <div className="border rounded-xl p-4 flex flex-col items-center gap-3 border-slate-200 opacity-50 cursor-not-allowed select-none">
        <div className="p-2 rounded-full bg-slate-100 text-slate-400">
          <Mail className="w-5 h-5" />
        </div>
        <span className="font-medium text-sm">אימייל</span>
        <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded-full text-slate-500">בקרוב</span>
      </div>
    </div>
  );
}
