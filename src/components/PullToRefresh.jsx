import { useEffect, useRef, useState } from 'react';
import { C } from '../theme';
import { hayEdicionAbierta } from '../lib/editing';

// ============================================================
//  PULL TO REFRESH — native-app-style gesture. Only engages after a clear
//  downward drag from the very top (a dead-zone keeps normal scrolling
//  untouched). The indicator starts hidden above the page and slides in as you
//  pull; past the threshold, release reloads for fresh data + latest version.
//  Touch-only, so it never fires on desktop.
// ============================================================
const THRESHOLD = 70;   // pull distance to trigger
const MAX = 120;        // max visual pull
const DEADZONE = 10;    // px of movement before we decide direction

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const committed = useRef(false); // true once we've locked into a pull gesture
  const pullRef = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
    const setP = (v) => { pullRef.current = v; setPull(v); };

    const onStart = (e) => {
      committed.current = false;
      // Con un editor abierto el gesto no existe: soltar recargaria la pagina
      // y se perderia lo que se estaba capturando.
      startY.current = (atTop() && e.touches.length === 1 && !hayEdicionAbierta()) ? e.touches[0].clientY : null;
    };

    const onMove = (e) => {
      if (startY.current == null || busy.current) return;
      const y = e.touches[0].clientY;
      const dy = y - startY.current;

      // Decide direction once, after a small dead-zone — this keeps normal
      // scrolling (and upward flicks) completely untouched.
      if (!committed.current) {
        if (Math.abs(dy) < DEADZONE) return;
        if (dy < 0 || !atTop()) { startY.current = null; return; } // scrolling away → not a pull
        committed.current = true;
        startY.current = y; // reset baseline so the pull starts from 0 with no jump
        return;
      }

      const d = y - startY.current;
      if (d <= 0) { setP(0); return; }
      setP(Math.min(MAX, d * 0.5)); // rubber-band resistance
      e.preventDefault(); // only now do we take over the gesture
    };

    const onEnd = () => {
      if (startY.current == null && !committed.current) return;
      startY.current = null;
      committed.current = false;
      if (pullRef.current >= THRESHOLD && !busy.current && !hayEdicionAbierta()) {
        busy.current = true;
        setRefreshing(true);
        setP(THRESHOLD);
        setTimeout(() => window.location.reload(), 400);
      } else {
        setP(0);
      }
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  if (pull <= 0 && !refreshing) return null;
  const rot = Math.min(180, (pull / THRESHOLD) * 180);
  // Circle (40px) rests fully above the top edge; it slides into view with pull.
  const y = pull - 52;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 80, display: 'flex', justifyContent: 'center', pointerEvents: 'none', transform: `translateY(${y}px)`, transition: refreshing || pull === 0 ? 'transform 0.25s ease' : 'none' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', background: C.cream, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.35)' }}>
        {refreshing ? (
          <span style={{ width: 18, height: 18, borderRadius: '50%', border: `3px solid ${C.gold}`, borderTopColor: 'transparent', display: 'inline-block', animation: 'ptr-spin 0.7s linear infinite' }} />
        ) : (
          <span className="mono" style={{ color: C.gold, fontSize: '18px', lineHeight: 1, transform: `rotate(${rot}deg)`, transition: 'transform 0.1s' }}>↓</span>
        )}
      </div>
    </div>
  );
}
