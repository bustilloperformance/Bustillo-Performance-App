// ============================================================
//  EDGE FUNCTION: create-checkout
//  One entry for all in-app payments. Stripe Products/Prices are created
//  lazily here (no manual "sync") for membership plans + online programs.
//  Returns { clientSecret } for an EMBEDDED in-app checkout, or { url } for a
//  shareable payment link (asLink:true).
//  kinds: membership (sub) · dropin (one-time) · program (sub/one-time) · pos (ad-hoc amount).
// ============================================================
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';

type Recurring = { interval: 'day' | 'week' | 'month' | 'year'; interval_count?: number };

const RECURRING: Record<string, Recurring> = {
  monthly: { interval: 'month' },
  quarterly: { interval: 'month', interval_count: 3 },
  annual: { interval: 'year' },
};

// ¿Este plan cobra una sola vez? Espejo de planIsOneOff() en
// src/lib/helpers.js — una edge function no puede importar del bundle del
// navegador, así que la regla se repite aquí y las dos deben moverse juntas.
//
// El caso que faltaba es el tercero: un bloque de UN ciclo. Un plan de
// "16 semanas, 1 cobro" traía una cadencia válida, así que el checkout le
// creaba una SUSCRIPCIÓN a Stripe y le volvía a cobrar al cliente a las 16
// semanas — un cobro que nadie autorizó, por un bloque que ya se pagó
// completo.
function planIsOneOff(row: any): boolean {
  return row.recurrence === 'one-time'
    || row.recurrence === 'day-pass'
    || Number(row.billing_cycles) === 1;
}

// El descuento tal como lo arma AssignPlanModal: { type, value, appliesTo }.
// Se valida aquí porque llega del navegador y termina en un cupón de Stripe.
type Descuento = { type: 'percent' | 'amount'; value: number; appliesTo: 'all' | 'first' };
function normalizarDescuento(d: any): Descuento | null {
  if (!d || (d.type !== 'percent' && d.type !== 'amount')) return null;
  const value = Number(d.value);
  if (!(value > 0)) return null;
  if (d.type === 'percent' && value > 100) return null;
  return { type: d.type, value, appliesTo: d.appliesTo === 'first' ? 'first' : 'all' };
}

// Lo que se cobra de verdad en el ciclo 1. Espejo de effectiveMembershipPrice()
// en src/lib/helpers.js: primero el precio a medida sustituye al del plan, y
// encima va el descuento. Las dos tienen que dar el mismo número o la app
// promete un precio y Stripe cobra otro.
// Cómo se llama el descuento en la página de Stripe y en la factura.
function etiquetaDescuento(d: Descuento): string {
  const cuanto = d.type === 'percent' ? `${d.value}% off` : `$${d.value} off`;
  return d.appliesTo === 'first' ? `${cuanto} (first payment)` : cuanto;
}

function precioEfectivo(base: number, d: Descuento | null): number {
  if (!d) return base;
  if (d.type === 'percent') return Math.max(0, Math.round(base * (1 - d.value / 100) * 100) / 100);
  return Math.max(0, base - d.value);
}

// A plan's billing cadence as Stripe wants it. 'custom' carries its own
// interval on the row; everything else is one of the fixed four.
// Devuelve null cuando el plan no recurre: Stripe lo cobra una vez y ya.
function recurringFor(row: any): Recurring | null {
  if (planIsOneOff(row)) return null;
  if (row.recurrence !== 'custom') return RECURRING[row.recurrence] ?? null;
  const unit = row.interval_unit as Recurring['interval'] | null;
  const count = Number(row.interval_count) || 0;
  if (!unit || count < 1) return null; // incomplete custom plan → charge once
  return { interval: unit, interval_count: count };
}

// What the member is agreeing to, spelled out on the Stripe page. Stripe never
// learns about a minimum term on its own — it isn't a Stripe concept unless you
// build a subscription schedule — so without this the checkout page reads as a
// plain cancel-anytime subscription.
// Espejo de recurrenceLabel() en src/lib/helpers.js. La redacción tiene que
// ser IDÉNTICA: lo que el dueño ve en la vista previa al editar el plan es lo
// que el cliente debe leer en la página de Stripe, y una vista previa que no
// coincide con la realidad es peor que no tenerla.
function cadenceLabel(row: any): string {
  if (row.recurrence !== 'custom') return row.recurrence;
  const n = Number(row.interval_count) || 1;
  const u = row.interval_unit || 'week';
  return n === 1 ? `every ${u}` : `every ${n} ${u}s`;
}

