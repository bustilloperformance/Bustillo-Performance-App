import { supabase } from '../lib/supabaseClient';

// ============================================================
//  PLANS — write operations
//  Reads come from the store (data.membershipPlans). After a write,
//  the caller refresh()es the store to re-sync.
// ============================================================

// Map the PlansView form → a membership_plans row.
// La app es solo 1-a-1 en linea: ya no hay segmentos, modo presencial, pases de
// dia ni sesiones por semana. Las columnas siguen en la tabla porque hay filas
// viejas que las traen, asi que se escriben con el unico valor que hoy existe.
function formToRow(form) {
  const isCustom = form.recurrence === 'custom';
  return {
    name: form.name,
    segment: '1on1',
    mode: 'online',
    sessions_per_week: 0,
    price: Number(form.price),
    recurrence: form.recurrence,
    // Only a custom plan carries an interval; the fixed cadences are implied by
    // the recurrence itself, and a DB check rejects half-filled custom plans.
    interval_unit: isCustom ? (form.intervalUnit || 'week') : null,
    interval_count: isCustom ? Math.max(1, Number(form.intervalCount) || 1) : null,
    // Null, not 0: 0 cycles would mean a plan that charges nothing.
    billing_cycles: Number(form.billingCycles) > 0 ? Number(form.billingCycles) : null,
    free_trial_days: Number(form.freeTrialDays) || 0,
    min_commitment_months: Number(form.minCommitmentMonths) || 0,
    payment_methods: form.paymentMethods,
    description: form.description || '',
    listed: form.listed === true,
    content: Array.isArray(form.content) ? form.content : [],
  };
}

// Create or update. Pass editingId to update, omit to insert.
export async function savePlan(form, editingId) {
  const row = formToRow(form);
  if (editingId) {
    const { error } = await supabase.from('membership_plans').update(row).eq('id', editingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('membership_plans').insert(row);
    if (error) throw error;
  }
}

export async function deletePlan(id) {
  const { error } = await supabase.from('membership_plans').delete().eq('id', id);
  if (error) throw error;
}
