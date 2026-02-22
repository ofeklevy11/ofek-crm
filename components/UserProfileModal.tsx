"use client";

import { useState, useEffect } from "react";
import { User } from "@/lib/permissions";
import { showConfirm } from "@/hooks/use-modal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getApiKeys, createApiKey, deleteApiKey } from "@/app/actions/api-keys";
import { format } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";

interface UserProfileModalProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function UserProfileModal({
  user,
  open,
  onOpenChange,
}: UserProfileModalProps) {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const isAdmin = user.role === "admin";

  useEffect(() => {
    if (open && isAdmin) {
      loadKeys();
    }
  }, [open, isAdmin]);

  async function loadKeys() {
    setLoading(true);
    const res = await getApiKeys();
    if (res.success && res.data) {
      setKeys(res.data);
    }
    setLoading(false);
  }

  async function handleCreateKey() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await createApiKey(newKeyName);
      if (res.success && res.data) {
        toast.success("המפתח נוצר בהצלחה");
        setNewKeyName("");
        loadKeys();
      } else {
        toast.error(getUserFriendlyError(res.error || "שגיאה ביצירת מפתח"));
      }
    } catch (e) {
      toast.error(getUserFriendlyError(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteKey(id: number) {
    if (
      !(await showConfirm(
        "האם אתה בטוח שברצונך למחוק מפתח זה? פעולה זו תחסום כל שימוש קיים במפתח."
      ))
    )
      return;
    try {
      const res = await deleteApiKey(id);
      if (res.success) {
        toast.success("המפתח נמחק בהצלחה");
        loadKeys();
      } else {
        toast.error(getUserFriendlyError(res.error || "שגיאה במחיקת מפתח"));
      }
    } catch (e) {
      toast.error(getUserFriendlyError(e));
    }
  }

  async function copyToClipboard(text: string) {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      setCopiedKey(text);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <UserIcon className="w-6 h-6" />
            פרופיל משתמש
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-8 py-4">
          {/* User Details Section */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-500 flex items-center gap-1">
                <UserIcon className="w-3 h-3" /> שם מלא
              </label>
              <div className="font-semibold text-lg">{user.name}</div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-500 flex items-center gap-1">
                <Mail className="w-3 h-3" /> אימייל
              </label>
              <div className="font-mono text-sm bg-slate-100 px-2 py-1 rounded w-fit">
                {user.email}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-500 flex items-center gap-1">
                <Briefcase className="w-3 h-3" /> ארגון
              </label>
              <div className="font-medium">
                {user.company?.name || "לא משויך"}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-500 flex items-center gap-1">
                <Shield className="w-3 h-3" /> תפקיד
              </label>
              <div>
                <Badge variant={isAdmin ? "default" : "secondary"}>
                  {user.role === "admin"
                    ? "אדמין"
                    : user.role === "manager"
                      ? "מנהל"
                      : "משתמש"}
                </Badge>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-500 flex items-center gap-1">
                <Key className="w-3 h-3" /> מזהה משתמש
              </label>
              <div className="font-mono text-sm">{user.id}</div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-500 flex items-center gap-1">
                <Briefcase className="w-3 h-3" /> מזהה ארגון (Company ID)
              </label>
              <div className="font-mono text-sm bg-slate-100 px-2 py-1 rounded w-fit">
                {user.companyId}
              </div>
            </div>
          </div>

          {/* API Keys Section (Only for Admins) */}
          {isAdmin && (
            <div className="border-t pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Key className="w-5 h-5 text-purple-600" />
                    מפתחות API
                  </h3>
                  <p className="text-sm text-slate-500">
                    ניהול מפתחות גישה לחיבורים חיצוניים (כמו Make)
                  </p>
                </div>
              </div>

              <div className="flex gap-2 items-end bg-slate-50 p-4 rounded-lg border">
                <div className="flex-1 space-y-2">
                  <label className="text-sm font-medium">שם למפתח חדש</label>
                  <Input
                    placeholder="לדוגמה: חיבור ל-Make לידים"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleCreateKey}
                  disabled={creating || !newKeyName}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {creating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-1" />
                  )}
                  צור מפתח
                </Button>
              </div>

              {loading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : keys.length > 0 ? (
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-right">שם המפתח</TableHead>
                        <TableHead className="text-right">
                          מפתח (העתק בלחיצה)
                        </TableHead>
                        <TableHead className="text-right">
                          נוצר בתאריך
                        </TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {keys.map((apiKey) => (
                        <TableRow key={apiKey.id}>
                          <TableCell className="font-medium">
                            {apiKey.name}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <code className="bg-slate-100 px-2 py-1 rounded text-xs font-mono">
                                {apiKey.key.substring(0, 12)}...
                              </code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => copyToClipboard(apiKey.key)}
                              >
                                {copiedKey === apiKey.key ? (
                                  <Check className="w-3 h-3 text-green-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-500 text-sm">
                            {format(
                              new Date(apiKey.createdAt),
                              "dd/MM/yyyy HH:mm"
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
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
                <Alert>
                  <AlertTitle>אין מפתחות פעילים</AlertTitle>
                  <AlertDescription>
                    עדיין לא נוצרו מפתחות API עבור הארגון שלך.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
