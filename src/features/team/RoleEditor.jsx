import { useState } from 'react';
import { Plus, Trash2, Shield } from 'lucide-react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast, useConfirm } from '../../components/feedback';
import { createRole, updateRolePermissions, deleteRole } from '../../data/roles';
import { PERMISSION_CATALOG } from '../../lib/permissions';
import { PageHeader, Btn, Modal, Field } from '../../components/ui';
import { inputClass, inputStyle } from '../../components/uiStyles';

// Group the catalog for display.
const GROUPS = PERMISSION_CATALOG.reduce((acc, p) => { (acc[p.group] = acc[p.group] || []).push(p); return acc; }, {});

export default function RoleEditor() {
  const { data, refresh } = useData();
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [showNew, setShowNew] = useState(false);

  const assignedCount = (name) => data.profiles.filter((p) => p.role === name).length;

  const togglePerm = async (role, key) => {
    const has = role.permissions.includes(key);
    const next = has ? role.permissions.filter((k) => k !== key) : [...role.permissions, key];
    try { await updateRolePermissions(role.id, next); await refresh(); }
    catch (err) { showToast(err.message || 'Could not update.'); }
  };

  const remove = (role) => {
    const count = assignedCount(role.name);
    if (count > 0) { showToast(`${count} account${count === 1 ? '' : 's'} still use this role. Reassign them first.`); return; }
    askConfirm({
      message: `Delete the "${role.label}" role?`,
      detail: 'This role definition will be removed. It is not assigned to anyone.',
      confirmLabel: 'DELETE ROLE',
      onConfirm: async () => { try { await deleteRole(role.id); await refresh(); showToast('Role deleted.'); } catch (err) { showToast(err.message || 'Could not delete.'); } },
    });
  };

  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="05" section="PEOPLE · ACCESS" title="Roles & Permissions." subtitle="— define what each role can do."
        action={<Btn icon={Plus} onClick={() => setShowNew(true)}>NEW ROLE</Btn>} />

      <div className="mb-6 p-3" style={{ background: C.bone, border: `1px solid ${C.charcoal}20` }}>
        <div className="help" style={{ fontSize: '15px', color: C.ink, lineHeight: 1.5 }}>
          — check what each role can access in the app. <strong style={{ color: C.gold }}>Owner</strong> always has full access. <strong style={{ color: C.moss }}>Client</strong> is the member experience. Assign roles to people from a member's profile (Members → Account).
        </div>
      </div>

      <div className="space-y-3">
        {data.roles.map((role) => {
          const isOwner = role.name === 'owner';
          const isClient = role.name === 'client';
          const count = assignedCount(role.name);
          return (
            <div key={role.id} style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
              <div className="flex items-center justify-between p-4" style={{ background: C.cream, color: C.ink }}>
                <div className="flex items-center gap-3">
                  <Shield size={16} style={{ color: C.gold }} />
                  <div>
                    <div className="ui-strong" style={{ fontSize: '22px', color: C.cream }}>{role.label || role.name}</div>
                    <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.sand }}>
                      {role.isSystem ? 'SYSTEM ROLE' : 'CUSTOM ROLE'} · {count} ACCOUNT{count === 1 ? '' : 'S'}
                    </div>
                  </div>
                </div>
                {!role.isSystem && (
                  <button onClick={() => remove(role)} className="p-1.5" style={{ background: C.gold, color: C.bone }} title="Delete role"><Trash2 size={13} /></button>
                )}
              </div>

              <div className="p-4">
                {isOwner ? (
                  <div className="help" style={{ fontSize: '16px', color: C.gold }}>— full access to everything. (can't be restricted)</div>
                ) : isClient ? (
                  <div className="help" style={{ fontSize: '16px', color: C.moss }}>— the member/client experience: their own training, booking and progress.</div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(GROUPS).map(([group, perms]) => (
                      <div key={group}>
                        <div className="mono mb-1.5" style={{ fontSize: '10px', letterSpacing: '0.14em', color: C.moss }}>{group.toUpperCase()}</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                          {perms.map((p) => {
                            const on = role.permissions.includes(p.key);
                            return (
                              <button key={p.key} onClick={() => togglePerm(role, p.key)} className="flex items-center gap-2 px-2.5 py-2 text-left"
                                style={{ background: on ? C.gold : C.cream, border: `1px solid ${on ? C.gold : C.charcoal + '25'}` }}>
                                <div className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0" style={{ background: on ? C.gold : 'transparent', border: `1px solid ${on ? C.gold : C.charcoal + '40'}` }}>
                                  {on && <span style={{ fontSize: '10px', color: C.ink, lineHeight: 1 }}>✓</span>}
                                </div>
                                <span className="mono" style={{ fontSize: '11px', letterSpacing: '0.05em', color: on ? C.gold : C.moss }}>{p.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showNew && <NewRoleModal onClose={() => setShowNew(false)} onCreate={async (label, permissions) => {
        try { await createRole({ label, permissions }); await refresh(); showToast(`Role "${label}" created.`); setShowNew(false); }
        catch (err) { showToast(err.message || 'Could not create the role.'); }
      }} />}
    </div>
  );
}

function NewRoleModal({ onClose, onCreate }) {
  const [label, setLabel] = useState('');
  const [perms, setPerms] = useState([]);
  const toggle = (k) => setPerms((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  return (
    <Modal title="New Role" eyebrow="PEOPLE · ACCESS" onClose={onClose} size="md">
      <div className="space-y-3">
        <Field label="ROLE NAME"><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Front Desk, Manager" className={inputClass} style={inputStyle} /></Field>
        <div>
          <div className="mono mb-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>PERMISSIONS</div>
          {Object.entries(GROUPS).map(([group, list]) => (
            <div key={group} className="mb-2">
              <div className="mono mb-1" style={{ fontSize: '10px', letterSpacing: '0.14em', color: C.moss }}>{group.toUpperCase()}</div>
              <div className="grid grid-cols-2 gap-1.5">
                {list.map((p) => {
                  const on = perms.includes(p.key);
                  return (
                    <button key={p.key} onClick={() => toggle(p.key)} className="flex items-center gap-2 px-2.5 py-2 text-left"
                      style={{ background: on ? C.gold : C.cream, border: `1px solid ${on ? C.gold : C.charcoal + '25'}` }}>
                      <div className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0" style={{ background: on ? C.gold : 'transparent', border: `1px solid ${on ? C.gold : C.charcoal + '40'}` }}>{on && <span style={{ fontSize: '10px', color: C.ink, lineHeight: 1 }}>✓</span>}</div>
                      <span className="mono" style={{ fontSize: '11px', color: on ? C.gold : C.moss }}>{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <Btn full onClick={() => { if (!label.trim()) return; onCreate(label, perms); }}>CREATE ROLE</Btn>
      </div>
    </Modal>
  );
}
