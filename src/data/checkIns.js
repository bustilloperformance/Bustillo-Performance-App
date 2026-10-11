import { supabase } from '../lib/supabaseClient';

// ============================================================
//  CHECK-INS — one row per member per week, keyed by the Monday of the week
//  being reported on. Upserted so a client can correct an answer before the
//  week rolls over without creating a second row.
// ============================================================
export async function saveCheckIn(memberId, weekStart, answers) {
  const { error } = await supabase
    .from('check_ins')
    .upsert(
      { member_id: memberId, week_start: weekStart, answers, submitted_at: new Date().toISOString() },
      { onConflict: 'member_id,week_start' },
    );
  if (error) throw error;
}

export async function deleteCheckIn(id) {
  const { error } = await supabase.from('check_ins').delete().eq('id', id);
  if (error) throw error;
}
