import { useState } from 'react';
import { Activity, Send, MessageSquare, Plus, Edit2, Trash2 } from 'lucide-react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast, useConfirm } from '../../components/feedback';
import { saveCampaign, toggleCampaign, logSend, deleteCampaign } from '../../data/studio';
import { PageHeader, Btn, StatCard, Modal, Field } from '../../components/ui';
import { inputClass, inputStyle } from '../../components/uiStyles';

// ============================================================
//  COMMS VIEW — staff screen for messaging campaigns (email/SMS).
//  Reads data.communications via useData(); creates/edits/toggles/deletes
//  campaigns and logs manual sends via data/studio (no auto-delivery provider yet).
// ============================================================
export default function CommsView() {
  const { data, refresh } = useData();
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const blank = { name: '', trigger: '', channel: 'email', status: 'active' };
  const [form, setForm] = useState(blank);

  const openNew = () => { setEditing(null); setForm(blank); setShowForm(true); };
  const openEdit = (c) => { setEditing(c); setForm({ name: c.name, trigger: c.trigger, channel: c.channel, status: c.status }); setShowForm(true); };
  const save = async () => {
    if (!form.name) { showToast('Name required.'); return; }
    try { await saveCampaign(form, editing?.id); await refresh(); setShowForm(false); showToast(editing ? 'Campaign updated.' : 'Campaign created.'); }
    catch (err) { showToast(err.message || 'Could not save.'); }
  };
  const toggle = async (c) => { try { await toggleCampaign(c.id, c.status); await refresh(); } catch (err) { showToast(err.message || 'Could not toggle.'); } };
  const send = async (c) => { try { await logSend(c.id, c.sent); await refresh(); showToast('Logged a send.'); } catch (err) { showToast(err.message || 'Could not log.'); } };
  const remove = (c) => askConfirm({ message: `Delete "${c.name}"?`, detail: 'This campaign will be removed.', confirmLabel: 'DELETE', onConfirm: async () => { try { await deleteCampaign(c.id); await refresh(); showToast('Campaign removed.'); } catch (err) { showToast(err.message || 'Could not delete.'); } } });

  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="13" section="STUDIO · AUTOMATION" title="Communications." subtitle="— say less, repeat it."
        action={<Btn icon={Plus} onClick={openNew}>NEW CAMPAIGN</Btn>} />

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="ACTIVE CAMPAIGNS" value={data.communications.filter((c) => c.status === 'active').length} icon={Activity} accent="forest" />
        <StatCard label="TOTAL SENT" value={data.communications.reduce((s, c) => s + c.sent, 0)} icon={Send} accent="ink" />
        <StatCard label="CHANNELS" value="2" icon={MessageSquare} accent="gold" />
      </div>

      <div className="mb-4 p-3" style={{ background: C.bone, border: `1px solid ${C.charcoal}20` }}>
        <div className="help" style={{ fontSize: '14px', color: C.moss }}>— campaigns track your messaging. Automatic delivery (email/SMS) needs a provider — wire it when you're ready; for now log sends manually.</div>
      </div>

      {data.communications.length === 0 ? (
        <div className="p-10 text-center" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
          <div className="ui-strong" style={{ fontSize: '22px', color: C.ink }}>No campaigns yet.</div>
          <div className="help mt-2 mb-4" style={{ fontSize: '16px', color: C.gold }}>— e.g. "Welcome the Standard", "Session reminder", "Win-back inactive".</div>
          <div className="flex justify-center"><Btn icon={Plus} onClick={openNew}>NEW CAMPAIGN</Btn></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.communications.map((c) => (
            <div key={c.id} className="p-5 group relative" style={{ background: c.status === 'active' ? C.cream : C.bone, border: `1px solid ${C.charcoal}20`, opacity: c.status === 'active' ? 1 : 0.7 }}>
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100">
                <button onClick={() => openEdit(c)} className="p-1" style={{ background: C.bone, border: `1px solid ${C.charcoal}40` }}><Edit2 size={10} /></button>
                <button onClick={() => remove(c)} className="p-1" style={{ background: C.gold, color: C.bone }}><Trash2 size={10} /></button>
              </div>
              <div className="flex items-start justify-between mb-3 pr-12">
                <div>
                  <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.gold }}>— {c.channel === 'email' ? 'EMAIL' : 'SMS'} · {c.status.toUpperCase()}</div>
                  <div className="ui-strong leading-tight" style={{ fontSize: '24px' }}>{c.name}</div>
                </div>
                <button onClick={() => toggle(c)} className="w-12 h-6 relative flex-shrink-0" style={{ background: c.status === 'active' ? C.gold : C.sand }}>
                  <div className="absolute top-0.5 w-5 h-5 transition-all" style={{ background: C.cream, left: c.status === 'active' ? '24px' : '2px' }} />
                </button>
              </div>
              {c.trigger && <div className="text-xs mb-4"><span className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>TRIGGER:</span> {c.trigger}</div>}
              <div className="flex items-center justify-between pt-3" style={{ borderTop: `1px solid ${C.charcoal}20` }}>
                <div>
                  <div className="stat-num" style={{ fontSize: '32px' }}>{c.sent}</div>
                  <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>LOGGED SENDS</div>
                </div>
                <button onClick={() => send(c)} disabled={c.status !== 'active'} className="mono px-3 py-2 flex items-center gap-1" style={{ background: C.cream, border: `1px solid ${C.charcoal}40`, color: C.gold, fontSize: '11px', letterSpacing: '0.1em', opacity: c.status !== 'active' ? 0.3 : 1 }}>
                  <Send size={10} /> LOG SEND
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={editing ? 'Edit Campaign' : 'New Campaign'} eyebrow="STUDIO · AUTOMATION" onClose={() => setShowForm(false)} size="md">
          <div className="space-y-3">
            <Field label="NAME"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Welcome the Standard" className={inputClass} style={inputStyle} /></Field>
            <Field label="TRIGGER"><input value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })} placeholder="New member signup · 24h before class · Manual" className={inputClass} style={inputStyle} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="CHANNEL">
                <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} className={inputClass} style={inputStyle}><option value="email">Email</option><option value="sms">SMS</option></select>
              </Field>
              <Field label="STATUS">
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputClass} style={inputStyle}><option value="active">Active</option><option value="paused">Paused</option></select>
              </Field>
            </div>
            <Btn full onClick={save}>{editing ? 'UPDATE CAMPAIGN' : 'CREATE CAMPAIGN'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
