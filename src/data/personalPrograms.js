import { supabase } from '../lib/supabaseClient';

// ============================================================
//  PERSONAL PROGRAMS (1-on-1) — write operations.
//  One row per member. workouts[] + schedule[] are JSONB and mutated as
//  whole arrays by the editor.
// ============================================================

// New local id for an embedded workout (not a DB id — lives inside the jsonb).
export function newPersonalWorkoutId() {
  return 'pw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

// Deep-ish clone a source workout (catalog or other) into a fresh embedded one.
export function clonePersonalWorkout(srcWorkout) {
  return {
    id: newPersonalWorkoutId(),
    name: srcWorkout.name,
    focus: srcWorkout.focus,
    shortLabel: srcWorkout.shortLabel || '',
    items: (srcWorkout.items || []).map((it) => ({ ...it })),
  };
}

// Get the member's personal program id, creating an empty one if needed.
export async function ensurePersonalProgram(memberId) {
  const { data: existing, error: selErr } = await supabase
    .from('personal_programs')
    .select('id')
    .eq('member_id', memberId)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing.id;
  const { data, error } = await supabase
    .from('personal_programs')
    .insert({ member_id: memberId, name: '', workouts: [], schedule: [] })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function updatePersonalProgram(id, patch) {
  const row = {};
  if ('name' in patch) row.name = patch.name;
  if ('startDate' in patch) row.start_date = patch.startDate || null;
  if ('workouts' in patch) row.workouts = patch.workouts;
  if ('schedule' in patch) row.schedule = patch.schedule;
  const { error } = await supabase.from('personal_programs').update(row).eq('id', id);
  if (error) throw error;
}
