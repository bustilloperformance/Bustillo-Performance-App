import { useMemo, useState, useRef, useEffect } from 'react';
import { X, Check, GripVertical } from 'lucide-react';
import { C } from '../../theme';
import { marcarEdicion, liberarEdicion } from '../../lib/editing';
import { unitLabel } from '../../lib/helpers';
import { useData } from '../../data/store';
import { saveExercise } from '../../data/exercises';
import { useToast } from '../feedback';
import { SECTIONS, SECTION_IDS, groupWorkoutItems, sortWorkoutItems, nextCircuitLetter, etiquetaCorta } from '../../lib/workoutHelpers';
import { Modal, Btn, Field } from '../ui';
import { inputClass, inputStyle } from '../uiStyles';
import { AddSectionDropdown, AddToSectionPicker } from './pickers';

// ============================================================
//  WORKOUT BUILDER — reusable section + circuit builder modal.
//  Owns local edit state; calls onSave(cleanedWorkout) when confirmed.
//  Used by WorkoutsView (catalog) and, later, PersonalProgramEditor.
// ============================================================
// Per-section starting values so building a session is fast — the coach only
// tweaks the exceptions. `target` holds reps, distance or time depending on
// how the exercise is measured.
const HIIT_DEFAULTS = { rounds: 4, workSec: 40, restSec: 20 };
// Prep/warm-up/cool-down work is performed, not recorded — the client shouldn't
// get weight/rep fields for it. Still editable per item in the builder.
const NOT_LOGGED_SECTIONS = ['Mobility', 'Activation', 'Dynamic Warm-Up', 'Stretch'];
function defaultItemFor(section, measure) {
  const base = { tempo: { type: 'none', seconds: 0 }, loadPct: 0, trackable: !NOT_LOGGED_SECTIONS.includes(section) };
  if (section === 'Mobility' || section === 'Activation') return { ...base, sets: 1, target: '10' };
  if (section === 'Dynamic Warm-Up') return { ...base, sets: 1, target: measure === 'distance' ? '15' : '20' };
  if (section === 'Stretch') return { ...base, sets: 1, target: measure === 'time' ? '40' : '10' };
  return { ...base, sets: 3, target: '10' }; // Strength, Skill, HIIT, Prep Work
}
// La etiqueta del objetivo sale de la unidad del ejercicio, no de la medida:
// un ejercicio en minutos decia SEC y el coach escribia 90 pensando en segundos.
function targetLabel(measure, ex) {
  if (measure === 'time') return unitLabel(ex?.units?.time || 's') === 'min' ? 'MIN' : 'SEC';
  if (measure === 'distance') return unitLabel(ex?.units?.distance || 'yd').toUpperCase();
  return 'REPS';
}

