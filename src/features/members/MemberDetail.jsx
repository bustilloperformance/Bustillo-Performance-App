import { useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast, useConfirm } from '../../components/feedback';
import { deleteMember, setGuardian } from '../../data/members';
import { resumeMembership, renewMembership, uncancelMembership } from '../../data/memberships';
import { ensurePersonalProgram } from '../../data/personalPrograms';
import { changeRole, deleteUser } from '../../data/team';
import { commitmentInfo, effectiveMembershipPrice, discountLabel, membershipActive, isDayPassPlan, membershipRenewalStatus, lastPaymentMethodFor, membershipNotStarted } from '../../lib/helpers';
import { Avatar, Btn } from '../../components/ui';
import SearchSelect from '../../components/SearchSelect';
import ChangePasswordModal from '../../components/ChangePasswordModal';
import MemberProfileForm from './MemberProfileForm';
import NutritionEditor from '../nutrition/NutritionEditor';
import CreateLoginModal from './CreateLoginModal';
import PersonalProgramEditor from './PersonalProgramEditor';
import AssignPlanModal from '../memberships/AssignPlanModal';
import { PauseMembershipModal, CancelMembershipModal } from '../memberships/membershipModals';


// ============================================================
//  MEMBER DETAIL — staff screen for one member (membership/program/profile/account tabs).
//  Reads via useData(); writes via data/* modules (members, memberships,
//  personalPrograms, team) to assign/pause/cancel plans, manage the 1-on-1
//  personal program, and handle login role/password/deletion (owner-gated).
// ============================================================
export default function MemberDetail({ memberId, onBack, isOwner = false }) {
  const { data, refresh } = useData();
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [tab, setTab] = useState('membership');
  const [showAssign, setShowAssign] = useState(false);
  const [pauseTarget, setPauseTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [showCreateLogin, setShowCreateLogin] = useState(false);
  const [showResetPw, setShowResetPw] = useState(false);
  const [showProgram, setShowProgram] = useState(false);
  const [openingProgram, setOpeningProgram] = useState(false);
  const [renewing, setRenewing] = useState(false);

  const doRenew = async (mb, plan) => {
    if (renewing) return;
    setRenewing(true);
    try {
      // Books the cycle the same way they were charged when the plan was
      // assigned — cycle 2+, so a first-cycle-only discount doesn't repeat.
      const amount = effectiveMembershipPrice(mb, plan, 2);
      const method = lastPaymentMethodFor(data.payments, mb.memberId);
      await renewMembership(mb, plan, { amount, method });
      await refresh();
      showToast(mb.stripeSubscriptionId ? 'Membership renewed.' : `Renewed · +$${amount} ${method}.`);
    }
    catch (err) { showToast(err.message || 'Could not renew.'); }
    finally { setRenewing(false); }
  };
  // Una cortesía no se renueva: no tiene ciclo ni cobro. El botón desaparece
  // en vez de fallar al tocarlo, que es lo que hacía con la guarda de datos
  // como única defensa.
  const canRenew = (mb, plan) => plan && !mb?.courtesy
    && ['monthly', 'quarterly', 'annual', 'custom'].includes(plan.recurrence);


  const member = data.members.find((m) => m.id === memberId);
  if (!member) return null;

  const memberships = data.memberships.filter((mb) => mb.memberId === memberId);
  const planFor = (mb) => data.membershipPlans.find((p) => p.id === mb.planId);
  const active = memberships.find((mb) => membershipActive(mb, planFor(mb)));
  const loginProfile = data.profiles.find((p) => p.memberId === member.id);
  const personalProgram = data.personalPrograms.find((p) => p.memberId === member.id);

  const openProgram = async () => {
    if (openingProgram) return;
    setOpeningProgram(true);
    try {
      await ensurePersonalProgram(member.id);
      await refresh();
      setShowProgram(true);
    } catch (err) {
      showToast(err.message || 'Could not open the program.');
    } finally {
      setOpeningProgram(false);
    }
  };
  const activePlan = active ? data.membershipPlans.find((p) => p.id === active.planId) : null;
  const history = memberships.filter((mb) => mb !== active).sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  // Most recent lapsed membership (status still 'active' in the DB but past its
  // billing date) — shown so the owner can renew it right from the profile.
  const lapsed = !active
    ? memberships.filter((mb) => mb.status === 'active').map((mb) => ({ mb, plan: planFor(mb), rs: membershipRenewalStatus(mb, planFor(mb)) }))
        .filter((x) => x.rs.state === 'expired').sort((a, b) => (b.mb.startDate || '').localeCompare(a.mb.startDate || ''))[0]
    : null;

  // What their membership is ACTUALLY doing right now. member.status can't
  // answer this — it's stamped 'active' when the member is created and nothing
  // ever changes it, so a profile would read ACTIVE over an expired membership
  // and hide the fact that there's something to act on.
  // Una membresía contratada para arrancar después no está vencida ni activa:
  // está por empezar. Sin este caso la interfaz decía EXPIRED sobre algo que
  // todavía no ha ocurrido, que es lo más confuso de los tres.
  const porEmpezar = memberships.find((mb) => mb.status === 'active' && membershipNotStarted(mb));
  const membershipState = active
    ? (active.cancelAt ? { label: `CANCELLING ${active.cancelAt}`, color: C.goldDeep }
      : active.pause ? { label: 'PAUSED', color: C.goldDeep }
      : { label: 'ACTIVE', color: C.gold })
    : porEmpezar ? { label: `EMPIEZA ${porEmpezar.startDate}`, color: C.gold }
    : lapsed ? { label: 'EXPIRED', color: C.goldDeep }
    : memberships.length ? { label: 'CANCELLED', color: C.moss }
    : { label: 'NO MEMBERSHIP', color: C.moss };



  // Undo a scheduled cancellation before its date arrives.
  const doUncancel = async (mb) => {
    try { await uncancelMembership(mb); await refresh(); showToast('Cancellation undone — the membership continues.'); }
    catch (err) { showToast(err.message || 'Could not undo.'); }
  };

  const doResume = async (id) => {
    try {
      await resumeMembership(id);
      await refresh();
      showToast('Membership resumed.');
    } catch (err) {
      showToast(err.message || 'Could not resume.');
    }
  };

  const setMemberRole = (newRole) => {
    if (!loginProfile) return;
    const roleDef = data.roles.find((r) => r.name === newRole);
    const detail = newRole === 'owner' ? 'Full access — everything, including role assignment.'
      : newRole === 'client' ? 'Client access only — their own profile, training and progress.'
      : `Access to: ${(roleDef?.permissions || []).join(', ') || 'nothing yet'}.`;
    askConfirm({
      message: `Change ${member.name.split(' ')[0]}'s role to ${(roleDef?.label || newRole).toUpperCase()}?`,
      detail,
      confirmLabel: `MAKE ${(roleDef?.label || newRole).toUpperCase()}`,
      danger: newRole === 'owner',
      onConfirm: async () => {
        try { await changeRole(loginProfile.id, newRole); await refresh(); showToast(`Now ${newRole}.`); }
        catch (err) { showToast(err.message || 'Could not change the role.'); }
      },
    });
  };

  const removeMember = () => {
    const hasActive = memberships.some((mb) => membershipActive(mb, planFor(mb)));
    askConfirm({
      message: `Delete ${member.name}?`,
      detail: `This permanently removes their profile, memberships, reservations, training logs and programs${loginProfile ? ', and their login' : ''}. Past payments are kept for your books.${hasActive ? ' Any active Stripe subscription will be canceled.' : ''} This cannot be undone.`,
      confirmLabel: 'DELETE MEMBER',
      danger: true,
      onConfirm: async () => {
        try {
          const warnings = await deleteMember(member.id, loginProfile?.id);
          await refresh();
          showToast(warnings.length ? warnings.join(' ') : `${member.name.split(' ')[0]} deleted.`);
          onBack();
        } catch (err) { showToast(err.message || 'Could not delete the member.'); }
      },
    });
  };

  const removeLogin = () => {
    if (!loginProfile) return;
    askConfirm({
      message: `Remove ${member.name.split(' ')[0]}'s login?`,
      detail: 'Their login stops working. The member profile and history stay intact.',
      confirmLabel: 'REMOVE LOGIN',
      onConfirm: async () => {
        try { await deleteUser(loginProfile.id); await refresh(); showToast('Login removed.'); }
        catch (err) { showToast(err.message || 'Could not remove the login.'); }
      },
    });
  };

  return (
    <div className="p-4 md:p-10 anim-fade">
      {/* Back */}
      <button onClick={onBack} className="mono flex items-center gap-1 mb-5" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
        <ChevronRight size={12} style={{ transform: 'rotate(180deg)' }} /> BACK TO MEMBERS
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-4">
          <Avatar member={member} size={64} fontSize={24} />
          <div>
            <div className="serif-italic" style={{ fontSize: '40px', color: C.ink }}>{member.name}</div>
            <div className="flex items-center gap-2 mt-2">
              <span className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: membershipState.color }}>
                · {membershipState.label}
              </span>
              <span className="mono" style={{ fontSize: '11px', color: C.moss }}>JOINED {member.joinDate}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs — horizontally scrollable so they never get cut off on mobile */}
      <div className="flex gap-1 mb-6 overflow-x-auto scrollbar-thin" style={{ WebkitOverflowScrolling: 'touch' }}>
        {[
          { id: 'membership', label: 'MEMBERSHIP' },
          { id: 'program', label: 'PROGRAM' },
          { id: 'nutrition', label: 'NUTRITION' },
          { id: 'profile', label: 'PROFILE' },
          { id: 'account', label: 'ACCOUNT' },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className="mono px-4 py-2 flex-shrink-0"
            style={{ fontSize: '11px', letterSpacing: '0.1em', background: tab === t.id ? C.gold : C.cream, color: tab === t.id ? C.bone : C.moss, border: `1px solid ${C.charcoal}20` }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'program' && (
        <div className="p-6" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
          <div className="mono mb-4" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.moss }}>1-ON-1 PERSONAL PROGRAM</div>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="prog-name" style={{ fontSize: '24px', color: C.ink }}>{personalProgram?.name || 'Personal Program'}</div>
              <div className="mono mt-1" style={{ fontSize: '12px', color: C.moss }}>
                {personalProgram
                  ? `${personalProgram.schedule.length} day${personalProgram.schedule.length === 1 ? '' : 's'} · ${personalProgram.workouts.length} workout${personalProgram.workouts.length === 1 ? '' : 's'}`
                  : 'Not set up yet — fully tailored, embedded workouts.'}
              </div>
            </div>
            <Btn onClick={openProgram} disabled={openingProgram}>{openingProgram ? 'OPENING…' : personalProgram ? 'EDIT PROGRAM' : 'SET UP PROGRAM'}</Btn>
          </div>
        </div>
      )}

      {tab === 'nutrition' && <NutritionEditor member={member} />}

      {tab === 'profile' && <MemberProfileForm key={member.id} member={member} />}

      {tab === 'account' && (
        <div className="space-y-4">
        <div className="p-6" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
          <div className="mono mb-4" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.moss }}>LOGIN ACCOUNT</div>
          {loginProfile ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="ui-strong" style={{ fontSize: '22px', color: C.ink }}>Login active.</div>
                  <div className="mono mt-1" style={{ fontSize: '12px', color: C.moss }}>{loginProfile.email} · {(loginProfile.role || '').toUpperCase()}</div>
                </div>
                <span className="mono px-3 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.forest, color: C.ink }}>● CAN SIGN IN</span>
              </div>
              {isOwner && (
                <div className="pt-3" style={{ borderTop: `1px solid ${C.charcoal}15` }}>
                  <div className="mono mb-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.sand }}>ROLE</div>
                  <div className="flex gap-1 flex-wrap">
                    {data.roles.map((r) => {
                      const active = loginProfile.role === r.name;
                      const bg = r.name === 'owner' ? C.gold : r.name === 'coach' ? C.forest : r.name === 'client' ? C.moss : C.navy;
                      return (
                        <button key={r.id} onClick={() => !active && setMemberRole(r.name)} disabled={active} className="mono px-3 py-1.5"
                          style={{ fontSize: '11px', letterSpacing: '0.1em', background: active ? bg : 'transparent', color: active ? (r.name === 'owner' ? C.ink : C.bone) : C.moss, border: `1px solid ${C.charcoal}30`, cursor: active ? 'default' : 'pointer' }}>
                          {(r.label || r.name).toUpperCase()}
                        </button>
                      );
                    })}
                    <button onClick={() => setShowResetPw(true)} className="mono px-3 py-1.5 ml-auto" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.cream, color: C.gold }}>🔑 RESET PASSWORD</button>
                    <button onClick={removeLogin} className="mono px-3 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.sand, color: C.bone }}>REMOVE LOGIN</button>
                  </div>
                  <div className="help mt-2" style={{ fontSize: '13px', color: C.moss }}>— change what this member can access, reset their password, or remove their login.</div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="ui-strong" style={{ fontSize: '22px', color: C.ink }}>No login yet.</div>
                <div className="help mt-1" style={{ fontSize: '15px', color: C.goldDeep }}>— create an account so {member.name.split(' ')[0]} can sign in from their phone.</div>
              </div>
              <Btn onClick={() => setShowCreateLogin(true)}>CREATE LOGIN</Btn>
            </div>
          )}
        </div>

        <GuardianCard member={member} />

        {isOwner && (
          <div className="p-6" style={{ background: C.cream, border: `1px solid ${C.gold}` }}>
            <div className="mono mb-4" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.goldDeep }}>DANGER ZONE</div>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="ui-strong" style={{ fontSize: '22px', color: C.ink }}>Delete this member.</div>
                <div className="help mt-1" style={{ fontSize: '15px', color: C.moss }}>— removes their profile, memberships, logs & programs for good. Past payments stay on the books.</div>
              </div>
              <button onClick={removeMember} className="mono px-4 py-3" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.cream, color: C.gold }}>DELETE MEMBER</button>
            </div>
          </div>
        )}
        </div>
      )}

      {tab === 'membership' && (
        <div className="space-y-4">
          {/* Current membership */}
          {active && activePlan ? (
            <div className="p-6" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.goldDeep }}>CURRENT MEMBERSHIP</div>
                  <div className="prog-name" style={{ fontSize: '28px' }}>{activePlan.name}</div>
                  <div className="flex items-baseline gap-2 mt-1">
                    {active.courtesy ? (
                      <span className="mono px-2.5 py-1" style={{ fontSize: '12px', letterSpacing: '0.1em', fontWeight: 700, background: C.gold, color: C.bone }}>CORTESÍA · SIN COBRO</span>
                    ) : (
                      <>
                        <span className="display" style={{ fontSize: '28px', fontWeight: 600 }}>${effectiveMembershipPrice(active, activePlan)}</span>
                        <span className="mono" style={{ fontSize: '12px', color: C.moss }}>{isDayPassPlan(activePlan) ? '· day pass' : `/ ${activePlan.recurrence}`}</span>
                      </>
                    )}
                    {discountLabel(active.discount) && (
                      <span className="mono px-2 py-0.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.gold, color: C.bone }}>{discountLabel(active.discount)}</span>
                    )}
                  </div>
                </div>
                <Btn variant="ghost" onClick={() => setShowAssign(true)}>CHANGE PLAN</Btn>
              </div>

              {/* Una cortesía no se cobra, así que ni el ciclo ni el compromiso
                  significan nada: el plan trae esos datos, pero a esta persona
                  no se le aplican. Mostrarlos hacía que el perfil prometiera un
                  cobro y un plazo que no existen. */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 mono" style={{ fontSize: '12px' }}>
                <Stat label="START" value={active.startDate} />
                {active.courtesy ? (
                  <>
                    <Stat label="NEXT BILLING" value="— sin cobro —" />
                    <Stat label="COMMITMENT" value="— sin compromiso —" />
                    <Stat label="STATUS" value={active.pause ? `PAUSED ${active.pause.from}${active.pause.to ? ` → ${active.pause.to}` : ' →…'}` : 'CORTESÍA · INDEFINIDA'} />
                  </>
                ) : (
                  <>
                    <Stat label={isDayPassPlan(activePlan) ? 'VALID' : 'NEXT BILLING'} value={isDayPassPlan(activePlan) ? `${active.startDate} only` : (active.pause ? '— paused —' : active.nextBilling || 'one-time')} />
                    <Stat label="COMMITMENT" value={(() => { const i = commitmentInfo(active, activePlan); return i.monthsRequired > 0 ? `${i.monthsElapsed}/${i.monthsRequired} mo ${i.locked ? '· LOCKED' : '· CLEARED'}` : 'no lock'; })()} />
                    <Stat label={active.endDate ? 'ENDS ON' : 'STATUS'} value={active.endDate || (active.pause ? `PAUSED ${active.pause.from}${active.pause.to ? ` → ${active.pause.to}` : ' →…'}` : active.status.toUpperCase())} />
                  </>
                )}
              </div>
              {active.cancelAt && (
                <div className="mt-4 p-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: `${C.gold}20`, border: `1px solid ${C.gold}` }}>
                  <div>
                    <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.ink }}>CANCELLING</div>
                    <div className="text-sm mt-0.5" style={{ color: C.ink }}>
                      Billing has stopped. Access runs through <strong>{active.cancelAt}</strong>.
                    </div>
                  </div>
                  <Btn variant="ghost" onClick={() => doUncancel(active)}>↺ KEEP IT</Btn>
                </div>
              )}
              {active.notes && <div className="help mt-3" style={{ fontSize: '15px', color: C.moss }}>— {active.notes}</div>}

              <div className="flex gap-2 mt-5 flex-wrap">
                {active.pause ? (
                  <>
                    <Btn variant="gold" onClick={() => doResume(active.id)}>↺ RESUME</Btn>
                    <Btn variant="ghost" onClick={() => setPauseTarget(active)}>EDIT PAUSE</Btn>
                  </>
                ) : (
                  <Btn variant="ghost" onClick={() => setPauseTarget(active)}>PAUSE</Btn>
                )}
                {canRenew(active, activePlan) && !active.pause && <Btn variant="gold" onClick={() => doRenew(active, activePlan)} disabled={renewing}>{renewing ? 'RENEWING…' : '↻ RENEW +1 CYCLE'}</Btn>}
                {!active.cancelAt && <Btn variant="gold" onClick={() => setCancelTarget({ membership: active, plan: activePlan })}>CANCEL</Btn>}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
              <div className="ui-strong" style={{ fontSize: '24px', color: C.ink }}>{lapsed ? 'Membership expired.' : 'No active membership.'}</div>
              {lapsed
                ? <div className="help mt-2 mb-5" style={{ fontSize: '16px', color: C.goldDeep }}>— {lapsed.plan.name} lapsed {lapsed.rs.date}. Renew to reactivate, or assign a new plan.</div>
                : <div className="help mt-2 mb-5" style={{ fontSize: '16px', color: C.goldDeep }}>— assign a plan to set their standard.</div>}
              <div className="flex justify-center gap-2 flex-wrap">
                {lapsed && canRenew(lapsed.mb, lapsed.plan) && <Btn variant="gold" onClick={() => doRenew(lapsed.mb, lapsed.plan)} disabled={renewing}>{renewing ? 'RENEWING…' : '↻ RENEW'}</Btn>}
                <Btn icon={Plus} onClick={() => setShowAssign(true)}>ASSIGN PLAN</Btn>
                {/* A lapsed membership is still 'active' in the DB, so it was
                    only cancellable from the Memberships screen. Now it's here. */}
                {lapsed && <Btn variant="ghost" onClick={() => setCancelTarget({ membership: lapsed.mb, plan: lapsed.plan })}>CANCEL</Btn>}
              </div>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
              <div className="mono px-4 py-2.5" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss, borderBottom: `1px solid ${C.charcoal}20` }}>PAST MEMBERSHIPS</div>
              {history.map((mb) => {
                const plan = data.membershipPlans.find((p) => p.id === mb.planId);
                // A lapsed row still reads 'active' in the DB — say EXPIRED, so
                // the history doesn't look like two memberships are running.
                const state = mb.status === 'active' && membershipNotStarted(mb)
                  ? `EMPIEZA ${mb.startDate}`
                  : mb.courtesy && mb.status === 'active'
                    ? 'CORTESÍA'
                    : (mb.status === 'active' && !membershipActive(mb, plan) ? 'EXPIRED' : (mb.status || '').toUpperCase());
                return (
                  <div key={mb.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.charcoal}10` }}>
                    <div className="prog-name" style={{ fontSize: '17px' }}>{plan?.name || '— plan removed —'}</div>
                    <div className="mono" style={{ fontSize: '11px', color: state === 'CORTESÍA' ? C.gold : C.moss, fontWeight: state === 'CORTESÍA' ? 700 : 400 }}>{state.startsWith('EMPIEZA') ? state : `${state} · ${mb.startDate}`}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showAssign && <AssignPlanModal memberId={member.id} onClose={() => setShowAssign(false)} />}
      {pauseTarget && <PauseMembershipModal membership={pauseTarget} onClose={() => setPauseTarget(null)} />}
      {cancelTarget && <CancelMembershipModal membership={cancelTarget.membership} plan={cancelTarget.plan} onClose={() => setCancelTarget(null)} />}
      {showCreateLogin && <CreateLoginModal member={member} onClose={() => setShowCreateLogin(false)} />}
      {showResetPw && loginProfile && <ChangePasswordModal userId={loginProfile.id} memberName={member.name} onClose={() => setShowResetPw(false)} />}
      {showProgram && <PersonalProgramEditor memberId={member.id} onClose={() => setShowProgram(false)} />}
    </div>
  );
}

// ============================================================
//  GUARDIAN CARD — who reaches this member's account. A child with no email of
//  their own can't hold a login; attaching them to a parent lets THAT parent's
//  login switch into the child's training, classes and progress. Kept one level
//  deep: a dependent never carries dependents.
// ============================================================
function GuardianCard({ member }) {
  const { data, refresh } = useData();
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [saving, setSaving] = useState(false);

  const guardian = member.guardianId ? data.members.find((m) => m.id === member.guardianId) : null;
  const dependents = data.members.filter((m) => m.guardianId === member.id);
  const hasLogin = (m) => data.profiles.some((p) => p.memberId === m.id);
  // Only someone with a login can actually reach a dependent, and a dependent
  // can't be a guardian in turn.
  const candidates = data.members
    .filter((m) => m.id !== member.id && !m.guardianId && hasLogin(m))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => ({ id: m.id, label: m.name }));

  const save = async (guardianId, msg) => {
    if (saving) return;
    setSaving(true);
    try { await setGuardian(member.id, guardianId); await refresh(); showToast(msg); }
    catch (err) { showToast(err.message || 'Could not update the guardian.'); }
    finally { setSaving(false); }
  };

  const detach = () => askConfirm({
    message: `Detach ${member.name.split(' ')[0]} from ${guardian?.name || 'their guardian'}?`,
    detail: 'Their guardian stops seeing this account. Nothing else changes — memberships, programs and history stay put.',
    confirmLabel: 'DETACH',
    onConfirm: () => save(null, 'Detached.'),
  });

  const first = member.name.split(' ')[0];

  return (
    <div className="p-6" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
      <div className="mono mb-4" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.moss }}>GUARDIAN & DEPENDENTS</div>

      {guardian ? (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar member={guardian} size={40} />
            <div className="min-w-0">
              <div className="ui-strong" style={{ fontSize: '22px', color: C.ink }}>Dependent of {guardian.name}.</div>
              <div className="help mt-0.5" style={{ fontSize: '15px', color: C.goldDeep }}>
                — {guardian.name.split(' ')[0]} can switch into {first}&rsquo;s account from their own login.
              </div>
            </div>
          </div>
          <button onClick={detach} disabled={saving} className="mono px-4 py-3 flex-shrink-0"
            style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.sand, color: C.bone }}>
            {saving ? '…' : 'DETACH'}
          </button>
        </div>
      ) : dependents.length === 0 ? (
        <div>
          <div className="ui-strong" style={{ fontSize: '22px', color: C.ink }}>Not a dependent.</div>
          <div className="help mt-1 mb-4" style={{ fontSize: '15px', color: C.goldDeep }}>
            — if {first} can&rsquo;t have their own email, attach them to the adult who brings them.
          </div>
          <SearchSelect value="" onChange={(id) => save(id, 'Guardian set.')} options={candidates}
            placeholder="Search the responsible adult…" emptyText="No member with a login matches" />
          <div className="mono mt-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
            ONLY MEMBERS WITH A LOGIN ARE LISTED — A GUARDIAN NEEDS ONE TO SIGN IN
          </div>
        </div>
      ) : null}

      {dependents.length > 0 && (
        <div className={guardian ? 'mt-5 pt-4' : ''} style={guardian ? { borderTop: `1px solid ${C.charcoal}15` } : undefined}>
          <div className="mono mb-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
            RESPONSIBLE FOR {dependents.length} {dependents.length === 1 ? 'PERSON' : 'PEOPLE'}
          </div>
          <div className="flex flex-wrap gap-2">
            {dependents.map((d) => (
              <div key={d.id} className="flex items-center gap-2 px-3 py-2" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
                <Avatar member={d} size={26} fontSize={11} />
                <span className="ui-strong" style={{ fontSize: '16px', color: C.ink }}>{d.name}</span>
              </div>
            ))}
          </div>
          <div className="help mt-2" style={{ fontSize: '14px', color: C.moss }}>
            — {first} sees these accounts from the switcher in their own menu.
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ color: C.moss, letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ fontWeight: 600, color: C.ink, marginTop: 2 }}>{value}</div>
    </div>
  );
}
