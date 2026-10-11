import { supabase } from '../lib/supabaseClient';
import { todayISO } from '../lib/helpers';
import { cancelSubscription } from './stripe';
import { deleteUser } from './team';

// ============================================================
//  MEMBERS — write operations
// ============================================================

function initials(name) {
  return (name || '?').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

// Create a member profile (no login account — that's the invite flow, 2c).
export async function createMember({ name, email, phone }) {
  const row = {
    name,
    email: (email || '').trim().toLowerCase() || null,
    phone: phone || '',
    photo: initials(name),
    join_date: todayISO(),
    status: 'active',
  };
  const { error } = await supabase.from('members').insert(row);
  if (error) throw error;
}

// Update profile fields edited in MemberProfileForm. `segment` is never edited
// here — it's derived from the active plan.
export async function updateMemberProfile(memberId, form) {
  const row = {
    name: form.name,
    email: (form.email || '').trim().toLowerCase() || null,
    phone: form.phone || '',
    birth_date: form.birthDate || null,
    address: form.address || '',
    photo_url: form.photoUrl || null,
    photo: initials(form.name),
    emergency_contact: form.emergencyContact || { name: '', relation: '', phone: '' },
    notes: form.notes || '',
  };
  const { error } = await supabase.from('members').update(row).eq('id', memberId);
  if (error) throw error;
}

// Attach a member to the adult responsible for them, or detach with null. A
// dependent (a child with no email of their own) can't hold a login, so their
// guardian's login reaches their data instead — see 0019_dependents.sql, where
// RLS and a trigger keep this staff-only.
export async function setGuardian(memberId, guardianId) {
  const { error } = await supabase.from('members').update({ guardian_id: guardianId || null }).eq('id', memberId);
  if (error) throw error;
}

// Create a login account for an existing member (invite-by-owner). Calls the
// `invite-member` edge function, which uses the service_role key server-side.
export async function createMemberLogin(memberId, { email, password, name }) {
  const { data, error } = await supabase.functions.invoke('invite-member', {
    body: { memberId, email, password, name },
  });
  // functions.invoke surfaces non-2xx as an error; try to read the JSON message.
  if (error) {
    let msg = error.message;
    try {
      const ctx = await error.context?.json?.();
      if (ctx?.error) msg = ctx.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// Permanently delete a member. FKs cascade away their memberships, reservations,
// logs, body comp, personal & online programs; payments are preserved (member_id
// set to null) so the books stay correct. Active Stripe subscriptions are
// canceled best-effort first so billing stops; a linked login is removed too.
// Returns a list of non-fatal warnings (e.g. a Stripe cancel that failed).
export async function deleteMember(memberId, loginProfileId) {
  const warnings = [];

  // 1) Stop any live Stripe billing (memberships + online programs).
  const [{ data: mSubs }, { data: pSubs }] = await Promise.all([
    supabase.from('memberships').select('stripe_subscription_id').eq('member_id', memberId).eq('status', 'active'),
    supabase.from('member_programs').select('stripe_subscription_id').eq('member_id', memberId).eq('status', 'active'),
  ]);
  const subIds = [...(mSubs || []), ...(pSubs || [])].map((r) => r.stripe_subscription_id).filter(Boolean);
  for (const subId of subIds) {
    try { await cancelSubscription(subId, memberId); }
    catch (err) { warnings.push(`Stripe subscription ${subId} could not be canceled — cancel it manually in Stripe. (${err.message || err})`); }
  }

  // 2) Remove the login if there is one (cascades the profile row away).
  if (loginProfileId) {
    try { await deleteUser(loginProfileId); }
    catch (err) { warnings.push(`Login could not be removed: ${err.message || err}`); }
  }

  // 3) Delete the member row.
  const { error } = await supabase.from('members').delete().eq('id', memberId);
  if (error) throw error;
  return warnings;
}

export async function adjustCredits(memberId, current, delta) {
  const next = Math.max(0, (current || 0) + delta);
  const { error } = await supabase.from('members').update({ credits: next }).eq('id', memberId);
  if (error) throw error;
}

