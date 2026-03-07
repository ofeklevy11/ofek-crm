"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Loader2, Mail, Lock, ArrowRight, Check } from "lucide-react";
import { getUserFriendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";

type Step = "email" | "verify" | "reset" | "done";

export default function ForgotPasswordForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function handleSendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "שגיאה");

      setStep("verify");
      setResendCooldown(60);
    } catch (err) {
      setError(getUserFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    if (otpCode.length !== 6) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/forgot-password/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: otpCode }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "שגיאה");

      setResetToken(data.resetToken);
      setStep("reset");
    } catch (err) {
      setError(getUserFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 10) {
      setError("הסיסמה חייבת להכיל לפחות 10 תווים");
      return;
    }
    if (password !== confirmPassword) {
      setError("הסיסמאות לא תואמות");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/forgot-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, password }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "שגיאה");

      setStep("done");
    } catch (err) {
      setError(getUserFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  if (step === "done") {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">הסיסמה אופסה בהצלחה!</h3>
        <p className="text-sm text-muted-foreground">
          כעת ניתן להתחבר עם הסיסמה החדשה.
        </p>
        <Link href="/login">
          <Button className="w-full mt-4 bg-linear-to-r from-primary to-secondary hover:opacity-90">
            חזרה להתחברות
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {step === "email" && (
        <form onSubmit={handleSendCode} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">כתובת אימייל</Label>
            <div className="relative">
              <Mail className="absolute right-3 top-3 h-5 w-5 text-muted-foreground/50" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 pr-10 bg-muted/30 border-muted-foreground/20 focus-visible:ring-primary/30 transition-all hover:bg-muted/50"
              />
            </div>
          </div>

          {error && (
            <div className="text-sm p-3 rounded-lg text-center bg-destructive/10 border border-destructive/20 text-destructive animate-in fade-in">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full h-12 text-base font-medium bg-linear-to-r from-primary to-secondary hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                שולח...
              </>
            ) : (
              "שלח קוד איפוס"
            )}
          </Button>
        </form>
      )}

      {step === "verify" && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">
              קוד אימות נשלח אל
            </p>
            <p className="font-medium text-foreground" dir="ltr">{email}</p>
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

          {error && (
            <div className="text-sm p-3 rounded-lg text-center bg-destructive/10 border border-destructive/20 text-destructive animate-in fade-in">
              {error}
            </div>
          )}

          <Button
            onClick={handleVerifyCode}
            disabled={loading || otpCode.length !== 6}
            className="w-full h-12 text-base font-medium bg-linear-to-r from-primary to-secondary hover:opacity-90"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                מאמת...
              </>
            ) : (
              "אמת קוד"
            )}
          </Button>

          <div className="text-center">
            <Button
              variant="ghost"
              size="sm"
              disabled={resendCooldown > 0 || loading}
              onClick={() => handleSendCode()}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {resendCooldown > 0
                ? `שלח שוב (${resendCooldown}s)`
                : "שלח קוד שוב"}
            </Button>
          </div>
        </div>
      )}

      {step === "reset" && (
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">סיסמה חדשה</Label>
            <div className="relative">
              <Lock className="absolute right-3 top-3 h-5 w-5 text-muted-foreground/50" />
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                placeholder="לפחות 10 תווים"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 pr-10 bg-muted/30 border-muted-foreground/20 focus-visible:ring-primary/30 transition-all hover:bg-muted/50"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">אימות סיסמה</Label>
            <div className="relative">
              <Lock className="absolute right-3 top-3 h-5 w-5 text-muted-foreground/50" />
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                placeholder="הזן שוב את הסיסמה"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11 pr-10 bg-muted/30 border-muted-foreground/20 focus-visible:ring-primary/30 transition-all hover:bg-muted/50"
              />
            </div>
          </div>

          {error && (
            <div className="text-sm p-3 rounded-lg text-center bg-destructive/10 border border-destructive/20 text-destructive animate-in fade-in">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || !password || !confirmPassword}
            className="w-full h-12 text-base font-medium bg-linear-to-r from-primary to-secondary hover:opacity-90"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                מאפס...
              </>
            ) : (
              "אפס סיסמה"
            )}
          </Button>
        </form>
      )}

      <div className="text-center">
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
        >
          <ArrowRight className="w-3.5 h-3.5" />
          חזרה להתחברות
        </Link>
      </div>
    </div>
  );
}
