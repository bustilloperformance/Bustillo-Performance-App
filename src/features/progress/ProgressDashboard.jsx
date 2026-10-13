import { useMemo, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast, useConfirm } from '../../components/feedback';
import { addGoal, removeGoal, addBodyComp, deleteBodyComp, setGoalCompleted, updateGoal } from '../../data/progress';
import { removeExerciseFromLog } from '../../data/logs';
import { todayISO, fmtISO, parseLocalDate, logMetricsOf, setMetric, LOG_METRIC_LABEL, unitLabel, timeLowerIsBetter } from '../../lib/helpers';
import { Modal, Btn, Field } from '../../components/ui';
import { inputClass, inputStyle } from '../../components/uiStyles';
import { goalsFor, metricSource, metricSuggestions } from '../../lib/goals';
import LineChart from '../../components/LineChart';
import SearchSelect from '../../components/SearchSelect';
import ProgressPhotos from './ProgressPhotos';

// ============================================================
//  PROGRESS DASHBOARD — PR progression, body comp, consistency, goals.
//  editable: the owner (in Results) or the client (own progress) can add
//  goals + body-comp measurements.
// ============================================================

// The three readings a measurement can carry. Charted in this order, and the
// same list labels the entry rows so a metric can never show up in one place
// and go missing in the other.
const BODY_METRICS = [
  { key: 'weight', label: 'WEIGHT', short: 'W', unit: '', color: C.ink, second: C.gold },
  { key: 'bodyFat', label: 'BODY FAT %', short: 'BF', unit: '%', color: C.gold, second: C.ink },
  { key: 'muscleMass', label: 'MUSCLE', short: 'M', unit: '', color: C.gold, second: C.gold },
];
// Every cell in the body-comp grid is this tall, charts and entry list alike.
const CELL_H = 216;
export default function ProgressDashboard({ memberId, editable = false }) {
  const { data, refresh } = useData();
  const showToast = useToast();
  const askConfirm = useConfirm();
  const member = data.members.find((m) => m.id === memberId);
  const logs = data.workoutLogs.filter((w) => w.memberId === memberId).sort((a, b) => a.date.localeCompare(b.date));
  const bodyComp = data.bodyComp.filter((b) => b.memberId === memberId).sort((a, b) => a.date.localeCompare(b.date));

  const [showGoal, setShowGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [showBody, setShowBody] = useState(false);

  // deleteBodyComp existed in the data layer but nothing ever called it, so a
  // mistyped measurement was stuck skewing the chart forever.
  const removeMeasurement = (b) => {
    const parts = BODY_METRICS.filter((m) => b[m.key] != null).map((m) => `${m.short} ${b[m.key]}${m.unit}`);
    askConfirm({
      message: `Delete the measurement from ${b.date}?`,
      detail: parts.length ? `${parts.join(' · ')}. This can't be undone.` : "This can't be undone.",
      confirmLabel: 'DELETE',
      danger: true,
      onConfirm: async () => {
        try { await deleteBodyComp(b.id); await refresh(); showToast('Measurement deleted.'); }
        catch (err) { showToast(err.message || 'Could not delete.'); }
      },
    });
  };

  // Exercises that have any logged metric data (populate the dropdown).
  const loggedExIds = useMemo(() => {
    const ids = [];
    const seen = new Set();
    logs.forEach((log) => (log.sets || []).forEach((s) => { if (!seen.has(s.exerciseId)) { seen.add(s.exerciseId); ids.push(s.exerciseId); } }));
    return ids;
  }, [logs]);

  // Searchable options for the exercise picker, sorted by name.
  const exerciseOptions = useMemo(
    () => loggedExIds
      .map((id) => ({ id, label: data.exercises.find((e) => e.id === id)?.name || 'Exercise' }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [loggedExIds, data.exercises],
  );

  const METRIC_PRIORITY = ['weight', 'distance', 'time', 'reps'];
  // Which metrics of an exercise actually have logged data.
  const availableMetrics = (exId) => {
    const ex = data.exercises.find((e) => e.id === exId);
    return logMetricsOf(ex).filter((m) => logs.some((log) => (log.sets || []).some((s) => s.exerciseId === exId && setMetric(s, m, ex?.measure) != null)));
  };
  // Mejor serie por dia de una metrica, en la direccion que corresponda.
  const seriesFor = (exId, metric) => {
    const ex = data.exercises.find((e) => e.id === exId);
    // La direccion la dice el ejercicio, no la metrica: un sprint mejora
    // bajando el numero y una plancha mejora subiendolo. Asumirlo para todos
    // dibujaba la grafica de una plancha al reves.
    const lowerIsBetter = metric === 'time' && timeLowerIsBetter(ex);
    const byDate = {};
    logs.forEach((log) => (log.sets || []).forEach((s) => {
      if (s.exerciseId !== exId) return;
      const v = setMetric(s, metric, ex?.measure);
      if (v == null || Number.isNaN(v)) return;
      const cur = byDate[log.date];
      if (!cur || (lowerIsBetter ? v < cur.value : v > cur.value)) byDate[log.date] = { date: log.date, value: v };
    }));
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  };
  const primaryMetric = (exId) => {
    const ex = data.exercises.find((e) => e.id === exId);
    const av = availableMetrics(exId);
    if (ex?.graphMetric && av.includes(ex.graphMetric)) return ex.graphMetric; // per-exercise default
    return METRIC_PRIORITY.find((m) => av.includes(m)) || av[0];
  };

  const [selectedExId, setSelectedExId] = useState(loggedExIds[0] || '');
  const [graphMetricState, setGraphMetric] = useState('');
  const selectedEx = data.exercises.find((e) => e.id === selectedExId);
  const selMetrics = selectedExId ? availableMetrics(selectedExId) : [];
  const graphMetric = selMetrics.includes(graphMetricState) ? graphMetricState : primaryMetric(selectedExId);
  const metricUnit = (m) => m === 'weight' ? 'lb' : m === 'distance' ? (selectedEx?.units?.distance || 'yd') : m === 'time' ? (selectedEx?.units?.time || 's') : '';

  // Raw logged entries for the selected exercise (for cleaning up wrong ones).
  const selectedExLogs = useMemo(() => {
    if (!selectedExId) return [];
    const ex = data.exercises.find((e) => e.id === selectedExId);
    const dU = unitLabel(ex?.units?.distance || 'yd');
    const tU = unitLabel(ex?.units?.time || 's');
    const fmtSet = (s) => {
      const parts = [];
      if (s.bw) parts.push('BW');
      else { const w = setMetric(s, 'weight', ex?.measure); if (w != null) parts.push(`${w}lb`); }
      const r = setMetric(s, 'reps', ex?.measure); if (r != null) parts.push(`${r}r`);
      const d = setMetric(s, 'distance', ex?.measure); if (d != null) parts.push(`${d}${dU}`);
      const t = setMetric(s, 'time', ex?.measure); if (t != null) parts.push(`${t}${tU}`);
      return parts.join(' ') || '—';
    };
    return logs
      .filter((log) => (log.sets || []).some((s) => s.exerciseId === selectedExId))
      .map((log) => ({ log, date: log.date, values: log.sets.filter((s) => s.exerciseId === selectedExId).map(fmtSet) }))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [logs, selectedExId, data.exercises]);

  const deleteEntry = ({ log }) => askConfirm({
    message: `Delete this ${selectedEx?.name || 'exercise'} entry (${log.date})?`,
    detail: 'Removes it from the progression. If it was the only exercise that day, the whole session is removed. This cannot be undone.',
    confirmLabel: 'DELETE ENTRY',
    danger: true,
    onConfirm: async () => {
      try { await removeExerciseFromLog(log, selectedExId); await refresh(); showToast('Entry removed.'); }
      catch (err) { showToast(err.message || 'Could not delete.'); }
    },
  });

  // Sessions per real calendar week, last 12. The old version bucketed by
  // Math.ceil(dayOfMonth / 7), which carries no month or year — so July's third
  // week and September's third week landed in the same bar. Five bars mixing
  // every month the client ever trained, which is why they said nothing.
  // Empty weeks are kept: a gap IS the consistency story.
  const sessionsByWeek = useMemo(() => {
    const WEEKS = 12;
    const mondayOf = (iso) => {
      const d = parseLocalDate(iso);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Mon = 0
      return fmtISO(d);
    };
    const counts = {};
    logs.forEach((l) => { const k = mondayOf(l.date); counts[k] = (counts[k] || 0) + 1; });

    const thisMonday = parseLocalDate(mondayOf(todayISO()));
    const out = [];
    for (let i = WEEKS - 1; i >= 0; i--) {
      const d = new Date(thisMonday);
      d.setDate(d.getDate() - i * 7);
      const iso = fmtISO(d);
      out.push({ iso, value: counts[iso] || 0, label: `${d.getMonth() + 1}/${d.getDate()}` });
    }
    return out;
  }, [logs]);

  // Shared with ClientHome so a goal reads the same on both screens.
  const { active: activeGoals, done: doneGoals } = goalsFor(data, memberId);

  const onSaveGoal = async (form) => {
    try {
      if (editingGoal) await updateGoal(memberId, editingGoal.id, form, member.goals);
      else await addGoal(memberId, form, member.goals);
      await refresh();
      setShowGoal(false); setEditingGoal(null);
      showToast(editingGoal ? 'Goal updated.' : 'Goal added.');
    } catch (err) { showToast(err.message || 'Could not save the goal.'); }
  };
  const openGoalEditor = (g) => { setEditingGoal(g || null); setShowGoal(true); };
  const onCompleteGoal = async (goalId, done) => {
    try {
      await setGoalCompleted(memberId, goalId, member.goals, done);
      await refresh();
      showToast(done ? 'Goal hit — moved to your achieved list.' : 'Goal reopened.');
    } catch (err) { showToast(err.message || 'Could not update the goal.'); }
  };
  const onRemoveGoal = async (goalId) => {
    try { await removeGoal(memberId, goalId, member.goals); await refresh(); showToast('Goal removed.'); }
    catch (err) { showToast(err.message || 'Could not remove goal.'); }
  };
  const onAddBody = async (form) => {
    if (form.weight === '' && form.bodyFat === '' && form.muscleMass === '') { showToast('Enter at least one measurement.'); return; }
    try { await addBodyComp({ memberId, ...form }); await refresh(); setShowBody(false); showToast('Measurement saved.'); }
    catch (err) { showToast(err.message || 'Could not save.'); }
  };

  const avgReadiness = (() => {
    const w = logs.filter((l) => l.readiness != null);
    return w.length ? (w.reduce((s, l) => s + l.readiness, 0) / w.length).toFixed(1) : '—';
  })();

  const chartData = selectedExId && graphMetric ? seriesFor(selectedExId, graphMetric) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* Before/after progress photos */}
      <div className="lg:col-span-2">
        <ProgressPhotos memberId={memberId} editable={editable} />
      </div>
      {/* PR progression */}
      <div className="lg:col-span-2 p-6" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>TRACK YOUR STANDARD</div>
            <div className="serif-italic" style={{ fontSize: '32px' }}>Exercise PR Progression</div>
          </div>
          <div className="w-full sm:w-64">
            <SearchSelect
              value={selectedExId}
              onChange={(id) => { setSelectedExId(id); setGraphMetric(''); }}
              options={exerciseOptions}
              placeholder="Search exercise…"
              emptyText="No exercise found"
            />
          </div>
        </div>
        {selectedEx && chartData.length > 0 ? (
          <div>
            {selMetrics.length > 1 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {selMetrics.map((m) => (
                  <button key={m} onClick={() => setGraphMetric(m)} className="mono px-3 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', fontWeight: 700, background: graphMetric === m ? C.gold : C.cream, color: graphMetric === m ? C.bone : C.moss, border: `1px solid ${graphMetric === m ? C.gold : C.charcoal + '30'}` }}>
                    {LOG_METRIC_LABEL[m]}{metricUnit(m) ? ` (${unitLabel(metricUnit(m))})` : ''}
                  </button>
                ))}
              </div>
            )}
            <div className="mono mb-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>{graphMetric === 'time' ? 'BEST TIME (LOWEST) PER DAY' : 'BEST PER DAY'} · {LOG_METRIC_LABEL[graphMetric]}{metricUnit(graphMetric) ? ` (${unitLabel(metricUnit(graphMetric))})` : ''} — {selectedEx.name.toUpperCase()}</div>
            <LineChart data={chartData.map((p) => ({ value: Number(p.value), label: p.date.slice(5) }))} color={C.ink} secondColor={C.gold} height={240} />
            {editable && selectedExLogs.length > 0 && (
              <div className="mt-5 pt-3" style={{ borderTop: `1px solid ${C.charcoal}15` }}>
                <div className="mono mb-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>LOGGED ENTRIES · REMOVE A WRONG ONE TO CLEAN THE PROGRESSION</div>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {selectedExLogs.map((e) => (
                    <div key={e.log.id} className="flex items-center justify-between px-3 py-2" style={{ background: C.bone, border: `1px solid ${C.charcoal}15` }}>
                      <div className="min-w-0">
                        <span className="mono" style={{ fontSize: '12px', color: C.moss }}>{e.date}</span>
                        <span className="mono ml-2" style={{ fontSize: '14px', color: C.ink, fontWeight: 600 }}>{e.values.join(' · ')}</span>
                      </div>
                      <button onClick={() => deleteEntry(e)} className="p-1.5 flex-shrink-0" style={{ background: C.sand }} title="Delete this entry"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : <div className="ui-strong text-center py-12" style={{ fontSize: '20px', color: C.moss }}>Log workouts with set values to see progression.</div>}
      </div>

      {/* Body comp — spans both columns of the outer grid, so its own 2x2 gets
          the full page width and Consistency drops below it instead of sitting
          alongside in the right-hand column. */}
      <div className="p-6 lg:col-span-2" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        <div className="flex items-center justify-between mb-4">
          <div className="serif-italic" style={{ fontSize: '28px' }}>Body Composition</div>
          {editable && <button onClick={() => setShowBody(true)} className="mono px-3 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.gold, color: C.bone }}>+ MEASUREMENT</button>}
        </div>
        {bodyComp.length > 0 ? (
          // 2×2, filling row by row: [weight | muscle] then [body fat | entries],
          // so the left column stacks weight over body fat and the right one
          // puts muscle over the readings. Every cell is the same box, and a
          // metric with no readings keeps its cell so the grid stays square.
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[BODY_METRICS[0], BODY_METRICS[2], BODY_METRICS[1]].map((m) => {
              const pts = bodyComp.filter((b) => b[m.key] != null).map((b) => ({ value: Number(b[m.key]), label: b.date.slice(5) }));
              return (
                <div key={m.key} className="p-3 flex flex-col" style={{ height: CELL_H, background: C.bone, border: `1px solid ${C.charcoal}15` }}>
                  <div className="mono mb-1 flex-shrink-0" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>{m.label}</div>
                  <div className="flex-1 flex items-center min-h-0">
                    {pts.length
                      ? <div className="w-full h-full"><LineChart data={pts} width={520} height={210} color={m.color} secondColor={m.second} fit /></div>
                      : <div className="w-full text-center help" style={{ fontSize: '15px', color: C.moss }}>— no readings yet.</div>}
                  </div>
                </div>
              );
            })}

            {/* The readings themselves. The charts show the shape; this is where
                you read the numbers, the notes, and delete a typo. Scrolls so
                the cell matches the charts however long the history gets. */}
            <div className="p-3 flex flex-col" style={{ height: CELL_H, background: C.bone, border: `1px solid ${C.charcoal}15` }}>
              <div className="mono mb-1.5 flex-shrink-0" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
                {bodyComp.length} MEASUREMENT{bodyComp.length === 1 ? '' : 'S'} · NEWEST FIRST
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0 pr-1">
                {[...bodyComp].reverse().map((b) => (
                  <div key={b.id} className="flex items-start gap-2 py-1.5" style={{ borderBottom: `1px solid ${C.charcoal}10` }}>
                    <div className="flex-1 min-w-0">
                      <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>{b.date}</div>
                      <div className="flex gap-1.5 flex-wrap mt-1">
                        {BODY_METRICS.map((m) => b[m.key] != null && (
                          <span key={m.key} className="mono px-1.5 py-0.5" style={{ fontSize: '11px', background: C.cream, border: `1px solid ${C.charcoal}20`, color: C.ink }}>
                            <span style={{ color: C.moss }}>{m.short}</span> {b[m.key]}{m.unit}
                          </span>
                        ))}
                      </div>
                      {b.notes && <div className="help mt-0.5" style={{ fontSize: '14px', color: C.moss }}>— {b.notes}</div>}
                    </div>
                    {editable && (
                      <button onClick={() => removeMeasurement(b)} className="p-1 flex-shrink-0" title="Delete this measurement">
                        <Trash2 size={11} style={{ color: C.moss }} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : <div className="ui-strong text-center py-8" style={{ fontSize: '20px', color: C.moss }}>No body comp entries.</div>}
      </div>

      {/* Consistency — full width too. Left at half it would sit alone in one
          column with dead black space beside it, now that body comp takes a
          whole row. Every section on this screen is a full-width band. */}
      <div className="p-6 lg:col-span-2" style={{ background: C.cream, color: C.ink }}>
        <div className="serif-italic mb-4" style={{ fontSize: '28px', color: C.cream }}>Consistency</div>
        <div className="grid grid-cols-3 gap-3 mb-5 md:max-w-lg">
          <Stat value={logs.length} label="SESSIONS" gold />
          <Stat value={logs.reduce((s, l) => s + (l.sets ? l.sets.length : 0), 0)} label="SETS LOGGED" />
          <Stat value={avgReadiness} label="AVG READINESS" gold />
        </div>
        {(() => {
          const max = Math.max(1, ...sessionsByWeek.map((w) => w.value));
          const trained = sessionsByWeek.filter((w) => w.value > 0).length;
          const BAR_PX = 62;
          return (
            <div>
              <div className="flex items-baseline justify-between mb-2.5 gap-3 flex-wrap">
                <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.sand }}>SESSIONS PER WEEK</div>
                <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.gold }}>
                  {trained}/12 WEEKS TRAINED
                </div>
              </div>
              <div className="flex items-end gap-1.5" style={{ height: BAR_PX + 18 }}>
                {sessionsByWeek.map((w) => (
                  <div key={w.iso} className="flex-1 flex flex-col items-center justify-end" title={`Week of ${w.label} · ${w.value} session${w.value === 1 ? '' : 's'}`}>
                    <div className="mono mb-1" style={{ fontSize: '12px', fontWeight: 700, color: w.value ? C.gold : 'transparent' }}>{w.value || 0}</div>
                    {/* An empty week still draws a sliver, so the gap reads as a
                        gap instead of the bar quietly not being there. */}
                    <div className="w-full" style={{ height: w.value ? Math.max(4, Math.round((w.value / max) * BAR_PX)) : 2, background: w.value ? C.gold : `${C.sand}40` }} />
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5 mt-2">
                {sessionsByWeek.map((w, i) => (
                  <div key={w.iso} className="flex-1 mono text-center" style={{ fontSize: '11px', letterSpacing: '0.02em', color: C.sand }}>
                    {i % 2 === 0 ? w.label : ''}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Goals */}
      <div className="lg:col-span-2 p-6" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        <div className="flex items-center justify-between mb-4">
          <div className="serif-italic" style={{ fontSize: '28px' }}>Goals</div>
          {editable && <button onClick={() => openGoalEditor(null)} className="mono px-3 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.gold, color: C.bone }}>+ ADD GOAL</button>}
        </div>
        {activeGoals.length === 0 && doneGoals.length === 0 && <div className="ui-strong" style={{ fontSize: '20px', color: C.moss }}>{editable ? 'No goals yet. Set one to track your progress.' : 'No goals set.'}</div>}
        {activeGoals.length === 0 && doneGoals.length > 0 && <div className="ui-strong mb-4" style={{ fontSize: '20px', color: C.moss }}>All goals hit. {editable ? 'Set the next one.' : ''}</div>}

        {activeGoals.map((g) => (
          <div key={g.id} className="mb-4 group">
            <div className="flex justify-between items-baseline mb-2 gap-3 flex-wrap">
              <div className="flex-1 min-w-0" style={{ flexBasis: '55%' }}>
                <div className="ui-strong leading-tight" style={{ fontSize: '20px' }}>{g.metric}</div>
                <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>TARGET {g.target}{g.unit}{g.deadline ? ` · BY ${g.deadline}` : ''}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-auto flex-wrap">
                {g.tracked
                  ? <div className="mono" style={{ fontSize: '20px', fontWeight: 600 }}>{g.current}<span style={{ fontSize: '12px', color: C.moss }}>{g.unit} / {g.target}{g.unit}</span></div>
                  : <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>NOT TRACKED HERE</div>}
                {editable && (
                  <>
                    <button onClick={() => openGoalEditor(g)} className="mono px-2 py-1" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.cream, color: C.gold }} title="Edit this goal">✎ EDIT</button>
                    <button onClick={() => onCompleteGoal(g.id, true)} className="mono px-2 py-1" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.forest, color: C.ink }} title="Mark this goal hit">✓ DONE</button>
                    {/* Hover-only would never appear on a touch screen. */}
                    <button onClick={() => onRemoveGoal(g.id)} className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition p-1" style={{ background: C.sand }} title="Remove goal"><X size={11} /></button>
                  </>
                )}
              </div>
            </div>
            {g.tracked && <div className="h-2" style={{ background: C.bone }}><div className="h-full" style={{ width: `${g.pct}%`, background: g.pct >= 50 ? C.forest : C.gold }} /></div>}
          </div>
        ))}

        {/* Archive — hit goals are kept, never deleted. The record of what
            they've already done is the point of setting goals in the first
            place. Collapsed so it doesn't crowd the ones still open. */}
        {doneGoals.length > 0 && (
          <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${C.charcoal}20` }}>
            <button onClick={() => setShowDone((v) => !v)} className="mono flex items-center gap-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.gold, fontWeight: 600 }}>
              <span style={{ display: 'inline-block', transform: showDone ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
              ✓ {doneGoals.length} GOAL{doneGoals.length === 1 ? '' : 'S'} ACHIEVED
            </button>
            {showDone && (
              <div className="mt-3 space-y-1">
                {doneGoals.map((g) => (
                  <div key={g.id} className="flex items-center justify-between gap-3 px-3 py-2 group" style={{ background: C.bone, border: `1px solid ${C.charcoal}15` }}>
                    <div className="min-w-0">
                      <div className="ui-strong truncate" style={{ fontSize: '17px', color: C.ink }}>{g.metric}</div>
                      <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
                        {g.target}{g.unit} · HIT {g.completedOn}
                      </div>
                    </div>
                    {editable && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => openGoalEditor(g)} className="mono px-2 py-1" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.cream, color: C.gold }} title="Edit this goal">✎</button>
                        <button onClick={() => onCompleteGoal(g.id, false)} className="mono px-2 py-1" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.sand, color: C.bone }} title="Put this goal back in play">↺ REOPEN</button>
                        <button onClick={() => onRemoveGoal(g.id)} className="opacity-0 group-hover:opacity-100 transition p-1" title="Delete for good"><X size={11} style={{ color: C.moss }} /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showGoal && <GoalFormModal goal={editingGoal} data={data} onSave={onSaveGoal} onClose={() => { setShowGoal(false); setEditingGoal(null); }} />}
      {showBody && <BodyCompModal onSave={onAddBody} onClose={() => setShowBody(false)} />}
    </div>
  );
}

function Stat({ value, label, gold }) {
  return (
    <div>
      <div className="stat-num" style={{ fontSize: '40px', color: gold ? C.gold : C.cream }}>{value}</div>
      <div className="mono mt-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function GoalFormModal({ goal, data, onSave, onClose }) {
  const editing = !!goal;
  const [form, setForm] = useState(goal
    ? { metric: goal.metric || '', target: goal.target ?? '', unit: goal.unit || '', deadline: goal.deadline || '' }
    : { metric: '', target: '', unit: 'lbs', deadline: '' });
  const source = metricSource(data, form.metric);
  const suggestions = useMemo(() => metricSuggestions(data), [data]);
  return (
    <Modal title={editing ? 'Edit Goal' : 'Add Goal'} eyebrow={`PROGRESS · ${editing ? 'EDIT' : 'NEW'} GOAL`} onClose={onClose} size="md">
      <div className="space-y-3">
        <Field label="METRIC">
          <input value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })} list="fw-goal-metrics"
            placeholder="e.g. Bench Press, Body Fat %, Weight" className={inputClass} style={inputStyle} />
          <datalist id="fw-goal-metrics">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
          {/* Says up front whether this name will track, so nobody saves a goal
              expecting a bar and later wonders why it never fills. */}
          {form.metric.trim() && (
            <div className="mono mt-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', color: source ? C.forest : C.moss }}>
              {source ? `✓ TRACKS AUTOMATICALLY — ${source}` : '· NOT TRACKED — you\'ll mark this one done by hand'}
            </div>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="TARGET"><input type="number" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="225" className={inputClass} style={inputStyle} /></Field>
          <Field label="UNIT">
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={inputClass} style={inputStyle}>
              {['lbs', 'kg', '%', 'reps', 'sec', 'min', 'in', ''].map((u) => <option key={u} value={u}>{u || '— none —'}</option>)}
            </select>
          </Field>
        </div>
        <Field label="DEADLINE (OPTIONAL)"><input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className={inputClass} style={inputStyle} /></Field>
        <Btn full onClick={() => { if (!form.metric || !form.target) return; onSave(form); }}>{editing ? 'SAVE CHANGES' : 'ADD GOAL'}</Btn>
      </div>
    </Modal>
  );
}

function BodyCompModal({ onSave, onClose }) {
  const [form, setForm] = useState({ date: todayISO(), weight: '', bodyFat: '', muscleMass: '', notes: '' });
  return (
    <Modal title="Add Measurement" eyebrow="PROGRESS · BODY COMP" onClose={onClose} size="md">
      <div className="space-y-3">
        <Field label="DATE"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputClass} style={inputStyle} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="WEIGHT"><input type="number" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} className={inputClass} style={inputStyle} /></Field>
          <Field label="BODY FAT %"><input type="number" value={form.bodyFat} onChange={(e) => setForm({ ...form, bodyFat: e.target.value })} className={inputClass} style={inputStyle} /></Field>
          <Field label="MUSCLE"><input type="number" value={form.muscleMass} onChange={(e) => setForm({ ...form, muscleMass: e.target.value })} className={inputClass} style={inputStyle} /></Field>
        </div>
        <Field label="NOTES"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} style={inputStyle} /></Field>
        <Btn full onClick={() => onSave(form)}>SAVE MEASUREMENT</Btn>
      </div>
    </Modal>
  );
}
