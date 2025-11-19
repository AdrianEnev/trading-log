"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/auth-provider';
import { forgotPasswordCookie, debugAuthBackend } from '../../lib/api';
import { Button } from '../../components/ui/button';

export default function AccountPage() {
  const router = useRouter();
  const { user, authed, loading } = useAuth();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any | null>(null);
  const [style, setStyle] = useState<'mono' | 'classic'>('classic');

  useEffect(() => {
    if (!loading && !authed) router.replace('/login');
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.debug('[AccountPage] auth state', { authed, loading, user });
    }
  }, [authed, loading, router, user]);

  async function onDebugAuth() {
    try {
      const info = await debugAuthBackend();
      setDebugInfo(info);
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.debug('[AccountPage] /debug/auth result', info);
      }
    } catch (e: any) {
      setDebugInfo({ error: e.message || String(e) });
    }
  }

  async function onResetPassword() {
    if (!user?.email) return;
    setSending(true);
    setMessage(null);
    setError(null);
    try {
      await forgotPasswordCookie(user.email);
      setMessage('If your email exists in our system, a password reset link has been sent.');
    } catch (e: any) {
      setError(e.message || 'Failed to start password reset');
    } finally {
      setSending(false);
    }
  }

  const handleStyleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStyle(e.target.value as 'mono' | 'classic');
  };

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">Account</h1>
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          {loading && <p>Loading...</p>}
          {!loading && user && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500">Name</p>
                <p className="text-base font-medium">{user.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="text-base font-medium">{user.email}</p>
              </div>
              <div className="pt-2 flex gap-2">
                <Button onClick={onResetPassword} disabled={sending}>
                  {sending ? 'Sending…' : 'Reset Password'}
                </Button>
                <Button type="button" variant="secondary" onClick={onDebugAuth}>
                  Debug auth
                </Button>
              </div>
              <div className="mt-4">
                <label htmlFor="style-select">Style:</label>
                <select id="style-select" value={style} onChange={handleStyleChange}>
                  <option value="classic">Classic</option>
                  <option value="mono">Mono</option>
                </select>
              </div>
              {message && (
                <p className={`text-sm text-green-700 ${style === 'mono' ? 'font-mono' : ''}`}>{message}</p>
              )}
              {error && (
                <p className={`text-sm text-[#BC3836] ${style === 'mono' ? 'font-mono' : ''}`}>{error}</p>
              )}
              {debugInfo && (
                <pre
                  className={`mt-4 max-h-64 overflow-auto rounded bg-gray-50 p-2 text-xs ${
                    style === 'mono' ? 'font-mono' : ''
                  } text-gray-700`}
                >
                  {JSON.stringify(debugInfo, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
