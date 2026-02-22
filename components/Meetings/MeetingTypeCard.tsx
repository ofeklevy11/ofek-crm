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
      className={`group relative overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-0.5${!meetingType.isActive ? " opacity-60 saturate-50" : ""}`}
    >
      {/* Top gradient bar */}
      <div
        className="h-1 w-full transition-all duration-300"
        style={{ background: `linear-gradient(to left, ${borderColor}, ${borderColor}80)` }}
      />

      <CardContent className="p-4">
        {/* Header: Name + Active toggle */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold truncate">{meetingType.name}</h3>
          <Switch
            checked={meetingType.isActive}
            onCheckedChange={(checked) =>
              onToggleActive(meetingType.id, checked)
            }
          />
        </div>

        {/* Duration + Status badges */}
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary" className="gap-1 bg-gray-100 text-gray-600 rounded-full">
            <Clock className="size-3" />
            {meetingType.duration} {"דקות"}
          </Badge>
          <Badge variant="outline" className={meetingType.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}>
            {meetingType.isActive ? "פעיל" : "לא פעיל"}
          </Badge>
        </div>

        {/* Description */}
        {meetingType.description && (
          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-3">
            {meetingType.description}
          </p>
        )}

        {/* Buffer & limits info */}
        <div className="text-[11px] text-gray-400 space-y-0.5 mb-3">
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
        <div className="flex items-center gap-1 pt-2 border-t">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={handleCopyLink}>
                {copied ? <Check className="size-4 text-green-500" /> : <Link className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>העתק קישור שיתוף</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={() => onEdit(meetingType.id)}>
                <Pencil className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>ערוך</TooltipContent>
          </Tooltip>

          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive">
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent>מחק</TooltipContent>
            </Tooltip>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>מחיקת סוג פגישה</AlertDialogTitle>
                <AlertDialogDescription>האם למחוק את &quot;{meetingType.name}&quot;? פעולה זו אינה ניתנת לביטול.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ביטול</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(meetingType.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">מחק</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
