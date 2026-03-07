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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
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
  Pencil,
  AlertTriangle,
  Bell,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getApiKeys, createApiKey, deleteApiKey } from "@/app/actions/api-keys";
import { updateCompanyName } from "@/app/actions/update-company-name";
import { getBusinessSettings, updateBusinessSettings, type BusinessSettings } from "@/app/actions/business-settings";
import { requestEmailChange, verifyEmailChange } from "@/app/actions/change-email";
import { getNotificationSettings, updateNotificationSettings } from "@/app/actions/notification-settings";
import type { NotificationSettings } from "@/lib/notification-settings";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import GreenApiConnection from "./GreenApiConnection";
import { getFriendlyResultError, getUserFriendlyError } from "@/lib/errors";
import { showDestructiveConfirm } from "@/hooks/use-modal";
import { toast } from "sonner";
import { isRateLimitError, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit-utils";

interface ProfileContentProps {
  user: User;
}

export default function ProfileContent({ user }: ProfileContentProps) {
  const [keys, setKeys] = useState<any[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [newFullKey, setNewFullKey] = useState<string | null>(null);

  // Company name update states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [password, setPassword] = useState("");
  const [updatingCompanyName, setUpdatingCompanyName] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  // Change name states
  const [isNameDialogOpen, setIsNameDialogOpen] = useState(false);
  const [newName, setNewName] = useState(user.name);
  const [updatingName, setUpdatingName] = useState(false);

  // Change password states
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Change email states
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailStep, setEmailStep] = useState<"form" | "verify">("form");
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [updatingEmail, setUpdatingEmail] = useState(false);

  // Business settings states
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [loadingBusiness, setLoadingBusiness] = useState(false);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [businessForm, setBusinessForm] = useState({
    businessType: "",
    taxId: "",
    businessAddress: "",
    businessWebsite: "",
    businessEmail: "",
  });

  // Delete account states
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Notification settings states
  const [notifSettings, setNotifSettings] = useState<NotificationSettings | null>(null);
  const [loadingNotif, setLoadingNotif] = useState(false);

  const isAdmin = user.role === "admin";
  const router = useRouter();

  useEffect(() => {
    if (isAdmin) {
      loadKeys();
      loadBusinessSettings();
      loadNotificationSettings();
    }
  }, [isAdmin]);

  async function loadKeys() {
    setLoadingKeys(true);
    try {
      const res = await getApiKeys();
      if (res.success && res.data) {
        setKeys(res.data);
      }
    } catch (err: any) {
      if (isRateLimitError(err)) toast.error(RATE_LIMIT_MESSAGE);
      else toast.error(getUserFriendlyError(err));
    } finally {
      setLoadingKeys(false);
    }
  }

  async function loadBusinessSettings() {
    setLoadingBusiness(true);
    try {
      const settings = await getBusinessSettings();
      if (settings) {
        setBusinessSettings(settings);
        setBusinessForm({
          businessType: settings.businessType || "",
          taxId: settings.taxId || "",
          businessAddress: settings.businessAddress || "",
          businessWebsite: settings.businessWebsite || "",
          businessEmail: settings.businessEmail || "",
        });
      }
    } catch (err) {
      toast.error(getUserFriendlyError(err));
    } finally {
      setLoadingBusiness(false);
    }
  }

  async function loadNotificationSettings() {
    setLoadingNotif(true);
    try {
      const res = await getNotificationSettings();
      if (res.success && res.data) {
        setNotifSettings(res.data);
      }
    } catch (err) {
      toast.error(getUserFriendlyError(err));
    } finally {
      setLoadingNotif(false);
    }
  }

  async function handleToggleNotifSetting(key: keyof NotificationSettings, value: boolean) {
    if (!notifSettings) return;
    const prev = { ...notifSettings };
    setNotifSettings({ ...notifSettings, [key]: value });
    try {
      const res = await updateNotificationSettings({ [key]: value });
      if (!res.success) {
        setNotifSettings(prev);
        toast.error(res.error || "שגיאה בעדכון ההגדרה");
      }
    } catch (err) {
      setNotifSettings(prev);
      toast.error(getUserFriendlyError(err));
    }
  }

  async function handleCreateKey() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await createApiKey(newKeyName);
      if (res.success && res.data) {
        setNewFullKey(res.data.fullKey);
        setNewKeyName("");
        toast.success("המפתח נוצר בהצלחה");
        await loadKeys();
      } else {
        toast.error(getFriendlyResultError(res.error, "שגיאה ביצירת מפתח"));
      }
    } catch (e) {
      toast.error(getUserFriendlyError(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteKey(id: number) {
    if (
      !(await showDestructiveConfirm({
        title: "מחיקת מפתח API",
        message: "האם אתה בטוח שברצונך למחוק מפתח API זה?",
        confirmationPhrase: "מחק",
      }))
    )
      return;

    const res = await deleteApiKey(id);
    if (res.success) {
      toast.success("המפתח נמחק בהצלחה");
      await loadKeys();
      router.refresh();
    } else {
      toast.error(getFriendlyResultError(res.error, "שגיאה במחיקת מפתח"));
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
        toast.success("שם הארגון עודכן בהצלחה");
        setUpdateSuccess(true);
        setNewCompanyName("");
        setPassword("");
        router.refresh();
        setTimeout(() => {
          setUpdateSuccess(false);
          setIsDialogOpen(false);
        }, 1500);
      } else {
        setUpdateError(res.error || "שגיאה לא ידועה");
      }
    } catch (error) {
      setUpdateError("שגיאה בעדכון שם הארגון");
      toast.error(getUserFriendlyError(error));
    } finally {
      setUpdatingCompanyName(false);
    }
  }

  async function handleUpdateName() {
    if (!newName.trim() || newName.trim() === user.name) return;
    setUpdatingName(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "שגיאה בעדכון השם");
      }
      toast.success("השם עודכן בהצלחה");
      setIsNameDialogOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(getUserFriendlyError(err));
    } finally {
      setUpdatingName(false);
    }
  }

  async function handleChangePassword() {
    setPasswordError(null);
    if (newPassword.length < 10) {
      setPasswordError("הסיסמה חייבת להכיל לפחות 10 תווים");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError("הסיסמאות לא תואמות");
      return;
    }

    setUpdatingPassword(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ password: newPassword, currentPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "שגיאה בשינוי הסיסמה");
      }
      toast.success("הסיסמה שונתה בהצלחה. מתנתק...");
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    } catch (err) {
      setPasswordError(getUserFriendlyError(err));
    } finally {
      setUpdatingPassword(false);
    }
  }

  async function handleRequestEmailChange() {
    setEmailError(null);
    if (!newEmail.trim() || !emailPassword) {
      setEmailError("נא למלא את כל השדות");
      return;
    }

    setUpdatingEmail(true);
    try {
      const res = await requestEmailChange(newEmail.trim(), emailPassword);
      if (res.success) {
        setEmailStep("verify");
      } else {
        setEmailError(res.error || "שגיאה");
      }
    } catch (err) {
      setEmailError(getUserFriendlyError(err));
    } finally {
      setUpdatingEmail(false);
    }
  }

  async function handleVerifyEmailChange() {
    if (emailOtp.length !== 6) return;

    setEmailError(null);
    setUpdatingEmail(true);
    try {
      const res = await verifyEmailChange(emailOtp);
      if (res.success) {
        toast.success("כתובת האימייל עודכנה בהצלחה");
        setIsEmailDialogOpen(false);
        resetEmailDialog();
        router.refresh();
      } else {
        setEmailError(res.error || "שגיאה");
      }
    } catch (err) {
      setEmailError(getUserFriendlyError(err));
    } finally {
      setUpdatingEmail(false);
    }
  }

  function resetEmailDialog() {
    setEmailStep("form");
    setNewEmail("");
    setEmailPassword("");
    setEmailOtp("");
    setEmailError(null);
  }

  async function handleSaveBusinessSettings() {
    setSavingBusiness(true);
    try {
      await updateBusinessSettings({
        name: businessSettings?.name || user.company?.name || "",
        businessType: businessForm.businessType,
        taxId: businessForm.taxId,
        businessAddress: businessForm.businessAddress,
        businessWebsite: businessForm.businessWebsite || undefined,
        businessEmail: businessForm.businessEmail || undefined,
      });
      toast.success("פרטי העסק עודכנו בהצלחה");
      await loadBusinessSettings();
    } catch (err) {
      toast.error(getUserFriendlyError(err));
    } finally {
      setSavingBusiness(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deletePassword) {
      setDeleteError("נא להזין סיסמה");
      return;
    }

    setDeleteError(null);
    setDeletingAccount(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאה במחיקת החשבון");

      toast.success("החשבון נמחק בהצלחה");
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    } catch (err) {
      setDeleteError(getUserFriendlyError(err));
    } finally {
      setDeletingAccount(false);
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
          <div className="flex items-center justify-center md:justify-start gap-2">
            <h1 className="text-3xl font-bold text-slate-900">{user.name}</h1>
            <Dialog open={isNameDialogOpen} onOpenChange={(open) => {
              setIsNameDialogOpen(open);
              if (open) setNewName(user.name);
            }}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
                  <Pencil className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                  <DialogTitle>שינוי שם</DialogTitle>
                  <DialogDescription>עדכן את השם שלך במערכת.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <Input
                    placeholder="שם מלא"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={updatingName}
                    className="bg-white"
                  />
                  <Button
                    onClick={handleUpdateName}
                    disabled={updatingName || !newName.trim() || newName.trim() === user.name}
                    className="w-full"
                  >
                    {updatingName ? (
                      <><Loader2 className="w-4 h-4 ml-2 animate-spin" />מעדכן...</>
                    ) : "עדכן שם"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
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
                  <DialogContent className="sm:max-w-[425px]">
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

          {/* Business Details (Admin Only) */}
          {isAdmin && (
            <Card className="border-slate-200 shadow-sm overflow-hidden">
              <CardHeader className="bg-slate-50 border-b border-slate-100 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-blue-600" />
                  פרטי עסק
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                {loadingBusiness ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">סוג עסק</label>
                      <Select
                        value={businessForm.businessType}
                        onValueChange={(v) => setBusinessForm((p) => ({ ...p, businessType: v }))}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="בחר סוג עסק" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="exempt">עוסק פטור</SelectItem>
                          <SelectItem value="licensed">עוסק מורשה</SelectItem>
                          <SelectItem value="ltd">חברה בע&quot;מ</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">ח.פ / מספר עוסק</label>
                      <Input
                        placeholder="מספר עוסק או ח.פ"
                        value={businessForm.taxId}
                        onChange={(e) => setBusinessForm((p) => ({ ...p, taxId: e.target.value }))}
                        className="bg-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">כתובת עסק</label>
                      <Input
                        placeholder="כתובת העסק"
                        value={businessForm.businessAddress}
                        onChange={(e) => setBusinessForm((p) => ({ ...p, businessAddress: e.target.value }))}
                        className="bg-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">אתר אינטרנט (אופציונלי)</label>
                      <Input
                        placeholder="https://example.com"
                        value={businessForm.businessWebsite}
                        onChange={(e) => setBusinessForm((p) => ({ ...p, businessWebsite: e.target.value }))}
                        className="bg-white"
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">אימייל עסקי (אופציונלי)</label>
                      <Input
                        placeholder="info@example.com"
                        value={businessForm.businessEmail}
                        onChange={(e) => setBusinessForm((p) => ({ ...p, businessEmail: e.target.value }))}
                        className="bg-white"
                        dir="ltr"
                      />
                    </div>
                    <Button
                      onClick={handleSaveBusinessSettings}
                      disabled={savingBusiness}
                      className="w-full"
                    >
                      {savingBusiness ? (
                        <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר...</>
                      ) : "שמור פרטי עסק"}
                    </Button>
                  </>
                )}
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
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-slate-300 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-green-50 rounded-lg border border-green-100">
                      <span className="text-green-600 font-bold text-lg">WA</span>
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

                <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-slate-300 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-green-50 rounded-lg border border-green-100">
                      <span className="text-green-600 font-bold text-lg">WB</span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900">
                        WhatsApp Business (Cloud API)
                      </h4>
                      <p className="text-sm text-slate-500">
                        חיבור WhatsApp רשמי דרך Meta Business
                      </p>
                    </div>
                  </div>
                  {isAdmin ? (
                    <Button
                      variant="outline"
                      className="bg-white hover:bg-slate-50 text-indigo-600 border-indigo-200 hover:border-indigo-300"
                      onClick={() => router.push("/profile/whatsapp")}
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

                {/* Show full key once after creation */}
                {newFullKey && (
                  <Alert className="bg-green-50 border-green-300">
                    <Key className="w-4 h-4 text-green-600" />
                    <AlertTitle className="text-green-800">
                      המפתח נוצר בהצלחה
                    </AlertTitle>
                    <AlertDescription className="space-y-3">
                      <p className="text-sm text-green-700 font-medium">
                        העתק את המפתח עכשיו — לא תוכל לראות אותו שוב!
                      </p>
                      <div className="flex items-center gap-2 bg-white p-3 rounded-lg border border-green-200">
                        <code className="text-xs font-mono text-slate-800 flex-1 break-all select-all" dir="ltr">
                          {newFullKey}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => copyToClipboard(newFullKey)}
                        >
                          {copiedKey === newFullKey ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4 text-slate-500" />
                          )}
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => setNewFullKey(null)}
                      >
                        הבנתי, העתקתי
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

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

      {/* Notification Settings (admin only) */}
      {isAdmin && (
        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50 border-b border-slate-100 pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-600" />
              הגדרות התראות
            </CardTitle>
            <CardDescription>שליטה בהתראות אוטומטיות והתנהגויות מערכת</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {loadingNotif || !notifSettings ? (
              <div className="flex items-center justify-center py-8 text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-sm">טוען הגדרות...</span>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Meetings section */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900 border-b border-slate-100 pb-2">פגישות</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-800 text-sm">התראה על פגישה חדשה</p>
                        <p className="text-xs text-slate-500">כשלקוח קובע פגישה</p>
                      </div>
                      <Switch checked={notifSettings.notifyOnMeetingBooked} onCheckedChange={(v) => handleToggleNotifSetting("notifyOnMeetingBooked", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-800 text-sm">התראה על ביטול פגישה</p>
                        <p className="text-xs text-slate-500">כשפגישה מבוטלת</p>
                      </div>
                      <Switch checked={notifSettings.notifyOnMeetingCancelled} onCheckedChange={(v) => handleToggleNotifSetting("notifyOnMeetingCancelled", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-800 text-sm">התראה על דחיית פגישה</p>
                        <p className="text-xs text-slate-500">כשפגישה נדחית</p>
                      </div>
                      <Switch checked={notifSettings.notifyOnMeetingRescheduled} onCheckedChange={(v) => handleToggleNotifSetting("notifyOnMeetingRescheduled", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-800 text-sm">התראה על שינוי סטטוס פגישה</p>
                        <p className="text-xs text-slate-500">כששינוי סטטוס פגישה ידני</p>
                      </div>
                      <Switch checked={notifSettings.notifyOnMeetingStatusChange} onCheckedChange={(v) => handleToggleNotifSetting("notifyOnMeetingStatusChange", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-800 text-sm">יצירת לקוח אוטומטית בקביעת פגישה</p>
                        <p className="text-xs text-slate-500">יוצר לקוח חדש כשלקוח קובע פגישה</p>
                      </div>
                      <Switch checked={notifSettings.autoCreateClientOnBooking} onCheckedChange={(v) => handleToggleNotifSetting("autoCreateClientOnBooking", v)} />
                    </div>
                  </div>
                </div>

                {/* Tickets section */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900 border-b border-slate-100 pb-2">קריאות שירות</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-800 text-sm">התראה על הקצאת קריאה</p>
                        <p className="text-xs text-slate-500">כשקריאה חדשה מוקצית</p>
                      </div>
                      <Switch checked={notifSettings.notifyOnTicketAssigned} onCheckedChange={(v) => handleToggleNotifSetting("notifyOnTicketAssigned", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-800 text-sm">התראה על שינוי הקצאה</p>
                        <p className="text-xs text-slate-500">כשקריאה מועברת למשתמש אחר</p>
                      </div>
                      <Switch checked={notifSettings.notifyOnTicketReassigned} onCheckedChange={(v) => handleToggleNotifSetting("notifyOnTicketReassigned", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-800 text-sm">התראה על תגובה בקריאה</p>
                        <p className="text-xs text-slate-500">כשמישהו מגיב בקריאה</p>
                      </div>
                      <Switch checked={notifSettings.notifyOnTicketComment} onCheckedChange={(v) => handleToggleNotifSetting("notifyOnTicketComment", v)} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Account Settings (full width) */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50 border-b border-slate-100 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Lock className="w-5 h-5 text-slate-600" />
            הגדרות חשבון
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            {/* Change Password */}
            <Dialog open={isPasswordDialogOpen} onOpenChange={(open) => {
              setIsPasswordDialogOpen(open);
              if (!open) {
                setCurrentPassword("");
                setNewPassword("");
                setConfirmNewPassword("");
                setPasswordError(null);
              }
            }}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Lock className="w-4 h-4" />
                  שינוי סיסמה
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>שינוי סיסמה</DialogTitle>
                  <DialogDescription>
                    לאחר שינוי הסיסמה תתנתק מכל המכשירים.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">סיסמה נוכחית</label>
                    <Input
                      type="password"
                      placeholder="הזן סיסמה נוכחית"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      disabled={updatingPassword}
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">סיסמה חדשה</label>
                    <Input
                      type="password"
                      placeholder="לפחות 10 תווים"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={updatingPassword}
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">אימות סיסמה חדשה</label>
                    <Input
                      type="password"
                      placeholder="הזן שוב את הסיסמה החדשה"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      disabled={updatingPassword}
                      className="bg-white"
                    />
                  </div>

                  {passwordError && (
                    <Alert className="bg-red-50 border-red-200">
                      <AlertDescription className="text-red-800">{passwordError}</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    onClick={handleChangePassword}
                    disabled={updatingPassword || !currentPassword || !newPassword || !confirmNewPassword}
                    className="w-full"
                  >
                    {updatingPassword ? (
                      <><Loader2 className="w-4 h-4 ml-2 animate-spin" />מעדכן...</>
                    ) : "שנה סיסמה"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Change Email */}
            <Dialog open={isEmailDialogOpen} onOpenChange={(open) => {
              setIsEmailDialogOpen(open);
              if (!open) resetEmailDialog();
            }}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Mail className="w-4 h-4" />
                  שינוי אימייל
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>שינוי כתובת אימייל</DialogTitle>
                  <DialogDescription>
                    {emailStep === "form"
                      ? "הזן את כתובת האימייל החדשה ואת הסיסמה שלך."
                      : "הזן את קוד האימות שנשלח לאימייל החדש."}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  {emailStep === "form" ? (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">אימייל נוכחי</label>
                        <div className="p-3 bg-slate-50 rounded-md border border-slate-200 text-slate-700 text-sm" dir="ltr">
                          {user.email}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">אימייל חדש</label>
                        <Input
                          type="email"
                          placeholder="new@email.com"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          disabled={updatingEmail}
                          className="bg-white"
                          dir="ltr"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">סיסמה לאימות</label>
                        <Input
                          type="password"
                          placeholder="הזן את הסיסמה שלך"
                          value={emailPassword}
                          onChange={(e) => setEmailPassword(e.target.value)}
                          disabled={updatingEmail}
                          className="bg-white"
                        />
                      </div>

                      {emailError && (
                        <Alert className="bg-red-50 border-red-200">
                          <AlertDescription className="text-red-800">{emailError}</AlertDescription>
                        </Alert>
                      )}

                      <Button
                        onClick={handleRequestEmailChange}
                        disabled={updatingEmail || !newEmail.trim() || !emailPassword}
                        className="w-full"
                      >
                        {updatingEmail ? (
                          <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שולח...</>
                        ) : "שלח קוד אימות"}
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-1">קוד אימות נשלח אל</p>
                        <p className="font-medium" dir="ltr">{newEmail}</p>
                      </div>

                      <div className="flex justify-center" dir="ltr">
                        <InputOTP maxLength={6} value={emailOtp} onChange={setEmailOtp}>
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>

                      {emailError && (
                        <Alert className="bg-red-50 border-red-200">
                          <AlertDescription className="text-red-800">{emailError}</AlertDescription>
                        </Alert>
                      )}

                      <Button
                        onClick={handleVerifyEmailChange}
                        disabled={updatingEmail || emailOtp.length !== 6}
                        className="w-full"
                      >
                        {updatingEmail ? (
                          <><Loader2 className="w-4 h-4 ml-2 animate-spin" />מאמת...</>
                        ) : "אמת ושנה אימייל"}
                      </Button>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone (full width) */}
      <Card className="border-red-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-red-50 border-b border-red-100 pb-4">
          <CardTitle className="text-lg flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            אזור מסוכן
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-slate-900">מחיקת חשבון</h4>
              <p className="text-sm text-slate-500">מחיקת החשבון היא בלתי הפיכה. כל הנתונים שלך יימחקו לצמיתות.</p>
            </div>
            <Button
              variant="destructive"
              className="shrink-0"
              onClick={async () => {
                const confirmed = await showDestructiveConfirm({
                  title: "מחיקת חשבון",
                  message: "פעולה זו בלתי הפיכה. כל הנתונים שלך יימחקו לצמיתות.",
                  confirmationPhrase: "מחק את החשבון",
                });
                if (confirmed) setIsDeleteDialogOpen(true);
              }}
            >
              מחק חשבון
            </Button>
            <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => {
              setIsDeleteDialogOpen(open);
              if (!open) {
                setDeletePassword("");
                setDeleteError(null);
              }
            }}>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle className="text-red-700 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    אישור מחיקת חשבון
                  </DialogTitle>
                  <DialogDescription>
                    הזן את הסיסמה שלך כדי לאשר את מחיקת החשבון.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <Input
                    type="password"
                    placeholder="הזן את הסיסמה שלך"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    disabled={deletingAccount}
                    className="bg-white"
                  />

                  {deleteError && (
                    <Alert className="bg-red-50 border-red-200">
                      <AlertDescription className="text-red-800">{deleteError}</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    variant="destructive"
                    onClick={handleConfirmDelete}
                    disabled={deletingAccount || !deletePassword}
                    className="w-full"
                  >
                    {deletingAccount ? (
                      <><Loader2 className="w-4 h-4 ml-2 animate-spin" />מוחק...</>
                    ) : "מחק את החשבון לצמיתות"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
