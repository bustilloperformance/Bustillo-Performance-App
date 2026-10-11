// ============================================================
//  WEEKLY CHECK-IN — the questions, and the reading of the answers.
//  Answers are stored as jsonb keyed by these ids, so rewording a question or
//  adding one is a change here and nowhere else. Keep the ids stable: change
//  an id and every past answer to it goes unreadable.
// ============================================================
import { fmtISO, parseLocalDate, todayISO } from './helpers';

export const CHECK_IN_INTRO =
  'Tu progreso va más allá del peso. Dedica 3 minutos a contarme cómo te fue ' +
  'durante los últimos 7 días. Tus respuestas me ayudan a ajustar tu entrenamiento ' +
  'y apoyarte mejor. Contesta con honestidad: no necesitas tener una semana perfecta.';

export const CHECK_IN_THANKS =
  '¡Listo! Recibí tu check-in. Revisaré cómo te fue para identificar qué mantener ' +
  'y qué ajustar. Gracias por dedicarle tiempo a tu proceso.\n\n— Josean';

// type: text | long | choice | scale
// `flag` marks an answer worth surfacing on the staff sweep: a value at or past
// it means something to look at, not something to scroll by.
// No name question: the row carries member_id and they answered signed in.
// It's in the Google Form original because a form has no idea who's writing.
export const CHECK_IN_QUESTIONS = [
  {
    id: 'sesiones', n: 1, type: 'text',
    q: '¿Cuántos entrenamientos tenías programados y cuántos completaste?',
    hint: 'Ejemplo: "Completé 3 de 4".',
  },
  {
    id: 'dificultad', n: 2, type: 'choice',
    q: '¿Cómo sentiste el nivel de tus entrenamientos?',
    options: ['Muy fáciles', 'Algo fáciles', 'Retadores, pero adecuados', 'Demasiado exigentes'],
    flagValues: ['Muy fáciles', 'Demasiado exigentes'], // load is off in one direction or the other
  },
  {
    id: 'energia', n: 3, type: 'scale',
    q: '¿Cómo estuvo tu energía durante la semana?',
    low: 'Sin energía', high: 'Excelente',
    flagBelow: 4,
  },
  {
    id: 'sueno', n: 4, type: 'choice',
    q: '¿Cuántas horas dormiste por noche, en promedio?',
    options: ['Menos de 5', 'De 5 a menos de 6', 'De 6 a menos de 7', 'De 7 a 8', 'Más de 8'],
    flagValues: ['Menos de 5', 'De 5 a menos de 6'],
  },
  {
    id: 'estres', n: 5, type: 'scale',
    q: '¿Cómo estuvo tu nivel de estrés?',
    low: 'Muy tranquilo', high: 'Muy estresado',
    flagAbove: 7,
  },
  {
    id: 'alimentacion', n: 6, type: 'choice',
    q: '¿Qué tanto pudiste cumplir los hábitos de alimentación que acordamos?',
    options: ['Casi nada', 'Algunos días', 'La mayoría de los días', 'Prácticamente toda la semana',
      'Todavía no hemos establecido hábitos de alimentación'],
    flagValues: ['Casi nada'],
  },
  {
    id: 'dolor', n: 7, type: 'text',
    q: '¿Tuviste algún dolor o molestia que afectara tu entrenamiento o tu día?',
    hint: 'Si sí, dime dónde, en qué movimiento y cuánto te limitó. Si no, escribe "Ninguno".',
    flagUnless: ['ninguno', 'no', 'ninguna', 'nada', '-', 'n/a'], // anything else is a real report
  },
  {
    id: 'logro', n: 8, type: 'text',
    q: '¿Cuál fue tu mayor logro de esta semana?',
    hint: 'Puede ser mejorar un ejercicio, entrenar con constancia, dormir mejor o sentirte con más confianza.',
  },
  { id: 'dificil', n: 9, type: 'long', q: '¿Qué fue lo que más te costó y cómo puedo ayudarte?' },
  {
    id: 'proxima', n: 10, type: 'text',
    q: '¿Hay algo que debamos considerar para la próxima semana?',
    hint: 'Viajes, horarios, equipo disponible u otra situación. Si todo sigue igual, escribe "Sin cambios".',
  },
  {
    id: 'peso', n: 11, type: 'text', optional: true,
    q: '¿Cuál es tu peso actual?',
    hint: 'Solo si estamos llevando seguimiento de peso. Incluye la unidad: kg o lb.',
  },
];