export default function WorkoutBuilder({ initialWorkout, editing, onSave, onClose, title, eyebrow }) {
  // Mientras este editor esta abierto no se recarga la pagina (ni por jalar
  // para refrescar ni por actualizacion automatica): se perderia lo capturado.
  useEffect(() => { marcarEdicion('workout-builder'); return () => liberarEdicion('workout-builder'); }, []);
  const { data, refresh } = useData();
  const showToast = useToast();

  const [form, setForm] = useState(() => {
    if (!initialWorkout) return { name: '', focus: '', difficulty: 'Beginner', items: [], closingMessage: '', shortLabel: '' };
    const items = (initialWorkout.items || []).map((it) => ({ section: it.section || 'Strength', circuit: it.circuit || 'A', ...it }));
    return { ...initialWorkout, items };
  });
  const [openSections, setOpenSections] = useState([]);

  // HIIT circuits carry interval params (shared across the circuit's items).
  const hiitParamsFor = (items, section, circuit) => {
    const ex = items.find((it) => it.section === section && it.circuit === circuit && it.rounds != null);
    return ex ? { rounds: ex.rounds, workSec: ex.workSec, restSec: ex.restSec } : { ...HIIT_DEFAULTS };
  };
  // Seed a new item from the section's defaults, using how the exercise is measured.
  const newItem = (exerciseId, section) => {
    const ex = data.exercises.find((e) => e.id === exerciseId);
    return defaultItemFor(section, ex?.measure || 'reps');
  };
  const addItemToCircuit = (exerciseId, section, circuit) =>
    setForm((f) => ({ ...f, items: [...f.items, { exerciseId, section, circuit, ...newItem(exerciseId, section), ...(section === 'HIIT' ? hiitParamsFor(f.items, section, circuit) : {}) }] }));
  const addItemAsNewCircuit = (exerciseId, section) =>
    setForm((f) => {
      const letter = nextCircuitLetter(f.items.filter((it) => it.section === section));
      return { ...f, items: [...f.items, { exerciseId, section, circuit: letter, ...newItem(exerciseId, section), ...(section === 'HIIT' ? { ...HIIT_DEFAULTS } : {}) }] };
    });
  const addTextItemToSection = (text, section) =>
    setForm((f) => ({ ...f, items: [...f.items, { _isText: true, text, section, circuit: 'A' }] }));
  const addEmptySection = (section) => setOpenSections((prev) => (prev.includes(section) ? prev : [...prev, section]));
  const updateItem = (idx, patch) => setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  // Update the interval params on every item of a HIIT circuit at once.
  const updateCircuit = (section, circuit, patch) => setForm((f) => ({ ...f, items: f.items.map((it) => (it.section === section && it.circuit === circuit ? { ...it, ...patch } : it)) }));
  const removeItem = (idx) => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  // Drag to reorder within a circuit (pointer-based — works on touch + mouse). We
  // track the real form.items object being dragged and, as the finger passes over
  // another exercise in the SAME circuit, splice it into that spot live.
  const dragRef = useRef(null);
  const [draggingItem, setDraggingItem] = useState(null);
  const startDrag = (e, item) => {
    dragRef.current = item;
    setDraggingItem(item);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const moveDrag = (e) => {
    const dragItem = dragRef.current;
    if (!dragItem) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el && el.closest ? el.closest('[data-fidx]') : null;
    if (!row) return;
    const overIdx = Number(row.getAttribute('data-fidx'));
    setForm((f) => {
      const from = f.items.indexOf(dragItem);
      if (from < 0 || from === overIdx) return f;
      const over = f.items[overIdx];
      if (!over || over.section !== dragItem.section || (over.circuit || 'A') !== (dragItem.circuit || 'A')) return f; // same circuit only
      const items = f.items.filter((x) => x !== dragItem);
      const insertAt = items.indexOf(over) + (from < overIdx ? 1 : 0);
      items.splice(insertAt, 0, dragItem);
      return { ...f, items };
    });
  };
  const endDrag = () => { dragRef.current = null; setDraggingItem(null); };
  // Flat form.items indices of a circuit's exercises, in order — reliable even with
  // duplicate exercises (unlike matching by content).
  const circuitFlatIdxs = (section, letter) =>
    form.items.reduce((a, x, i) => { if (!x._isText && (x.section || 'Strength') === section && (x.circuit || 'A').toUpperCase() === letter) a.push(i); return a; }, []);

  const grouped = useMemo(() => {
    const fromItems = groupWorkoutItems(form.items);
    const presentIds = new Set(fromItems.map((g) => g.section));
    const empty = openSections.filter((s) => !presentIds.has(s)).map((s) => ({ section: s, hint: SECTIONS.find((x) => x.id === s)?.hint || '', circuits: [] }));
    return [...fromItems, ...empty].sort((a, b) => {
      const ai = SECTION_IDS.indexOf(a.section), bi = SECTION_IDS.indexOf(b.section);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [form.items, openSections]);

  const presentSections = new Set([...form.items.map((it) => it.section || 'Strength'), ...openSections]);
  const missingSections = SECTIONS.filter((s) => !presentSections.has(s.id));

  const findItemIdx = (target) =>
    form.items.findIndex((it) =>
      target._isText
        ? it._isText && it.section === target.section && it.text === target.text
        : it.exerciseId === target.exerciseId && it.section === target.section && it.circuit === target.circuit && it.sets === target.sets && it.target === target.target
    );

  // Crear un ejercicio sin salir de la rutina a medias. Devuelve el id para que
  // el picker lo meta al circuito en el acto. El refresh es obligatorio: sin el,
  // el ejercicio existe en la base pero data.exercises no lo tiene y el renglon
  // recien anadido se quedaria sin nombre.
  const crearEjercicio = async (formEj) => {
    try {
      const id = await saveExercise(formEj, null);
      await refresh();
      showToast(`"${formEj.name}" added to the library.`);
      return id;
    } catch (err) {
      showToast(err.message || 'Could not create the exercise.');
      return null;
    }
  };

  const save = () => {
    if (!form.name) { showToast('Workout needs a name.'); return; }
    const cleaned = form.items.filter((it) => !it._isText || (it.text && it.text.trim()));
    if (cleaned.length === 0) { showToast('Add at least one exercise or note.'); return; }
    onSave({ ...form, items: sortWorkoutItems(cleaned) });
  };

  return (
    <Modal title={title || (editing ? 'Edit Workout' : 'Build Workout')} eyebrow={eyebrow || 'METHOD · SESSION BUILDER'} onClose={onClose} size="xl">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div className="sm:col-span-2"><Field label="WORKOUT NAME"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} style={inputStyle} /></Field></div>
        <Field label="DIFFICULTY">
          <select value={form.difficulty || 'Beginner'} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} className={inputClass} style={inputStyle}>
            <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="sm:col-span-2"><Field label="FOCUS"><input value={form.focus || ''} onChange={(e) => setForm({ ...form, focus: e.target.value })} placeholder="Strength, Power, Conditioning..." className={inputClass} style={inputStyle} /></Field></div>
        {/* En el calendario del cliente una columna mide unos 50 px en un
            teléfono: ahí no cabe el nombre completo. Esto es lo que se lee ese
            día. Vacío, se deduce del nombre quedándose con el último tramo. */}
        <Field label="CALENDAR LABEL">
          <input value={form.shortLabel || ''} onChange={(e) => setForm({ ...form, shortLabel: e.target.value.slice(0, 14) })}
            maxLength={14} placeholder={etiquetaCorta(form.name) || 'B1 - D1'} className={inputClass} style={inputStyle} />
          <div className="help mt-1" style={{ fontSize: '13px', color: C.moss }}>
            — what the client sees in the calendar.{' '}
            <span style={{ color: C.goldDeep }}>{form.shortLabel?.trim() ? `Shows "${form.shortLabel.trim()}"` : `Blank shows "${etiquetaCorta(form.name) || '—'}"`}</span>
          </div>
        </Field>
      </div>

      {missingSections.length > 0 && (
        <div className="flex items-center justify-between mb-3 p-3" style={{ background: C.bone, border: `1px solid ${C.charcoal}20` }}>
          <div>
            <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>ADD A SECTION</div>
            <div className="help" style={{ fontSize: '14px', color: C.goldDeep }}>— prep work, mobility, activation, dynamic warm-up, skill, strength, stretch.</div>
          </div>
          <AddSectionDropdown sections={missingSections} onAdd={addEmptySection} />
        </div>
      )}

      {grouped.length === 0 && (
        <div className="p-8 text-center ui-strong" style={{ fontSize: '20px', color: C.moss, border: `1px dashed ${C.charcoal}30` }}>
          Pick a section above to start building.
        </div>
      )}

      {grouped.length > 0 && (
        <div className="space-y-4">
          {grouped.map((g) => (
            <div key={g.section} style={{ background: C.bone, border: `1px solid ${C.charcoal}20` }}>
              <div className="flex items-center justify-between p-3" style={{ background: C.ink, color: C.bone }}>
                <div>
                  <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.gold }}>— SECTION</div>
                  <div className="display" style={{ fontSize: '22px', color: C.cream, fontWeight: 600, letterSpacing: '0.02em' }}>{g.section}</div>
                  <div className="help" style={{ fontSize: '14px', color: C.sand }}>— {g.hint}</div>
                </div>
                <AddToSectionPicker onCreate={crearEjercicio} section={g.section} label={g.section === 'Prep Work' ? '+ ADD NOTE' : '+ NEW CIRCUIT'} exercises={data.exercises}
                  onPick={(exId) => addItemAsNewCircuit(exId, g.section)} onPickText={(text) => addTextItemToSection(text, g.section)} dark />
              </div>

              {g.section === 'Prep Work' ? (
                <div className="p-3 space-y-2">
                  {g.circuits.flatMap((c) => c.items).length === 0 && (
                    <div className="help text-center py-3" style={{ fontSize: '15px', color: C.moss }}>— tap + ADD NOTE above to write a coach reminder.</div>
                  )}
                  {g.circuits.flatMap((c) => c.items).map((it) => {
                    const idx = findItemIdx(it);
                    return (
                      <div key={idx} className="flex items-start gap-3 px-3 py-2" style={{ background: C.cream, border: `1px solid ${C.charcoal}15` }}>
                        <div className="mono pt-0.5" style={{ fontSize: '14px', color: C.gold }}>·</div>
                        <textarea value={it.text || ''} onChange={(e) => updateItem(idx, { text: e.target.value })} rows="2" autoFocus={!it.text}
                          placeholder="e.g. Set up bench at station 2, foam roller within reach..." className="flex-1 px-2 py-1 text-sm" style={inputStyle} />
                        <button onClick={() => removeItem(idx)} className="p-1.5 flex-shrink-0" style={{ background: C.sand }} title="Remove note"><X size={11} /></button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 space-y-3">
                  {g.circuits.length === 0 && (
                    <div className="help text-center py-3" style={{ fontSize: '15px', color: C.moss }}>— tap + NEW CIRCUIT above to add your first exercise.</div>
                  )}
                  {g.circuits.map((c) => (
                    <div key={c.letter} style={{ background: C.cream, border: `1px solid ${C.charcoal}15` }}>
                      <div className="flex items-center justify-between px-3 py-2" style={{ background: C.cream, borderBottom: `1px solid ${C.charcoal}15` }}>
                        <div className="flex items-center gap-3">
                          <div className="ui-strong" style={{ fontSize: '24px', color: C.goldDeep, lineHeight: 1 }}>{c.letter}</div>
                          <div>
                            <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>CIRCUIT · {c.items.length} EXERCISE{c.items.length === 1 ? '' : 'S'}</div>
                            {c.items.length > 1 && <div className="help" style={{ fontSize: '13px', color: C.goldDeep }}>— performed as a group, back-to-back.</div>}
                          </div>
                        </div>
                        <AddToSectionPicker onCreate={crearEjercicio} section={g.section} circuit={c.letter} label="+ ADD TO CIRCUIT" exercises={data.exercises} onPick={(exId) => addItemToCircuit(exId, g.section, c.letter)} />
                      </div>

                      {g.section === 'HIIT' && (() => {
                        const p = hiitParamsFor(form.items, g.section, c.letter);
                        return (
                          <div className="flex flex-wrap items-end gap-2 px-3 py-2" style={{ background: C.bone, borderBottom: `1px solid ${C.charcoal}15` }}>
                            {[{ k: 'rounds', l: 'ROUNDS', min: 1, w: 66 }, { k: 'workSec', l: 'WORK (S)', min: 1, w: 76 }, { k: 'restSec', l: 'REST (S)', min: 0, w: 76 }].map((fld) => (
                              <div key={fld.k}>
                                <label className="mono block mb-0.5" style={{ fontSize: '10px', letterSpacing: '0.1em', color: C.moss }}>{fld.l}</label>
                                <input type="number" min={fld.min} value={p[fld.k]} onChange={(e) => updateCircuit(g.section, c.letter, { [fld.k]: Math.max(fld.min, Number(e.target.value) || 0) })} className="px-2 py-1 text-sm" style={{ ...inputStyle, width: fld.w }} />
                              </div>
                            ))}
                            <div className="help" style={{ fontSize: '13px', color: C.goldDeep }}>— {p.rounds} rounds · {p.workSec}s work / {p.restSec}s rest{c.items.length > 1 ? ` · ${c.items.length} exercises/round` : ''}</div>
                          </div>
                        );
                      })()}

                      {c.items.map((it, j) => {
                        const idx = circuitFlatIdxs(g.section, c.letter)[j];
                        const realItem = form.items[idx];
                        const ex = data.exercises.find((e) => e.id === it.exerciseId);
                        const reg = ex?.regressionId ? data.exercises.find((x) => x.id === ex.regressionId) : null;
                        const prog = ex?.progressionId ? data.exercises.find((x) => x.id === ex.progressionId) : null;
                        const isDragging = draggingItem && draggingItem === realItem;
                        const Handle = (
                          <button type="button" onPointerDown={(e) => startDrag(e, realItem)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
                            className="flex-shrink-0 p-1" style={{ touchAction: 'none', cursor: 'grab', color: C.moss }} title="Drag to reorder within the circuit"><GripVertical size={16} /></button>
                        );
                        if (g.section === 'HIIT') {
                          return (
                            <div key={idx} data-fidx={idx} className="flex items-center gap-1 px-2 py-2" style={{ borderBottom: `1px solid ${C.charcoal}10`, opacity: isDragging ? 0.4 : 1, background: isDragging ? C.bone : 'transparent' }}>
                              {Handle}
                              <div className="flex-1 min-w-0">
                                <div className="prog-name" style={{ fontSize: '17px' }}>{ex?.name || '?'}</div>
                                <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>{ex?.category?.toUpperCase()}</div>
                                <input value={it.note || ''} onChange={(e) => updateItem(idx, { note: e.target.value })} placeholder="Note (optional)" className="w-full mt-1 px-2 py-1 text-sm" style={{ ...inputStyle, fontStyle: 'italic' }} />
                              </div>
                              <button onClick={() => removeItem(idx)} className="p-1.5 flex-shrink-0" style={{ background: C.sand }} title="Remove"><X size={11} /></button>
                            </div>
                          );
                        }
                        return (
                          <div key={idx} data-fidx={idx} className="grid grid-cols-6 md:grid-cols-12 gap-2 items-start md:items-center px-3 py-2.5" style={{ borderBottom: `1px solid ${C.charcoal}10`, opacity: isDragging ? 0.4 : 1, background: isDragging ? C.bone : 'transparent' }}>
                            <div className="col-span-6 md:col-span-4 flex items-start justify-between gap-2">
                              <div className="flex items-start gap-1 min-w-0">
                              {Handle}
                              <div className="min-w-0">
                              <div className="prog-name" style={{ fontSize: '17px' }}>{ex?.name || '?'}</div>
                              <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>{ex?.measure?.toUpperCase()} · {ex?.category?.toUpperCase()}</div>
                              {(reg || prog) && (
                                <div className="flex gap-1 mt-1 flex-wrap">
                                  {reg && <span className="mono px-1.5 py-0.5" style={{ fontSize: '10px', letterSpacing: '0.1em', background: C.forest, color: C.ink }} title={`Regression: ${reg.name}`}>↓ {reg.name}</span>}
                                  {prog && <span className="mono px-1.5 py-0.5" style={{ fontSize: '10px', letterSpacing: '0.1em', background: C.gold, color: C.bone }} title={`Progression: ${prog.name}`}>↑ {prog.name}</span>}
                                </div>
                              )}
                              </div>
                              </div>
                              <button onClick={() => removeItem(idx)} className="md:hidden p-1.5 flex-shrink-0" style={{ background: C.sand }} title="Remove"><X size={12} /></button>
                            </div>
                            <div className="col-span-3 md:col-span-2">
                              <label className="mono block mb-0.5" style={{ fontSize: '10px', letterSpacing: '0.1em', color: C.moss }}>CIRCUIT</label>
                              <select value={it.circuit || 'A'} onChange={(e) => updateItem(idx, { circuit: e.target.value })} className="w-full px-1.5 py-1.5 md:py-1" style={{ ...inputStyle, fontSize: '13px' }}>
                                {['A', 'B', 'C', 'D', 'E', 'F'].map((L) => <option key={L} value={L}>{L}</option>)}
                              </select>
                            </div>
                            <div className="col-span-3 md:col-span-1">
                              <label className="mono block mb-0.5" style={{ fontSize: '10px', letterSpacing: '0.1em', color: C.moss }}>SETS</label>
                              <input type="number" value={it.sets} onChange={(e) => updateItem(idx, { sets: Number(e.target.value) })} className="w-full px-2 py-1.5 md:py-1 text-sm" style={inputStyle} />
                            </div>
                            <div className="col-span-6 md:col-span-2">
                              {(() => {
                                const ms = ex?.measures?.length ? ex.measures : [ex?.measure || 'reps'];
                                const val = ms.includes(it.measure) ? it.measure : ms[0];
                                return ms.length > 1 ? (
                                  <select value={val} onChange={(e) => updateItem(idx, { measure: e.target.value })} title="Measure for this exercise"
                                    className="mono block mb-0.5 cursor-pointer" style={{ fontSize: '10px', letterSpacing: '0.1em', color: C.goldDeep, background: 'transparent', border: 'none', padding: 0 }}>
                                    {ms.map((m) => <option key={m} value={m}>{targetLabel(m, ex)} ▾</option>)}
                                  </select>
                                ) : (
                                  <div className="mono mb-0.5" style={{ fontSize: '10px', letterSpacing: '0.1em', color: C.moss }}>{targetLabel(val, ex)}</div>
                                );
                              })()}
                              <div className="flex gap-1">
                                <input value={it.target === 'AMAP' ? '' : it.target} disabled={it.target === 'AMAP'} placeholder={it.target === 'AMAP' ? 'AMAP' : ''} onChange={(e) => updateItem(idx, { target: e.target.value })} className="w-full min-w-0 px-2 py-1 text-sm" style={inputStyle} />
                                <button type="button" onClick={() => updateItem(idx, { target: it.target === 'AMAP' ? '' : 'AMAP' })} title="AMAP — as many as possible"
                                  className="mono px-1.5 flex-shrink-0" style={{ fontSize: '10px', letterSpacing: '0.05em', background: it.target === 'AMAP' ? C.gold : C.bone, color: it.target === 'AMAP' ? C.ink : C.moss, border: `1px solid ${C.charcoal}30` }}>AMAP</button>
                              </div>
                            </div>
                            <div className="col-span-6 md:col-span-2 grid grid-cols-2 gap-1">
                              <div className="col-span-2 mono" style={{ fontSize: '10px', letterSpacing: '0.1em', color: C.moss }}>TEMPO</div>
                              <select value={(it.tempo && it.tempo.type) || 'none'}
                                onChange={(e) => { const type = e.target.value; updateItem(idx, { tempo: { type, seconds: type === 'none' ? 0 : (it.tempo?.seconds || 3) } }); }}
                                className="px-1.5 py-1" style={{ ...inputStyle, fontSize: '11px' }}>
                                <option value="none">— none</option><option value="eccentric">Eccentric</option><option value="isometric">Isometric</option>
                              </select>
                              {it.tempo?.type && it.tempo.type !== 'none' ? (
                                <div className="relative">
                                  <input type="number" min="1" max="60" value={it.tempo.seconds || ''} onChange={(e) => updateItem(idx, { tempo: { ...it.tempo, seconds: Number(e.target.value) || 0 } })} className="w-full px-1.5 py-1 text-sm pr-6" style={inputStyle} placeholder="sec" />
                                  <span className="mono absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ fontSize: '11px', color: C.moss }}>s</span>
                                </div>
                              ) : <div />}
                            </div>
                            <div className="hidden md:block md:col-span-1 text-right">
                              <button onClick={() => removeItem(idx)} className="p-1.5" style={{ background: C.sand }} title="Remove"><X size={11} /></button>
                            </div>

                            <div className="col-span-6 md:col-span-12 pt-2 mt-1" style={{ borderTop: `1px solid ${C.charcoal}10` }}>
                              <div className="flex items-center gap-4 flex-wrap">
                                <button type="button" onClick={() => updateItem(idx, { trackable: it.trackable === false ? true : false })} className="flex items-center gap-2 px-2 py-1"
                                  style={{ background: it.trackable === false ? C.bone : C.ink, border: `1px solid ${it.trackable === false ? C.charcoal + '30' : C.gold}` }}
                                  title={it.trackable === false ? 'Not logged — client just performs it' : 'Logged — client records weight/reps'}>
                                  <div className="w-3 h-3 flex items-center justify-center" style={{ background: it.trackable === false ? C.sand : C.gold }}>
                                    {it.trackable !== false && <Check size={9} style={{ color: C.ink }} strokeWidth={3} />}
                                  </div>
                                  <span className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: it.trackable === false ? C.moss : C.gold }}>{it.trackable === false ? 'NOT LOGGED' : 'LOGGED'}</span>
                                </button>
                                <span className="help" style={{ fontSize: '12px', color: C.moss }}>{it.trackable === false ? '— performed only, no entry' : '— client records weight & reps'}</span>
                                <button type="button" onClick={() => updateItem(idx, { perSide: !it.perSide })} className="flex items-center gap-2 px-2 py-1"
                                  style={{ background: it.perSide ? C.ink : C.bone, border: `1px solid ${it.perSide ? C.gold : C.charcoal + '30'}` }}
                                  title="Reps/target are per side — e.g. 5 each leg on a split squat">
                                  <div className="w-3 h-3 flex items-center justify-center" style={{ background: it.perSide ? C.gold : C.sand }}>
                                    {it.perSide && <Check size={9} style={{ color: C.ink }} strokeWidth={3} />}
                                  </div>
                                  <span className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: it.perSide ? C.gold : C.moss }}>PER SIDE</span>
                                </button>
                                {(it.measure || ex?.measure) === 'reps' && it.trackable !== false && (
                                  <>
                                    <div className="mono" style={{ fontSize: '10px', letterSpacing: '0.1em', color: C.moss }}>·</div>
                                    <label className="mono" style={{ fontSize: '10px', letterSpacing: '0.1em', color: C.moss }}>% 1RM</label>
                                    <div className="relative">
                                      <input type="number" min="0" max="100" value={it.loadPct || ''} onChange={(e) => updateItem(idx, { loadPct: Number(e.target.value) || 0 })} className="px-2 py-1 text-sm pr-6" style={{ ...inputStyle, width: '80px' }} placeholder="0" />
                                      <span className="mono absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ fontSize: '11px', color: C.moss }}>%</span>
                                    </div>
                                  </>
                                )}
                              </div>
                              <input value={it.note || ''} onChange={(e) => updateItem(idx, { note: e.target.value })}
                                placeholder="Note for the client (optional) — a cue, a focus, how it should feel…"
                                className="w-full mt-2 px-2.5 py-1.5 text-sm" style={{ ...inputStyle, fontStyle: 'italic' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 p-3" style={{ background: C.bone, border: `1px solid ${C.charcoal}20` }}>
        <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.goldDeep }}>MOTIVATIONAL MESSAGE · OPTIONAL</div>
        <div className="help mb-2" style={{ fontSize: '14px', color: C.moss }}>— shown to the client at the end of this workout. Leave empty for none.</div>
        <textarea value={form.closingMessage || ''} onChange={(e) => setForm({ ...form, closingMessage: e.target.value })} rows="2" placeholder="e.g. Proud of you. That's how we raise the standard. 💪" className={inputClass} style={inputStyle} />
      </div>

      <div className="mt-4"><Btn full onClick={save}>{editing ? 'UPDATE WORKOUT' : 'CREATE WORKOUT'}</Btn></div>
    </Modal>
  );
}
