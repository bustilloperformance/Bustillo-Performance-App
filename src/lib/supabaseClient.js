import { createClient } from '@supabase/supabase-js';

// Credentials come from .env.local (never commit that file). Vite only exposes
// vars prefixed with VITE_ to the browser bundle.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail loudly in dev if the env isn't wired up, instead of a confusing runtime error later.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env.local and fill in ' +
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart `npm run dev`.'
  );
}

// ---- "Remember me" storage ----
// Checked (default) → localStorage: the session survives closing the browser.
// Unchecked → sessionStorage: the session is dropped when the tab/app closes.
// The choice is a tiny flag in localStorage; the session tokens live in whichever
// storage the flag points to.
const REMEMBER_KEY = 'bp-remember';

export function setRemember(remember) {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? 'true' : 'false');
    // Drop any stale session copy from the storage we're NOT using.
    const drop = remember ? window.sessionStorage : window.localStorage;
    Object.keys(drop).forEach((k) => { if (k.startsWith('sb-')) drop.removeItem(k); });
  } catch { /* storage unavailable — ignore */ }
}

function activeStorage() {
  try { return localStorage.getItem(REMEMBER_KEY) === 'false' ? window.sessionStorage : window.localStorage; }
  catch { return window.localStorage; }
}

const rememberStorage = {
  getItem: (k) => { try { return activeStorage().getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { activeStorage().setItem(k, v); } catch { /* ignore */ } },
  removeItem: (k) => { try { activeStorage().removeItem(k); } catch { /* ignore */ } },
};

// The anon/publishable key is safe to ship in the frontend — it only grants
// what Row Level Security policies allow. Real protection lives in RLS (Phase 1+).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: rememberStorage,
  },
});

export default supabase;
