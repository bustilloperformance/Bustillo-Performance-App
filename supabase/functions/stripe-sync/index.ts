// ============================================================
//  EDGE FUNCTION: stripe-sync (owner only)
//  Ensures every membership plan and every LISTED online program has a Stripe
//  Product + Price, and stores the ids back on the rows. Re-run after pricing
//  changes (Stripe Prices are immutable — a changed amount makes a new Price
//  and archives the old one).
// ============================================================
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';

const RECURRING: Record<string, { interval: 'month' | 'year'; interval_count?: number }> = {
  monthly: { interval: 'month' },
  quarterly: { interval: 'month', interval_count: 3 },
  annual: { interval: 'year' },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;

    // owner only
    const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: u } = await caller.auth.getUser();
    if (!u?.user) return json(401, { error: 'Not authenticated.' });
    const { data: prof } = await caller.from('profiles').select('role').eq('id', u.user.id).single();
    if (prof?.role !== 'owner') return json(403, { error: 'Owner only.' });

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-01-27.acacia', httpClient: Stripe.createFetchHttpClient() });
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    let synced = 0;

    // Ensure a Product + Price for an entity (plan or program). Recurring map:
    // null amount/<=0 is skipped. Returns { productId, priceId }.
    async function ensure(name: string, amountCents: number, recurrence: string | null, prior: { product?: string; price?: string }) {
      let productId = prior.product;
      if (!productId) productId = (await stripe.products.create({ name })).id;
      else { try { await stripe.products.update(productId, { name }); } catch { productId = (await stripe.products.create({ name })).id; } }

      let priceId = prior.price;
      let needNew = !priceId;
      if (priceId) {
        try { const cur = await stripe.prices.retrieve(priceId); if (cur.unit_amount !== amountCents) needNew = true; }
        catch { needNew = true; }
      }
      if (needNew) {
        const rec = recurrence ? RECURRING[recurrence] : null;
        const price = await stripe.prices.create({ product: productId, unit_amount: amountCents, currency: 'usd', ...(rec ? { recurring: rec } : {}) });
        if (prior.price && prior.price !== price.id) { try { await stripe.prices.update(prior.price, { active: false }); } catch { /* ignore */ } }
        priceId = price.id;
      }
      return { productId, priceId };
    }

    // Plans
    const { data: plans } = await admin.from('membership_plans').select('*');
    for (const p of plans ?? []) {
      const amount = Math.round(Number(p.price) * 100);
      if (amount <= 0) continue;
      const recurrence = p.recurrence === 'one-time' ? null : p.recurrence;
      const { productId, priceId } = await ensure(p.name, amount, recurrence, { product: p.stripe_product_id, price: p.stripe_price_id });
      await admin.from('membership_plans').update({ stripe_product_id: productId, stripe_price_id: priceId }).eq('id', p.id);
      synced++;
    }

    // Listed online programs
    const { data: programs } = await admin.from('programs').select('*').eq('mode', 'online').eq('listed', true);
    for (const pg of programs ?? []) {
      const amount = Math.round(Number(pg.price) * 100);
      if (amount <= 0) continue;
      const recurrence = pg.pricing_type === 'monthly' ? 'monthly' : pg.pricing_type === 'annual' ? 'annual' : null;
      const { productId, priceId } = await ensure(pg.name, amount, recurrence, { product: pg.stripe_product_id, price: pg.stripe_price_id });
      await admin.from('programs').update({ stripe_product_id: productId, stripe_price_id: priceId }).eq('id', pg.id);
      synced++;
    }

    return json(200, { ok: true, synced });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
