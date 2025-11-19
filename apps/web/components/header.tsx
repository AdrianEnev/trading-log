"use client";

import Link from 'next/link';
import { useEffect } from 'react';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';

export default function Header() {
  const { authed, user, refresh, logout } = useAuth();

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  async function onLogout() {
    try {
      await logout();
    } finally {
      if (typeof window !== 'undefined') window.location.href = '/';
    }
  }

  return (
    <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <nav className="flex items-center gap-4">
          <Link href="/" className="font-semibold">Trading Log</Link>
        </nav>
        <div className="flex items-center gap-3">
          {authed && user ? (
            <>
              <Button size="sm" variant="secondary" asChild>
                <Link href="/account">Account</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={onLogout}>Logout</Button>
            </>
          ) : (
            <>
              <Button size="sm" asChild>
                <Link href="/login">Login</Link>
              </Button>
              <Button size="sm" variant="secondary" asChild>
                <Link href="/register">Register</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
