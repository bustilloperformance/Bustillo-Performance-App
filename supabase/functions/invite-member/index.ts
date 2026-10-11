// ============================================================
//  EDGE FUNCTION: invite-member  (admin user management)
//  Actions (service_role, server-side only):
//   · create (default): make a login account with a role (client|coach) and,
//     for clients, link it to an existing member. Caller must be owner/coach
//     (coach creation requires owner).
//   · delete: remove a login account (owner only). The member profile stays;
//     the profiles row cascades away with the auth user.
//
//  SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected.
// ============================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    // 1) Identify the caller + their role.
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData?.user) return json(401, { error: 'Not authenticated.' });
    const callerId = userData.user.id;
    const { data: prof } = await caller.from('profiles').select('role').eq('id', callerId).single();
    const callerRole = prof?.role;
    if (callerRole !== 'owner' && callerRole !== 'coach') return json(403, { error: 'Staff only.' });

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json();
    const action = body.action ?? 'create';

    if (action === 'delete') {
      if (callerRole !== 'owner') return json(403, { error: 'Only the owner can remove accounts.' });
      const userId = body.userId;
      if (!userId) return json(400, { error: 'userId is required.' });
      if (userId === callerId) return json(400, { error: "You can't remove your own account." });
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true });
    }

    if (action === 'set-password') {
      if (callerRole !== 'owner') return json(403, { error: 'Only the owner can reset passwords.' });
      const { userId, password } = body;
      if (!userId || !password) return json(400, { error: 'userId and password are required.' });
      if (String(password).length < 6) return json(400, { error: 'Password must be at least 6 characters.' });
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true });
    }

    // ---- create ----
    const role = body.role ?? 'client';
    if (role !== 'client' && role !== 'coach') return json(400, { error: 'Role must be client or coach.' });
    if (role === 'coach' && callerRole !== 'owner') return json(403, { error: 'Only the owner can add coaches.' });

    const cleanEmail = (body.email ?? '').trim().toLowerCase();
    const { memberId, password, name } = body;
    if (!cleanEmail || !password) return json(400, { error: 'email and password are required.' });
    if (role === 'client' && !memberId) return json(400, { error: 'memberId is required for a client login.' });

    if (memberId) {
      const { data: existing } = await admin.from('profiles').select('id').eq('member_id', memberId).maybeSingle();
      if (existing) return json(409, { error: 'This member already has a login account.' });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { name: name ?? '', role },
    });
    if (createErr || !created?.user) return json(400, { error: createErr?.message ?? 'Could not create the account.' });

    // The trigger created a profile with role+name from metadata. Link the member for clients.
    if (memberId) {
      const { error: linkErr } = await admin.from('profiles').update({ member_id: memberId }).eq('id', created.user.id);
      if (linkErr) return json(400, { error: linkErr.message });
      await admin.from('members').update({ email: cleanEmail }).eq('id', memberId).is('email', null);
    }

    return json(200, { ok: true, userId: created.user.id });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
