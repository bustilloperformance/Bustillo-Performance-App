import { useState } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast, useConfirm } from '../../components/feedback';
import { savePlan, deletePlan } from '../../data/plans';
import { recurrenceLabel, planTermsLine, planEndDate, termLabel, MAX_INTERVAL, todayISO, planBillingLabel, planIsOneOff } from '../../lib/helpers';
import { PageHeader, Btn, Modal, Field } from '../../components/ui';
import { inputClass, inputStyle } from '../../components/uiStyles';
import { ContentEditor } from '../../components/RichContent';

// ============================================================
//  PLANS — plan catalog (owner/coach)
//  Migrated from the prototype: reads from the data store, writes via
//  the plans data module + refresh() instead of the local update().
// ============================================================
export default function PlansView() {
  const { data, refresh } = useData();
  const showToast = useToast();
  const askConfirm = useConfirm();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const blank = {
    name: '', price: '',
    recurrence: 'monthly', intervalUnit: 'week', intervalCount: '2', billingCycles: '',
    freeTrialDays: '0', minCommitmentMonths: '3', paymentMethods: ['card'],
    description: '', listed: true, content: [],
  };
  const [form, setForm] = useState(blank);
  // Un plan es de pago único si no vuelve a cobrar: un cobro sin vencimiento o
  // un bloque de un solo ciclo. Las dos formas viven en campos distintos, y
  // esta línea es la que las junta en una sola pregunta.
  const pagoUnico = form.recurrence === 'one-time' || Number(form.billingCycles) === 1;
  const [saving, setSaving] = useState(false);

  const openNew = () => { setEditing(null); setForm(blank); setShowForm(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({
      ...p,
      price: String(p.price),
      freeTrialDays: String(p.freeTrialDays),
      minCommitmentMonths: String(p.minCommitmentMonths || 0),
      listed: p.listed !== false,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name || !form.price || saving) return;
    if (form.recurrence === 'custom') {
      const max = MAX_INTERVAL[form.intervalUnit || 'week'];
      const n = Number(form.intervalCount) || 0;
      if (n < 1 || n > max) { showToast(`Interval must be between 1 and ${max} ${form.intervalUnit || 'week'}s — Stripe caps it at one year.`); return; }
    }
    setSaving(true);
    try {
      await savePlan(form, editing?.id);
      await refresh();
      setShowForm(false);
      showToast(editing ? 'Plan updated.' : 'Plan created.');
    } catch (e) {
      showToast(e.message || 'Could not save the plan.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (id) => {
    const plan = data.membershipPlans.find((p) => p.id === id);
    askConfirm({
      message: 'Delete this plan?',
      detail: plan
        ? `"${plan.name}" will be removed from your catalog. Active subscriptions on this plan won't be affected.`
        : '',
      confirmLabel: 'DELETE PLAN',
      onConfirm: async () => {
        try {
          await deletePlan(id);
          await refresh();
          showToast('Plan removed.');
        } catch (e) {
          showToast(e.message || 'Could not delete the plan.');
        }
      },
    });
  };

  const togglePM = (m) => {
    setForm((f) => ({
      ...f,
      paymentMethods: f.paymentMethods.includes(m)
        ? f.paymentMethods.filter((x) => x !== m)
        : [...f.paymentMethods, m],
    }));
  };

  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="03" section="BILLING · PLAN CATALOG" title="Plans." subtitle="— set your standard."
        action={<Btn icon={Plus} onClick={openNew}>NEW PLAN</Btn>} />

      {data.membershipPlans.length === 0 ? (
        <div className="text-center py-16" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
          <div className="serif-italic" style={{ fontSize: '28px', color: C.ink }}>No plans yet.</div>
          <div className="help mt-2" style={{ fontSize: '18px', color: C.gold }}>— create your first plan to set the standard.</div>
          <div className="mt-6 flex justify-center"><Btn icon={Plus} onClick={openNew}>NEW PLAN</Btn></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.membershipPlans.map((p) => {
            const subscriberCount = data.memberships.filter((m) => m.planId === p.id && m.status === 'active').length;
            return (
              <div key={p.id} className="p-6 group relative" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={() => openEdit(p)} className="p-1.5" style={{ background: C.bone, border: `1px solid ${C.charcoal}40` }}><Edit2 size={12} /></button>
                  <button onClick={() => remove(p.id)} className="p-1.5" style={{ background: C.gold, color: C.bone }}><Trash2 size={12} /></button>
                </div>
                <div className="mono mb-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.gold }}>
                  — {planBillingLabel(p).toUpperCase()}
                </div>
                <div className="prog-name mb-2" style={{ fontSize: '32px' }}>{p.name}</div>
                <div className="flex flex-wrap gap-1 mb-3">
                  <span className="mono px-2 py-0.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.navy, color: C.ink }}>☁ 1-ON-1 ONLINE</span>
                  {p.listed === true ? (
                    <span className="mono px-2 py-0.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.cream, color: C.ink }}>◉ LISTED</span>
                  ) : (
                    <span className="mono px-2 py-0.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.sand, color: C.bone }}>○ HIDDEN</span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="display" style={{ fontSize: '36px', fontWeight: 600, color: C.ink }}>${p.price}</span>
                  <span className="mono" style={{ fontSize: '12px', color: C.moss }}>{planIsOneOff(p) ? planBillingLabel(p) : `/ ${recurrenceLabel(p)}`}</span>
                </div>
                <div className="text-sm mb-4" style={{ color: C.charcoal }}>{p.description}</div>
                <div className="space-y-1.5 mb-4 mono" style={{ fontSize: '12px' }}>
                  <div className="flex justify-between">
                    <span style={{ color: C.moss, letterSpacing: '0.1em' }}>FREE TRIAL</span>
                    <span style={{ fontWeight: 600 }}>{p.freeTrialDays} DAYS</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: C.moss, letterSpacing: '0.1em' }}>COMMITMENT</span>
                    <span style={{ fontWeight: 600, color: p.minCommitmentMonths > 0 ? C.gold : C.moss }}>
                      {p.minCommitmentMonths > 0 ? `${p.minCommitmentMonths} MO MIN` : 'NONE'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: C.moss, letterSpacing: '0.1em' }}>SUBSCRIBERS</span>
                    <span style={{ fontWeight: 600 }}>{subscriberCount}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 pt-3" style={{ borderTop: `1px solid ${C.charcoal}20` }}>
                  {p.paymentMethods.map((m) => (
                    <span key={m} className="mono px-2 py-0.5" style={{ fontSize: '10px', letterSpacing: '0.1em', background: C.cream, color: C.ink }}>
                      {m.toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <Modal title={editing ? 'Edit Plan' : 'New Plan'} eyebrow="BILLING · PLAN" onClose={() => setShowForm(false)} size="md">
          <div className="space-y-3">
            <Field label="PLAN NAME">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="FW Athletes · 3x" className={inputClass} style={inputStyle} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="PRICE"><input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={inputClass} style={inputStyle} /></Field>
              <Field label="FREE TRIAL DAYS"><input type="number" value={form.freeTrialDays} onChange={(e) => setForm({ ...form, freeTrialDays: e.target.value })} className={inputClass} style={inputStyle} disabled={pagoUnico} /></Field>
            </div>

            {/* La pregunta que antes habia que deducir. "Pago unico" se podia
                expresar de dos formas distintas -- one-time o un
                billing_cycles de 1 -- y ninguna lo decia en voz alta, asi que
                un bloque cobrado de contado terminaba configurado como
                suscripcion indefinida. Aqui se declara, y los campos de abajo
                se acomodan a la respuesta. */}
            <div className="grid grid-cols-2 gap-2">
              {[
                ['sub', 'SUSCRIPCIÓN', 'se cobra cada ciclo hasta cancelar'],
                ['once', 'PAGO ÚNICO', 'un solo cobro, un bloque de acceso'],
              ].map(([id, label, eg]) => (
                <button key={id} type="button" onClick={() => setForm((f) => (id === 'once'
                  ? { ...f, recurrence: 'one-time', billingCycles: '' }
                  : { ...f, recurrence: 'monthly', billingCycles: '' }))}
                  className="px-3 py-2.5 text-left"
                  style={{ background: (id === 'once') === pagoUnico ? C.gold : C.cream, border: `1px solid ${(id === 'once') === pagoUnico ? C.gold : `${C.charcoal}30`}` }}>
                  <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', fontWeight: 700, color: (id === 'once') === pagoUnico ? C.gold : C.moss }}>{label}</div>
                  <div style={{ fontSize: '12px', marginTop: 2, lineHeight: 1.35, color: (id === 'once') === pagoUnico ? C.sand : C.moss }}>{eg}</div>
                </button>
              ))}
            </div>

            {pagoUnico ? (
              <div className="p-3" style={{ background: C.bone, border: `1px solid ${C.charcoal}20` }}>
                <div className="mono mb-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>¿CUÁNTO DURA EL ACCESO?</div>
                <div className="flex gap-2 flex-wrap">
                  {[
                    ['block', 'UN BLOQUE'],
                    ['one-time', 'SIN VENCIMIENTO'],
                  ].map(([id, label]) => {
                    const activo = id === 'block' ? form.recurrence === 'custom' : form.recurrence === id;
                    return (
                      <button key={id} type="button" onClick={() => setForm((f) => (id === 'block'
                        ? { ...f, recurrence: 'custom', billingCycles: '1', intervalUnit: f.intervalUnit || 'week', intervalCount: f.intervalCount || '12' }
                        : { ...f, recurrence: id, billingCycles: '' }))}
                        className="mono px-3 py-2" style={{ fontSize: '11px', letterSpacing: '0.1em', background: activo ? C.gold : C.cream, color: activo ? C.bone : C.moss, border: `1px solid ${activo ? C.gold : `${C.charcoal}30`}` }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
                {form.recurrence === 'one-time' && (
                  <div className="help mt-2" style={{ fontSize: '14px', color: C.moss }}>— un cobro y el acceso no caduca. Para un programa que se compra y se queda.</div>
                )}
                {form.recurrence === 'custom' && (() => {
                  const unit = form.intervalUnit || 'week';
                  const max = MAX_INTERVAL[unit];
                  const n = Number(form.intervalCount) || 1;
                  const over = n > max;
                  return (
                    <div className="mt-3">
                      <div className="mono mb-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>EL BLOQUE DURA</div>
                      <div className="flex gap-2 items-start">
                        <input type="number" min="1" max={max} value={form.intervalCount}
                          onChange={(e) => setForm({ ...form, intervalCount: e.target.value })}
                          className={inputClass} style={{ ...inputStyle, maxWidth: 110 }} />
                        <select value={unit} onChange={(e) => setForm({ ...form, intervalUnit: e.target.value })} className={inputClass} style={inputStyle}>
                          <option value="day">día(s)</option>
                          <option value="week">semana(s)</option>
                          <option value="month">mes(es)</option>
                        </select>
                      </div>
                      <div className="help mt-2" style={{ fontSize: '14px', color: over ? C.gold : C.moss }}>
                        {over
                          ? `— máximo ${max} ${unit}s.`
                          : <>— un cobro de ${form.price || 0} por {n} {unit === 'day' ? 'día' : unit === 'week' ? 'semana' : 'mes'}{n === 1 ? '' : 's'}. Empezando hoy terminaría el <strong>{planEndDate(todayISO(), { ...form, billingCycles: 1 }) || '—'}</strong>. No cuenta en el MRR.</>}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="p-3" style={{ background: C.bone, border: `1px solid ${C.charcoal}20` }}>
                <Field label="SE COBRA">
                  <select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })} className={inputClass} style={inputStyle}>
                    <option value="monthly">Cada mes</option>
                    <option value="quarterly">Cada 3 meses</option>
                    <option value="annual">Cada año</option>
                    <option value="custom">Personalizado — cada N días / semanas / meses</option>
                  </select>
                </Field>
                {form.recurrence === 'custom' && (() => {
                  const unit = form.intervalUnit || 'week';
                  const max = MAX_INTERVAL[unit];
                  const n = Number(form.intervalCount) || 1;
                  const over = n > max;
                  return (
                    <div className="mt-3">
                      <div className="mono mb-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>CADA</div>
                      <div className="flex gap-2 items-start">
                        <input type="number" min="1" max={max} value={form.intervalCount}
                          onChange={(e) => setForm({ ...form, intervalCount: e.target.value })}
                          className={inputClass} style={{ ...inputStyle, maxWidth: 110 }} />
                        <select value={unit} onChange={(e) => setForm({ ...form, intervalUnit: e.target.value })} className={inputClass} style={inputStyle}>
                          <option value="day">día(s)</option>
                          <option value="week">semana(s)</option>
                          <option value="month">mes(es)</option>
                        </select>
                      </div>
                      {/* Stripe no acepta un intervalo recurrente mayor a un año,
                          asi que el tope se avisa aqui y no en el checkout. */}
                      <div className="help mt-2" style={{ fontSize: '14px', color: over ? C.gold : C.moss }}>
                        {over
                          ? `— Stripe topa un intervalo recurrente en un año: máximo ${max} ${unit}s.`
                          : `— cobra $${form.price || 0} ${recurrenceLabel({ recurrence: 'custom', intervalUnit: unit, intervalCount: n })}.`}
                      </div>
                    </div>
                  );
                })()}
                <div className="mt-3">
                  <Field label="TERMINA DESPUÉS DE N COBROS (VACÍO = HASTA CANCELAR)">
                    <input type="number" min="2" value={form.billingCycles}
                      onChange={(e) => setForm({ ...form, billingCycles: e.target.value })}
                      placeholder="p. ej. 12" className={inputClass} style={inputStyle} />
                  </Field>
                  {Number(form.billingCycles) > 1 && (
                    <div className="help mt-1.5" style={{ fontSize: '14px', color: C.moss }}>
                      — cobra {termLabel(form)}, y después termina solo. Empezando hoy correría hasta el{' '}
                      <strong>{planEndDate(todayISO(), form) || '—'}</strong>.
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <Field label="MIN COMMITMENT (MONTHS)"><input type="number" value={form.minCommitmentMonths} onChange={(e) => setForm({ ...form, minCommitmentMonths: e.target.value })} placeholder="0 = no lock" className={inputClass} style={inputStyle} /></Field>
            </div>
            {/* Exactly what the member reads above Stripe's pay button. A
                minimum term is enforced by this app, not by Stripe, so it only
                reaches the checkout page because we put it there. */}
            {planTermsLine(form) && (
              <div className="p-3" style={{ background: C.cream, color: C.ink }}>
                <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.sand }}>MEMBER SEES AT CHECKOUT</div>
                <div className="mono" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.gold }}>{planTermsLine(form)}</div>
              </div>
            )}
            <Field label="PAYMENT METHODS">
              <div className="grid grid-cols-4 gap-1">
                {['card', 'cash', 'zelle', 'transfer'].map((m) => (
                  <button key={m} onClick={() => togglePM(m)} className="mono py-2"
                    style={{ fontSize: '11px', letterSpacing: '0.1em', background: form.paymentMethods.includes(m) ? C.gold : C.cream, color: form.paymentMethods.includes(m) ? C.bone : C.moss, border: `1px solid ${C.charcoal}30` }}>
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="DESCRIPTION"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows="2" className={inputClass} style={inputStyle} /></Field>

            <div className="p-3" style={{ background: C.bone, border: `1px solid ${C.charcoal}20` }}>
              <div className="mono mb-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>CLIENT STOREFRONT</div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={form.listed === true} onChange={(e) => setForm({ ...form, listed: e.target.checked })}
                  style={{ marginTop: '3px', width: '16px', height: '16px', accentColor: C.gold }} />
                <div>
                  <div className="mono" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.ink, fontWeight: 600 }}>SHOW ON CLIENT STOREFRONT</div>
                  <div className="help" style={{ fontSize: '13px', color: C.moss }}>
                    {form.listed
                      ? '— clients can browse and subscribe to this plan themselves.'
                      : '— hidden from the client storefront. only assignable by the owner from a member profile.'}
                  </div>
                </div>
              </label>
              <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.charcoal}15` }}>
                <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.gold }}>STOREFRONT PAGE</div>
                <div className="help mb-2" style={{ fontSize: '13px', color: C.moss }}>— the detail page clients see when they tap this plan. Text, images, videos & links.</div>
                <ContentEditor content={form.content || []} onChange={(content) => setForm({ ...form, content })} />
              </div>
            </div>

            <Btn full onClick={save} disabled={saving}>{saving ? 'SAVING…' : editing ? 'UPDATE PLAN' : 'CREATE PLAN'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
