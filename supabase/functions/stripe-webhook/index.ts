// ============================================================
//  EDGE FUNCTION: stripe-webhook  (no JWT — called by Stripe)
//  Verifies the Stripe signature and syncs payments/memberships/programs:
//   · checkout.session.completed → finalize membership / drop-in / program
//   · customer.subscription.updated/deleted → sync membership status + renewal
//   · invoice.paid (renewal) → record the recurring payment
//  Deploy with --no-verify-jwt.
// ============================================================
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2025-01-27.acacia', httpClient: Stripe.createFetchHttpClient() });
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });

const isoDate = (unix?: number | null) => (unix ? new Date(unix * 1000).toISOString().slice(0, 10) : null);
const today = () => new Date().toISOString().slice(0, 10);
// Period end lives on the subscription (older API) or its first item (newer API).
const subEnd = (sub: any) => isoDate(sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end);

// Last day a fixed-term plan covers: the start advanced one cadence per cycle,
// minus a day, so it ends the day BEFORE the charge that never comes. Mirrors
// planEndDate() in src/lib/helpers.js — an edge function can't import from the
// app, so the two have to be kept in step by hand.
function planEndDate(startDate: string, plan: any): string | null {
  const cycles = Number(plan?.billing_cycles) || 0;
  if (!startDate || cycles < 1) return null;
  const [y, m, d] = startDate.split('-').map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < cycles; i++) {
    switch (plan.recurrence) {
      case 'monthly':   cur.setUTCMonth(cur.getUTCMonth() + 1); break;
      case 'quarterly': cur.setUTCMonth(cur.getUTCMonth() + 3); break;
      case 'annual':    cur.setUTCFullYear(cur.getUTCFullYear() + 1); break;
      case 'custom': {
        const n = Math.max(1, Number(plan.interval_count) || 1);
        if (plan.interval_unit === 'day') cur.setUTCDate(cur.getUTCDate() + n);
        else if (plan.interval_unit === 'week') cur.setUTCDate(cur.getUTCDate() + n * 7);
        else cur.setUTCMonth(cur.getUTCMonth() + n);
        break;
      }
      default: return null; // one-time / day-pass: no cadence to run
    }
  }
  cur.setUTCDate(cur.getUTCDate() - 1);
  return cur.toISOString().slice(0, 10);
}

