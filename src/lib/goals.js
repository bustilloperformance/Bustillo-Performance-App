// ============================================================
//  GOALS — read helpers over the `goals` jsonb on a member.
//  A goal: { id, metric, target, unit, deadline, completedOn }.
//  completedOn is what archives it — a finished goal is never deleted, so
//  the athlete keeps the record of what they've already hit.
// ============================================================
import { logMetricsOf, setMetric, timeLowerIsBetter } from './helpers';

const METRIC_PRIORITY = ['weight', 'distance', 'time', 'reps'];

// Goal names are free text typed by hand — "Push ups " with a trailing space,
// "Body fat %" with a small f, "Músculo" with an accent. Matching them exactly
// against the library found nothing, so every goal read as having no data.
function norm(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // drop accents
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    // Rough plural. Both sides of every comparison run through this, so
    // over-trimming ("press" → "pres") is harmless as long as it's symmetric.
    // The cutoff is 2 so "ups" reduces to "up" and "Push ups" finds "Push Up".
    .map((w) => (w.length > 2 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ');
}

// The two metrics that come off body composition rather than the exercise log.
const BODY_FAT = new Set(['body fat', 'bodyfat', 'grasa', 'grasa corporal', 'porcentaje de grasa']);
const BODY_WEIGHT = new Set(['weight', 'peso', 'body weight', 'peso corporal']);

// Where a member currently stands on one goal, or null if nothing's logged.
// Body Fat % and Weight read the latest measurement; anything else is matched
// by name against the exercise library and takes their best logged value.
function currentValue(data, goal, logs, bodyComp) {
  const key = norm(goal.metric);
  const latest = bodyComp.length ? bodyComp[bodyComp.length - 1] : null;
  if (BODY_FAT.has(key)) return latest ? latest.bodyFat : null;
  if (BODY_WEIGHT.has(key)) return latest ? latest.weight : null;

  const ex = data.exercises.find((e) => norm(e.name) === key);
  if (!ex) return null;
  const available = logMetricsOf(ex).filter((m) =>
    logs.some((log) => (log.sets || []).some((s) => s.exerciseId === ex.id && setMetric(s, m, ex.measure) != null)));
  const metric = (ex.graphMetric && available.includes(ex.graphMetric))
    ? ex.graphMetric
    : METRIC_PRIORITY.find((m) => available.includes(m)) || available[0];
  if (!metric) return null;

  // En tiempo la direccion la dice el ejercicio: un sprint mejora bajando, una
  // plancha mejora subiendo. Antes se asumia que siempre bajando, asi que una
  // meta de plancha llenaba la barra al reves.
  const values = [];
  logs.forEach((log) => (log.sets || []).forEach((s) => {
    if (s.exerciseId !== ex.id) return;
    const v = setMetric(s, metric, ex.measure);
    if (v != null && !Number.isNaN(v)) values.push(v);
  }));
  if (!values.length) return null;
  const lower = metric === 'time' && timeLowerIsBetter(ex);
  return lower ? Math.min(...values) : Math.max(...values);
}

// What a goal name will resolve to, so the form can say so before it's saved
// instead of the coach finding out later that the bar never moves.
// null when nothing the app stores can measure it.
export function metricSource(data, name) {
  const key = norm(name);
  if (!key) return null;
  if (BODY_FAT.has(key)) return 'body fat, from measurements';
  if (BODY_WEIGHT.has(key)) return 'weight, from measurements';
  const ex = data.exercises.find((e) => norm(e.name) === key);
  return ex ? `best logged ${ex.name}` : null;
}

// Everything a goal can be named after and still be measured automatically.
export function metricSuggestions(data) {
  return ['Weight', 'Body Fat %', ...(data.exercises || []).map((e) => e.name).sort((a, b) => a.localeCompare(b))];
}

// Every goal on the member, each with `current` and `pct`, split into the ones
// still open and the ones already hit (newest completion first).
export function goalsFor(data, memberId) {
  const member = data.members.find((m) => m.id === memberId);
  const goals = member?.goals || [];
  if (!goals.length) return { active: [], done: [] };

  const logs = data.workoutLogs.filter((l) => l.memberId === memberId);
  const bodyComp = data.bodyComp.filter((b) => b.memberId === memberId).sort((a, b) => a.date.localeCompare(b.date));

  const withProgress = goals.map((g) => {
    const current = currentValue(data, g, logs, bodyComp);
    const target = Number(g.target);
    // `tracked` is false for a goal nothing in the app can measure — "Minutos
    // Partido", "Mejorar en agilidad". Those are real goals, they just get
    // ticked off by hand, and showing them a 0% bar would read as failure
    // rather than as "we don't measure this here".
    const tracked = current != null;
    const pct = tracked && target ? Math.min(100, Math.max(0, (Number(current) / target) * 100)) : 0;
    return { ...g, current, pct, tracked };
  });

  return {
    active: withProgress.filter((g) => !g.completedOn),
    done: withProgress.filter((g) => g.completedOn).sort((a, b) => (b.completedOn || '').localeCompare(a.completedOn || '')),
  };
}
