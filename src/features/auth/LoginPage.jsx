import { useState } from 'react';
import { C } from '../../theme';
import { signIn } from '../../lib/auth';
import { setRemember } from '../../lib/supabaseClient';

// ============================================================
//  LOGIN PAGE
//  Sign-in only. Accounts are created by the owner (invite-by-owner,
//  Phase 2) — there is no public sign-up.
// ============================================================
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [remember, setRememberMe] = useState(true);

  const submit = async () => {
    if (busy) return;
    setError('');
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setRemember(remember); // choose persistent vs session-only storage before signing in
    const res = await signIn(email, password);
    setBusy(false);
    // On success, the auth state change in App swaps this screen out — no
    // further action needed here. On failure, show the message.
    if (!res.ok) setError(res.error || 'Email or password is incorrect.');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') submit();
  };

  return (
    <div
      style={{ background: C.bone }}
      className="screen-h flex items-center justify-center p-6"
    >
      <div className="w-full max-w-md">
        {/* Brand mark */}
        <div className="text-center mb-8">
          <div className="mono mb-3" style={{ fontSize: '11px', letterSpacing: '0.14em', color: C.gold }}>
            BP · BUSTILLO PERFORMANCE
          </div>
          <div className="serif-italic" style={{ fontSize: '48px', lineHeight: 1.02, color: C.ink }}>
            BUILD THE<br />ATHLETE.
          </div>
          <div className="hand mt-3" style={{ fontSize: '17px', color: C.moss }}>
            — estructura, propósito y disciplina.
          </div>
        </div>

        {/* Card */}
        <div style={{ background: C.cream, border: `1px solid ${C.charcoal}30` }} className="p-6">
          <div className="mono mb-5" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
            SIGN IN
          </div>

          <div className="space-y-3" onKeyDown={onKeyDown}>
            <div>
              <label className="mono block mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
                EMAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                className="w-full px-3 py-2.5 text-sm"
                style={{ background: C.cream, color: C.ink, border: `1px solid ${C.charcoal}30` }}
              />
            </div>
            <div>
              <label className="mono block mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
                PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 text-sm"
                style={{ background: C.cream, color: C.ink, border: `1px solid ${C.charcoal}30` }}
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none pt-1" style={{ color: C.moss }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ accentColor: C.gold, width: 16, height: 16 }}
              />
              <span className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em' }}>REMEMBER ME · STAY SIGNED IN</span>
            </label>

            {error && (
              <div
                className="help text-center py-2"
                style={{ fontSize: '15px', color: C.gold, background: `${C.gold}15`, border: `1px solid ${C.gold}40` }}
              >
                — {error}
              </div>
            )}

            <button
              onClick={submit}
              disabled={busy}
              className="mono w-full py-3 mt-2"
              style={{
                fontSize: '12px',
                letterSpacing: '0.1em',
                background: C.ink,
                color: C.goldDeep,
                opacity: busy ? 0.6 : 1,
                cursor: busy ? 'default' : 'pointer',
              }}
            >
              {busy ? 'SIGNING IN…' : 'SIGN IN →'}
            </button>

            <div className="hand text-center mt-2" style={{ fontSize: '17px', color: C.moss }}>
              — las cuentas las crea tu coach. pídele acceso a Josean.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
