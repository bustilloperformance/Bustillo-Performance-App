import { supabase } from '../lib/supabaseClient';
import { todayISO, defaultNextBilling, planEndDate } from '../lib/helpers';
import { cancelSubscription, keepSubscription } from './stripe';
import { addPayment } from './studio';

// ============================================================
//  MEMBERSHIPS — write operations
//  NOTE: payments/cashOnHand (Phase 8) and the pause cascade to
//  reservations/programs (Phases 4-5) are intentionally NOT wired yet —
//  those tables don't exist. Pause here operates on the membership only.
// ============================================================

// Assign a plan to a member. Ends any prior active/paused membership and
// inserts a new active one (with optional per-member overrides).
export async function assignPlan(memberId, plan, overrides = {}) {
  const startDate = overrides.startDate || todayISO();
  // Una cortesía no se cobra ni termina. Las dos fechas se anulan aquí y no
  // solo en el formulario: si se dejaran calcular, una cortesía nacería con
  // fecha de renovación — el perfil mostraría un cobro que nunca va a ocurrir,
  // y bastaría con desmarcar la casilla en otra pantalla para que venciera.
  const courtesy = !!overrides.courtesy;
  const nextBilling = courtesy ? null : (overrides.nextBilling || defaultNextBilling(startDate, plan));
  // A fixed-term plan gets its end date worked out here; the caller can pass
  // its own, because a real client starts late or earns an extra week.
  const endDate = courtesy
    ? null
    : (overrides.endDate !== undefined ? (overrides.endDate || null) : planEndDate(startDate, plan));

  // End prior active/paused memberships for this member.
  const { error: endErr } = await supabase
    .from('memberships')
    .update({ status: 'ended' })
    .eq('member_id', memberId)
    .in('status', ['active', 'paused']);
  if (endErr) throw endErr;

  const { error: insErr } = await supabase.from('memberships').insert({
    member_id: memberId,
    plan_id: plan.id,
    start_date: startDate,
    next_billing: nextBilling,
    status: 'active',
    upfront_paid: overrides.upfrontPaid ?? false,
    trial_end: overrides.trialEnd ?? null,
    custom_price: overrides.customPrice ?? null,
    courtesy: !!overrides.courtesy,
    custom_min_months: overrides.customMinMonths ?? null,
    end_date: endDate,
    discount: overrides.discount || null,
    notes: overrides.notes || '',
  });
  if (insErr) throw insErr;

}

// Pause: set the pause window + reason. Status stays 'active' (matches the
// prototype's rich pause). Cascade to reservations/programs comes in later phases.
export async function pauseMembership(membershipId, { from, to, reason }) {
  const { error } = await supabase
    .from('memberships')
    .update({ pause: { from, to: to || null, reason } })
    .eq('id', membershipId);
  if (error) throw error;
}

// Manual renewal: push the next-billing date forward one cycle. If renewed on
// time we continue from the current date; if already lapsed we start a fresh
// cycle from today. (Stripe subs renew themselves — this is for manual ones.)
// `amount` and `method` book the cycle as income. Pass method null to skip the
// payment (the caller already recorded it, or nothing changed hands).
export async function renewMembership(membership, plan, { amount, method } = {}) {
  const today = todayISO();
  const current = membership.nextBilling;
  const base = current && current > today ? current : today;
  const next = defaultNextBilling(base, plan);
  if (!next) throw new Error('This plan is one-time or a day pass and does not renew.');
  // Una cortesía no tiene ciclo que renovar. Sin esta guarda, renovarla le
  // pondría una fecha de cobro y registraría un pago que nadie hizo.
  if (membership.courtesy) throw new Error('This is a courtesy membership — it never lapses, so there is nothing to renew.');

  const { error } = await supabase.from('memberships').update({ next_billing: next, status: 'active' }).eq('id', membership.id);
  if (error) throw error;

  // A Stripe subscription renews itself and its invoice.paid webhook already
  // files the payment — booking one here too would count the cycle twice.
  if (method && amount > 0 && !membership.stripeSubscriptionId) {
    await addPayment({
      memberId: membership.memberId,
      amount,
      method,
      type: 'membership',
      note: `${plan?.name || 'Membership'} · renewal`,
      date: today,
    });
  }
  return next;
}

// Undo a scheduled cancellation. cancel_at_period_end was never a cancellation,
// only a flag, so Stripe just needs it lifted and billing carries on.
export async function uncancelMembership(membership) {
  if (membership.stripeSubscriptionId) {
    await keepSubscription(membership.stripeSubscriptionId, membership.memberId);
  }
  const { error } = await supabase.from('memberships').update({ cancel_at: null }).eq('id', membership.id);
  if (error) throw error;
}

export async function resumeMembership(membershipId) {
  const { error } = await supabase
    .from('memberships')
    .update({ pause: null })
    .eq('id', membershipId);
  if (error) throw error;
}

// Cancel a membership. If it's a Stripe subscription, cancel it in Stripe first
// (so billing stops).
// `immediate` ends it on the spot, forfeiting whatever is left of the paid
// period — staff-only, for a refund or a mistake. The default schedules the
// cancellation for the end of the cycle they already paid for, which is what a
// subscription is supposed to do.
export async function cancelMembership(membership, _allMemberships, _allPlans, { immediate = false } = {}) {
  const { id: membershipId, memberId, stripeSubscriptionId } = membership;

  if (stripeSubscriptionId) {
    await cancelSubscription(stripeSubscriptionId, memberId, immediate); // throws if Stripe fails → cancel aborts
  }

  // Scheduled: the row stays active until the date, so the member keeps
  // training through what they paid for. member_has_access()
  // stops exactly on cancel_at, with no grace — the date was chosen, not missed.
  const cancelAt = membership.nextBilling && membership.nextBilling > todayISO()
    ? membership.nextBilling
    : todayISO();

  const row = immediate
    ? { status: 'cancelled', stripe_status: stripeSubscriptionId ? 'canceled' : null, next_billing: null, cancel_at: todayISO() }
    : { cancel_at: cancelAt };

  const { error } = await supabase.from('memberships').update(row).eq('id', membershipId);
  if (error) throw error;

  return immediate ? todayISO() : cancelAt;
}
