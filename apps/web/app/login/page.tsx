"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../components/auth-provider';
import { loginWithGoogle } from '../../lib/api';

declare global {
  interface Window {
    google?: any;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { authed, login, authenticateFromCookie } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gLoading, setGLoading] = useState(false);

  useEffect(() => {
    if (authed) router.replace('/');
  }, [authed, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  // Load Google Identity Services script and render button
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;
    const scriptId = 'google-identity-services';
    if (document.getElementById(scriptId)) {
      // already loaded
      if (window.google?.accounts?.id) initGoogle();
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.id = scriptId;
    s.onload = () => initGoogle();
    document.head.appendChild(s);

    function initGoogle() {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: any) => {
          try {
            setGLoading(true);
            await loginWithGoogle(response.credential);
            await authenticateFromCookie();
            router.push('/');
          } catch (e: any) {
            setError(e.message || 'Google login failed');
          } finally {
            setGLoading(false);
          }
        },
      });
      const el = document.getElementById('google-button');
      if (el) {
        window.google.accounts.id.renderButton(el, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'left',
          width: 320,
        });
      }
    }
  }, [router, authenticateFromCookie]);

  return (
    <div className="w-full max-w-md rounded-lg border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-gray-600">Use your account to continue.</p>
      <div className="mt-4">
        <div id="google-button" className="flex justify-center" />
        {gLoading && <p className="mt-2 text-sm text-gray-600">Signing in with Google…</p>}
      </div>
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
        <div>
          <label className="block text-sm font-medium">Password</label>
          <input
            type="password"
            className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <div className="mt-2 text-right">
            <a href="/forgot-password" className="text-sm text-gray-700 underline">Forgot password?</a>
          </div>
        </div>
        {error && <p className="text-sm text-[#BC3836]">{error}</p>}
        <Button disabled={loading} className="w-full">{loading ? 'Signing in…' : 'Sign in'}</Button>
      </form>
      <p className="mt-4 text-sm text-gray-600">
        Don't have an account?{' '}
        <a href="/register" className="text-black underline">Register</a>
      </p>
    </div>
  );
}

