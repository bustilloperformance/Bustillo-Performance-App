import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// ============================================================
//  BOTTOM BAR — a bar pinned to the bottom of what you can actually SEE.
//
//  Portalled to <body> so no ancestor's overflow or transform can trap it,
//  and positioned off window.visualViewport instead of a plain `bottom: 0`.
//
//  Why: on iOS the layout viewport does NOT shrink for the software keyboard,
//  so `bottom: 0` is the bottom of the *screen*, not of the visible area. iOS
//  lifts fixed bars above the keyboard on its own, but regularly forgets to put
//  them back — after the keyboard closes on a scroll, or after the app is
//  backgrounded and resumed — leaving the bar stranded mid-screen with content
//  running underneath it. Reading the visual viewport pins the bar above the
//  keyboard while typing AND forces a re-layout on every viewport change, so a
//  stranded bar corrects itself on the next frame.
// ============================================================

// Distance between the bottom of the visible area and the bottom of the layout
// viewport: 0 normally, the keyboard's height while it is open.
function useKeyboardLift() {
  const [lift, setLift] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return; // no support → behaves exactly like `bottom: 0`

    let frame = 0;
    const measure = () => {
      frame = 0;
      const gap = window.innerHeight - (vv.offsetTop + vv.height);
      // Ignore sub-pixel noise and the address bar's few-px wobble.
      setLift(gap > 24 ? Math.round(gap) : 0);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };

    measure();
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    // focusin/out fire before iOS settles the viewport — they catch the cases
    // where the resize event never arrives at all.
    window.addEventListener('focusin', schedule);
    window.addEventListener('focusout', schedule);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      window.removeEventListener('focusin', schedule);
      window.removeEventListener('focusout', schedule);
    };
  }, []);

  return lift;
}

export default function BottomBar({ className = '', style, children }) {
  const lift = useKeyboardLift();
  return createPortal(
    // md:left-64 clears the 256px sidebar. Spanning the whole viewport put
    // the CLOSE button underneath the menu on a tablet, where the sidebar is
    // always on screen rather than a drawer.
    <div className={`fixed left-0 md:left-64 right-0 ${className}`} style={{ ...style, bottom: lift }}>
      {children}
    </div>,
    document.body,
  );
}
