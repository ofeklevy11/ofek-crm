"use client";

import { useState } from "react";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, User, Mail, Lock, Building2 } from "lucide-react";
import { getUserFriendlyError } from "@/lib/errors";

export default function RegisterForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    companyName: "",
    isNewCompany: true, // Always true for now as per logic
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

    if (formData.password.length < 10) {
      setError("הסיסמא חייבת להיות לפחות 10 תווים");
      setLoading(false);
      return;
    }

    if (!formData.companyName) {
      setError("אנא הזן שם חברה/ארגון");
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
          isNewCompany: true,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "שגיאה בהרשמה");
      }

      // After successful registration, redirect to login or auto-login
      window.location.href = "/";
    } catch (err: any) {
      setError(getUserFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-4">
        {/* Organization Section */}
        <div className="bg-muted/30 p-4 rounded-xl border border-muted-foreground/10 space-y-3">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            פרטי ארגון
          </h3>
          <div className="space-y-2">
            <Label htmlFor="companyName">שם החברה / ארגון</Label>
            <Input
              id="companyName"
              name="companyName"
              type="text"
              required
              placeholder="לדוגמה: אופק פתרונות תוכנה בע״מ"
              value={formData.companyName}
              onChange={(e) =>
                setFormData({ ...formData, companyName: e.target.value })
              }
              className="h-11 bg-background"
            />
          </div>
        </div>

        {/* User Section */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="name">שם מלא</Label>
            <div className="relative">
              <User className="absolute right-3 top-3 h-5 w-5 text-muted-foreground/50" />
              <Input
                id="name"
                name="name"
                type="text"
                required
                placeholder="שם משתמש מלא"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="h-11 pr-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">כתובת אימייל</Label>
            <div className="relative">
              <Mail className="absolute right-3 top-3 h-5 w-5 text-muted-foreground/50" />
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="name@company.com"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="h-11 pr-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="password">סיסמא</Label>
              <div className="relative">
                <Lock className="absolute right-3 top-3 h-5 w-5 text-muted-foreground/50" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  placeholder="******"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  className="h-11 pr-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">אימות סיסמא</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                placeholder="******"
                value={formData.confirmPassword}
                onChange={(e) =>
                  setFormData({ ...formData, confirmPassword: e.target.value })
                }
                className="h-11"
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-lg text-center animate-in fade-in slide-in-from-top-1">
          {error}
        </div>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="w-full h-12 text-base font-medium bg-linear-to-r from-primary to-secondary hover:opacity-90 transition-opacity shadow-lg shadow-primary/20 mt-2"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            יוצר חשבון...
          </>
        ) : (
          "סיום והרשמה"
        )}
      </Button>

      <div className="text-center pt-2">
        <p className="text-sm text-muted-foreground">
          כבר יש לך חשבון?{" "}
          <Link
            href="/login"
            prefetch={false}
            className="font-medium text-primary hover:text-secondary transition-colors"
          >
            התחבר כאן
          </Link>
        </p>
      </div>
    </form>
  );
}
