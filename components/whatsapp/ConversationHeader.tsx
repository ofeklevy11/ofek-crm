"use client";

import { useState } from "react";
import { UserPlus, X, RotateCcw, ChevronRight } from "lucide-react";
import {
  assignConversation,
  closeConversation,
  reopenConversation,
} from "@/app/actions/whatsapp";
import { toast } from "sonner";

interface ConversationHeaderProps {
  conversationId: number;
  contactName: string | null;
  contactPhone: string;
  status: string;
  assignedUser: { id: number; name: string } | null;
  companyUsers: { id: number; name: string; role: string }[];
  onBack?: () => void;
  onUpdate: () => void;
}

export default function ConversationHeader({
  conversationId,
  contactName,
  contactPhone,
  status,
  assignedUser,
  companyUsers,
  onBack,
  onUpdate,
}: ConversationHeaderProps) {
  const [showAssignMenu, setShowAssignMenu] = useState(false);

  const handleAssign = async (userId: number | null) => {
    try {
      await assignConversation({ conversationId, userId });
      toast.success(userId ? "שוייך בהצלחה" : "שיוך הוסר");
      setShowAssignMenu(false);
      onUpdate();
    } catch {
      toast.error("שגיאה בשיוך");
    }
  };

  const handleClose = async () => {
    try {
      await closeConversation(conversationId);
      toast.success("שיחה נסגרה");
      onUpdate();
    } catch {
      toast.error("שגיאה בסגירת שיחה");
    }
  };

  const handleReopen = async () => {
    try {
      await reopenConversation(conversationId);
      toast.success("שיחה נפתחה מחדש");
      onUpdate();
    } catch {
      toast.error("שגיאה בפתיחת שיחה");
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="p-1 hover:bg-gray-100 rounded md:hidden"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
          <span className="text-green-700 font-semibold">
            {(contactName || contactPhone)?.charAt(0)?.toUpperCase() || "?"}
          </span>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">
            {contactName || contactPhone}
          </h3>
          {contactName && (
            <p className="text-xs text-gray-500 font-mono">{contactPhone}</p>
          )}
          {assignedUser && (
            <p className="text-[10px] text-gray-400">
              משויך ל: {assignedUser.name}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Assign button */}
        <div className="relative">
          <button
            onClick={() => setShowAssignMenu(!showAssignMenu)}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
            title="שייך סוכן"
          >
            <UserPlus className="w-4 h-4" />
          </button>

          {showAssignMenu && (
            <div className="absolute left-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border z-50 max-h-60 overflow-y-auto">
              <button
                onClick={() => handleAssign(null)}
                className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50 text-gray-500"
              >
                ללא שיוך
              </button>
              {companyUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleAssign(u.id)}
                  className={`w-full text-right px-3 py-2 text-sm hover:bg-gray-50 ${
                    assignedUser?.id === u.id
                      ? "bg-green-50 text-green-700"
                      : ""
                  }`}
                >
                  {u.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Close / Reopen */}
        {status === "OPEN" ? (
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
            title="סגור שיחה"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleReopen}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
            title="פתח שיחה מחדש"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
