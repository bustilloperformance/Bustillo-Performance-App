import { useState, useEffect, useRef, useCallback } from 'react';
import { TrendingUp, Layers, Users, CreditCard, BookOpen, Dumbbell, Globe, User, BarChart3, Shield, Wallet, Mail, DollarSign, ChevronRight, Plus, Home, UserCog, Apple, ClipboardList, MessageCircle } from 'lucide-react';
import { C } from '../theme';
import { PathMark, PageHeader, StatCard, Avatar } from './ui';
import { useData } from '../data/store';
import StripeCheckoutModal from './StripeCheckoutModal';
import { checkoutPendiente, olvidarCheckout } from '../lib/pendingCheckout';
import { fueRecargaPorUpdate } from '../lib/coldStart';
import { useToast } from './feedback';
import { roleCan } from '../lib/permissions';
import { todayISO, membershipRenewalStatus, membershipActive, monthlyValue, effectiveMembershipPrice, lastPaymentMethodFor, mondayOfWeek } from '../lib/helpers';
import { checkInWindow } from '../lib/checkIn';
import { renewMembership } from '../data/memberships';
import { monthLabel } from '../lib/financeHelpers';
import PlansView from '../features/plans/PlansView';
import MembersList from '../features/members/MembersList';
import MemberDetail from '../features/members/MemberDetail';
import MemberProfileForm from '../features/members/MemberProfileForm';
import MembershipsView from '../features/memberships/MembershipsView';
import RoleEditor from '../features/team/RoleEditor';
import ExerciseLibrary from '../features/exercises/ExerciseLibrary';
import WorkoutsView from '../features/workouts/WorkoutsView';
import ProgramsView from '../features/programs/ProgramsView';
import OneOnOneView from '../features/members/OneOnOneView';
import CheckInsView from '../features/checkin/CheckInsView';
import ClientNutrition from '../features/nutrition/ClientNutrition';
import ClientHome from '../features/client/ClientHome';
import ClientWorkouts from '../features/client/ClientWorkouts';
import ClientPrograms from '../features/client/ClientPrograms';
import ClientAccount from '../features/client/ClientAccount';
import ClientResults from '../features/client/ClientResults';
import ResultsView from '../features/progress/ResultsView';
import FinanceView from '../features/studio/FinanceView';
import ReportsView from '../features/studio/ReportsView';
import CommsView from '../features/studio/CommsView';
import ChatView from '../features/chat/ChatView';

// ============================================================
//  APP SHELL — sidebar nav + main area, for staff (grouped nav) and
//  clients (flat nav). Grows each phase. Nav lists only built screens.
// ============================================================
const OWNER_NAV = [
  { id: 'dashboard', label: 'Standard', icon: TrendingUp, group: 'Overview' },
  { id: 'members', label: 'Members', icon: Users, group: 'People' },
  { id: 'memberships', label: 'Memberships', icon: CreditCard, group: 'People' },
  { id: 'chat', label: 'Community', icon: MessageCircle, group: 'People' },
  { id: 'plans', label: 'Plans', icon: Layers, group: 'People' },
  { id: 'roles', label: 'Roles', icon: Shield, group: 'People' },
  { id: 'exercises', label: 'Library', icon: BookOpen, group: 'Method' },
  { id: 'workouts', label: 'Workouts', icon: Dumbbell, group: 'Method' },
  { id: 'one-on-one', label: '1-on-1 Programs', icon: UserCog, group: 'Method' },
  { id: 'check-ins', label: 'Check-ins', icon: ClipboardList, group: 'Method' },
  { id: 'programs', label: 'Programs', icon: Globe, group: 'Method' },
  { id: 'results', label: 'Results', icon: BarChart3, group: 'Method' },
  { id: 'finances', label: 'Cash & Expenses', icon: Wallet, group: 'Studio' },
  { id: 'reports', label: 'Reports', icon: BarChart3, group: 'Studio' },
  { id: 'comms', label: 'Communications', icon: Mail, group: 'Studio' },
];

const CLIENT_NAV = [
  { id: 'client-home', label: 'My Standard', icon: Home },
  { id: 'client-workouts', label: 'My Training', icon: Dumbbell },
  { id: 'client-chat', label: 'Community', icon: MessageCircle },
  { id: 'client-programs', label: 'Online Programs', icon: Globe },
  { id: 'client-results', label: 'Track Progress', icon: TrendingUp },
  { id: 'client-nutrition', label: 'Nutrition', icon: Apple },
  { id: 'client-profile', label: 'My Profile', icon: User },
  { id: 'client-billing', label: 'Account', icon: CreditCard },
];

// Pantallas que ya no existen. La vista se guarda en localStorage, asi que un
// telefono que se quedo en una de estas volveria a abrir en blanco.
const RETIRED_VIEWS = new Set(['schedule', 'pos', 'segment-programs', 'client-classes']);

