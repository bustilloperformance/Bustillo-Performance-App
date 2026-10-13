import { useMemo, useState } from 'react';
import { Globe } from 'lucide-react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast } from '../../components/feedback';
import { setGoalCompleted } from '../../data/progress';
import { goalsFor } from '../../lib/goals';
import StripeCheckoutModal from '../../components/StripeCheckoutModal';
import CheckInForm from '../checkin/CheckInForm';
import { checkInWindow, weekLabel, deadlineLabel } from '../../lib/checkIn';
import { effectiveMembershipPrice, todayISO, membershipActive, setMetric, lbToKgDisplay, recurrenceLabel, planTermsLine } from '../../lib/helpers';
import { Avatar, Btn, Modal } from '../../components/ui';
import { ContentView } from '../../components/RichContent';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SCOPES = [['month', 'MONTH'], ['year', 'YEAR'], ['all', 'ALL']];

// Volume runs into six figures fast and the hero number is huge, so anything
// past a thousand gets shortened rather than wrapped.
function compact(n) {
  if (!n) return '0';
  if (n < 1000) return String(Math.round(n));
  if (n < 1000000) return `${Math.round(n / 100) / 10}k`;
  return `${Math.round(n / 100000) / 10}M`;
}

// ============================================================
//  CLIENT HOME — the signed-in member's dashboard landing screen.
//  Reads via useData(): stats (credits/points/workouts), active plan &
//  goals, weekly check-in; subscribes to
//  plans via StripeCheckoutModal. The only write is marking a goal hit.
// ============================================================
export default function ClientHome({ clientMemberId, setView }) {
  const { data, refresh } = useData();
  const today = todayISO();
  const showToast = useToast();
  const [checkout, setCheckout] = useState(null);
  const [planDetail, setPlanDetail] = useState(null);
  const [scope, setScope] = useState('month');
  const [goalBusy, setGoalBusy] = useState(null);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const me = data.members.find((m) => m.id === clientMemberId);

  // El domingo cierra la semana y el formulario sigue abierto hasta el martes:
  // quien entrena el sábado y descansa el domingo no debe perder la semana por
  // no haber abierto la app ese día. checkInWindow() archiva las respuestas
  // tardías bajo la semana que TERMINÓ, no bajo la que apenas empieza.
  const ci = checkInWindow(today);
  const ciWeek = ci.weekStart;
  const ciDone = data.checkIns.find((c) => c.memberId === me?.id && c.weekStart === ciWeek);
  // Solo mientras la ventana está abierta. Hubo una vista previa para staff
  // mientras se construía la tarjeta; ya no hace falta.
  const showCheckInCard = ci.open;


  // measure per exercise, for setMetric's legacy fallback on older logs.
  const exMeasure = useMemo(() => {
    const m = new Map();
    data.exercises.forEach((e) => m.set(e.id, e.measure));
    return m;
  }, [data.exercises]);

  const goals = goalsFor(data, clientMemberId);
  const markGoalDone = async (g) => {
    if (goalBusy) return;
    setGoalBusy(g.id);
    try {
      await setGoalCompleted(clientMemberId, g.id, me.goals, true);
      await refresh();
      showToast(`${g.metric} — goal hit. Well done.`);
    } catch (err) { showToast(err.message || 'Could not update the goal.'); }
    finally { setGoalBusy(null); }
  };

  const subscribe = (planId) => { setPlanDetail(null); setCheckout({ kind: 'membership', planId, memberId: clientMemberId }); };
  const planHasPage = (p) => (p.content && p.content.length) || p.description;

  if (!me) return null;

  const myLogs = data.workoutLogs.filter((w) => w.memberId === me.id);
  const myMembership = data.memberships.find((mb) => mb.memberId === me.id && membershipActive(mb, data.membershipPlans.find((p) => p.id === mb.planId)));
  const myPlan = myMembership ? data.membershipPlans.find((p) => p.id === myMembership.planId) : null;

  // Renewal label.
  let renew = null;
  if (myMembership?.nextBilling) {
    const [by, bm, bd] = myMembership.nextBilling.split('-').map(Number);
    const pretty = `${MONTHS[bm - 1]} ${bd}, ${by}`;
    const daysOut = Math.round((new Date(myMembership.nextBilling) - new Date(today)) / 86400000);
    const isRecurring = myPlan && myPlan.recurrence !== 'one-time';
    renew = { label: isRecurring ? 'RENEWS' : 'EXPIRES', detail: daysOut < 0 ? `was due ${pretty}` : daysOut === 0 ? 'today' : `${pretty} · ${daysOut}d`, urgent: daysOut <= 7 };
  }

  return (
    <div className="px-4 md:px-10 pt-3 md:pt-5 pb-4 md:pb-10 anim-fade">
      {/* Kept tight on purpose: the numbers and the routine button have to
          clear the fold on a phone, and a greeting shouldn't eat that space. */}
      <div className="mb-3 md:mb-6">
        <div className="mono mb-1.5 md:mb-2" style={{ fontSize: '12px', letterSpacing: '0.14em', color: C.goldDeep }}>— WELCOME BACK</div>
        <div style={{ borderTop: `1px solid ${C.charcoal}30`, paddingTop: '12px' }} className="flex items-center justify-between gap-4">
          <div className="serif-italic min-w-0" style={{ fontSize: 'clamp(36px,8vw,70px)', color: C.ink }}>{me.name.split(' ')[0]}<span style={{ color: C.goldDeep }}>.</span></div>
          <button onClick={() => setView('client-profile')} className="flex flex-col items-center gap-1.5 group flex-shrink-0">
            <Avatar member={me} size={52} fontSize={22} />
            <div className="mono group-hover:underline whitespace-nowrap" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.goldDeep }}>✎ EDIT</div>
          </button>
        </div>
      </div>

      {/* Stats hero — what they've actually done, over a window they pick.
          Credits only for in-person plans (not online / no plan). */}
      {(() => {
      const year = today.slice(0, 4);
      const month = today.slice(0, 7);
      const inScope = (iso) => !iso || scope === 'all' || (scope === 'year' ? iso.startsWith(year) : iso.startsWith(month));

      const scopedLogs = myLogs.filter((l) => inScope(l.date));
      // Volume = Σ weight × reps. The log panel normalizes every saved weight to
      // pounds, so the sum is in lb and only the display converts. Bodyweight
      // sets carry no load, so they add nothing.
      const volumeLb = scopedLogs.reduce((total, log) => total + (log.sets || []).reduce((sum, st) => {
        const w = setMetric(st, 'weight', exMeasure.get(st.exerciseId));
        const r = setMetric(st, 'reps', exMeasure.get(st.exerciseId));
        return sum + (w > 0 && r > 0 ? w * r : 0);
      }, 0), 0);
      const useKg = (() => { try { return localStorage.getItem(`fw-weight-unit-${me.id}`) === 'kg'; } catch { return false; } })();

      const stats = [];
      stats.push({ l: 'WORKOUTS', v: scopedLogs.length, c: C.cream });
      stats.push({ l: useKg ? 'KG LIFTED' : 'LB LIFTED', v: compact(useKg ? lbToKgDisplay(volumeLb) : volumeLb), c: C.cream });

      const cols = stats.length >= 4 ? 'grid-cols-2 md:grid-cols-4' : stats.length === 3 ? 'grid-cols-3' : 'grid-cols-2';
      const size = stats.length >= 4 ? 'clamp(42px,7.5vw,62px)' : 'clamp(48px,9vw,78px)';
      return (
      <div className="p-5 md:p-6 mb-3 md:mb-4" style={{ background: C.cream, color: C.ink }}>
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.14em', color: C.gold }}>— YOUR NUMBERS</div>
          <div className="flex gap-1">
            {SCOPES.map(([k, l]) => (
              <button key={k} onClick={() => setScope(k)} className="mono px-2.5 py-1"
                style={{ fontSize: '11px', letterSpacing: '0.1em', background: scope === k ? C.gold : 'transparent', color: scope === k ? C.ink : C.sand, border: `1px solid ${scope === k ? C.gold : C.moss}` }}>{l}</button>
            ))}
          </div>
        </div>
        <div className={`grid gap-6 ${cols}`}>
          {stats.map((s) => (
            <div key={s.l}>
              <div className="mono mb-2" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.sand, fontWeight: 600 }}>{s.l}</div>
              <div className="stat-num" style={{ fontSize: size, color: s.c }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>
      );
      })()}

      {/* Open My Training */}
      <button onClick={() => setView('client-workouts')} className="w-full text-left p-5 md:p-6 mb-4 transition-all hover:opacity-95" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        <div className="mono mb-1 flex items-center gap-1.5" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.goldDeep }}><Globe size={11} /> — GO TO MY TRAINING</div>
        <div className="serif-italic mb-2" style={{ fontSize: '32px' }}>Open your routine.</div>
        <div className="hand" style={{ fontSize: '17px', color: C.moss }}>— mira qué tienes activo y registra tus sesiones →</div>
      </button>

      {/* El check-in semanal, debajo de la rutina. Estaba arriba del calendario
          de entrenamiento, donde aparecía encima de la rutina que el cliente
          venía a abrir: es un recordatorio, no lo que vino a hacer. Aquí lo ve
          al entrar y no le estorba cuando ya está entrenando.

          Las dos variantes de fondo son superficies oscuras, así que el texto
          va claro en las dos. Antes `navy` era el fondo oscuro y `bone` el
          texto claro; al invertir la app esos dos papeles se cambiaron. */}
      {showCheckInCard && (
        <button onClick={() => setShowCheckIn(true)} className="w-full text-left p-5 md:p-6 mb-4 transition-all hover:opacity-95"
          style={{ background: ciDone ? C.cream : C.navy, color: C.ink, border: `2px solid ${C.gold}` }}>
          <div className="mono mb-1.5" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.gold, fontWeight: 700 }}>
            {ciDone ? '✓ CHECK-IN ENVIADO'
              : ci.late ? 'TE FALTA TU CHECK-IN' : 'CHECK-IN SEMANAL'}
          </div>
          <div className="serif-italic mb-2" style={{ fontSize: 'clamp(26px,6.5vw,30px)',
            textWrap: 'balance', color: ciDone ? C.ink : C.cream }}>
            {ciDone ? 'Gracias por tu check-in.'
              : ci.late ? 'Aún estás a tiempo.' : 'Cuéntame cómo te fue.'}
          </div>
          <div style={{ fontSize: '15px', lineHeight: 1.45, color: ciDone ? C.moss : C.sand }}>
            {ciDone ? 'Toca para revisar o corregir tus respuestas.'
              : `Semana ${weekLabel(ciWeek)}. Son 3 minutos, y tus respuestas ajustan tu entrenamiento.`}
          </div>
          {!ciDone && (
            <div className="mono mt-3" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.gold, fontWeight: 700 }}>
              DISPONIBLE HASTA EL {deadlineLabel(ciWeek).toUpperCase()}
            </div>
          )}
        </button>
      )}

      {/* Plan + weekly */}
      <div className="p-6 mb-4" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        {myPlan ? (
          <>
            <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
              <div>
                <div className="mono mb-1" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.goldDeep }}>— YOUR PLAN</div>
                <div className="prog-name" style={{ fontSize: '34px', color: C.ink }}>{myPlan.name}</div>
              </div>
              <div className="text-right">
                {/* Una cortesía no ve precio ni ciclo: no se le cobra, y
                    enseñarle una tarifa que nunca va a pagar solo confunde. */}
                {myMembership?.courtesy ? (
                  <div className="mono px-2 py-1" style={{ fontSize: '12px', letterSpacing: '0.1em', fontWeight: 700, background: C.gold, color: C.bone }}>CORTESÍA</div>
                ) : (
                  <div className="mono" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.moss }}>${effectiveMembershipPrice(myMembership, myPlan, 2)} · {recurrenceLabel(myPlan).toUpperCase()}</div>
                )}
                {renew && <div className="mono mt-1" style={{ fontSize: '12px', letterSpacing: '0.1em', color: renew.urgent ? C.gold : C.moss }}>{renew.label} · {renew.detail}</div>}
                {myMembership?.pause && <div className="mono mt-1" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.goldDeep }}>❚❚ PAUSED</div>}
              </div>
            </div>
              <div className="p-4" style={{ background: C.cream, color: C.ink, borderLeft: `3px solid ${C.gold}` }}>
                <div className="mono mb-1" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.gold }}>☁ 1-ON-1 · PERSONAL PROGRAM</div>
                <div className="hand" style={{ fontSize: '17px', color: C.sand }}>— tu entrenamiento es a tu medida. abre My Training para ver la semana.</div>
              </div>
          </>
        ) : (
          <>
            <div className="mono mb-1" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.goldDeep }}>— NO MEMBERSHIP YET</div>
            <div className="serif-italic mb-3" style={{ fontSize: '32px', color: C.ink }}>Get on a plan.</div>
            {(() => {
              const listed = data.membershipPlans.filter((p) => p.listed);
              if (listed.length === 0) return <div className="hand" style={{ fontSize: '17px', color: C.moss }}>— Josean te asigna un plan y tus sesiones aparecen aquí.</div>;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {listed.map((p) => (
                    <div key={p.id} onClick={() => planHasPage(p) && setPlanDetail(p)} className="p-4 flex items-center justify-between gap-3" style={{ background: C.bone, border: `1px solid ${C.charcoal}20`, cursor: planHasPage(p) ? 'pointer' : 'default' }}>
                      <div className="min-w-0">
                        <div className="prog-name" style={{ fontSize: '20px', color: C.ink, lineHeight: 1.1 }}>{p.name}</div>
                        <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>${p.price} / {recurrenceLabel(p)}</div>
                        {planHasPage(p) && <div className="mono mt-1" style={{ fontSize: '10px', letterSpacing: '0.1em', color: C.goldDeep }}>▸ TAP FOR DETAILS</div>}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); subscribe(p.id); }} className="mono px-3 py-2 flex-shrink-0" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.cream, color: C.gold }}>
                        SUBSCRIBE →
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div className="help mt-3" style={{ fontSize: '13px', color: C.moss }}>— secure checkout by Stripe. you can cancel anytime.</div>
          </>
        )}
      </div>

      {/* Goals — what they're chasing, with the bar filling as they log. Marking
          one hit from here means the win gets recorded the moment it happens,
          instead of waiting until they next open Track Progress. */}
      {(goals.active.length > 0 || goals.done.length > 0) && (
        <div className="p-6 mb-4" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
          <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
            <div className="mono" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.goldDeep }}>— YOUR GOALS</div>
            {goals.done.length > 0 && (
              <button onClick={() => setView('client-results')} className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.gold, fontWeight: 600 }}>
                ✓ {goals.done.length} ACHIEVED →
              </button>
            )}
          </div>

          {goals.active.length === 0
            ? <div className="ui-strong" style={{ fontSize: '20px', color: C.moss }}>Cumpliste todas tus metas. Pídele la siguiente a Josean.</div>
            : goals.active.map((g) => (
              <div key={g.id} className="mb-4 last:mb-0">
                {/* flex-1 with a floor, not a bare min-w-0: without it the text
                    block shrank under the button group and the goal name broke
                    one word per line down a sliver of a column. Below the floor
                    the buttons wrap to their own row instead. */}
                <div className="flex justify-between items-baseline gap-3 mb-2 flex-wrap">
                  <div className="flex-1 min-w-0" style={{ flexBasis: '60%' }}>
                    <div className="ui-strong leading-tight" style={{ fontSize: '21px', color: C.ink }}>{g.metric}</div>
                    <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
                      TARGET {g.target}{g.unit}{g.deadline ? ` · BY ${g.deadline}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                    {g.tracked && (
                      <div className="mono" style={{ fontSize: '19px', fontWeight: 600, color: C.ink }}>
                        {g.current}<span style={{ fontSize: '11px', color: C.moss }}>{g.unit}</span>
                      </div>
                    )}
                    <button onClick={() => markGoalDone(g)} disabled={goalBusy === g.id} className="mono px-2.5 py-1.5"
                      style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.forest, color: C.ink, opacity: goalBusy === g.id ? 0.5 : 1 }}>
                      {goalBusy === g.id ? '…' : '✓ DONE'}
                    </button>
                  </div>
                </div>
                {/* No bar for a goal the app can't measure — an empty one reads
                    as "you've made no progress" instead of "not tracked here". */}
                {g.tracked && (
                  <div className="h-2" style={{ background: C.bone }}>
                    <div className="h-full" style={{ width: `${g.pct}%`, background: g.pct >= 50 ? C.forest : C.gold, transition: 'width 0.3s' }} />
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {checkout && <StripeCheckoutModal args={checkout} title="Subscribe" onClose={() => setCheckout(null)} />}

      {planDetail && (
        <Modal title={planDetail.name} eyebrow="MEMBERSHIP PLAN" onClose={() => setPlanDetail(null)} size="lg">
          <div className="space-y-4">
            <div className="mono" style={{ fontSize: '13px', letterSpacing: '0.1em', color: C.gold }}>${planDetail.price} / {recurrenceLabel(planDetail)}</div>
            {/* Same line Stripe shows above its pay button — nobody should meet
                a minimum term for the first time on the payment page. */}
            {planTermsLine(planDetail) && (
              <div className="mono px-3 py-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.ink, background: C.cream, border: `1px solid ${C.charcoal}20` }}>
                {planTermsLine(planDetail).toUpperCase()}
              </div>
            )}
            {planDetail.description && <div className="text-sm" style={{ color: C.charcoal, whiteSpace: 'pre-wrap' }}>{planDetail.description}</div>}
            <ContentView content={planDetail.content} />
            <div className="flex justify-end pt-3" style={{ borderTop: `1px solid ${C.charcoal}20` }}>
              <Btn onClick={() => subscribe(planDetail.id)}>SUBSCRIBE →</Btn>
            </div>
          </div>
        </Modal>
      )}

      {showCheckIn && (
        <CheckInForm memberId={me.id} weekStart={ciWeek} existing={ciDone} onClose={() => setShowCheckIn(false)} />
      )}
    </div>
  );
}
