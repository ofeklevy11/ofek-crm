"use client";

import { useState } from "react";
import { format, isFuture } from "date-fns";
import { he } from "date-fns/locale";
import {
  ArrowDown,
  ArrowUp,
  Trash2,
  Filter,
  Table as TableIcon,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { deleteFinanceRecord } from "@/app/actions/finance-records";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface FinanceRecord {
  id: number;
  title: string;
  amount: number;
  type: string;
  category: string | null;
  date: Date;
  status: string;
  client?: { name: string } | null;
  syncRule?: { sourceType: string; name: string } | null;
  originId?: string | null;
}

interface FinanceLedgerProps {
  initialRecords: FinanceRecord[];
}

export default function FinanceLedger({ initialRecords }: FinanceLedgerProps) {
  const [records] = useState(initialRecords);
  const router = useRouter();

  const { toast } = useToast();
  const [filter, setFilter] = useState<"ALL" | "INCOME" | "EXPENSE">("ALL");
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<FinanceRecord | null>(null);

  const filteredRecords = initialRecords.filter(
    (r) => filter === "ALL" || r.type === filter
  );

  const confirmDelete = async () => {
    if (!deleteRecord) return;

    setIsDeleting(deleteRecord.id);
    try {
      await deleteFinanceRecord(deleteRecord.id);
      toast({ title: "נמחק בהצלחה", description: "התנועה הוסרה מהמערכת" });
      router.refresh();
    } catch (e) {
      toast({
        title: "שגיאה",
        description: "לא ניתן למחוק כעת",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(null);
      setDeleteRecord(null);
    }
  };

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
      dir="rtl"
    >
      {/* Header & Filters */}
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          תנועות אחרונות
          <span className="text-xs font-normal text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200">
            {filteredRecords.length}
          </span>
        </h3>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setFilter("ALL")}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-md transition-all",
              filter === "ALL"
                ? "bg-white shadow-sm text-gray-900"
                : "text-gray-500 hover:text-gray-900"
            )}
          >
            הכל
          </button>
          <button
            onClick={() => setFilter("INCOME")}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-md transition-all",
              filter === "INCOME"
                ? "bg-white shadow-sm text-[#4f95ff]"
                : "text-gray-500 hover:text-[#4f95ff]"
            )}
          >
            הכנסות
          </button>
          <button
            onClick={() => setFilter("EXPENSE")}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-md transition-all",
              filter === "EXPENSE"
                ? "bg-white shadow-sm text-[#a24ec1]"
                : "text-gray-500 hover:text-[#a24ec1]"
            )}
          >
            הוצאות
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px] text-right">תאריך</TableHead>
              <TableHead className="text-right">תיאור</TableHead>
              <TableHead className="text-right">קטגוריה</TableHead>
              <TableHead className="text-right">לקוח משויך</TableHead>
              <TableHead className="text-right">מקור</TableHead>
              <TableHead className="text-left">סכום</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRecords.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-gray-500"
                >
                  לא נמצאו תנועות לתצוגה
                </TableCell>
              </TableRow>
            ) : (
              filteredRecords.map((record) => (
                <TableRow key={record.id} className="group hover:bg-gray-50/50">
                  <TableCell className="font-medium text-gray-600 text-right">
                    {format(new Date(record.date), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell className="font-medium text-gray-900 text-right">
                    <div className="flex items-center gap-2">
                      {record.title}
                      {isFuture(new Date(record.date)) && (
                        <Badge
                          variant="secondary"
                          className="bg-purple-100 text-purple-700 hover:bg-purple-100 text-[10px] px-1.5 h-5 gap-1 shadow-none border-0 whitespace-nowrap"
                        >
                          <Calendar className="w-3 h-3" />
                          עתידי
                        </Badge>
                      )}
                      {record.syncRule?.sourceType === "TABLE" && (
                        <div
                          title={`סונכרן אוטומטית מהטבלה: ${record.syncRule.name}`}
                          className="text-[#4f95ff]"
                        >
                          <TableIcon className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                    <div className="md:hidden text-xs text-gray-400">
                      {record.category}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {record.category && (
                      <Badge
                        variant="outline"
                        className="text-xs font-normal text-gray-600 bg-gray-50"
                      >
                        {record.category}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm text-right">
                    {record.client?.name ||
                      (record.syncRule?.sourceType === "TRANSACTIONS" &&
                      record.title.includes("ריטיינר")
                        ? record.title.split(": ")[1]?.split(" (")[0] || "-"
                        : "-")}
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm text-right">
                    {record.syncRule?.name ? (
                      <Badge
                        variant="outline"
                        className="text-xs font-normal bg-[#4f95ff]/10 text-[#4f95ff] border-[#4f95ff]/20"
                      >
                        {record.syncRule.name}
                      </Badge>
                    ) : record.originId?.startsWith("fixed_") ? (
                      <Badge
                        variant="outline"
                        className="text-xs font-normal bg-gray-100 text-gray-600 border-gray-200"
                      >
                        הוצאה קבועה
                      </Badge>
                    ) : (
                      <span className="text-gray-400">ידני</span>
                    )}
                  </TableCell>
                  <TableCell className="text-left">
                    <span
                      className={cn(
                        "font-bold flex items-center justify-end gap-1",
                        record.type === "INCOME"
                          ? "text-[#4f95ff]"
                          : "text-[#a24ec1]"
                      )}
                    >
                      {record.type === "INCOME" ? (
                        <ArrowUp className="w-3 h-3" />
                      ) : (
                        <ArrowDown className="w-3 h-3" />
                      )}
                      ₪{record.amount.toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isDeleting === record.id}
                      onClick={() => setDeleteRecord(record)}
                      className="h-8 w-8 text-gray-400 hover:text-[#a24ec1] opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={!!deleteRecord}
        onOpenChange={(open) => !open && setDeleteRecord(null)}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              {deleteRecord?.syncRule?.sourceType === "TABLE" ? (
                <span className="text-[#a24ec1] flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  אזהרה חמורה: מחיקת תנועה מסונכרנת
                </span>
              ) : (
                "מחיקת תנועה"
              )}
            </DialogTitle>
            <DialogDescription className="pt-2 space-y-2 text-right">
              {deleteRecord?.syncRule?.sourceType === "TABLE" ? (
                <div className="bg-[#a24ec1]/10 p-4 rounded-md border border-[#a24ec1]/20 text-[#a24ec1]">
                  <p className="font-bold flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5" />
                    פעולה קריטית!
                  </p>
                  <p className="font-medium">
                    הפעולה שמוחקת את הנתון הספציפי תמחק גם את הנתון בטבלה שממנו
                    היא הגיעה.
                  </p>
                  <p className="font-bold mt-1">הפעולה לא ניתנת לשחזור!</p>
                </div>
              ) : (
                "מחיקת תנועה ידנית. הפעולה לא ניתנת לביטול. האם להמשיך?"
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteRecord(null)}>
              ביטול
            </Button>
            <Button
              variant={
                deleteRecord?.syncRule?.sourceType === "TABLE"
                  ? "destructive"
                  : "default"
              }
              onClick={confirmDelete}
              disabled={isDeleting !== null}
              className={cn(
                deleteRecord?.syncRule?.sourceType === "TABLE"
                  ? "bg-[#a24ec1] hover:bg-purple-700"
                  : "bg-[#4f95ff] hover:bg-blue-600"
              )}
            >
              {isDeleting ? "מוחק..." : "אשר מחיקה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
