import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast } from '../../components/feedback';
import { saveWorkoutLog } from '../../data/logs';
import { groupWorkoutItems, formatTempo } from '../../lib/workoutHelpers';
import { bestEstimated1RM, suggestedLoadForPct, estimate1RMFromSet, unitLabel, todayISO, READINESS_LABELS, kgToLb, lbToKgDisplay, logMetricsOf, setMetric, bestPriorPR, prMetricOf, prValueOfSet, beatsPR, prLabel } from '../../lib/helpers';
import { setInputStyle } from '../../components/uiStyles';
import VideoDemo from '../../components/VideoDemo';
import TabataTimer from '../../components/TabataTimer';
import BottomBar from '../../components/BottomBar';

// ============================================================
//  PARTICIPANT LOG PANEL — log one member's session for a workout.
//  Used by LiveClassModal (staff) and client My Training. Writes a workout_log.
// ============================================================
export default function ParticipantLogPanel({ workout, member, existingLog, onDone, programWeek, programDayNumber, date, coach = false }) {
  const { data, refresh } = useData();
  const showToast = useToast();
  const pastLogs = data.workoutLogs.filter((l) => l.memberId === member.id);
  // La marca a vencer de cada ejercicio, sin contar la sesión que se está
  // capturando: comparar una serie contra sí misma haría que todo fuera récord.
  const priorLogs = pastLogs.filter((l) => l.id !== existingLog?.id);
  const prByEx = {};
  workout.items.forEach((it) => {
    if (it._isText || prByEx[it.exerciseId] !== undefined) return;
    const ex = data.exercises.find((e) => e.id === it.exerciseId);
    if (ex) prByEx[it.exerciseId] = bestPriorPR(priorLogs, ex);
  });

  // The client's previous session for an exercise (excluding the one being edited)
  // — what they lifted and the note they wrote, so they can beat it today.
  const lastSessionFor = (exId) => {
    const prior = pastLogs
      .filter((l) => l.id !== existingLog?.id && (l.sets || []).some((s) => s.exerciseId === exId))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const log = prior[0];
    if (!log) return null;
    return { date: log.date, sets: (log.sets || []).filter((s) => s.exerciseId === exId), note: (log.exerciseNotes?.[exId] || '').trim() };
  };
  // The client's best set of a session: heaviest load (ties broken by reps), or
  // the biggest value of whatever metric that exercise tracks.
  const bestPastSet = (sets, ex) => {
    const score = (s) => {
      const w = setMetric(s, 'weight', ex?.measure); if (w != null) return w;
      const d = setMetric(s, 'distance', ex?.measure); if (d != null) return d;
      const t = setMetric(s, 'time', ex?.measure); if (t != null) return t;
      return setMetric(s, 'reps', ex?.measure) ?? -1;
    };
    const reps = (s) => setMetric(s, 'reps', ex?.measure) ?? -1;
    return sets.reduce((best, s) => {
      if (!best) return s;
      if (score(s) > score(best)) return s;
      if (score(s) === score(best) && reps(s) > reps(best)) return s;
      return best;
    }, null);
  };
  // Compact "135lb ×10" style summary of one saved set, across any metric.
  // Lo guardado siempre esta en libras; aqui se muestra en la unidad que el
  // cliente eligio para ESE ejercicio. Quien carga en kilos leia "60lb" y tenia
  // que convertir de cabeza antes de decidir que poner hoy.
  const fmtPastSet = (s, ex, unit = 'lb') => {
    const parts = [];
    if (s.bw) parts.push('BW');
    else { const w = setMetric(s, 'weight', ex?.measure); if (w != null) parts.push(unit === 'kg' ? `${lbToKgDisplay(w)}kg` : `${w}lb`); }
    const r = setMetric(s, 'reps', ex?.measure); if (r != null) parts.push(`×${r}`);
    const d = setMetric(s, 'distance', ex?.measure); if (d != null) parts.push(`${d}${unitLabel(ex?.units?.distance || 'yd')}`);
    const t = setMetric(s, 'time', ex?.measure); if (t != null) parts.push(`${t}${unitLabel(ex?.units?.time || 's')}`);
    return parts.join(' ');
  };

  // Effective measure (legacy, for old-log fallback) and log-metrics per exercise.
  const measureByEx = {};
  const logMetricsByEx = {};
  workout.items.forEach((it) => {
    if (it._isText) return;
    const ex = data.exercises.find((e) => e.id === it.exerciseId);
    if (ex) { measureByEx[it.exerciseId] = it.measure || ex.measure || 'reps'; logMetricsByEx[it.exerciseId] = logMetricsOf(ex); }
  });
  const lmFor = (exId) => logMetricsByEx[exId] || ['weight', 'reps'];
  // Member's remembered weight unit (lb | kg). BW is per-exercise, never the default.
  const unitPref = (() => { try { return localStorage.getItem(`fw-weight-unit-${member.id}`) || 'lb'; } catch { return 'lb'; } })();
  // Convert an entered weight between display units (lb <-> kg). BW passes through.
  const convertWeight = (val, from, to) => {
    if (val === '' || val == null || from === to) return val;
    const n = Number(val); if (Number.isNaN(n)) return val;
    if (from === 'lb' && to === 'kg') return String(lbToKgDisplay(n));
    if (from === 'kg' && to === 'lb') return String(kgToLb(n));
    return val;
  };

  // Autosave draft — survives closing the app / leaving mid-workout. Keyed to
  // this exact session (member + workout + program week/day or date). Cleared on
  // a successful save; kept otherwise so nothing entered is ever lost.
  const draftKey = `fw-log-draft-${member.id}-${workout.id}-${programWeek ?? 'x'}-${programDayNumber ?? 'x'}-${date || todayISO()}`;
  const draft = (() => { try { return JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch { return null; } })();
  const [restored] = useState(!!draft);

  // Per-exercise weight unit: 'lb' | 'kg' | 'bw'. Seed from the draft, or mark
  // bodyweight where a saved log used it; otherwise falls back to unitPref.
  const [wUnit, setWUnit] = useState(() => {
    if (draft?.wUnit) return draft.wUnit;
    const m = {};
    (existingLog?.sets || []).forEach((s) => { if (s.bw) m[s.exerciseId] = 'bw'; });
    return m;
  });
  const wUnitFor = (exId) => wUnit[exId] || unitPref;

  const [readiness, setReadiness] = useState(draft?.readiness ?? existingLog?.readiness ?? 3);
  const [exerciseNotes, setExerciseNotes] = useState(draft?.exerciseNotes ?? existingLog?.exerciseNotes ?? {});
  const [saving, setSaving] = useState(false);
  const [prWon, setPrWon] = useState(null);
  // Which sections the client collapsed — remembered per workout so reopening
  // (or an app reload) keeps their layout instead of expanding everything again.
  const collapsedKey = `fw-collapsed-${member.id}-${workout.id}`;
  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem(collapsedKey) || '{}'); } catch { return {}; }
  });
  const toggleSection = (s) => setCollapsed((c) => ({ ...c, [s]: !c[s] }));
  useEffect(() => {
    try { localStorage.setItem(collapsedKey, JSON.stringify(collapsed)); } catch { /* ignore */ }
  }, [collapsed, collapsedKey]);
  // Same idea, one level down: collapse individual circuits (keyed section+letter).
  const collapsedCircKey = `fw-collapsed-circ-${member.id}-${workout.id}`;
  const [collapsedCirc, setCollapsedCirc] = useState(() => {
    try { return JSON.parse(localStorage.getItem(collapsedCircKey) || '{}'); } catch { return {}; }
  });
  const toggleCircuit = (k) => setCollapsedCirc((c) => ({ ...c, [k]: !c[k] }));
  useEffect(() => {
    try { localStorage.setItem(collapsedCircKey, JSON.stringify(collapsedCirc)); } catch { /* ignore */ }
  }, [collapsedCirc, collapsedCircKey]);
  const [timer, setTimer] = useState(null); // HIIT Tabata timer config
  // Stable per-occurrence key (_key = position) so a repeated exercise keeps its
  // own sets. groupWorkoutItems preserves extra fields, so _key survives grouping.
  const itemsWithKey = workout.items.map((it, i) => ({ ...it, _key: i }));
  const [sets, setSets] = useState(() => {
    // Each set holds a field per possible metric. `itemKey` (the item's position)
    // keeps sets separate when the SAME exercise appears twice in one workout —
    // otherwise both occurrences would share (and show doubled) sets.
    const base = itemsWithKey.filter((it) => !it._isText && it.trackable !== false && it.section !== 'HIIT').flatMap((it) => {
      const ex = data.exercises.find((e) => e.id === it.exerciseId);
      const lm = logMetricsOf(ex);
      const pm = it.measure || ex?.measure || 'reps'; // prescribed metric
      const tgt = (it.target == null || it.target === 'AMAP') ? '' : String(it.target);
      return Array.from({ length: it.sets }).map((_, setIdx) => {
        const s = { exerciseId: it.exerciseId, itemKey: it._key, setNum: setIdx + 1, weight: '', reps: '', distance: '', time: '' };
        if (pm !== 'weight' && lm.includes(pm)) s[pm] = tgt;
        return s;
      });
    });
    // Prefer the in-progress draft; fall back to a previously-saved log. Match by
    // itemKey when the saved set has one, else by exerciseId+setNum (not reusing a
    // slot already filled — so two occurrences don't both grab the first log).
    const source = draft?.sets || existingLog?.sets;
    if (source) {
      const used = new Set();
      source.forEach((saved) => {
        let target = saved.itemKey != null ? base.find((b) => b.itemKey === saved.itemKey && b.setNum === saved.setNum && !used.has(b)) : null;
        if (!target) target = base.find((b) => b.exerciseId === saved.exerciseId && b.setNum === saved.setNum && !used.has(b));
        if (!target) return;
        used.add(target);
        const lm = lmFor(saved.exerciseId);
        const exMeasure = measureByEx[saved.exerciseId];
        const dispUnit = draft ? (draft.wUnit?.[saved.exerciseId] || unitPref) : unitPref;
        lm.forEach((metric) => {
          // Draft holds explicit per-metric fields (in display units); a saved log
          // may be legacy — read via setMetric and convert weight lb → display unit.
          let val = draft ? saved[metric] : setMetric(saved, metric, exMeasure);
          if (val == null || val === '') return;
          if (metric === 'weight' && !draft) val = convertWeight(String(val), 'lb', dispUnit);
          target[metric] = String(val);
        });
      });
    }
    return base;
  });
  // Baseline of the prescribed/loaded values — used to detect real edits so we
  // only autosave a draft once the client actually changes something.
  const baselineRef = useRef(null);
  if (baselineRef.current === null) baselineRef.current = JSON.stringify(sets);
  // Which exercises are open. All trackable ones open by default so the client
  // immediately sees the inputs/demo; remembered per workout so collapsing one
  // and reopening (or an app reload) keeps it collapsed.
  const expandedKey = `fw-expanded-${member.id}-${workout.id}`;
  const [expanded, setExpanded] = useState(() => {
    try { const saved = localStorage.getItem(expandedKey); if (saved) return JSON.parse(saved); } catch { /* ignore */ }
    return itemsWithKey.filter((it) => !it._isText && it.trackable !== false && it.section !== 'HIIT').map((it) => it._key);
  });
  useEffect(() => { try { localStorage.setItem(expandedKey, JSON.stringify(expanded)); } catch { /* ignore */ } }, [expanded, expandedKey]);
  const toggle = (exId) => setExpanded((prev) => (prev.includes(exId) ? prev.filter((id) => id !== exId) : [...prev, exId]));
  const updateSet = (i, patch) => setSets((s) => s.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  // Switch an exercise's weight unit; converts already-entered weights so the
  // same load is preserved, and remembers lb/kg as the member's default.
  const setExUnit = (exId, to) => {
    const from = wUnitFor(exId);
    if (from === to) return;
    setWUnit((m) => ({ ...m, [exId]: to }));
    if (to !== 'bw') { try { localStorage.setItem(`fw-weight-unit-${member.id}`, to); } catch { /* ignore */ } }
    if (from !== 'bw' && to !== 'bw') {
      setSets((arr) => arr.map((s) => (s.exerciseId === exId ? { ...s, weight: convertWeight(s.weight, from, to) } : s)));
    }
  };

  // When is a set "done"? The prescribed metric (reps / distance / time) is
  // pre-filled, so for a weight-tracking exercise the real signal is the WEIGHT the
  // client enters — otherwise every set would read as done (3/3) from the start.
  // Bodyweight and metric-only exercises fall back to their tracked metric.
  const isEntered = (s) => {
    const lm = lmFor(s.exerciseId);
    const u = wUnitFor(s.exerciseId);
    if (lm.includes('weight') && u !== 'bw') return s.weight !== '' && s.weight != null;
    return lm.some((metric) => metric !== 'weight' && s[metric] !== '' && s[metric] != null);
  };

  // Persist a draft whenever anything is entered, so leaving mid-workout is safe.
  useEffect(() => {
    try {
      const changed = baselineRef.current !== JSON.stringify(sets);
      const hasData = readiness !== 3 || Object.keys(exerciseNotes).length > 0 || changed;
      if (hasData) localStorage.setItem(draftKey, JSON.stringify({ readiness, exerciseNotes, sets, wUnit }));
    } catch { /* storage unavailable — ignore */ }
  }, [readiness, exerciseNotes, sets, wUnit, draftKey]);

  // Session status for the banner: NOT STARTED → IN PROGRESS → COMPLETED.
  const enteredCount = sets.filter(isEntered).length;
  const status = sets.length === 0 ? null : enteredCount === 0 ? 'NOT STARTED' : enteredCount >= sets.length ? 'COMPLETED' : 'IN PROGRESS';

  const save = async () => {
    if (saving) return;
    // Normalize to pounds so all tracking is consistent: kg → lb, BW → 0 with a flag.
    // Store an explicit field per logged metric; weight is normalized to pounds.
    const validSets = sets.map((s) => {
      const lm = lmFor(s.exerciseId);
      const u = wUnitFor(s.exerciseId);
      const out = { exerciseId: s.exerciseId, setNum: s.setNum, itemKey: s.itemKey };
      let any = false;
      if (lm.includes('weight')) {
        if (u === 'bw') out.bw = true;
        else if (s.weight !== '' && s.weight != null) { const w = Number(s.weight); if (!Number.isNaN(w)) { out.weight = u === 'kg' ? kgToLb(w) : w; any = true; } }
      }
      ['reps', 'distance', 'time'].forEach((metric) => {
        if (lm.includes(metric) && s[metric] !== '' && s[metric] != null) {
          const n = Number(s[metric]);
          if (!Number.isNaN(n)) { out[metric] = n; any = true; }
        }
      });
      return any ? out : null;
    }).filter(Boolean);
    // A workout with only performed-only / HIIT work has no trackable sets — allow
    // logging it as done. Otherwise require at least one entered set.
    if (sets.length > 0 && validSets.length === 0) { showToast('Enter at least one set.'); return; }
    // Los récords se calculan sobre validSets, que ya están normalizados a
    // libras — así la celebración mide exactamente lo que se guarda.
    const records = [];
    for (const vs of validSets) {
      const ex = data.exercises.find((e) => e.id === vs.exerciseId);
      const prior = ex ? prByEx[vs.exerciseId] : null;
      if (!ex || !prior) continue;
      const v = prValueOfSet(vs, ex, prMetricOf(ex));
      if (!beatsPR(v, prior)) continue;
      const yaEsta = records.find((r) => r.exId === ex.id);
      if (yaEsta) { if (beatsPR(v, { ...prior, value: yaEsta.value })) yaEsta.value = v; continue; }
      const m = prMetricOf(ex);
      const enKg = (m === 'load' || m === 'weight') && wUnitFor(ex.id) === 'kg';
      const unidad = (m === 'load' || m === 'weight') ? (enKg ? 'kg' : 'lb')
        : m === 'distance' ? unitLabel(ex.units?.distance || 'yd')
        : unitLabel(ex.units?.time || 's');
      // La comparacion ya se hizo en libras; para la pantalla se convierten
      // copias, sin tocar lo que se guarda ni lo que decide si hubo record.
      const aKg = (val) => (m === 'load' ? { ...val, weight: lbToKgDisplay(val.weight) } : lbToKgDisplay(val));
      const mostrado = enKg ? aKg(v) : v;
      const priorMostrado = enKg ? { ...prior, value: aKg(prior.value) } : prior;
      records.push({ exId: ex.id, name: ex.name, value: mostrado, prior: priorMostrado, metric: m, unidad });
    }

    setSaving(true);
    try {
      const res = await saveWorkoutLog({
        memberId: member.id, workoutId: workout.id, date: date || todayISO(),
        readiness, exerciseNotes, sets: validSets,
        programWeek: programWeek ?? null, programDayNumber: programDayNumber ?? null,
      }, member.points);
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      await refresh();
      showToast(res.isNew ? `${member.name.split(' ')[0]} logged · +10 pts.` : 'Updated.');
      if (records.length) setPrWon(records); else onDone?.();
    } catch (err) { showToast(err.message || 'Could not save the log.'); }
    finally { setSaving(false); }
  };

  const grouped = groupWorkoutItems(itemsWithKey);

  // Qué fue lo que mejoró. A mismo peso con más reps, decir "levantaste más"
  // sería falso: levantó lo mismo, más veces.
  const compararPR = (r) => {
    if (r.metric === 'load') {
      const dw = r.value.weight - r.prior.value.weight;
      if (dw > 0) return `Son ${Math.round(dw * 2) / 2} ${r.unidad} más que nunca.`;
      return `Mismo peso, ${r.value.reps - r.prior.value.reps} rep${r.value.reps - r.prior.value.reps === 1 ? '' : 's'} más.`;
    }
    const d = Math.round(Math.abs(r.value - r.prior.value) * 100) / 100;
    return `Son ${d} ${r.unidad} ${r.prior.lower ? 'menos' : 'más'} que nunca.`;
  };

  // La celebración aparece una sola vez, al guardar, y no se queda: en la
  // gráfica el azul es historia, aquí es noticia.
  if (prWon) {
    return (
      <div className="p-6 md:p-8 anim-up" style={{ background: C.heritage, color: '#fff' }}>
        <div className="mono mb-2" style={{ fontSize: '12px', letterSpacing: '0.14em', fontWeight: 700, color: '#C9D8FF' }}>
          ▲ {prWon.length === 1 ? 'NUEVO RÉCORD' : `${prWon.length} NUEVOS RÉCORDS`}
        </div>
        {prWon.map((r) => (
          <div key={r.exId} className="mb-5">
            <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: '19px', letterSpacing: '0.008em', color: '#C9D8FF' }}>{r.name}</div>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 'clamp(36px,8.5vw,54px)', lineHeight: 1.05, color: '#fff' }}>
              {prLabel(r.value, r.metric, r.unidad)}
            </div>
            <div style={{ fontSize: '15px', lineHeight: 1.5, color: '#C9D8FF', marginTop: 4 }}>
              {compararPR(r)} Tu marca anterior: {prLabel(r.prior.value, r.metric, r.unidad)}, el {r.prior.date}.
            </div>
          </div>
        ))}
        <button onClick={() => { setPrWon(null); onDone?.(); }} className="mono px-5 py-3 mt-1"
          style={{ fontSize: '12px', letterSpacing: '0.14em', fontWeight: 700, background: '#fff', color: C.heritage }}>
          SEGUIR →
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)' }}>
      {/* Autosave + session status */}
      {status && (
        <div className="flex items-center justify-between gap-2 px-3 py-2.5" style={{ background: restored ? C.forest : C.cream, border: `1px solid ${C.charcoal}20` }}>
          <span className="mono" style={{ fontSize: '11px', letterSpacing: '0.12em', color: restored ? C.bone : C.moss }}>
            {restored ? '↻ WE SAVED YOUR PROGRESS' : '✓ AUTO-SAVED · leave & come back anytime'}
          </span>
          <span className="mono px-2.5 py-1 flex-shrink-0" style={{ fontSize: '11px', letterSpacing: '0.1em', fontWeight: 700,
            background: status === 'COMPLETED' ? C.gold : status === 'IN PROGRESS' ? C.ink : 'transparent',
            color: status === 'COMPLETED' ? C.ink : status === 'IN PROGRESS' ? C.gold : C.moss,
            border: status === 'NOT STARTED' ? `1px solid ${C.charcoal}30` : 'none' }}>{status}</span>
        </div>
      )}

      {/* Readiness */}
      <div className="p-4" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        <div className="mono mb-1" style={{ fontSize: '13px', letterSpacing: '0.1em', color: C.moss, fontWeight: 600 }}>READINESS</div>
        <div className="mb-3" style={{ fontSize: '15px', color: C.ink }}>How recovered &amp; prepared did you feel going in?</div>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setReadiness(n)} className="flex-1 py-3 text-center" style={{ background: readiness === n ? C.gold : C.cream, border: `1px solid ${readiness === n ? C.gold : C.charcoal + '25'}` }}>
              <div className="ui-strong" style={{ fontSize: '26px', lineHeight: 1, color: readiness === n ? C.gold : C.ink }}>{n}</div>
              <div className="mono mt-1" style={{ fontSize: '11px', letterSpacing: '0.05em', color: readiness === n ? C.sand : C.moss }}>{READINESS_LABELS[n].label.toUpperCase()}</div>
            </button>
          ))}
        </div>
        <div className="mt-2.5 text-center" style={{ fontSize: '15px', color: C.ink }}><strong>{READINESS_LABELS[readiness].label}:</strong> {READINESS_LABELS[readiness].desc}</div>
      </div>

      {grouped.length === 0 ? (
        <div className="p-4 text-center mono" style={{ fontSize: '11px', color: C.moss, border: `1px dashed ${C.charcoal}30` }}>NO EXERCISES IN THIS WORKOUT</div>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => (
            <div key={g.section} style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
              <button type="button" onClick={() => toggleSection(g.section)} className="w-full flex items-center justify-between p-3 text-left" style={{ background: C.cream, color: C.ink }}>
                <div>
                  <div className="mono" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.gold, fontWeight: 600 }}>SECTION</div>
                  <div className="display leading-tight" style={{ fontSize: '22px', color: C.cream, fontWeight: 600, letterSpacing: '0.02em' }}>{g.section}</div>
                </div>
                <span className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: '50%', border: `2px solid ${C.gold}`, color: C.gold, fontSize: '20px', lineHeight: 1, fontWeight: 700 }}>{collapsed[g.section] ? '+' : '−'}</span>
              </button>
              {!collapsed[g.section] && (g.section === 'Prep Work' ? (
                <div className="p-2.5 space-y-1.5">
                  {g.circuits.flatMap((c) => c.items).map((it, idx) => (
                    <div key={idx} className="flex items-start gap-2 px-2 py-1.5" style={{ background: C.bone, border: `1px solid ${C.charcoal}15` }}>
                      <div className="mono pt-0.5" style={{ fontSize: '14px', color: C.gold }}>·</div>
                      <div className="text-sm" style={{ color: C.ink, fontStyle: 'italic' }}>{it.text || ''}</div>
                    </div>
                  ))}
                </div>
              ) : g.section === 'HIIT' ? (
                <div className="p-2.5 space-y-2">
                  {g.circuits.map((c) => {
                    const p = { rounds: c.items[0]?.rounds ?? 1, workSec: c.items[0]?.workSec ?? 0, restSec: c.items[0]?.restSec ?? 0 };
                    return (
                      <div key={c.letter} style={{ background: C.bone, border: `1px solid ${C.charcoal}15` }}>
                        <div className="flex items-center justify-between gap-2 px-3 py-2.5" style={{ background: C.cream, color: C.ink }}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="display" style={{ fontSize: '24px', color: C.gold, fontWeight: 600, lineHeight: 1 }}>{p.rounds}<span className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em' }}> ROUNDS</span></div>
                            <div className="mono" style={{ fontSize: '13px', letterSpacing: '0.1em', color: C.sand }}>{p.workSec}s WORK · {p.restSec}s REST</div>
                          </div>
                          <button onClick={() => setTimer({ rounds: p.rounds, workSec: p.workSec, restSec: p.restSec, exercises: c.items.map((it) => data.exercises.find((e) => e.id === it.exerciseId)?.name).filter(Boolean) })}
                            className="mono px-3 py-2 flex-shrink-0" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.gold, color: C.bone, fontWeight: 600 }}>▶ TIMER</button>
                        </div>
                        <div className="p-2.5 space-y-1">
                          {c.items.map((it, ii) => {
                            const ex = data.exercises.find((e) => e.id === it.exerciseId);
                            return (
                              <div key={ii} className="px-3 py-2" style={{ background: C.cream, border: `1px solid ${C.charcoal}10` }}>
                                <span className="prog-name" style={{ fontSize: '20px' }}>{ex?.name || '?'}</span>
                                {ex?.videoUrl && <span className="ml-2 align-middle"><VideoDemo url={ex.videoUrl} /></span>}
                              </div>
                            );
                          })}
                        </div>
                        {c.items.length > 1 && <div className="help px-3 pb-2" style={{ fontSize: '13px', color: C.gold }}>— all exercises each round, back-to-back.</div>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-2.5 space-y-2">
                  {g.circuits.map((c) => {
                    const circKey = `${g.section}-${c.letter}`;
                    const circCollapsed = !!collapsedCirc[circKey];
                    return (
                    <div key={c.letter} style={{ background: C.bone, border: `1px solid ${C.charcoal}15` }}>
                      <button type="button" onClick={() => toggleCircuit(circKey)} className="w-full flex items-center justify-between px-3 py-2 text-left" style={{ background: C.cream, borderBottom: circCollapsed ? 'none' : `1px solid ${C.charcoal}15` }}>
                        <div className="flex items-center gap-2">
                          <div className="ui-strong" style={{ fontSize: '24px', color: C.gold, lineHeight: 1 }}>{c.letter}</div>
                          <div className="mono" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.moss, fontWeight: 600 }}>CIRCUIT · {c.items.length} EX</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.items.length > 1 && !circCollapsed && <span style={{ fontSize: '13px', color: C.gold, fontStyle: 'italic' }}>back-to-back</span>}
                          <span className="flex items-center justify-center flex-shrink-0" style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${C.gold}`, color: C.gold, fontSize: '16px', lineHeight: 1, fontWeight: 700 }}>{circCollapsed ? '+' : '−'}</span>
                        </div>
                      </button>
                      {!circCollapsed && (
                      <div>
                        {c.items.map((item, itemIdx) => {
                          const ex = data.exercises.find((e) => e.id === item.exerciseId);
                          if (!ex) return null;
                          const exId = ex.id;
                          const measure = item.measure || ex.measure; // per-item override
                          const unit = ex.units?.[measure] || ex.unit; // unit for that measure
                          const tempoStr = formatTempo(item?.tempo);
                          const isTrackable = item.trackable !== false;
                          const isExpanded = expanded.includes(item._key);
                          const exSets = isTrackable ? sets.map((s, idx) => ({ ...s, _idx: idx })).filter((s) => s.itemKey === item._key) : [];
                          const completed = isTrackable && exSets.length > 0 && exSets.every(isEntered);
                          const anyEntered = isTrackable && exSets.some(isEntered);
                          // % 1RM can be based on a linked test exercise's best, else this exercise's own history.
                          const rmSourceId = ex.oneRmSourceId || exId;
                          const rmSourceName = ex.oneRmSourceId ? data.exercises.find((e) => e.id === ex.oneRmSourceId)?.name : null;
                          const est = isTrackable && item?.loadPct > 0 ? bestEstimated1RM(pastLogs, rmSourceId) : null;
                          const suggested = est ? suggestedLoadForPct(est.value, item.loadPct) : null;
                          const timeSeconds = measure === 'time' && item.target && item.target !== 'AMAP'
                            ? (unit === 'min' ? Number(item.target) * 60 : Number(item.target)) : 0;
                          const note = (item.note || '').trim();
                          return (
                            <div key={`${exId}-${itemIdx}`} style={{ borderBottom: itemIdx < c.items.length - 1 ? `1px solid ${C.charcoal}10` : 'none' }}>
                              <button onClick={() => isTrackable && toggle(item._key)} disabled={!isTrackable} className="w-full flex items-center gap-2 p-2.5 text-left" style={{ cursor: isTrackable ? 'pointer' : 'default', background: isExpanded ? C.charcoal + '12' : 'transparent' }}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <div className="prog-name" style={{ fontSize: '23px', color: C.ink }}>{ex.name}</div>
                                    {!isTrackable && <span className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>PERFORMED ONLY</span>}
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                    <span className="mono px-2.5 py-1.5" style={{ fontSize: '15px', background: C.gold, color: C.bone, fontWeight: 700 }}>{item.sets} × {item.target}{measure !== 'reps' && unit ? ` ${unitLabel(unit)}` : ''}{item.perSide ? ' / side' : ''}</span>
                                    {tempoStr && <span className="mono px-2.5 py-1.5" style={{ fontSize: '15px', background: C.forest, color: C.ink, fontWeight: 600 }}>{tempoStr}</span>}
                                    {isTrackable && item?.loadPct > 0 && <span className="mono px-2.5 py-1.5" title={rmSourceName ? `${item.loadPct}% of your ${rmSourceName} 1RM` : `${item.loadPct}% of your estimated 1RM`} style={{ fontSize: '15px', background: C.cream, color: C.gold, fontWeight: 600 }}>{item.loadPct}%{suggested ? ` · ${wUnitFor(exId) === 'kg' ? `${lbToKgDisplay(suggested)}kg` : `${suggested}lb`}` : ''}{rmSourceName ? ' ▲' : ''}</span>}
                                  </div>
                                </div>
                                {isTrackable && (
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {completed ? <span className="mono" style={{ fontSize: '12px', color: C.gold, fontWeight: 700 }}>✓ {exSets.length}/{exSets.length}</span>
                                      : anyEntered ? <span className="mono" style={{ fontSize: '12px', color: C.gold, fontWeight: 700 }}>{exSets.filter(isEntered).length}/{exSets.length}</span>
                                      : <span className="mono px-2 py-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: isExpanded ? C.gold : C.ink, background: isExpanded ? C.ink : C.gold, fontWeight: 700 }}>{isExpanded ? 'LOGGING' : `LOG ${exSets.length}`}</span>}
                                    <ChevronDown size={20} style={{ color: C.moss, flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                  </div>
                                )}
                              </button>

                              {/* La nota que el coach dejo en este ejercicio va en su
                                  letra: la guia de marca reserva Caveat para "personal ·
                                  coach note" y esto es exactamente eso. Las comillas
                                  salen sobrando cuando la letra ya dice de quien es, y
                                  sube a 18px porque Caveat tiene la altura de x corta. */}
                              {note && (
                                <div className="hand px-2.5 pb-1.5" style={{ fontSize: '18px', color: C.gold, lineHeight: 1.35 }}>{note}</div>
                              )}
                              {/* Demo + timer live here so they're reachable WITHOUT expanding; both share one look. */}
                              {(ex.videoUrl || timeSeconds > 0) && (
                                <div className="px-2.5 pb-2 flex items-center gap-2 flex-wrap">
                                  {ex.videoUrl && <VideoDemo url={ex.videoUrl} big />}
                                  {timeSeconds > 0 && (
                                    <button type="button" onClick={() => setTimer({ rounds: 1, workSec: timeSeconds, restSec: 0, exercises: [ex.name] })}
                                      className="mono inline-flex items-center gap-1.5 px-3 py-2" style={{ fontSize: '14px', letterSpacing: '0.1em', background: C.cream, color: C.gold, fontWeight: 600, border: 0, cursor: 'pointer' }}>▶ {timeSeconds}s TIMER</button>
                                  )}
                                </div>
                              )}

                              {isTrackable && isExpanded && (
                                <div className="p-2.5 space-y-2" style={{ background: C.bone, borderTop: `1px solid ${C.charcoal}15` }}>
                                  {(() => {
                                    const last = lastSessionFor(exId);
                                    if (!last) return null;
                                    const best = bestPastSet(last.sets, ex);
                                    return (
                                      <div className="px-3 py-2" style={{ background: C.cream, borderLeft: `3px solid ${C.forest}` }}>
                                        <div className="mono mb-0.5" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>LAST TIME · BEST SET · {last.date}</div>
                                        <div className="mono" style={{ fontSize: '16px', color: C.ink, fontWeight: 700 }}>{(best && fmtPastSet(best, ex, wUnitFor(exId))) || '—'}</div>
                                        {last.note && <div className="mt-1" style={{ fontSize: '14px', color: C.gold, fontStyle: 'italic', lineHeight: 1.35 }}>“{last.note}”</div>}
                                      </div>
                                    );
                                  })()}
                                  {(() => {
                                    const lm = lmFor(exId);
                                    const wu = wUnitFor(exId);
                                    const distUnit = ex.units?.distance || 'yd';
                                    const timeUnit = ex.units?.time || 's';
                                    return (
                                      <>
                                        {lm.includes('weight') && (
                                          <div className="flex items-center gap-1.5">
                                            <span className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>WEIGHT IN</span>
                                            {['lb', 'kg', 'bw'].map((u) => (
                                              <button key={u} type="button" onClick={() => setExUnit(exId, u)} className="mono px-2.5 py-1"
                                                style={{ fontSize: '12px', letterSpacing: '0.1em', fontWeight: 700, background: wu === u ? C.gold : C.cream, color: wu === u ? C.bone : C.moss, border: `1px solid ${wu === u ? C.gold : C.charcoal + '25'}` }}>
                                                {u.toUpperCase()}
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                        {exSets.map((s) => {
                                          const i = s._idx;
                                          const showEst = lm.includes('weight') && lm.includes('reps') && wu !== 'bw' && s.weight && s.reps;
                                          // ¿Esta serie rompe su marca? El peso se guarda siempre en
                                          // libras, así que kg se convierte antes de comparar — si no,
                                          // 100 kg parecerían menos que 200 lb.
                                          const prPrior = prByEx[exId];
                                          const prMetric = prMetricOf(ex);
                                          const prDraft = prValueOfSet({
                                            weight: wu === 'kg' ? kgToLb(Number(s.weight)) : Number(s.weight),
                                            reps: Number(s.reps), time: Number(s.time), distance: Number(s.distance),
                                            bw: wu === 'bw',
                                          }, ex, prMetric);
                                          const isPR = beatsPR(prDraft, prPrior);
                                          return (
                                            <div key={i} className="flex items-stretch gap-2">
                                              <div className="mono flex items-center justify-center flex-shrink-0" style={{ width: 18, fontSize: '15px', color: C.gold, fontWeight: 700 }}>{s.setNum}</div>
                                              <div className="flex-1 flex flex-wrap gap-2">
                                                {lm.map((metric) => {
                                                  if (metric === 'weight') {
                                                    return wu === 'bw' ? (
                                                      <div key={metric} className="flex items-center justify-center px-2 py-2.5" style={{ ...setInputStyle, flex: '1 1 76px', minWidth: 76 }}>
                                                        <span className="mono" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.moss, fontWeight: 700 }}>BODYWEIGHT</span>
                                                      </div>
                                                    ) : (
                                                      <div key={metric} className="relative" style={{ flex: '1 1 76px', minWidth: 76 }}>
                                                        <input value={s.weight} onChange={(e) => updateSet(i, { weight: e.target.value })} inputMode="decimal"
                                                          placeholder={suggested ? `${wu === 'kg' ? lbToKgDisplay(suggested) : suggested}` : 'Weight'}
                                                          className="w-full px-3 py-2.5 pr-8" style={setInputStyle} />
                                                        <span className="mono absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ fontSize: '12px', color: C.moss, fontWeight: 600 }}>{wu}</span>
                                                      </div>
                                                    );
                                                  }
                                                  if (metric === 'reps') {
                                                    return (
                                                      <div key={metric} className="relative" style={{ flex: '1 1 76px', minWidth: 76 }}>
                                                        <input value={s.reps} onChange={(e) => updateSet(i, { reps: e.target.value })} inputMode="numeric" placeholder="Reps" className="w-full px-3 py-2.5 pr-10" style={setInputStyle} />
                                                        <span className="mono absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ fontSize: '12px', color: C.moss, fontWeight: 600 }}>reps</span>
                                                      </div>
                                                    );
                                                  }
                                                  const u2 = metric === 'time' ? timeUnit : distUnit;
                                                  return (
                                                    <div key={metric} className="relative" style={{ flex: '1 1 76px', minWidth: 76 }}>
                                                      <input value={s[metric]} onChange={(e) => updateSet(i, { [metric]: e.target.value })} inputMode="decimal"
                                                        placeholder={metric === 'time' ? 'Time' : 'Dist'} className="w-full px-3 py-2.5 pr-9" style={setInputStyle} />
                                                      <span className="mono absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ fontSize: '12px', color: C.moss, fontWeight: 600 }}>{unitLabel(u2)}</span>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                              {showEst ? <div className="mono flex items-center flex-shrink-0" style={{ fontSize: '12px', color: C.gold, fontWeight: 600 }}>≈{estimate1RMFromSet(Number(s.weight), Number(s.reps))}</div> : null}
                                              {/* El azul toca el dato, no la fila: si se pinta el bloque
                                                  entero deja de señalar y empieza a decorar. */}
                                              {isPR && (
                                                <div className="mono flex items-center flex-shrink-0 px-1.5" title="Récord personal"
                                                  style={{ fontSize: '11px', letterSpacing: '0.08em', background: C.heritage, color: '#fff', fontWeight: 700 }}>▲ PR</div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </>
                                    );
                                  })()}
                                  <div className="pt-1">
                                    <input value={exerciseNotes[exId] || ''} onChange={(e) => setExerciseNotes((prev) => ({ ...prev, [exId]: e.target.value }))}
                                      placeholder="Notes — form cues, how it felt, pain..." className="w-full px-2.5 py-1.5 text-sm" style={{ background: C.cream, color: C.ink, border: `1px solid ${C.charcoal}25`, fontStyle: 'italic' }} />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      )}
                    </div>
                  );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {workout.closingMessage && (
        <div className="p-4 text-center" style={{ background: C.cream, border: `2px solid ${C.gold}` }}>
          <div className="mono mb-1.5" style={{ fontSize: '11px', letterSpacing: '0.14em', color: C.gold }}>— FROM YOUR COACH —</div>
          {/* Caveat. La guía de marca la reserva para "personal · coach note" y
              este texto lleva el rótulo "FROM YOUR COACH" encima: si algo en la
              app es la voz del coach, es esto. Sube a 22px porque la
              manuscrita tiene la altura de x muy corta. */}
          <div className="hand" style={{ fontSize: '22px', lineHeight: 1.35, color: C.cream, whiteSpace: 'pre-wrap' }}>{workout.closingMessage}</div>
        </div>
      )}

      {/* Technique questions. Not a link — a video of the actual rep is worth
          more than a described one, and saying so is what gets it sent. Coach
          mode is staff logging for a client, so it's off there. */}
      {!coach && (
        <div className="p-4 text-center" style={{ background: C.cream, border: `1px dashed ${C.charcoal}40` }}>
          <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>¿DUDAS DE TÉCNICA?</div>
          <div className="hand" style={{ fontSize: '17px', color: C.moss, lineHeight: 1.35 }}>
            — mándame un video por WhatsApp haciendo el ejercicio y lo revisamos juntos.
          </div>
        </div>
      )}

      {/* Save bar is ALWAYS reachable: BottomBar portals it out of any ancestor
          overflow/transform and pins it to the visible bottom, so it rides above
          the keyboard while logging sets instead of stranding mid-screen. */}
      <BottomBar className="z-40 flex gap-2 px-3" style={{ paddingTop: '10px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)', background: C.bone, borderTop: `1px solid ${C.charcoal}25`, boxShadow: '0 -4px 16px rgba(0,0,0,0.14)' }}>
        <div className="flex gap-2 w-full max-w-3xl mx-auto">
          <button onClick={onDone} className="mono px-4 py-3" style={{ fontSize: '13px', letterSpacing: '0.1em', background: C.cream, color: C.moss, border: `1px solid ${C.charcoal}30` }}>CLOSE</button>
          <button onClick={save} disabled={saving} className="mono flex-1 py-3" style={{ fontSize: '14px', letterSpacing: '0.1em', background: C.cream, color: C.gold }}>{saving ? 'SAVING…' : existingLog ? 'UPDATE SESSION' : 'SAVE SESSION →'}</button>
        </div>
      </BottomBar>

      {timer && <TabataTimer rounds={timer.rounds} workSec={timer.workSec} restSec={timer.restSec} exercises={timer.exercises} onClose={() => setTimer(null)} />}
    </div>
  );
}
