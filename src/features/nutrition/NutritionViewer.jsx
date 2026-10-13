import { useEffect, useState } from 'react';
import { C } from '../../theme';
import { getNutrition, nutritionPageUrls } from '../../data/nutrition';

// iOS/iPadOS don't render PDFs inside an <iframe> — there we show a prominent
// button that opens the plan in the native fullscreen PDF viewer instead.
const isIOS = typeof navigator !== 'undefined'
  && (/iP(hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// ============================================================
//  NUTRITION VIEWER — loads a member's plan PDF on demand. Desktop: embedded
//  inline. iOS: an "open plan" button (native viewer). Always downloadable.
// ============================================================
export default function NutritionViewer({ memberId }) {
  const [plan, setPlan] = useState(undefined); // undefined = loading, null = none
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getNutrition(memberId);
        if (!active) return;
        if (!p || !p.pages?.length) { setPlan(null); return; }
        const [signed] = await nutritionPageUrls(p.pages);
        if (!active) return;
        setUrl(signed);
        setPlan(p);
      } catch { if (active) setPlan(null); }
    })();
    return () => { active = false; };
  }, [memberId]);

  if (plan === undefined) return <div className="mono py-8 text-center" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.moss }}>LOADING PLAN…</div>;
  if (!plan || !plan.pages?.length) {
    return (
      <div className="p-8 text-center" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        <div className="ui-strong" style={{ fontSize: '22px', color: C.ink }}>No nutrition plan yet.</div>
        <div className="hand mt-2" style={{ fontSize: '17px', color: C.moss }}>— tu coach la sube aquí.</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <a href={url} target="_blank" rel="noreferrer"
        className="mono flex items-center justify-center px-5 py-4"
        style={{ fontSize: '13px', letterSpacing: '0.1em', background: C.cream, color: C.gold, textDecoration: 'none' }}>
        ↗ OPEN NUTRITION PLAN
      </a>
      {isIOS ? (
        <div className="p-6 text-center" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
          <div className="ui-strong" style={{ fontSize: '18px', color: C.ink }}>Tap “Open Nutrition Plan” above</div>
          <div className="help mt-1" style={{ fontSize: '14px', color: C.goldDeep }}>— it opens full-screen, ready to scroll & zoom.</div>
        </div>
      ) : (
        <iframe title="Nutrition plan" src={`${url}#view=FitH`}
          style={{ width: '100%', height: '82vh', border: `1px solid ${C.charcoal}20`, borderRadius: 4, background: '#fff' }} />
      )}
      {plan.updated_at ? (
        <div className="mono text-center pt-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>UPDATED {(plan.updated_at || '').slice(0, 10)}</div>
      ) : null}
    </div>
  );
}
