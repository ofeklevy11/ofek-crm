"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Clock, Copy, Pencil, Trash2, Link, Check } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface MeetingTypeCardProps {
  meetingType: {
    id: number;
    name: string;
    slug: string;
    description?: string | null;
    duration: number;
    color?: string | null;
    isActive: boolean;
    shareToken: string;
    bufferBefore: number;
    bufferAfter: number;
    dailyLimit?: number | null;
    minAdvanceHours: number;
    maxAdvanceDays: number;
  };
  onEdit: (id: number) => void;
  onToggleActive: (id: number, isActive: boolean) => void;
  onDelete: (id: number) => void;
}

export default function MeetingTypeCard({
  meetingType,
  onEdit,
  onToggleActive,
  onDelete,
}: MeetingTypeCardProps) {
  const borderColor = meetingType.color || "#3b82f6";
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/p/meetings/${meetingType.shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("הקישור הועתק ללוח");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("שגיאה בהעתקת הקישור");
    }
  };

  return (
    <Card
      dir="rtl"
      className={`group relative overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 bg-[#162e22] backdrop-blur-sm border-white/20${!meetingType.isActive ? " opacity-60 saturate-50" : ""}`}
    >
      {/* Top gradient bar */}
      <div
        className="h-1 w-full transition-all duration-300"
        style={{ background: `linear-gradient(to left, ${borderColor}, ${borderColor}80)` }}
      />

      <CardContent className="p-4">
        {/* Header: Name + Active toggle */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold truncate text-white">{meetingType.name}</h3>
          <Switch
            checked={meetingType.isActive}
            onCheckedChange={(checked) =>
              onToggleActive(meetingType.id, checked)
            }
          />
        </div>

        {/* Duration + Status badges */}
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary" className="gap-1 bg-white/[0.08] text-white/80 border-white/20 rounded-full">
            <Clock className="size-3" />
            {meetingType.duration} {"דקות"}
          </Badge>
          <Badge variant="outline" className={meetingType.isActive ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-white/[0.08] text-white/60 border-white/20"}>
            {meetingType.isActive ? "פעיל" : "לא פעיל"}
          </Badge>
        </div>

        {/* Description */}
        {meetingType.description && (
          <p className="text-sm text-white/60 line-clamp-2 leading-relaxed mb-3">
            {meetingType.description}
          </p>
        )}

        {/* Buffer & limits info */}
        <div className="text-xs text-white/60 space-y-0.5 mb-3">
          {(meetingType.bufferBefore > 0 || meetingType.bufferAfter > 0) && (
            <p>
              {"חיץ: "}
              {meetingType.bufferBefore > 0 &&
                `${meetingType.bufferBefore} דק׳ לפני`}
              {meetingType.bufferBefore > 0 &&
                meetingType.bufferAfter > 0 &&
                " | "}
              {meetingType.bufferAfter > 0 &&
                `${meetingType.bufferAfter} דק׳ אחרי`}
            </p>
          )}
          {meetingType.dailyLimit != null && (
            <p>מגבלה יומית: {meetingType.dailyLimit} פגישות</p>
          )}
          <p>
            הזמנה מראש: {meetingType.minAdvanceHours} שעות עד{" "}
            {meetingType.maxAdvanceDays} ימים
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 pt-2 border-t border-white/20">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-white/80 hover:text-white hover:bg-white/[0.08]" onClick={handleCopyLink}>
                {copied ? <Check className="size-4 text-green-400" /> : <Link className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>העתק קישור שיתוף</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-white/80 hover:text-white hover:bg-white/[0.08]" onClick={() => onEdit(meetingType.id)}>
                <Pencil className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>ערוך</TooltipContent>
          </Tooltip>

          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="text-red-400 hover:text-red-300 hover:bg-white/[0.08]">
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent>מחק</TooltipContent>
            </Tooltip>
            <AlertDialogContent dir="rtl" className="bg-[#1a3a2a] border-white/20 text-white">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-white">מחיקת סוג פגישה</AlertDialogTitle>
                <AlertDialogDescription className="text-white/50">האם למחוק את &quot;{meetingType.name}&quot;? פעולה זו אינה ניתנת לביטול.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-white/[0.08] border-white/20 text-white/80 hover:bg-white/[0.15] hover:text-white">ביטול</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(meetingType.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">מחק</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
