"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "../../../components/ui/button";
import { resetPassword } from "../../../lib/api";

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // If no token present, surface a clear error
    if (!token) setError("Missing or invalid reset token. Please use the link from your email.");
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!token) {
      setError("Missing reset token.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setMessage("Your password has been reset. You can now sign in with your new password.");
      // Optionally redirect after a short delay
      setTimeout(() => router.push("/login"), 1200);
    } catch (e: any) {
      setError(e.message || "Failed to reset password. Your link may have expired.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="mt-1 text-sm text-gray-600">
          Enter a new password below. Your reset link will expire after a short time.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium">New password</label>
            <input
              type="password"
              className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Confirm new password</label>
            <input
              type="password"
              className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </div>
          {error && <p className="text-sm text-[#BC3836]">{error}</p>}
          {message && <p className="text-sm text-green-700">{message}</p>}
          <Button disabled={submitting || !token} className="w-full">
            {submitting ? "Resetting…" : "Reset password"}
          </Button>
        </form>

        <p className="mt-4 text-sm text-gray-600">
          Remembered your password? <a href="/login" className="text-black underline">Sign in</a>
        </p>
      </div>
    </main>
  );
}