// Required = everything but the optional ones. Used to gate the submit button.
export function missingAnswers(answers) {
  return CHECK_IN_QUESTIONS.filter((q) => !q.optional && !String(answers?.[q.id] ?? '').trim());
}

// The Monday of the week a given date belongs to — the key a check-in is filed
// under, shared with the training week it reports on.
export function weekStartOf(iso = todayISO()) {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Mon = 0
  return fmtISO(d);
}

// The Sunday that closes a week — when the form is offered.
export function weekEndOf(weekStart) {
  const d = parseLocalDate(weekStart);
  d.setDate(d.getDate() + 6);
  return fmtISO(d);
}

// When the check-in is on offer, and which week it files under.
//
// It reports on the week that has just CLOSED, and is offered from the Sunday
// that closes it through the Tuesday after — Sunday on time, Monday and
// Tuesday late. The late days are the part that needs care: on Monday the
// calendar week has already rolled over, so filing under "this week" would put
// the answers on a week that has barely started. Outside the window the same
// week is still the one a preview should show.
export function checkInWindow(iso = todayISO()) {
  const dow = parseLocalDate(iso).getDay(); // 0 = Sunday
  let weekStart = weekStartOf(iso);
  if (dow !== 0) {
    const d = parseLocalDate(weekStart);
    d.setDate(d.getDate() - 7);
    weekStart = fmtISO(d);
  }
  return { open: dow <= 2, late: dow === 1 || dow === 2, weekStart };
}

const MESES = ['enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre'];

// "del 21 al 27 de septiembre", or "del 28 de septiembre al 4 de octubre"
// when the week straddles two months. Dates as 2026-09-21 are precise and
// unreadable; nobody thinks about their week that way.
export function weekLabel(weekStart) {
  const a = parseLocalDate(weekStart);
  const b = parseLocalDate(weekEndOf(weekStart));
  const mesA = MESES[a.getMonth()];
  const mesB = MESES[b.getMonth()];
  return a.getMonth() === b.getMonth()
    ? `del ${a.getDate()} al ${b.getDate()} de ${mesB}`
    : `del ${a.getDate()} de ${mesA} al ${b.getDate()} de ${mesB}`;
}

// El martes en que cierra la ventana, en palabras. weekStart es el LUNES de la
// semana que se reporta: el domingo que la cierra cae en +6, y el formulario
// sigue abierto lunes y martes, así que el plazo es +8. (+9 sería miércoles —
// weekStart es lunes, no domingo.) Decirle "hasta el martes 29" es lo único
// que convierte "está abierto" en algo que se puede agendar.
export function deadlineLabel(weekStart) {
  const d = parseLocalDate(weekStart);
  d.setDate(d.getDate() + 8);
  return `martes ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

// Answers worth the coach's attention, in the words the client used. Empty
// when the week reads as ordinary — a check-in with nothing flagged needs no
// reading, and that's the point of the sweep.
export function flagsFor(answers) {
  const out = [];
  for (const q of CHECK_IN_QUESTIONS) {
    const raw = answers?.[q.id];
    if (raw == null || String(raw).trim() === '') continue;
    const val = String(raw).trim();
    if (q.flagValues?.includes(val)) out.push({ id: q.id, label: shortLabel(q), value: val });
    else if (q.flagBelow != null && Number(val) <= q.flagBelow) out.push({ id: q.id, label: shortLabel(q), value: `${val}/10` });
    else if (q.flagAbove != null && Number(val) >= q.flagAbove) out.push({ id: q.id, label: shortLabel(q), value: `${val}/10` });
    else if (q.flagUnless && !q.flagUnless.includes(val.toLowerCase().replace(/[.!]/g, ''))) {
      out.push({ id: q.id, label: shortLabel(q), value: val });
    }
  }
  return out;
}

const SHORT = {
  dificultad: 'CARGA', energia: 'ENERGÍA', sueno: 'SUEÑO',
  estres: 'ESTRÉS', alimentacion: 'NUTRICIÓN', dolor: 'DOLOR',
};
function shortLabel(q) { return SHORT[q.id] || q.id.toUpperCase(); }
