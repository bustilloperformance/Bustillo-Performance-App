import { useState, useEffect } from 'react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { fmtISO, todayISO, parseLocalDate, hasTrainingAccess } from '../../lib/helpers';
import { etiquetaCalendario } from '../../lib/workoutHelpers';
import { PageHeader } from '../../components/ui';
import ParticipantLogPanel from '../logging/ParticipantLogPanel';

// ============================================================
//  CLIENT · MY TRAINING
//  The member's personal program calendar (full routine, embedded) plus any
//  purchased online programs.
// ============================================================


// `coach` = a staff member logging a client's session in person (rendered inside
// the member profile). It drops the client page header, doesn't touch the
// client's own persisted state, and can open/log any day.
export default function ClientWorkouts({ clientMemberId, coach = false, staff = false }) {
  const { data } = useData();
  const today = todayISO();
  const me = data.members.find((m) => m.id === clientMemberId);
  // The open day/routine is persisted so closing or reloading the app keeps the
  // client exactly where they were (their scroll position is restored too).
  // In coach mode we keep it in memory only, so it can't clash with the coach's
  // own client view.
  const [expandedDate, setExpandedDateRaw] = useState(() => { if (coach) return null; try { return localStorage.getItem('fw-client-open') || null; } catch { return null; } });
  const setExpandedDate = (v) => { setExpandedDateRaw(v); if (coach) return; try { if (v) localStorage.setItem('fw-client-open', v); else localStorage.removeItem('fw-client-open'); } catch { /* ignore */ } };
  // El calendario abre siempre en el mes de hoy. Antes recordaba el ultimo mes
  // visitado entre cierres de la app, y quien habia ido a ver octubre se
  // encontraba octubre una semana despues en vez de su semana. PREV/NEXT siguen
  // funcionando mientras la pantalla esta abierta; solo no se guardan.
  const [viewMonth, setViewMonth] = useState(() => { const [y, m] = today.split('-').map(Number); return { year: y, month: m }; });
  // La llave vieja se limpia una vez para no dejar basura en el telefono.
  useEffect(() => { try { localStorage.removeItem('fw-client-month'); } catch { /* ignore */ } }, []);
  const shiftMonth = (delta) => setViewMonth(({ year, month }) => { let m = month + delta, y = year; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return { year: y, month: m }; });

  if (!me) return null;

  const myLog = (workoutId, date) => data.workoutLogs.find((l) => l.memberId === me.id && l.workoutId === workoutId && l.date === date);
  // Coach mode is staff looking at a client, which the DB never gates. Y el
  // staff tampoco se bloquea a sí mismo viéndose como cliente: el dueño entra
  // a su propia rutina aunque no se esté cobrando. La base de datos ya opinaba
  // lo mismo — sus políticas dicen is_staff() OR ... — así que esto solo pone
  // de acuerdo a la app con lo que el servidor ya permitía.
  const lapsed = !coach && !staff && !hasTrainingAccess(data.memberships, data.membershipPlans, me.id);
  // La rutina personal se busca si existe, no si el segmento dice '1on1'. Eran
  // lo mismo hasta que una cancelación limpió el segmento: el programa seguía
  // ahí con sus días agendados y la pantalla lo escondía por un campo que ya no
  // describía la realidad. Si alguien tiene un programa hecho a la medida, es
  // suyo y se le muestra.
  const personalProgram = data.personalPrograms.find((p) => p.memberId === me.id) || null;

  // Purchased online programs (self-paced, week × day grid).
  const onlinePrograms = data.memberPrograms
    .filter((mp) => mp.memberId === me.id && mp.status === 'active')
    .map((mp) => ({ mp, program: data.programs.find((p) => p.id === mp.programId) }))
    .filter((x) => x.program && x.program.mode === 'online');
  const programLog = (workoutId, week, day) => data.workoutLogs.find((l) => l.memberId === me.id && l.workoutId === workoutId && l.programWeek === week && l.programDayNumber === day);

  // ---- Personal program upcoming/recent days ----
  const personalDays = personalProgram
    ? [...personalProgram.schedule].sort((a, b) => a.date.localeCompare(b.date)).map((s) => ({
        date: s.date,
        workout: personalProgram.workouts.find((w) => w.id === s.workoutId),
        logged: myLog(s.workoutId, s.date),
      })).filter((d) => d.workout)
    : [];

  const niceDate = (d) => parseLocalDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();

  return (
    <div className={coach ? 'anim-fade' : 'p-4 md:p-10 anim-fade'}>
      {coach ? (
        <div className="mb-4 px-4 py-3" style={{ background: C.cream, color: C.gold, border: `1px solid ${C.gold}` }}>
          <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em' }}>COACH MODE · LOGGING FOR {(me.name || '').toUpperCase()}</div>
          <div className="help mt-0.5" style={{ fontSize: '13px', color: C.bone }}>— open a day to record their sets & weights.</div>
        </div>
      ) : (
        <PageHeader sectionNo="03" section="CLIENT · TRAINING" title="My Training." subtitle="— no random reps." />
      )}

      {/* Nothing to show. Two very different reasons, and saying "no training
          assigned" to someone whose membership simply lapsed sends them to ask
          you for a routine they already have. The database hides the program
          either way — this only explains which case it is. */}
      {!personalProgram && onlinePrograms.length === 0 && (
        lapsed ? (
          <div className="p-8 text-center" style={{ background: C.cream, border: `2px solid ${C.gold}` }}>
            <div className="mono mb-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.gold }}>MEMBERSHIP LAPSED</div>
            <div className="ui-strong" style={{ fontSize: '24px', color: C.ink }}>Your training is on hold.</div>
            <div className="hand mt-2" style={{ fontSize: '17px', color: C.moss }}>— renueva y tu rutina vuelve justo donde la dejaste. No se borró nada.</div>
            <div className="mono mt-3" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.moss }}>Your logged sessions and progress are still under Track Progress.</div>
          </div>
        ) : (
          <div className="p-8 text-center" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
            <div className="ui-strong" style={{ fontSize: '24px', color: C.ink }}>No training assigned yet.</div>
            <div className="hand mt-2" style={{ fontSize: '17px', color: C.moss }}>— cuando tengas un plan o compres un programa, tus sesiones aparecen aquí.</div>
          </div>
        )
      )}

      {/* Purchased online programs */}
      {onlinePrograms.map(({ mp, program }) => {
        const weeks = {};
        (program.schedule || []).forEach((s) => { if (s.dayNumber) (weeks[s.week] = weeks[s.week] || []).push(s); });
        const ordered = Object.entries(weeks).map(([w, slots]) => ({ week: Number(w), slots: slots.sort((a, b) => a.dayNumber - b.dayNumber) })).sort((a, b) => a.week - b.week);
        const total = (program.schedule || []).filter((s) => s.dayNumber).length;
        const done = (program.schedule || []).filter((s) => s.dayNumber && programLog(s.workoutId, s.week, s.dayNumber)).length;
        return (
          <div key={mp.id} className="mb-5">
            <div className="p-4 mb-2" style={{ background: C.cream, color: C.ink }}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="mono flex items-center gap-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.gold }}>☁ ONLINE PROGRAM</div>
                <div className="mono" style={{ fontSize: '11px', color: C.sand }}>{done}/{total} DONE · {total ? Math.round((done / total) * 100) : 0}%</div>
              </div>
              <div className="prog-name mt-1" style={{ fontSize: '28px', lineHeight: 1.18, color: C.cream }}>{program.name}</div>
            </div>
            {ordered.map(({ week, slots }) => (
              <div key={week} className="mb-2">
                <div className="mono mb-1" style={{ fontSize: '13px', letterSpacing: '0.1em', color: C.sand }}>WEEK {week}</div>
                <div className="space-y-1.5">
                  {slots.map((s) => {
                    const workout = data.workouts.find((w) => w.id === s.workoutId);
                    if (!workout) return null;
                    const logged = programLog(s.workoutId, s.week, s.dayNumber);
                    const key = `o-${mp.id}-${s.week}-${s.dayNumber}`;
                    const isExpanded = expandedDate === key;
                    return (
                      <div key={key} style={{ background: isExpanded ? C.bone : C.cream, border: `1px solid ${C.charcoal}20` }}>
                        <button onClick={() => setExpandedDate(isExpanded ? null : key)} className="w-full flex items-center gap-3 p-3 text-left">
                          <div className="flex-shrink-0 text-center" style={{ minWidth: 56 }}>
                            <div className="mono" style={{ fontSize: '13px', letterSpacing: '0.1em', color: C.moss }}>DAY</div>
                            <div className="display" style={{ fontSize: '20px', fontWeight: 600 }}>{s.dayNumber}</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="prog-name" style={{ fontSize: '19px', color: C.ink, lineHeight: 1.1 }}>{workout.name}</div>
                            <div className="mono" style={{ fontSize: '13px', letterSpacing: '0.1em', color: C.moss }}>{(workout.focus || '').toUpperCase()}</div>
                          </div>
                          {logged ? <span className="mono px-3 py-1.5" style={{ fontSize: '13px', letterSpacing: '0.1em', background: C.forest, color: C.ink, fontWeight: 600 }}>✓ COMPLETED</span>
                            : <span className="mono px-3 py-1.5" style={{ fontSize: '13px', letterSpacing: '0.1em', background: isExpanded ? C.gold : C.gold, color: isExpanded ? C.bone : C.bone }}>{isExpanded ? '× CLOSE' : 'TRAIN →'}</span>}
                        </button>
                        {isExpanded && <div className="p-3" style={{ borderTop: `2px solid ${C.gold}` }}><ParticipantLogPanel coach={coach} workout={workout} member={me} existingLog={logged} programWeek={s.week} programDayNumber={s.dayNumber} onDone={() => setExpandedDate(null)} /></div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {/* 1-on-1 personal program — month calendar; tap a day to open its routine */}
      {personalProgram && (() => {
        const pdByDate = Object.fromEntries(personalDays.map((d) => [d.date, d]));
        const openDate = expandedDate?.startsWith('p-') ? expandedDate.slice(2) : null;
        const openDay = openDate ? pdByDate[openDate] : null;

        // A day is open → show its full routine with a way back to the calendar.
        if (openDay) {
          return (
            <div>
              <button onClick={() => setExpandedDate(null)} className="mono mb-3 px-3 py-2" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.cream, border: `1px solid ${C.charcoal}40`, color: C.gold }}>← BACK TO CALENDAR</button>
              <div className="p-3 mb-2 flex items-center justify-between gap-2" style={{ background: openDay.date === today ? C.gold : C.cream, color: openDay.date === today ? C.bone : C.moss, border: `1px solid ${C.charcoal}20` }}>
                <div className="min-w-0">
                  <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: openDay.date === today ? C.gold : C.moss }}>{niceDate(openDay.date)}{openDay.date === today ? ' · TODAY' : ''}</div>
                  <div className="prog-name leading-tight" style={{ fontSize: '24px', color: openDay.date === today ? C.cream : C.ink }}>{openDay.workout.name}</div>
                </div>
                {openDay.logged && <span className="mono px-3 py-1.5 flex-shrink-0" style={{ fontSize: '12px', letterSpacing: '0.1em', background: C.forest, color: C.ink, fontWeight: 600 }}>✓ DONE</span>}
              </div>
              <ParticipantLogPanel coach={coach} workout={openDay.workout} member={me} existingLog={openDay.logged} date={openDay.date} onDone={() => setExpandedDate(null)} />
            </div>
          );
        }

        // Otherwise the calendar.
        const { year, month } = viewMonth;
        const firstDow = new Date(year, month - 1, 1).getDay();
        const offset = firstDow === 0 ? 6 : firstDow - 1;
        const daysInMonth = new Date(year, month, 0).getDate();
        const cells = [];
        for (let i = offset; i > 0; i--) cells.push({ date: fmtISO(new Date(year, month - 1, 1 - i)), inMonth: false });
        for (let d = 1; d <= daysInMonth; d++) cells.push({ date: fmtISO(new Date(year, month - 1, d)), inMonth: true });
        while (cells.length % 7 !== 0) { const [yy, mm, dd] = cells[cells.length - 1].date.split('-').map(Number); cells.push({ date: fmtISO(new Date(yy, mm - 1, dd + 1)), inMonth: false }); }
        const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' });

        return (
          <div>
            <div className="mono mb-2" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.moss }}>— YOUR 1-ON-1 PROGRAM{personalProgram.name ? ` · ${personalProgram.name.toUpperCase()}` : ''}</div>
            {personalDays.length === 0 && <div className="hand mb-2" style={{ fontSize: '17px', color: C.moss }}>— tu coach todavía está armando tu calendario.</div>}
            <div className="flex items-center justify-between p-3 mb-2" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
              <button onClick={() => shiftMonth(-1)} className="mono px-3 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.bone, color: C.ink, border: `1px solid ${C.charcoal}20` }}>← PREV</button>
              <div className="ui-strong" style={{ fontSize: '22px', color: C.ink }}>{monthName} {year}</div>
              <button onClick={() => shiftMonth(1)} className="mono px-3 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.bone, color: C.ink, border: `1px solid ${C.charcoal}20` }}>NEXT →</button>
            </div>
            {/* El mes cabe entero en la pantalla. Antes se forzaba a 620 px y se
                deslizaba en horizontal: en un teléfono eso escondía medio mes
                detrás de un gesto que nadie adivina. Lo que no cabe a 50 px de
                columna es el nombre de la rutina, así que el día marcado se
                señala con un punto y el nombre se lee al abrirlo. */}
            <div className="grid gap-px mb-px" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', background: C.charcoal + '15' }}>
              {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d) => (
                <div key={d} className="mono px-0.5 py-2 text-center" style={{ fontSize: '11px', letterSpacing: '0.04em', color: C.moss, background: C.cream }}>
                  {/* Dos letras, no una: M/T/W/T/F/S/S repite martes con jueves
                      y sábado con domingo. MO TU WE TH FR SA SU son distintas. */}
                  <span className="md:hidden">{d.slice(0, 2)}</span>
                  <span className="hidden md:inline" style={{ letterSpacing: '0.1em' }}>{d}</span>
                </div>
              ))}
            </div>
            <div className="grid gap-px" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', background: C.charcoal + '15' }}>
              {cells.map(({ date, inMonth }) => {
                const pd = pdByDate[date];
                const isToday = date === today;
                const done = pd?.logged;
                const missed = pd && !done && date < today;
                return (
                  <div key={date} className="cal-cell relative" style={{ background: !inMonth ? C.bone + '80' : (done ? C.forest : C.cream), color: C.ink, outline: isToday ? `2px solid ${C.gold}` : 'none', outlineOffset: '-2px', opacity: inMonth ? 1 : 0.4 }}>
                    <button onClick={() => inMonth && pd && setExpandedDate(`p-${date}`)} disabled={!inMonth || !pd} className="w-full h-full text-left p-1 md:p-1.5" style={{ cursor: (inMonth && pd) ? 'pointer' : 'default', minHeight: 'inherit' }}>
                      <div className="flex items-center justify-between gap-0.5">
                        <span className="mono" style={{ fontSize: isToday ? '13px' : '11px', color: isToday ? C.gold : (inMonth ? C.ink : C.moss), fontWeight: isToday ? 700 : 500 }}>{Number(date.split('-')[2])}</span>
                        {done ? <span style={{ fontSize: '11px', color: C.ink, fontWeight: 700 }}>✓</span>
                          : missed ? <span className="mono" style={{ fontSize: '10px', letterSpacing: '0.1em', color: C.gold, fontWeight: 700 }}>!</span>
                          : isToday ? <span className="mono" style={{ fontSize: '9px', letterSpacing: '0.1em', color: C.gold }}>NOW</span> : null}
                      </div>
                      {pd && (
                        <>
                          {/* Teléfono: el tramo final del nombre, a dos renglones.
                              Oswald es condensada, así que en ~42 px útiles entran
                              unos 10 caracteres por renglón — suficiente para
                              "Day 2" o "Bloque 1 Día 1 · S1". */}
                          <div className="md:hidden prog-name" style={{ fontSize: '9px', lineHeight: 1.15, marginTop: 2, color: C.ink, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>{etiquetaCalendario(pd.workout)}</div>
                          <div className="hidden md:block prog-name" style={{ fontSize: '10px', lineHeight: 1.1, marginTop: 2, color: C.ink }}>{pd.workout.name}</div>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="help text-center mt-3" style={{ fontSize: '14px', color: C.moss }}>— tap a highlighted day to open its workout.</div>
          </div>
        );
      })()}


    </div>
  );
}
