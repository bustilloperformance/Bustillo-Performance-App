import { useState } from 'react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast } from '../../components/feedback';
import { pauseMembership, cancelMembership } from '../../data/memberships';
import { commitmentInfo, todayISO, DEFAULT_PAUSE_REASONS } from '../../lib/helpers';
import { Modal, Btn, Field } from '../../components/ui';
import { inputClass, inputStyle } from '../../components/uiStyles';

// ============================================================
//  PAUSE MEMBERSHIP — date window + reason.
//  (Cascade to reservations/programs comes in Phases 4-5; for now this
//  pauses the membership itself.)
// ============================================================
export function PauseMembershipModal({ membership, onClose }) {
  const { data, refresh } = useData();
  const showToast = useToast();
  const member = data.members.find((m) => m.id === membership?.memberId);
  const plan = data.membershipPlans.find((p) => p.id === membership?.planId);
  const isEditing = !!membership?.pause;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    from: membership?.pause?.from || todayISO(),
    to: membership?.pause?.to || '',
    reason: membership?.pause?.reason || DEFAULT_PAUSE_REASONS[0],
    newReason: '',
  }));

  if (!membership || !member) return null;
  const showingNew = form.reason === '__new__';

  const confirm = async () => {
    if (!form.from) { showToast('Pick a start date for the pause.'); return; }
    if (form.to && form.to < form.from) { showToast('Pause end must be after the start.'); return; }
    const reason = form.reason === '__new__' ? (form.newReason || '').trim() : form.reason;
    if (!reason) { showToast('Pick a reason.'); return; }
    setSaving(true);
    try {
      await pauseMembership(membership.id, { from: form.from, to: form.to || null, reason });
      await refresh();
      showToast(`Membership paused${form.to ? ` ${form.from} → ${form.to}` : ` from ${form.from}`} · ${reason}.`);
      onClose();
    } catch (err) {
      showToast(err.message || 'Could not pause the membership.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={isEditing ? 'Edit Membership Pause' : 'Pause Membership'}
      eyebrow={`${plan?.name?.toUpperCase() || 'MEMBERSHIP'} · ${member.name.toUpperCase()}`} onClose={onClose} size="md">
      <div className="help mb-4 text-center" style={{ fontSize: '14px', color: C.gold }}>
        — billing pauses for the window. paused days are added back to the renewal date.
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="PAUSE FROM"><input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} className={inputClass} style={inputStyle} /></Field>
        <Field label="PAUSE UNTIL (OPTIONAL)"><input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className={inputClass} style={inputStyle} /></Field>
      </div>
      <Field label="REASON">
        <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputClass} style={inputStyle}>
          {DEFAULT_PAUSE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          <option value="__new__">+ Add a new reason…</option>
        </select>
      </Field>
      {showingNew && (
        <div className="mt-2">
          <Field label="NEW REASON">
            <input type="text" value={form.newReason} onChange={(e) => setForm({ ...form, newReason: e.target.value })}
              placeholder="e.g. Work travel" className={inputClass} style={inputStyle} />
          </Field>
        </div>
      )}
      <div className="mt-4">
        <Btn full onClick={confirm} disabled={saving}>{saving ? 'SAVING…' : isEditing ? 'UPDATE PAUSE' : 'PAUSE MEMBERSHIP'}</Btn>
      </div>
    </Modal>
  );
}

// ============================================================
//  CANCEL MEMBERSHIP — honors the minimum-commitment lock, owner can override.
// ============================================================
export function CancelMembershipModal({ membership, plan, onClose }) {
  const { data, refresh } = useData();
  const showToast = useToast();
  const [saving, setSaving] = useState(false);
  const [immediate, setImmediate] = useState(false);
  const info = commitmentInfo(membership, plan);
  const locked = info.locked;
  // What they've already paid through. Cancelling runs to here.
  const endsOn = membership.nextBilling && membership.nextBilling > todayISO() ? membership.nextBilling : todayISO();

  const doCancel = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await cancelMembership(membership, data.memberships, data.membershipPlans, { immediate });
      await refresh();
      showToast(immediate ? 'Membership ended today.' : `Cancelling — access runs through ${endsOn}.`);
      onClose();
    } catch (err) {
      showToast(err.message || 'Could not cancel the membership.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Cancel Membership" eyebrow="OWNER ACTION" onClose={onClose} size="sm">
      <div className="space-y-3">
        <div className="ui-strong" style={{ fontSize: '20px' }}>
          Cancel <span style={{ color: C.gold }}>{plan?.name}</span>?
        </div>
        <div className="text-sm" style={{ color: C.charcoal }}>
          {immediate
            ? 'Access stops today. Whatever is left of the period they already paid for is forfeited — use this for a refund or a mistake.'
            : 'Billing stops now, and they keep training through the period they already paid for. Nothing is deleted, and you can undo this before the date.'}
        </div>

        {/* This modal already promised "keeps access until the end of the
            current period" while the code cut them off on the spot. Now it's
            true, and ending early is the deliberate exception. */}
        {!immediate && (
          <div className="p-3" style={{ background: C.bone, border: `1px solid ${C.charcoal}20` }}>
            <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>ACCESS RUNS THROUGH</div>
            <div className="ui-strong" style={{ fontSize: '22px', color: C.ink }}>{endsOn}</div>
          </div>
        )}

        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={immediate} onChange={(e) => setImmediate(e.target.checked)} className="mt-1" />
          <span className="text-sm" style={{ color: C.charcoal }}>
            End it today instead, forfeiting the rest of the paid period.
          </span>
        </label>

        {info.monthsRequired > 0 && (
          <div className="p-3" style={{ background: locked ? `${C.gold}20` : `${C.forest}15`, border: `1px solid ${locked ? C.gold : C.forest}40` }}>
            <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.ink }}>
              COMMITMENT · {info.monthsElapsed} / {info.monthsRequired} MONTHS
            </div>
            {locked ? (
              <>
                <div className="text-sm" style={{ color: C.ink }}>
                  This plan requires <strong>{info.monthsRequired} months</strong> before cancelling. Eligible from <strong>{info.releaseDate}</strong>.
                </div>
                <div className="help mt-2" style={{ fontSize: '15px', color: C.gold }}>— You can override as the owner.</div>
              </>
            ) : (
              <div className="text-sm" style={{ color: C.ink }}>Commitment cleared. Cancel is allowed.</div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Btn variant="ghost" onClick={onClose}>BACK</Btn>
          {locked ? (
            <button onClick={doCancel} disabled={saving} className="mono px-5 py-3 flex-1"
              style={{ background: C.gold, color: C.bone, fontSize: '12px', letterSpacing: '0.1em', opacity: saving ? 0.5 : 1 }}>
              {saving ? 'CANCELLING…' : (immediate ? 'OVERRIDE & END TODAY' : 'OVERRIDE & CANCEL')}
            </button>
          ) : (
            <Btn full onClick={doCancel} disabled={saving}>{saving ? 'CANCELLING…' : (immediate ? 'END TODAY' : 'CONFIRM CANCEL')}</Btn>
          )}
        </div>
      </div>
    </Modal>
  );
}
