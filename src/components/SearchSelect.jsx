import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { C } from '../theme';
import { inputClass, inputStyle } from './uiStyles';

// ============================================================
//  SEARCH SELECT — a type-to-filter combobox. Drop-in replacement for a <select>
//  when the list is long (athletes, exercises). Options: [{ id, label }].
//  Keyboard: ↑/↓ to move, Enter to pick, Esc to close.
// ============================================================
export default function SearchSelect({ value, onChange, options, placeholder = 'Search…', emptyText = 'No matches', limit = 60 }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const wrapRef = useRef(null);

  const selected = options.find((o) => o.id === value);
  const display = open ? query : (selected?.label || '');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q ? options : options.filter((o) => o.label.toLowerCase().includes(q));
    return list.slice(0, limit);
  }, [query, options, limit]);

  useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const choose = (o) => { onChange(o.id); setQuery(''); setOpen(false); };

  const onKey = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); setHi(0); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[hi]) choose(filtered[hi]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        className={inputClass} style={inputStyle}
        value={display}
        placeholder={selected && !open ? selected.label : placeholder}
        onFocus={() => { setOpen(true); setQuery(''); setHi(0); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={onKey}
      />
      {value && !open && (
        <button onMouseDown={(e) => { e.preventDefault(); onChange(''); setQuery(''); }} title="Clear"
          className="absolute top-1/2 -translate-y-1/2 right-2 p-1" style={{ color: C.moss }}>
          <X size={14} />
        </button>
      )}
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto"
          style={{ background: '#fff', border: `1px solid ${C.charcoal}25`, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
          {filtered.length === 0 && (
            <div className="px-3 py-3 ui-strong" style={{ fontSize: '14px', color: C.moss }}>{emptyText}</div>
          )}
          {filtered.map((o, i) => (
            <button key={o.id} type="button" onMouseEnter={() => setHi(i)} onClick={() => choose(o)}
              className="block w-full text-left px-3 py-2"
              style={{ fontSize: '14px', background: i === hi ? C.cream : '#fff', color: o.id === value ? C.gold : C.ink, borderBottom: `1px solid ${C.charcoal}10` }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
