"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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

      router.push("/");
      router.refresh(); // Refresh to update auth state in UI
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
          <Label htmlFor="email-address">ktuvet email</Label>
          <Input
            id="email-address"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="כתובת אימייל"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">סיסמא</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="סיסמא"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12"
          />
        </div>
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
              מתחבר...
            </>
          ) : (
            "התחבר"
          )}
        </Button>
      </div>

      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          עדיין אין לך חשבון?{" "}
          <a
            href="/register"
            className="font-medium text-primary hover:text-primary/90 transition-colors"
          >
            הירשם כאן
          </a>
        </p>
      </div>
    </form>
  );
}
