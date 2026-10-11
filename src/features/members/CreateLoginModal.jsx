import { useState } from 'react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast } from '../../components/feedback';
import { createMemberLogin } from '../../data/members';
import { Modal, Btn, Field } from '../../components/ui';
import { inputClass, inputStyle } from '../../components/uiStyles';

// ============================================================
//  CREATE LOGIN — owner creates a client login for a member (2c).
//  The member signs in with this email + temporary password; they can
//  change it later. (Email-based invites can come once SMTP is set up.)
// ============================================================
export default function CreateLoginModal({ member, onClose }) {
  const { refresh } = useData();
  const showToast = useToast();
  const [email, setEmail] = useState(member.email || '');
  const [password, setPassword] = useState('standard');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    if (!email.trim()) { showToast('Email is required.'); return; }
    if (!password) { showToast('Password is required.'); return; }
    setSaving(true);
    try {
      await createMemberLogin(member.id, { email: email.trim(), password, name: member.name });
      await refresh();
      showToast(`Login created for ${member.name} · ${email.trim()}`);
      onClose();
    } catch (err) {
      showToast(err.message || 'Could not create the login.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Create Login" eyebrow={`ACCOUNT · ${member.name.toUpperCase()}`} onClose={onClose} size="sm">
      <div className="space-y-3">
        <div className="help text-center" style={{ fontSize: '14px', color: C.goldDeep }}>
          — they'll sign in with this email + password. share it with them; they can change it later.
        </div>
        <Field label="EMAIL">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" className={inputClass} style={inputStyle} />
        </Field>
        <Field label="TEMPORARY PASSWORD">
          <input value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} style={inputStyle} />
        </Field>
        <Btn full onClick={submit} disabled={saving}>{saving ? 'CREATING…' : 'CREATE LOGIN'}</Btn>
      </div>
    </Modal>
  );
}
