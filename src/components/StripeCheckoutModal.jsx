import { useCallback, useEffect, useRef, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { C } from '../theme';
import { Modal } from './ui';
import { fetchCheckoutSecret } from '../data/stripe';
import { recordarCheckout, olvidarCheckout } from '../lib/pendingCheckout';

// ============================================================
//  STRIPE EMBEDDED CHECKOUT — the card form, inside the app (a modal).
//  Pass `args` (kind/planId/programId/memberId/amount/note/cart, y para una
//  membresía también customPrice/discount, que la edge function solo acepta si
//  quien pide es staff). On success
//  Stripe redirects to ?checkout=success (handled in Shell). Closable to cancel.
// ============================================================
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export default function StripeCheckoutModal({ args, title = 'Checkout', onClose }) {
  // Capture args once so the embedded session isn't re-created on re-render.
  const argsRef = useRef(args);
  const [err, setErr] = useState('');

  // Mientras este modal viva, la app recuerda qué se estaba pagando. Tocar
  // "Términos y Condiciones" dentro del formulario de Stripe saca de la app, y
  // sin esto el pago se perdía al volver: la app arrancaba en inicio porque no
  // hay router y el modal no deja rastro en la URL.
  useEffect(() => {
    recordarCheckout(argsRef.current, title);
    return olvidarCheckout;
  }, [title]);
  // Surface the REAL backend error instead of Stripe's generic "something went
  // wrong" screen, which hides why create-checkout failed.
  const fetchClientSecret = useCallback(async () => {
    try {
      const secret = await fetchCheckoutSecret(argsRef.current);
      if (!secret) throw new Error('No client secret returned from create-checkout.');
      return secret;
    } catch (e) {
      setErr(e?.message || String(e));
      throw e;
    }
  }, []);

  return (
    <Modal title={title} eyebrow="SECURE PAYMENT · STRIPE" onClose={onClose} size="md">
      <div className="min-h-[200px]">
        {err ? (
          <div className="p-4" style={{ background: `${C.gold}15`, border: `1px solid ${C.gold}` }}>
            <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.goldDeep }}>⚠ STRIPE ERROR (REAL CAUSE)</div>
            <div className="mono break-words" style={{ fontSize: '13px', color: C.ink }}>{err}</div>
          </div>
        ) : (
          <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        )}
      </div>
    </Modal>
  );
}
