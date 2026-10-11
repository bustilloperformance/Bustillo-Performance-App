import { useRef, useState } from 'react';
import { C } from '../theme';
import { Modal, Btn } from './ui';

// ============================================================
//  IMAGE CROPPER — pick the square of a photo to use as an avatar.
//  Drag to pan, slider to zoom. On save, renders the visible circle/square to a
//  512px canvas and exports a compressed JPEG well under the size limit, so big
//  phone photos "just work".
// ============================================================
const V = 280;   // on-screen viewport (px)
const OUT = 512; // exported image size (px)
const MAX_B64 = 160 * 1024; // ~120KB actual — safely under the 800KB limit

export default function ImageCropperModal({ src, onCancel, onCropped }) {
  const imgRef = useRef(null);
  const drag = useRef(null);
  const [nat, setNat] = useState(null);     // natural {w,h}
  const [minScale, setMinScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const scale = minScale * zoom;

  const clamp = (p, s) => ({
    x: Math.min(0, Math.max(V - nat.w * s, p.x)),
    y: Math.min(0, Math.max(V - nat.h * s, p.y)),
  });

  const onImgLoad = (e) => {
    const w = e.target.naturalWidth, h = e.target.naturalHeight;
    const cover = Math.max(V / w, V / h); // fill the viewport
    setNat({ w, h });
    setMinScale(cover);
    setZoom(1);
    setPan({ x: (V - w * cover) / 2, y: (V - h * cover) / 2 }); // centered
  };

  const onZoom = (z) => {
    if (!nat) return;
    const oldS = minScale * zoom, newS = minScale * z, c = V / 2;
    const nx = c - (c - pan.x) * (newS / oldS);
    const ny = c - (c - pan.y) * (newS / oldS);
    setZoom(z);
    setPan(clamp({ x: nx, y: ny }, newS));
  };

  const onDown = (e) => { drag.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const onMove = (e) => {
    if (!drag.current || !nat) return;
    setPan(clamp({ x: drag.current.px + (e.clientX - drag.current.sx), y: drag.current.py + (e.clientY - drag.current.sy) }, scale));
  };
  const onUp = () => { drag.current = null; };

  const save = () => {
    if (!nat) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUT; canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, OUT, OUT);
    const sSize = V / scale, sx = -pan.x / scale, sy = -pan.y / scale;
    ctx.drawImage(imgRef.current, sx, sy, sSize, sSize, 0, 0, OUT, OUT);
    let q = 0.85, url = canvas.toDataURL('image/jpeg', q);
    while (url.length > MAX_B64 && q > 0.4) { q -= 0.1; url = canvas.toDataURL('image/jpeg', q); }
    onCropped(url);
  };

  return (
    <Modal title="Position Your Photo" eyebrow="PROFILE · PHOTO" onClose={onCancel} size="sm">
      <div className="space-y-4">
        <div className="help text-center" style={{ fontSize: '14px', color: C.goldDeep }}>— drag to move, slide to zoom. Any size photo works.</div>
        <div
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          style={{ width: V, height: V, margin: '0 auto', position: 'relative', overflow: 'hidden', borderRadius: '50%', background: C.bone, border: `2px solid ${C.gold}`, touchAction: 'none', cursor: 'grab' }}
        >
          <img
            ref={imgRef} src={src} alt="" onLoad={onImgLoad} draggable={false}
            style={{ position: 'absolute', left: pan.x, top: pan.y, width: nat ? nat.w * scale : 'auto', height: nat ? nat.h * scale : 'auto', maxWidth: 'none', userSelect: 'none', visibility: nat ? 'visible' : 'hidden' }}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>ZOOM</span>
          <input type="range" min="1" max="4" step="0.01" value={zoom} onChange={(e) => onZoom(Number(e.target.value))} style={{ flex: 1, accentColor: C.gold }} />
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={onCancel}>CANCEL</Btn>
          <Btn full onClick={save}>USE PHOTO</Btn>
        </div>
      </div>
    </Modal>
  );
}
