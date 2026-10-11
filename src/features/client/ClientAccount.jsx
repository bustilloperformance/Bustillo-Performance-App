import { useState } from 'react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast } from '../../components/feedback';
import { openPortal } from '../../data/stripe';
import { effectiveMembershipPrice } from '../../lib/helpers';
import { PageHeader, Btn } from '../../components/ui';
import ChangePasswordModal from '../../components/ChangePasswordModal';

// ============================================================
//  CLIENT · ACCOUNT (billing)
//  Current membership/subscription, manage card/cancel via Stripe Portal,
//  and the client's own payment history.
// ============================================================
export default function ClientAccount({ clientMemberId }) {
  const { data } = useData();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const me = data.members.find((m) => m.id === clientMemberId);
  if (!me) return null;

  const membership = data.memberships.find((mb) => mb.memberId === me.id && (mb.status === 'active' || mb.status === 'paused'));
  const plan = membership ? data.membershipPlans.find((p) => p.id === membership.planId) : null;
  const myPayments = [...data.payments].filter((p) => p.memberId === me.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const myPrograms = data.memberPrograms.filter((mp) => mp.memberId === me.id && mp.status === 'active');

  const manage = async () => {
    if (busy) return;
    setBusy(true);
    try { await openPortal(me.id); }
    catch (err) { showToast(err.message || 'Could not open billing.'); setBusy(false); }
  };

  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="06" section="CLIENT · ACCOUNT" title="Account." subtitle="— your plan & billing." />

      {/* Membership */}
      <div className="p-6 mb-4" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <div>
            <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.goldDeep }}>— MEMBERSHIP</div>
            {plan ? (
              <>
                <div className="prog-name" style={{ fontSize: '32px', color: C.ink }}>{plan.name}</div>
                <div className="mono mt-2" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.moss }}>
                  ${effectiveMembershipPrice(membership, plan)} / {plan.recurrence}
                  {membership.nextBilling ? ` · ${membership.pause ? 'paused' : `renews ${membership.nextBilling}`}` : ''}
                  {membership.stripeStatus ? ` · ${membership.stripeStatus}` : ''}
                </div>
              </>
            ) : (
              <div className="ui-strong" style={{ fontSize: '22px', color: C.moss }}>No active membership.</div>
            )}
          </div>
          {me.stripeCustomerId || membership?.stripeSubscriptionId || myPayments.length > 0 ? (
            <Btn onClick={manage} disabled={busy}>{busy ? 'OPENING…' : 'MANAGE BILLING →'}</Btn>
          ) : null}
        </div>
        <div className="help mt-3" style={{ fontSize: '13px', color: C.moss }}>— "Manage billing" opens the secure Stripe portal to change your card, view invoices, or cancel.</div>
      </div>

      {/* Active online programs */}
      {myPrograms.length > 0 && (
        <div className="p-6 mb-4" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
          <div className="mono mb-3" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.goldDeep }}>— ONLINE PROGRAMS</div>
          {myPrograms.map((mp) => {
            const pg = data.programs.find((p) => p.id === mp.programId);
            return (
              <div key={mp.id} className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${C.charcoal}10` }}>
                <div className="prog-name" style={{ fontSize: '18px' }}>{pg?.name || 'Program'}</div>
                <div className="mono" style={{ fontSize: '11px', color: C.moss }}>SINCE {mp.startedAt}{mp.stripeSubscriptionId ? ' · RECURRING' : ' · OWNED'}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Security */}
      <div className="p-6 mb-4 flex items-center justify-between flex-wrap gap-3" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        <div>
          <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.goldDeep }}>— SECURITY</div>
          <div className="ui-strong" style={{ fontSize: '20px', color: C.ink }}>Password</div>
          <div className="help mt-1" style={{ fontSize: '13px', color: C.moss }}>— change the password you use to sign in.</div>
        </div>
        <Btn variant="ghost" onClick={() => setShowPw(true)}>🔑 CHANGE PASSWORD</Btn>
      </div>

      {/* Payment history */}
      <div className="p-6" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        <div className="ui-strong mb-4" style={{ fontSize: '24px' }}>Payment History</div>
        {myPayments.length === 0 ? (
          <div className="ui-strong" style={{ fontSize: '18px', color: C.moss }}>No payments yet.</div>
        ) : (
          <div className="space-y-1.5">
            {myPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-1.5" style={{ borderBottom: `1px solid ${C.charcoal}10` }}>
                <div>
                  <div className="text-sm">{p.note || p.type}</div>
                  <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>{p.date} · {(p.method || '').toUpperCase()} · {(p.type || '').toUpperCase()}</div>
                </div>
                <div className="mono" style={{ fontSize: '14px', fontWeight: 600, color: C.gold }}>+${p.amount}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showPw && <ChangePasswordModal onClose={() => setShowPw(false)} />}
    </div>
  );
}
