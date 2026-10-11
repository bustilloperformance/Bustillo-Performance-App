import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../theme';
import { getYouTubeId } from '../lib/helpers';

// ============================================================
//  VIDEO DEMO — a small button that opens the exercise's YouTube demo in a
//  floating popup (played INSIDE the app, never redirects to YouTube). Tapping
//  outside the video, the ✕, or Escape closes it. Takes no inline space.
// ============================================================
export default function VideoDemo({ url, label = 'DEMO', big = false }) {
  const id = getYouTubeId(url);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!url) return null;

  // `big` matches the timer button's sizing so both read as the same control.
  const btnClass = big ? 'mono inline-flex items-center gap-1.5 px-3 py-2' : 'mono inline-flex items-center gap-1.5 px-3 py-1.5';
  const btnStyle = big
    ? { fontSize: '13px', letterSpacing: '0.15em', fontWeight: 600, background: C.ink, color: C.goldDeep, border: 0, cursor: 'pointer' }
    : { fontSize: '10px', letterSpacing: '0.2em', background: C.ink, color: C.goldDeep, border: 0, cursor: 'pointer' };

  // Non-YouTube link → just open in a new tab (can't embed it safely).
  if (!id) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={btnClass}
        style={{ ...btnStyle, textDecoration: 'none' }}>▶ {label} ↗</a>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btnClass} style={btnStyle}>▶ {label}</button>

      {open && createPortal(
        <div onClick={() => setOpen(false)} className="anim-fade"
          style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(11, 26, 20, 0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 760 }}>
            <div className="flex justify-end mb-2">
              <button type="button" onClick={() => setOpen(false)} className="mono px-3 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.gold, color: C.bone, border: 0, cursor: 'pointer' }}>✕ CLOSE</button>
            </div>
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: C.ink, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                title="Exercise demo"
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
