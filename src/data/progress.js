import { supabase } from '../lib/supabaseClient';
import { todayISO } from '../lib/helpers';

// ============================================================
//  PROGRESS — goals (jsonb on members) + body composition rows.
// ============================================================
function newGoalId() {
  return 'g-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

export async function addGoal(memberId, goalForm, currentGoals) {
  const goal = {
    id: newGoalId(),
    metric: goalForm.metric,
    target: Number(goalForm.target) || goalForm.target,
    unit: goalForm.unit,
    deadline: goalForm.deadline || null,
  };
  const { error } = await supabase.from('members').update({ goals: [...(currentGoals || []), goal] }).eq('id', memberId);
  if (error) throw error;
}

// Edit a goal in place. Its id and completion state are preserved — renaming a
// goal to match a library exercise is how an untracked one starts tracking.
export async function updateGoal(memberId, goalId, form, currentGoals) {
  const goals = (currentGoals || []).map((g) => (g.id === goalId ? {
    ...g,
    metric: form.metric,
    target: Number(form.target) || form.target,
    unit: form.unit,
    deadline: form.deadline || null,
  } : g));
  const { error } = await supabase.from('members').update({ goals }).eq('id', memberId);
  if (error) throw error;
}

// Mark a goal hit, or reopen it. Completed goals stay on the member — the
// archive is what they've already achieved, so nothing is deleted here.
export async function setGoalCompleted(memberId, goalId, currentGoals, done) {
  const goals = (currentGoals || []).map((g) =>
    (g.id === goalId ? { ...g, completedOn: done ? todayISO() : null } : g));
  const { error } = await supabase.from('members').update({ goals }).eq('id', memberId);
  if (error) throw error;
}

export async function removeGoal(memberId, goalId, currentGoals) {
  const { error } = await supabase.from('members').update({ goals: (currentGoals || []).filter((g) => g.id !== goalId) }).eq('id', memberId);
  if (error) throw error;
}

export async function addBodyComp({ memberId, date, weight, bodyFat, muscleMass, notes }) {
  const { error } = await supabase.from('body_comp').insert({
    member_id: memberId,
    date,
    weight: weight !== '' && weight != null ? Number(weight) : null,
    body_fat: bodyFat !== '' && bodyFat != null ? Number(bodyFat) : null,
    muscle_mass: muscleMass !== '' && muscleMass != null ? Number(muscleMass) : null,
    notes: notes || '',
  });
  if (error) throw error;
}

export async function deleteBodyComp(id) {
  const { error } = await supabase.from('body_comp').delete().eq('id', id);
  if (error) throw error;
}
