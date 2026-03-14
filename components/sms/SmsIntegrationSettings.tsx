"use client";

import { useState, useEffect } from "react";
import { getUserFriendlyError } from "@/lib/errors";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Link as LinkIcon,
  Unlink,
  CheckCircle2,
  AlertCircle,
  Phone,
  Lock,
  ArrowRight,
  RefreshCw,
  Send,
  AlertTriangle,
} from "lucide-react";
import {
  connectSmsIntegration,
  getSmsIntegrationStatus,
  refreshSmsNumbers,
  selectSmsFromNumber,
  disconnectSmsIntegration,
  sendTestSms,
} from "@/app/actions/sms-integration";
import { useRouter } from "next/navigation";
import { showConfirm } from "@/hooks/use-modal";
import { toast } from "sonner";
import { isRateLimitError, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit-utils";

interface SmsNumber {
  phoneNumber: string;
  friendlyName: string;
}

type SmsStatus =
  | "DISCONNECTED"
  | "CREDENTIALS_INVALID"
  | "CONNECTED"
  | "NO_SMS_NUMBER"
  | "READY";

interface StatusData {
  exists: boolean;
  status: SmsStatus;
  accountSid?: string;
  fromNumber?: string | null;
  friendlyName?: string | null;
  monthlyCount?: number;
  monthlyLimit?: number | null;
  updatedAt?: string;
  isAdmin: boolean;
}

export default function SmsIntegrationSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusData, setStatusData] = useState<StatusData | null>(null);

  // Connection form
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");

  // Number selection
  const [numbers, setNumbers] = useState<SmsNumber[]>([]);
  const [selectedNumber, setSelectedNumber] = useState("");
  const [loadingNumbers, setLoadingNumbers] = useState(false);

  // Test SMS
  const [testNumber, setTestNumber] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const router = useRouter();

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    setLoading(true);
    try {
      const data = await getSmsIntegrationStatus();
      setStatusData(data as StatusData);
    } catch (e) {
      if (isRateLimitError(e)) toast.error(RATE_LIMIT_MESSAGE);
      else toast.error(getUserFriendlyError(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    if (!accountSid || !authToken) {
      toast.error("יש למלא את כל השדות");
      return;
    }
    setSaving(true);
    try {
      const result = await connectSmsIntegration(accountSid, authToken);
      setNumbers(result.numbers);
      setAuthToken(""); // Clear token from state
      toast.success("החיבור ל-Twilio הושלם בהצלחה");

      if (result.accountType === "Trial") {
        toast.warning(
          "שים לב: חשבון Twilio שלך במצב Trial. ניתן לשלוח רק למספרים מאומתים.",
          { duration: 8000 },
        );
      }

      await loadStatus();
    } catch (e: any) {
      if (isRateLimitError(e)) toast.error(RATE_LIMIT_MESSAGE);
      else toast.error(getUserFriendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleRefreshNumbers() {
    setLoadingNumbers(true);
    try {
      const result = await refreshSmsNumbers();
      setNumbers(result.numbers);
      await loadStatus();
      toast.success("רשימת המספרים עודכנה");
    } catch (e) {
      if (isRateLimitError(e)) toast.error(RATE_LIMIT_MESSAGE);
      else toast.error(getUserFriendlyError(e));
    } finally {
      setLoadingNumbers(false);
    }
  }

  async function handleSelectNumber() {
    if (!selectedNumber) {
      toast.error("יש לבחור מספר שולח");
      return;
    }
    setSaving(true);
    try {
      await selectSmsFromNumber(selectedNumber);
      toast.success("מספר השולח נשמר בהצלחה");
      await loadStatus();
    } catch (e) {
      toast.error(getUserFriendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!(await showConfirm("האם אתה בטוח שברצונך לנתק את חיבור ה-SMS?")))
      return;
    setSaving(true);
    try {
      await disconnectSmsIntegration();
      setStatusData(null);
      setAccountSid("");
      setAuthToken("");
      setNumbers([]);
      toast.success("החיבור נותק בהצלחה");
      await loadStatus();
    } catch (e) {
      toast.error(getUserFriendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleSendTest() {
    if (!testNumber) {
      toast.error("יש להזין מספר טלפון לבדיקה");
      return;
    }
    setSendingTest(true);
    try {
      await sendTestSms(testNumber);
      toast.success("הודעת בדיקה נשלחה בהצלחה");
      setTestNumber("");
    } catch (e) {
      if (isRateLimitError(e)) toast.error(RATE_LIMIT_MESSAGE);
      else toast.error(getUserFriendlyError(e));
    } finally {
      setSendingTest(false);
    }
  }

  // ─── Loading ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center p-12" role="status">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="sr-only">טוען הגדרות SMS...</span>
      </div>
    );
  }

  // ─── Non-Admin View ───────────────────────────────────────────

  if (statusData && !statusData.isAdmin) {
    return (
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50 border-b border-slate-100 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Phone className="w-5 h-5 text-blue-600" />
            חיבור SMS (Twilio)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <Alert className="bg-amber-50 border-amber-200 text-amber-800">
            <Lock className="w-4 h-4 text-amber-600" />
            <AlertTitle className="font-bold">גישה מוגבלת</AlertTitle>
            <AlertDescription>
              הגדרות חיבור SMS זמינות למנהלי מערכת בלבד.
              <br />
              {statusData.exists && statusData.status === "READY" ? (
                <span className="font-medium text-green-700 mt-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  המערכת מחוברת ומוכנה לשליחת SMS
                </span>
              ) : (
                <span className="text-slate-500 mt-2 block">
                  לא מוגדר חיבור SMS פעיל כרגע.
                </span>
              )}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const status = statusData?.status ?? "DISCONNECTED";

  // ─── Main Admin View ──────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6" dir="rtl">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowRight className="w-4 h-4 ml-2" />
          חזרה לפרופיל
        </Button>
      </div>

      <Card className="border-slate-200 shadow-md overflow-hidden">
        <CardHeader className="bg-linear-to-r from-blue-50 to-indigo-50 border-b border-blue-100 pb-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2 text-blue-800">
                <Phone className="w-6 h-6 text-blue-600" />
                הגדרות חיבור Twilio SMS
              </CardTitle>
              <CardDescription className="text-blue-700/80 mt-1">
                שליחת הודעות SMS דרך חשבון Twilio שלך
              </CardDescription>
            </div>
            <StatusBadge status={status} />
          </div>
        </CardHeader>

        <CardContent className="pt-8 space-y-8">
          {/* Organizational Info */}
          <Alert className="bg-blue-50 border-blue-200 text-blue-800">
            <AlertCircle className="w-4 h-4 text-blue-600" />
            <AlertTitle className="font-bold">חיבור ארגוני</AlertTitle>
            <AlertDescription>
              החיבור מתבצע ברמת הארגון. כל המשתמשים בארגון ישתמשו בחיבור זה
              לשליחת SMS.
            </AlertDescription>
          </Alert>

          {/* ── Disconnected: Show Connection Form ── */}
          {status === "DISCONNECTED" || status === "CREDENTIALS_INVALID" ? (
            <div className="space-y-6 max-w-lg mx-auto py-4">
              {status === "CREDENTIALS_INVALID" && (
                <Alert className="bg-red-50 border-red-200 text-red-800">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <AlertDescription>
                    פרטי ההתחברות אינם תקינים. אנא בדוק ונסה שוב.
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 block">
                    Account SID
                  </label>
                  <Input
                    value={accountSid}
                    onChange={(e) => setAccountSid(e.target.value.trim())}
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="bg-white h-11 text-left font-mono text-sm"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 block">
                    Auth Token
                  </label>
                  <Input
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value.trim())}
                    placeholder="הזן את ה-Auth Token..."
                    type="password"
                    className="bg-white h-11 text-left font-mono text-sm"
                    dir="ltr"
                  />
                </div>

                <Button
                  onClick={handleConnect}
                  disabled={saving}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 text-base shadow-sm mt-4"
                >
                  {saving ? (
                    <Loader2 className="w-5 h-5 animate-spin ml-2" />
                  ) : (
                    <LinkIcon className="w-5 h-5 ml-2" />
                  )}
                  התחבר ואמת
                </Button>

                <p className="text-xs text-slate-400 text-center mt-4">
                  ניתן למצוא את הפרטים ב-
                  <span className="font-medium">Twilio Console</span> →
                  Account Info
                </p>
              </div>
            </div>
          ) : null}

          {/* ── No SMS Number ── */}
          {status === "NO_SMS_NUMBER" && (
            <div className="space-y-6">
              <Alert className="bg-amber-50 border-amber-200 text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <AlertTitle className="font-bold">
                  לא נמצא מספר SMS
                </AlertTitle>
                <AlertDescription>
                  החשבון מחובר, אך לא נמצא מספר טלפון עם יכולת שליחת SMS.
                  <br />
                  יש לרכוש מספר טלפון ב-Twilio Console ולאחר מכן ללחוץ
                  &quot;רענן מספרים&quot;.
                </AlertDescription>
              </Alert>

              <div className="flex gap-3">
                <Button
                  onClick={handleRefreshNumbers}
                  disabled={loadingNumbers}
                  variant="outline"
                >
                  {loadingNumbers ? (
                    <Loader2 className="w-4 h-4 animate-spin ml-2" />
                  ) : (
                    <RefreshCw className="w-4 h-4 ml-2" />
                  )}
                  רענן מספרים
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDisconnect}
                  disabled={saving}
                  className="bg-white border-2 border-red-100 text-red-600 hover:bg-red-50 hover:border-red-200"
                >
                  <Unlink className="w-4 h-4 ml-2" />
                  נתק חיבור
                </Button>
              </div>
            </div>
          )}

          {/* ── Connected: Number Selection ── */}
          {status === "CONNECTED" && (
            <div className="space-y-6">
              <Alert className="bg-blue-50 border-blue-200 text-blue-800">
                <AlertCircle className="w-4 h-4 text-blue-600" />
                <AlertDescription>
                  החשבון מחובר! יש לבחור מספר שולח ברירת מחדל.
                </AlertDescription>
              </Alert>

              {numbers.length > 0 ? (
                <div className="space-y-4 max-w-lg">
                  <label className="text-sm font-semibold text-slate-700 block">
                    בחר מספר שולח
                  </label>
                  <Select
                    value={selectedNumber}
                    onValueChange={setSelectedNumber}
                    dir="rtl"
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="בחר מספר..." />
                    </SelectTrigger>
                    <SelectContent>
                      {numbers.map((n) => (
                        <SelectItem
                          key={n.phoneNumber}
                          value={n.phoneNumber}
                        >
                          <span dir="ltr" className="font-mono">
                            {n.phoneNumber}
                          </span>
                          {n.friendlyName && (
                            <span className="text-slate-500 mr-2">
                              ({n.friendlyName})
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleSelectNumber}
                    disabled={saving || !selectedNumber}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin ml-2" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 ml-2" />
                    )}
                    אשר מספר שולח
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={handleRefreshNumbers}
                  disabled={loadingNumbers}
                  variant="outline"
                >
                  {loadingNumbers ? (
                    <Loader2 className="w-4 h-4 animate-spin ml-2" />
                  ) : (
                    <RefreshCw className="w-4 h-4 ml-2" />
                  )}
                  טען מספרים
                </Button>
              )}
            </div>
          )}

          {/* ── Ready: Status Dashboard ── */}
          {status === "READY" && statusData && (
            <div className="space-y-6">
              {/* Status Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-xl border border-slate-200">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-500 uppercase">
                    חשבון Twilio
                  </div>
                  <div className="font-medium text-slate-900">
                    {statusData.friendlyName ?? "—"}
                  </div>
                  <div className="font-mono text-xs text-slate-500" dir="ltr">
                    {statusData.accountSid}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-500 uppercase">
                    מספר שולח
                  </div>
                  <div className="font-mono text-lg font-medium text-slate-900" dir="ltr">
                    {statusData.fromNumber}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-500 uppercase">
                    שימוש חודשי
                  </div>
                  <div className="font-medium text-slate-900">
                    {statusData.monthlyCount ?? 0}
                    {statusData.monthlyLimit != null && (
                      <span className="text-slate-500">
                        {" "}
                        / {statusData.monthlyLimit}
                      </span>
                    )}
                    {statusData.monthlyLimit == null && (
                      <span className="text-slate-500"> (ללא הגבלה)</span>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-500 uppercase">
                    סטטוס
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={status} />
                    <span className="text-xs text-green-600 font-medium">
                      מוכן לשליחה
                    </span>
                  </div>
                </div>
              </div>

              {/* Test SMS */}
              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <h4 className="font-medium text-slate-900 mb-3">
                  שלח הודעת בדיקה
                </h4>
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <Input
                      value={testNumber}
                      onChange={(e) => setTestNumber(e.target.value)}
                      placeholder="050-1234567 או +972501234567"
                      className="bg-white h-10 text-left"
                      dir="ltr"
                    />
                  </div>
                  <Button
                    onClick={handleSendTest}
                    disabled={sendingTest || !testNumber}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white h-10 px-4"
                  >
                    {sendingTest ? (
                      <Loader2 className="w-4 h-4 animate-spin ml-1" />
                    ) : (
                      <Send className="w-4 h-4 ml-1" />
                    )}
                    שלח
                  </Button>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  עד 3 הודעות בדיקה כל 15 דקות
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  onClick={handleRefreshNumbers}
                  disabled={loadingNumbers}
                  variant="outline"
                  size="sm"
                >
                  {loadingNumbers ? (
                    <Loader2 className="w-4 h-4 animate-spin ml-1" />
                  ) : (
                    <RefreshCw className="w-4 h-4 ml-1" />
                  )}
                  רענן מספרים
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDisconnect}
                  disabled={saving}
                  size="sm"
                  className="bg-white border-2 border-red-100 text-red-600 hover:bg-red-50 hover:border-red-200"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin ml-1" />
                  ) : (
                    <Unlink className="w-4 h-4 ml-1" />
                  )}
                  נתק חיבור
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Status Badge Component ─────────────────────────────────────

function StatusBadge({ status }: { status: SmsStatus }) {
  switch (status) {
    case "READY":
      return (
        <Badge className="bg-green-600 hover:bg-green-700 text-white px-3 py-1">
          מוכן לשליחה
        </Badge>
      );
    case "CONNECTED":
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200 px-3 py-1">
          מחובר
        </Badge>
      );
    case "NO_SMS_NUMBER":
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 px-3 py-1">
          חסר מספר SMS
        </Badge>
      );
    case "CREDENTIALS_INVALID":
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200 px-3 py-1">
          פרטים שגויים
        </Badge>
      );
    default:
      return null;
  }
}
