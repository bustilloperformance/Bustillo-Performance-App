import { supabase } from './supabaseClient';

// ============================================================
//  AUTH HELPERS
//  Thin wrappers over supabase.auth + the public.profiles table.
//  Public signup is intentionally absent (invite-by-owner only).
// ============================================================

// Sign in with email + password. Returns { ok, error }.
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: (email || '').trim().toLowerCase(),
    password,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, session: data.session };
}

export async function signOut() {
  await supabase.auth.signOut();
}

// Change the CURRENTLY signed-in user's password (owner or member — their own).
export async function changeMyPassword(newPassword) {
  if (!newPassword || newPassword.length < 6) throw new Error('Password must be at least 6 characters.');
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

// Fetch the logged-in user's profile row (role, member_id, name).
// Returns null if not signed in or the profile isn't readable.
export async function fetchMyProfile() {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes?.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, role, member_id')
    .eq('id', uid)
    .single();
  if (error) return null;
  // Normalize to camelCase so the app reads profile.memberId consistently.
  return { id: data.id, email: data.email, name: data.name, role: data.role, memberId: data.member_id };
}
