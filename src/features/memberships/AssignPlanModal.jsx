import { useState } from 'react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast } from '../../components/feedback';
import { assignPlan } from '../../data/memberships';
import { addPayment } from '../../data/studio';
import { createPaymentLink } from '../../data/stripe';
import { effectiveMembershipPrice, defaultNextBilling, todayISO, recurrenceLabel, planEndDate, termLabel } from '../../lib/helpers';
import { Modal, Btn, Field } from '../../components/ui';
import { inputClass, inputStyle } from '../../components/uiStyles';
import StripeCheckoutModal from '../../components/StripeCheckoutModal';

// ============================================================
//  ASSIGN PLAN MODAL — pick a plan, then customize the assignment
//  (start date, custom price, discount, commitment, next billing, notes).
//  Used from MemberDetail and MembershipsView. A preselected memberId skips
//  the member picker.
// ============================================================
export default function AssignPlanModal({ memberId: fixedMemberId, onClose }) {
  const { data, refresh } = useData();
  const showToast = useToast();

  const [memberId, setMemberId] = useState(fixedMemberId || '');
  const [planId, setPlanId] = useState('');
  const [step, setStep] = useState('pick'); // 'pick' | 'customize'
  const [saving, setSaving] = useState(false);
  const [checkoutArgs, setCheckoutArgs] = useState(null); // Stripe embedded checkout
  const [linkUrl, setLinkUrl] = useState('');
  const [custom, setCustom] = useState({
    startDate: todayISO(),
    courtesy: false,
    customPrice: '',
    customMinMonths: '',
    nextBilling: '',
    endDate: '',
    discountType: 'none', // none | percent | amount
    discountValue: '',
    discountApplies: 'all', // all | first
    notes: '',
    recordMethod: 'none', // none | cash | zelle | transfer — records income on assign
  });

  const plan = data.membershipPlans.find((p) => p.id === planId) || null;
  const member = data.members.find((m) => m.id === memberId) || null;

  const buildOverrides = () => {
    const discount =
      custom.discountType !== 'none' && custom.discountValue
        ? { type: custom.discountType, value: Number(custom.discountValue), appliesTo: custom.discountApplies }
        : null;
    return {
      startDate: custom.startDate || todayISO(),
      courtesy: custom.courtesy,
      customPrice: custom.customPrice !== '' ? Number(custom.customPrice) : null,
      customMinMonths: custom.customMinMonths !== '' ? Number(custom.customMinMonths) : null,
      nextBilling: custom.nextBilling || null,
      // Blank means "use the plan's term"; assignPlan computes it. A typed
      // date overrides it, because a client starts late or earns extra time.
      ...(custom.endDate ? { endDate: custom.endDate } : {}),
      discount,
      notes: custom.notes || '',
    };
  };

  // Effective price preview (custom price + discount on cycle 1).
  const pricePreview = plan
    ? effectiveMembershipPrice(
        { customPrice: custom.customPrice !== '' ? Number(custom.customPrice) : null, discount: buildOverrides().discount },
        plan,
        1
      )
    : 0;

  const goCustomize = () => {
    if (!memberId || !planId) { showToast('Pick a member and a plan.'); return; }
    setCustom((c) => (c.courtesy ? c : { ...c, nextBilling: defaultNextBilling(c.startDate || todayISO(), plan) || '', endDate: planEndDate(c.startDate || todayISO(), plan) || '' }));
    setStep('customize');
  };

  const confirm = async () => {
    if (!plan || !member || saving) return;
    setSaving(true);
    try {
      await assignPlan(member.id, plan, buildOverrides());
      if (custom.recordMethod !== 'none' && custom.recordMethod !== 'card' && pricePreview > 0) {
        await addPayment({ memberId: member.id, amount: pricePreview, method: custom.recordMethod, type: 'membership', note: plan.name });
      }
      await refresh();
      showToast(`${plan.name} assigned${custom.recordMethod !== 'none' && custom.recordMethod !== 'card' ? ` · $${pricePreview} ${custom.recordMethod} recorded` : ''}.`);
      onClose();
    } catch (err) {
      showToast(err.message || 'Could not assign the plan.');
    } finally {
      setSaving(false);
    }
  };

  // Card → Stripe. The webhook creates the membership + records the payment on
  // success, so we don't assignPlan locally (that would duplicate it).
  // Lo que se le cobra a ESTE cliente, no lo que dice la lista de precios. El
  // precio a medida y el descuento del formulario tienen que viajar hasta
  // Stripe: sin ellos, la vista previa de aquí arriba prometía un precio y el
  // link cobraba el del plan. La edge function solo los acepta si quien pide es
  // staff, para que nadie se autoaplique un descuento desde su propia pantalla.
  const cobroArgs = () => {
    const { customPrice, discount } = buildOverrides();
    return {
      kind: 'membership', planId: plan.id, memberId: member.id,
      ...(customPrice != null ? { customPrice } : {}),
      ...(discount ? { discount } : {}),
    };
  };
  // Con descuento, lo que decide si hay algo que cobrar es el precio efectivo,
  // no el del plan: una cortesía hecha a base de 100 % de descuento no debe
  // mandar a nadie a Stripe.
  const nadaQueCobrar = () => !(pricePreview > 0);
  const chargeCard = () => {
    if (!plan || !member) return;
    if (nadaQueCobrar()) { showToast('This plan is free — no card charge needed.'); return; }
    setCheckoutArgs(cobroArgs());
  };
  const getLink = async () => {
    if (!plan || !member || saving) return;
    if (nadaQueCobrar()) { showToast('This plan is free — no card charge needed.'); return; }
    setSaving(true);
    try { const u = await createPaymentLink(cobroArgs()); setLinkUrl(u); }
    catch (err) { showToast(err.message || 'Could not create the link.'); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={step === 'pick' ? 'Assign Plan' : 'Customize Assignment'} eyebrow="BILLING · NEW SUB" onClose={onClose} size="md">
      {step === 'pick' ? (
        <div className="space-y-3">
          {!fixedMemberId && (
            <Field label="MEMBER">
              <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className={inputClass} style={inputStyle}>
                <option value="">Select member…</option>
                {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="PLAN">
            <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputClass} style={inputStyle}>
              <option value="">Select plan…</option>
              {data.membershipPlans.map((p) => <option key={p.id} value={p.id}>{p.name} — ${p.price}/{recurrenceLabel(p)}</option>)}
            </select>
          </Field>
          {plan && (
            <div className="p-3" style={{ background: C.bone, border: `1px solid ${C.charcoal}20` }}>
              <div className="grid grid-cols-2 gap-2 mono" style={{ fontSize: '12px' }}>
                <div className="flex justify-between"><span style={{ color: C.moss }}>PRICE</span><span style={{ fontWeight: 600 }}>${plan.price}</span></div>
                <div className="flex justify-between"><span style={{ color: C.moss }}>RECURRENCE</span><span style={{ fontWeight: 600 }}>{recurrenceLabel(plan)}</span></div>
                {plan.minCommitmentMonths > 0 && (
                  <div className="flex justify-between"><span style={{ color: C.goldDeep }}>COMMITMENT</span><span style={{ fontWeight: 600, color: C.moss }}>{plan.minCommitmentMonths} MO MIN</span></div>
                )}
                {plan.freeTrialDays > 0 && <div className="flex justify-between"><span style={{ color: C.moss }}>TRIAL</span><span style={{ fontWeight: 600 }}>{plan.freeTrialDays}D</span></div>}
              </div>
            </div>
          )}
          {member && (data.memberships.some((mb) => mb.memberId === member.id && (mb.status === 'active' || mb.status === 'paused'))) && (
            <div className="help" style={{ fontSize: '14px', color: C.goldDeep }}>
              — {member.name} already has an active membership. Assigning a new plan ends the current one.
            </div>
          )}
          <Btn full onClick={goCustomize}>NEXT — CUSTOMIZE →</Btn>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="prog-name" style={{ fontSize: '22px', color: C.ink }}>
            {plan.name} <span style={{ color: C.goldDeep }}>· {member.name}</span>
          </div>

          {/* Cortesía. Se declara aquí y no se deduce del precio: antes bastaba
              con teclear 0 para que alguien quedara sin vencimiento sin que
              nadie lo decidiera. Al marcarla se vacían la fecha de cobro y la
              de término, que es lo que "indefinida" significa. */}
          <button type="button" onClick={() => setCustom((c) => (c.courtesy
            ? { ...c, courtesy: false, nextBilling: defaultNextBilling(c.startDate || todayISO(), plan) || '', endDate: planEndDate(c.startDate || todayISO(), plan) || '' }
            : { ...c, courtesy: true, customPrice: '0', nextBilling: '', endDate: '' }))}
            className="w-full text-left p-3.5 flex items-center gap-3"
            style={{ background: custom.courtesy ? C.ink : C.cream, border: `1px solid ${custom.courtesy ? C.gold : `${C.charcoal}25`}` }}>
            <span className="flex items-center justify-center flex-shrink-0"
              style={{ width: 22, height: 22, background: custom.courtesy ? C.gold : '#fff', border: `1px solid ${custom.courtesy ? C.gold : `${C.charcoal}35`}`, color: C.ink, fontSize: '14px', fontWeight: 700 }}>
              {custom.courtesy ? '✓' : ''}
            </span>
            <span className="min-w-0">
              <span className="mono block" style={{ fontSize: '11px', letterSpacing: '0.1em', fontWeight: 700, color: custom.courtesy ? C.gold : C.moss }}>CORTESÍA</span>
              <span className="block" style={{ fontSize: '13px', lineHeight: 1.4, color: custom.courtesy ? C.sand : C.moss }}>
                Sin cobro y sin vencimiento. No se le factura ni pierde acceso.
              </span>
            </span>
          </button>

          <div className="grid grid-cols-2 gap-3">
            <Field label="START DATE">
              <input type="date" value={custom.startDate}
                onChange={(e) => setCustom({ ...custom, startDate: e.target.value, ...(custom.courtesy ? {} : { nextBilling: defaultNextBilling(e.target.value, plan) || '', endDate: planEndDate(e.target.value, plan) || '' }) })}
                className={inputClass} style={inputStyle} />
            </Field>
            <Field label={custom.courtesy ? 'NEXT BILLING (CORTESÍA · NINGUNA)' : 'NEXT BILLING'}>
              <input type="date" value={custom.nextBilling || ''} onChange={(e) => setCustom({ ...custom, nextBilling: e.target.value })}
                disabled={custom.courtesy || plan.recurrence === 'one-time' || plan.recurrence === 'day-pass'} className={inputClass} style={inputStyle} />
            </Field>
            <Field label={custom.courtesy ? 'ENDS ON (CORTESÍA · INDEFINIDA)' : (plan.billingCycles ? `ENDS ON · ${termLabel(plan)}` : 'ENDS ON (BLANK = UNTIL CANCELLED)')}>
              <input type="date" value={custom.endDate || ''} onChange={(e) => setCustom({ ...custom, endDate: e.target.value })}
                disabled={custom.courtesy} className={inputClass} style={inputStyle} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={`CUSTOM PRICE (PLAN $${plan.price})`}>
              <input type="number" value={custom.customPrice} onChange={(e) => setCustom({ ...custom, customPrice: e.target.value })}
                placeholder={`${plan.price}`} className={inputClass} style={inputStyle} />
            </Field>
            <Field label={`CUSTOM COMMITMENT (PLAN ${plan.minCommitmentMonths || 0} MO)`}>
              <input type="number" value={custom.customMinMonths} onChange={(e) => setCustom({ ...custom, customMinMonths: e.target.value })}
                placeholder={`${plan.minCommitmentMonths || 0}`} className={inputClass} style={inputStyle} />
            </Field>
          </div>

          <Field label="DISCOUNT">
            <div className="grid grid-cols-3 gap-1 mb-2">
              {[
                { id: 'none', label: 'NONE' },
                { id: 'percent', label: '% OFF' },
                { id: 'amount', label: '$ OFF' },
              ].map((d) => (
                <button key={d.id} type="button" onClick={() => setCustom({ ...custom, discountType: d.id })} className="mono py-2"
                  style={{ fontSize: '11px', letterSpacing: '0.1em', background: custom.discountType === d.id ? C.ink : '#fff', color: custom.discountType === d.id ? C.gold : C.moss, border: `1px solid ${C.charcoal}30` }}>
                  {d.label}
                </button>
              ))}
            </div>
            {custom.discountType !== 'none' && (
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={custom.discountValue} onChange={(e) => setCustom({ ...custom, discountValue: e.target.value })}
                  placeholder={custom.discountType === 'percent' ? '10' : '20'} className={inputClass} style={inputStyle} />
                <select value={custom.discountApplies} onChange={(e) => setCustom({ ...custom, discountApplies: e.target.value })} className={inputClass} style={inputStyle}>
                  <option value="all">All cycles</option>
                  <option value="first">First cycle only</option>
                </select>
              </div>
            )}
          </Field>

          <Field label="NOTES (THIS ASSIGNMENT)">
            <textarea value={custom.notes} onChange={(e) => setCustom({ ...custom, notes: e.target.value })} rows="2" className={inputClass} style={inputStyle} />
          </Field>

          <div className="p-3 flex items-center justify-between" style={{ background: C.ink, color: C.bone }}>
            <span className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.sand }}>EFFECTIVE FIRST CHARGE</span>
            <span className="display" style={{ fontSize: '28px', fontWeight: 600, color: C.gold }}>${pricePreview}</span>
          </div>

          <Field label="PAYMENT">
            <div className="grid grid-cols-5 gap-1">
              {[{ id: 'none', label: 'NONE' }, { id: 'cash', label: 'CASH' }, { id: 'zelle', label: 'ZELLE' }, { id: 'transfer', label: 'TRANSFER' }, { id: 'card', label: '💳 CARD' }].map((m) => (
                <button key={m.id} type="button" onClick={() => setCustom({ ...custom, recordMethod: m.id })} className="mono py-2"
                  style={{ fontSize: '11px', letterSpacing: '0.08em', background: custom.recordMethod === m.id ? C.ink : '#fff', color: custom.recordMethod === m.id ? C.gold : C.moss, border: `1px solid ${custom.recordMethod === m.id ? C.gold : C.charcoal + '30'}` }}>
                  {m.label}
                </button>
              ))}
            </div>
            <div className="help mt-1" style={{ fontSize: '13px', color: C.goldDeep }}>
              {custom.recordMethod === 'none' ? '— assign only, no payment recorded.'
                : custom.recordMethod === 'card' ? `— charges $${plan.price} by card via Stripe. The membership activates automatically once paid.`
                : `— records $${pricePreview} as ${custom.recordMethod} income.`}
            </div>
          </Field>

          <div className="flex gap-2">
            <Btn variant="ghost" onClick={() => setStep('pick')}>← BACK</Btn>
            {custom.recordMethod === 'card' ? (
              <>
                <Btn full onClick={chargeCard}>💳 CHARGE CARD</Btn>
                <Btn variant="ghost" onClick={getLink} disabled={saving}>{saving ? '…' : '⧉ LINK'}</Btn>
              </>
            ) : (
              <Btn full onClick={confirm} disabled={saving}>{saving ? 'ASSIGNING…' : 'ASSIGN PLAN'}</Btn>
            )}
          </div>
        </div>
      )}

      {checkoutArgs && <StripeCheckoutModal args={checkoutArgs} title={`Card · $${plan.price}`} onClose={() => setCheckoutArgs(null)} />}

      {linkUrl && (
        <Modal title="Payment Link" eyebrow={`BILLING · ${(member?.name || '').toUpperCase()}`} onClose={() => setLinkUrl('')} size="md">
          <div className="space-y-3">
            <div className="help text-center" style={{ fontSize: '14px', color: C.goldDeep }}>— send this secure Stripe link to {member?.name?.split(' ')[0]} to pay ${plan?.price}. The membership activates automatically once paid.</div>
            <div className="p-2 mono break-all" style={{ fontSize: '11px', color: C.ink, background: C.bone, border: `1px solid ${C.charcoal}20` }}>{linkUrl}</div>
            <div className="flex gap-2">
              <Btn full onClick={() => { navigator.clipboard?.writeText(linkUrl); showToast('Link copied.'); }}>⧉ COPY LINK</Btn>
              <Btn variant="ghost" onClick={() => window.open(linkUrl, '_blank')}>OPEN</Btn>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
