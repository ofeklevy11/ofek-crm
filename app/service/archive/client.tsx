"use client";

import { useState } from "react";
import {
  Search,
  ArrowRight,
  RotateCcw,
  Trash2,
  MoreHorizontal,
  Archive,
  User,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  restoreTicket,
  permanentlyDeleteTicket,
} from "@/app/actions/closed-tickets";
import { useRouter } from "next/navigation";
import { isRateLimitError, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit-utils";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ClosedTicketsClientProps {
  initialTickets: any[];
}

const priorityLabels: Record<string, string> = {
  CRITICAL: "קריטי",
  HIGH: "גבוה",
  MEDIUM: "בינוני",
  LOW: "נמוך",
};

const priorityColors: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700 border-red-200",
  HIGH: "bg-orange-100 text-orange-700 border-orange-200",
  MEDIUM: "bg-yellow-100 text-yellow-700 border-yellow-200",
  LOW: "bg-green-100 text-green-700 border-green-200",
};

export default function ClosedTicketsClient({
  initialTickets,
}: ClosedTicketsClientProps) {
  const [tickets, setTickets] = useState(initialTickets);
  const [searchQuery, setSearchQuery] = useState("");
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [restoreStatus, setRestoreStatus] = useState("OPEN");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const filteredTickets = tickets.filter((ticket) => {
    const matchesSearch =
      ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.client?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const handleRestore = async () => {
    if (!selectedTicket) return;
    setLoading(true);

    try {
      await restoreTicket(selectedTicket.id, restoreStatus);
      setTickets((prev) => prev.filter((t) => t.id !== selectedTicket.id));
      setRestoreDialogOpen(false);
      setSelectedTicket(null);
      router.refresh();
    } catch (error) {
      console.error("Failed to restore ticket:", error);
      if (isRateLimitError(error)) {
        toast.error(RATE_LIMIT_MESSAGE);
      } else {
        toast.error("שגיאה בשחזור הפנייה");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTicket) return;
    setLoading(true);

    try {
      await permanentlyDeleteTicket(selectedTicket.id);
      setTickets((prev) => prev.filter((t) => t.id !== selectedTicket.id));
      setDeleteDialogOpen(false);
      setSelectedTicket(null);
      router.refresh();
    } catch (error) {
      console.error("Failed to delete ticket:", error);
      if (isRateLimitError(error)) {
        toast.error(RATE_LIMIT_MESSAGE);
      } else {
        toast.error("שגיאה במחיקת הפנייה");
      }
    } finally {
      setLoading(false);
    }
  };

  const openRestoreDialog = (ticket: any) => {
    setSelectedTicket(ticket);
    setRestoreStatus("OPEN");
    setRestoreDialogOpen(true);
  };

  const openDeleteDialog = (ticket: any) => {
    setSelectedTicket(ticket);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="h-full flex flex-col space-y-6 p-8 bg-[#f4f8f8]" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/service"
              className="text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="חזרה לשירות לקוחות"
            >
              <ArrowRight className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold text-[#000000]">ארכיון פניות</h1>
          </div>
          <p className="text-slate-600 text-sm">
            פניות שטופלו ונסגרו. ניתן לשחזר או למחוק לצמיתות.
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg">
          <Archive className="w-5 h-5 text-slate-500" />
          <span className="font-medium text-slate-700">
            {tickets.length} פניות בארכיון
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4 bg-white p-2 rounded-lg border shadow-sm">
        <div className="flex items-center gap-2 flex-1 relative">
          <Search className="w-4 h-4 absolute right-3 text-slate-400" />
          <Input
            placeholder="חיפוש פניות..."
            aria-label="חיפוש פניות בארכיון"
            className="pr-9 bg-transparent border-0 focus-visible:ring-1 focus-visible:ring-slate-300 max-w-sm text-right"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Tickets List */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {filteredTickets.length === 0 ? (
          <div className="py-16 text-center text-slate-500" role="status">
            <Archive className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-medium">אין פניות בארכיון</p>
            <p className="text-sm">פניות שיסגרו יופיעו כאן</p>
          </div>
        ) : (
          <table className="w-full" aria-label="ארכיון פניות">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-600">
                  כותרת
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-600">
                  לקוח
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-600">
                  אחראי
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-600">
                  עדיפות
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-600">
                  תאריך סגירה
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-slate-600">
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredTickets.map((ticket) => (
                <tr
                  key={ticket.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#000000]">
                      {ticket.title}
                    </div>
                    <div className="text-xs text-slate-400">#{ticket.id}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {ticket.client?.name || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center">
                        <User className="w-3 h-3 text-slate-500" />
                      </div>
                      <span className="text-sm text-slate-600">
                        {ticket.assignee?.name || "לא משויך"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={priorityColors[ticket.priority] || ""}
                    >
                      {priorityLabels[ticket.priority] || ticket.priority}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-slate-500">
                      <Calendar className="w-3 h-3" />
                      {new Date(ticket.updatedAt).toLocaleDateString("he-IL")}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="פעולות נוספות">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => openRestoreDialog(ticket)}
                        >
                          <RotateCcw className="w-4 h-4 ml-2" />
                          שחזר לסטטוס אחר
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => openDeleteDialog(ticket)}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4 ml-2" />
                          מחק לצמיתות
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Restore Dialog */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>שחזור פנייה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-slate-600">
              בחר לאיזה סטטוס לשחזר את הפנייה "{selectedTicket?.title}"
            </p>
            <Select value={restoreStatus} onValueChange={setRestoreStatus}>
              <SelectTrigger aria-label="סטטוס שחזור" className="text-right">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPEN">פתוח</SelectItem>
                <SelectItem value="IN_PROGRESS">בטיפול</SelectItem>
                <SelectItem value="WAITING">ממתין</SelectItem>
                <SelectItem value="RESOLVED">טופל</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button
              onClick={handleRestore}
              disabled={loading}
              className="bg-[#4f95ff] hover:bg-blue-600 text-white"
            >
              שחזר פנייה
            </Button>
            <Button
              variant="outline"
              onClick={() => setRestoreDialogOpen(false)}
            >
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              מחיקה לצמיתות
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-600">
              האם אתה בטוח שברצונך למחוק את הפנייה "{selectedTicket?.title}"
              לצמיתות?
            </p>
            <p className="text-sm text-red-500 mt-2">
              פעולה זו אינה ניתנת לביטול!
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              onClick={handleDelete}
              disabled={loading}
              variant="destructive"
            >
              מחק לצמיתות
            </Button>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
