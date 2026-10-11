import { C } from '../theme';

// ============================================================
//  UI STYLES — shared input styling. Kept out of ui.jsx (a component file) so
//  Fast Refresh stays clean; these object constants can't live beside components.
// ============================================================
export const inputClass = 'w-full px-3 py-2 text-sm';
export const inputStyle = { background: '#fff', border: `1px solid ${C.charcoal}30`, color: C.ink };
// Larger, higher-contrast input for set/rep entry in the session logger.
export const setInputStyle = { background: '#fff', color: C.ink, border: `1.5px solid ${C.forest}`, fontWeight: 600, fontSize: '17px' };
