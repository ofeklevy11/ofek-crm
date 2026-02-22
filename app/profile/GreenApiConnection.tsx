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
  Loader2,
  Link as LinkIcon,
  Unlink,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Lock,
  ArrowRight,
} from "lucide-react";
import {
  saveGreenApiCredentials,
  getGreenApiCredentials,
  getGreenApiStatus,
  disconnectGreenApi,
} from "@/app/actions/green-api";
import { useRouter } from "next/navigation";
import { showAlert, showConfirm } from "@/hooks/use-modal";
import { toast } from "sonner";
import { isRateLimitError, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit-utils";

export default function GreenApiConnection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [instanceId, setInstanceId] = useState("");
  const [token, setToken] = useState("");

  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const creds = await getGreenApiCredentials();
      setIsAdmin(!!creds.isAdmin);

      if (creds?.greenApiInstanceId) {
        setConnected(true);
        setInstanceId(creds.greenApiInstanceId);

        // Fetch status
        const statusData = await getGreenApiStatus();
        setStatus(statusData);
      } else {
        setConnected(false);
      }
    } catch (e) {
      console.error(e);
      if (isRateLimitError(e)) toast.error(RATE_LIMIT_MESSAGE);
      else toast.error(getUserFriendlyError(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!instanceId || !token) {
      showAlert("אנא הזן את כל השדות");
      return;
    }

    setSaving(true);
    try {
      await saveGreenApiCredentials(instanceId, token);
      setConnected(true);
      const statusData = await getGreenApiStatus();
      setStatus(statusData);
      toast.success("החיבור נשמר בהצלחה");
    } catch (e: any) {
      toast.error(getUserFriendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!(await showConfirm("האם אתה בטוח שברצונך לנתק את החיבור?"))) return;

    setSaving(true);
    try {
      await disconnectGreenApi();
      setConnected(false);
      setInstanceId("");
      setToken("");
      setStatus(null);
      toast.success("החיבור נותק בהצלחה");
    } catch (e) {
      toast.error(getUserFriendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  // Non-admin view
  if (!isAdmin) {
    return (
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50 border-b border-slate-100 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-600" />
            חיבור WhatsApp (Green API)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <Alert className="bg-amber-50 border-amber-200 text-amber-800">
            <Lock className="w-4 h-4 text-amber-600" />
            <AlertTitle className="font-bold">גישה מוגבלת</AlertTitle>
            <AlertDescription>
              הגדרות חיבור WhatsApp זמינות למנהלי מערכת בלבד.
              <br />
              {connected ? (
                <span className="font-medium text-green-700 mt-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  המערכת מחוברת כרגע למספר שמסתיים ב-
                  {instanceId.slice(-4) || "****"}
                </span>
              ) : (
                <span className="text-slate-500 mt-2 block">
                  לא מוגדר חיבור פעיל כרגע.
                </span>
              )}
            </AlertDescription>
          </Alert>

          <div className="text-sm text-slate-500">
            רק מנהלי הארגון יכולים לנהל את נתוני החיבור בהתאם למדיניות האבטחה
            (חיבור אחד לכל ארגון).
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6" dir="rtl">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowRight className="w-4 h-4 ml-2" />
          חזרה לפרופיל
        </Button>
      </div>

      <Card className="border-slate-200 shadow-md overflow-hidden">
        <CardHeader className="bg-linear-to-r from-green-50 to-emerald-50 border-b border-green-100 pb-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2 text-green-800">
                <MessageSquare className="w-6 h-6 text-green-600" />
                הגדרות חיבור Green API
              </CardTitle>
              <CardDescription className="text-green-700/80 mt-1">
                חיבור המערכת ל-WhatsApp לשליחת הודעות אוטומטיות
              </CardDescription>
            </div>
            {connected && (
              <Badge className="bg-green-600 hover:bg-green-700 text-white px-3 py-1">
                מחובר פעיל
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-8 space-y-8">
          <Alert className="bg-blue-50 border-blue-200 text-blue-800">
            <AlertCircle className="w-4 h-4 text-blue-600" />
            <AlertTitle className="font-bold">שים לב: חיבור ארגוני</AlertTitle>
            <AlertDescription>
              החיבור מתבצע ברמת הארגון (Per Company). ניתן לחבר מספר אחד בלבד
              עבור כל הארגון.
              <br />
              כל המשתמשים בארגון ישתמשו בחיבור זה לשליחת הודעות.
            </AlertDescription>
          </Alert>

          {!connected ? (
            <div className="space-y-6 max-w-lg mx-auto py-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 block">
                    מזהה אינסטנס (idInstance)
                  </label>
                  <Input
                    value={instanceId}
                    onChange={(e) => setInstanceId(e.target.value)}
                    placeholder="לדוגמה: 1101823921"
                    className="bg-white h-11 text-left"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 block">
                    טוקן אינסטנס (apiTokenInstance)
                  </label>
                  <Input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="הזדבק את הטוקן כאן..."
                    type="password"
                    className="bg-white h-11 text-left"
                    dir="ltr"
                  />
                </div>

                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full bg-green-600 hover:bg-green-700 text-white h-11 text-base shadow-sm mt-4"
                >
                  {saving ? (
                    <Loader2 className="w-5 h-5 animate-spin ml-2" />
                  ) : (
                    <LinkIcon className="w-5 h-5 ml-2" />
                  )}
                  שמור והתחבר
                </Button>

                <p className="text-xs text-slate-400 text-center mt-4">
                  פרטים אלו זמינים באזור האישי באתר Green API
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-xl border border-slate-200">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-500 uppercase">
                    מזהה מחובר
                  </div>
                  <div className="font-mono text-lg font-medium text-slate-900">
                    {instanceId}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-500 uppercase">
                    סטטוס חיבור
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        status?.state === "authorized" ? "default" : "secondary"
                      }
                      className={
                        status?.state === "authorized"
                          ? "bg-green-100 text-green-700 hover:bg-green-100 border-green-200"
                          : ""
                      }
                    >
                      {status?.state || "Unknown"}
                    </Badge>
                    {status?.state === "authorized" && (
                      <span className="text-xs text-green-600 font-medium">
                        הכל תקין
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <h4 className="font-medium text-slate-900 mb-2">פרטי מנוי</h4>
                <div className="text-sm text-slate-600">
                  סוג המנוי ותוקף המנוי מנוהלים ישירות מול Green API.
                  <br />
                  כאן מוצג סטטוס החיבור הטכני בלבד.
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <Button
                  variant="destructive"
                  onClick={handleDisconnect}
                  disabled={saving}
                  className="bg-white border-2 border-red-100 text-red-600 hover:bg-red-50 hover:border-red-200"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin ml-2" />
                  ) : (
                    <Unlink className="w-4 h-4 ml-2" />
                  )}
                  נתק חיבור והסר פרטים
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
