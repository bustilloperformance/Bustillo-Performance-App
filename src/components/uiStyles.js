import { C } from '../theme';

// ============================================================
//  UI STYLES — shared input styling. Kept out of ui.jsx (a component file) so
//  Fast Refresh stays clean; these object constants can't live beside components.
// ============================================================
export const inputClass = 'w-full px-3 py-2 text-sm';
export const inputStyle = { background: C.cream, border: `1px solid ${C.charcoal}30`, color: C.ink };
// El campo grande del registro de series. El borde va en ORO, no en azul: sobre
// el carbon el azul da 1.8:1 y el borde se perdia. El oro da 7.31:1.
export const setInputStyle = { background: C.cream, color: C.ink, border: `1.5px solid ${C.gold}`, fontWeight: 600, fontSize: '17px' };
