import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import { fetchMyProfile, signOut } from './lib/auth';
import { C } from './theme';
import LoginPage from './features/auth/LoginPage';
import { FeedbackProvider } from './components/FeedbackProvider';
import { DataProvider } from './data/DataProvider';
import Shell from './components/Shell';
import PullToRefresh from './components/PullToRefresh';
import { hayEdicionAbierta } from './lib/editing';
import { hayCheckoutAbierto } from './lib/pendingCheckout';
import { marcarRecargaPorUpdate } from './lib/coldStart';

/* global __BUILD_ID__ */
// Auto-update: pick up a newer deployed build without the user running a stale
// version. But NEVER reload while the client is mid-workout — a reload there
// throws them back to the top (they reported this when switching apps and back).
// So we only reload at a safe moment. The pending update just waits and applies
// on the next safe check.
//
// Tampoco encima de un pago a medias. Este caso es peor que el de la rutina:
// el comprobador corre al volver a la app — justo cuando alguien regresa de
// leer los Términos que abrió desde el formulario de Stripe — y recargar ahí
// tira el checkout en el momento exacto en que la persona iba a pagar.
function isSafeToReload() {
  try {
    if (localStorage.getItem('bp-client-open')) return false;
    if (hayCheckoutAbierto()) return false;
    if (hayEdicionAbierta()) return false; // el coach esta a medio editar un programa o una rutina
    return true;
  } catch { return true; }
}
function useAutoUpdate() {
  useEffect(() => {
    const current = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : null;
    let stopped = false;
    const check = async () => {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const { build } = await res.json();
        if (!stopped && build && current && build !== current && isSafeToReload()) {
          // Se deja dicho que esta recarga la pidió la app, no la persona: al
          // volver a montar, Shell la devuelve a donde iba en vez de al tope.
          marcarRecargaPorUpdate();
          window.location.reload();
        }
      } catch { /* offline or file missing — ignore */ }
    };
    check();
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    const id = setInterval(check, 5 * 60 * 1000);
    return () => { stopped = true; document.removeEventListener('visibilitychange', onVis); clearInterval(id); };
  }, []);
}

// ============================================================
//  APP ROOT
//  Login gate + session/role handling. Once signed in, the data store
//  hydrates and the Shell renders the role-appropriate app.
// ============================================================
export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  useAutoUpdate();

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    fetchMyProfile().then((p) => {
      if (active) setProfile(p);
    });
    return () => {
      active = false;
    };
  }, [session]);

  // Don't let the browser restore an old scroll position, and always start each
  // top-level screen (login, splash, app) at the top — not wherever the previous
  // screen was scrolled to.
  useEffect(() => { if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'; }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [session, profile, loading]);

  if (loading) return <Splash>LOADING…</Splash>;
  if (!session) return <LoginPage />;
  if (!profile) return <Splash>LOADING YOUR PROFILE…</Splash>;

  return (
    <FeedbackProvider>
      <DataProvider>
        <PullToRefresh />
        <Shell profile={profile} onSignOut={signOut} />
      </DataProvider>
    </FeedbackProvider>
  );
}

function Splash({ children }) {
  return (
    <div style={{ background: C.bone }} className="screen-h flex items-center justify-center">
      <div className="mono" style={{ color: C.ink, fontSize: '12px', letterSpacing: '0.1em' }}>{children}</div>
    </div>
  );
}
