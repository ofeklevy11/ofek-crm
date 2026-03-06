"use client";

import { useState, useEffect, useCallback } from "react";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Loader2, User, Mail, Lock, Building2, ArrowRight } from "lucide-react";
import { getUserFriendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";

const CODE_VALIDITY_SECONDS = 3600; // 1 hour

export default function RegisterForm() {
  const [step, setStep] = useState<"form" | "verify">("form");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    companyName: "",
    isNewCompany: true,
  });
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [countdown, setCountdown] = useState(CODE_VALIDITY_SECONDS);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Countdown timer for code expiry
  useEffect(() => {
    if (step !== "verify") return;
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [step, countdown]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const sendRegistration = useCallback(async () => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        companyName: formData.companyName,
        isNewCompany: true,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "שגיאה בהרשמה");
    return data;
  }, [formData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setIsRateLimited(false);

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
      const data = await sendRegistration();
      if (data.requiresVerification) {
        setStep("verify");
        setCountdown(CODE_VALIDITY_SECONDS);
        setResendCooldown(60);
      }
    } catch (err: any) {
      const msg = getUserFriendlyError(err);
      setIsRateLimited(/מדי (בקשות|פניות|ניסיונות)/i.test(msg));
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (otpCode.length !== 6) return;
    setLoading(true);
    setError("");
    setIsRateLimited(false);

    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email, code: otpCode }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאה באימות");

      window.location.href = "/";
    } catch (err: any) {
      const msg = getUserFriendlyError(err);
      setIsRateLimited(/מדי (בקשות|פניות|ניסיונות)/i.test(msg));
      setError(msg);
      setOtpCode("");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    setError("");

    try {
      await sendRegistration();
      setCountdown(CODE_VALIDITY_SECONDS);
      setResendCooldown(60);
      setOtpCode("");
    } catch (err: any) {
      const msg = getUserFriendlyError(err);
      setIsRateLimited(/מדי (בקשות|פניות|ניסיונות)/i.test(msg));
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (step === "verify") {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">אימות כתובת אימייל</h3>
          <p className="text-sm text-muted-foreground">
            שלחנו קוד בן 6 ספרות לכתובת{" "}
            <span className="font-medium text-foreground">{formData.email}</span>
          </p>
        </div>

        <div className="flex justify-center" dir="ltr">
          <InputOTP
            maxLength={6}
            value={otpCode}
            onChange={setOtpCode}
          >
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

        {countdown > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            הקוד תקף עוד {formatTime(countdown)}
          </p>
        )}
        {countdown <= 0 && (
          <p className="text-center text-xs text-destructive">
            הקוד פג תוקף. שלח קוד חדש.
          </p>
        )}

        {error && (
          <div className={cn(
            "text-sm p-3 rounded-lg text-center animate-in fade-in slide-in-from-top-1 border",
            isRateLimited
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-destructive/10 border-destructive/20 text-destructive"
          )}>
            {error}
          </div>
        )}

        <Button
          onClick={handleVerify}
          disabled={loading || otpCode.length !== 6 || countdown <= 0}
          className="w-full h-12 text-base font-medium bg-linear-to-r from-primary to-secondary hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              מאמת...
            </>
          ) : (
            "אימות והשלמת הרשמה"
          )}
        </Button>

        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setStep("form");
              setError("");
              setOtpCode("");
            }}
          >
            <ArrowRight className="mr-1 h-4 w-4" />
            חזרה
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResend}
            disabled={loading || resendCooldown > 0}
          >
            {resendCooldown > 0
              ? `שליחה חוזרת (${resendCooldown})`
              : "שלח קוד חדש"}
          </Button>
        </div>
      </div>
    );
  }

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
        <div className={cn(
          "text-sm p-3 rounded-lg text-center animate-in fade-in slide-in-from-top-1 border",
          isRateLimited
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-destructive/10 border-destructive/20 text-destructive"
        )}>
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
            שולח קוד אימות...
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
