// ============================================================
//  WORKOUT DOMAIN — sections, circuits, item grouping
//  Ported from the prototype. Used by the exercise library (section
//  filter) and the workout builder (Phase 3b).
// ============================================================

// Order matters — drives display order in workouts.
export const SECTIONS = [
  // textOnly: holds coach notes, not exercises — never offered in the library.
  { id: 'Prep Work',       label: 'Prep Work',       hint: 'Set the room. Set the body.', textOnly: true },
  { id: 'Mobility',        label: 'Mobility',        hint: 'Loosen the joints. Open the body.' },
  { id: 'Activation',      label: 'Activation',      hint: 'Wake the right muscles.' },
  { id: 'Dynamic Warm-Up', label: 'Dynamic Warm-Up', hint: 'Raise temp. Prime the pattern.' },
  { id: 'Skill',           label: 'Skill',           hint: 'Practice the movement, not the load.' },
  { id: 'Strength',        label: 'Strength',        hint: 'The work that tells the truth.' },
  { id: 'HIIT',            label: 'HIIT',            hint: 'All-out intervals. Empty the tank.' },
  { id: 'Stretch',         label: 'Stretch',         hint: 'Restore length. End calm.' },
];
export const SECTION_IDS = SECTIONS.map((s) => s.id);
// Sections an exercise can actually belong to (excludes note-only ones like
// Prep Work) — used by the exercise library's filters and tagging.
export const EXERCISE_SECTIONS = SECTIONS.filter((s) => !s.textOnly);
export const EXERCISE_SECTION_IDS = EXERCISE_SECTIONS.map((s) => s.id);

// El nombre completo de la rutina no cabe en una columna de calendario en un
// teléfono (unos 50 px). Recortarlo por el principio no sirve: en los nombres
// que hay de verdad el prefijo es justo lo que se repite — "FW - David Hdz - ",
// "FW Athletes - 4 Day Eccentric Block - " — y lo que distingue un día de otro
// está al final. Así que se conserva el último tramo: "Day 2", "Bloque 12",
// "Bloque 1 Día 1 · S1". Un nombre sin guiones se queda entero y se recorta con
// puntos suspensivos a dos renglones.
export function etiquetaCorta(nombre) {
  const partes = String(nombre || '').split(/\s+[-–—]\s+/);
  return partes[partes.length - 1].trim() || String(nombre || '');
}

// Sort items in canonical section order, then by circuit letter, preserving
// original order within.
export function sortWorkoutItems(items) {
  const indexOf = (s) => {
    const i = SECTION_IDS.indexOf(s);
    return i === -1 ? 999 : i;
  };
  return [...items]
    .map((it, idx) => ({ ...it, _idx: idx }))
    .sort((a, b) => {
      const sa = indexOf(a.section), sb = indexOf(b.section);
      if (sa !== sb) return sa - sb;
      const ca = (a.circuit || 'Z').toUpperCase();
      const cb = (b.circuit || 'Z').toUpperCase();
      if (ca !== cb) return ca < cb ? -1 : 1;
      return a._idx - b._idx;
    })
    // eslint-disable-next-line no-unused-vars
    .map(({ _idx, ...rest }) => rest);
}

// Group items into [{ section, hint, circuits: [{ letter, items: [] }] }].
export function groupWorkoutItems(items) {
  const sorted = sortWorkoutItems(items);
  const bySection = {};
  sorted.forEach((it) => {
    const sec = it.section || 'Strength';
    if (!bySection[sec]) bySection[sec] = {};
    const circ = (it.circuit || 'A').toUpperCase();
    if (!bySection[sec][circ]) bySection[sec][circ] = [];
    bySection[sec][circ].push(it);
  });
  return SECTIONS.filter((s) => bySection[s.id]).map((s) => ({
    section: s.id,
    hint: s.hint,
    circuits: Object.keys(bySection[s.id]).sort().map((letter) => ({ letter, items: bySection[s.id][letter] })),
  }));
}

export function nextCircuitLetter(itemsInSection) {
  const used = new Set(itemsInSection.map((it) => (it.circuit || 'A').toUpperCase()));
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    if (!used.has(letter)) return letter;
  }
  return 'A';
}

export function formatTempo(tempo) {
  if (!tempo) return null;
  if (tempo.type === 'eccentric' && tempo.seconds > 0) return `ECC ${tempo.seconds}s`;
  if (tempo.type === 'isometric' && tempo.seconds > 0) return `ISO ${tempo.seconds}s`;
  return null;
}

// Lo que se lee en una celda de calendario. La etiqueta que el coach escribio
// manda; si no escribio ninguna, se deduce del nombre. Asi las rutinas viejas
// siguen viendose igual sin tener que reeditarlas una por una.
export function etiquetaCalendario(workout) {
  return (workout?.shortLabel || '').trim() || etiquetaCorta(workout?.name);
}
