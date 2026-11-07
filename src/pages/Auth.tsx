import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearch } from '../lib/router';
import { useApp } from '../lib/store';
import { post, ApiError } from '../lib/api';
import { Button, Field, Icon } from '../components/ui';
import { Logo } from '../components/Brand';

const PERKS: [string, string][] = [['bolt', 'Instant delivery on automatic products'], ['wallet', 'One PKR wallet for every purchase'], ['shield', 'Encrypted deliveries and a full wallet ledger'], ['headset', 'Support tickets and WhatsApp help']];
const Shell = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => { const { brand } = useApp(); return (
  <div className="container-x grid min-h-[75vh] items-center py-10 lg:grid-cols-2 lg:gap-14">
    <div className="relative hidden overflow-hidden rounded-3xl bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 p-10 text-white lg:block">
      <div className="hero-grid absolute inset-0" aria-hidden="true" /><div className="absolute -bottom-16 -left-10 h-64 w-64 rounded-full bg-brand/40 blur-3xl" aria-hidden="true" />
      <div className="relative"><Logo size="lg" /><h2 className="mt-8 text-3xl font-bold leading-tight !text-white">{brand.tagline}</h2>
        <ul className="mt-8 space-y-4">{PERKS.map(([i, t]) => <li key={t} className="flex items-center gap-3 text-slate-200"><span className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-cyan2"><Icon name={i} className="h-5 w-5" /></span>{t}</li>)}</ul></div>
    </div>
    <div className="mx-auto w-full max-w-md"><div className="card p-7 sm:p-8"><div className="mb-6"><h1 className="text-2xl font-bold">{title}</h1>{sub && <p className="mt-1.5 text-sm text-slate-500">{sub}</p>}</div>{children}</div></div>
  </div>
); };
const dest = (sp: URLSearchParams, fallback: string) => { const n = sp.get('next'); return n && n.startsWith('/') && !n.startsWith('//') ? n : fallback; };

export function Login() {
  const { login } = useApp(); const nav = useNavigate(); const sp = useSearch(); const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(''); try { const m = await login(email, pw); nav(dest(sp, m.user?.isStaff ? '/admin' : '/dashboard'), true); } catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); } };
  return <Shell title="Welcome back" sub="Log in to your account"><form onSubmit={submit} className="space-y-4"><Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /><Field label="Password" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} />{err && <p role="alert" className="text-sm text-red-600">{err}</p>}<Button loading={busy} className="btn-primary w-full">Log in</Button><div className="flex justify-between text-sm"><Link to="/forgot-password" className="text-brand hover:underline">Forgot password?</Link><Link to="/register" className="text-brand hover:underline">Create account</Link></div></form></Shell>;
}
export function Register() {
  const { register } = useApp(); const nav = useNavigate(); const sp = useSearch(); const [f, setF] = useState({ name: '', email: '', phone: '', password: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(''); try { await register({ ...f, phone: f.phone || null }); nav(dest(sp, '/dashboard'), true); } catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); } };
  const s = (k: string) => ({ value: (f as any)[k], onChange: (e: any) => setF({ ...f, [k]: e.target.value }) });
  return <Shell title="Create your account" sub="Start shopping in under a minute"><form onSubmit={submit} className="space-y-4"><Field label="Full name" required autoComplete="name" {...s('name')} /><Field label="Email" type="email" required autoComplete="email" {...s('email')} /><Field label="Phone / WhatsApp (optional)" type="tel" autoComplete="tel" {...s('phone')} /><Field label="Password" type="password" required minLength={8} autoComplete="new-password" hint="At least 8 characters" {...s('password')} />{err && <p role="alert" className="text-sm text-red-600">{err}</p>}<Button loading={busy} className="btn-primary w-full">Create account</Button><p className="text-center text-sm text-slate-500">Already registered? <Link to="/login" className="text-brand hover:underline">Log in</Link></p></form></Shell>;
}
export function Forgot() {
  const [email, setEmail] = useState(''); const [done, setDone] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(''); try { await post('/auth/forgot', { email }); setDone(true); } catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); } };
  return <Shell title="Reset password" sub="We'll email you a reset link">{done ? <p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">If that email is registered, a reset link has been sent. It expires in 30 minutes.</p> : <form onSubmit={submit} className="space-y-4"><Field label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />{err && <p role="alert" className="text-sm text-red-600">{err}</p>}<Button loading={busy} className="btn-primary w-full">Send reset link</Button></form>}<p className="mt-4 text-center text-sm"><Link to="/login" className="text-brand hover:underline">Back to login</Link></p></Shell>;
}
export function Reset() {
  const sp = useSearch(); const nav = useNavigate(); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const { toast } = useApp();
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(''); try { await post('/auth/reset', { token: sp.get('token') ?? '', password: pw }); toast('Password updated. Please log in.'); nav('/login'); } catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); } };
  return <Shell title="Choose a new password"><form onSubmit={submit} className="space-y-4"><Field label="New password" type="password" required minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />{err && <p role="alert" className="text-sm text-red-600">{err}</p>}<Button loading={busy} className="btn-primary w-full">Update password</Button></form></Shell>;
}
export function VerifyEmail() {
  const sp = useSearch(); const { refresh } = useApp(); const [state, setState] = useState<'wait' | 'ok' | 'err'>('wait'); const [msg, setMsg] = useState('');
  useEffect(() => { post('/auth/verify-email', { token: sp.get('token') ?? '' }).then(() => { setState('ok'); refresh(); }).catch((e: ApiError) => { setState('err'); setMsg(e.message); }); }, []);
  return <Shell title="Email verification">{state === 'wait' ? <p className="text-center text-sm text-slate-500">Verifying…</p> : state === 'ok' ? <p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">Your email is verified. Thank you!</p> : <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{msg}</p>}<p className="mt-4 text-center text-sm"><Link to="/dashboard" className="text-brand hover:underline">Go to dashboard</Link></p></Shell>;
}
