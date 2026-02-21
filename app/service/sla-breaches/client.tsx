"use client";

import { useState } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  Filter,
  ArrowRight,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateSlaBreachStatus } from "@/app/actions/sla-breaches";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface SlaBreachesClientProps {
  initialBreaches: any[];
}

export default function SlaBreachesClient({
  initialBreaches,
}: SlaBreachesClientProps) {
  const [breaches, setBreaches] = useState(initialBreaches);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const router = useRouter();

  // Review Modal State
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedBreach, setSelectedBreach] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const filteredBreaches = breaches.filter((breach) => {
    const matchesSearch =
      breach.ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      breach.ticket.id.toString().includes(searchQuery);

    const matchesStatus =
      statusFilter === "all" || breach.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleUpdateStatus = async (
    id: number,
    status: string,
    notes?: string
  ) => {
    // Optimistic update
    setBreaches((prev) =>
      prev.map((b) =>
        b.id === id ? { ...b, status, notes: notes || b.notes } : b
      )
    );

    try {
      await updateSlaBreachStatus(id, status, notes);
      router.refresh();
    } catch (error) {
      console.error("Failed to update status");
    }
  };

  const openReviewModal = (breach: any) => {
    setSelectedBreach(breach);
    setReviewNotes(breach.notes || "");
    setReviewModalOpen(true);
  };

  const handleSubmitReview = async () => {
    if (selectedBreach) {
      await handleUpdateStatus(selectedBreach.id, "REVIEWED", reviewNotes);
      setReviewModalOpen(false);
      setSelectedBreach(null);
    }
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
            >
              <ArrowRight className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold text-[#000000]">חריגות SLA</h1>
          </div>
          <p className="text-slate-600 text-sm">
            רשימת כל הקריאות שחרגו מזמני היעד שהוגדרו (SLA).
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 bg-white p-2 rounded-lg border shadow-sm">
        <div className="flex items-center gap-2 flex-1 relative">
          <Search className="w-4 h-4 absolute right-3 text-slate-400" />
          <Input
            placeholder="חיפוש לפי מספר קריאה או כותרת..."
            className="pr-9 bg-transparent border-0 focus-visible:ring-0 max-w-sm text-right"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 pl-2">
          <Button
            variant="ghost"
            size="sm"
            className={
              statusFilter === "all"
                ? "bg-slate-100 font-medium"
                : "text-slate-500"
            }
            onClick={() => setStatusFilter("all")}
          >
            הכל
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={
              statusFilter === "PENDING"
                ? "bg-red-50 text-red-600 font-medium"
                : "text-slate-500"
            }
            onClick={() => setStatusFilter("PENDING")}
          >
            ממתין לבדיקה
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={
              statusFilter === "REVIEWED"
                ? "bg-blue-50 text-blue-600 font-medium"
                : "text-slate-500"
            }
            onClick={() => setStatusFilter("REVIEWED")}
          >
            נבדק
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden flex-1">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-500 border-b">
            <tr>
              <th className="px-4 py-3 font-medium">קריאה</th>
              <th className="px-4 py-3 font-medium">סוג חריגה</th>
              <th className="px-4 py-3 font-medium">עדיפות</th>
              <th className="px-4 py-3 font-medium">מועד יעד מקורי</th>
              <th className="px-4 py-3 font-medium">זמן חריגה</th>
              <th className="px-4 py-3 font-medium">סטטוס חריגה</th>
              <th className="px-4 py-3 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredBreaches.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-slate-500"
                >
                  לא נמצאו חריגות SLA התואמות את החיפוש
                </td>
              </tr>
            ) : (
              filteredBreaches.map((breach) => (
                <tr
                  key={breach.id}
                  className="hover:bg-slate-50 transition-colors group"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/service?ticket=${breach.ticketId}`}
                      className="block hover:underline"
                    >
                      <div className="font-medium text-[#000000]">
                        #{breach.ticketId} {breach.ticket.title}
                      </div>
                      <div className="text-xs text-slate-500">
                        נציג: {breach.ticket.assignee?.name || "לא משויך"}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        breach.breachType === "RESPONSE"
                          ? "text-purple-600 bg-purple-50 border-purple-200"
                          : "text-indigo-600 bg-indigo-50 border-indigo-200"
                      }`}
                    >
                      {breach.breachType === "RESPONSE"
                        ? "זמן תגובה"
                        : "זמן פתרון"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        breach.priority === "CRITICAL"
                          ? "text-red-600 bg-red-50 border-red-200"
                          : breach.priority === "HIGH"
                          ? "text-orange-600 bg-orange-50 border-orange-200"
                          : "text-blue-600 bg-blue-50 border-blue-200"
                      }`}
                    >
                      {breach.priority}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {format(new Date(breach.slaDueDate), "d MMM, HH:mm", {
                      locale: he,
                    })}
                  </td>
                  <td className="px-4 py-3 text-red-600 font-medium">
                    {format(new Date(breach.breachedAt), "d MMM, HH:mm", {
                      locale: he,
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        breach.status === "PENDING"
                          ? "bg-red-100 text-red-700"
                          : breach.status === "REVIEWED"
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {breach.status === "PENDING" && (
                        <AlertTriangle className="w-3 h-3 ml-1" />
                      )}
                      {breach.status === "REVIEWED" && (
                        <CheckCircle className="w-3 h-3 ml-1" />
                      )}
                      {breach.status === "PENDING"
                        ? "נדרשת בדיקה"
                        : breach.status === "REVIEWED"
                        ? "נבדק"
                        : breach.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-slate-600"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => openReviewModal(breach)}
                        >
                          סקירה והערות
                        </DropdownMenuItem>
                        {breach.status !== "PENDING" && (
                          <DropdownMenuItem
                            onClick={() =>
                              handleUpdateStatus(breach.id, "PENDING")
                            }
                          >
                            סמן כלא מטופל
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Review Dialog */}
      <Dialog open={reviewModalOpen} onOpenChange={setReviewModalOpen}>
        <DialogContent>
          <DialogHeader className="text-right">
            <DialogTitle>סקירת חריגת SLA</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>הערות בדיקה</Label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="הוסף הערות לגבי סיבת החריגה ופעולות שננקטו..."
                rows={4}
                className="bg-slate-50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewModalOpen(false)}>
              ביטול
            </Button>
            <Button
              onClick={handleSubmitReview}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              שמור וסמן כנבדק
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
