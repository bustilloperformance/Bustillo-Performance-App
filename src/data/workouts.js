import { supabase } from '../lib/supabaseClient';

// ============================================================
//  WORKOUTS — write operations. `items` is the cleaned/sorted array
//  the WorkoutBuilder produces; stored as JSONB.
// ============================================================

function toRow(w) {
  return {
    name: w.name,
    focus: w.focus || '',
    difficulty: w.difficulty || 'Beginner',
    items: w.items || [],
    closing_message: w.closingMessage || null,
    // Vacia a proposito cuando el coach no la escribe: el calendario entonces
    // deduce la etiqueta del nombre, en vez de quedarse en blanco.
    short_label: w.shortLabel?.trim() || null,
  };
}

// Returns the workout id (useful when assigning a freshly-built workout, e.g.
// from the segment calendar).
export async function saveWorkout(workout, editingId) {
  const row = toRow(workout);
  if (editingId) {
    const { error } = await supabase.from('workouts').update(row).eq('id', editingId);
    if (error) throw error;
    return editingId;
  }
  const { data, error } = await supabase.from('workouts').insert(row).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function duplicateWorkout(workout) {
  const { error } = await supabase.from('workouts').insert(toRow({ ...workout, name: `${workout.name} (copy)` }));
  if (error) throw error;
}

export async function deleteWorkout(id) {
  const { error } = await supabase.from('workouts').delete().eq('id', id);
  if (error) throw error;
}
