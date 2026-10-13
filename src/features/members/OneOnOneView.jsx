import { useState } from 'react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast } from '../../components/feedback';
import { ensurePersonalProgram } from '../../data/personalPrograms';
import { todayISO, membershipActive } from '../../lib/helpers';
import { PageHeader, Avatar, Btn } from '../../components/ui';
import { inputClass, inputStyle } from '../../components/uiStyles';
import PersonalProgramEditor from './PersonalProgramEditor';
import ClientWorkouts from '../client/ClientWorkouts';

// ============================================================
//  1-ON-1 PROGRAMS — shortcut screen listing every 1-on-1 member with their
//  program at a glance (days, done, missed, next session) and a one-tap jump
//  into the calendar. The same editor still lives in the member's profile.
// ============================================================
export default function OneOnOneView() {
  const { data, refresh } = useData();
  const showToast = useToast();
  const today = todayISO();

  const [search, setSearch] = useState('');
  // El editor abierto se recuerda: si pese a todo la pagina se recarga, el coach
  // vuelve al programa que estaba editando y no a la lista.
  const [openMemberId, setOpenMemberIdRaw] = useState(() => { try { return localStorage.getItem('bp-staff-program-open') || null; } catch { return null; } });
  const setOpenMemberId = (id) => { setOpenMemberIdRaw(id); try { if (id) localStorage.setItem('bp-staff-program-open', id); else localStorage.removeItem('bp-staff-program-open'); } catch { /* ignore */ } };
  const [logMemberId, setLogMemberId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Only clients with a membership that CURRENTLY grants access belong here —
  // cancelled, lapsed and never-enrolled all drop off. Same rule as the
  // "active" filter in MembersList. (The old "no membership rows → listed"
  // exception existed for people tagged 1-on-1 by hand; without segments it
  // only let in prospects who never had a plan.)
  const stillEnrolled = (m) =>
    data.memberships.some((mb) => mb.memberId === m.id && membershipActive(mb, data.membershipPlans.find((p) => p.id === mb.planId)));
  const oneOnOnes = data.members.filter(stillEnrolled);
  const q = search.trim().toLowerCase();
  const listed = (q ? oneOnOnes.filter((m) => m.name.toLowerCase().includes(q)) : oneOnOnes)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  // Program snapshot for one member: schedule size, completion, next session.
  const statsFor = (memberId) => {
    const pp = data.personalPrograms.find((p) => p.memberId === memberId);
    if (!pp) return null;
    const logs = data.workoutLogs.filter((l) => l.memberId === memberId);
    const isDone = (s) => logs.some((l) => l.workoutId === s.workoutId && l.date === s.date);
    const upcoming = pp.schedule.filter((s) => s.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    return {
      name: pp.name,
      days: pp.schedule.length,
      done: pp.schedule.filter(isDone).length,
      missed: pp.schedule.filter((s) => s.date < today && !isDone(s)).length,
      next: upcoming ? { date: upcoming.date, workout: pp.workouts.find((w) => w.id === upcoming.workoutId) } : null,
    };
  };

  // Creates the program on first open, then shows the calendar.
  const openCalendar = async (memberId) => {
    setBusyId(memberId);
    try {
      await ensurePersonalProgram(memberId);
      await refresh();
      setOpenMemberId(memberId);
    } catch (err) { showToast(err.message || 'Could not open the program.'); }
    finally { setBusyId(null); }
  };

  // Coach-mode logging for one client — reached straight from the list.
  if (logMemberId) {
    return (
      <div className="p-4 md:p-10 anim-fade">
        <button onClick={() => setLogMemberId(null)} className="mono mb-4 flex items-center gap-1" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.moss }}>
          ‹ BACK TO 1-ON-1
        </button>
        <ClientWorkouts clientMemberId={logMemberId} coach />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="03" section="METHOD · 1-ON-1" title="1-on-1 Programs."
        subtitle="— every personal client's calendar, one tap away." />

      <div className="mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a 1-on-1 client..."
          className={inputClass} style={inputStyle} />
        <div className="mono mt-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
          {listed.length} OF {oneOnOnes.length} CLIENT{oneOnOnes.length === 1 ? '' : 'S'}
        </div>
      </div>

      {oneOnOnes.length === 0 && (
        <div className="p-8 text-center ui-strong" style={{ fontSize: '20px', color: C.moss, border: `1px dashed ${C.charcoal}30` }}>
          No clients yet. Add a member and assign them a plan to see them here.
        </div>
      )}
      {oneOnOnes.length > 0 && listed.length === 0 && (
        <div className="p-8 text-center ui-strong" style={{ fontSize: '20px', color: C.moss, border: `1px dashed ${C.charcoal}30` }}>
          No client matches “{search}”.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {listed.map((m) => {
          const st = statsFor(m.id);
          return (
            <div key={m.id} className="p-4 flex items-start gap-3" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
              <Avatar member={m} size={46} fontSize={18} />
              <div className="flex-1 min-w-0">
                <div className="ui-strong leading-tight" style={{ fontSize: '22px', color: C.ink }}>{m.name}</div>
                {st ? (
                  <>
                    <div className="mono mt-1 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
                      <span>{st.days} DAY{st.days === 1 ? '' : 'S'}</span>
                      <span style={{ color: C.gold, fontWeight: 600 }}>✓ {st.done} DONE</span>
                      {st.missed > 0 && <span style={{ color: C.gold, fontWeight: 600 }}>✕ {st.missed} MISSED</span>}
                    </div>
                    <div className="mt-1.5" style={{ fontSize: '14px', color: C.ink }}>
                      {st.next
                        ? <>Next: <strong>{st.next.workout?.name || 'Workout'}</strong> <span className="mono" style={{ fontSize: '12px', color: C.moss }}>· {st.next.date === today ? 'TODAY' : st.next.date}</span></>
                        : <span className="help" style={{ color: C.gold }}>— nothing scheduled ahead.</span>}
                    </div>
                  </>
                ) : (
                  <div className="help mt-1" style={{ fontSize: '14px', color: C.gold }}>— no program yet. Set one up to start scheduling.</div>
                )}
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0">
                <Btn variant="gold" onClick={() => setLogMemberId(m.id)}>▶ LOG SESSION</Btn>
                <Btn variant="ghost" onClick={() => openCalendar(m.id)} disabled={busyId === m.id}>
                  {busyId === m.id ? 'OPENING…' : st ? 'CALENDAR' : 'SET UP'}
                </Btn>
              </div>
            </div>
          );
        })}
      </div>

      {openMemberId && <PersonalProgramEditor memberId={openMemberId} onClose={() => setOpenMemberId(null)} />}
    </div>
  );
}
