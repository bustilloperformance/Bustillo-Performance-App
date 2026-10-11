import { supabase } from '../lib/supabaseClient';

// ============================================================
//  WORKOUT LOGS — write operations.
//  Matches the prototype: program logs are keyed by (member, workout, week, day);
//  ad-hoc logs by (member, workout, date). First-time logs award the member +10 pts.
// ============================================================
export async function saveWorkoutLog(entry, memberPoints) {
  const isProgram = entry.programWeek != null && entry.programDayNumber != null;

  let q = supabase.from('workout_logs').select('id').eq('member_id', entry.memberId).eq('workout_id', entry.workoutId);
  q = isProgram
    ? q.eq('program_week', entry.programWeek).eq('program_day_number', entry.programDayNumber)
    : q.eq('date', entry.date);
  const { data: found, error: selErr } = await q.limit(1);
  if (selErr) throw selErr;
  const existing = found && found[0];

  const row = {
    member_id: entry.memberId,
    workout_id: entry.workoutId,
    date: entry.date,
    readiness: entry.readiness,
    exercise_notes: entry.exerciseNotes || {},
    sets: entry.sets || [],
    program_week: entry.programWeek ?? null,
    program_day_number: entry.programDayNumber ?? null,
  };

  if (existing) {
    const { error } = await supabase.from('workout_logs').update(row).eq('id', existing.id);
    if (error) throw error;
    return { isNew: false };
  }

  const { error } = await supabase.from('workout_logs').insert(row);
  if (error) throw error;
  // Award points on first log only.
  await supabase.from('members').update({ points: (memberPoints || 0) + 10 }).eq('id', entry.memberId);
  return { isNew: true };
}

// Delete a whole logged session.
export async function deleteWorkoutLog(id) {
  const { error } = await supabase.from('workout_logs').delete().eq('id', id);
  if (error) throw error;
}

// Remove just one exercise's sets from a log (e.g. a wrong entry). If that was
// the only exercise in the session, delete the whole log.
export async function removeExerciseFromLog(log, exerciseId) {
  const sets = (log.sets || []).filter((s) => s.exerciseId !== exerciseId);
  if (sets.length === 0) return deleteWorkoutLog(log.id);
  const notes = { ...(log.exerciseNotes || {}) };
  delete notes[exerciseId];
  const { error } = await supabase.from('workout_logs').update({ sets, exercise_notes: notes }).eq('id', log.id);
  if (error) throw error;
}
