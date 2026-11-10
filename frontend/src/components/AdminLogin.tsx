import { useState } from 'react';
import type { FormEvent } from 'react';
import { Activity, LockKeyhole } from 'lucide-react';

interface AdminLoginProps { onAuthenticated: () => void; }

export function AdminLogin({ onAuthenticated }: AdminLoginProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify({ password }),
      });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Login failed'); }
      setPassword(''); onAuthenticated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to sign in'); }
    finally { setBusy(false); }
  };
  return <main className="min-h-screen bg-darkBg text-white flex items-center justify-center p-6">
    <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-darkBorder bg-darkSurface p-8 shadow-2xl">
      <div className="mb-6 flex items-center gap-3"><Activity className="text-neonGreen" size={26}/><div><h1 className="text-lg font-bold tracking-widest">NEXUS TERMINAL</h1><p className="text-xs text-gray-500">Single administrator access</p></div></div>
      <label htmlFor="admin-password" className="mb-2 block text-sm text-gray-300">Admin password</label>
      <div className="flex items-center gap-2 rounded-lg border border-darkBorder bg-darkBg px-3"><LockKeyhole size={16} className="text-gray-500"/><input id="admin-password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={event=>setPassword(event.target.value)} className="w-full bg-transparent py-3 text-sm outline-none" placeholder="Enter administrator password"/></div>
      {error && <p role="alert" className="mt-3 text-sm text-neonRed">{error}</p>}
      <button disabled={busy || !password} className="mt-5 w-full rounded-lg bg-neonGreen px-4 py-3 font-semibold text-black disabled:opacity-50">{busy ? 'SIGNING IN…' : 'SIGN IN'}</button>
    </form>
  </main>;
}
