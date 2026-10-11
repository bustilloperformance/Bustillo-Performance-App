import { createPortal } from 'react-dom';
import { X, ArrowUpRight } from 'lucide-react';
import { C } from '../theme';

// ============================================================
//  SHARED UI PRIMITIVES (ported from the prototype)
// ============================================================

// Path symbol — the brand mark.
// El isotipo de la marca: cinco barras ascendentes, una por etapa
// (México → Monterrey → Puebla → Kuwait → Canadá). La quinta va en oro
// porque es "la etapa que se construye ahora" — eso lo fija la guía de uso,
// junto con que la barra dorada sea siempre la última y la más alta.
//
// `accent` existe porque el isotipo vive sobre dos fondos: en la página
// oscura el oro se lee (8.28:1), pero en la barra lateral de hueso cae a
// 1.98:1 y hay que pasarle goldDeep. Quien lo dibuja decide.
//
// Son rectángulos, no un trazo: la guía prohíbe contornos y efectos, y a
// 28px un trazo fino se deshace.
export const PathMark = ({ size = 24, color = 'currentColor', accent = color, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" className={className}
       role="img" aria-label="Bustillo Performance">
    <rect x="6" y="66" width="12" height="28" fill={color} />
    <rect x="25" y="54" width="12" height="40" fill={color} />
    <rect x="44" y="40" width="12" height="54" fill={color} />
    <rect x="63" y="24" width="12" height="70" fill={color} />
    <rect x="82" y="6" width="12" height="88" fill={accent} />
  </svg>
);

// Avatar — photo if available, else initials.
export const Avatar = ({ member, size = 32, bg, fg, fontSize }) => {
  const bgC = bg || C.ink;
  const fgC = fg || C.gold;
  return (
    <div className="flex items-center justify-center overflow-hidden flex-shrink-0"
         style={{ width: size, height: size, background: bgC, color: fgC }}>
      {member?.photoUrl ? (
        <img src={member.photoUrl} alt={member.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ fontSize: fontSize || Math.round(size * 0.36), fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
          {member?.photo}
        </span>
      )}
    </div>
  );
};

// Editorial page header.
export function PageHeader({ section, sectionNo, title, subtitle, action }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-1 mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
        <span>{sectionNo} — {section}</span>
        <span className="hidden md:inline">— FW · THE WAY WE RAISE THE STANDARD</span>
      </div>
      <div style={{ borderTop: `1px solid ${C.charcoal}30` }} className="pt-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="serif-italic" style={{ fontSize: 'clamp(48px, 6vw, 84px)', color: C.ink, fontWeight: 400 }}>
              {title}
            </h1>
            {subtitle && <div className="help mt-2" style={{ fontSize: '20px', color: C.goldDeep }}>{subtitle}</div>}
          </div>
          {action}
        </div>
      </div>
    </div>
  );
}

export function StatCard({ label, value, change, icon: Icon, accent = 'ink' }) {
  const themes = {
    ink: { bg: C.ink, fg: C.bone, accent: C.gold },
    forest: { bg: C.forest, fg: C.bone, accent: C.gold },
    gold: { bg: C.gold, fg: C.ink, accent: C.ink },
    bone: { bg: C.cream, fg: C.ink, accent: C.gold, border: true },
  };
  const t = themes[accent] || themes.ink;
  return (
    // El padding y la cifra se encogen en pantalla angosta. Tres de estas en
    // una fila de 375px dejan ~106px por tarjeta: con 20px de padding por lado
    // quedaban 66px para un numero de 40px, y "$1,826" se cortaba. El icono se
    // va en movil porque compite con la etiqueta por el mismo renglon.
    <div style={{ background: t.bg, color: t.fg, border: t.border ? `1px solid ${C.charcoal}30` : 'none' }}
         className="relative overflow-hidden p-3.5 md:p-5">
      <div className="flex items-start justify-between gap-1.5 mb-2.5 md:mb-4">
        <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.08em', opacity: 0.7, lineHeight: 1.35 }}>{label}</div>
        {Icon && <Icon size={14} strokeWidth={1.8} className="hidden md:block flex-shrink-0" style={{ opacity: 0.5 }} />}
      </div>
      <div className="display" style={{ fontSize: 'clamp(24px, 6.5vw, 40px)', fontWeight: 600, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      {change && (
        <div className="mono mt-1.5 flex items-center gap-1" style={{ fontSize: '11px', color: t.accent }}>
          <ArrowUpRight size={10} /> {change}
        </div>
      )}
    </div>
  );
}

export function Modal({ title, eyebrow, onClose, children, size = 'md' }) {
  const widths = { sm: 'md:max-w-md', md: 'md:max-w-2xl', lg: 'md:max-w-4xl', xl: 'md:max-w-6xl' };
  // Portalled to <body>. `fixed inset-0` and a z-index only mean "the screen"
  // and "above everything" at the ROOT stacking context — nested inside one an
  // ancestor made, both resolve against that box instead, so the backdrop
  // stops covering the page and a body-level fixed bar paints through it.
  //
  // Below md the container itself is opaque rather than a dimmed scrim: on a
  // phone the dialog fills the screen anyway, so there is nothing behind worth
  // showing, and an opaque container can't be seen through no matter what a
  // parent does to the panel inside it. Above md it goes back to the scrim,
  // where the dialog really is a card floating over the page.
  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-stretch md:items-start justify-center md:p-6 overflow-y-auto
                    bg-[#FAF4E6] md:bg-[rgba(11,26,20,0.85)]" onClick={onClose}>
      <div className={`w-full ${widths[size]} md:my-8 anim-up flex flex-col min-h-screen md:min-h-0`}
           style={{ background: C.cream }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 md:p-5 sticky top-0 z-10"
             style={{ background: C.ink, color: C.bone, borderBottom: `2px solid ${C.gold}` }}>
          <div className="min-w-0 flex-1">
            {/* Sin truncate: el eyebrow suele ser una fecha, y una fecha a
                medias ("DEL 14 AL 20 DE SE…") no dice nada. Que baje de
                renglón en pantallas angostas. */}
            {/* Arena, no musgo: este encabezado es tinta, y musgo sobre tinta
                da 1.84:1 — dos oscuros encimados. Arena da 8.99:1. */}
            {eyebrow && <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', lineHeight: 1.5, color: C.sand }}>{eyebrow}</div>}
            <div className="ui-strong text-xl md:text-2xl">{title}</div>
          </div>
          <button onClick={onClose} className="flex-shrink-0 ml-2 p-1" style={{ color: C.sand }}><X size={20} /></button>
        </div>
        <div className="p-4 md:p-6 flex-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Btn({ variant = 'primary', children, onClick, disabled, type, icon: Icon, full }) {
  const styles = {
    primary: { background: C.ink, color: C.bone },
    gold: { background: C.gold, color: C.bone },
    ghost: { background: 'transparent', color: C.ink, border: `1px solid ${C.charcoal}40` },
    forest: { background: C.forest, color: C.ink },
  };
  return (
    <button onClick={onClick} disabled={disabled} type={type}
      // 0.3 dejaba el texto del botón casi ilegible: "SAVE PHOTOS" apagado no
      // se leía ni de cerca. Sigue viéndose deshabilitado, pero se lee.
      style={{ ...styles[variant], opacity: disabled ? 0.45 : 1 }}
      className={`mono px-5 py-3 flex items-center gap-2 transition-all hover:opacity-90 ${full ? 'w-full justify-center' : ''}`}>
      {Icon && <Icon size={14} strokeWidth={2} />}
      <span style={{ fontSize: '12px', letterSpacing: '0.1em' }}>{children}</span>
    </button>
  );
}

export function Field({ label, children }) {
  return (
    <div>
      {/* Musgo, no arena. La arena es el color del texto sobre fondo OSCURO;
          aquí las etiquetas viven sobre crema y daban 1.82:1 — casi invisibles.
          Y este componente pone la etiqueta de casi todos los formularios de la
          app, así que el mismo error se repetía en cada pantalla. */}
      <label className="mono block mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// Input styles moved to ./uiStyles so this component file stays Fast-Refresh clean.
// Re-imported here is unnecessary — import them directly from './uiStyles'.
