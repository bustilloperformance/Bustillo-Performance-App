import { useState } from 'react';
import { Plus, Search, Edit2, Trash2, Dumbbell, Timer, Ruler, VideoOff } from 'lucide-react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast, useConfirm } from '../../components/feedback';
import { saveExercise, deleteExercise } from '../../data/exercises';
import { getYouTubeId, unitLabel, defaultLogMetrics, LOG_METRIC_LABEL } from '../../lib/helpers';
import { EXERCISE_SECTIONS, EXERCISE_SECTION_IDS } from '../../lib/workoutHelpers';
import { PageHeader, Btn, Modal, Field } from '../../components/ui';
import { inputClass, inputStyle } from '../../components/uiStyles';
import SearchSelect from '../../components/SearchSelect';
import VideoDemo from '../../components/VideoDemo';

const MEASURE_ICON = { reps: Dumbbell, time: Timer, distance: Ruler };
const TIME_UNITS = [{ id: 's', label: 'SECONDS' }, { id: 'min', label: 'MINUTES' }];
const DIST_UNITS = [{ id: 'yd', label: 'YARDS' }, { id: 'ft', label: 'FEET' }, { id: 'in', label: 'INCHES' }, { id: 'ft-in', label: 'FEET + INCHES' }, { id: 'm', label: 'METERS' }];
const BLANK = { name: '', category: '', measure: 'reps', measures: ['reps'], unit: '', units: {}, isTest: false, videoUrl: '', progressionId: '', regressionId: '', oneRmSourceId: '', sections: ['Strength'] };
const M_SHORT = { reps: 'REPS', time: 'TIME', distance: 'DIST' };
// Condensed measures label, e.g. "REPS · TIME (s)" or "DIST (yd)".
function measuresText(e) {
  const ms = (e.measures && e.measures.length) ? e.measures : [e.measure || 'reps'];
  return ms.map((m) => {
    const u = m !== 'reps' ? e.units?.[m] : null;
    return u ? `${M_SHORT[m]} (${unitLabel(u)})` : M_SHORT[m];
  }).join(' · ');
}

