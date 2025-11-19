export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

export const tokens = {
  get access() {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACCESS_KEY);
  },
  set access(v: string | null) {
    if (typeof window === 'undefined') return;
    if (v) localStorage.setItem(ACCESS_KEY, v);
    else localStorage.removeItem(ACCESS_KEY);
  },
  get refresh() {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_KEY);
  },
  set refresh(v: string | null) {
    if (typeof window === 'undefined') return;
    if (v) localStorage.setItem(REFRESH_KEY, v);
    else localStorage.removeItem(REFRESH_KEY);
  },
  clear() {
    this.access = null;
    this.refresh = null;
  },
};

export function isAuthed() {
  return typeof window !== 'undefined' && !!tokens.access;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = tokens.access;
  if (token) headers.set('Authorization', `Bearer ${token}`);

  if (typeof window !== 'undefined') {
    // Debug: log API calls and whether we have an access token
    // eslint-disable-next-line no-console
    console.debug('[apiFetch]', { path, API_URL, hasAccessToken: !!token });
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = { error: text || res.statusText }; }
    throw new Error(body.error?.message || body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Cookie-based fetch (for Google auth flow and subsequent session calls)
export async function apiFetchCookie<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include', cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = { error: text || res.statusText }; }
    throw new Error(body.error?.message || body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
};

// Trading types
export type TradeSide = 'long' | 'short';
export type TradeStatus = 'active' | 'closed';

export type TradeEntry = {
  entryPrice: number;
  amountInvestedUsd: number;
  leverage: number | null;
  entryDate: string;
};

export type TradeClose = {
  closePrice: number;
  closeCoinAmount: number;
  closeUsdAmount: number;
  closeDate: string;
  pnlUsd: number;
  pnlPercent: number;
};

export type TradeMetrics = {
  totalInitialMarginUsd: number;
  totalEntryCoin: number;
  openCoin: number;
  avgEntryPrice: number | null;
  effectiveLeverage: number | null;
  openNotionalUsd: number | null;
  openMarginUsd: number | null;
  debtUsd: number | null;
  realizedPnlUsd: number;
  realizedPnlPercent: number | null;
  liquidationPrice: number | null;
};

export type Trade = {
  id: string;
  coin: string;
  side: TradeSide;
  status: TradeStatus;
  comment: string | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  entries: TradeEntry[];
  closes: TradeClose[];
  metrics: TradeMetrics;
  createdAt: string;
  updatedAt: string;
};

export type TradesSummary = {
  totalPnlUsd: number;
  totalPnlPercent: number | null;
  totalInvestedUsd: number;
  totalTrades: number;
  winRate: number | null;
};

export async function login(email: string, password: string) {
  const data = await apiFetch<{ user: AuthUser; tokens: { accessToken: string; refreshToken: string } }>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) }
  );
  tokens.access = data.tokens.accessToken;
  tokens.refresh = data.tokens.refreshToken;
  return data.user;
}

export async function register(payload: { name: string; email: string; password: string; role?: 'admin' | 'user' }) {
  const data = await apiFetch<{ user: AuthUser; tokens: { accessToken: string; refreshToken: string } }>(
    '/auth/register',
    { method: 'POST', body: JSON.stringify(payload) }
  );
  tokens.access = data.tokens.accessToken;
  tokens.refresh = data.tokens.refreshToken;
  return data.user;
}

export function logout() {
  tokens.clear();
}

export async function me(): Promise<AuthUser> {
  return apiFetch<AuthUser>('/auth/me');
}

// Cookie session endpoints
export async function loginWithGoogle(idToken: string): Promise<{ message: string; isNewUser: boolean }>{
  const res = await apiFetchCookie<{ message: string; isNewUser: boolean }>(
    '/api/users/login/google',
    { method: 'POST', body: JSON.stringify({ idToken }) },
  );
  // After Google login, rely on cookie-based session; clear any stale header tokens
  tokens.clear();
  return res;
}

export async function meCookie(): Promise<AuthUser> {
  return apiFetchCookie<AuthUser>('/api/users/me');
}

export async function logoutCookie(): Promise<{ ok: true }> {
  return apiFetchCookie<{ ok: true }>(
    '/api/users/logout',
    { method: 'POST', body: JSON.stringify({}) }
  );
}

export async function logoutAllCookie(): Promise<{ ok: true }> {
  return apiFetchCookie<{ ok: true }>(
    '/api/users/logout/all',
    { method: 'POST', body: JSON.stringify({}) }
  );
}

export async function updateMe(payload: { name?: string }): Promise<AuthUser> {
  return apiFetch<AuthUser>('/auth/me', { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function deleteAccount(): Promise<{ ok: true }> {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  const token = tokens.access;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_URL}/auth/me`, { method: 'DELETE', headers, cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = { error: text || res.statusText }; }
    throw new Error(body.error?.message || body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Trades API
export async function getTrades(status: TradeStatus): Promise<Trade[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiFetch<Trade[]>(`/trades${query}`);
}

export async function getTradesSummary(): Promise<TradesSummary> {
  return apiFetch<TradesSummary>('/trades/summary');
}

export async function createActiveTrade(payload: {
  coin: string;
  side: TradeSide;
  entryPrice: number;
  amountInvestedUsd: number;
  leverage?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  entryDate?: string;
  comment?: string;
}): Promise<Trade> {
  return apiFetch<Trade>('/trades/active', { method: 'POST', body: JSON.stringify(payload) });
}

export async function createClosedTrade(payload: {
  coin: string;
  side: TradeSide;
  entryPrice: number;
  amountInvestedUsd: number;
  leverage?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  entryDate?: string;
  comment?: string;
  exitPrice: number;
  exitDate?: string;
}): Promise<Trade> {
  return apiFetch<Trade>('/trades/closed', { method: 'POST', body: JSON.stringify(payload) });
}

export async function editTrade(id: string, payload: {
  comment?: string | null;
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
  coin?: string;
  side?: TradeSide;
  entryPrice?: number;
  amountInvestedUsd?: number;
  leverage?: number | null;
  entryDate?: string;
  exitPrice?: number;
  exitDate?: string;
}): Promise<Trade> {
  return apiFetch<Trade>(`/trades/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function addTradeSize(id: string, payload: {
  entryPrice: number;
  amountInvestedUsd: number;
  leverage?: number;
  entryDate?: string;
}): Promise<Trade> {
  return apiFetch<Trade>(`/trades/${id}/add-size`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function sellTradePosition(id: string, payload: {
  closePrice: number;
  closeDate?: string;
  amountCoin?: number;
  amountUsd?: number;
  percentage?: number;
}): Promise<Trade> {
  return apiFetch<Trade>(`/trades/${id}/sell`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function deleteTrade(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/trades/${id}`, { method: 'DELETE' });
}

// Password reset helpers
export async function forgotPasswordCookie(email: string): Promise<{ ok: true }> {
  return apiFetchCookie<{ ok: true }>(`/auth/forgot-password`, { method: 'POST', body: JSON.stringify({ email }) });
}

export async function resetPassword(token: string, password: string): Promise<{ ok: true }> {
  // This endpoint does not require auth; cookie not required
  return apiFetchCookie<{ ok: true }>(`/auth/reset-password`, { method: 'POST', body: JSON.stringify({ token, password }) });
}

export async function checkEmailExists(email: string): Promise<boolean> {
  const res = await apiFetch<{ exists: boolean }>(`/auth/check-email`, { method: 'POST', body: JSON.stringify({ email }) });
  return !!res.exists;
}

// Debug helpers
export async function debugAuthBackend(): Promise<any> {
  return apiFetchCookie('/debug/auth');
}
