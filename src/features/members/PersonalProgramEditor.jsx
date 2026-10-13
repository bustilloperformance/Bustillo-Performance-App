import { useMemo, useState, useEffect } from 'react';
import { C } from '../../theme';
import { marcarEdicion, liberarEdicion } from '../../lib/editing';
import { useData } from '../../data/store';
import { useToast, useConfirm } from '../../components/feedback';
import { updatePersonalProgram, newPersonalWorkoutId, clonePersonalWorkout } from '../../data/personalPrograms';
import { saveWorkout } from '../../data/workouts';
import { fmtISO, todayISO } from '../../lib/helpers';
import { Modal, Btn, Field } from '../../components/ui';
import { inputClass, inputStyle } from '../../components/uiStyles';
import SearchSelect from '../../components/SearchSelect';
import WorkoutBuilder from '../../components/workout/WorkoutBuilder';

const DAY_NAME_TO_OFFSET = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

// ============================================================
//  PERSONAL PROGRAM EDITOR — staff modal to build a 1-on-1 member's dated program.
//  Reads via useData(); writes via data/personalPrograms (updatePersonalProgram)
//  to add/duplicate/remove days, import a catalog program onto real dates, copy
//  a day off another 1-on-1 client, promote a day into the global catalog, and
//  edit each day's workout inline (WorkoutBuilder). Shows a completion calendar.
// ============================================================
export default function PersonalProgramEditor({ memberId, onClose }) {
  // Mientras este editor esta abierto no se recarga la pagina (ni por jalar
  // para refrescar ni por actualizacion automatica): se perderia lo capturado.
  useEffect(() => { marcarEdicion('personal-program'); return () => liberarEdicion('personal-program'); }, []);
  const { data, refresh } = useData();
  const showToast = useToast();
  const askConfirm = useConfirm();
  const today = todayISO();

  const pp = data.personalPrograms.find((x) => x.memberId === memberId);
  const member = data.members.find((m) => m.id === memberId);

  const [step, setStep] = useState('list'); // list | add | import | edit
  const [addForm, setAddForm] = useState({ date: '', source: '' });
  const [importForm, setImportForm] = useState({ programId: '', startDate: '' });
  const [editingWorkoutId, setEditingWorkoutId] = useState(null);
  const [viewMonth, setViewMonth] = useState(() => { const [y, m] = today.split('-').map(Number); return { year: y, month: m }; });
  const [popoverDate, setPopoverDate] = useState(null);
  const [clip, setClip] = useState(null); // copied workout snapshot for paste-to-any-date
  const [srcClientId, setSrcClientId] = useState(''); // "copy from another client" picker

  const monthGrid = useMemo(() => {
    const { year, month } = viewMonth;
    const firstDow = new Date(year, month - 1, 1).getDay();
    const offset = firstDow === 0 ? 6 : firstDow - 1;
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells = [];
    for (let i = offset; i > 0; i--) cells.push({ date: fmtISO(new Date(year, month - 1, 1 - i)), inMonth: false });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: fmtISO(new Date(year, month - 1, d)), inMonth: true });
    while (cells.length % 7 !== 0) { const [y, m, dd] = cells[cells.length - 1].date.split('-').map(Number); cells.push({ date: fmtISO(new Date(y, m - 1, dd + 1)), inMonth: false }); }
    return cells;
  }, [viewMonth]);

  if (!pp || !member) return null;

  const updateProgram = async (patch) => {
    try { await updatePersonalProgram(pp.id, patch); await refresh(); }
    catch (err) { showToast(err.message || 'Could not save.'); }
  };

  const addDayWithWorkout = async (date, seed) => {
    const newWorkout = { id: newPersonalWorkoutId(), ...seed };
    await updateProgram({
      workouts: [...pp.workouts, newWorkout],
      schedule: [...pp.schedule.filter((s) => s.date !== date), { date, workoutId: newWorkout.id }],
    });
    return newWorkout.id;
  };

  const deleteDay = (date) => {
    const sched = pp.schedule.find((s) => s.date === date);
    if (!sched) return;
    askConfirm({
      message: `Remove this day (${date})?`,
      detail: 'The workout assigned to this date will be deleted from the personal program. Saved logs stay in history.',
      confirmLabel: 'REMOVE DAY',
      onConfirm: async () => {
        await updateProgram({ schedule: pp.schedule.filter((s) => s.date !== date), workouts: pp.workouts.filter((w) => w.id !== sched.workoutId) });
        showToast('Day removed.');
      },
    });
  };

  // Clipboard: copy a day's workout, then paste it onto ANY chosen date (not just
  // the next free one). Pasting onto a filled date replaces that day's workout.
  const copyDay = (date) => {
    const sched = pp.schedule.find((s) => s.date === date);
    const src = sched && pp.workouts.find((w) => w.id === sched.workoutId);
    if (!src) return;
    setClip({ name: src.name, focus: src.focus, items: src.items.map((it) => ({ ...it })) });
    showToast('Copied — open any date to paste.');
  };
  const pasteToDate = async (date) => {
    if (!clip) return;
    const existing = pp.schedule.find((s) => s.date === date);
    const newWorkout = { id: newPersonalWorkoutId(), name: clip.name, focus: clip.focus, items: clip.items.map((it) => ({ ...it })) };
    await updateProgram({
      workouts: [...pp.workouts.filter((w) => !existing || w.id !== existing.workoutId), newWorkout],
      schedule: [...pp.schedule.filter((s) => s.date !== date), { date, workoutId: newWorkout.id }],
    });
    showToast(`Pasted to ${date}.`);
  };

  const handleAddDay = async () => {
    if (!addForm.date) { showToast('Pick a date.'); return; }
    let seed = null;
    if (addForm.source === 'blank') seed = { name: 'Untitled', focus: '', items: [] };
    else if (addForm.source?.startsWith('catalog:')) { const src = data.workouts.find((w) => w.id === addForm.source.slice(8)); if (src) seed = { name: src.name, focus: src.focus, items: src.items.map((it) => ({ ...it })) }; }
    else if (addForm.source?.startsWith('local:')) { const src = pp.workouts.find((w) => w.id === addForm.source.slice(6)); if (src) seed = { name: src.name, focus: src.focus, items: src.items.map((it) => ({ ...it })) }; }
    // Another client's day. Embedded workout ids are unique across programs, so
    // one lookup across them all finds it. Always a copy — their program is
    // never touched by what happens to this one afterwards.
    else if (addForm.source?.startsWith('client:')) {
      const wid = addForm.source.slice(7);
      const src = data.personalPrograms.flatMap((p) => p.workouts || []).find((w) => w.id === wid);
      if (src) seed = { name: src.name, focus: src.focus, items: (src.items || []).map((it) => ({ ...it })) };
    }
    if (!seed) { showToast('Pick a workout source.'); return; }
    const newId = await addDayWithWorkout(addForm.date, seed);
    setAddForm({ date: '', source: '' });
    setEditingWorkoutId(newId);
    setStep('edit');
    showToast(`Day added · ${addForm.date}.`);
  };

  const handleImportProgram = async () => {
    if (!importForm.programId) { showToast('Pick a program.'); return; }
    if (!importForm.startDate) { showToast('Pick a start date.'); return; }
    const prog = data.programs.find((p) => p.id === importForm.programId);
    if (!prog) { showToast('Program not found.'); return; }
    const [sy, sm, sd] = importForm.startDate.split('-').map(Number);
    const startDt = new Date(sy, sm - 1, sd);
    const cloneCache = {};
    const newWorkouts = [];
    const newSchedule = [];
    (prog.schedule || []).forEach((entry) => {
      const source = data.workouts.find((w) => w.id === entry.workoutId);
      if (!source) return;
      if (!cloneCache[entry.workoutId]) { const cloned = clonePersonalWorkout(source); cloneCache[entry.workoutId] = cloned; newWorkouts.push(cloned); }
      const cloned = cloneCache[entry.workoutId];
      const weekIdx = (entry.week || 1) - 1;
      const dayOffset = entry.dayNumber != null ? (entry.dayNumber - 1) * 2 : (DAY_NAME_TO_OFFSET[entry.day] ?? 0);
      const dt = new Date(startDt); dt.setDate(dt.getDate() + weekIdx * 7 + dayOffset);
      const iso = fmtISO(dt);
      if (!pp.schedule.some((s) => s.date === iso) && !newSchedule.some((s) => s.date === iso)) newSchedule.push({ date: iso, workoutId: cloned.id });
    });
    if (newSchedule.length === 0) { showToast('Nothing to import (program empty or dates conflict).'); return; }
    await updateProgram({ workouts: [...pp.workouts, ...newWorkouts], schedule: [...pp.schedule, ...newSchedule] });
    setImportForm({ programId: '', startDate: '' });
    setStep('list');
    showToast(`Imported ${prog.name} · ${newSchedule.length} day${newSchedule.length === 1 ? '' : 's'} added.`);
  };

  // Promote a day's workout into the GLOBAL catalog, so it can seed other
  // clients, be scheduled into a multi-week program, or be reused as a segment
  // class. A copy — editing either side afterwards leaves the other alone.
  const promoteToCatalog = async (workoutId) => {
    const w = pp.workouts.find((x) => x.id === workoutId);
    if (!w) return;
    try {
      await saveWorkout({ name: w.name, focus: w.focus, items: w.items, shortLabel: w.shortLabel });
      await refresh();
      showToast(`"${w.name}" saved to the catalog.`);
    } catch (err) { showToast(err.message || 'Could not save to the catalog.'); }
  };

  // Clients whose program has something worth copying, and the days of whoever
  // is picked — newest first, since the block you just wrote is what you want.
  const otherClients = data.personalPrograms
    .filter((p) => p.memberId !== memberId && (p.workouts || []).length > 0)
    .map((p) => ({ id: p.memberId, label: data.members.find((m) => m.id === p.memberId)?.name || '— unknown —' }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const srcWorkouts = srcClientId
    ? [...(data.personalPrograms.find((p) => p.memberId === srcClientId)?.workouts || [])].reverse()
    : [];

  const handleBuilderSave = async (cleaned) => {
    await updateProgram({ workouts: pp.workouts.map((x) => (x.id === editingWorkoutId ? { ...x, ...cleaned, id: x.id } : x)) });
    setEditingWorkoutId(null);
    setStep('list');
    showToast('Workout saved.');
  };

  const shiftMonth = (delta) => {
    setViewMonth(({ year, month }) => { let m = month + delta, y = year; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return { year: y, month: m }; });
    setPopoverDate(null);
  };
  const monthName = new Date(viewMonth.year, viewMonth.month - 1, 1).toLocaleString('en-US', { month: 'long' });

  // Completion: did the client log the workout assigned to that day?
  const logs = data.workoutLogs.filter((l) => l.memberId === memberId);
  const isDone = (slot, date) => !!slot && logs.some((l) => l.workoutId === slot.workoutId && l.date === date);
  const completedCount = pp.schedule.filter((s) => isDone(s, s.date)).length;
  const missedCount = pp.schedule.filter((s) => s.date < today && !isDone(s, s.date)).length;

  // ---- Inline workout editor ----
  if (step === 'edit') {
    const editingWorkout = pp.workouts.find((x) => x.id === editingWorkoutId);
    if (!editingWorkout) return <WorkoutBuilder initialWorkout={null} editing={false} onSave={handleBuilderSave} onClose={() => { setEditingWorkoutId(null); setStep('list'); }} title="Edit Personal Workout" eyebrow={`1-ON-1 · ${member.name.toUpperCase()}`} />;
    return (
      <WorkoutBuilder initialWorkout={editingWorkout} editing title="Edit Personal Workout" eyebrow={`1-ON-1 · ${member.name.toUpperCase()}`}
        onSave={handleBuilderSave} onClose={() => { setEditingWorkoutId(null); setStep('list'); }} />
    );
  }

  return (
    <Modal title="Personal Program" eyebrow={`1-ON-1 · ${member.name.toUpperCase()}`} onClose={onClose} size="lg">
      {step === 'add' && (
        <div className="space-y-3">
          <button onClick={() => { setAddForm({ date: '', source: '' }); setStep('list'); }} className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>← BACK TO CALENDAR</button>
          <Field label="DATE"><input type="date" value={addForm.date} onChange={(e) => setAddForm({ ...addForm, date: e.target.value })} className={inputClass} style={inputStyle} /></Field>
          <div>
            <div className="mono mb-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>WORKOUT SOURCE</div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              <SourceButton active={addForm.source === 'blank'} onClick={() => setAddForm({ ...addForm, source: 'blank' })} title="+ Create new workout" sub="BLANK · edit right after" />
              {data.workouts.length > 0 && <div className="mono mt-2 mb-1" style={{ fontSize: '10px', letterSpacing: '0.1em', color: C.moss }}>FROM GLOBAL CATALOG (copies — original untouched)</div>}
              {data.workouts.map((w) => <SourceButton key={w.id} active={addForm.source === `catalog:${w.id}`} onClick={() => setAddForm({ ...addForm, source: `catalog:${w.id}` })} title={w.name} sub={`${(w.focus || '').toUpperCase()} · ${w.items.length} EX`} />)}
              {pp.workouts.length > 0 && <div className="mono mt-2 mb-1" style={{ fontSize: '10px', letterSpacing: '0.1em', color: C.moss }}>COPY FROM THIS PROGRAM</div>}
              {pp.workouts.map((w) => <SourceButton key={w.id} active={addForm.source === `local:${w.id}`} onClick={() => setAddForm({ ...addForm, source: `local:${w.id}` })} title={w.name} sub={`${(w.focus || '').toUpperCase()} · ${w.items.length} EX`} />)}
            </div>
          </div>

          {/* Lift a day straight off another 1-on-1 client — the usual case is
              two athletes on the same block. Picking the client first keeps the
              list short; a long-running program can hold dozens of days. */}
          {otherClients.length > 0 && (
            <div>
              <div className="mono mb-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>OR COPY FROM ANOTHER CLIENT</div>
              <SearchSelect value={srcClientId} onChange={(id) => { setSrcClientId(id); setAddForm({ ...addForm, source: '' }); }}
                options={otherClients} placeholder="Search a 1-on-1 client…" emptyText="No other client has a program yet" />
              {srcClientId && (
                <div className="space-y-1.5 max-h-56 overflow-y-auto mt-2">
                  {srcWorkouts.length === 0 && <div className="p-3 text-center mono" style={{ fontSize: '11px', color: C.moss, border: `1px dashed ${C.charcoal}30` }}>THIS CLIENT HAS NO WORKOUTS YET.</div>}
                  {srcWorkouts.map((w) => (
                    <SourceButton key={w.id} active={addForm.source === `client:${w.id}`} onClick={() => setAddForm({ ...addForm, source: `client:${w.id}` })}
                      title={w.name} sub={`${(w.focus || '').toUpperCase()} · ${(w.items || []).length} EX`} />
                  ))}
                </div>
              )}
              <div className="help mt-1.5" style={{ fontSize: '13px', color: C.goldDeep }}>— copied, not shared. Editing it here never touches their program.</div>
            </div>
          )}
          <Btn full onClick={handleAddDay}>ADD DAY</Btn>
        </div>
      )}

      {step === 'import' && (
        <div className="space-y-3">
          <button onClick={() => { setImportForm({ programId: '', startDate: '' }); setStep('list'); }} className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>← BACK TO CALENDAR</button>
          <div className="help text-center" style={{ fontSize: '14px', color: C.goldDeep }}>— a catalog program copied into {member.name.split(' ')[0]}'s calendar as real dates. workouts are cloned — editing here won't touch the originals.</div>
          <Field label="START DATE (DAY 1 OF WEEK 1)"><input type="date" value={importForm.startDate} onChange={(e) => setImportForm({ ...importForm, startDate: e.target.value })} className={inputClass} style={inputStyle} /></Field>
          <div>
            <div className="mono mb-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>PROGRAM</div>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {data.programs.length === 0 && <div className="p-4 text-center mono" style={{ fontSize: '11px', color: C.moss, border: `1px dashed ${C.charcoal}30` }}>NO PROGRAMS IN YOUR CATALOG YET.</div>}
              {data.programs.map((p) => <SourceButton key={p.id} active={importForm.programId === p.id} onClick={() => setImportForm({ ...importForm, programId: p.id })} title={p.name} sub={`${(p.mode || '').toUpperCase()} · ${p.durationWeeks}WK · ${(p.schedule || []).length} DAYS`} />)}
            </div>
          </div>
          <Btn full onClick={handleImportProgram}>IMPORT PROGRAM</Btn>
        </div>
      )}

      {step === 'list' && (
        <div className="space-y-3" key={pp.id}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="PROGRAM NAME"><input defaultValue={pp.name} onBlur={(e) => e.target.value !== pp.name && updateProgram({ name: e.target.value })} className={inputClass} style={inputStyle} /></Field>
            <Field label="START DATE"><input type="date" defaultValue={pp.startDate} onBlur={(e) => e.target.value !== pp.startDate && updateProgram({ startDate: e.target.value })} className={inputClass} style={inputStyle} /></Field>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="mono flex items-center gap-2 flex-wrap" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
              <span>{pp.schedule.length} DAY{pp.schedule.length === 1 ? '' : 'S'}</span>
              <span style={{ color: C.gold, fontWeight: 600 }}>✓ {completedCount} DONE</span>
              {missedCount > 0 && <span style={{ color: C.goldDeep, fontWeight: 600 }}>✕ {missedCount} MISSED</span>}
              {clip && (
                <span className="flex items-center gap-1 px-2 py-0.5" style={{ background: C.cream }}>
                  <span style={{ color: C.sand }}>⧉ COPIED</span>
                  <span className="prog-name" style={{ fontSize: '12px', color: C.gold }}>{clip.name}</span>
                  <button onClick={() => setClip(null)} className="ml-0.5" style={{ fontSize: '12px', color: C.sand }}>×</button>
                </span>
              )}
            </div>
            <button onClick={() => { setImportForm({ programId: '', startDate: pp.startDate || today }); setStep('import'); }} className="mono px-3 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.forest, color: C.ink }}>⇣ IMPORT PROGRAM</button>
          </div>

          <div className="flex items-center justify-between p-3" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
            <button onClick={() => shiftMonth(-1)} className="mono px-3 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.bone, color: C.ink, border: `1px solid ${C.charcoal}20` }}>← PREV</button>
            <div className="text-center"><div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>MONTH</div><div className="ui-strong" style={{ fontSize: '22px', lineHeight: 1 }}>{monthName} {viewMonth.year}</div></div>
            <button onClick={() => shiftMonth(1)} className="mono px-3 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.bone, color: C.ink, border: `1px solid ${C.charcoal}20` }}>NEXT →</button>
          </div>

          {/* Un mes en 7 columnas no cabe en un teléfono: a 375px cada celda
              quedaria en 41px y el nombre de la rutina se romperia letra por
              letra. Se desliza en horizontal con un ancho minimo, para que la
              semana siga leyendose como una semana. */}
          <div className="overflow-x-auto">
           <div style={{ minWidth: 620 }}>
            <div className="grid gap-px mb-px" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', background: C.charcoal + '15' }}>
              {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d) => <div key={d} className="mono px-2 py-2 text-center" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss, background: C.cream }}>{d}</div>)}
            </div>
            <div className="grid gap-px" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', background: C.charcoal + '15' }}>
              {monthGrid.map(({ date, inMonth }) => {
                const slot = pp.schedule.find((s) => s.date === date);
                const w = slot ? pp.workouts.find((x) => x.id === slot.workoutId) : null;
                const isToday = date === today;
                const isOpen = popoverDate === date;
                const done = isDone(slot, date);
                const missed = slot && !done && date < today;
                return (
                  <div key={date} className="relative" style={{ background: !inMonth ? C.bone + '80' : (done ? C.forest : C.cream), color: C.ink, minHeight: '80px', outline: isToday ? `2px solid ${C.gold}` : 'none', outlineOffset: '-2px', opacity: inMonth ? 1 : 0.45 }}>
                    <button onClick={() => inMonth && setPopoverDate(isOpen ? null : date)} disabled={!inMonth} className="w-full h-full text-left p-2" style={{ cursor: inMonth ? 'pointer' : 'default' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="mono" style={{ fontSize: isToday ? '14px' : '11px', letterSpacing: '0.1em', color: isToday ? C.gold : (inMonth ? C.ink : C.moss), fontWeight: isToday ? 700 : 500 }}>{Number(date.split('-')[2])}</span>
                        {done ? <span className="mono" style={{ fontSize: '12px', color: C.gold, fontWeight: 700 }}>✓</span>
                          : missed ? <span className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.gold, fontWeight: 700 }}>MISSED</span>
                          : isToday ? <span className="mono" style={{ fontSize: '10px', letterSpacing: '0.1em', color: C.gold }}>NOW</span> : null}
                      </div>
                      {w ? (
                        <div>
                          <div className="prog-name" style={{ fontSize: '11px', lineHeight: 1.15, color: isToday ? C.gold : done ? C.bone : C.ink }}>{w.name}</div>
                          {w.focus && <div className="mono mt-0.5" style={{ fontSize: '10px', letterSpacing: '0.1em', color: (isToday || done) ? C.sand : C.moss }}>{w.focus.toUpperCase()}</div>}
                        </div>
                      ) : inMonth && <div className="help" style={{ fontSize: '12px', color: isToday ? C.sand : C.moss + '80' }}>—</div>}
                    </button>
                    {isOpen && (
                      <div className="absolute z-30 top-full left-0 mt-1 p-2 w-56" style={{ background: C.cream, border: `1px solid ${C.charcoal}40`, boxShadow: '0 8px 16px rgba(0,0,0,0.25)' }}>
                        <div className="mono mb-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>{date}</div>
                        {slot ? (
                          <>
                            <div className="prog-name mb-1" style={{ fontSize: '14px', color: C.ink, lineHeight: 1.2 }}>{w?.name || '—'}</div>
                            <div className="mono mb-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: done ? C.forest : missed ? C.gold : C.moss, fontWeight: 600 }}>{done ? '✓ COMPLETED BY CLIENT' : missed ? '✕ NOT DONE (PAST)' : '· NOT LOGGED YET'}</div>
                            <div className="space-y-1">
                              <button onClick={() => { setEditingWorkoutId(slot.workoutId); setStep('edit'); setPopoverDate(null); }} className="w-full mono px-2 py-1.5 text-left" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.cream, color: C.gold }}>✎ EDIT WORKOUT</button>
                              <button onClick={() => { copyDay(date); setPopoverDate(null); }} className="w-full mono px-2 py-1.5 text-left" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.forest, color: C.ink }}>⧉ COPY</button>
                              <button onClick={() => { promoteToCatalog(slot.workoutId); setPopoverDate(null); }} className="w-full mono px-2 py-1.5 text-left" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.navy, color: C.ink }}>↥ SAVE TO CATALOG</button>
                              {clip && <button onClick={() => { pasteToDate(date); setPopoverDate(null); }} className="w-full mono px-2 py-1.5 text-left" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.gold, color: C.bone }}>⤵ PASTE HERE (replace)</button>}
                              <button onClick={() => { deleteDay(date); setPopoverDate(null); }} className="w-full mono px-2 py-1.5 text-left" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.sand, color: C.bone }}>✕ REMOVE DAY</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="help mb-2" style={{ fontSize: '13px', color: C.moss }}>— no workout assigned.</div>
                            {clip && <button onClick={() => { pasteToDate(date); setPopoverDate(null); }} className="w-full mono px-2 py-1.5 mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.gold, color: C.bone }}>⤵ PASTE HERE</button>}
                            <button onClick={() => { setAddForm({ date, source: '' }); setStep('add'); setPopoverDate(null); }} className="w-full mono px-2 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.cream, color: C.gold }}>+ ASSIGN WORKOUT</button>
                          </>
                        )}
                        <button onClick={() => setPopoverDate(null)} className="w-full mono mt-2 py-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>CLOSE</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
           </div>
          </div>
          {pp.schedule.length === 0 && <div className="help text-center mt-3" style={{ fontSize: '14px', color: C.moss }}>— tap any day to assign a workout, or import a program from your catalog.</div>}
        </div>
      )}
    </Modal>
  );
}

function SourceButton({ active, onClick, title, sub }) {
  return (
    <button onClick={onClick} className="w-full text-left p-2.5" style={{ background: active ? C.gold : C.bone, color: active ? C.bone : C.moss, border: `1px solid ${active ? C.gold : C.charcoal + '20'}` }}>
      <div className="ui-strong" style={{ fontSize: '16px' }}>{title}</div>
      <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', opacity: 0.7 }}>{sub}</div>
    </button>
  );
}
