import { useRef, useState } from 'react';
import { Upload, Check } from 'lucide-react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast } from '../../components/feedback';
import { updateMemberProfile } from '../../data/members';
import { todayISO } from '../../lib/helpers';
import { Field } from '../../components/ui';
import { inputClass, inputStyle } from '../../components/uiStyles';
import ImageCropperModal from '../../components/ImageCropperModal';
import PhoneField from '../../components/PhoneField';
import BottomBar from '../../components/BottomBar';

// ============================================================
//  MEMBER PROFILE FORM — identity, emergency contact, coach notes.
//  Migrated from the prototype; writes via updateMemberProfile + refresh.
// ============================================================
export default function MemberProfileForm({ member, notesEditable = true }) {
  const { refresh } = useData();
  const showToast = useToast();
  const fileRef = useRef(null);
  const [saving, setSaving] = useState(false);

  const blank = () => ({
    name: member.name || '',
    email: member.email || '',
    phone: member.phone || '',
    birthDate: member.birthDate || '',
    address: member.address || '',
    photoUrl: member.photoUrl || null,
    emergencyContact: member.emergencyContact || { name: '', relation: '', phone: '' },
    notes: member.notes || '',
  });
  // State resets across members via a key={member.id} on this component
  // (set by the parent) — the idiomatic React way, no reset effect needed.
  const [form, setForm] = useState(blank);
  const [dirty, setDirty] = useState(false);
  const [cropSrc, setCropSrc] = useState(null); // raw selected image → opens the cropper

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };
  const setEC = (patch) => { setForm((f) => ({ ...f, emergencyContact: { ...f.emergencyContact, ...patch } })); setDirty(true); };

  // Any-size photo → open the cropper, which pans/zooms and exports a small,
  // square, compressed image (no manual resizing needed).
  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Pick an image file.'); return; }
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result);
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!form.name || !form.email) { showToast('Name + email required.'); return; }
    setSaving(true);
    try {
      await updateMemberProfile(member.id, form);
      await refresh();
      setDirty(false);
      showToast('Profile updated.');
    } catch (err) {
      showToast(err.message || 'Could not save the profile.');
    } finally {
      setSaving(false);
    }
  };

  const age = form.birthDate
    ? Math.floor((new Date(todayISO()) - new Date(form.birthDate)) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="p-6" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        <div className="mono mb-4" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.moss }}>01 — IDENTITY</div>
        <div className="flex items-start gap-6 flex-wrap">
          <div className="flex flex-col items-center gap-2">
            <div className="w-28 h-28 flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: C.ink, color: C.goldDeep }}>
              {form.photoUrl ? (
                <img src={form.photoUrl} alt={form.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: '40px', fontFamily: 'Fraunces', fontStyle: 'italic' }}>
                  {(form.name || '?').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                </span>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />
            <div className="flex gap-1">
              <button onClick={() => fileRef.current?.click()} className="mono px-2 py-1.5 flex items-center gap-1"
                style={{ fontSize: '12px', letterSpacing: '0.1em', background: C.ink, color: C.goldDeep }}>
                <Upload size={11} /> {form.photoUrl ? 'CHANGE' : 'UPLOAD'}
              </button>
              {form.photoUrl && (
                <button onClick={() => set({ photoUrl: null })} className="mono px-2 py-1.5"
                  style={{ fontSize: '12px', letterSpacing: '0.1em', background: C.sand, color: C.bone }}>REMOVE</button>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-[280px] grid grid-cols-1 gap-3">
            <Field label="FULL NAME"><input value={form.name} onChange={(e) => set({ name: e.target.value })} className={inputClass} style={inputStyle} /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="EMAIL"><input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} className={inputClass} style={inputStyle} /></Field>
              <PhoneField label="PHONE" value={form.phone} onChange={(v) => set({ phone: v })} whatsapp={notesEditable} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={`DATE OF BIRTH${age !== null ? ` · ${age} YRS` : ''}`}>
                <input type="date" value={form.birthDate} onChange={(e) => set({ birthDate: e.target.value })} className={inputClass} style={{ ...inputStyle, minHeight: 38, WebkitAppearance: 'none', appearance: 'none' }} />
              </Field>
            </div>
            <Field label="ADDRESS"><input value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder="Street, city, state, zip" className={inputClass} style={inputStyle} /></Field>
          </div>
        </div>
      </div>

      {/* Emergency contact */}
      <div className="p-6" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        <div className="flex items-baseline justify-between mb-4">
          <div className="mono" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.moss }}>02 — EMERGENCY CONTACT</div>
          <div className="help" style={{ fontSize: '15px', color: C.goldDeep }}>— who do we call if something happens.</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="FULL NAME"><input value={form.emergencyContact.name} onChange={(e) => setEC({ name: e.target.value })} className={inputClass} style={inputStyle} /></Field>
          <Field label="RELATION"><input value={form.emergencyContact.relation} onChange={(e) => setEC({ relation: e.target.value })} placeholder="Spouse, Parent, Sibling..." className={inputClass} style={inputStyle} /></Field>
          <PhoneField label="PHONE" value={form.emergencyContact.phone} onChange={(v) => setEC({ phone: v })} whatsapp={notesEditable} />
        </div>
      </div>

      {/* Coach notes — editable for staff; read-only for the client */}
      <div className="p-6" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        <div className="flex items-baseline justify-between mb-4">
          <div className="mono" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.moss }}>03 — COACH NOTES</div>
          {!notesEditable && <div className="mono" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.goldDeep }}>· READ ONLY</div>}
        </div>
        {notesEditable ? (
          <Field label="NOTES (PRIVATE)">
            <textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows="3" className={inputClass} style={inputStyle}
              placeholder="Injuries, contraindications, preferences..." />
          </Field>
        ) : form.notes ? (
          <div className="help p-3" style={{ fontSize: '17px', color: C.charcoal, background: C.bone, border: `1px solid ${C.charcoal}10` }}>— {form.notes}</div>
        ) : (
          <div className="ui-strong" style={{ fontSize: '17px', color: C.moss }}>No notes from your coach.</div>
        )}
      </div>

      {/* Floating save bar — appears only when there are unsaved changes, so it's
          always reachable without scrolling to the bottom. BottomBar keeps it on
          the visible bottom edge even while the keyboard is up. */}
      {dirty && (
        <BottomBar className="z-50 flex justify-center px-4 pointer-events-none">
          <div className="flex items-center justify-between gap-4 px-4 py-3 pointer-events-auto anim-up" style={{ background: C.ink, border: `2px solid ${C.gold}`, boxShadow: '0 8px 28px rgba(0,0,0,0.4)', width: '100%', maxWidth: 460, marginBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
            <div className="mono" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.sand }}>· UNSAVED CHANGES</div>
            <button onClick={save} disabled={saving} className="mono px-5 py-2.5 flex items-center gap-2"
              style={{ background: C.gold, color: C.bone, fontSize: '14px', letterSpacing: '0.1em', opacity: saving ? 0.6 : 1 }}>
              <Check size={14} /> {saving ? 'SAVING…' : 'SAVE CHANGES'}
            </button>
          </div>
        </BottomBar>
      )}

      {cropSrc && (
        <ImageCropperModal
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onCropped={(url) => { set({ photoUrl: url }); setCropSrc(null); }}
        />
      )}
    </div>
  );
}
