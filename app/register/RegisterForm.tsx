"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function RegisterForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    companyName: "",
    isNewCompany: true,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError("הסיסמאות אינן תואמות");
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError("הסיסמא חייבת להיות לפחות 6 תווים");
      setLoading(false);
      return;
    }

    if (formData.isNewCompany && !formData.companyName) {
      setError("אנא הזן שם ארגון");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          companyName: formData.companyName,
          isNewCompany: formData.isNewCompany,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "שגיאה בהרשמה");
      }

      // After successful registration, redirect to login or auto-login
      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">שם מלא</Label>
          <Input
            id="name"
            name="name"
            type="text"
            required
            placeholder="שם מלא"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">כתובת אימייל</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            placeholder="כתובת אימייל"
            value={formData.email}
            onChange={(e) =>
              setFormData({ ...formData, email: e.target.value })
            }
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">סיסמא</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            placeholder="סיסמא (לפחות 6 תווים)"
            value={formData.password}
            onChange={(e) =>
              setFormData({ ...formData, password: e.target.value })
            }
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">אימות סיסמא</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            placeholder="אימות סיסמא"
            value={formData.confirmPassword}
            onChange={(e) =>
              setFormData({ ...formData, confirmPassword: e.target.value })
            }
            className="h-11"
          />
        </div>

        <div className="pt-2">
          <Label className="mb-3 block text-base">הרשמה כ:</Label>
          <div className="flex items-center gap-2 p-4 border rounded-lg bg-muted/50">
            <input
              id="newCompany"
              name="companyType"
              type="checkbox"
              checked={formData.isNewCompany}
              readOnly
              className="h-4 w-4 text-primary focus:ring-primary border-input rounded"
            />
            <label
              htmlFor="newCompany"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              ארגון חדש - אני רוצה ליצור מערכת חדשה
            </label>
          </div>
        </div>

        {formData.isNewCompany && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <Label htmlFor="companyName">שם הארגון</Label>
            <Input
              id="companyName"
              name="companyName"
              type="text"
              required={formData.isNewCompany}
              placeholder="שם הארגון שלך"
              value={formData.companyName}
              onChange={(e) =>
                setFormData({ ...formData, companyName: e.target.value })
              }
              className="h-11"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="text-destructive text-sm text-center bg-destructive/10 p-3 rounded-lg border border-destructive/20">
          {error}
        </div>
      )}

      <div>
        <Button
          type="submit"
          disabled={loading}
          className="w-full h-12 text-base"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              נרשם...
            </>
          ) : (
            "הירשם"
          )}
        </Button>
      </div>

      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          כבר יש לך חשבון?{" "}
          <Link
            href="/login"
            className="font-medium text-primary hover:text-primary/90 transition-colors"
          >
            התחבר כאן
          </Link>
        </p>
      </div>
    </form>
  );
}
