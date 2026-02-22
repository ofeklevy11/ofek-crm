"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Trash2,
  RefreshCw,
  Play,
  Database,
  CreditCard,
  Edit2,
  MoreVertical,
  Calendar,
  ShieldAlert,
} from "lucide-react";
import { deleteSyncRule, enqueueSyncJob } from "@/app/actions/finance-sync";
import { toast } from "sonner";
import { showConfirm } from "@/hooks/use-modal";
import { getUserFriendlyError } from "@/lib/errors";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export default function ActiveSyncRules({ rules }: { rules: any[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [showEditBlocker, setShowEditBlocker] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleRun = async (id: number) => {
    setLoadingId(id);
    stopPolling();
    try {
      const { jobId } = await enqueueSyncJob(id);

      // Auto-stop polling after 2 minutes to prevent infinite polling
      const timeoutId = setTimeout(() => {
        stopPolling();
        setLoadingId(null);
        toast.success("זמן המתנה עבר", { description: "הסנכרון עדיין רץ ברקע. רענן את הדף בעוד מספר דקות." });
      }, 120_000);

      // Poll for completion
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/finance-sync/status/${jobId}`);
          if (res.status === 429) return; // Skip this poll on rate limit, retry next interval
          if (!res.ok) return;
          const data = await res.json();

          if (data.status === "COMPLETED") {
            stopPolling();
            clearTimeout(timeoutId);
            setLoadingId(null);
            const { created, updated, skippedError } = data;

            if (created > 0 || (updated && updated > 0)) {
              toast.success("סנכרון הושלם בהצלחה", { description: `נוצרו ${created} חדשים, עודכנו ${updated || 0} קיימים.` });
            } else if (skippedError > 0) {
              toast.error(`זוהו שגיאות בסנכרון: נכשלו ${skippedError} רשומות.`);
            } else {
              toast.success("הנתונים עדכניים", { description: "לא נמצאו רשומות חדשות או שינויים." });
            }
            router.refresh();
          } else if (data.status === "FAILED") {
            stopPolling();
            clearTimeout(timeoutId);
            setLoadingId(null);
            toast.error(data.error || "הסנכרון נכשל");
          }
        } catch {
          // Ignore polling errors, keep trying
        }
      }, 2000);
    } catch (e) {
      setLoadingId(null);
      toast.error(getUserFriendlyError(e));
    }
  };

  const handleDelete = async (id: number) => {
    if (
      !(await showConfirm({
        message: "האם אתה בטוח? הרשומות שכבר נוצרו יישארו בדוח אך ינותקו מחוק זה.",
        variant: "destructive",
      }))
    )
      return;
    try {
      await deleteSyncRule(id);
      toast.success("חוק נמחק בהצלחה");
    } catch (e) {
      toast.error(getUserFriendlyError(e));
    }
  };

  if (rules.length === 0)
    return (
      <div className="text-center text-gray-500 py-4">
        אין חוקי איסוף פעילים.
      </div>
    );

  return (
    <>
      <div
        className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500"
        dir="rtl"
      >
        {rules.map((rule) => {
          return (
            <div
              key={rule.id}
              className="group relative p-4 rounded-xl border border-gray-100 bg-white hover:border-[#4f95ff]/30 hover:shadow-md transition-all duration-200"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      rule.sourceType === "TABLE"
                        ? "bg-blue-50 text-[#4f95ff]"
                        : "bg-purple-50 text-[#a24ec1]"
                    }`}
                  >
                    {rule.sourceType === "TABLE" ? (
                      <Database className="w-4 h-4" />
                    ) : (
                      <CreditCard className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm leading-tight">
                      {rule.name}
                    </h3>
                    <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      {rule.sourceType === "TABLE"
                        ? `טבלה #${rule.sourceId}`
                        : "מערכת תשלומים וריטיינרים"}
                    </div>
                  </div>
                </div>

                <DropdownMenu dir="rtl">
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 -ml-2 text-gray-400 hover:text-gray-600"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setShowEditBlocker(true)}>
                      <Edit2 className="w-4 h-4 ml-2" /> עריכה
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(rule.id)}
                      className="text-red-600 focus:text-red-600 focus:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4 ml-2" /> מחיקה
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center justify-between mt-3 pl-1">
                <Badge
                  variant="secondary"
                  className={`font-normal ${
                    rule.targetType === "INCOME"
                      ? "bg-blue-50 text-[#4f95ff] hover:bg-blue-100"
                      : "bg-purple-50 text-[#a24ec1] hover:bg-purple-100"
                  }`}
                >
                  {rule.targetType === "INCOME" ? "הכנסות" : "הוצאות"}
                </Badge>

                <div
                  className="text-xs text-gray-400 flex items-center gap-1"
                  title="ריצה אחרונה"
                >
                  <Calendar className="w-3 h-3" />
                  {rule.lastRunAt
                    ? format(new Date(rule.lastRunAt), "dd/MM")
                    : "-"}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-50">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-9 border-[#a24ec1]/20 text-[#a24ec1] hover:bg-purple-50 hover:text-[#a24ec1] hover:border-[#a24ec1]"
                  onClick={() => handleRun(rule.id)}
                  disabled={loadingId === rule.id}
                >
                  {loadingId === rule.id ? (
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Play className="w-4 h-4 mr-2 fill-current" />
                  )}
                  {loadingId === rule.id ? "מסנכרן..." : "הרץ סנכרון כעת"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={showEditBlocker} onOpenChange={setShowEditBlocker}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-4">
            <DialogTitle className="text-center text-xl font-bold flex flex-col items-center gap-3">
              <div className="p-4 rounded-full bg-red-50 text-red-500 shadow-sm ring-1 ring-red-100">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <span className="text-gray-900">לא ניתן לערוך חוק פעיל</span>
            </DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-4 py-2 px-2 text-gray-600">
            <p className="leading-relaxed">
              חוקי איסוף פעילים הם הלב של מערכת הדוחות הכספיים שלך.
            </p>
            <p className="leading-relaxed">
              שינוי הגדרות של חוק קיים בזמן אמת עלול לשבש את היסטוריית הנתונים,
              ליצור כפילויות לא רצויות ולפגוע באמינות דוח ההכנסות וההוצאות.
            </p>
            <div className="bg-blue-50/80 border border-blue-100 p-4 rounded-xl text-sm text-blue-700 mt-2 shadow-sm">
              <strong>המלצה:</strong> אם ברצונך לשנות לוגיקה, עדיף למחוק את החוק
              הקיים וליצור חדש, או להוסיף חוק חדש במקביל.
            </div>
          </div>
          <DialogFooter className="sm:justify-center mt-2">
            <Button
              variant="outline"
              onClick={() => setShowEditBlocker(false)}
              className="min-w-[140px] border-gray-300 hover:bg-gray-50 font-medium"
            >
              הבנתי, תודה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
