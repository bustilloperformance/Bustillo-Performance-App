import { C } from '../theme';
import { Field } from './ui';
import { inputClass, inputStyle } from './uiStyles';

// ============================================================
//  PHONE FIELD — country code + formatted number, with an optional WhatsApp
//  shortcut (owner/staff only). The value is stored as a single string like
//  "+52 555 123 4567"; wa.me uses the digits only.
// ============================================================
const CODES = [
  { code: '+1', label: '🇺🇸 +1' },
  { code: '+52', label: '🇲🇽 +52' },
  { code: '+34', label: '🇪🇸 +34' },
  { code: '+57', label: '🇨🇴 +57' },
  { code: '+54', label: '🇦🇷 +54' },
  { code: '+55', label: '🇧🇷 +55' },
  { code: '+56', label: '🇨🇱 +56' },
  { code: '+51', label: '🇵🇪 +51' },
  { code: '+593', label: '🇪🇨 +593' },
  { code: '+44', label: '🇬🇧 +44' },
];
// Longest codes first so "+593" matches before "+5".
const CODE_KEYS = CODES.map((c) => c.code).sort((a, b) => b.length - a.length);

function parse(raw) {
  const s = (raw || '').trim();
  for (const c of CODE_KEYS) if (s.startsWith(c)) return { code: c, num: s.slice(c.length).trim() };
  return { code: '+1', num: s.replace(/^\+/, '') };
}
function fmt(digits) {
  const d = (digits || '').replace(/\D/g, '').slice(0, 15);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 10)} ${d.slice(10)}`;
}

export default function PhoneField({ label = 'PHONE', value, onChange, whatsapp = false }) {
  const { code, num: rawNum } = parse(value);
  const num = fmt(rawNum);
  const emit = (c, n) => onChange(`${c} ${fmt(n)}`.trim());
  const digits = (code + rawNum).replace(/\D/g, '');
  const canWa = digits.length >= 8;

  return (
    <Field label={label}>
      <div className="flex gap-1.5 items-stretch">
        <select value={code} onChange={(e) => emit(e.target.value, rawNum)} className="text-sm" style={{ ...inputStyle, width: 'auto', paddingLeft: 8, paddingRight: 4 }}>
          {CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
        </select>
        <input value={num} onChange={(e) => emit(code, e.target.value)} placeholder="555 123 4567" inputMode="tel" className={`${inputClass} flex-1 min-w-0`} style={inputStyle} />
        {whatsapp && (
          canWa ? (
            /* Blanco sobre el verde de WhatsApp da 1.98:1, por debajo de lo que
               pide el estándar. Se deja a propósito: ese par ES la identidad de
               WhatsApp, y su botón con otros colores deja de reconocerse. Es un
               glifo de 16px al lado del teléfono ya escrito en texto legible,
               no información que exista solo aquí. */
            <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer" title="Message on WhatsApp"
              className="flex items-center justify-center px-3 flex-shrink-0 no-underline" style={{ background: '#25D366', color: '#fff', fontSize: '16px' }}>✆</a>
          ) : (
            <span title="Enter a number to enable WhatsApp" className="flex items-center justify-center px-3 flex-shrink-0" style={{ background: C.bone, color: C.moss, fontSize: '16px', opacity: 0.45 }}>✆</span>
          )
        )}
      </div>
    </Field>
  );
}
