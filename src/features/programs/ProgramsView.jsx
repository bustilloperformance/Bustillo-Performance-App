import { useState } from 'react';
import { Plus, Edit2, Trash2, Building, Globe } from 'lucide-react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast, useConfirm } from '../../components/feedback';
import { saveProgram, deleteProgram } from '../../data/programs';
import { getYouTubeId } from '../../lib/helpers';
import { PageHeader, Btn, Modal, Field } from '../../components/ui';
import { inputClass, inputStyle } from '../../components/uiStyles';
import { ContentEditor } from '../../components/RichContent';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BLANK = {
  name: '', mode: 'in-person', durationWeeks: 4, daysPerWeek: 3, focus: '', description: '',
  schedule: [], price: 0, pricingType: 'one-time', listed: false, tagline: '', equipment: '', content: [],
};

// ============================================================
//  PROGRAMS VIEW — staff screen for building reusable program templates.
//  Reads via useData(); creates/edits/deletes in-person (weekly grid) and online (self-paced, storefront-listed) programs via data/programs.
// ============================================================
export default function ProgramsView() {
  const { data, refresh } = useData();
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [showBuilder, setShowBuilder] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const openNew = () => { setEditing(null); setForm(BLANK); setShowBuilder(true); };
  const openEdit = (p) => {
    let inferred = 3;
    if (p.mode === 'online') {
      const maxDay = Math.max(...p.schedule.map((s) => s.dayNumber || 0), 0);
      if (maxDay) inferred = maxDay;
    }
    setEditing(p);
    setForm({ ...BLANK, ...p, mode: p.mode || 'in-person', daysPerWeek: inferred });
    setShowBuilder(true);
  };

  const setSlotInPerson = (week, day, workoutId) =>
    setForm((f) => ({ ...f, schedule: workoutId ? [...f.schedule.filter((s) => !(s.week === week && s.day === day)), { week, day, workoutId }] : f.schedule.filter((s) => !(s.week === week && s.day === day)) }));
  const getSlotInPerson = (week, day) => form.schedule.find((s) => s.week === week && s.day === day);
  const setSlotOnline = (week, dayNumber, workoutId) =>
    setForm((f) => ({ ...f, schedule: workoutId ? [...f.schedule.filter((s) => !(s.week === week && s.dayNumber === dayNumber)), { week, dayNumber, workoutId }] : f.schedule.filter((s) => !(s.week === week && s.dayNumber === dayNumber)) }));
  const getSlotOnline = (week, dayNumber) => form.schedule.find((s) => s.week === week && s.dayNumber === dayNumber);

  const save = async () => {
    if (!form.name || saving) { if (!form.name) showToast('Program needs a name.'); return; }
    setSaving(true);
    try {
      await saveProgram(form, editing?.id);
      await refresh();
      setShowBuilder(false);
      showToast(editing ? 'Program updated.' : 'Program created.');
    } catch (err) {
      showToast(err.message || 'Could not save the program.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (id) => {
    const p = data.programs.find((x) => x.id === id);
    askConfirm({
      message: 'Delete this program?',
      detail: p ? `"${p.name}" will be removed.` : '',
      confirmLabel: 'DELETE PROGRAM',
      onConfirm: async () => {
        try { await deleteProgram(id); await refresh(); showToast('Program removed.'); }
        catch (err) { showToast(err.message || 'Could not delete.'); }
      },
    });
  };

  const filtered = filter === 'all' ? data.programs : data.programs.filter((p) => (p.mode || 'in-person') === filter);

  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="07" section="METHOD · LONG-TERM PLANS" title="Programs." subtitle="— a schedule, kept."
        action={<Btn icon={Plus} onClick={openNew}>NEW PROGRAM</Btn>} />

      <div className="flex gap-1 mb-4">
        {[{ id: 'all', label: 'ALL', icon: null }, { id: 'in-person', label: 'IN-PERSON', icon: Building }, { id: 'online', label: 'ONLINE', icon: Globe }].map((f) => {
          const Ic = f.icon;
          const count = f.id === 'all' ? data.programs.length : data.programs.filter((p) => (p.mode || 'in-person') === f.id).length;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)} className="mono px-3 py-2 flex items-center gap-1.5"
              style={{ fontSize: '11px', letterSpacing: '0.1em', background: filter === f.id ? C.ink : C.cream, color: filter === f.id ? C.gold : C.moss, border: `1px solid ${C.charcoal}20` }}>
              {Ic && <Ic size={12} />}{f.label} <span style={{ opacity: 0.6 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center ui-strong" style={{ fontSize: '22px', color: C.moss, background: C.cream, border: `1px solid ${C.charcoal}20` }}>
          {data.programs.length === 0 ? 'No programs yet — design your first template.' : 'No programs in this filter.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((p) => {
            const mode = p.mode || 'in-person';
            const isOnline = mode === 'online';
            return (
              <div key={p.id} className="p-6 group relative" style={{ background: isOnline ? C.ink : C.cream, color: isOnline ? C.bone : C.ink, border: `1px solid ${C.charcoal}20` }}>
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={() => openEdit(p)} className="p-1.5" style={{ background: isOnline ? C.forest : C.bone, color: isOnline ? C.bone : C.ink }}><Edit2 size={11} /></button>
                  <button onClick={() => remove(p.id)} className="p-1.5" style={{ background: C.gold, color: C.bone }}><Trash2 size={11} /></button>
                </div>
                <div className="flex items-center gap-1.5 mb-2 mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.goldDeep }}>
                  {isOnline ? <Globe size={11} /> : <Building size={11} />}
                  — {mode.toUpperCase()} · {p.durationWeeks}WK{p.focus ? ` · ${p.focus.toUpperCase()}` : ''}
                  {isOnline && p.listed && <span className="ml-auto mono px-1.5 py-0.5" style={{ fontSize: '10px', background: C.gold, color: C.bone, letterSpacing: '0.1em' }}>LISTED</span>}
                </div>
                <div className="prog-name mb-3" style={{ fontSize: '36px', color: isOnline ? C.cream : C.ink }}>{p.name}</div>
                {isOnline && p.price > 0 && (
                  <div className="mb-2 mono" style={{ fontSize: '14px', color: C.goldDeep, fontWeight: 600 }}>
                    ${p.price}
                    {p.pricingType === 'monthly' && <span style={{ fontSize: '11px', opacity: 0.7 }}> / MONTH</span>}
                    {p.pricingType === 'annual' && <span style={{ fontSize: '11px', opacity: 0.7 }}> / YEAR</span>}
                    {(!p.pricingType || p.pricingType === 'one-time') && <span style={{ fontSize: '11px', opacity: 0.7 }}> · ONE-TIME</span>}
                  </div>
                )}
                <div className="text-sm mb-4" style={{ color: isOnline ? C.sand : C.charcoal }}>{p.description}</div>
                <div className="pt-4" style={{ borderTop: `1px solid ${isOnline ? C.forest : C.charcoal + '20'}` }}>
                  <div className="stat-num" style={{ fontSize: '32px', color: isOnline ? C.cream : C.ink }}>{p.schedule.length}</div>
                  <div className="mono" style={{ fontSize: '10px', letterSpacing: '0.1em', color: isOnline ? C.sand : C.moss }}>SESSIONS SCHEDULED</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showBuilder && (
        <Modal title={editing ? 'Edit Program' : 'New Program'} eyebrow="METHOD · PROGRAM BUILDER" onClose={() => setShowBuilder(false)} size="xl">
          <Field label="PROGRAM MODE">
            <div className="grid grid-cols-2 gap-2">
              {[{ id: 'in-person', label: 'IN-PERSON', icon: Building, sub: 'Studio sessions, calendar-based' }, { id: 'online', label: 'ONLINE', icon: Globe, sub: 'Self-paced, video-guided' }].map((m) => {
                const Ic = m.icon;
                const active = form.mode === m.id;
                return (
                  <button key={m.id} onClick={() => setForm({ ...form, mode: m.id, schedule: [] })} className="p-3 text-left flex items-start gap-3"
                    style={{ background: active ? C.ink : '#fff', color: active ? C.bone : C.ink, border: `1px solid ${active ? C.gold : C.charcoal + '30'}` }}>
                    <Ic size={20} style={{ color: active ? C.gold : C.moss, marginTop: '2px' }} />
                    <div>
                      <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em' }}>{m.label}</div>
                      <div className="help" style={{ fontSize: '14px', color: active ? C.gold : C.moss }}>— {m.sub}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-3 gap-3 mb-3 mt-3">
            <div className="col-span-2"><Field label="PROGRAM NAME"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} style={inputStyle} /></Field></div>
            <Field label="DURATION (WEEKS)"><input type="number" min="1" max="52" value={form.durationWeeks} onChange={(e) => setForm({ ...form, durationWeeks: e.target.value })} className={inputClass} style={inputStyle} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="FOCUS"><input value={form.focus} onChange={(e) => setForm({ ...form, focus: e.target.value })} placeholder="Foundation, Performance..." className={inputClass} style={inputStyle} /></Field>
            <Field label="DESCRIPTION"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} style={inputStyle} /></Field>
          </div>

          {form.mode === 'online' && (
            <>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Field label="DAYS PER WEEK"><input type="number" min="1" max="7" value={form.daysPerWeek} onChange={(e) => setForm({ ...form, daysPerWeek: Number(e.target.value) || 1 })} className={inputClass} style={inputStyle} /></Field>
                <Field label="PRICE (USD)"><input type="number" value={form.price || ''} onChange={(e) => setForm({ ...form, price: Number(e.target.value) || 0 })} placeholder="29" className={inputClass} style={inputStyle} /></Field>
              </div>
              <Field label="PRICING TYPE">
                <div className="flex gap-1">
                  {[{ id: 'one-time', label: 'ONE-TIME', desc: 'Single purchase, lifetime access' }, { id: 'monthly', label: 'MONTHLY', desc: 'Recurring, billed monthly' }, { id: 'annual', label: 'ANNUAL', desc: 'Recurring, billed yearly' }].map((opt) => {
                    const active = (form.pricingType || 'one-time') === opt.id;
                    return (
                      <button key={opt.id} type="button" onClick={() => setForm({ ...form, pricingType: opt.id })} className="flex-1 p-2 text-left"
                        style={{ background: active ? C.ink : '#fff', color: active ? C.bone : C.ink, border: `1px solid ${active ? C.gold : C.charcoal + '30'}` }}>
                        <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: active ? C.gold : C.moss }}>{opt.label}</div>
                        <div className="help mt-1" style={{ fontSize: '12px', color: active ? C.sand : C.moss }}>— {opt.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3 mb-3 mt-3">
                <Field label="TAGLINE (FOR STOREFRONT)"><input value={form.tagline || ''} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="One sentence. Period." className={inputClass} style={inputStyle} /></Field>
                <Field label="EQUIPMENT NEEDED"><input value={form.equipment || ''} onChange={(e) => setForm({ ...form, equipment: e.target.value })} placeholder="Bands, dumbbells, etc." className={inputClass} style={inputStyle} /></Field>
              </div>
              <label className="flex items-center gap-2 mono mb-3" style={{ fontSize: '12px', letterSpacing: '0.1em' }}>
                <input type="checkbox" checked={!!form.listed} onChange={(e) => setForm({ ...form, listed: e.target.checked })} />
                LIST IN CLIENT STOREFRONT (CLIENTS CAN BUY DIRECTLY)
              </label>
              <div className="p-3 mb-3" style={{ background: C.bone, border: `1px solid ${C.charcoal}20` }}>
                <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.goldDeep }}>STOREFRONT PAGE</div>
                <div className="help mb-2" style={{ fontSize: '14px', color: C.moss }}>— the detail page clients see when they tap this program. Add text, images, videos & links.</div>
                <ContentEditor content={form.content || []} onChange={(content) => setForm({ ...form, content })} />
              </div>
            </>
          )}

          {form.mode === 'in-person' ? (
            <>
              <div className="flex items-center gap-2 mb-2"><Building size={12} style={{ color: C.gold }} /><div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>WEEKLY TEMPLATE · STANDALONE PROGRAM</div></div>
              <div className="help mb-3" style={{ fontSize: '14px', color: C.goldDeep }}>— design once. assign it to any client's personal program later.</div>
              <div className="overflow-x-auto" style={{ background: '#fff', border: `1px solid ${C.charcoal}20` }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: C.ink, color: C.bone }}>
                      <th className="p-2 text-left mono" style={{ fontSize: '11px', letterSpacing: '0.1em' }}>WEEK</th>
                      {DAYS.map((d) => <th key={d} className="p-2 text-left mono" style={{ fontSize: '11px', letterSpacing: '0.1em' }}>{d.toUpperCase()}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: Number(form.durationWeeks) || 1 }).map((_, w) => (
                      <tr key={w} style={{ borderTop: `1px solid ${C.charcoal}20` }}>
                        <td className="p-2 mono" style={{ fontSize: '12px', fontWeight: 600 }}>W{w + 1}</td>
                        {DAYS.map((d) => (
                          <td key={d} className="p-1">
                            <select value={getSlotInPerson(w + 1, d)?.workoutId || ''} onChange={(e) => setSlotInPerson(w + 1, d, e.target.value || null)} className="w-full px-1.5 py-1" style={{ ...inputStyle, fontSize: '11px' }}>
                              <option value="">—</option>
                              {data.workouts.map((wo) => <option key={wo.id} value={wo.id}>{wo.name}</option>)}
                            </select>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2"><Globe size={12} style={{ color: C.goldDeep }} /><div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>WEEK × DAY GRID · SELF-PACED</div></div>
              <div className="help mb-2" style={{ fontSize: '14px', color: C.goldDeep }}>— clients work through Day 1, 2, 3… at their own pace.</div>
              <div className="overflow-x-auto" style={{ background: '#fff', border: `1px solid ${C.charcoal}20` }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: C.ink, color: C.bone }}>
                      <th className="p-2 text-left mono" style={{ fontSize: '11px', letterSpacing: '0.1em' }}>WEEK</th>
                      {Array.from({ length: form.daysPerWeek }).map((_, i) => <th key={i} className="p-2 text-left mono" style={{ fontSize: '11px', letterSpacing: '0.1em' }}>DAY {i + 1}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: Number(form.durationWeeks) || 1 }).map((_, w) => (
                      <tr key={w} style={{ borderTop: `1px solid ${C.charcoal}20` }}>
                        <td className="p-2 mono" style={{ fontSize: '12px', fontWeight: 600 }}>W{w + 1}</td>
                        {Array.from({ length: form.daysPerWeek }).map((_, i) => {
                          const dayNum = i + 1;
                          return (
                            <td key={i} className="p-1">
                              <select value={getSlotOnline(w + 1, dayNum)?.workoutId || ''} onChange={(e) => setSlotOnline(w + 1, dayNum, e.target.value || null)} className="w-full px-1.5 py-1" style={{ ...inputStyle, fontSize: '11px' }}>
                                <option value="">—</option>
                                {data.workouts.map((wo) => <option key={wo.id} value={wo.id}>{wo.name}</option>)}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 p-3" style={{ background: `${C.gold}15`, border: `1px solid ${C.gold}40` }}>
                <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.ink }}>VIDEO COVERAGE</div>
                {(() => {
                  const usedExerciseIds = new Set();
                  new Set(form.schedule.map((s) => s.workoutId)).forEach((wid) => {
                    data.workouts.find((w) => w.id === wid)?.items.forEach((it) => it.exerciseId && usedExerciseIds.add(it.exerciseId));
                  });
                  const total = usedExerciseIds.size;
                  const withVideo = [...usedExerciseIds].filter((eid) => { const ex = data.exercises.find((e) => e.id === eid); return ex && getYouTubeId(ex.videoUrl); }).length;
                  if (total === 0) return <div className="help" style={{ fontSize: '14px', color: C.moss }}>— add workouts to see which exercises need videos.</div>;
                  return (
                    <div className="text-sm" style={{ color: C.ink }}>
                      <strong>{withVideo}/{total}</strong> exercises in this program have YouTube videos attached.
                      {withVideo < total && <div className="help mt-1" style={{ fontSize: '14px', color: C.goldDeep }}>— add the missing videos in the Library so online clients can see the form.</div>}
                    </div>
                  );
                })()}
              </div>
            </>
          )}

          <div className="mt-4"><Btn full onClick={save} disabled={saving}>{saving ? 'SAVING…' : editing ? 'UPDATE PROGRAM' : 'CREATE PROGRAM'}</Btn></div>
        </Modal>
      )}
    </div>
  );
}