function termsLine(row: any): string {
  const bits: string[] = [];
  const rec = recurringFor(row);
  if (rec) {
    bits.push(`Billed ${cadenceLabel(row)}`);
    // Un plazo fijo se cobra N veces y se acaba. Sin decirlo, la página de
    // Stripe se lee como una suscripción indefinida.
    const cycles = Number(row.billing_cycles) || 0;
    if (cycles > 1) bits.push(`${cycles} payments total, then it ends`);
  } else if (planIsOneOff(row)) {
    // Un pago único tiene que decir que NO se renueva. Es lo primero que la
    // gente busca antes de meter su tarjeta.
    const n = Number(row.interval_count) || 0;
    const unit = row.interval_unit;
    bits.push(row.recurrence === 'day-pass' ? 'One charge · valid for one day'
      : (Number(row.billing_cycles) === 1 && n > 0 && unit)
        ? `One charge for ${n} ${unit}${n === 1 ? '' : 's'} · does not renew`
        : 'One charge · does not renew');
  }
  const months = Number(row.min_commitment_months) || 0;
  if (months > 0) bits.push(`${months}-month minimum commitment`);
  return bits.join(' · ');
}

// Huella corta y estable de los parametros de una peticion. Sirve para que dos
// llamadas IDENTICAS compartan clave de idempotencia y dos distintas no.
function huella(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Clave de idempotencia para Stripe. Con la misma clave, Stripe NO crea un
// objeto nuevo: devuelve el que ya habia creado.
//
// Obed toco pagar, no vio respuesta, y volvio a tocar: nueve sesiones de
// checkout en doce minutos, dos de ellas cobradas. Cada toque creaba una sesion
// nueva porque ninguna llamada llevaba clave. Con esto, los toques repetidos
// caen sobre la MISMA sesion, y una sesion solo se puede pagar una vez.
//
// La ventana de 15 minutos es a proposito: colapsa los reintentos de un mismo
// momento sin bloquear una compra legitima mas tarde.
function claveIdem(partes: (string | number | undefined | null)[], ventanaMin = 15): string {
  const bloque = Math.floor(Date.now() / (ventanaMin * 60_000));
  return `fw:${partes.filter(Boolean).join(':')}:${bloque}`.slice(0, 255);
}

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

    const { kind, planId, programId, memberId, amount, note, cart, asLink, origin,
            customPrice: customPriceRaw, discount: discountRaw } = await req.json();
    if (!kind) return json(400, { error: 'kind is required.' });
    // Un precio a medida y un descuento los pone el dueño al asignar el plan, no
    // quien paga. Sin esta guarda, un cliente comprando desde su propia pantalla
    // podría mandarse un 90 % de descuento en el cuerpo de la petición.
    const customPrice = isStaff && customPriceRaw != null && customPriceRaw !== '' ? Number(customPriceRaw) : null;
    const discount = isStaff ? normalizarDescuento(discountRaw) : null;
    if (customPrice != null && !(customPrice >= 0)) return json(400, { error: 'Custom price is not a number.' });
    if (kind !== 'pos' && !isStaff && prof?.member_id !== memberId) return json(403, { error: 'You can only pay for yourself.' });
    if (kind === 'pos' && !isStaff) return json(403, { error: 'Staff only.' });

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // Ensure a Stripe customer for a linked member (optional for POS walk-ins).
    let customerId: string | undefined;
    if (memberId) {
      const { data: member } = await admin.from('members').select('*').eq('id', memberId).single();
      if (!member) return json(404, { error: 'Member not found.' });
      customerId = member.stripe_customer_id ?? undefined;
      if (!customerId) {
        const c = await stripe.customers.create(
          { email: member.email ?? undefined, name: member.name, metadata: { memberId } },
          // Un miembro tiene UN cliente de Stripe. Sin clave, dos peticiones a
          // la vez le creaban dos, y los cobros quedaban repartidos entre ambos.
          { idempotencyKey: `fw:cust:${memberId}` },
        );
        customerId = c.id;
        await admin.from('members').update({ stripe_customer_id: customerId }).eq('id', memberId);
      }
    }

    // Lazily ensure a Product + Price; create a new Price if the amount changed.
    async function ensurePrice(table: string, row: any, name: string, amountCents: number, rec: Recurring | null) {
      let productId = row.stripe_product_id;
      if (!productId) productId = (await stripe.products.create({ name }, { idempotencyKey: `fw:prod:${table}:${row.id}` })).id;
      let priceId = row.stripe_price_id;
      let needNew = !priceId;
      if (priceId) {
        try {
          const c = await stripe.prices.retrieve(priceId);
          // The CADENCE has to be compared too, not just the amount. Reusing a
          // cached price after the owner switched a plan from monthly to
          // every-2-weeks would quietly keep billing at the old interval.
          const same =
            c.unit_amount === amountCents &&
            (c.recurring?.interval ?? null) === (rec?.interval ?? null) &&
            (c.recurring?.interval_count ?? null) === (rec ? rec.interval_count ?? 1 : null);
          if (!same) needNew = true;
        } catch { needNew = true; }
      }
      if (needNew) {
        priceId = (await stripe.prices.create(
          { product: productId, unit_amount: amountCents, currency: 'usd', ...(rec ? { recurring: rec } : {}) },
          { idempotencyKey: `fw:price:${table}:${row.id}:${amountCents}:${rec ? `${rec.interval}${rec.interval_count ?? 1}` : 'once'}` },
        )).id;
      }
      await admin.from(table).update({ stripe_product_id: productId, stripe_price_id: priceId }).eq('id', row.id);
      return priceId;
    }

    // Un cupón por combinación de descuento, reutilizado entre cobros. La clave
    // de idempotencia sale de sus propios parámetros, así que dos asignaciones
    // con el mismo 20 % comparten cupón en vez de llenar Stripe de duplicados.
    async function asegurarCupon(d: Descuento, baseCents: number, recurrente: boolean): Promise<string> {
      // 'first' solo descuenta el primer ciclo; 'all' descuenta siempre. En un
      // plan de un solo cobro la duración da igual, pero Stripe exige una.
      const duration = !recurrente || d.appliesTo === 'first' ? 'once' : 'forever';
      const cuerpo: Stripe.CouponCreateParams = d.type === 'percent'
        ? { percent_off: d.value, duration }
        // Si el descuento fijo supera el precio, se recorta al precio: Stripe
        // aceptaría el exceso, pero dejaría un saldo a favor que nadie pidió.
        : { amount_off: Math.min(Math.round(d.value * 100), baseCents), currency: 'usd', duration };
      const clave = `fw:coupon:${d.type}:${d.value}:${duration}:${d.type === 'amount' ? baseCents : ''}`;
      const c = await stripe.coupons.create({ ...cuerpo, name: etiquetaDescuento(d) }, { idempotencyKey: clave });
      return c.id;
    }

    let mode: 'subscription' | 'payment' = 'payment';
    let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
    let terms = '';
    let cupon: string | null = null;
    const metadata: Record<string, string> = { kind, memberId: memberId ?? '' };

    if (kind === 'membership' || kind === 'dropin') {
      const { data: plan } = await admin.from('membership_plans').select('*').eq('id', planId).single();
      if (!plan) return json(404, { error: 'Plan not found.' });
      // El precio a medida sustituye al del plan; el descuento va encima, como
      // cupón, para que el cliente lo VEA desglosado en la página de Stripe.
      const base = customPrice != null ? customPrice : Number(plan.price);
      const cents = Math.round(base * 100);
      if (cents <= 0) return json(400, { error: 'This plan is free — no card payment needed.' });
      const rec = recurringFor(plan);
      mode = rec ? 'subscription' : 'payment';
      if (precioEfectivo(base, discount) <= 0 && mode === 'payment') {
        return json(400, { error: 'El descuento deja el cobro en $0 — no hace falta pasar por Stripe.' });
      }
      // Un precio a medida NO puede pasar por ensurePrice(): esa función guarda
      // el price que crea en membership_plans.stripe_price_id, así que el precio
      // de un solo cliente quedaría cacheado como el del plan para todos. Se
      // manda en línea con price_data, que Stripe acepta también en suscripción.
      if (customPrice != null) {
        let productId = plan.stripe_product_id;
        if (!productId) {
          productId = (await stripe.products.create({ name: plan.name }, { idempotencyKey: `fw:prod:membership_plans:${plan.id}` })).id;
          await admin.from('membership_plans').update({ stripe_product_id: productId }).eq('id', plan.id);
        }
        lineItems = [{ price_data: { currency: 'usd', product: productId, unit_amount: cents, ...(rec ? { recurring: rec } : {}) }, quantity: 1 }];
        metadata.customPrice = String(base);
      } else {
        lineItems = [{ price: await ensurePrice('membership_plans', plan, plan.name, cents, rec), quantity: 1 }];
      }
      if (discount) {
        cupon = await asegurarCupon(discount, cents, !!rec);
        // El webhook crea la membresía cuando se paga. Sin esto nacería a precio
        // de lista, y el MRR de la app diría una cosa y Stripe cobraría otra.
        metadata.discount = JSON.stringify(discount);
      }
      metadata.planId = planId;
      terms = termsLine(plan);
      if (Number(plan.min_commitment_months) > 0) metadata.minCommitmentMonths = String(plan.min_commitment_months);
    } else if (kind === 'program') {
      const { data: pg } = await admin.from('programs').select('*').eq('id', programId).single();
      if (!pg) return json(404, { error: 'Program not found.' });
      const cents = Math.round(Number(pg.price) * 100);
      if (cents <= 0) return json(400, { error: 'This program is free.' });
      const rec = pg.pricing_type === 'monthly' ? RECURRING.monthly : pg.pricing_type === 'annual' ? RECURRING.annual : null;
      const priceId = await ensurePrice('programs', pg, pg.name, cents, rec);
      mode = rec ? 'subscription' : 'payment';
      lineItems = [{ price: priceId, quantity: 1 }];
      metadata.programId = programId;
    } else if (kind === 'pos') {
      const cents = Math.round(Number(amount) * 100);
      if (cents <= 0) return json(400, { error: 'Amount must be greater than 0.' });
      mode = 'payment';
      lineItems = [{ price_data: { currency: 'usd', unit_amount: cents, product_data: { name: note || 'Studio sale' } }, quantity: 1 }];
      metadata.note = (note ?? '').slice(0, 480);
      if (cart) metadata.cart = JSON.stringify(cart).slice(0, 480);
    } else {
      return json(400, { error: 'Unknown kind.' });
    }

    const base: Stripe.Checkout.SessionCreateParams = {
      mode,
      ...(customerId ? { customer: customerId } : {}),
      line_items: lineItems,
      ...(cupon ? { discounts: [{ coupon: cupon }] } : {}),
      metadata,
      // Spell the terms out above the pay button. A minimum term is enforced by
      // this app, not by Stripe, so without this the page would read as an
      // ordinary cancel-anytime subscription.
      ...(terms ? { custom_text: { submit: { message: terms } } } : {}),
      ...(mode === 'subscription'
        ? { subscription_data: { metadata, ...(terms ? { description: terms } : {}) } }
        : { payment_intent_data: { metadata, ...(terms ? { description: terms } : {}) } }),
    };
    const site = origin || 'http://localhost:5174';

    // La casilla de "Acepto los Términos y Condiciones" la pone Stripe, no la
    // app. La diferencia no es estética: Stripe deja el consentimiento pegado
    // al pago — la sesión guarda consent.terms_of_service = 'accepted' con su
    // fecha — y eso es lo que se presenta como evidencia si alguien disputa un
    // cargo, que es justo lo que promete la Sección 13 de los Términos. Una
    // casilla dentro de la app no deja rastro donde importa.
    //
    // Stripe la rechaza si no hay una URL de términos configurada en el
    // Dashboard (Settings → Business → Public details). Por eso se intenta con
    // la casilla y, si Stripe se queja exactamente de eso, se reintenta sin
    // ella: el checkout nunca se cae por este motivo, y la casilla aparece sola
    // el día que se configure la URL, sin volver a tocar este código.
    const crearSesion = async (params: Stripe.Checkout.SessionCreateParams) => {
      // La clave sale de los propios parámetros: dos peticiones idénticas la
      // comparten, una con otro plan o monto no. Stripe rechaza reusar una
      // clave con parámetros distintos, así que derivarla del contenido es lo
      // único que no se rompe solo.
      const opciones = { idempotencyKey: claveIdem([kind, memberId, huella(JSON.stringify(params))]) };
      try {
        return await stripe.checkout.sessions.create(
          { ...params, consent_collection: { terms_of_service: 'required' } }, opciones,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/terms[ _-]?of[ _-]?service/i.test(msg)) throw e;
        console.warn('[create-checkout] Sin URL de términos en el Dashboard; se cobra sin casilla.', msg);
        // Clave distinta: los parámetros cambiaron al quitar la casilla, y
        // Stripe rechaza una clave reusada con parámetros que no coinciden.
        return await stripe.checkout.sessions.create(params, { idempotencyKey: `${opciones.idempotencyKey}:sin-casilla` });
      }
    };

    // Si la sesión que Stripe devuelve YA se pagó, es que esta petición es un
    // reintento de algo que ya funcionó. Cobrar otra vez seria repetir
    // exactamente lo de Obed, así que se avisa en vez de abrir el formulario.
    const yaPagada = (ses: Stripe.Checkout.Session) =>
      ses.payment_status === 'paid' || ses.status === 'complete';

    if (asLink) {
      const session = await crearSesion({ ...base, success_url: `${site}?checkout=success`, cancel_url: `${site}?checkout=cancel` });
      if (yaPagada(session)) return json(409, { error: 'Este cobro ya se pagó hace unos minutos. Revisa antes de volver a cobrar.', alreadyPaid: true });
      return json(200, { url: session.url });
    }
    const session = await crearSesion({ ...base, ui_mode: 'embedded', return_url: `${site}?checkout=success&session_id={CHECKOUT_SESSION_ID}` });
    if (yaPagada(session)) return json(409, { error: 'Este cobro ya se pagó hace unos minutos. Revisa antes de volver a cobrar.', alreadyPaid: true });
    return json(200, { clientSecret: session.client_secret });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
