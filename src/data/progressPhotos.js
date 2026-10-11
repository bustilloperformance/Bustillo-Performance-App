import { supabase } from '../lib/supabaseClient';
import { downscaleImage } from '../lib/downscaleImage';

// ============================================================
//  PROGRESS PHOTOS — a member's before/after timeline. Each session is a date
//  with up to three poses (front / side / back), one row per photo. Files live
//  in the private `progress-photos` bucket under {memberId}/; the DB row keeps
//  path + date + pose. RLS: staff read/write all; a client reads/writes only
//  their own. Body photos are sensitive, so viewing uses short-lived signed URLs.
// ============================================================
const BUCKET = 'progress-photos';
export const POSES = ['front', 'side', 'back'];

// Newest first — the flat row list (no image bytes).
export async function listProgressPhotos(memberId) {
  const { data, error } = await supabase
    .from('progress_photos')
    .select('id, member_id, path, taken_on, pose, note, created_at')
    .eq('member_id', memberId)
    .order('taken_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Signed URLs (1 h) keyed by path, ready to drop into <img src>.
export async function signPhotoUrls(paths) {
  if (!paths || !paths.length) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) throw error;
  const map = {};
  data.forEach((d, i) => { if (d.signedUrl) map[paths[i]] = d.signedUrl; });
  return map;
}

// Upload a dated session: poseFiles = { front: File, side: File, back: File }.
export async function addProgressSession(memberId, takenOn, poseFiles) {
  const rows = [];
  for (const pose of POSES) {
    const file = poseFiles[pose];
    if (!file) continue;
    const blob = await downscaleImage(file);
    const path = `${memberId}/${takenOn}-${pose}-${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (upErr) throw upErr;
    rows.push({ member_id: memberId, path, taken_on: takenOn, pose });
  }
  if (!rows.length) return;
  const { error } = await supabase.from('progress_photos').insert(rows);
  if (error) throw error;
}

// Delete a whole session (all its pose rows + files).
export async function deleteProgressSession(rows) {
  const paths = rows.map((r) => r.path);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  const ids = rows.map((r) => r.id);
  const { error } = await supabase.from('progress_photos').delete().in('id', ids);
  if (error) throw error;
}