// ============================================================
//  EXERCISE LIBRARY — staff screen to manage the movement catalog.
//  Reads via useData(); creates/updates/deletes via data/exercises
//  (saveExercise / deleteExercise). Handles measures, log metrics,
//  units, sections, video demos and progression/regression ladders.
// ============================================================
export default function ExerciseLibrary() {
  const { data, refresh } = useData();
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [noDemoOnly, setNoDemoOnly] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  // Same test the row uses to decide whether to show PLAY, so the filter can
  // never disagree with what you see: a link we can't play isn't a demo.
  const hasDemo = (e) => !!getYouTubeId(e.videoUrl);

  const sectionFiltered = data.exercises.filter(
    (e) => sectionFilter === 'all' || (e.sections || ['Strength']).includes(sectionFilter)
  );
  // Categories A→Z (they'd otherwise follow whatever order the exercises load in).
  const categories = ['all', ...[...new Set(sectionFiltered.map((e) => e.category).filter(Boolean))].sort((a, b) => a.localeCompare(b))];
  // Derive the effective category filter — if the current one isn't valid for
  // the selected section, fall back to 'all' (no effect needed).
  const activeFilter = categories.includes(filter) ? filter : 'all';
  const inScope = sectionFiltered.filter((e) => activeFilter === 'all' || e.category === activeFilter);
  // Counted before the search box narrows things, so the badge answers "how
  // many are still missing a demo here", not "how many match what I typed".
  const missingDemos = inScope.filter((e) => !hasDemo(e)).length;
  const filtered = inScope
    .filter((e) => e.name.toLowerCase().includes(search.toLowerCase()) && (!noDemoOnly || !hasDemo(e)))
    .sort((a, b) => a.name.localeCompare(b.name)); // A→Z regardless of DB collation

  const openNew = () => { setEditing(null); setForm(BLANK); setShowForm(true); };
  const openEdit = (e) => { setEditing(e); setForm(e); setShowForm(true); };

  const save = async () => {
    if (!form.name || saving) return;
    setSaving(true);
    try {
      await saveExercise(form, editing);
      await refresh();
      setShowForm(false);
      showToast(editing ? 'Exercise updated.' : 'Exercise added.');
    } catch (err) {
      showToast(err.message || 'Could not save the exercise.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (id) => {
    const ex = data.exercises.find((e) => e.id === id);
    askConfirm({
      message: 'Delete this exercise?',
      detail: ex ? `"${ex.name}" will be removed from your library. Workouts using it keep the reference but it won't show in pickers.` : '',
      confirmLabel: 'DELETE EXERCISE',
      onConfirm: async () => {
        try { await deleteExercise(id); await refresh(); showToast('Exercise removed.'); }
        catch (err) { showToast(err.message || 'Could not delete.'); }
      },
    });
  };

  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="05" section="METHOD · MOVEMENT LIBRARY" title="Exercises."
        subtitle="— sprint · jump · push · pull · hinge · squat · carry · rotate."
        action={<Btn icon={Plus} onClick={openNew}>NEW EXERCISE</Btn>} />

      {/* Section filter */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>SECTION ·</span>
        {['all', ...EXERCISE_SECTION_IDS].map((s) => {
          const count = s === 'all' ? data.exercises.length : data.exercises.filter((e) => (e.sections || ['Strength']).includes(s)).length;
          return (
            <button key={s} onClick={() => setSectionFilter(s)} className="mono px-3 py-1.5"
              style={{ fontSize: '11px', letterSpacing: '0.1em', background: sectionFilter === s ? C.gold : C.cream, color: sectionFilter === s ? C.bone : C.moss, border: `1px solid ${C.charcoal}20` }}>
              {s === 'all' ? 'ALL' : s.toUpperCase()}<span style={{ marginLeft: '6px', opacity: 0.6, fontSize: '9px' }}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.moss }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the library..." className="w-full pl-10 pr-4 py-2.5 text-sm" style={inputStyle} />
        </div>
        {/* Missing demos — the fastest way to see what still needs filming. */}
        <button onClick={() => setNoDemoOnly((v) => !v)} className="mono px-3 py-2 flex items-center gap-1.5 flex-shrink-0"
          title={noDemoOnly ? 'Show every exercise' : 'Show only exercises with no video demo'}
          style={{ fontSize: '11px', letterSpacing: '0.1em', background: noDemoOnly ? C.gold : C.cream, color: noDemoOnly ? C.bone : C.moss, border: `1px solid ${noDemoOnly ? C.gold : `${C.charcoal}20`}` }}>
          <VideoOff size={11} className="flex-shrink-0" /> NO VIDEO
          <span style={{ fontSize: '9px', opacity: 0.65 }}>{missingDemos}</span>
        </button>
        <div className="flex gap-1 flex-wrap">
          {categories.map((c) => (
            <button key={c} onClick={() => setFilter(c)} className="mono px-3 py-2"
              style={{ fontSize: '11px', letterSpacing: '0.1em', background: activeFilter === c ? C.gold : C.cream, color: activeFilter === c ? C.bone : C.moss, border: `1px solid ${C.charcoal}20` }}>
              {c.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        {/* Column header — desktop only */}
        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2.5 mono"
          style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss, borderBottom: `1px solid ${C.charcoal}20` }}>
          <div className="col-span-5">EXERCISE</div>
          <div className="col-span-2">CATEGORY</div>
          <div className="col-span-2">MEASURE</div>
          <div className="col-span-3 text-right">VIDEO · ACTIONS</div>
        </div>
        {filtered.map((e) => {
          const Icon = MEASURE_ICON[e.measure] || Dumbbell;
          const hasVideo = hasDemo(e);
          const reg = data.exercises.find((x) => x.id === e.regressionId);
          const prog = data.exercises.find((x) => x.id === e.progressionId);
          return (
            <div key={e.id} className="flex md:grid md:grid-cols-12 md:gap-3 md:items-center px-4 py-3 text-sm group" style={{ borderBottom: `1px solid ${C.charcoal}10` }}>
              <div className="flex-1 min-w-0 md:col-span-5">
                <div className="flex items-center gap-1.5">
                  {e.isTest && <span className="mono px-1 py-0.5 flex-shrink-0" title="Test / Benchmark" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.gold, color: C.bone, lineHeight: 1 }}>▲ TEST</span>}
                  <div className="prog-name truncate" style={{ fontSize: '17px' }}>{e.name}</div>
                </div>
                {(reg || prog) && (
                  <div className="mono mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
                    {reg && <span style={{ color: C.gold }}>↓ {reg.name}</span>}
                    {reg && prog && <span style={{ opacity: 0.4 }}>·</span>}
                    {prog && <span style={{ color: C.gold }}>↑ {prog.name}</span>}
                  </div>
                )}
                {/* Mobile meta: category + measure */}
                <div className="flex md:hidden items-center gap-2 mt-1 flex-wrap mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
                  {e.category && <span className="px-1.5 py-0.5" style={{ background: C.forest, color: C.ink }}>{e.category.toUpperCase()}</span>}
                  <span className="flex items-center gap-1"><Icon size={10} className="flex-shrink-0" /> <span>{measuresText(e)}</span></span>
                </div>
              </div>
              <div className="hidden md:block md:col-span-2 min-w-0">{e.category && <span className="mono px-2 py-0.5 inline-block truncate max-w-full" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.forest, color: C.ink }}>{e.category.toUpperCase()}</span>}</div>
              <div className="hidden md:flex md:col-span-2 min-w-0 items-start gap-1.5 mono flex-wrap" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
                <Icon size={11} className="flex-shrink-0 mt-0.5" /> <span className="break-words">{measuresText(e)}</span>
              </div>
              {/* Video + actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0 ml-2 md:ml-0 md:col-span-3 md:justify-end">
                {hasVideo && <span onClick={(ev) => ev.stopPropagation()}><VideoDemo url={e.videoUrl} label="PLAY" /></span>}
                <button onClick={() => openEdit(e)} className="p-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition" style={{ background: C.bone }}><Edit2 size={11} /></button>
                <button onClick={() => remove(e.id)} className="p-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition" style={{ background: C.gold }}><Trash2 size={11} /></button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-8 text-center ui-strong" style={{ fontSize: '20px', color: C.moss }}>
            {noDemoOnly && !search ? 'Every exercise here has a demo. ✓' : 'No exercises found.'}
          </div>
        )}
      </div>

      {showForm && (
        <Modal title={editing ? 'Edit Exercise' : 'New Exercise'} eyebrow="METHOD · LIBRARY" onClose={() => setShowForm(false)} size="md">
          <div className="space-y-3">
            <Field label="EXERCISE NAME"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} style={inputStyle} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="CATEGORY"><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Push, Squat, Hip, Test · Speed..." className={inputClass} style={inputStyle} /></Field>
              <Field label="MEASURES (ONE OR MORE)">
                <div className="flex flex-wrap gap-1">
                  {[{ id: 'reps', label: 'REPS' }, { id: 'time', label: 'TIME' }, { id: 'distance', label: 'DIST' }].map((m) => {
                    const active = (form.measures || []).includes(m.id);
                    return (
                      <button key={m.id} type="button" onClick={() => {
                        const cur = form.measures || [];
                        let next = active ? cur.filter((x) => x !== m.id) : [...cur, m.id];
                        if (!next.length) next = ['reps'];
                        // keep it in the natural order reps · time · distance
                        next = ['reps', 'time', 'distance'].filter((x) => next.includes(x));
                        // Give each unit-bearing measure a default unit; drop units for removed measures.
                        const units = { ...(form.units || {}) };
                        if (next.includes('time') && !units.time) units.time = 's';
                        if (next.includes('distance') && !units.distance) units.distance = 'yd';
                        Object.keys(units).forEach((k) => { if (!next.includes(k)) delete units[k]; });
                        setForm({ ...form, measures: next, measure: next[0], units });
                      }} className="mono px-3 py-2 flex-1" style={{ fontSize: '11px', letterSpacing: '0.1em', background: active ? C.gold : C.cream, color: active ? C.bone : C.moss, border: `1px solid ${active ? C.gold : C.charcoal + '30'}` }}>
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>

            <Field label="WHAT THE CLIENT LOGS">
              <div className="help mb-1.5" style={{ fontSize: '13px', color: C.moss }}>— e.g. a squat logs weight + reps; a carry logs weight + distance; a broad jump logs distance only.</div>
              <div className="flex flex-wrap gap-1">
                {['weight', 'reps', 'distance', 'time'].map((mt) => {
                  const eff = (form.logMetrics && form.logMetrics.length) ? form.logMetrics : defaultLogMetrics(form);
                  const active = eff.includes(mt);
                  return (
                    <button key={mt} type="button" onClick={() => {
                      let next = active ? eff.filter((x) => x !== mt) : [...eff, mt];
                      if (!next.length) next = ['weight'];
                      next = ['weight', 'reps', 'distance', 'time'].filter((x) => next.includes(x));
                      const units = { ...(form.units || {}) };
                      if (next.includes('time') && !units.time) units.time = 's';
                      if (next.includes('distance') && !units.distance) units.distance = 'yd';
                      setForm({ ...form, logMetrics: next, units });
                    }} className="mono px-3 py-2 flex-1" style={{ fontSize: '11px', letterSpacing: '0.1em', background: active ? C.gold : C.cream, color: active ? C.bone : C.moss, border: `1px solid ${active ? C.gold : C.charcoal + '30'}` }}>
                      {LOG_METRIC_LABEL[mt]}
                    </button>
                  );
                })}
              </div>
            </Field>

            {(() => {
              const eff = (form.logMetrics && form.logMetrics.length) ? form.logMetrics : defaultLogMetrics(form);
              if (eff.length < 2) return null;
              const PRIORITY = ['weight', 'distance', 'time', 'reps'];
              const active = eff.includes(form.graphMetric) ? form.graphMetric : (PRIORITY.find((m) => eff.includes(m)) || eff[0]);
              return (
                <Field label="DEFAULT GRAPH METRIC">
                  <div className="help mb-1.5" style={{ fontSize: '13px', color: C.moss }}>— which metric the progress chart shows first (e.g. a sprint graphs TIME, a carry graphs WEIGHT).</div>
                  <div className="flex flex-wrap gap-1">
                    {eff.map((mt) => (
                      <button key={mt} type="button" onClick={() => setForm({ ...form, graphMetric: mt })} className="mono px-3 py-2 flex-1" style={{ fontSize: '11px', letterSpacing: '0.1em', background: active === mt ? C.gold : C.cream, color: active === mt ? C.bone : C.moss, border: `1px solid ${active === mt ? C.gold : C.charcoal + '30'}` }}>
                        {LOG_METRIC_LABEL[mt]}
                      </button>
                    ))}
                  </div>
                </Field>
              );
            })()}

            {/* Qué cuenta como mejorar en este ejercicio. Solo aparece si
                registra tiempo, que es la única métrica ambigua: en peso, reps
                y distancia más siempre es mejor. Tres opciones y no dos porque
                la mayoría de los ejercicios de tiempo no compiten — un
                estiramiento se prescribe por duración, no se supera. */}
            {(() => {
              const eff = (form.logMetrics && form.logMetrics.length) ? form.logMetrics : defaultLogMetrics(form);
              if (!eff.includes('time')) return null;
              const actual = form.tracksPR === false ? 'none' : (form.timeLowerIsBetter === false ? 'more' : 'less');
              const OPCIONES = [
                ['less', 'MENOS TIEMPO', 'un sprint, un shuttle', { tracksPR: true, timeLowerIsBetter: true }],
                ['more', 'MÁS TIEMPO', 'un dead hang, una plancha', { tracksPR: true, timeLowerIsBetter: false }],
                ['none', 'NO ES UN RÉCORD', 'un estiramiento, calentamiento', { tracksPR: false }],
              ];
              return (
                <Field label="EN TIEMPO, ¿QUÉ ES MEJORAR?">
                  <div className="help mb-1.5" style={{ fontSize: '13px', color: C.moss }}>— decide hacia dónde suben su gráfica y su meta, y si puede marcar récord personal.</div>
                  <div className="flex flex-wrap gap-1">
                    {OPCIONES.map(([id, label, eg, patch]) => (
                      <button key={id} type="button" onClick={() => setForm({ ...form, ...patch })}
                        className="px-3 py-2 flex-1 text-left" style={{ minWidth: 132,
                          background: actual === id ? C.gold : C.cream, border: `1px solid ${actual === id ? C.gold : C.charcoal + '30'}` }}>
                        <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: actual === id ? C.gold : C.moss }}>{label}</div>
                        <div style={{ fontSize: '12px', marginTop: 2, color: actual === id ? C.sand : C.moss }}>{eg}</div>
                      </button>
                    ))}
                  </div>
                </Field>
              );
            })()}

            {['time', 'distance'].filter((mm) => {
              const eff = (form.logMetrics && form.logMetrics.length) ? form.logMetrics : defaultLogMetrics(form);
              return eff.includes(mm) || (form.measures || []).includes(mm);
            }).map((mm) => (
              <Field key={mm} label={`${mm === 'time' ? 'TIME' : 'DISTANCE'} UNIT`}>
                <div className="flex flex-wrap gap-1">
                  {(mm === 'distance' ? DIST_UNITS : TIME_UNITS).map((u) => {
                    const active = (form.units?.[mm]) === u.id;
                    return (
                      <button key={u.id} type="button" onClick={() => setForm({ ...form, units: { ...(form.units || {}), [mm]: u.id } })} className="mono px-2 py-1"
                        style={{ fontSize: '11px', letterSpacing: '0.1em', background: active ? C.gold : C.cream, color: active ? C.bone : C.moss, border: `1px solid ${active ? C.gold : C.charcoal + '30'}` }}>
                        {u.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            ))}

            <Field label="EXERCISE TYPE">
              <div className="flex gap-1">
                <button type="button" onClick={() => setForm({ ...form, isTest: false })} className="mono px-3 py-1.5"
                  style={{ fontSize: '11px', letterSpacing: '0.1em', background: !form.isTest ? C.gold : C.cream, color: !form.isTest ? C.bone : C.moss, border: `1px solid ${!form.isTest ? C.gold : C.charcoal + '30'}` }}>
                  TRAINING EXERCISE
                </button>
                <button type="button" onClick={() => setForm({ ...form, isTest: true })} className="mono px-3 py-1.5"
                  style={{ fontSize: '11px', letterSpacing: '0.1em', background: form.isTest ? C.gold : C.cream, color: form.isTest ? C.bone : C.moss, border: `1px solid ${form.isTest ? C.gold : C.charcoal + '30'}` }}>
                  ▲ TEST / BENCHMARK
                </button>
              </div>
            </Field>

            <Field label="USABLE IN SECTIONS (PICK ONE OR MORE)">
              <div className="flex flex-wrap gap-1">
                {EXERCISE_SECTIONS.map((s) => {
                  const active = (form.sections || []).includes(s.id);
                  return (
                    <button key={s.id} type="button"
                      onClick={() => {
                        const cur = form.sections || [];
                        setForm({ ...form, sections: active ? cur.filter((x) => x !== s.id) : [...cur, s.id] });
                      }}
                      className="mono px-2 py-1"
                      style={{ fontSize: '11px', letterSpacing: '0.1em', background: active ? C.gold : C.cream, color: active ? C.bone : C.moss, border: `1px solid ${active ? C.gold : C.charcoal + '30'}` }}>
                      {s.label.toUpperCase()}
                    </button>
                  );
                })}
              </div>
              {(!form.sections || form.sections.length === 0) && (
                <div className="help mt-1" style={{ fontSize: '14px', color: C.moss }}>— pick at least one section so this shows up in workout builders.</div>
              )}
            </Field>

            <Field label="YOUTUBE VIDEO URL (FOR ONLINE CLIENTS)">
              <input value={form.videoUrl || ''} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} placeholder="https://www.youtube.com/watch?v=..." className={inputClass} style={inputStyle} />
            </Field>
            {form.videoUrl && getYouTubeId(form.videoUrl) && (
              <div className="flex items-center gap-3 p-2" style={{ background: C.bone, border: `1px solid ${C.charcoal}20` }}>
                <VideoDemo url={form.videoUrl} label="PREVIEW" />
                <div className="help" style={{ fontSize: '15px', color: C.moss }}>— online clients see this button; it plays in a pop-up.</div>
              </div>
            )}
            {form.videoUrl && !getYouTubeId(form.videoUrl) && (
              <div className="help p-2" style={{ fontSize: '15px', color: C.gold, background: `${C.gold}15`, border: `1px solid ${C.gold}40` }}>
                — that doesn't look like a YouTube URL. Use the full youtube.com or youtu.be link.
              </div>
            )}

            <div className="p-3" style={{ background: C.bone, border: `1px solid ${C.charcoal}20` }}>
              <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>OPTIONAL · MOVEMENT LADDER</div>
              <div className="help mb-3" style={{ fontSize: '14px', color: C.gold }}>— link an easier (regression) and harder (progression) version.</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="REGRESSION (EASIER)">
                  <select value={form.regressionId || ''} onChange={(e) => setForm({ ...form, regressionId: e.target.value })} className={inputClass} style={inputStyle}>
                    <option value="">— none —</option>
                    {data.exercises.filter((e) => e.id !== editing?.id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </Field>
                <Field label="PROGRESSION (HARDER)">
                  <select value={form.progressionId || ''} onChange={(e) => setForm({ ...form, progressionId: e.target.value })} className={inputClass} style={inputStyle}>
                    <option value="">— none —</option>
                    {data.exercises.filter((e) => e.id !== editing?.id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </Field>
              </div>
            </div>

            {(form.measures || []).includes('reps') && (
              <div className="p-3" style={{ background: C.bone, border: `1px solid ${C.charcoal}20` }}>
                <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>OPTIONAL · % 1RM SOURCE</div>
                <div className="help mb-3" style={{ fontSize: '14px', color: C.gold }}>— when a workout prescribes a “% 1RM” for this exercise, base it on this test’s best result. Leave empty to use this exercise’s own history.</div>
                <Field label="1RM COMES FROM">
                  <SearchSelect
                    value={form.oneRmSourceId || ''}
                    onChange={(id) => setForm({ ...form, oneRmSourceId: id })}
                    options={data.exercises
                      .filter((e) => e.id !== editing?.id && (e.measures || [e.measure]).includes('reps'))
                      .sort((a, b) => (b.isTest - a.isTest) || a.name.localeCompare(b.name))
                      .map((e) => ({ id: e.id, label: e.isTest ? `▲ ${e.name}` : e.name }))}
                    placeholder="This exercise’s own history"
                    emptyText="No exercise found"
                  />
                </Field>
              </div>
            )}

            <Btn full onClick={save} disabled={saving}>{saving ? 'SAVING…' : editing ? 'UPDATE' : 'CREATE EXERCISE'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
