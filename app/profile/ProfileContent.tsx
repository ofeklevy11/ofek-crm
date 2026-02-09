"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { User } from "@/lib/permissions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Plus,
  Trash2,
  Copy,
  Check,
  Key,
  Shield,
  Briefcase,
  Mail,
  User as UserIcon,
  Building2,
  Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getApiKeys, createApiKey, deleteApiKey } from "@/app/actions/api-keys";
import { updateCompanyName } from "@/app/actions/update-company-name";
import { format } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import GreenApiConnection from "./GreenApiConnection";

interface ProfileContentProps {
  user: User;
}

export default function ProfileContent({ user }: ProfileContentProps) {
  const [keys, setKeys] = useState<any[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Company name update states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [password, setPassword] = useState("");
  const [updatingCompanyName, setUpdatingCompanyName] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  const isAdmin = user.role === "admin";

  useEffect(() => {
    if (isAdmin) {
      loadKeys();
    }
  }, [isAdmin]);

  async function loadKeys() {
    setLoadingKeys(true);
    const res = await getApiKeys();
    if (res.success && res.data) {
      setKeys(res.data);
    }
    setLoadingKeys(false);
  }

  const router = useRouter();

  async function handleCreateKey() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await createApiKey(newKeyName);
      if (res.success && res.data) {
        setNewKeyName("");
        await loadKeys();
        router.refresh(); // Refresh server state just in case
      } else {
        console.error("Failed to create key:", res.error);
        alert("שגיאה ביצירת מפתח: " + (res.error || "Unknown error"));
      }
    } catch (e) {
      console.error("Exception creating key:", e);
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteKey(id: number) {
    if (
      !confirm(
        "האם אתה בטוח שברצונך למחוק מפתח זה? פעולה זו תחסום כל שימוש קיים במפתח.",
      )
    )
      return;

    const res = await deleteApiKey(id);
    if (res.success) {
      await loadKeys();
      router.refresh();
    } else {
      alert("שגיאה במחיקת מפתח: " + (res.error || "Unknown error"));
    }
  }

  async function copyToClipboard(text: string) {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      setCopiedKey(text);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }

  async function handleUpdateCompanyName() {
    if (!newCompanyName.trim() || !password) {
      setUpdateError("נא למלא את כל השדות");
      return;
    }

    setUpdatingCompanyName(true);
    setUpdateError(null);
    setUpdateSuccess(false);

    try {
      const res = await updateCompanyName({
        newCompanyName: newCompanyName.trim(),
        password,
      });

      if (res.success) {
        setUpdateSuccess(true);
        setNewCompanyName("");
        setPassword("");
        // Refresh the page to show the new company name
        setTimeout(() => {
          router.refresh();
          setUpdateSuccess(false);
          setIsDialogOpen(false);
        }, 2000);
      } else {
        setUpdateError(res.error || "שגיאה לא ידועה");
      }
    } catch (error) {
      console.error("Error updating company name:", error);
      setUpdateError("שגיאה בעדכון שם הארגון");
    } finally {
      setUpdatingCompanyName(false);
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "admin":
        return "אדמין מערכת";
      case "manager":
        return "מנהל";
      case "basic":
        return "משתמש";
      default:
        return role;
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8" dir="rtl">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row gap-6 items-center md:items-start bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <Avatar className="w-24 h-24 border-4 border-slate-50 shadow-md">
          <AvatarImage src="" />
          <AvatarFallback className="text-3xl bg-linear-to-br from-blue-500 to-purple-600 text-white">
            {user.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="text-center md:text-right space-y-2 flex-1">
          <h1 className="text-3xl font-bold text-slate-900">{user.name}</h1>
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
            <Badge
              variant="secondary"
              className="px-3 py-1 text-sm bg-slate-100 text-slate-700"
            >
              <Mail className="w-3.5 h-3.5 ml-1.5" />
              {user.email}
            </Badge>
            <Badge
              variant="outline"
              className="px-3 py-1 text-sm border-purple-200 text-purple-700 bg-purple-50"
            >
              <Shield className="w-3.5 h-3.5 ml-1.5" />
              {getRoleLabel(user.role)}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Organization & Identity */}
        <div className="space-y-6">
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50 border-b border-slate-100 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                פרטי ארגון
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  שם הארגון
                </label>
                <div className="font-medium text-slate-900">
                  {user.company?.name || "לא משויך"}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  מזהה ארגון (Company ID)
                </label>
                <div className="flex items-center gap-2">
                  <div className="font-mono text-sm bg-slate-100 px-3 py-1.5 rounded-md text-slate-700 border border-slate-200">
                    {user.companyId}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => copyToClipboard(String(user.companyId))}
                  >
                    {copiedKey === String(user.companyId) ? (
                      <Check className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  יש להשתמש במזהה זה בכל קריאות ה-API למערכת.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50 border-b border-slate-100 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <UserIcon className="w-5 h-5 text-slate-600" />
                פרטי משתמש
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  מזהה משתמש (User ID)
                </label>
                <div className="font-mono text-sm text-slate-700">
                  {user.id}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Change Organization Name Button (Admin Only) */}
          {isAdmin && (
            <Card className="border-amber-200 shadow-sm overflow-hidden">
              <CardHeader className="bg-amber-50 border-b border-amber-100 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lock className="w-5 h-5 text-amber-600" />
                  ניהול ארגון
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white">
                      <Building2 className="w-4 h-4 ml-2" />
                      עדכון שם הארגון
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]" dir="rtl">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Lock className="w-5 h-5 text-amber-600" />
                        עדכון שם הארגון
                      </DialogTitle>
                      <DialogDescription>
                        שנה את שם הארגון. נדרשת אימות סיסמה לאישור השינוי.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">
                          שם ארגון נוכחי
                        </label>
                        <div className="p-3 bg-slate-50 rounded-md border border-slate-200 text-slate-900 font-medium">
                          {user.company?.name || "לא משויך"}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">
                          שם ארגון חדש
                        </label>
                        <Input
                          placeholder="הזן שם ארגון חדש"
                          value={newCompanyName}
                          onChange={(e) => setNewCompanyName(e.target.value)}
                          disabled={updatingCompanyName}
                          className="bg-white"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">
                          סיסמה לאימות
                        </label>
                        <Input
                          type="password"
                          placeholder="הזן את הסיסמה שלך"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={updatingCompanyName}
                          className="bg-white"
                        />
                      </div>

                      {updateError && (
                        <Alert className="bg-red-50 border-red-200">
                          <AlertDescription className="text-red-800">
                            {updateError}
                          </AlertDescription>
                        </Alert>
                      )}

                      {updateSuccess && (
                        <Alert className="bg-green-50 border-green-200">
                          <AlertDescription className="text-green-800 flex items-center gap-2">
                            <Check className="w-4 h-4" />
                            שם הארגון עודכן בהצלחה!
                          </AlertDescription>
                        </Alert>
                      )}

                      <Button
                        onClick={handleUpdateCompanyName}
                        disabled={
                          updatingCompanyName ||
                          !newCompanyName.trim() ||
                          !password
                        }
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                      >
                        {updatingCompanyName ? (
                          <>
                            <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                            מעדכן...
                          </>
                        ) : (
                          <>
                            <Lock className="w-4 h-4 ml-2" />
                            עדכן שם ארגון
                          </>
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: API Management & Integrations */}
        <div className="md:col-span-2 space-y-6">
          {/* Integrations Card */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50 border-b border-slate-100 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-600" />
                ניהול אינטגרציות
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-slate-300 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-green-50 rounded-lg border border-green-100">
                    <span className="text-green-600 font-bold text-lg">WA</span>
                    {/* Or use an icon if available */}
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">
                      Green API (WhatsApp)
                    </h4>
                    <p className="text-sm text-slate-500">
                      חיבור וואטסאפ ארגוני לשליחת הודעות
                    </p>
                  </div>
                </div>
                {isAdmin ? (
                  <Button
                    variant="outline"
                    className="bg-white hover:bg-slate-50 text-indigo-600 border-indigo-200 hover:border-indigo-300"
                    onClick={() => router.push("/profile/green-api")}
                  >
                    הגדרות
                  </Button>
                ) : (
                  <Badge
                    variant="secondary"
                    className="bg-slate-100 text-slate-500"
                  >
                    גישה לאדמין בלבד
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {isAdmin ? (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Key className="w-5 h-5 text-purple-600" />
                      ניהול מפתחות API
                    </CardTitle>
                    <CardDescription className="mt-1">
                      מפתחות גישה לחיבור מערכות חיצוניות (כמו Make/Zapier)
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                {/* Create New Key */}
                <div className="flex gap-3 items-end bg-slate-50 p-5 rounded-xl border border-slate-200">
                  <div className="flex-1 space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      צור מפתח חדש
                    </label>
                    <Input
                      placeholder="שם המפתח (לדוגמה: Make Integration)"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      className="bg-white"
                    />
                  </div>
                  <Button
                    onClick={handleCreateKey}
                    disabled={creating || !newKeyName}
                    className="bg-purple-600 hover:bg-purple-700 text-white min-w-[120px]"
                  >
                    {creating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-4 h-4 ml-1.5" />
                        צור מפתח
                      </>
                    )}
                  </Button>
                </div>

                {/* Keys List */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900">
                    מפתחות פעילים
                  </h3>

                  {loadingKeys ? (
                    <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <span className="text-sm">טוען מפתחות...</span>
                    </div>
                  ) : keys.length > 0 ? (
                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                      <Table>
                        <TableHeader className="bg-slate-50">
                          <TableRow>
                            <TableHead className="text-right w-[30%]">
                              שם
                            </TableHead>
                            <TableHead className="text-right w-[40%]">
                              מפתח
                            </TableHead>
                            <TableHead className="text-right">
                              נוצר בתאריך
                            </TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {keys.map((apiKey) => (
                            <TableRow
                              key={apiKey.id}
                              className="group hover:bg-slate-50/50"
                            >
                              <TableCell className="font-medium text-slate-900">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                  {apiKey.name}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2 bg-slate-100/50 p-1.5 rounded border border-slate-200/50 group-hover:bg-white group-hover:border-slate-300 transition-colors w-fit">
                                  <code className="text-xs font-mono text-slate-600">
                                    {apiKey.key.substring(0, 12)}...
                                  </code>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 hover:bg-slate-100"
                                    onClick={() => copyToClipboard(apiKey.key)}
                                  >
                                    {copiedKey === apiKey.key ? (
                                      <Check className="w-3 h-3 text-green-500" />
                                    ) : (
                                      <Copy className="w-3 h-3 text-slate-400" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell className="text-slate-500 text-sm">
                                {format(
                                  new Date(apiKey.createdAt),
                                  "dd/MM/yyyy",
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                                  onClick={() => handleDeleteKey(apiKey.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                      <Key className="w-10 h-10 text-slate-300 mb-2" />
                      <p className="text-slate-500 font-medium">
                        לא נמצאו מפתחות פעילים
                      </p>
                      <p className="text-xs text-slate-400">
                        צור מפתח חדש כדי להתחיל
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Alert className="bg-blue-50 border-blue-200 text-blue-800">
              <Lock className="w-4 h-4 text-blue-600" />
              <AlertTitle className="font-bold">אזור מוגבל</AlertTitle>
              <AlertDescription>
                ניהול מפתחות API זמין למנהלי מערכת (Admins) בלבד. אם אתה זקוק
                לגישה, אנא פנה למנהל הארגון שלך.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