export default function Shell({ profile, onSignOut }) {
  const { data, loading, refresh } = useData();
  const showToast = useToast();
  const role = profile.role;

  // Un checkout que quedó abierto cuando salieron de la app — tocar
  // "Términos y Condiciones" dentro del formulario de Stripe hace justo eso.
  // Se lee una sola vez al arrancar: la app no tiene router, así que el modal
  // no deja rastro en la URL y sin esto el pago se perdía al volver.
  const [rescatado, setRescatado] = useState(() => {
    // Si la URL trae ?checkout=, Stripe acaba de devolvernos y el pago ya
    // terminó: no hay nada que rescatar. Sin esta guarda el estado inicial
    // montaría el modal un instante antes de que el efecto lo limpiara, y ese
    // montón pediría una sesión nueva a Stripe en cada compra exitosa.
    if (new URLSearchParams(window.location.search).get('checkout')) {
      olvidarCheckout();
      return null;
    }
    return checkoutPendiente();
  });
  const cerrarRescatado = () => { olvidarCheckout(); setRescatado(null); };

  // Returning from Stripe Checkout: ?checkout=success|cancel.
  useEffect(() => {
    const co = new URLSearchParams(window.location.search).get('checkout');
    if (!co) return;
    // El pago ya terminó (bien o cancelado): se borra el rescate guardado.
    // No hace falta tocar el estado — el inicializador ya devolvió null al ver
    // este mismo parámetro en la URL.
    olvidarCheckout();
    window.history.replaceState({}, '', window.location.pathname);
    if (co === 'success') {
      showToast('Payment received — finalizing your account…');
      setTimeout(refresh, 2500);
    } else {
      showToast('Checkout canceled.');
    }
  }, [showToast, refresh]);
  // Staff = any non-client role (matches the DB's is_staff()).
  const staffRole = !!role && role !== 'client';
  // A guardian's login covers their dependents too: a child with no email of
  // their own can't sign in, so the parent switches into the child's account.
  // `actingMemberId` is whose account the client screens are showing. It starts
  // as you and isn't persisted — a phone gets shared at home, so a reload should
  // land back on your own account rather than whoever was last open.
  const [actingMemberId, setActingMemberId] = useState(profile.memberId);
  const dependents = data.members.filter((m) => m.guardianId && m.guardianId === profile.memberId);
  const household = [data.members.find((m) => m.id === profile.memberId), ...dependents].filter(Boolean);
  // Fall back to yourself if the dependent you were in got detached.
  const clientMemberId = household.some((m) => m.id === actingMemberId) ? actingMemberId : profile.memberId;
  // Set only while you're inside a dependent's account, never your own.
  const actingDependent = clientMemberId !== profile.memberId
    ? household.find((m) => m.id === clientMemberId)
    : null;
  // An owner/coach with a linked member can flip into the client experience
  // using their own profile (they train at the gym too).
  const canViewAsClient = staffRole && !!profile.memberId;

  // The app is a single URL, so the current screen lives in state. Persist it to
  // localStorage (not sessionStorage — that's wiped when the app is closed) so
  // reopening the app, or a silent auto-update reload, returns to the same screen.
  const VIEW_KEY = 'fw-view';
  const CLIENTMODE_KEY = 'fw-view-as-client';
  const [viewAsClient, setViewAsClient] = useState(() => {
    try { return canViewAsClient && localStorage.getItem(CLIENTMODE_KEY) === 'true'; } catch { return false; }
  });
  const [view, setView] = useState(() => {
    const fallback = staffRole ? 'dashboard' : 'client-home';
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (!saved || RETIRED_VIEWS.has(saved)) return fallback;
      // A client must never restore into a staff screen.
      if (!staffRole && !saved.startsWith('client-')) return fallback;
      return saved;
    } catch { return fallback; }
  });
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view); } catch { /* ignore */ } }, [view]);
  useEffect(() => { try { localStorage.setItem(CLIENTMODE_KEY, String(viewAsClient)); } catch { /* ignore */ } }, [viewAsClient]);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Effective experience: client when the user is a client, or when staff has
  // toggled into client view.
  const clientMode = !staffRole || (canViewAsClient && viewAsClient);

  // ---- Scroll handling ----
  // The scroll container can be the window OR <main> (its overflow-x:hidden makes
  // overflow-y compute to auto), so read/write both to be safe.
  const getScroll = useCallback(() => { const m = document.querySelector('main'); return Math.max(window.scrollY || 0, document.documentElement.scrollTop || 0, m ? m.scrollTop : 0); }, []);
  const applyScroll = useCallback((y) => { window.scrollTo(0, y); const m = document.querySelector('main'); if (m) m.scrollTop = y; }, []);
  // Capture the saved position once at mount, before anything can overwrite it.
  // Pero solo cuando la recarga la pidió el actualizador. Abrir la app de cero
  // empieza arriba: entrar y aparecer a media pantalla, donde se quedó ayer, no
  // es útil para nadie.
  //
  // En arranque en frío se tira además la posición guardada. Si se dejara, el
  // regreso desde otra app la usaría para "restaurar" y la persona saltaría a
  // un lugar que ya no le corresponde.
  const [savedScroll] = useState(() => {
    if (!fueRecargaPorUpdate()) {
      try { localStorage.removeItem('fw-scroll'); } catch { /* ignorar */ }
      return 0;
    }
    try { return Number(localStorage.getItem('fw-scroll') || 0); } catch { return 0; }
  });
  const scrollRestoredRef = useRef(false);
  const navMountedRef = useRef(false);
  const suppressSaveRef = useRef(false); // ignore scroll saves briefly while we restore

  // Keep re-applying the target for a while — NOT just until it first looks right.
  // iOS resets the scroll a beat AFTER resume, so a restore that stopped early got
  // undone (the user had to touch the screen to trigger it again). We re-apply
  // every ~90ms for up to ~2.6s, and only stop early once it has HELD at the target
  // for ~700ms — long enough to outlast the late reset.
  const restoreRunRef = useRef(0);
  const restoreTo = useCallback((y) => {
    if (!y || y <= 0) { suppressSaveRef.current = false; return; } // nothing to restore; unblock saves
    suppressSaveRef.current = true;
    applyScroll(y); // snap immediately (iOS only lets us scroll once JS wakes on touch)
    const run = ++restoreRunRef.current; // a newer restore cancels an older one
    let ticks = 0, held = 0;
    const tick = () => {
      if (run !== restoreRunRef.current) return; // superseded
      applyScroll(y);
      ticks += 1;
      held = Math.abs(getScroll() - y) <= 4 ? held + 1 : 0;
      if (ticks < 30 && held < 8) setTimeout(tick, 90);
      else setTimeout(() => { if (run === restoreRunRef.current) suppressSaveRef.current = false; }, 200);
    };
    requestAnimationFrame(tick);
  }, [applyScroll, getScroll]);

  // The browser's own scroll restoration is unreliable for a SPA — we do it.
  useEffect(() => { if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'; }, []);
  // ROBUST app-switch handling (the fix a friend suggested): instead of trying to
  // RESTORE scroll after the OS resets it on resume, we LOCK the position when the
  // app loses focus. We pin <body> to `position:fixed; top:-Y` synchronously on the
  // blur/hide event (which fires before iOS freezes the JS), so the content stays
  // visually where it was — the OS has nothing to reset. On return we unlock and
  // scroll back to Y, seamlessly. This also fixes the "jumps to top" for good.
  useEffect(() => {
    const b = document.body;
    let lockedY = 0, locked = false;

    const save = () => {
      if (locked || suppressSaveRef.current) return;
      const y = getScroll();
      if (y > 0) { try { localStorage.setItem('fw-scroll', String(y)); } catch { /* ignore */ } }
    };
    // If a leave event fires we pin <body> so the OS can't reset the scroll.
    const lock = () => {
      if (locked) return;
      const y = getScroll();
      if (y <= 0) return;
      lockedY = y;
      b.style.position = 'fixed'; b.style.top = `-${y}px`; b.style.left = '0'; b.style.right = '0'; b.style.width = '100%';
      locked = true;
    };
    const unlock = () => {
      if (!locked) return;
      locked = false;
      b.style.position = ''; b.style.top = ''; b.style.left = ''; b.style.right = ''; b.style.width = '';
      window.scrollTo(0, lockedY);
      const m = document.querySelector('main'); if (m) m.scrollTop = lockedY;
    };
    const savedY = () => { try { return Number(localStorage.getItem('fw-scroll') || 0); } catch { return 0; } };
    // A synthetic touch nudges iOS into honoring the scroll — this is what made the
    // auto-restore work WITHOUT the user tapping.
    let simulating = false;
    const simulateTouch = () => {
      if (simulating) return; simulating = true;
      try { const o = { bubbles: true, cancelable: true, composed: true }; document.body.dispatchEvent(new Event('touchstart', o)); document.body.dispatchEvent(new Event('touchend', o)); } catch { /* ignore */ }
      simulating = false;
    };
    // Came back from another app: if we locked, unlock (seamless); otherwise
    // auto-restore right away (no tap needed).
    const onReturn = () => { if (locked) { unlock(); return; } simulateTouch(); restoreTo(savedY()); };
    // The user dragging to scroll cancels any in-progress restore so they move freely.
    const onUserScroll = () => { restoreRunRef.current += 1; suppressSaveRef.current = false; };
    const onVis = () => (document.hidden ? lock() : onReturn());

    window.addEventListener('scroll', save, { passive: true, capture: true });
    window.addEventListener('blur', lock);
    window.addEventListener('pagehide', lock);
    window.addEventListener('focus', onReturn);
    window.addEventListener('pageshow', onReturn);
    window.addEventListener('touchmove', onUserScroll, { passive: true, capture: true });
    document.addEventListener('visibilitychange', onVis);
    // High-frequency poll: the visibilitychange EVENT is unreliable in iOS PWAs, but
    // the document.hidden PROPERTY still flips. Polling fast lets us catch both the
    // leave (to lock) and the return (to auto-restore) even when no event fires.
    let lastTick = performance.now();
    let wasHidden = false;
    const poll = setInterval(() => {
      const now = performance.now();
      const gap = now - lastTick; lastTick = now;
      const hidden = document.hidden;
      if (hidden && !locked) lock();                        // app leaving
      if ((!hidden && wasHidden) || gap > 1200) onReturn();  // app returned → auto-restore
      wasHidden = hidden;
    }, 120);

    return () => {
      window.removeEventListener('scroll', save, { capture: true });
      window.removeEventListener('blur', lock);
      window.removeEventListener('pagehide', lock);
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('pageshow', onReturn);
      window.removeEventListener('touchmove', onUserScroll, { capture: true });
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(poll);
      unlock();
    };
  }, [getScroll, restoreTo]);
  // On a reload, once the data has loaded (so the page has its real height) put the
  // user back where they were.
  useEffect(() => {
    if (scrollRestoredRef.current || loading) return;
    scrollRestoredRef.current = true;
    restoreTo(savedScroll);
  }, [loading, savedScroll, restoreTo]);
  // Navigating between screens starts at the top — but skip the first render so it
  // doesn't fight the reload scroll-restore above.
  useEffect(() => {
    if (!navMountedRef.current) { navMountedRef.current = true; return; }
    applyScroll(0);
  }, [view, selectedMemberId, clientMode, applyScroll]);


  // Staff nav is gated by the role's permissions (owner/["*"] sees all).
  // Nutrition is opt-in per member: solo aparece cuando el coach le cargó una.
  const meMember = data.members.find((m) => m.id === clientMemberId);
  const nutritionOn = !!meMember?.hasNutrition;
  const navItems = clientMode
    ? CLIENT_NAV.filter((i) => (i.id !== 'client-nutrition' || nutritionOn))
    : OWNER_NAV.filter((i) => i.id === 'dashboard' || roleCan(role, i.id, data.roles));
  const groupedNav = navItems.reduce((acc, item) => {
    const g = item.group || 'Main';
    (acc[g] = acc[g] || []).push(item);
    return acc;
  }, {});

  const can = (key) => roleCan(role, key, data.roles);
  const go = (id) => { setView(id); setSelectedMemberId(null); setSidebarOpen(false); };
  // Switching account sends you home: the nav is per-member (
  // Nutrition), so the screen you're on may not exist for who you switch into.
  const switchMember = (id) => { setActingMemberId(id); setView('client-home'); setSidebarOpen(false); };
  const switchMode = (toClient) => {
    setViewAsClient(toClient);
    setView(toClient ? 'client-home' : 'dashboard');
    setSelectedMemberId(null);
    setSidebarOpen(false);
  };

  return (
    <div className="screen-h" style={{ background: C.bone, color: C.ink }}>
      <div className="screen-h flex">
        {/* MOBILE TOP BAR */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between p-3" style={{ background: C.ink, borderBottom: `2px solid ${C.gold}` }}>
          <button onClick={() => setSidebarOpen(true)} className="p-2 mono" style={{ background: C.forest, color: C.ink, fontSize: '11px', letterSpacing: '0.1em' }}>☰ MENU</button>
          {/* The sidebar switcher is hidden on mobile, so whose account you're in
              has to show here — otherwise a guardian could log their own session
              onto their child. Brand gives way; the name matters more. */}
          {actingDependent ? (
            <div className="flex items-center gap-2 min-w-0 px-2 py-1" style={{ background: C.gold }}>
              <Avatar member={actingDependent} size={22} fontSize={9} />
              <div className="min-w-0">
                <div className="mono leading-none" style={{ fontSize: '9px', letterSpacing: '0.1em', color: C.bone }}>VIEWING</div>
                <div className="ui-strong leading-tight truncate" style={{ fontSize: '17px', color: C.bone }}>{actingDependent.name.split(' ')[0]}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              {/* Versión clara del isotipo: barras en negro y la quinta en
                  azul, igual que el archivo maestro. Sobre hueso el oro da
                  1.98:1 y la barra del "ahora" se perdería. */}
              <PathMark size={26} color={C.bone} accent={C.forest} />
              {/* Debajo de 120px de ancho la guía manda omitir "PERFORMANCE"
                  y dejar solo el apellido. Entre MENU y OUT en un teléfono
                  angosto no cabe más que eso. */}
              <div className="wordmark truncate" style={{ fontSize: '17px', lineHeight: 1.2, color: C.bone }}>BUSTILLO</div>
            </div>
          )}
          <button onClick={onSignOut} className="mono px-2 py-1.5 flex-shrink-0" style={{ fontSize: '10px', letterSpacing: '0.1em', background: C.moss, color: C.bone }}>← OUT</button>
        </div>

        {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="md:hidden fixed inset-0 z-40" style={{ background: 'rgba(11,11,12,0.6)' }} />}

        {/* SIDEBAR */}
        <aside style={{ background: C.ink, color: C.bone, width: '256px' }}
          className={`flex flex-col flex-shrink-0 h-screen z-50 fixed md:sticky top-0 left-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-200`}>
          <div style={{ borderBottom: `1px solid ${C.cream}20` }} className="p-5">
            {/* El logo horizontal, armado como lo arma la marca: el isotipo,
                el apellido pesado, y "PERFORMANCE" espaciado debajo. Aquí sí
                cabe completo — la barra mide 256px y el mínimo son 120. */}
            <div className="flex items-center justify-center gap-2.5">
              <PathMark size={32} color={C.bone} accent={C.forest} />
              <div className="min-w-0">
                <div className="wordmark whitespace-nowrap" style={{ fontSize: '21px', lineHeight: 1, color: C.bone }}>BUSTILLO</div>
                {/* El interletraje amplio es parte del logo, no un adorno:
                    "PERFORMANCE" tiene que medir lo mismo que "BUSTILLO". */}
                <div className="whitespace-nowrap" style={{ fontSize: '7.5px', letterSpacing: '0.33em', color: C.forest, fontWeight: 600, marginTop: '2px' }}>PERFORMANCE</div>
              </div>
            </div>
          </div>

          <div style={{ borderBottom: `1px solid ${C.cream}20` }} className="p-3">
            <div className="mono mb-1.5 px-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.mossDeep, fontWeight: 600 }}>SIGNED IN AS</div>
            {/* Name gets the full width and wraps — squeezed beside the buttons
                it was truncating, and your own name is the one thing here you
                shouldn't have to guess at. */}
            <div className="px-1">
              <div className="ui-strong leading-tight" style={{ fontSize: '17px', color: C.cream, wordBreak: 'break-word' }}>{profile.name || profile.email}</div>
              <div className="mono mt-0.5" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.goldDeep, fontWeight: 700 }}>{(role || '').toUpperCase()}{clientMode && canViewAsClient ? ' · CLIENT VIEW' : ''}</div>
            </div>
            <button onClick={onSignOut} className="w-full mono mt-2.5 py-2" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.moss, color: C.bone, fontWeight: 600 }}>← SIGN OUT</button>

            {/* Household switcher — a guardian moves between their own account
                and whoever they're responsible for. */}
            {clientMode && household.length > 1 && (
              <div className="mt-3">
                <div className="mono mb-1.5 px-1" style={{ fontSize: '10px', letterSpacing: '0.1em', color: C.mossDeep }}>VIEWING</div>
                <div className="space-y-1">
                  {household.map((m) => {
                    const on = m.id === clientMemberId;
                    const isSelf = m.id === profile.memberId;
                    return (
                      <button key={m.id} onClick={() => switchMember(m.id)} className="w-full flex items-center gap-2 px-2 py-1.5 text-left"
                        style={{ background: on ? C.gold : C.forest, color: on ? C.bone : C.ink }}>
                        <Avatar member={m} size={22} fontSize={9} />
                        <span className="ui-strong truncate" style={{ fontSize: '15px' }}>{isSelf ? 'Me' : m.name.split(' ')[0]}</span>
                        {!isSelf && <span className="mono ml-auto flex-shrink-0" style={{ fontSize: '9px', letterSpacing: '0.1em' }}>DEPENDENT</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Admin ⇄ Client toggle (staff with a member profile) */}
            {canViewAsClient && (
              <div className="mt-2 flex gap-1 p-1" style={{ background: C.forest }}>
                <button onClick={() => switchMode(false)} className="mono flex-1 py-1.5"
                  style={{ fontSize: '11px', letterSpacing: '0.1em', fontWeight: 600, background: !viewAsClient ? C.gold : 'transparent', color: !viewAsClient ? C.bone : C.moss }}>ADMIN</button>
                <button onClick={() => switchMode(true)} className="mono flex-1 py-1.5"
                  style={{ fontSize: '11px', letterSpacing: '0.1em', fontWeight: 600, background: viewAsClient ? C.gold : 'transparent', color: viewAsClient ? C.bone : C.moss }}>CLIENT</button>
              </div>
            )}
          </div>

          <nav className="flex-1 p-3 space-y-3 overflow-y-auto scrollbar-thin">
            {Object.entries(groupedNav).map(([group, items]) => (
              <div key={group}>
                {!clientMode && <div className="mono mb-1.5 px-3" style={{ fontSize: '10px', letterSpacing: '0.14em', color: C.mossDeep }}>{group.toUpperCase()}</div>}
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = view === item.id;
                  return (
                    <button key={item.id} onClick={() => go(item.id)} className="w-full flex items-center gap-2.5 px-3 py-1.5 transition-all"
                      style={{ background: active ? C.gold : 'transparent', color: active ? C.bone : C.moss, fontSize: clientMode ? '13px' : '12px', fontFamily: 'Archivo, sans-serif', fontWeight: active ? 700 : 500 }}>
                      <Icon size={clientMode ? 14 : 13} strokeWidth={1.8} />{item.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div style={{ borderTop: `1px solid ${C.cream}20` }} className="p-4">
            {/* El tagline principal de la marca. Va en el display expandido
                porque es claim, no interfaz, y el oro oscuro es lo único que
                se lee sobre el hueso de la barra. */}
            <div className="display" style={{ fontSize: '15px', lineHeight: 1.15, color: C.bone }}>BUILD THE</div>
            <div className="display" style={{ fontSize: '15px', lineHeight: 1.15, color: C.goldDeep }}>ATHLETE.</div>
          </div>
        </aside>

        <main className="flex-1 overflow-x-hidden min-w-0 pt-14 md:pt-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)' }}>
          {/* Staff (admin) views — gated by the role's permissions */}
          {!clientMode && view === 'dashboard' && <Overview setView={setView} can={can} />}
          {!clientMode && view === 'members' && can('members') && (
            selectedMemberId
              ? <MemberDetail memberId={selectedMemberId} onBack={() => setSelectedMemberId(null)} isOwner={role === 'owner'} />
              : <MembersList onSelect={setSelectedMemberId} />
          )}
          {!clientMode && view === 'memberships' && can('memberships') && <MembershipsView />}
          {!clientMode && view === 'plans' && can('plans') && <PlansView />}
          {!clientMode && view === 'roles' && can('roles') && <RoleEditor />}
          {!clientMode && view === 'exercises' && can('exercises') && <ExerciseLibrary />}
          {!clientMode && view === 'workouts' && can('workouts') && <WorkoutsView />}
          {!clientMode && view === 'one-on-one' && can('one-on-one') && <OneOnOneView />}
          {!clientMode && view === 'check-ins' && can('check-ins') && <CheckInsView />}
          {!clientMode && view === 'programs' && can('programs') && <ProgramsView />}
          {!clientMode && view === 'results' && can('results') && <ResultsView />}
          {!clientMode && view === 'finances' && can('finances') && <FinanceView setView={setView} />}
          {!clientMode && view === 'reports' && can('reports') && <ReportsView />}
          {!clientMode && view === 'comms' && can('comms') && <CommsView />}
          {!clientMode && view === 'chat' && can('chat') && <ChatView staff memberId={profile.memberId} />}

          {/* Client views */}
          {clientMode && view === 'client-home' && <ClientHome clientMemberId={clientMemberId} setView={setView} />}
          {clientMode && view === 'client-chat' && <ChatView memberId={clientMemberId} />}
          {clientMode && view === 'client-workouts' && <ClientWorkouts clientMemberId={clientMemberId} staff={staffRole} />}
          {clientMode && view === 'client-programs' && <ClientPrograms clientMemberId={clientMemberId} setView={setView} />}
          {clientMode && view === 'client-results' && <ClientResults clientMemberId={clientMemberId} />}
          {clientMode && view === 'client-profile' && <ClientProfileView clientMemberId={clientMemberId} />}
          {clientMode && view === 'client-billing' && <ClientAccount clientMemberId={clientMemberId} />}
          {clientMode && view === 'client-nutrition' && <ClientNutrition clientMemberId={clientMemberId} />}

        </main>
      </div>

      {/* El checkout que quedó a medias cuando salieron a leer los Términos.
          Se remonta desde aquí, no desde la pantalla que lo abrió, porque esa
          pantalla puede ni estar montada al volver: la app arranca donde
          arranque y el pago tiene que reaparecer de todos modos. */}
      {rescatado && (
        <StripeCheckoutModal args={rescatado.args} title={rescatado.title || 'Checkout'} onClose={cerrarRescatado} />
      )}

    </div>
  );
}

function ClientProfileView({ clientMemberId }) {
  const { data } = useData();
  const me = data.members.find((m) => m.id === clientMemberId);
  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="02" section="CLIENT · PROFILE" title="My Profile." subtitle="— keep your details current." />
      {me ? <MemberProfileForm key={me.id} member={me} notesEditable={false} /> : <div className="ui-strong" style={{ fontSize: '20px', color: C.moss }}>Profile not found.</div>}
    </div>
  );
}

function Overview({ setView, can }) {
  const { data, refresh } = useData();
  const showToast = useToast();
  const today = todayISO();
  const month = today.slice(0, 7);
  const showMoney = can('finances');

  // Memberships to renew: expired (lapsed) or expiring within a week.
  const [busyRenew, setBusyRenew] = useState(null);
  const renewables = data.memberships
    .filter((mb) => mb.status === 'active')
    .map((mb) => {
      const plan = data.membershipPlans.find((p) => p.id === mb.planId);
      const member = data.members.find((m) => m.id === mb.memberId);
      return { mb, plan, member, rs: membershipRenewalStatus(mb, plan) };
    })
    .filter((x) => x.member && x.plan && (x.rs.state === 'expired' || x.rs.state === 'expiring'));
  const expired = renewables.filter((x) => x.rs.state === 'expired').sort((a, b) => (a.rs.date || '').localeCompare(b.rs.date || ''));
  const expiring = renewables.filter((x) => x.rs.state === 'expiring').sort((a, b) => (a.rs.date || '').localeCompare(b.rs.date || ''));
  const canRenew = (plan) => can('memberships') && ['monthly', 'quarterly', 'annual'].includes(plan.recurrence);
  const doRenew = async (x) => {
    if (busyRenew) return;
    setBusyRenew(x.mb.id);
    try {
      const amount = effectiveMembershipPrice(x.mb, x.plan, 2);
      const method = lastPaymentMethodFor(data.payments, x.mb.memberId);
      await renewMembership(x.mb, x.plan, { amount, method });
      await refresh();
      showToast(x.mb.stripeSubscriptionId
        ? `${x.member.name.split(' ')[0]}'s membership renewed.`
        : `${x.member.name.split(' ')[0]} renewed · +$${amount} ${method}.`);
    }
    catch (e) { showToast(e.message || 'Could not renew.'); }
    finally { setBusyRenew(null); }
  };

  // "Active" has to mean a membership that currently grants access. member.status
  // is stamped 'active' when the member is created and nothing ever updates it,
  // so counting it returned every member who ever existed; and a lapsed
  // membership keeps status 'active' in the DB, so counting that returned
  // expired ones too. Same rule as the ACTIVE filter in MembersList.
  const planOf = (mb) => data.membershipPlans.find((p) => p.id === mb.planId);
  const activeMemberships = data.memberships.filter((mb) => membershipActive(mb, planOf(mb)));
  const activeMembers = new Set(activeMemberships.map((mb) => mb.memberId)).size;
  const monthPayments = data.payments.filter((p) => (p.date || '').startsWith(month));
  const monthRevenue = monthPayments.reduce((s, p) => s + p.amount, 0);
  const monthExpenses = data.expenses.filter((e) => (e.date || '').startsWith(month)).reduce((s, e) => s + e.amount, 0);
  const monthNet = monthRevenue - monthExpenses;
  const mrr = Math.round(activeMemberships.reduce((s, m) => s + monthlyValue(m, planOf(m)), 0));
  // Sin clases ni reservas, el pulso del estudio es cuanta gente entreno esta
  // semana y cuantos check-ins llegaron de la ventana abierta.
  const weekStart = mondayOfWeek(today);
  const logsThisWeek = data.workoutLogs.filter((l) => (l.date || '') >= weekStart);
  const trainedThisWeek = new Set(logsThisWeek.map((l) => l.memberId)).size;
  const ciWindow = checkInWindow(today);
  const checkInsThisWeek = data.checkIns.filter((c) => c.weekStart === ciWindow.weekStart).length;
  const recentLogs = [...logsThisWeek].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6);

  const byType = monthPayments.reduce((acc, p) => { acc[p.type] = (acc[p.type] || 0) + p.amount; return acc; }, {});
  const typeTotal = Object.values(byType).reduce((s, v) => s + v, 0) || 1;
  const recentPayments = [...data.payments].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);

  const cards = showMoney
    ? [
        { label: 'ACTIVE MEMBERS', value: activeMembers, icon: Users, accent: 'ink' },
        { label: 'REVENUE THIS MONTH', value: `$${monthRevenue.toLocaleString()}`, icon: DollarSign, accent: 'forest' },
        { label: 'NET THIS MONTH', value: `$${monthNet.toLocaleString()}`, icon: Wallet, accent: 'gold' },
        { label: 'MRR', value: `$${mrr.toLocaleString()}`, icon: TrendingUp, accent: 'bone' },
      ]
    : [
        { label: 'ACTIVE MEMBERS', value: activeMembers, icon: Users, accent: 'ink' },
        { label: 'ACTIVE MEMBERSHIPS', value: activeMemberships.length, icon: CreditCard, accent: 'forest' },
        { label: 'TRAINED THIS WEEK', value: trainedThisWeek, icon: Dumbbell, accent: 'gold' },
        { label: 'CHECK-INS IN', value: checkInsThisWeek, icon: ClipboardList, accent: 'bone' },
      ];

  const quickActions = [
    { icon: Plus, label: 'ADD MEMBER', target: 'members' },
    { icon: CreditCard, label: 'NEW MEMBERSHIP', target: 'memberships' },
    { icon: ClipboardList, label: 'CHECK-INS', target: 'check-ins' },
    { icon: UserCog, label: '1-ON-1 PROGRAMS', target: 'one-on-one' },
  ].filter((qa) => can(qa.target));

  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="01" section="OVERVIEW · STANDARD" title="Standard." subtitle="— track your studio." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {cards.map((c) => <StatCard key={c.label} label={c.label} value={c.value} icon={c.icon} accent={c.accent} />)}
      </div>

      {/* Renewals — expired + expiring soon */}
      {(expired.length > 0 || expiring.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
          {[
            { title: 'EXPIRED', list: expired, color: C.gold, note: 'lapsed — renew to reactivate' },
            { title: 'EXPIRING SOON', list: expiring, color: C.gold, note: 'due within 7 days' },
          ].map(({ title, list, color, note }) => (
            <div key={title} className="p-5" style={{ background: C.cream, border: `1px solid ${C.charcoal}20`, borderLeft: `3px solid ${color}` }}>
              <div className="flex items-baseline justify-between mb-3">
                <div className="mono" style={{ fontSize: '12px', letterSpacing: '0.1em', color }}>{title} · {list.length}</div>
                <div className="help" style={{ fontSize: '13px', color: C.moss }}>— {note}</div>
              </div>
              {list.length === 0 ? (
                <div className="help" style={{ fontSize: '14px', color: C.moss }}>— none. 👌</div>
              ) : (
                <div className="space-y-1.5">
                  {list.map((x) => (
                    <div key={x.mb.id} className="flex items-center justify-between gap-2 px-3 py-2" style={{ background: C.bone, border: `1px solid ${C.charcoal}15` }}>
                      <button onClick={() => { setView('members'); }} className="text-left min-w-0 flex-1">
                        <div className="ui-strong truncate" style={{ fontSize: '17px', color: C.ink }}>{x.member.name}</div>
                        <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>{x.plan.name.toUpperCase()} · {x.rs.state === 'expired' ? 'WAS DUE' : 'DUE'} {x.rs.date}{x.rs.state === 'expiring' && x.rs.days != null ? ` · ${x.rs.days}d` : ''}</div>
                      </button>
                      {canRenew(x.plan) && (
                        <button onClick={() => doRenew(x)} disabled={busyRenew === x.mb.id} className="mono px-3 py-2 flex-shrink-0" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.cream, border: `1px solid ${C.charcoal}40`, color: C.gold }}>
                          {busyRenew === x.mb.id ? '…' : '↻ RENEW +1'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
        {/* Left: revenue (money) or this week's training */}
        {showMoney ? (
          <div className="lg:col-span-2 p-6" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>02 — REVENUE STREAMS</div>
                <div className="stat-num" style={{ fontSize: '40px', lineHeight: 1 }}>${monthRevenue.toLocaleString()}</div>
              </div>
              <div className="mono" style={{ fontSize: '11px', color: C.moss }}>{monthLabel(month).toUpperCase()}</div>
            </div>
            {Object.keys(byType).length === 0 ? (
              <div className="help" style={{ fontSize: '15px', color: C.moss }}>— no income this month yet. Stripe charges and recorded payments show up here.</div>
            ) : (
              <>
                <div className="flex h-2 mb-3">
                  {Object.entries(byType).map(([type, val], i) => <div key={type} style={{ width: `${(val / typeTotal) * 100}%`, background: i % 2 === 0 ? C.ink : C.gold }} />)}
                </div>
                <div className="space-y-1.5">
                  {Object.entries(byType).map(([type, val], i) => (
                    <div key={type} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2"><div className="w-2 h-2" style={{ background: i % 2 === 0 ? C.ink : C.gold }} /><span className="capitalize">{type}</span></div>
                      <div className="mono" style={{ fontSize: '13px' }}>${val.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="lg:col-span-2 p-6" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
            <div className="mono mb-3" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>02 — THIS WEEK'S TRAINING</div>
            {recentLogs.length === 0 ? <div className="help" style={{ fontSize: '15px', color: C.moss }}>— nobody has logged a session yet this week.</div> : (
              <div className="space-y-2">
                {recentLogs.map((l) => {
                  const member = data.members.find((m) => m.id === l.memberId);
                  return (
                    <div key={l.id} className="flex items-center justify-between py-1.5" style={{ borderBottom: `1px solid ${C.charcoal}10` }}>
                      <div className="flex items-center gap-2 min-w-0"><Avatar member={member} size={24} /><span className="ui-strong truncate" style={{ fontSize: '17px' }}>{member?.name || '—'}</span></div>
                      <div className="mono flex-shrink-0" style={{ fontSize: '12px', color: C.gold }}>{l.date}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Right: live activity */}
        <div className="p-5" style={{ background: C.cream, color: C.ink }}>
          <div className="mono mb-3" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.sand }}>03 — {showMoney ? 'LIVE ACTIVITY' : 'NEW MEMBERS'}</div>
          <div className="space-y-2.5">
            {showMoney ? (
              recentPayments.length === 0 ? <div className="help" style={{ fontSize: '14px', color: C.sand }}>— nothing yet.</div> :
              recentPayments.map((p) => {
                const member = data.members.find((m) => m.id === p.memberId);
                return (
                  <div key={p.id} className="flex items-start gap-2 pb-2.5" style={{ borderBottom: `1px solid ${C.forest}` }}>
                    <Avatar member={member} size={28} bg={C.gold} fg={C.ink} />
                    <div className="flex-1 min-w-0"><div className="text-xs truncate" style={{ color: C.cream }}>{member?.name || 'Walk-in'}</div><div className="mono truncate" style={{ fontSize: '11px', color: C.sand }}>{p.note || p.type}</div></div>
                    <div className="mono" style={{ fontSize: '12px', color: C.gold }}>+${p.amount}</div>
                  </div>
                );
              })
            ) : (
              [...data.members].slice(0, 5).map((m) => (
                <div key={m.id} className="flex items-center gap-2 pb-2.5" style={{ borderBottom: `1px solid ${C.forest}` }}>
                  <Avatar member={m} size={28} bg={C.gold} fg={C.ink} />
                  <div className="flex-1 min-w-0"><div className="text-xs truncate" style={{ color: C.cream }}>{m.name}</div><div className="mono truncate" style={{ fontSize: '11px', color: C.sand }}>JOINED {m.joinDate}</div></div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="p-6 mb-6" style={{ background: C.forest, color: C.ink }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="display" style={{ fontSize: '24px', fontWeight: 600, letterSpacing: '0.02em' }}>TRAIN WITH PURPOSE.</div>
          <div className="hand" style={{ fontSize: '24px', color: C.gold }}>— Josean</div>
        </div>
      </div>

      {quickActions.length > 0 && (
        <>
          <div className="mono mb-3" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>04 — QUICK ACTIONS</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {quickActions.map((qa) => {
              const Icon = qa.icon;
              return (
                <button key={qa.target} onClick={() => setView(qa.target)} className="p-4 flex items-center justify-between transition-all hover:bg-[#C4A46420]" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
                  <div className="flex items-center gap-2"><Icon size={14} strokeWidth={1.8} style={{ color: C.ink }} /><span className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em' }}>{qa.label}</span></div>
                  <ChevronRight size={14} style={{ color: C.moss }} />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
