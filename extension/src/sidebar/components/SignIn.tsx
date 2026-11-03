import React, { useEffect, useRef, useState } from "react";
import { LogIn, UserPlus } from "lucide-react";

type Mode = "sign-in" | "sign-up" | "reset";

const COPY: Record<Mode, { title: string; button: string; busy: string }> = {
  "sign-in": { title: "Sign in to ClientLens", button: "Sign in", busy: "Signing in…" },
  "sign-up": { title: "Create your ClientLens account", button: "Create account", busy: "Creating account…" },
  reset: { title: "Reset your password", button: "Email me a reset link", busy: "Sending…" },
};

// Email and password sign-in for the side panel. Anyone can create an account;
// each account is its own workspace.
export function SignIn({ notice }: { notice?: string }) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(notice ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => { emailRef.current?.focus(); }, [mode]);

  const switchTo = (m: Mode) => { setMode(m); setError(null); setInfo(null); };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setInfo(null);
    const addr = email.trim();
    if (!addr) { setError("Enter your email."); return; }
    if (mode !== "reset" && password.length < 8) { setError("Use a password of at least 8 characters."); return; }
    setBusy(true);
    try {
      const { supabase } = await import("../../shared/utils/supabase");
      if (mode === "sign-in") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: addr, password });
        if (err) setError(err.message === "Invalid login credentials" ? "That email and password don't match." : err.message);
        // On success, onAuthStateChange in useAccount swaps this screen out.
      } else if (mode === "sign-up") {
        const { data, error: err } = await supabase.auth.signUp({ email: addr, password });
        if (err) setError(err.message);
        else if (!data.session) {
          setInfo("Check your email for a confirmation link, then come back and sign in.");
          setMode("sign-in");
        }
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(addr);
        if (err) setError(err.message);
        else setInfo("If that email has an account, a reset link is on its way.");
      }
    } catch {
      setError("Couldn't reach the sign-in service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const c = COPY[mode];
  const input = "w-full border border-line bg-surface-0 px-2.5 py-2 text-xs text-ink placeholder-ink-4 focus:outline-none focus:border-orange";

  return (
    <div className="flex h-screen items-start justify-center bg-surface-0 px-4 pt-16">
      <div className="w-full max-w-[340px] border border-line bg-surface-1">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <img src="icons/icon128.png" alt="" className="h-6 w-6" style={{ borderRadius: 5 }} />
          <h1 className="text-[13px] font-semibold text-ink">{c.title}</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-2.5 p-3" noValidate>
          <label className="block">
            <span className="mb-1 block text-[11px] text-ink-3">Email</span>
            <input ref={emailRef} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={input} />
          </label>
          {mode !== "reset" && (
            <label className="block">
              <span className="mb-1 block text-[11px] text-ink-3">Password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"} className={input} />
            </label>
          )}
          {error && <p role="alert" className="text-[11px] leading-relaxed text-red-500">{error}</p>}
          {info && <p role="status" className="text-[11px] leading-relaxed text-ink-3">{info}</p>}
          <button type="submit" disabled={busy}
            className="flex w-full items-center justify-center gap-1.5 bg-orange px-3 py-2 text-xs font-semibold text-black disabled:opacity-50">
            {mode === "sign-up" ? <UserPlus size={13} /> : <LogIn size={13} />}
            {busy ? c.busy : c.button}
          </button>
        </form>
        <div className="flex flex-wrap justify-between gap-2 border-t border-line px-3 py-2.5 text-[11px]">
          {mode === "sign-in" ? (
            <>
              <button type="button" onClick={() => switchTo("sign-up")} className="text-orange">Create an account</button>
              <button type="button" onClick={() => switchTo("reset")} className="text-ink-3">Forgot password?</button>
            </>
          ) : (
            <button type="button" onClick={() => switchTo("sign-in")} className="text-orange">Back to sign in</button>
          )}
        </div>
      </div>
    </div>
  );
}
