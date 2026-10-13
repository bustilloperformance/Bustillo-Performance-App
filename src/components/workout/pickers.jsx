import { useState } from 'react';
import { C } from '../../theme';
import { inputStyle } from '../uiStyles';

// ============================================================
//  WORKOUT BUILDER PICKERS
//  AddSectionDropdown — add an empty section.
//  AddToSectionPicker — pick an exercise (filtered to the section's tag)
//  to add into a section/circuit, or a text note for Prep Work.
// ============================================================

export function AddSectionDropdown({ sections, onAdd }) {
  const [open, setOpen] = useState(false);
  if (sections.length === 0) return null;
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen((o) => !o)} className="mono px-3 py-2"
        style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.cream, color: C.gold, border: `1px solid ${C.gold}`, whiteSpace: 'nowrap' }}>
        {open ? '× CLOSE' : '+ ADD SECTION'}
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-20 w-64"
          style={{ background: C.cream, border: `1px solid ${C.charcoal}30`, boxShadow: '0 8px 16px rgba(0,0,0,0.2)' }}>
          {sections.map((s) => (
            <button key={s.id} onClick={() => { onAdd(s.id); setOpen(false); }} className="w-full text-left px-3 py-2 hover:bg-amber-100"
              style={{ borderBottom: `1px solid ${C.charcoal}10` }}>
              <div className="ui-strong" style={{ fontSize: '16px', color: C.ink }}>{s.label}</div>
              <div className="help" style={{ fontSize: '13px', color: C.goldDeep }}>— {s.hint}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Unidades por medida, igual que en la Librería: si las dos pantallas ofrecen
// opciones distintas, el mismo ejercicio se guarda distinto según dónde se creó.
const TIME_UNITS = [{ id: 's', label: 'SECONDS' }, { id: 'min', label: 'MINUTES' }];
const DIST_UNITS = [{ id: 'yd', label: 'YARDS' }, { id: 'm', label: 'METERS' }, { id: 'ft', label: 'FEET' }];

export function AddToSectionPicker({ section, circuit, hint, label = '+ ADD', exercises, onPick, onPickText, onCreate, dark = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState(''); // drill down by category first (e.g. Knee Dominant)
  // Crear un ejercicio sin salir del builder. Antes había que cerrar la rutina
  // a medias, ir a la Librería, crearlo y volver a empezar.
  const [nuevo, setNuevo] = useState(null); // null = no se está creando
  const [guardando, setGuardando] = useState(false);
  const isPrepWork = section === 'Prep Work';
  // Hay un picker por seccion y otro por circuito: el id del datalist tiene que
  // ser distinto en cada uno o se repite en el DOM.
  const catsId = `fw-cats-${section}-${circuit || 'new'}`.replace(/\s+/g, '-');

  const sectionExercises = isPrepWork ? [] : exercises.filter((e) => (e.sections || ['Strength']).includes(section));
  const catOf = (e) => ((e.category || '').trim() || 'Uncategorized');

  // Categories present in this section, with how many exercises each holds.
  const catCounts = {};
  sectionExercises.forEach((e) => { const c = catOf(e); catCounts[c] = (catCounts[c] || 0) + 1; });
  const categories = Object.keys(catCounts).sort((a, b) => a.localeCompare(b));

  // Searching looks across the whole section; otherwise you browse one category.
  const searching = search.trim() !== '';
  const filtered = (searching
    ? sectionExercises.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    : cat ? sectionExercises.filter((e) => catOf(e) === cat) : []
  ).slice().sort((a, b) => a.name.localeCompare(b.name)); // A→Z

  const reset = () => { setSearch(''); setCat(''); setNuevo(null); setOpen(false); };

  // El ejercicio nace ya etiquetado para esta sección y, si se venía navegando
  // una categoría, en esa categoría. Si no, aparecería creado pero invisible
  // justo en el menú donde se acaba de crear.
  const abrirNuevo = () => setNuevo({
    name: search.trim(), category: cat || '', measure: 'reps', unit: '', videoUrl: '',
  });
  const crear = async () => {
    if (!nuevo?.name.trim() || guardando) return;
    setGuardando(true);
    try {
      const id = await onCreate({
        name: nuevo.name.trim(),
        category: nuevo.category.trim(),
        sections: [section],
        measure: nuevo.measure,
        measures: [nuevo.measure],
        units: nuevo.measure === 'reps' ? {} : { [nuevo.measure]: nuevo.unit || (nuevo.measure === 'time' ? 's' : 'yd') },
        videoUrl: nuevo.videoUrl.trim(),
      });
      // Se añade al circuito en el acto: crearlo era el medio, no el fin.
      if (id) { onPick(id); reset(); }
    } finally { setGuardando(false); }
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => {
          if (isPrepWork) { onPickText?.(''); return; } // Prep Work: create an empty note in place
          if (open) reset(); else setOpen(true); // closing resets back to the category step
        }}
        className="mono px-2 py-1.5"
        style={{ fontSize: '11px', letterSpacing: '0.1em', background: dark ? C.gold : (open ? C.cream : C.gold), color: dark ? C.bone : (open ? C.ink : C.bone), whiteSpace: 'nowrap' }}>
        {open ? 'CLOSE' : label}
        {!open && !circuit && !hint && <span style={{ marginLeft: '6px', opacity: 0.7 }}>{section?.toUpperCase()}</span>}
        {!open && hint && <span style={{ marginLeft: '6px', opacity: 0.7 }}>· {section?.toUpperCase()}</span>}
      </button>
      {open && !isPrepWork && nuevo && (
        <div className="absolute right-0 top-full mt-1 z-20 w-80"
          style={{ background: C.cream, border: `1px solid ${C.charcoal}30`, boxShadow: '0 8px 16px rgba(0,0,0,0.2)' }}>
          <div className="p-2" style={{ borderBottom: `1px solid ${C.charcoal}15` }}>
            <div className="mono" style={{ fontSize: '10px', letterSpacing: '0.1em', color: C.moss }}>NEW EXERCISE · {section.toUpperCase()}</div>
            <div className="help" style={{ fontSize: '13px', color: C.goldDeep }}>— it gets tagged for this section and added to the circuit.</div>
          </div>
          <div className="p-2 space-y-2">
            <input value={nuevo.name} onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })} placeholder="Exercise name" autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') crear(); }}
              className="w-full px-2 py-1 text-sm" style={inputStyle} />
            {/* Lista las categorías que ya existen para no inventar una nueva
                por un dedazo, pero deja escribir una que no esté. */}
            <input value={nuevo.category} onChange={(e) => setNuevo({ ...nuevo, category: e.target.value })} list={catsId} placeholder="Category (e.g. Knee Dominant)"
              className="w-full px-2 py-1 text-sm" style={inputStyle} />
            <datalist id={catsId}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
            <div className="flex gap-1">
              {[['reps', 'REPS'], ['time', 'TIME'], ['distance', 'DIST']].map(([m, l]) => (
                <button key={m} type="button" onClick={() => setNuevo({ ...nuevo, measure: m, unit: m === 'time' ? 's' : m === 'distance' ? 'yd' : '' })}
                  className="mono flex-1 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: nuevo.measure === m ? C.gold : C.cream, color: nuevo.measure === m ? C.bone : C.moss, border: `1px solid ${C.charcoal}30` }}>
                  {l}
                </button>
              ))}
            </div>
            {nuevo.measure !== 'reps' && (
              <select value={nuevo.unit} onChange={(e) => setNuevo({ ...nuevo, unit: e.target.value })} className="w-full px-2 py-1 text-sm" style={inputStyle}>
                {(nuevo.measure === 'distance' ? DIST_UNITS : TIME_UNITS).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
              </select>
            )}
            <input value={nuevo.videoUrl} onChange={(e) => setNuevo({ ...nuevo, videoUrl: e.target.value })} placeholder="Video URL (optional)"
              className="w-full px-2 py-1 text-sm" style={inputStyle} />
            <div className="flex gap-1 pt-0.5">
              <button onClick={crear} disabled={!nuevo.name.trim() || guardando} className="mono flex-1 py-2"
                style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.cream, color: C.gold, opacity: (!nuevo.name.trim() || guardando) ? 0.45 : 1 }}>
                {guardando ? 'SAVING…' : 'CREATE & ADD'}
              </button>
              <button onClick={() => setNuevo(null)} className="mono px-3 py-2" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.sand, color: C.bone }}>CANCEL</button>
            </div>
            <div className="help" style={{ fontSize: '12px', color: C.moss }}>— you can fill in the rest later in the Library.</div>
          </div>
        </div>
      )}
      {open && !isPrepWork && !nuevo && (
        <div className="absolute right-0 top-full mt-1 z-20 w-80"
          style={{ background: C.cream, border: `1px solid ${C.charcoal}30`, boxShadow: '0 8px 16px rgba(0,0,0,0.2)' }}>
          <div className="p-2" style={{ borderBottom: `1px solid ${C.charcoal}15` }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search all ${section.toLowerCase()} exercises...`} autoFocus
              className="w-full px-2 py-1 text-sm" style={inputStyle} />
            {cat && !searching ? (
              <button onClick={() => setCat('')} className="mono mt-1.5 px-2 py-1" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.cream, color: C.gold }}>
                ← ALL CATEGORIES
              </button>
            ) : (
              <div className="mono mt-1" style={{ fontSize: '10px', letterSpacing: '0.1em', color: C.moss }}>
                {searching ? `${filtered.length} MATCH${filtered.length === 1 ? '' : 'ES'}` : `${sectionExercises.length} EXERCISES · ${categories.length} CATEGOR${categories.length === 1 ? 'Y' : 'IES'}`} · {section.toUpperCase()}
              </div>
            )}
            {cat && !searching && <div className="ui-strong mt-1" style={{ fontSize: '15px', color: C.ink }}>{cat}</div>}
          </div>

          {/* Step 1 — pick a category (unless searching, which skips straight to matches). */}
          {!searching && !cat && (
            <div className="max-h-64 overflow-y-auto">
              {categories.length === 0 && (
                <div className="p-3 text-center ui-strong" style={{ fontSize: '15px', color: C.moss }}>
                  No exercises tagged for this section yet. Create one below, or tag some in the Library.
                </div>
              )}
              {categories.map((c) => (
                <button key={c} onClick={() => setCat(c)} className="w-full text-left px-3 py-2.5 hover:bg-amber-100 flex items-center justify-between gap-2"
                  style={{ borderBottom: `1px solid ${C.charcoal}10` }}>
                  <span className="ui-strong" style={{ fontSize: '16px', color: C.ink, fontWeight: 600 }}>{c}</span>
                  <span className="mono flex-shrink-0" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.gold }}>{catCounts[c]} →</span>
                </button>
              ))}
            </div>
          )}

          {/* Step 2 — exercises of the chosen category (or search matches). */}
          {(searching || cat) && (
            <div className="max-h-64 overflow-y-auto">
              {filtered.length === 0 && (
                <div className="p-3 text-center">
                  <div className="ui-strong" style={{ fontSize: '15px', color: C.moss }}>No matches.</div>
                  {/* El momento exacto en que hace falta crearlo: buscó algo y no
                      está. El nombre ya viene escrito de la búsqueda. */}
                  {onCreate && searching && (
                    <button onClick={abrirNuevo} className="mono mt-2 px-3 py-2" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.cream, color: C.gold }}>
                      + CREATE “{search.trim().slice(0, 22)}”
                    </button>
                  )}
                </div>
              )}
              {filtered.map((ex) => (
                <button key={ex.id} onClick={() => { onPick(ex.id); reset(); }} className="w-full text-left px-3 py-2 hover:bg-amber-100">
                  <div className="prog-name" style={{ fontSize: '15px', color: C.ink }}>{ex.name}</div>
                  <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>{ex.category?.toUpperCase()} · {ex.measure?.toUpperCase()}</div>
                </button>
              ))}
            </div>
          )}

          {/* Siempre a la vista, en cualquier paso: el ejercicio que falta se
              descubre navegando, no solo al buscarlo por su nombre. */}
          {onCreate && (
            <button onClick={abrirNuevo} className="w-full mono px-3 py-2 text-left"
              style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.bone, color: C.gold, borderTop: `1px solid ${C.charcoal}20` }}>
              + NEW EXERCISE{cat && !searching ? ` · ${cat.toUpperCase()}` : ''}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
