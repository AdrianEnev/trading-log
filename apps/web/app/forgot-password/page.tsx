"use client";

import { useState } from "react";
import { Button } from "../../components/ui/button";
import { forgotPasswordCookie, checkEmailExists } from "../../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setSending(true);
    try {
      const exists = await checkEmailExists(email);
      if (!exists) {
        setError("No account found with that email address.");
        return;
      }
      await forgotPasswordCookie(email);
      setMessage("A password reset link has been sent. Please check your inbox.");
    } catch (e: any) {
      setError(e.message || "Failed to start password reset");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Forgot your password?</h1>
        <p className="mt-1 text-sm text-gray-600">
          Enter the email associated with your account and we'll send you a link to reset your password.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              type="email"
              className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-[#BC3836]">{error}</p>}
          {message && <p className="text-sm text-green-700">{message}</p>}
          <Button disabled={sending} className="w-full">
            {sending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
        <p className="mt-4 text-sm text-gray-600">
          Remembered your password? <a href="/login" className="text-black underline">Sign in</a>
        </p>
      </div>
    </main>
  );
}
