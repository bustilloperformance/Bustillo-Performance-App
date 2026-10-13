import { useState } from 'react';
import { Plus, Search, ChevronRight } from 'lucide-react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast } from '../../components/feedback';
import { createMember } from '../../data/members';
import { membershipActive } from '../../lib/helpers';
import { PageHeader, Btn, Modal, Field, Avatar } from '../../components/ui';
import { inputClass, inputStyle } from '../../components/uiStyles';

// ============================================================
//  MEMBERS LIST — staff directory of all members with search/filter.
//  Reads via useData(); filters by search, role (from linked login) and
//  active status (has a live membership); creates via data/members
//  (createMember). Selecting a row opens MemberDetail through onSelect.
// ============================================================
export default function MembersList({ onSelect }) {
  const { data, refresh } = useData();
  const showToast = useToast();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // all | active | inactive
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });

  // A member's role = the role of their linked login account, or 'none' if no login.
  const roleOf = (m) => data.profiles.find((p) => p.memberId === m.id)?.role || 'none';

  const matchesSearch = (m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) || (m.email || '').toLowerCase().includes(search.toLowerCase());
  const roleCount = (r) => data.members.filter((m) => roleOf(m) === r).length;
  // "Active" = the member has a currently-active membership (not just their
  // account flag). A member with no membership is inactive.
  const isActive = (m) => data.memberships.some((mb) => mb.memberId === m.id && membershipActive(mb, data.membershipPlans.find((p) => p.id === mb.planId)));
  const matchesStatus = (m) => statusFilter === 'all' || (statusFilter === 'active' ? isActive(m) : !isActive(m));
  const activeCount = data.members.filter(isActive).length;
  const filtered = data.members.filter((m) => matchesSearch(m) && matchesStatus(m) && (roleFilter === 'all' || roleOf(m) === roleFilter));

  const roleColor = (name) => (name === 'owner' ? C.gold : name === 'coach' ? C.forest : name === 'client' ? C.moss : C.navy);
  const chipFor = (name) => {
    if (name === 'none') return { label: 'NO LOGIN', bg: 'transparent', fg: C.moss, border: true };
    const r = data.roles.find((x) => x.name === name);
    const bg = roleColor(name);
    return { label: (r?.label || name).toUpperCase(), bg, fg: name === 'owner' ? C.ink : C.bone };
  };

  const addMember = async () => {
    if (!form.name) { showToast('Name is required.'); return; }
    setSaving(true);
    try {
      await createMember(form);
      await refresh();
      setForm({ name: '', email: '', phone: '' });
      setShowAdd(false);
      showToast('Member added.');
    } catch (err) {
      showToast(err.message || 'Could not add the member.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="02" section="DIRECTORY · CLIENTS" title="Members."
        subtitle={`— ${filtered.length} of ${data.members.length}`}
        action={<Btn icon={Plus} onClick={() => setShowAdd(true)}>NEW MEMBER</Btn>} />

      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.moss }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the directory..."
            className="w-full pl-10 pr-4 py-2.5 text-sm" style={inputStyle} />
        </div>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        <span className="mono mr-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>STATUS ·</span>
        {[
          { id: 'all', label: 'ALL', count: data.members.length },
          { id: 'active', label: 'ACTIVE', count: activeCount },
          { id: 'inactive', label: 'INACTIVE', count: data.members.length - activeCount },
        ].map((f) => (
          <button key={f.id} onClick={() => setStatusFilter(f.id)} className="mono px-3 py-1.5"
            style={{ fontSize: '11px', letterSpacing: '0.1em', background: statusFilter === f.id ? C.gold : C.cream, color: statusFilter === f.id ? C.bone : C.moss, border: `1px solid ${statusFilter === f.id ? C.gold : C.charcoal + '20'}` }}>
            {f.label} <span style={{ opacity: 0.6 }}>({f.count})</span>
          </button>
        ))}
      </div>

      {/* Role filter */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        <span className="mono mr-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>ROLE ·</span>
        {[
          { id: 'all', label: 'ALL', count: data.members.length },
          ...data.roles.map((r) => ({ id: r.name, label: (r.label || r.name).toUpperCase(), count: roleCount(r.name) })),
          { id: 'none', label: 'NO LOGIN', count: roleCount('none') },
        ].map((f) => (
          <button key={f.id} onClick={() => setRoleFilter(f.id)} className="mono px-3 py-1.5"
            style={{ fontSize: '11px', letterSpacing: '0.1em', background: roleFilter === f.id ? C.gold : C.cream, color: roleFilter === f.id ? C.bone : C.moss, border: `1px solid ${C.charcoal}20` }}>
            {f.label} <span style={{ opacity: 0.6 }}>({f.count})</span>
          </button>
        ))}
      </div>

      {showAdd && (
        <Modal title="New Member" eyebrow="DIRECTORY · ADD" onClose={() => setShowAdd(false)} size="md">
          <div className="space-y-3">
            <Field label="FULL NAME"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} style={inputStyle} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="EMAIL"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} style={inputStyle} /></Field>
              <Field label="PHONE"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} style={inputStyle} /></Field>
            </div>
            <div className="p-2.5" style={{ background: C.bone, border: `1px solid ${C.charcoal}15` }}>
              <div className="help" style={{ fontSize: '14px', color: C.gold }}>
                — new members have no plan yet; assign one from their profile. login accounts come next (invite-by-owner).
              </div>
            </div>
            <Btn full onClick={addMember} disabled={saving}>{saving ? 'CREATING…' : 'CREATE MEMBER'}</Btn>
          </div>
        </Modal>
      )}

      <div style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        {/* Column header — desktop only */}
        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2.5 mono"
          style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss, borderBottom: `1px solid ${C.charcoal}20` }}>
          <div className="col-span-5">MEMBER</div>
          <div className="col-span-3">PLAN</div>
          <div className="col-span-2">JOIN DATE</div>
          <div className="col-span-1">STATUS</div>
          <div className="col-span-1"></div>
        </div>
        {filtered.map((m) => {
          const active = isActive(m);
          const rc = chipFor(roleOf(m));
          // Ya no hay segmentos: lo que distingue a un cliente es su plan vigente.
          const planName = (() => {
            const mb = data.memberships.find((x) => x.memberId === m.id && membershipActive(x, data.membershipPlans.find((p) => p.id === x.planId)));
            return mb ? (data.membershipPlans.find((p) => p.id === mb.planId)?.name || '') : '';
          })();
          const segChip = (
            <span className="mono inline-block px-2 py-0.5 truncate" style={{ fontSize: '11px', letterSpacing: '0.1em', maxWidth: '100%',
              background: planName ? C.forest : 'transparent', color: planName ? C.ink : C.moss,
              border: planName ? 'none' : `1px solid ${C.charcoal}25` }}>{planName ? planName.toUpperCase() : 'NO PLAN'}</span>
          );
          return (
            <button key={m.id} onClick={() => onSelect(m.id)}
              className="w-full flex md:grid md:grid-cols-12 md:items-center gap-3 px-4 py-3 text-sm hover:bg-amber-50 transition text-left"
              style={{ borderBottom: `1px solid ${C.charcoal}10` }}>
              {/* Member — avatar + name/email (+ mobile meta) */}
              <div className="flex items-center gap-3 min-w-0 flex-1 md:col-span-5">
                <Avatar member={m} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <div className="ui-strong truncate" style={{ fontSize: '18px' }}>{m.name}</div>
                    <span className="mono px-1.5 py-0.5 flex-shrink-0" style={{ fontSize: '9px', letterSpacing: '0.1em', background: rc.bg, color: rc.fg, border: rc.border ? `1px solid ${C.charcoal}30` : 'none' }}>{rc.label}</span>
                  </div>
                  <div className="mono truncate" style={{ fontSize: '12px', color: C.moss }}>{m.email}</div>
                  {/* Mobile meta: plan + status under the name */}
                  <div className="flex md:hidden items-center gap-2 mt-1.5 flex-wrap">
                    {segChip}
                    <span className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: active ? C.forest : C.moss }}>{active ? '● ACTIVE' : '○ INACTIVE'}</span>
                  </div>
                </div>
              </div>
              {/* Desktop columns */}
              <div className="hidden md:block md:col-span-3">{segChip}</div>
              <div className="hidden md:block md:col-span-2 mono" style={{ fontSize: '12px' }}>{m.joinDate}</div>
              <div className="hidden md:block md:col-span-1 mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: active ? C.forest : C.moss }}>
                {active ? '· ACTIVE' : '· INACTIVE'}
              </div>
              <div className="flex-shrink-0 self-center md:col-span-1 md:text-right"><ChevronRight size={16} className="md:ml-auto" style={{ color: C.moss }} /></div>
            </button>
          );
        })}
        {filtered.length === 0 && <div className="p-12 text-center ui-strong" style={{ fontSize: '20px', color: C.moss }}>No members found.</div>}
      </div>
    </div>
  );
}
