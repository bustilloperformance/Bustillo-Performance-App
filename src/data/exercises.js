import { supabase } from '../lib/supabaseClient';

// ============================================================
//  EXERCISES — write operations, including regression/progression
//  inverse-link sync (mirrors the prototype's ladder logic).
// ============================================================

function formToRow(form) {
  const measures = form.measures && form.measures.length ? form.measures : [form.measure || 'reps'];
  // Keep only units for measures the exercise actually uses.
  const units = {};
  for (const m of measures) if (m !== 'reps' && form.units?.[m]) units[m] = form.units[m];
  return {
    name: form.name,
    category: form.category || '',
    sections: form.sections && form.sections.length ? form.sections : ['Strength'],
    measures,
    measure: measures[0], // primary — used for filters/display/default
    log_metrics: (form.logMetrics && form.logMetrics.length) ? form.logMetrics : null,
    graph_metric: form.graphMetric || null,
    units,
    unit: units[measures[0]] || null, // legacy: primary measure's unit
    is_test: !!form.isTest,
    video_url: form.videoUrl || null,
    equipment: form.equipment || null,
    regression_id: form.regressionId || null,
    progression_id: form.progressionId || null,
    one_rm_source_id: form.oneRmSourceId || null,
    time_lower_is_better: form.timeLowerIsBetter !== false,
    tracks_pr: form.tracksPR !== false,
  };
}

// Create or update an exercise, then keep the movement ladder consistent:
// the target of a progression/regression gets the inverse link, and stale
// inverse links are cleared.
export async function saveExercise(form, editing) {
  const row = formToRow(form);
  let id = editing?.id;
  if (editing) {
    const { error } = await supabase.from('exercises').update(row).eq('id', id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('exercises').insert(row).select('id').single();
    if (error) throw error;
    id = data.id;
  }

  const prevProg = editing?.progressionId || '';
  const prevReg = editing?.regressionId || '';
  const newProg = form.progressionId || '';
  const newReg = form.regressionId || '';

  // Clear stale inverse links on old targets.
  if (prevProg && prevProg !== newProg) {
    await supabase.from('exercises').update({ regression_id: null }).eq('id', prevProg).eq('regression_id', id);
  }
  if (prevReg && prevReg !== newReg) {
    await supabase.from('exercises').update({ progression_id: null }).eq('id', prevReg).eq('progression_id', id);
  }
  // Set inverse links on new targets.
  if (newProg && newProg !== id) {
    await supabase.from('exercises').update({ regression_id: id }).eq('id', newProg);
  }
  if (newReg && newReg !== id) {
    await supabase.from('exercises').update({ progression_id: id }).eq('id', newReg);
  }

  return id;
}

export async function deleteExercise(id) {
  const { error } = await supabase.from('exercises').delete().eq('id', id);
  if (error) throw error;
}
