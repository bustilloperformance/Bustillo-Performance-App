import { supabase } from '../lib/supabaseClient';

// ============================================================
//  PROGRAMS — write operations.
//  schedule[] is scrubbed to match the mode (in-person keeps `day`,
//  online keeps `dayNumber`). daysPerWeek is a builder-only field.
// ============================================================

function toRow(form) {
  const schedule = (form.schedule || []).filter((s) => (form.mode === 'in-person' ? !!s.day : !!s.dayNumber));
  return {
    name: form.name,
    mode: form.mode || 'in-person',
    duration_weeks: Number(form.durationWeeks) || 1,
    focus: form.focus || '',
    description: form.description || '',
    schedule,
    price: Number(form.price) || 0,
    pricing_type: form.pricingType || 'one-time',
    listed: !!form.listed,
    tagline: form.tagline || '',
    equipment: form.equipment || '',
    for_segment: 'all',
    content: Array.isArray(form.content) ? form.content : [],
  };
}

export async function saveProgram(form, editingId) {
  const row = toRow(form);
  if (editingId) {
    const { error } = await supabase.from('programs').update(row).eq('id', editingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('programs').insert(row);
    if (error) throw error;
  }
}

export async function deleteProgram(id) {
  const { error } = await supabase.from('programs').delete().eq('id', id);
  if (error) throw error;
}
