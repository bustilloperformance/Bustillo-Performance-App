import { useState } from 'react';
import { C } from '../theme';
import { useToast } from './feedback';
import { changeMyPassword } from '../lib/auth';
import { adminSetPassword } from '../data/team';
import { Modal, Btn, Field } from './ui';
import { inputClass, inputStyle } from './uiStyles';

// ============================================================
//  CHANGE PASSWORD MODAL
//  Self-service (owner or member changes their OWN password) when no userId is
//  passed. Admin mode (owner resets someone else's) when userId + memberName
//  are passed — goes through the invite-member edge function (service_role).
// ============================================================
export default function ChangePasswordModal({ userId, memberName, onClose }) {
  const showToast = useToast();
  const admin = !!userId;
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    if (pw.length < 6) { showToast('Password must be at least 6 characters.'); return; }
    if (pw !== pw2) { showToast('Passwords do not match.'); return; }
    setBusy(true);
    try {
      if (admin) await adminSetPassword(userId, pw);
      else await changeMyPassword(pw);
      showToast(admin ? `Password reset for ${memberName?.split(' ')[0] || 'member'}.` : 'Your password was updated.');
      onClose();
    } catch (err) { showToast(err.message || 'Could not update the password.'); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={admin ? 'Reset Password' : 'Change Password'} eyebrow="ACCOUNT · SECURITY" onClose={onClose} size="sm">
      <div className="space-y-3">
        {admin && <div className="help text-center" style={{ fontSize: '14px', color: C.gold }}>— set a new password for {memberName || 'this member'}. Share it with them; they can change it later from their account.</div>}
        <Field label="NEW PASSWORD">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputClass} style={inputStyle} autoFocus placeholder="At least 6 characters" />
        </Field>
        <Field label="CONFIRM PASSWORD">
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={inputClass} style={inputStyle} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </Field>
        <Btn full onClick={save} disabled={busy}>{busy ? 'SAVING…' : admin ? 'RESET PASSWORD' : 'UPDATE PASSWORD'}</Btn>
      </div>
    </Modal>
  );
}
