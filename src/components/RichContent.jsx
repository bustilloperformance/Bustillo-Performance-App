import { useRef } from 'react';
import { ArrowUp, ArrowDown, Trash2, Type, Image as ImageIcon, Film, Link as LinkIcon, Upload } from 'lucide-react';
import { C } from '../theme';
import { getYouTubeId } from '../lib/helpers';
import { Btn } from './ui';
import { inputClass, inputStyle } from './uiStyles';

// ============================================================
//  RICH CONTENT — a simple block model for storefront pages.
//  Blocks: { type: 'text' | 'image' | 'video' | 'link', ... }.
//  <ContentView> renders it (client storefront); <ContentEditor> edits it (owner).
// ============================================================

// Downscale + compress an uploaded image to a small data URL (no Storage needed).
function fileToImage(file, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const maxW = 900;
      const scale = Math.min(1, maxW / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      let q = 0.8, url = canvas.toDataURL('image/jpeg', q);
      while (url.length > 220 * 1024 && q > 0.4) { q -= 0.1; url = canvas.toDataURL('image/jpeg', q); }
      cb(url);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

export function ContentView({ content, dark = false }) {
  if (!content || content.length === 0) return null;
  const textColor = dark ? C.sand : C.charcoal;
  return (
    <div className="space-y-4">
      {content.map((b, i) => {
        if (b.type === 'text') {
          return <div key={i} style={{ whiteSpace: 'pre-wrap', fontSize: '15px', lineHeight: 1.5, color: textColor }}>{b.value}</div>;
        }
        if (b.type === 'image') {
          return b.url ? <img key={i} src={b.url} alt="" style={{ width: '100%', borderRadius: 2, border: `1px solid ${C.charcoal}20` }} /> : null;
        }
        if (b.type === 'video') {
          const id = getYouTubeId(b.url);
          if (!id) return null;
          return (
            <div key={i} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: C.cream, overflow: 'hidden' }}>
              <iframe src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`} title="Video" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
            </div>
          );
        }
        if (b.type === 'link') {
          return (
            <a key={i} href={b.url} target="_blank" rel="noopener noreferrer" className="mono inline-flex items-center gap-2 px-4 py-2.5" style={{ fontSize: '12px', letterSpacing: '0.1em', background: C.gold, color: C.bone, textDecoration: 'none' }}>
              {(b.label || b.url || 'OPEN LINK')} ↗
            </a>
          );
        }
        return null;
      })}
    </div>
  );
}

export function ContentEditor({ content, onChange }) {
  const blocks = content || [];
  const fileRef = useRef(null);
  const pendingImageIdx = useRef(null);

  const set = (next) => onChange(next);
  const add = (block) => set([...blocks, block]);
  const update = (i, patch) => set(blocks.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const remove = (i) => set(blocks.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };

  const onPickImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    fileToImage(file, (url) => {
      if (pendingImageIdx.current != null) update(pendingImageIdx.current, { url });
      pendingImageIdx.current = null;
    });
  };

  return (
    <div className="space-y-2">
      <input ref={fileRef} type="file" accept="image/*" onChange={onPickImage} style={{ display: 'none' }} />

      {blocks.map((b, i) => (
        <div key={i} className="p-2" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="mono" style={{ fontSize: '10px', letterSpacing: '0.1em', color: C.gold }}>{b.type.toUpperCase()}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => move(i, -1)} className="p-1" style={{ background: C.bone }}><ArrowUp size={11} /></button>
              <button type="button" onClick={() => move(i, 1)} className="p-1" style={{ background: C.bone }}><ArrowDown size={11} /></button>
              <button type="button" onClick={() => remove(i)} className="p-1" style={{ background: C.sand }}><Trash2 size={11} /></button>
            </div>
          </div>

          {b.type === 'text' && (
            <textarea value={b.value || ''} onChange={(e) => update(i, { value: e.target.value })} rows="3" placeholder="Write about the program…" className={inputClass} style={inputStyle} />
          )}
          {b.type === 'image' && (
            <div className="space-y-1.5">
              {b.url && <img src={b.url} alt="" style={{ maxHeight: 120, borderRadius: 2 }} />}
              <div className="flex gap-1.5">
                <button type="button" onClick={() => { pendingImageIdx.current = i; fileRef.current?.click(); }} className="mono px-3 py-2 flex items-center gap-1" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.cream, color: C.gold }}><Upload size={11} /> UPLOAD</button>
                <input value={(b.url || '').startsWith('data:') ? '' : (b.url || '')} onChange={(e) => update(i, { url: e.target.value })} placeholder="…or paste an image URL" className={`${inputClass} flex-1`} style={inputStyle} />
              </div>
            </div>
          )}
          {b.type === 'video' && (
            <input value={b.url || ''} onChange={(e) => update(i, { url: e.target.value })} placeholder="YouTube URL (https://youtu.be/…)" className={inputClass} style={inputStyle} />
          )}
          {b.type === 'link' && (
            <div className="grid grid-cols-2 gap-1.5">
              <input value={b.label || ''} onChange={(e) => update(i, { label: e.target.value })} placeholder="Button text" className={inputClass} style={inputStyle} />
              <input value={b.url || ''} onChange={(e) => update(i, { url: e.target.value })} placeholder="https://…" className={inputClass} style={inputStyle} />
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-1.5">
        <Btn variant="ghost" icon={Type} onClick={() => add({ type: 'text', value: '' })}>TEXT</Btn>
        <Btn variant="ghost" icon={ImageIcon} onClick={() => add({ type: 'image', url: '' })}>IMAGE</Btn>
        <Btn variant="ghost" icon={Film} onClick={() => add({ type: 'video', url: '' })}>VIDEO</Btn>
        <Btn variant="ghost" icon={LinkIcon} onClick={() => add({ type: 'link', url: '', label: '' })}>LINK</Btn>
      </div>
    </div>
  );
}
