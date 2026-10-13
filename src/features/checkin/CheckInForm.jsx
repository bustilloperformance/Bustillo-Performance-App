import { useState } from 'react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast } from '../../components/feedback';
import { saveCheckIn } from '../../data/checkIns';
import { CHECK_IN_QUESTIONS, CHECK_IN_INTRO, CHECK_IN_THANKS, missingAnswers, weekLabel } from '../../lib/checkIn';
import { Modal, Btn } from '../../components/ui';
import { inputClass, inputStyle } from '../../components/uiStyles';

// ============================================================
//  WEEKLY CHECK-IN FORM — what the client fills in on Sunday.
//  Answers are keyed by question id (see lib/checkIn.js) and upserted, so
//  reopening it the same week edits rather than duplicates.
// ============================================================
export default function CheckInForm({ memberId, weekStart, existing, onClose }) {
  const { refresh } = useData();
  const showToast = useToast();
  const [answers, setAnswers] = useState(() => ({ ...(existing?.answers || {}) }));
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [touched, setTouched] = useState(false);

  const set = (id, v) => setAnswers((a) => ({ ...a, [id]: v }));
  const missing = missingAnswers(answers);

  const submit = async () => {
    setTouched(true);
    if (missing.length || saving) return;
    setSaving(true);
    try {
      await saveCheckIn(memberId, weekStart, answers);
      await refresh();
      setDone(true);
    } catch (err) { showToast(err.message || 'No se pudo enviar tu check-in.'); }
    finally { setSaving(false); }
  };

  if (done) {
    return (
      <Modal title="Check-in enviado" eyebrow={`SEMANA ${weekLabel(weekStart).toUpperCase()}`} onClose={onClose} size="md">
        <div className="py-6 text-center">
          <div className="serif-italic mb-4" style={{ fontSize: '30px', color: C.ink }}>Gracias.</div>
          <div className="text-sm whitespace-pre-line mx-auto" style={{ color: C.charcoal, maxWidth: 380, lineHeight: 1.6 }}>
            {CHECK_IN_THANKS}
          </div>
          <div className="mt-6"><Btn onClick={onClose}>CERRAR</Btn></div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Check-in semanal" eyebrow={`SEMANA ${weekLabel(weekStart).toUpperCase()}`} onClose={onClose} size="md">
      <div className="space-y-5">
        <div style={{ fontSize: '15px', color: C.charcoal, lineHeight: 1.6 }}>{CHECK_IN_INTRO}</div>

        {CHECK_IN_QUESTIONS.map((q) => {
          const val = answers[q.id] ?? '';
          const bad = touched && !q.optional && !String(val).trim();
          return (
            <div key={q.id} className="pt-4" style={{ borderTop: `1px solid ${C.charcoal}15` }}>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="mono flex-shrink-0" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.goldDeep, fontWeight: 700 }}>{q.n}</span>
                {/* Body font, not the brand italic: a form is read under a
                    time pressure the rest of the app doesn't have, and an
                    italic serif costs legibility for character nobody wants
                    while answering eleven questions. */}
                <span style={{ fontSize: '17px', color: C.ink, lineHeight: 1.35, fontWeight: 600 }}>
                  {q.q}{q.optional && <span className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss, fontWeight: 400 }}> · OPCIONAL</span>}
                </span>
              </div>
              {q.hint && <div className="mb-2" style={{ fontSize: '13px', color: C.moss, lineHeight: 1.4 }}>{q.hint}</div>}

              {q.type === 'text' && (
                <input value={val} onChange={(e) => set(q.id, e.target.value)} className={inputClass}
                  style={{ ...inputStyle, borderColor: bad ? C.gold : undefined }} />
              )}

              {q.type === 'long' && (
                <textarea value={val} onChange={(e) => set(q.id, e.target.value)} rows={4} className={inputClass}
                  style={{ ...inputStyle, borderColor: bad ? C.gold : undefined, resize: 'vertical' }} />
              )}

              {q.type === 'choice' && (
                <div className="space-y-1.5">
                  {q.options.map((o) => {
                    const on = val === o;
                    return (
                      <button key={o} onClick={() => set(q.id, o)} className="w-full text-left px-3 py-2.5"
                        style={{ background: on ? C.gold : C.cream, color: on ? C.bone : C.moss,
                          border: `1px solid ${on ? C.ink : (bad ? C.gold : `${C.charcoal}25`)}`, fontSize: '15px' }}>
                        {o}
                      </button>
                    );
                  })}
                </div>
              )}

              {q.type === 'scale' && (
                <div>
                  {/* Ten tap targets rather than a slider: a slider is fiddly on
                      a phone and invites a shrug in the middle. */}
                  <div className="flex gap-1">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                      const on = Number(val) === n;
                      return (
                        <button key={n} onClick={() => set(q.id, String(n))} className="mono flex-1 py-2.5"
                          style={{ background: on ? C.gold : C.cream, color: on ? C.bone : C.moss,
                            border: `1px solid ${on ? C.gold : (bad ? C.gold : `${C.charcoal}25`)}`,
                            fontSize: '14px', fontWeight: on ? 700 : 400 }}>
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-1 mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
                    <span>1 · {q.low}</span><span>10 · {q.high}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div className="pt-4" style={{ borderTop: `1px solid ${C.charcoal}15` }}>
          {touched && missing.length > 0 && (
            <div className="mono mb-2" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.goldDeep }}>
              Falta contestar {missing.length} {missing.length === 1 ? 'pregunta' : 'preguntas'}: {missing.map((m) => m.n).join(', ')}
            </div>
          )}
          <Btn full onClick={submit} disabled={saving}>{saving ? 'ENVIANDO…' : 'ENVIAR CHECK-IN →'}</Btn>
        </div>
      </div>
    </Modal>
  );
}
