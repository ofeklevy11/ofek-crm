"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import MeetingTypeCard from "./MeetingTypeCard";
import MeetingTypeModal from "./MeetingTypeModal";
import { toast } from "sonner";
import { Plus, CalendarPlus } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

interface MeetingType {
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
  customFields: any;
  order: number;
}

interface MeetingTypesListProps {
  initialTypes: MeetingType[];
}

export default function MeetingTypesList({ initialTypes }: MeetingTypesListProps) {
  const [types, setTypes] = useState<MeetingType[]>(initialTypes);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<MeetingType | null>(null);

  const refreshTypes = async () => {
    const { getMeetingTypes } = await import("@/app/actions/meetings");
    const result = await getMeetingTypes();
    if (result.success && result.data) {
      setTypes(result.data as MeetingType[]);
    }
  };

  const handleSave = async (data: Record<string, unknown>) => {
    if (editingType) {
      const { updateMeetingType } = await import("@/app/actions/meetings");
      const result = await updateMeetingType(editingType.id, data);
      if (!result.success) {
        toast.error(result.error || "שגיאה בעדכון");
        return;
      }
      toast.success("סוג פגישה עודכן");
    } else {
      const { createMeetingType } = await import("@/app/actions/meetings");
      const result = await createMeetingType(data);
      if (!result.success) {
        toast.error(result.error || "שגיאה ביצירה");
        return;
      }
      toast.success("סוג פגישה נוצר");
    }
    setModalOpen(false);
    setEditingType(null);
    refreshTypes();
  };

  const handleEdit = (id: number) => {
    const type = types.find(t => t.id === id);
    if (type) {
      setEditingType(type);
      setModalOpen(true);
    }
  };

  const handleToggleActive = async (id: number, isActive: boolean) => {
    const { updateMeetingType } = await import("@/app/actions/meetings");
    const result = await updateMeetingType(id, { isActive });
    if (result.success) {
      toast.success(isActive ? "סוג פגישה הופעל" : "סוג פגישה כובה");
      refreshTypes();
    } else {
      toast.error(result.error || "שגיאה");
    }
  };

  const handleDelete = async (id: number) => {
    const { deleteMeetingType } = await import("@/app/actions/meetings");
    const result = await deleteMeetingType(id);
    if (result.success) {
      toast.success("סוג פגישה נמחק");
      refreshTypes();
    } else {
      toast.error(result.error || "שגיאה במחיקה");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">סוגי פגישות</h2>
        <Button
          onClick={() => { setEditingType(null); setModalOpen(true); }}
          className="bg-primary hover:bg-primary/90 rounded-lg transition-transform hover:scale-105"
        >
          <Plus className="h-4 w-4 ml-1" />
          סוג חדש
        </Button>
      </div>

      {types.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarPlus className="h-6 w-6" />
            </EmptyMedia>
            <EmptyTitle>אין סוגי פגישות עדיין</EmptyTitle>
            <EmptyDescription>צרו סוג פגישה ראשון כדי להתחיל לקבל הזמנות</EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => { setEditingType(null); setModalOpen(true); }}>
            <Plus className="h-4 w-4 ml-1" />
            צור סוג פגישה ראשון
          </Button>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {types.map((type, idx) => (
            <div
              key={type.id}
              className="animate-cascade-in"
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <MeetingTypeCard
                meetingType={type}
                onEdit={handleEdit}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
              />
            </div>
          ))}
        </div>
      )}

      <MeetingTypeModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingType(null); }}
        meetingType={editingType}
        onSave={handleSave}
      />
    </div>
  );
}
