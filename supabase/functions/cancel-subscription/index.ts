// ============================================================
//  EDGE FUNCTION: cancel-subscription
//  Cancels a Stripe subscription so billing stops. Caller: staff (any) or a
//  client (their own). The webhook (customer.subscription.deleted) then syncs
//  the membership status in the DB.
// ============================================================
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Inlined from _shared/cors.ts so this function deploys standalone.
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
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2025-01-27.acacia', httpClient: Stripe.createFetchHttpClient() });

    const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: u } = await caller.auth.getUser();
    if (!u?.user) return json(401, { error: 'Not authenticated.' });
    const { data: prof } = await caller.from('profiles').select('role, member_id').eq('id', u.user.id).single();
    const isStaff = prof && prof.role !== 'client';

    const { subscriptionId, memberId, immediate, resume } = await req.json();
    if (!subscriptionId) return json(400, { error: 'subscriptionId is required.' });
    if (!isStaff && prof?.member_id !== memberId) return json(403, { error: 'You can only cancel your own subscription.' });
    // Only staff may end a cycle early — a client cancelling their own plan
    // always runs to the period they already paid for.
    const endNow = immediate === true && isStaff;

    // Undo a scheduled cancellation: the subscription was never cancelled, only
    // flagged, so lifting the flag is all it takes.
    if (resume === true) {
      await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false });
      return json(200, { ok: true, resumed: true });
    }

    try {
      if (endNow) {
        await stripe.subscriptions.cancel(subscriptionId);
      } else {
        // The default. Billing stops, access runs to the end of the paid
        // period, and Stripe fires customer.subscription.deleted when it
        // actually ends — which the webhook already handles.
        const sub = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
        return json(200, {
          ok: true,
          cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString().slice(0, 10) : null,
        });
      }
    } catch (e) {
      // Already canceled or no longer in Stripe → billing is already stopped, so
      // treat as success instead of blocking the local cancellation.
      const code = (e as { code?: string; raw?: { code?: string } })?.code
        ?? (e as { raw?: { code?: string } })?.raw?.code;
      const msg = e instanceof Error ? e.message : String(e);
      if (code === 'resource_missing' || /cancel/i.test(msg)) {
        return json(200, { ok: true, alreadyCanceled: true });
      }
      throw e;
    }
    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
