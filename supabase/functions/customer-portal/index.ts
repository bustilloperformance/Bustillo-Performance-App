// ============================================================
//  EDGE FUNCTION: customer-portal
//  Opens the Stripe Customer Portal for a member (manage card, cancel sub,
//  see invoices). Caller: staff (any member) or a client (themselves).
// ============================================================
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2025-01-27.acacia', httpClient: Stripe.createFetchHttpClient() });

    const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: u } = await caller.auth.getUser();
    if (!u?.user) return json(401, { error: 'Not authenticated.' });
    const { data: prof } = await caller.from('profiles').select('role, member_id').eq('id', u.user.id).single();
    const isStaff = prof && prof.role !== 'client';

    const { memberId, returnUrl } = await req.json();
    if (!memberId) return json(400, { error: 'memberId is required.' });
    if (!isStaff && prof?.member_id !== memberId) return json(403, { error: 'You can only manage your own billing.' });

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: member } = await admin.from('members').select('stripe_customer_id').eq('id', memberId).single();
    if (!member?.stripe_customer_id) return json(400, { error: 'No billing account yet — subscribe to a plan first.' });

    const session = await stripe.billingPortal.sessions.create({
      customer: member.stripe_customer_id,
      return_url: returnUrl || 'http://localhost:5174',
    });
    return json(200, { url: session.url });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
