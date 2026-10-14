import { useState } from 'react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { CHECK_IN_QUESTIONS, weekStartOf, flagsFor, weekLabel } from '../../lib/checkIn';
import { todayISO, parseLocalDate, fmtISO, membershipActive } from '../../lib/helpers';
import { PageHeader, Avatar, Modal } from '../../components/ui';

// ============================================================
//  CHECK-INS — the weekly sweep. One week at a time: who answered, who hasn't,
//  and what in their answers is worth acting on. The flags are the point —
//  twelve answers per client is a lot to read, and most weeks are ordinary.
// ============================================================
export default function CheckInsView() {
  const { data } = useData();
  const [week, setWeek] = useState(() => weekStartOf(todayISO()));
  const [open, setOpen] = useState(null);

  const shiftWeek = (delta) => {
    const d = parseLocalDate(week);
    d.setDate(d.getDate() + delta * 7);
    setWeek(fmtISO(d));
  };

  // El check-in se espera de quien tiene una membresía vigente: cancelados,
  // vencidos y quien nunca tuvo plan salen de la lista. Misma regla que el
  // filtro "active" de la lista de miembros.
  const sigueInscrito = (m) =>
    data.memberships.some((mb) => mb.memberId === m.id && membershipActive(mb, data.membershipPlans.find((p) => p.id === mb.planId)));
  const activos = data.members.filter(sigueInscrito);

  // Esta pantalla navega a semanas pasadas, así que filtrar a secas escondería
  // los check-ins que un excliente SÍ mandó cuando todavía era cliente. Quien
  // contestó la semana que se está viendo aparece aunque ya se haya dado de
  // baja: la respuesta existe y esconderla es perder información.
  // Los contadores no se distorsionan — esa persona suma en "contestaron" y en
  // el total a la vez, así que "pendientes" no se mueve.
  const contestaronEstaSemana = new Set(
    data.checkIns.filter((c) => c.weekStart === week).map((c) => c.memberId),
  );
  const yaListado = new Set(activos.map((m) => m.id));
  const expected = [
    ...activos,
    ...data.members.filter((m) => !yaListado.has(m.id) && contestaronEstaSemana.has(m.id)),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const rows = expected.map((m) => {
    const ci = data.checkIns.find((c) => c.memberId === m.id && c.weekStart === week);
    return { member: m, ci, flags: ci ? flagsFor(ci.answers) : [] };
  });
  const answered = rows.filter((r) => r.ci);
  const flagged = answered.filter((r) => r.flags.length);

  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="06" section="METHOD · WEEKLY CHECK-IN" title="Check-ins."
        subtitle="— cómo les fue, en sus palabras." />

      {/* Week picker */}
      <div className="flex items-center justify-between p-3 mb-4" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        <button onClick={() => shiftWeek(-1)} className="mono px-3 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.bone, color: C.ink, border: `1px solid ${C.charcoal}20` }}>← PREV</button>
        <div className="text-center">
          <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>SEMANA</div>
          <div className="ui-strong" style={{ fontSize: '21px', lineHeight: 1.15 }}>{weekLabel(week)}</div>
        </div>
        <button onClick={() => shiftWeek(1)} className="mono px-3 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.bone, color: C.ink, border: `1px solid ${C.charcoal}20` }}>NEXT →</button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat value={`${answered.length}/${expected.length}`} label="CONTESTARON" />
        <Stat value={flagged.length} label="CON ALERTA" gold={flagged.length > 0} />
        <Stat value={expected.length - answered.length} label="PENDIENTES" />
      </div>

      {expected.length === 0 && (
        <div className="p-8 text-center ui-strong" style={{ fontSize: '20px', color: C.moss, border: `1px dashed ${C.charcoal}30` }}>
          No hay clientes 1-a-1 todavía.
        </div>
      )}

      <div className="space-y-2">
        {rows.map(({ member, ci, flags }) => (
          <div key={member.id} className="p-4 flex items-start gap-3 flex-wrap"
            style={{ background: ci ? C.cream : C.bone, border: `1px solid ${flags.length ? C.gold : `${C.charcoal}20`}`, opacity: ci ? 1 : 0.7 }}>
            <Avatar member={member} size={40} />
            <div className="flex-1 min-w-0" style={{ flexBasis: '50%' }}>
              <div className="ui-strong leading-tight" style={{ fontSize: '21px', color: C.ink }}>{member.name}</div>
              {!ci ? (
                <div className="mono mt-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>SIN CONTESTAR</div>
              ) : flags.length === 0 ? (
                <div className="mono mt-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.gold, fontWeight: 600 }}>✓ SEMANA SIN NOVEDAD</div>
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {flags.map((f) => (
                    <span key={f.id} className="mono px-2 py-0.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.gold, color: C.bone }}>
                      {f.label} · {String(f.value).slice(0, 40)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {ci && (
              <button onClick={() => setOpen({ member, ci })} className="mono px-3 py-2 flex-shrink-0 ml-auto"
                style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.cream, color: C.gold }}>VER RESPUESTAS</button>
            )}
          </div>
        ))}
      </div>

      {open && (
        <Modal title={open.member.name} eyebrow={`CHECK-IN · SEMANA ${weekLabel(open.ci.weekStart).toUpperCase()}`} onClose={() => setOpen(null)} size="md">
          <div className="space-y-4">
            {CHECK_IN_QUESTIONS.map((q) => {
              const a = open.ci.answers?.[q.id];
              if (a == null || String(a).trim() === '') return null;
              return (
                <div key={q.id} className="pb-3" style={{ borderBottom: `1px solid ${C.charcoal}15` }}>
                  <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>{q.n} · {q.q}</div>
                  <div className="ui-strong" style={{ fontSize: '19px', color: C.ink, whiteSpace: 'pre-wrap', lineHeight: 1.35 }}>
                    {q.type === 'scale' ? `${a} / 10` : a}
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Stat({ value, label, gold }) {
  return (
    <div className="p-4" style={{ background: gold ? C.gold : C.cream, color: gold ? C.bone : C.moss }}>
      <div className="stat-num" style={{ fontSize: 'clamp(28px,5vw,40px)' }}>{value}</div>
      <div className="mono mt-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', fontWeight: 600, color: gold ? C.bone : C.sand }}>{label}</div>
    </div>
  );
}
