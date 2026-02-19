"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Lock } from "lucide-react";
import Link from "next/link";
import { getUserFriendlyError } from "@/lib/errors";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "שגיאה בהתחברות");
      }

      window.location.href = "/";
    } catch (err: any) {
      setError(getUserFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">כתובת אימייל</Label>
          <div className="relative">
            <Mail className="absolute right-3 top-3 h-5 w-5 text-muted-foreground/50" />
            <Input
              id="email"
              name="email"
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
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">סיסמא</Label>
            <Link
              href="/forgot-password"
              prefetch={false}
              className="text-xs text-primary hover:text-primary/80 transition-colors hidden" // Hidden for now as requested simple login
            >
              שכחת סיסמא?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute right-3 top-3 h-5 w-5 text-muted-foreground/50" />
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 pr-10 bg-muted/30 border-muted-foreground/20 focus-visible:ring-primary/30 transition-all hover:bg-muted/50"
            />
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
        className="w-full h-12 text-base font-medium bg-linear-to-r from-primary to-secondary hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            מתחבר...
          </>
        ) : (
          "התחבר למערכת"
        )}
      </Button>

      <div className="text-center pt-2">
        <p className="text-sm text-muted-foreground">
          עדיין אין לך חשבון?{" "}
          <Link
            href="/register"
            prefetch={false}
            className="font-medium text-primary hover:text-secondary transition-colors"
          >
            פתח חשבון חדש
          </Link>
        </p>
      </div>
    </form>
  );
}
