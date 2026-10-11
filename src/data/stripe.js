import { supabase } from '../lib/supabaseClient';

// ============================================================
//  STRIPE — calls the create-checkout / customer-portal edge functions.
//  Prices are created automatically server-side (no manual sync).
// ============================================================
async function invoke(fn, body) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    try { const ctx = await error.context?.json?.(); if (ctx?.error) msg = ctx.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// Embedded in-app checkout → returns the client_secret to mount EmbeddedCheckout.
export async function fetchCheckoutSecret(args) {
  const data = await invoke('create-checkout', { ...args, origin: window.location.origin });
  return data.clientSecret;
}

// A shareable hosted payment link → returns the URL.
export async function createPaymentLink(args) {
  const data = await invoke('create-checkout', { ...args, asLink: true, origin: window.location.origin });
  return data.url;
}

// Stripe Customer Portal (manage card / cancel) → redirects.
export async function openPortal(memberId) {
  const data = await invoke('customer-portal', { memberId, returnUrl: window.location.origin });
  window.location.href = data.url;
}

// Cancel a Stripe subscription (billing stops).
export async function cancelSubscription(subscriptionId, memberId, immediate = false) {
  return invoke('cancel-subscription', { subscriptionId, memberId, immediate });
}

// Lift a scheduled cancellation in Stripe so billing carries on.
export async function keepSubscription(subscriptionId, memberId) {
  return invoke('cancel-subscription', { subscriptionId, memberId, resume: true });
}
