import { useState } from 'react';
import { Plus } from 'lucide-react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast, useConfirm } from '../../components/feedback';
import { changeRole, createStaff, deleteUser } from '../../data/team';
import { PageHeader, Btn, Modal, Field } from '../../components/ui';
import { inputClass, inputStyle } from '../../components/uiStyles';

function RoleSection({ title, hint, list, currentUserId, onChangeRole, onRemove }) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-3 mb-2">
        <div className="display" style={{ fontSize: '18px', fontWeight: 600 }}>{title}</div>
        <div className="help" style={{ fontSize: '15px', color: C.gold }}>{hint}</div>
        <div className="mono ml-auto" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>{list.length}</div>
      </div>
      <div style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        {list.length === 0 ? (
          <div className="help text-center py-4" style={{ fontSize: '15px', color: C.moss }}>— none yet.</div>
        ) : list.map((u) => (
          <div key={u.id} className="grid grid-cols-12 gap-3 px-4 py-3 items-center text-sm group" style={{ borderBottom: `1px solid ${C.charcoal}10` }}>
            <div className="col-span-5">
              <div className="ui-strong" style={{ fontSize: '17px' }}>
                {u.name || '—'}
                {u.id === currentUserId && <span className="mono ml-2 px-1.5 py-0.5" style={{ fontSize: '10px', letterSpacing: '0.1em', background: C.gold, color: C.bone }}>YOU</span>}
              </div>
              <div className="mono" style={{ fontSize: '11px', color: C.moss }}>{u.email}</div>
            </div>
            <div className="col-span-5">
              <div className="flex gap-1">
                {['client', 'coach', 'owner'].map((r) => (
                  <button key={r} onClick={() => u.role !== r && u.id !== currentUserId && onChangeRole(u.id, r)} disabled={u.role === r || u.id === currentUserId} className="mono px-2 py-1"
                    style={{ fontSize: '11px', letterSpacing: '0.1em',
                      background: u.role === r ? (r === 'owner' ? C.gold : r === 'coach' ? C.forest : C.moss) : 'transparent',
                      // Cada relleno pide su propio contenido: sobre oro y
                      // acero el negro (8.28:1 y 6.68:1), sobre el azul el
                      // hueso (7.94:1 — el negro ahi daba 2.06:1).
                      color: u.role === r ? (r === 'owner' ? C.bone : r === 'coach' ? C.ink : C.bone) : C.moss,
                      border: `1px solid ${C.charcoal}30`,
                      cursor: u.role === r || u.id === currentUserId ? 'default' : 'pointer',
                      opacity: u.id === currentUserId && u.role !== r ? 0.4 : 1 }}>
                    {r.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-2 flex justify-end">
              {u.id !== currentUserId && (
                <button onClick={() => onRemove(u.id)} className="mono px-2 py-1 opacity-0 group-hover:opacity-100" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.gold, color: C.bone }}>REMOVE</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
//  TEAM & ROLES (owner only) — manage who can access what.
// ============================================================
export default function TeamRolesView({ currentUserId }) {
  const { data, refresh } = useData();
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: 'standard' });

  const users = data.profiles || [];
  const owners = users.filter((u) => u.role === 'owner');
  const coaches = users.filter((u) => u.role === 'coach');
  const clients = users.filter((u) => u.role === 'client');

  const doChangeRole = (userId, newRole) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    const detail = newRole === 'owner'
      ? `${user.name || user.email} will have FULL access — finances, all data, role assignment. Use only for trusted partners.`
      : newRole === 'coach'
        ? `${user.name || user.email} will manage members, workouts, programs and the schedule. No finances or POS.`
        : `${user.name || user.email} will only have client access (their own profile, training, progress).`;
    askConfirm({
      message: `Change role to ${newRole.toUpperCase()}?`,
      detail,
      confirmLabel: `MAKE ${newRole.toUpperCase()}`,
      danger: newRole === 'owner',
      onConfirm: async () => {
        try { await changeRole(userId, newRole); await refresh(); showToast(`${user.name || 'Account'} is now ${newRole}.`); }
        catch (err) { showToast(err.message || 'Could not change the role.'); }
      },
    });
  };

  const removeUser = (userId) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    askConfirm({
      message: `Remove ${user.name || user.email}'s account?`,
      detail: `Their login will stop working.${user.memberId ? ' Their member profile and history stay intact (only the login is removed).' : ''}`,
      confirmLabel: 'REMOVE ACCOUNT',
      onConfirm: async () => {
        try { await deleteUser(userId); await refresh(); showToast('Account removed.'); }
        catch (err) { showToast(err.message || 'Could not remove the account.'); }
      },
    });
  };

  const addCoach = async () => {
    const email = form.email.trim().toLowerCase();
    if (!form.name || !email || !form.password) { showToast('Name, email, and password required.'); return; }
    setSaving(true);
    try {
      await createStaff({ name: form.name, email, password: form.password, role: 'coach' });
      await refresh();
      showToast(`${form.name} added as coach.`);
      setForm({ name: '', email: '', password: 'standard' });
      setShowAdd(false);
    } catch (err) { showToast(err.message || 'Could not add the coach.'); }
    finally { setSaving(false); }
  };

  const sectionProps = { currentUserId, onChangeRole: doChangeRole, onRemove: removeUser };

  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="05" section="PEOPLE · TEAM" title="Team & Roles." subtitle="— who can access what, on whose authority."
        action={<Btn icon={Plus} onClick={() => setShowAdd(true)}>ADD COACH</Btn>} />

      <div className="mb-6 p-3" style={{ background: C.bone, border: `1px solid ${C.charcoal}20` }}>
        <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>ROLE PERMISSIONS</div>
        <div className="help" style={{ fontSize: '15px', color: C.ink, lineHeight: 1.5 }}>
          — <strong style={{ color: C.gold }}>Owner</strong>: full access — finances, role assignment, all data.<br />
          — <strong style={{ color: C.gold }}>Coach</strong>: members, workouts, programs, schedule. No finances or POS.<br />
          — <strong style={{ color: C.moss }}>Client</strong>: their own profile, training, and progress only.
        </div>
      </div>

      <RoleSection title="Owners" hint="— trusted partners" list={owners} {...sectionProps} />
      <RoleSection title="Coaches" hint="— your staff" list={coaches} {...sectionProps} />
      <RoleSection title="Client Accounts" hint="— linked logins for members" list={clients} {...sectionProps} />

      {showAdd && (
        <Modal title="Add Coach" eyebrow="PEOPLE · TEAM" onClose={() => setShowAdd(false)} size="md">
          <div className="space-y-3">
            <Field label="FULL NAME"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Alex Rivera" className={inputClass} style={inputStyle} /></Field>
            <Field label="EMAIL"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nombre@correo.com" className={inputClass} style={inputStyle} /></Field>
            <Field label="TEMPORARY PASSWORD"><input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="They can change it later" className={inputClass} style={inputStyle} /></Field>
            <div className="help" style={{ fontSize: '13px', color: C.gold }}>— a coach manages members, workouts, programs and the schedule. Promote to owner later if needed.</div>
            <Btn full onClick={addCoach} disabled={saving}>{saving ? 'ADDING…' : 'ADD COACH'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
