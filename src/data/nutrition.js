import { supabase } from '../lib/supabaseClient';

// ============================================================
//  NUTRITION PLANS — one PDF per member, stored in the private `nutrition`
//  Storage bucket under {memberId}/. The DB row keeps the storage path + metadata.
//  Fetched on demand (NOT in the global data load). RLS: staff read/write; a
//  client reads only their own folder. Viewing uses a short-lived signed URL.
// ============================================================
const BUCKET = 'nutrition';

export async function getNutrition(memberId) {
  const { data, error } = await supabase
    .from('nutrition_plans')
    .select('member_id, pages, file_name, updated_at')
    .eq('member_id', memberId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Signed URLs (1 h) for a plan's storage paths, ready to drop into src/href.
export async function nutritionPageUrls(paths) {
  if (!paths || !paths.length) return [];
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) throw error;
  return data.map((d) => d.signedUrl);
}

// Upload the plan PDF, replacing any prior one for this member.
export async function saveNutrition(memberId, file) {
  // Clear old files first (old renders, previous PDF) so nothing lingers.
  const { data: existing } = await supabase.storage.from(BUCKET).list(memberId);
  if (existing?.length) await supabase.storage.from(BUCKET).remove(existing.map((f) => `${memberId}/${f.name}`));

  const path = `${memberId}/plan.pdf`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: 'application/pdf' });
  if (upErr) throw upErr;

  const row = { member_id: memberId, pages: [path], file_name: file.name || null, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('nutrition_plans').upsert(row, { onConflict: 'member_id' });
  if (error) throw error;
  await supabase.from('members').update({ has_nutrition: true }).eq('id', memberId);
}

export async function deleteNutrition(memberId) {
  const { data: existing } = await supabase.storage.from(BUCKET).list(memberId);
  if (existing?.length) await supabase.storage.from(BUCKET).remove(existing.map((f) => `${memberId}/${f.name}`));
  const { error } = await supabase.from('nutrition_plans').delete().eq('member_id', memberId);
  if (error) throw error;
  await supabase.from('members').update({ has_nutrition: false }).eq('id', memberId);
}