// Record the Stripe processing fee for a charge as an expense, so net profit
// reflects what actually landed. Best-effort.
async function recordFee(chargeId: string | null | undefined, note: string) {
  if (!chargeId) return;
  try {
    const ch = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
    const bt = ch.balance_transaction as Stripe.BalanceTransaction | null;
    const fee = (bt?.fee ?? 0) / 100;
    if (fee > 0) await admin.from('expenses').insert({ date: today(), amount: fee, category: 'Stripe Fees', note });
  } catch { /* fee not available yet — skip */ }
}

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, Deno.env.get('STRIPE_WEBHOOK_SECRET')!, undefined, cryptoProvider);
  } catch (e) {
    return new Response(`Webhook signature failed: ${e instanceof Error ? e.message : e}`, { status: 400 });
  }

  // Stripe entrega AL MENOS UNA VEZ. Se reclama el evento antes de tocarlo: si
  // la fila ya existe, este evento ya se proceso y contestamos 200 sin repetir
  // nada. Sin esta guarda, un reintento tras un fallo a medio camino insertaba
  // el pago por segunda vez -- dos cobros en el libro por uno solo en la tarjeta.
  const { data: reclamo, error: reclamoErr } = await admin
    .from('stripe_events')
    .insert({ id: event.id, type: event.type })
    .select('id')
    .maybeSingle();
  if (reclamoErr) {
    // 23505 = la fila ya estaba: otro intento de este mismo evento ya paso por
    // aqui. Cualquier otro error si es real y conviene que Stripe reintente.
    if (reclamoErr.code === '23505') {
      return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(`Could not claim event: ${reclamoErr.message}`, { status: 500 });
  }
  if (!reclamo) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        const md = s.metadata ?? {};
        const memberId = md.memberId;
        const amount = (s.amount_total ?? 0) / 100;

        if (md.kind === 'membership' && memberId && md.planId) {
          const { data: plan } = await admin.from('membership_plans').select('*').eq('id', md.planId).single();
          let nextBilling: string | null = null, stripeStatus: string | null = null;
          if (s.subscription) {
            const sub = await stripe.subscriptions.retrieve(s.subscription as string);
            nextBilling = subEnd(sub);
            stripeStatus = sub.status;
          }
          // A fixed-term plan has to stop billing on its own. Access already
          // ends on end_date, but without telling Stripe the card would keep
          // being charged past it — so the subscription gets a cancel_at and
          // closes itself after the last cycle.
          const endDate = planEndDate(today(), plan);
          if (endDate && s.subscription) {
            // End of that day, so the final period is fully covered.
            const cancelAt = Math.floor(new Date(`${endDate}T23:59:59Z`).getTime() / 1000);
            try {
              await stripe.subscriptions.update(s.subscription as string, { cancel_at: cancelAt });
            } catch (err) {
              // The membership is still correct locally; only Stripe's own
              // stop is missing, and access ends on the date regardless.
              console.error('could not set cancel_at', err);
            }
          }

          await admin.from('memberships').update({ status: 'ended' }).eq('member_id', memberId).in('status', ['active', 'paused']);
          // El precio a medida y el descuento viajan en la metadata de la sesión
          // porque la membresia nace AQUI, no cuando el dueño arma el cobro. Sin
          // esto nacia a precio de lista: Stripe cobraba 200 y el MRR de la app
          // contaba 250, y la renovacion manual proponia el precio equivocado.
          let descuento = null;
          try { descuento = md.discount ? JSON.parse(md.discount) : null; } catch { descuento = null; }
          await admin.from('memberships').insert({
            member_id: memberId, plan_id: md.planId, start_date: today(), next_billing: nextBilling,
            end_date: endDate,
            custom_price: md.customPrice ? Number(md.customPrice) : null,
            discount: descuento,
            status: 'active', stripe_subscription_id: (s.subscription as string) ?? null, stripe_status: stripeStatus,
          });
          if (plan?.segment) await admin.from('members').update({ segment: plan.segment }).eq('id', memberId);
          await admin.from('payments').insert({ member_id: memberId, amount, date: today(), method: 'card', type: 'membership', note: plan?.name ?? 'Membership' });
        } else if (md.kind === 'dropin' && memberId) {
          await admin.from('payments').insert({ member_id: memberId, amount, date: today(), method: 'card', type: 'dropin', note: 'Drop-In' });
          const { data: m } = await admin.from('members').select('credits').eq('id', memberId).single();
          await admin.from('members').update({ credits: (m?.credits ?? 0) + 1 }).eq('id', memberId);
        } else if (md.kind === 'pos') {
          await admin.from('payments').insert({ member_id: memberId || null, amount, date: today(), method: 'card', type: 'pos', note: md.note || 'Studio sale' });
          try {
            const cart = JSON.parse(md.cart || '[]');
            for (const it of cart) {
              const { data: p } = await admin.from('products').select('stock').eq('id', it.id).single();
              if (p) await admin.from('products').update({ stock: Math.max(0, (p.stock ?? 0) - it.qty) }).eq('id', it.id);
            }
          } catch { /* no cart / parse issue */ }
          if (memberId) {
            const { data: m } = await admin.from('members').select('points').eq('id', memberId).single();
            await admin.from('members').update({ points: (m?.points ?? 0) + Math.floor(amount) }).eq('id', memberId);
          }
        } else if (md.kind === 'program' && memberId && md.programId) {
          const { data: pg } = await admin.from('programs').select('name').eq('id', md.programId).single();
          await admin.from('member_programs').insert({ member_id: memberId, program_id: md.programId, status: 'active', stripe_subscription_id: (s.subscription as string) ?? null, started_at: today() });
          await admin.from('payments').insert({ member_id: memberId, amount, date: today(), method: 'card', type: 'program', note: pg?.name ?? 'Program' });
        }
        // Record the Stripe fee as an expense.
        let chargeId: string | null = null;
        if (s.payment_intent) {
          const pi = await stripe.paymentIntents.retrieve(s.payment_intent as string, { expand: ['latest_charge'] });
          chargeId = (typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id) ?? null;
        } else if (s.subscription) {
          const sub = await stripe.subscriptions.retrieve(s.subscription as string, { expand: ['latest_invoice'] });
          const inv = sub.latest_invoice as Stripe.Invoice | null;
          chargeId = (inv?.charge as string) ?? null;
        }
        await recordFee(chargeId, `Stripe fee · ${md.kind}`);
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const status = sub.status === 'canceled' ? 'cancelled' : 'active';
        await admin.from('memberships').update({ stripe_status: sub.status, status, next_billing: subEnd(sub) }).eq('stripe_subscription_id', sub.id);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await admin.from('memberships').update({ stripe_status: 'canceled', status: 'cancelled', next_billing: null }).eq('stripe_subscription_id', sub.id);
        break;
      }
      case 'invoice.paid': {
        const inv = event.data.object as Stripe.Invoice;
        // Only record renewals; the first charge is recorded by checkout.session.completed.
        if (inv.billing_reason === 'subscription_cycle' && inv.subscription) {
          const { data: mb } = await admin.from('memberships').select('id, member_id, plan_id').eq('stripe_subscription_id', inv.subscription as string).maybeSingle();
          if (mb) {
            const { data: plan } = await admin.from('membership_plans').select('name').eq('id', mb.plan_id).single();
            await admin.from('payments').insert({ member_id: mb.member_id, amount: (inv.amount_paid ?? 0) / 100, date: today(), method: 'card', type: 'membership', note: `${plan?.name ?? 'Membership'} · renewal` });
            if (inv.lines?.data?.[0]?.period?.end) await admin.from('memberships').update({ next_billing: isoDate(inv.lines.data[0].period.end) }).eq('id', mb.id);
            await recordFee(inv.charge as string, `Stripe fee · ${plan?.name ?? 'Membership'} renewal`);
          }
        }
        break;
      }
    }
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    // Se suelta la reclamacion para que el reintento de Stripe SI pueda volver
    // a intentarlo. Sin esto, un fallo pasajero -- la base ocupada un segundo --
    // dejaria el evento marcado como procesado y el pago nunca se registraria:
    // exactamente el agujero por el que Obed pago dos veces.
    await admin.from('stripe_events').delete().eq('id', event.id);
    return new Response(`Handler error: ${e instanceof Error ? e.message : e}`, { status: 500 });
  }
});
