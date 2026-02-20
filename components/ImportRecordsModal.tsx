"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  Check,
  AlertTriangle,
  FileText,
  CheckCircle2,
  RotateCw,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useUploadThing } from "@/lib/uploadthing";
import { apiFetch } from "@/lib/api-fetch";
import { getUserFriendlyError } from "@/lib/errors";

interface ImportRecordsModalProps {
  tableId: number;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = "UPLOAD" | "VALIDATING" | "REVIEW" | "COMMITTING" | "SUCCESS";

interface ValidationSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: { line: number; message: string }[];
  headers: string[];
}

export default function ImportRecordsModal({
  tableId,
  onClose,
  onSuccess,
}: ImportRecordsModalProps) {
  const [step, setStep] = useState<Step>("UPLOAD");
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ValidationSummary | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [importJobId, setImportJobId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  const { startUpload, isUploading } = useUploadThing("tableImport", {
    onUploadProgress: (p) => setProgress(p),
  });

  // Cleanup on unmount - stop polling when modal closes
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    reset();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      // Basic client-side check is fine, uploadthing has its own checks too
      // but let's keep 32MB check or just rely on server
      // Server allows 32MB now for tableImport
      if (selectedFile.size > 5 * 1024 * 1024) {
        toast.error("הקובץ גדול מדי (5MB מקסימום)");
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleValidate = async () => {
    if (!file) return;

    setStep("VALIDATING");
    setProgress(0);
    setError(null);

    let validationInterval: NodeJS.Timeout | null = null;

    try {
      // 1. Upload to UploadThing
      const uploadRes = await startUpload([file], {
        tableId: tableId, // Pass tableId as input
      } as any);

      console.log("Upload result:", uploadRes);

      if (!uploadRes || !uploadRes[0]) {
        throw new Error("העלאת הקובץ נכשלה - לא התקבלה תשובה מהשרת.");
      }

      let jobId = (uploadRes[0].serverData as any)?.importJobId;
      const fileData = uploadRes[0];

      // Prepare payload for validation
      // SECURITY: Only send fileKey, never fileUrl - server builds URL securely
      const payload: any = {};

      if (jobId) {
        payload.importJobId = jobId;
      } else {
        console.warn(
          "No importJobId (webhook failed?), falling back to fileKey only",
        );
        payload.fileKey = fileData.key;
        payload.fileName = fileData.name;
      }

      if (jobId) setImportJobId(jobId);

      // Upload done, now validating
      setProgress(0);

      // 2. Validate on Server
      validationInterval = setInterval(() => {
        setProgress((prev) => (prev >= 95 ? 95 : prev + 5));
      }, 500);

      const res = await apiFetch(`/api/tables/${tableId}/import/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (validationInterval) clearInterval(validationInterval);
      setProgress(100);

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "שגיאה בבדיקת הקובץ");
      }

      // Validation might have created the job ID if it was missing
      if (data.importJobId) {
        setImportJobId(data.importJobId);
      }

      setSummary(data);
      setStep("REVIEW");
    } catch (err: any) {
      if (validationInterval) clearInterval(validationInterval);
      console.error("Validation flow error:", err);
      const msg = getUserFriendlyError(err);
      setIsRateLimited(/מדי (בקשות|פניות|ניסיונות)/i.test(msg));
      setError(msg);
      setStep("UPLOAD");
      setProgress(0);
    } finally {
      if (validationInterval) clearInterval(validationInterval);
    }
  };

  const handleCommit = async () => {
    if (!importJobId || confirmationText !== "אני מאשר") return;

    setStep("COMMITTING");
    setProgress(0);
    setError(null);

    try {
      // 1. Start the import (queues a background job)
      const res = await apiFetch(`/api/tables/${tableId}/import/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importJobId }),
      });

      // Check if response is JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Non-JSON response from commit:", text.substring(0, 200));
        throw new Error("שגיאת שרת - נא לרענן את הדף ולנסות שוב");
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "שגיאה בשמירת הנתונים");
      }

      // 2. Poll for status updates
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(
            `/api/tables/${tableId}/import/status/${importJobId}`,
          );

          // Check if response is JSON
          const statusContentType = statusRes.headers.get("content-type");
          if (
            !statusContentType ||
            !statusContentType.includes("application/json")
          ) {
            console.warn("Non-JSON status response, will retry...");
            return; // Skip this poll, try again next interval
          }

          const status = await statusRes.json();

          if (!statusRes.ok) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setError(status.error || "שגיאה בבדיקת סטטוס");
            setStep("REVIEW");
            return;
          }

          // Update progress
          setProgress(status.progress || 0);

          // Check for completion
          if (status.status === "IMPORTED") {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setProgress(100);
            setStep("SUCCESS");
            toast.success(`נוספו בהצלחה ${status.insertedCount} רשומות`);
            onSuccess();
            router.refresh();
          } else if (status.status === "FAILED") {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setError(status.error || "הייבוא נכשל");
            setStep("REVIEW");
          }
          // If QUEUED or IMPORTING, continue polling
        } catch (pollErr: any) {
          console.error("Poll error:", pollErr);
          // Don't stop polling on transient errors, just log
        }
      }, 2000); // Poll every 2 seconds (slightly slower for stability)

      // Safety: stop polling after 10 minutes max
      setTimeout(
        () => {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            // Check if still in COMMITTING state
            setStep((currentStep) => {
              if (currentStep === "COMMITTING") {
                setError("הייבוא לקח יותר מדי זמן. נא לבדוק את סטטוס הייבוא.");
                return "REVIEW";
              }
              return currentStep;
            });
          }
        },
        10 * 60 * 1000,
      );
    } catch (err: any) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setError(getUserFriendlyError(err));
      setStep("REVIEW"); // Go back to review so they can try again or fix
      setProgress(0);
    }
  };

  const reset = () => {
    // Stop any active polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setFile(null);
    setSummary(null);
    setConfirmationText("");
    setStep("UPLOAD");
    setError(null);
    setIsRateLimited(false);
    setImportJobId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl" dir="rtl">
        <DialogHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Upload className="h-6 w-6 text-primary" />
              ייבוא נתונים (CSV/TXT)
            </DialogTitle>
            {(step !== "UPLOAD" || file || error) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                className="text-muted-foreground hover:text-foreground gap-1"
                title="התחל מחדש"
              >
                <RotateCcw className="h-4 w-4" />
                <span className="text-xs">איפוס</span>
              </Button>
            )}
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-between px-8 relative">
            <div className="absolute top-1/2 right-0 left-0 h-0.5 bg-gray-200 -z-10" />

            {["UPLOAD", "REVIEW", "SUCCESS"].map((s, idx) => {
              const isActive =
                (s === "UPLOAD" &&
                  (step === "UPLOAD" || step === "VALIDATING")) ||
                (s === "REVIEW" &&
                  (step === "REVIEW" || step === "COMMITTING")) ||
                (s === "SUCCESS" && step === "SUCCESS");

              const isDone =
                (s === "UPLOAD" &&
                  step !== "UPLOAD" &&
                  step !== "VALIDATING") ||
                (s === "REVIEW" && step === "SUCCESS");

              return (
                <div
                  key={s}
                  className="flex flex-col items-center gap-1 bg-background px-2"
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all",
                      isActive
                        ? "border-primary bg-primary text-white scale-110"
                        : isDone
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-gray-200 text-gray-400",
                    )}
                  >
                    {isDone ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <span className="text-xs font-bold">{idx + 1}</span>
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      isActive ? "text-primary" : "text-gray-500",
                    )}
                  >
                    {s === "UPLOAD"
                      ? "העלאה"
                      : s === "REVIEW"
                        ? "בדיקה ואישור"
                        : "סיום"}
                  </span>
                </div>
              );
            })}
          </div>
        </DialogHeader>

        <div className="py-6">
          {step === "UPLOAD" && (
            <div className="space-y-6">
              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".csv,.txt"
                  onChange={handleFileChange}
                />
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-1">
                  {file ? file.name : "לחץ להעלאת קובץ CSV או TXT"}
                </h3>
                <p className="text-sm text-gray-500">
                  {file ? `${(file.size / 1024).toFixed(1)} KB` : "מקסימום 5MB"}
                </p>
              </div>

              {error && isRateLimited ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-red-900 mb-1">יותר מדי בקשות</p>
                    <p className="text-sm text-red-800">אנא נסה שוב בעוד 2 דקות והנתונים יוצגו.</p>
                  </div>
                </div>
              ) : error ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>שגיאה</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-700 space-y-2">
                <p className="font-semibold flex items-center gap-2">
                  <RotateCw className="h-4 w-4" />
                  הנחיות לייבוא תקין:
                </p>
                <ul className="list-disc list-inside space-y-1 opacity-80">
                  <li>קובץ CSV או TXT בקידוד UTF-8 בלבד</li>
                  <li>
                    שורת כותרת חובה: הכותרות חייבות להיות זהות ל-
                    <b>שם המערכת (Name)</b> באנגלית (לא התווית בעברית)
                  </li>
                  <li>תאריך בפורמט: YYYY-MM-DD HH:MM:SS</li>
                  <li>גודל מקסימלי: 5MB</li>
                  <li>
                    עמודות מערכת שמתעלמים מהן: ID, Created At, Created By,
                    Updated At, Updated By
                  </li>
                </ul>
              </div>
            </div>
          )}

          {(step === "VALIDATING" || step === "COMMITTING") && (
            <div className="text-center py-12 space-y-4">
              <div className="relative w-24 h-24 mx-auto">
                <div className="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center font-bold text-lg text-primary">
                  {progress}%
                </div>
              </div>
              <h3 className="text-xl font-medium">
                {step === "VALIDATING"
                  ? isUploading
                    ? progress === 100
                      ? "מעבד נתונים בשרת..."
                      : "מעלה קובץ..."
                    : "בודק את הקובץ..."
                  : "מעדכן את בסיס הנתונים..."}
              </h3>
              <p className="text-muted-foreground">
                אנא המתן, פעולה זו עשויה לקחת מספר רגעים
              </p>
            </div>
          )}

          {step === "REVIEW" && summary && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 p-4 rounded-xl text-center border">
                  <div className="text-sm text-gray-500 mb-1">סה״כ שורות</div>
                  <div className="text-2xl font-bold">{summary.totalRows}</div>
                </div>
                <div className="bg-green-50 p-4 rounded-xl text-center border border-green-100">
                  <div className="text-sm text-green-600 mb-1">
                    רשומות תקינות
                  </div>
                  <div className="text-2xl font-bold text-green-700">
                    {summary.validRows}
                  </div>
                </div>
                <div className="bg-red-50 p-4 rounded-xl text-center border border-red-100">
                  <div className="text-sm text-red-600 mb-1">רשומות שגויות</div>
                  <div className="text-2xl font-bold text-red-700">
                    {summary.invalidRows}
                  </div>
                </div>
              </div>

              {summary.errors.length > 0 && (
                <div className="border rounded-xl overflow-hidden">
                  <div className="bg-red-50 px-4 py-2 border-b border-red-100 text-red-800 font-medium flex justify-between">
                    <span>פירוט שגיאות ({summary.errors.length})</span>
                    <span className="text-xs self-center bg-white/50 px-2 py-0.5 rounded">
                      מציג ראשונות
                    </span>
                  </div>
                  <ScrollArea className="h-[150px] bg-white">
                    <div className="p-4 space-y-3">
                      {summary.errors.map((err, i) => (
                        <div
                          key={i}
                          className="flex gap-3 text-sm border-b last:border-0 pb-2 last:pb-0"
                        >
                          <span className="font-mono bg-gray-100 px-2 rounded text-xs py-0.5 h-fit whitespace-nowrap">
                            שורה {err.line}
                          </span>
                          <span className="text-red-600">{err.message}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {summary.validRows > 0 ? (
                <div className="space-y-2 pt-2">
                  <Label>כדי להמשיך, הקלד &quot;אני מאשר&quot;:</Label>
                  <Input
                    value={confirmationText}
                    onChange={(e) => setConfirmationText(e.target.value)}
                    placeholder="אני מאשר"
                    className={cn(
                      "text-center font-bold tracking-wide transition-all",
                      confirmationText === "אני מאשר"
                        ? "border-green-500 ring-1 ring-green-500 bg-green-50"
                        : "",
                    )}
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    שים לב: רק {summary.validRows} הרשומות התקינות יישמרו במסד
                    הנתונים.
                  </p>
                </div>
              ) : (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>אין רשומות תקינות</AlertTitle>
                  <AlertDescription>
                    לא ניתן להמשיך בייבוא שכן כל הרשומות נמצאו לא תקינות. אנא
                    תקן את הקובץ ונסה שוב.
                  </AlertDescription>
                </Alert>
              )}

              {error && isRateLimited ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-red-900 mb-1">יותר מדי בקשות</p>
                    <p className="text-sm text-red-800">אנא נסה שוב בעוד 2 דקות והנתונים יוצגו.</p>
                  </div>
                </div>
              ) : error ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>שגיאה בשמירה</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          )}

          {step === "SUCCESS" && (
            <div className="text-center py-8 space-y-6">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600 animate-in zoom-in duration-300">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900">
                  הייבוא הושלם בהצלחה!
                </h3>
                <p className="text-gray-500 mt-2">
                  הנתונים נשמרו והטבלה מעודכנת.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "UPLOAD" && (
            <>
              <Button variant="outline" onClick={onClose}>
                ביטול
              </Button>
              <Button
                onClick={handleValidate}
                disabled={!file}
                className="bg-primary"
              >
                המשך לבדיקה
              </Button>
            </>
          )}

          {step === "REVIEW" && (
            <>
              <Button variant="outline" onClick={reset}>
                בחר קובץ אחר
              </Button>
              <Button
                onClick={handleCommit}
                disabled={
                  confirmationText !== "אני מאשר" || summary?.validRows === 0
                }
                className={cn(
                  "transition-all",
                  confirmationText === "אני מאשר"
                    ? "bg-green-600 hover:bg-green-700"
                    : "",
                )}
              >
                בצע ייבוא
              </Button>
            </>
          )}

          {step === "SUCCESS" && (
            <Button onClick={onClose} className="w-full bg-primary">
              סיים וסגור
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
