import { supabase } from '../lib/supabaseClient';

// ============================================================
//  TEAM & ROLES — owner-only account management.
//  Role changes are a direct profiles update (owner RLS). Creating/removing
//  login accounts goes through the invite-member edge function (service_role).
// ============================================================

async function invokeAdmin(body) {
  const { data, error } = await supabase.functions.invoke('invite-member', { body });
  if (error) {
    let msg = error.message;
    try { const ctx = await error.context?.json?.(); if (ctx?.error) msg = ctx.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function changeRole(profileId, role) {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', profileId);
  if (error) throw error;
}

export async function createStaff({ email, password, name, role = 'coach' }) {
  return invokeAdmin({ action: 'create', role, email, password, name });
}

export async function deleteUser(userId) {
  return invokeAdmin({ action: 'delete', userId });
}

// Owner resets a login's password (admin — for any user).
export async function adminSetPassword(userId, password) {
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');
  return invokeAdmin({ action: 'set-password', userId, password });
}
