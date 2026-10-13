import { useState } from 'react';
import { Plus, CreditCard, TrendingUp, Bell } from 'lucide-react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast } from '../../components/feedback';
import { resumeMembership } from '../../data/memberships';
import { commitmentInfo, effectiveMembershipPrice, dayPassExpired, recurrenceLabel, membershipActive, monthlyValue, membershipNotStarted } from '../../lib/helpers';
import { PageHeader, Btn, StatCard, Avatar } from '../../components/ui';
import AssignPlanModal from './AssignPlanModal';
import { PauseMembershipModal, CancelMembershipModal } from './membershipModals';

const STATUS_BADGE = {
  active: { label: '· ACTIVE', bg: C.forest, fg: C.ink },
  paused: { label: '· PAUSED', bg: C.sand, fg: C.bone },
  cancelled: { label: '· CANCELLED', bg: C.charcoal, fg: C.bone },
  ended: { label: '· ENDED', bg: C.charcoal, fg: C.bone },
};

// ============================================================
//  MEMBERSHIPS VIEW — staff screen for member subscriptions & billing.
//  Reads via useData(); lists/filters memberships, shows MRR + renewal stats, and pauses/resumes/cancels/assigns plans through data/memberships.
// ============================================================
export default function MembershipsView() {
  const { data, refresh } = useData();
  const showToast = useToast();
  const [showAssign, setShowAssign] = useState(false);
  const [filter, setFilter] = useState('active');
  const [pauseTarget, setPauseTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);

  const all = data.memberships;
  const counts = (s) => all.filter((m) => m.status === s).length;
  const filtered = filter === 'all' ? all : all.filter((m) => m.status === filter);
  const sorted = [...filtered].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    return (b.startDate || '').localeCompare(a.startDate || '');
  });

  // Mismo cálculo que el tablero, que ya lo hacía bien. Aquí estaba mal por dos
  // razones: sumaba solo los planes 'monthly' — así que un plan trimestral o
  // uno de cadencia personalizada valía 0 — y filtraba por status === 'active',
  // que sigue diciendo 'active' en una membresía vencida. monthlyValue() lleva
  // cualquier cadencia a su valor mensual, y membershipActive() es el que sabe
  // de verdad si sigue viva.
  const planOf = (m) => data.membershipPlans.find((p) => p.id === m.planId);
  const vigentes = all.filter((m) => membershipActive(m, planOf(m)));
  const mrr = Math.round(vigentes.reduce((s, m) => s + monthlyValue(m, planOf(m)), 0));
  const thisMonth = new Date().toISOString().slice(0, 7);
  const renewals = vigentes.filter((m) => !m.pause && m.nextBilling && m.nextBilling.startsWith(thisMonth)).length;

  const doResume = async (id) => {
    try { await resumeMembership(id); await refresh(); showToast('Membership resumed.'); }
    catch (err) { showToast(err.message || 'Could not resume.'); }
  };

  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="04" section="BILLING · SUBSCRIPTIONS" title="Memberships."
        action={<Btn icon={Plus} onClick={() => setShowAssign(true)}>ASSIGN PLAN</Btn>} />

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="ACTIVE" value={counts('active')} icon={CreditCard} accent="ink" />
        <StatCard label="MRR" value={`$${mrr.toLocaleString()}`} icon={TrendingUp} accent="forest" />
        <StatCard label="RENEWALS · MES" value={renewals} icon={Bell} accent="gold" />
      </div>

      <div className="flex gap-1 mb-4 flex-wrap">
        {[
          { id: 'active', label: 'ACTIVE' },
          { id: 'paused', label: 'PAUSED' },
          { id: 'cancelled', label: 'CANCELLED' },
          { id: 'all', label: 'ALL' },
        ].map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className="mono px-3 py-2"
            style={{ fontSize: '11px', letterSpacing: '0.1em', background: filter === f.id ? C.gold : C.cream, color: filter === f.id ? C.bone : C.moss, border: `1px solid ${C.charcoal}20` }}>
            {f.label} <span style={{ opacity: 0.6 }}>({f.id === 'all' ? all.length : counts(f.id)})</span>
          </button>
        ))}
      </div>

      <div style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        {/* Column header — desktop only */}
        <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-2.5 mono"
          style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss, borderBottom: `1px solid ${C.charcoal}20` }}>
          <div className="col-span-3">MEMBER</div>
          <div className="col-span-2">PLAN</div>
          <div className="col-span-2">NEXT / DETAIL</div>
          <div className="col-span-2">COMMITMENT</div>
          <div className="col-span-1">STATUS</div>
          <div className="col-span-2 text-right">ACTIONS</div>
        </div>
        {sorted.map((mb) => {
          const member = data.members.find((m) => m.id === mb.memberId);
          const plan = data.membershipPlans.find((p) => p.id === mb.planId);
          const info = commitmentInfo(mb, plan);
          const expired = dayPassExpired(mb, plan);
          // La cortesía manda sobre el estado normal: es la única razón por la
          // que una membresía sin fecha de cobro sigue viva, y sin decirlo la
          // fila se lee como un error de captura.
          const badge = (mb.status === 'active' && membershipNotStarted(mb))
            ? { label: '· POR EMPEZAR', bg: C.forest, fg: C.ink }
            : mb.courtesy
            ? { label: '· CORTESÍA', bg: C.gold, fg: C.bone }
            : (expired ? { label: '· EXPIRED', bg: C.charcoal, fg: C.bone } : (STATUS_BADGE[mb.status] || STATUS_BADGE.active));
          const isActive = mb.status === 'active' && !expired;
          return (
            <div key={mb.id} className="px-4 md:px-5 py-3 text-sm md:grid md:grid-cols-12 md:gap-3 md:items-center" style={{ borderBottom: `1px solid ${C.charcoal}10` }}>
              {/* Member (+ status on mobile) */}
              <div className="flex items-center gap-2 md:col-span-3">
                <Avatar member={member} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="ui-strong truncate" style={{ fontSize: '18px' }}>{member?.name}</div>
                  <div className="mono truncate" style={{ fontSize: '11px', color: C.moss }}>
                    <span className="md:hidden">{plan?.name} · </span>
                    {mb.courtesy ? 'sin cobro' : `$${effectiveMembershipPrice(mb, plan)} · ${recurrenceLabel(plan)}`}
                  </div>
                </div>
                <span className="md:hidden mono px-2 py-0.5 flex-shrink-0" style={{ fontSize: '10px', letterSpacing: '0.1em', background: badge.bg, color: badge.fg }}>{badge.label}</span>
              </div>
              {/* Plan (desktop) */}
              <div className="hidden md:block md:col-span-2">{plan?.name}</div>
              {/* Next / detail */}
              <div className="md:col-span-2 mono mt-1.5 md:mt-0" style={{ fontSize: '11px' }}>
                {mb.pause ? (
                  <>
                    <span style={{ color: C.gold }}>❚❚ PAUSED</span>
                    <span style={{ fontSize: '9px', color: C.moss }}> {mb.pause.from}{mb.pause.to ? ` → ${mb.pause.to}` : ' →…'}{mb.pause.reason && ` · ${mb.pause.reason}`}</span>
                  </>
                ) : (mb.status === 'active' && membershipNotStarted(mb)) ? (
                  <><span style={{ color: C.moss }}>EMPIEZA</span> {mb.startDate}</>
                ) : mb.courtesy ? (
                  <span style={{ color: C.moss }}>SIN VENCIMIENTO</span>
                ) : isActive && mb.nextBilling ? (
                  <><span style={{ color: C.moss }}>NEXT</span> {mb.nextBilling}</>
                ) : (
                  <span className="hidden md:inline" style={{ color: C.moss }}>—</span>
                )}
              </div>
              {/* Commitment */}
              <div className="md:col-span-2 mono" style={{ fontSize: '11px' }}>
                {mb.courtesy ? (
                  <span className="hidden md:inline" style={{ color: C.moss }}>—</span>
                ) : info.monthsRequired > 0 ? (
                  info.locked
                    ? <span style={{ color: C.gold }}>{info.monthsElapsed}/{info.monthsRequired} MO · LOCKED</span>
                    : <span style={{ color: C.gold }}>{info.monthsRequired}/{info.monthsRequired} MO · CLEARED</span>
                ) : <span className="hidden md:inline" style={{ color: C.moss }}>NO LOCK</span>}
              </div>
              {/* Status (desktop) */}
              <div className="hidden md:block md:col-span-1">
                <span className="mono px-2 py-0.5" style={{ fontSize: '10px', letterSpacing: '0.1em', background: badge.bg, color: badge.fg }}>{badge.label}</span>
              </div>
              {/* Actions */}
              <div className="md:col-span-2 flex gap-1 md:justify-end flex-wrap mt-2 md:mt-0">
                {isActive && !mb.pause && (
                  <button onClick={() => setPauseTarget(mb)} className="mono px-2 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.sand, color: C.bone }}>PAUSE</button>
                )}
                {isActive && mb.pause && (
                  <>
                    <button onClick={() => doResume(mb.id)} className="mono px-2 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.gold, color: C.bone }}>↺ RESUME</button>
                    <button onClick={() => setPauseTarget(mb)} className="mono px-2 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.sand, color: C.bone }}>EDIT</button>
                  </>
                )}
                {isActive && (
                  <button onClick={() => setCancelTarget({ membership: mb, plan })} className="mono px-2 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.gold, color: C.bone }}>CANCEL</button>
                )}
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <div className="p-8 text-center ui-strong" style={{ fontSize: '20px', color: C.moss }}>No memberships in this view.</div>}
      </div>

      {showAssign && <AssignPlanModal onClose={() => setShowAssign(false)} />}
      {pauseTarget && <PauseMembershipModal membership={pauseTarget} onClose={() => setPauseTarget(null)} />}
      {cancelTarget && <CancelMembershipModal membership={cancelTarget.membership} plan={cancelTarget.plan} onClose={() => setCancelTarget(null)} />}
    </div>
  );
}
