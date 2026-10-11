import { useState } from 'react';
import { Plus, Copy, Edit2, Trash2 } from 'lucide-react';
import { C } from '../../theme';
import { unitLabel } from '../../lib/helpers';
import { useData } from '../../data/store';
import { useToast, useConfirm } from '../../components/feedback';
import { saveWorkout, duplicateWorkout, deleteWorkout } from '../../data/workouts';
import { groupWorkoutItems, formatTempo } from '../../lib/workoutHelpers';
import { PageHeader, Btn } from '../../components/ui';
import WorkoutBuilder from '../../components/workout/WorkoutBuilder';

// ============================================================
//  WORKOUTS VIEW — staff workout library (browse, build, manage sessions).
//  Reads data.workouts/exercises via useData(); creates/edits (via WorkoutBuilder),
//  duplicates and deletes workouts through data/workouts.
// ============================================================
export default function WorkoutsView() {
  const { data, refresh } = useData();
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [showBuilder, setShowBuilder] = useState(false);
  const [editing, setEditing] = useState(null);

  const openNew = () => { setEditing(null); setShowBuilder(true); };
  const openEdit = (w) => { setEditing(w); setShowBuilder(true); };

  const onSave = async (workout) => {
    try {
      await saveWorkout(workout, editing?.id);
      await refresh();
      setShowBuilder(false);
      showToast(editing ? 'Workout updated.' : 'Workout built.');
    } catch (err) {
      showToast(err.message || 'Could not save the workout.');
    }
  };

  const duplicate = async (w) => {
    try { await duplicateWorkout(w); await refresh(); showToast('Workout duplicated.'); }
    catch (err) { showToast(err.message || 'Could not duplicate.'); }
  };

  const remove = (id) => {
    const w = data.workouts.find((x) => x.id === id);
    askConfirm({
      message: 'Delete this workout?',
      detail: w ? `"${w.name}" will be removed from your workout library.` : '',
      confirmLabel: 'DELETE WORKOUT',
      onConfirm: async () => {
        try { await deleteWorkout(id); await refresh(); showToast('Workout removed.'); }
        catch (err) { showToast(err.message || 'Could not delete.'); }
      },
    });
  };

  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="06" section="METHOD · SESSIONS" title="Workouts." subtitle="— measured, repeated, built."
        action={<Btn icon={Plus} onClick={openNew}>BUILD WORKOUT</Btn>} />

      {data.workouts.length === 0 ? (
        <div className="text-center py-16" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
          <div className="serif-italic" style={{ fontSize: '28px', color: C.ink }}>No workouts yet.</div>
          <div className="help mt-2 mb-5" style={{ fontSize: '18px', color: C.goldDeep }}>— build your first session by sections and circuits.</div>
          <div className="flex justify-center"><Btn icon={Plus} onClick={openNew}>BUILD WORKOUT</Btn></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.workouts.map((w) => {
            const wGrouped = groupWorkoutItems(w.items || []);
            return (
              <div key={w.id} className="p-6 group relative" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={() => duplicate(w)} className="p-1.5" style={{ background: C.bone }}><Copy size={11} /></button>
                  <button onClick={() => openEdit(w)} className="p-1.5" style={{ background: C.bone }}><Edit2 size={11} /></button>
                  <button onClick={() => remove(w.id)} className="p-1.5" style={{ background: C.gold }}><Trash2 size={11} /></button>
                </div>
                <div className="mono mb-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.goldDeep }}>
                  — {(w.difficulty || '').toUpperCase()}{w.focus ? ` · ${w.focus.toUpperCase()}` : ''}
                </div>
                <div className="prog-name mb-2" style={{ fontSize: '28px' }}>{w.name}</div>
                <div className="mono mb-3" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
                  {(w.items || []).length} EXERCISES · {wGrouped.length} SECTION{wGrouped.length === 1 ? '' : 'S'}
                </div>
                <div className="space-y-2 pt-3" style={{ borderTop: `1px solid ${C.charcoal}20` }}>
                  {wGrouped.slice(0, 3).map((g) => (
                    <div key={g.section}>
                      <div className="mono mb-1" style={{ fontSize: '10px', letterSpacing: '0.1em', color: C.goldDeep }}>{g.section.toUpperCase()}</div>
                      {g.circuits.map((c) => (
                        <div key={c.letter} className="text-xs mb-0.5">
                          {g.section !== 'Prep Work' && <span className="mono mr-1.5" style={{ fontSize: '11px', color: C.moss, letterSpacing: '0.1em' }}>{c.letter}</span>}
                          {c.items.map((it, ii) => {
                            if (it._isText) return <div key={ii} className="help" style={{ fontSize: '12px', color: C.moss, fontStyle: 'italic' }}>· {it.text}</div>;
                            const ex = data.exercises.find((e) => e.id === it.exerciseId);
                            const hasLadder = ex && (ex.regressionId || ex.progressionId);
                            const tempoStr = formatTempo(it.tempo);
                            return (
                              <span key={ii}>
                                {ii > 0 && <span style={{ color: C.moss }}> + </span>}
                                {ex?.name || '?'}
                                {hasLadder && <span title="Has progression/regression" style={{ color: C.goldDeep, fontSize: '11px', marginLeft: '3px' }}>⇅</span>}{' '}
                                <span className="mono" style={{ color: C.moss, fontSize: '11px' }}>{it.section === 'HIIT' ? `${it.rounds ?? 1}rds·${it.workSec ?? 0}/${it.restSec ?? 0}s` : `${it.sets}×${it.target}${(() => { const m = it.measure || ex?.measure; const u = m && m !== 'reps' ? (ex?.units?.[m] || ex?.unit) : null; return u ? unitLabel(u) : ''; })()}${it.perSide ? '/side' : ''}`}</span>
                                {tempoStr && <span className="mono" style={{ color: C.gold, fontSize: '11px', marginLeft: '4px' }} title="Tempo">@ {tempoStr}</span>}
                                {it.loadPct > 0 && <span className="mono" style={{ color: C.goldDeep, fontSize: '11px', marginLeft: '4px' }} title="Load % of 1RM">{it.loadPct}%</span>}
                              </span>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ))}
                  {wGrouped.length > 3 && <div className="mono" style={{ fontSize: '11px', color: C.moss }}>+ {wGrouped.length - 3} MORE SECTIONS</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showBuilder && (
        <WorkoutBuilder
          initialWorkout={editing}
          editing={!!editing}
          onSave={onSave}
          onClose={() => setShowBuilder(false)}
        />
      )}
    </div>
  );
}
