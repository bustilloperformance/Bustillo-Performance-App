// ============================================================
//  SHARED PURE HELPERS
//  Ported from the prototype as we migrate the screens that use them.
// ============================================================

// Today as YYYY-MM-DD (local). Production uses the real date; the prototype
// hardcoded a demo TODAY.
// LOCAL date as YYYY-MM-DD. Using toISOString() would give the UTC date, which
// in negative-offset timezones (e.g. Central) rolls over to "tomorrow" in the
// evening — making today's highlight and comparisons a day ahead.
function pad2(n) { return String(n).padStart(2, '0'); }
export function fmtISO(dt) {
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function todayISO() {
  return fmtISO(new Date());
}

// Parse a 'YYYY-MM-DD' string as a LOCAL date. Using `new Date('2026-07-13')`
// parses as UTC midnight, which renders as the previous day in negative-offset
// timezones (e.g. Central) — this avoids that off-by-one.
export function parseLocalDate(iso) {
  const [y, m, d] = (iso || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// Default reasons offered when pausing a membership. The owner can also type a
// custom one in the pause modal.
export const DEFAULT_PAUSE_REASONS = ['Injury', 'Vacation', 'Travel', 'Surgery', 'Maternity'];

// Whole months between two ISO dates (used for commitment tracking).
export function monthsBetween(startDate, endDate) {
  const s = new Date(startDate);
  const e = new Date(endDate);
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (e.getDate() < s.getDate()) months -= 1;
  return Math.max(0, months);
}

// Commitment status for a membership: is it still inside its minimum term?
// Honors a per-membership customMinMonths override, else the plan's minimum.
export function commitmentInfo(membership, plan) {
  if (!plan || !membership) return { locked: false, monthsElapsed: 0, monthsRequired: 0, releaseDate: null };
  const required = membership.customMinMonths != null ? membership.customMinMonths : (plan.minCommitmentMonths || 0);
  const elapsed = monthsBetween(membership.startDate, todayISO());
  const release = new Date(membership.startDate);
  release.setMonth(release.getMonth() + required);
  return {
    locked: elapsed < required,
    monthsElapsed: elapsed,
    monthsRequired: required,
    releaseDate: release.toISOString().split('T')[0],
  };
}

// Default next-billing date from a start date + plan recurrence.
// A Day Pass: single-day access, one charge, 1 session, expires end of its day.
export function isDayPassPlan(plan) {
  return plan?.recurrence === 'day-pass';
}

// ¿Todavía no empieza? Una membresía contratada hoy para arrancar el lunes no
// vale hoy. Ni membershipActive() ni la función de la base lo miraban: revisaban
// el FINAL de una membresía —cancelación, término, cobro vencido— y nunca el
// principio. Espejo de la guarda de start_date en member_has_access() (0029).
export function membershipNotStarted(mb) {
  return !!mb?.startDate && mb.startDate > todayISO();
}

// Whether a membership currently grants access. A day pass is only valid on the
// day it was purchased (its start date); after that it's expired — no cron
// needed, it's derived here. Everything else is active/paused as usual.
export function membershipActive(mb, plan) {
  if (!mb) return false;
  if (membershipNotStarted(mb)) return false;  // contratada, pero todavía no arranca
  if (mb.cancelAt && mb.cancelAt <= todayISO()) return false; // scheduled cancellation, now past
  if (mb.endDate && mb.endDate < todayISO()) return false;    // fixed term, finished
  if (mb.status === 'paused') return true;   // frozen on purpose — not expired
  if (mb.status !== 'active') return false;   // canceled / expired / etc.
  // Una cortesía no vence. Es una bandera que se marca a mano al asignar el
  // plan (0028), no algo que se deduzca del precio: antes bastaba con teclear
  // 0 mientras se definía un plan para volver a alguien cortesía sin que nadie
  // lo decidiera. Mismo orden que en hasTrainingAccess() y que en la función
  // member_has_access() de la base, para que las tres digan lo mismo.
  if (mb.courtesy) return true;
  if (isDayPassPlan(plan)) return mb.startDate === todayISO();
  // A Stripe subscription Stripe still considers live renews itself → trust it.
  if (mb.stripeSubscriptionId && mb.stripeStatus && !['canceled', 'unpaid', 'incomplete_expired'].includes(mb.stripeStatus)) return true;
  // Manual / non-Stripe memberships are valid THROUGH their next-billing date;
  // once that date has passed they've lapsed (must be renewed to stay active).
  if (mb.nextBilling) return mb.nextBilling >= todayISO();
  return true; // open-ended (e.g. one-time, no end date)
}

// Days past the billing date a member keeps their training. Mirrors the grace
// in member_has_access() (0021). The DATABASE is what enforces this — the app
// uses it only to explain why a screen is empty instead of showing a blank one.
export const ACCESS_GRACE_DAYS = 7;

export function hasTrainingAccess(memberships, plans, memberId) {
  const today = todayISO();
  return (memberships || []).some((mb) => {
    if (mb.memberId !== memberId) return false;
    if (mb.status !== 'active' && mb.status !== 'paused') return false;
    if (membershipNotStarted(mb)) return false;
    // A scheduled cancellation ends exactly on its date — no grace, it was
    // chosen rather than missed.
    if (mb.cancelAt && mb.cancelAt <= today) return false;
    if (mb.endDate && mb.endDate < today) return false;
    const plan = (plans || []).find((p) => p.id === mb.planId);
    // Una cortesía no tiene fecha de cobro que hacer valer.
    if (mb.courtesy) return true;
    if (isDayPassPlan(plan)) return mb.startDate === today;
    if (!mb.nextBilling) return true; // open-ended: one-time
    const limit = parseLocalDate(mb.nextBilling);
    limit.setDate(limit.getDate() + ACCESS_GRACE_DAYS);
    return fmtISO(limit) >= today;
  });
}

// Whether a membership row still ties the member to the gym: active, or paused
// on purpose. Cancelled and ended rows don't. Looser than membershipActive() by
// design — a manual membership past its billing date has LAPSED, not been
// cancelled, and that member is still a client.
export function membershipCurrent(mb) {
  return mb?.status === 'active' || mb?.status === 'paused';
}

// True if a day-pass membership has lapsed (its day has passed).
export function dayPassExpired(mb, plan) {
  return isDayPassPlan(plan) && mb?.status === 'active' && mb.startDate !== todayISO();
}

// Renewal status for the dashboard: { state: 'ok'|'expiring'|'expired'|null, date, days }.
// Only concerns manual (non-Stripe) memberships with a status of 'active'.
export function membershipRenewalStatus(mb, plan, withinDays = 7) {
  if (!mb || mb.status !== 'active') return { state: null };
  // Una cortesía no se renueva nunca, así que no puede estar por vencer ni
  // vencida. Sin esto, una cortesía a la que le quedara una fecha de cobro
  // vieja aparecería en la lista de renovaciones del tablero pidiendo un cobro
  // que no existe. Tercera función con la misma regla — membershipActive() y
  // hasTrainingAccess() ya la tienen, y las tres deben decir lo mismo.
  if (mb.courtesy) return { state: 'ok', date: null };
  // Stripe keeps its own subscriptions current.
  if (mb.stripeSubscriptionId && mb.stripeStatus && !['canceled', 'unpaid', 'incomplete_expired'].includes(mb.stripeStatus)) {
    return { state: 'ok', date: mb.nextBilling };
  }
  const end = isDayPassPlan(plan) ? mb.startDate : mb.nextBilling;
  if (!end) return { state: 'ok', date: null }; // open-ended (e.g. one-time)
  const today = todayISO();
  if (end < today) return { state: 'expired', date: end };
  const days = Math.round((new Date(end) - new Date(today)) / 86400000);
  return { state: days <= withinDays ? 'expiring' : 'ok', date: end, days };
}

// Takes the plan for a custom cadence; a bare recurrence string still works for
// the fixed ones, which is how most callers use it.
export function defaultNextBilling(startDate, recurrence, plan = null) {
  const rec = typeof recurrence === 'string' ? recurrence : recurrence?.recurrence;
  if (!rec || rec === 'one-time' || rec === 'day-pass') return null;
  const [y, m, d] = startDate.split('-').map(Number);
  const next = new Date(y, m - 1, d);
  if (rec === 'monthly') next.setMonth(next.getMonth() + 1);
  else if (rec === 'quarterly') next.setMonth(next.getMonth() + 3);
  else if (rec === 'annual') next.setFullYear(next.getFullYear() + 1);
  else if (rec === 'custom') {
    const p = plan || (typeof recurrence === 'object' ? recurrence : null);
    const n = Math.max(1, Number(p?.intervalCount) || 1);
    const unit = p?.intervalUnit || 'week';
    if (unit === 'day') next.setDate(next.getDate() + n);
    else if (unit === 'week') next.setDate(next.getDate() + n * 7);
    else next.setMonth(next.getMonth() + n);
  }
  return fmtISO(next);
}

// Stripe refuses a recurring interval longer than one year, so the plan editor
// has to stop it before Stripe does.
export const MAX_INTERVAL = { day: 365, week: 52, month: 12 };

// Last day a fixed-term plan covers: the start, advanced one cadence per cycle,
// minus a day so it ends the day BEFORE the charge that never comes. Null for
// an open-ended plan, and for one-time/day-pass, which have no cadence to run.
export function planEndDate(startDate, plan) {
  const cycles = Number(plan?.billingCycles) || 0;
  if (!startDate || cycles < 1) return null;
  let cursor = startDate;
  for (let i = 0; i < cycles; i++) {
    const next = defaultNextBilling(cursor, plan);
    if (!next) return null; // one-time or day pass
    cursor = next;
  }
  const end = parseLocalDate(cursor);
  end.setDate(end.getDate() - 1);
  return fmtISO(end);
}

// How long a fixed-term plan runs, in words: "12 × every 2 weeks".
export function termLabel(plan) {
  const cycles = Number(plan?.billingCycles) || 0;
  if (cycles < 1) return '';
  return `${cycles} × ${recurrenceLabel(plan)}`;
}

const DAYS_PER_MONTH = 30.44;

// ¿Este plan cobra una sola vez? Las tres formas de decirlo viven en campos
// distintos — un día suelto, un cobro sin vencimiento, o un bloque de un solo
// ciclo — y esta función es el único lugar donde se juntan. Todo lo que
// dependa de "¿recurre?" debe preguntar aquí y no reimplementarlo.
export function planIsOneOff(plan) {
  return ['one-time', 'day-pass'].includes(plan?.recurrence)
    || Number(plan?.billingCycles) === 1;
}

// Cómo se cobra un plan, en palabras: "pago único · 16 semanas", "cada mes",
// "cada 2 semanas × 12".
export function planBillingLabel(plan) {
  if (!plan) return '';
  if (plan.recurrence === 'day-pass') return 'pago único · 1 día';
  if (plan.recurrence === 'one-time') return 'pago único';
  if (Number(plan.billingCycles) === 1) {
    const n = Math.max(1, Number(plan.intervalCount) || 1);
    const u = plan.intervalUnit || 'week';
    const palabra = u === 'day' ? 'día' : u === 'week' ? 'semana' : 'mes';
    return `pago único · ${n} ${palabra}${n === 1 ? '' : (u === 'month' ? 'es' : 's')}`;
  }
  const base = recurrenceLabel(plan);
  return Number(plan.billingCycles) > 1 ? `${base} × ${plan.billingCycles}` : base;
}

// What a membership is worth per month, whatever its cadence. MRR used to count
// only 'monthly' plans, so a quarterly or annual member contributed nothing —
// and a custom cadence would have contributed nothing either.
// One-time charges and day passes aren't recurring revenue and count as zero.
export function monthlyValue(membership, plan) {
  if (!plan) return 0;
  // Una cortesía no produce ingreso, tenga el precio que tenga el plan. Sin
  // esto, regalar una membresía de $300 inflaba el MRR en $300 al mes.
  if (membership?.courtesy) return 0;
  // Un plan que corre un solo ciclo y se acaba no es ingreso RECURRENTE, por
  // más que se cobre en bloques: es una venta suelta. Repartir su monto entre
  // los meses del bloque hace que el MRR prometa un ingreso que no va a
  // repetirse. Dos o más ciclos sí: mientras le queden cobros, recurre.
  if (planIsOneOff(plan)) return 0;
  const price = effectiveMembershipPrice(membership, plan);
  switch (plan.recurrence) {
    case 'monthly': return price;
    case 'quarterly': return price / 3;
    case 'annual': return price / 12;
    case 'custom': {
      const n = Math.max(1, Number(plan.intervalCount) || 1);
      if (plan.intervalUnit === 'month') return price / n;
      if (plan.intervalUnit === 'week') return price * (DAYS_PER_MONTH / (7 * n));
      return price * (DAYS_PER_MONTH / n); // days
    }
    default: return 0; // one-time, day-pass
  }
}

// How a plan bills, in words: "monthly", "every 3 weeks", "day pass".
export function recurrenceLabel(plan) {
  if (!plan) return '';
  if (plan.recurrence !== 'custom') return plan.recurrence === 'day-pass' ? 'day pass' : plan.recurrence;
  const n = Number(plan.intervalCount) || 1;
  const unit = plan.intervalUnit || 'week';
  return n === 1 ? `every ${unit}` : `every ${n} ${unit}s`;
}

// One line a member should read before paying: what recurs, and what they're
// tied into. Empty when neither applies.
// ESPEJO de termsLine() en supabase/functions/create-checkout. Una edge
// function no puede importar de aquí, así que el texto vive en dos lugares y
// las dos copias tienen que moverse juntas: esta es la vista previa que ve el
// dueño al editar el plan, y la otra es lo que de verdad se imprime en la
// página de Stripe. Si dicen cosas distintas, la vista previa miente.
export function planTermsLine(plan) {
  if (!plan) return '';
  const bits = [];
  if (planIsOneOff(plan)) {
    // Un pago único tiene que decir que NO se renueva. Es lo primero que la
    // gente busca antes de meter su tarjeta.
    const n = Number(plan.intervalCount) || 0;
    const u = plan.intervalUnit;
    bits.push(plan.recurrence === 'day-pass' ? 'One charge · valid for one day'
      : (Number(plan.billingCycles) === 1 && n > 0 && u)
        ? `One charge for ${n} ${u}${n === 1 ? '' : 's'} · does not renew`
        : 'One charge · does not renew');
  } else {
    bits.push(`Billed ${recurrenceLabel(plan)}`);
    const cycles = Number(plan.billingCycles) || 0;
    if (cycles > 1) bits.push(`${cycles} payments total, then it ends`);
  }
  const months = Number(plan.minCommitmentMonths) || 0;
  if (months > 0) bits.push(`${months}-month minimum commitment`);
  return bits.join(' · ');
}

// Monday (ISO week start) of the week containing a YYYY-MM-DD date. Lo único
// que sobrevivió de scheduleHelpers.js cuando se quitó el calendario de
// clases: el calendario del programa personal sigue arrancando en lunes.
export function mondayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  dt.setDate(dt.getDate() - (dow === 0 ? 6 : dow - 1));
  return fmtISO(dt);
}

// The price actually charged for a membership cycle, after custom price + discount.
export function effectiveMembershipPrice(membership, plan, cycleNumber = 1) {
  if (!plan) return 0;
  const base = membership?.customPrice != null ? membership.customPrice : plan.price;
  const d = membership?.discount;
  if (!d || !d.value) return base;
  if (d.appliesTo === 'first' && cycleNumber > 1) return base;
  if (d.type === 'percent') {
    return Math.max(0, Math.round(base * (1 - Number(d.value) / 100) * 100) / 100);
  }
  if (d.type === 'amount') {
    return Math.max(0, base - Number(d.value));
  }
  return base;
}

// How this member paid last time, so a renewal books itself the same way they
// were charged when the plan was assigned. Card is excluded on purpose: those
// are Stripe renewals, which the webhook records on its own.
export function lastPaymentMethodFor(payments, memberId, fallback = 'cash') {
  const mine = (payments || [])
    .filter((p) => p.memberId === memberId && p.type === 'membership' && p.method && p.method !== 'card')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return mine[0]?.method || fallback;
}

// ---- Readiness scale (how recovered the athlete felt going in) ----
export const READINESS_LABELS = {
  1: { label: 'Drained', desc: 'sore, tired, under-recovered' },
  2: { label: 'Below par', desc: 'a little flat, not 100%' },
  3: { label: 'Steady', desc: 'normal — ready to work' },
  4: { label: 'Strong', desc: 'fresh, energized, dialed in' },
  5: { label: 'Peak', desc: "best you've felt — go heavy" },
};

// ---- 1RM estimation (Epley) ----
export function estimate1RMFromSet(weight, reps) {
  if (!weight || !reps || reps < 1) return null;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

// Best estimated 1RM for an exercise across a member's logs → { value, source } | null.
export function bestEstimated1RM(memberLogs, exerciseId) {
  let best = 0, bestSet = null;
  for (const log of memberLogs || []) {
    for (const s of log.sets || []) {
      if (s.exerciseId !== exerciseId) continue;
      const w = Number(s.value), r = Number(s.reps);
      if (!w || !r) continue;
      const est = estimate1RMFromSet(w, r);
      if (est && est > best) { best = est; bestSet = { weight: w, reps: r, date: log.date }; }
    }
  }
  return best > 0 ? { value: best, source: bestSet } : null;
}

// Suggested load (lbs) for a % of 1RM, rounded to nearest 5.
export function suggestedLoadForPct(estimated1RM, pct) {
  if (!estimated1RM || !pct) return null;
  return Math.round((estimated1RM * pct / 100) / 5) * 5;
}

// ---- Logged metrics (what a client records per exercise) ----
// An exercise logs any combination of: weight, reps, distance, time.
export const LOG_METRICS = ['weight', 'reps', 'distance', 'time'];
export const LOG_METRIC_LABEL = { weight: 'WEIGHT', reps: 'REPS', distance: 'DISTANCE', time: 'TIME' };
// Default set derived from the old measure model, so existing exercises behave
// as before until edited: reps ⇒ weight+reps, distance ⇒ distance, time ⇒ time.
export function defaultLogMetrics(ex) {
  const ms = (ex?.measures && ex.measures.length) ? ex.measures : [ex?.measure || 'reps'];
  const out = [];
  ms.forEach((m) => {
    if (m === 'reps') out.push('weight', 'reps');
    else if (m === 'distance') out.push('distance');
    else if (m === 'time') out.push('time');
  });
  return out.length ? [...new Set(out)] : ['weight', 'reps'];
}
export function logMetricsOf(ex) {
  return (ex?.logMetrics && ex.logMetrics.length) ? ex.logMetrics : defaultLogMetrics(ex);
}
// Read one metric off a saved set, falling back to legacy `value` (old logs put
// the exercise's primary metric — and weight for reps — in `value`).
export function setMetric(set, metric, exMeasure) {
  if (set == null) return null;
  if (set[metric] != null && set[metric] !== '') return Number(set[metric]);
  if (metric === 'reps' && set.reps != null && set.reps !== '') return Number(set.reps);
  if (set.value == null) return null;
  const m = exMeasure || 'reps';
  if (metric === 'weight' && m === 'reps' && !set.bw) return Number(set.value);
  if (metric === 'distance' && m === 'distance') return Number(set.value);
  if (metric === 'time' && m === 'time') return Number(set.value);
  return null;
}

// ---- Récords personales ----
// En tiempo, ¿menos es mejor? Cierto en un sprint, falso en una plancha. El
// default es true porque es lo que la app asumía para todos, así que ningún
// ejercicio existente cambia de significado hasta que se edite a propósito.
export function timeLowerIsBetter(ex) {
  return ex?.timeLowerIsBetter !== false;
}

// La métrica con la que se juzga un récord de este ejercicio.
// Con peso y reps se juzga por lo que de verdad levantó — 500 lb × 3 — y no
// por un 1RM estimado. El estimado es un número que nunca cargó: celebrarlo
// convierte su récord en una cuenta en vez de un levantamiento.
export function prMetricOf(ex) {
  // No todo ejercicio compite. Un estiramiento y un ejercicio de calentamiento
  // se prescriben por duración — "aguanta 30 segundos" — y aguantar menos no es
  // un logro ni aguantar más es una marca. Sin esto, quien sostuviera un
  // estiramiento 20s en vez de 30s recibía una insignia de récord.
  if (ex?.tracksPR === false) return null;
  const lm = logMetricsOf(ex);
  if (lm.includes('weight') && lm.includes('reps')) return 'load';
  if (lm.includes('distance')) return 'distance';
  if (lm.includes('time')) return 'time';
  if (lm.includes('weight')) return 'weight';
  return null;
}

// El valor de una serie en la métrica del récord. Sirve tanto para una serie
// guardada como para una que se está capturando.
export function prValueOfSet(set, ex, metric) {
  if (!set || !metric) return null;
  if (set.bw) return null; // peso corporal: no hay carga que comparar
  if (metric === 'load') {
    const w = setMetric(set, 'weight', ex?.measure);
    const r = setMetric(set, 'reps', ex?.measure);
    return (w > 0 && r > 0) ? { weight: w, reps: r } : null;
  }
  const v = setMetric(set, metric, ex?.measure);
  return (v == null || Number.isNaN(v) || v <= 0) ? null : v;
}

// La marca a vencer: el mejor valor anterior de este ejercicio, con la fecha
// en que lo hizo, o null si nunca lo ha hecho. Quien llama filtra primero la
// sesión que se está capturando — comparar una serie contra sí misma haría
// que todo fuera récord.
export function bestPriorPR(memberLogs, ex) {
  const metric = prMetricOf(ex);
  if (!metric || !ex) return null;
  const lower = metric === 'time' && timeLowerIsBetter(ex);
  const base = { metric, lower };
  let best = null, when = null;
  for (const log of memberLogs) {
    for (const s of log.sets || []) {
      if (s.exerciseId !== ex.id) continue;
      const v = prValueOfSet(s, ex, metric);
      if (v == null) continue;
      if (best == null || beatsPR(v, { ...base, value: best })) { best = v; when = log.date; }
    }
  }
  return best == null ? null : { ...base, value: best, date: when };
}

// ¿Esta serie rompe la marca? Sin marca previa no hay récord: la primera vez
// que alguien hace un ejercicio no está rompiendo nada, y felicitarlo por eso
// vacía la insignia de significado.
//
// En peso+reps la comparación es de dos niveles, que es como lo piensa quien
// levanta: más peso gana, y a mismo peso, más reps gana. 500×5 supera a 500×3,
// y 505×1 supera a 500×5 porque la barra pesó más.
export function beatsPR(value, prior) {
  if (value == null || !prior || prior.value == null) return false;
  if (prior.metric === 'load') {
    if (value.weight > prior.value.weight) return true;
    return value.weight === prior.value.weight && value.reps > prior.value.reps;
  }
  return prior.lower ? value < prior.value : value > prior.value;
}

// "500 lb × 3", o "1.79 s". Como se nombra un récord en voz alta.
export function prLabel(value, metric, unidad) {
  if (value == null) return '';
  // A medios: en libras siempre es entero, pero en kilos 62.5 no debe leerse 63.
  if (metric === 'load') return `${Math.round(value.weight * 2) / 2} ${unidad} × ${value.reps}`;
  return `${Math.round(value * 100) / 100} ${unidad}`;
}

// ---- Weight units ----
// Storage is always pounds so all tracking/progression stays consistent. A
// member may enter in kg (converted on save) or mark a set as bodyweight (BW).
export const LB_PER_KG = 2.2046226218;
export function kgToLb(kg) { return Math.round(Number(kg) * LB_PER_KG); }
export function lbToKgDisplay(lb) { return Math.round((Number(lb) / LB_PER_KG) * 2) / 2; }

// ---- YouTube helpers (exercise videos) ----
export function getYouTubeId(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
export function youtubeThumb(url) {
  const id = getYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}
export function youtubeEmbed(url) {
  const id = getYouTubeId(url);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}

// Short labels for measurement units.
export function unitLabel(unit) {
  const map = { yd: 'yd', ft: 'ft', in: 'in', m: 'm', 'ft-in': 'ft + in', s: 's', min: 'min' };
  return map[unit] || unit || '';
}

// Human label for a membership's discount, e.g. "10% off · all cycles".
export function discountLabel(discount) {
  if (!discount || !discount.value) return null;
  const val = discount.type === 'percent' ? `${discount.value}% off` : `$${discount.value} off`;
  const when = discount.appliesTo === 'first' ? 'first cycle only' : 'all cycles';
  return `${val} · ${when}`;
}
