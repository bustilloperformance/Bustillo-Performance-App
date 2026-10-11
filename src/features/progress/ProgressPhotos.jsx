import { useEffect, useMemo, useState } from 'react';
import { X, Trash2, Camera, GitCompare } from 'lucide-react';
import { C } from '../../theme';
import { useToast, useConfirm } from '../../components/feedback';
import { Modal, Btn } from '../../components/ui';
import { inputClass, inputStyle } from '../../components/uiStyles';
import { todayISO } from '../../lib/helpers';
import { listProgressPhotos, signPhotoUrls, addProgressSession, deleteProgressSession, POSES } from '../../data/progressPhotos';

const POSE_LABEL = { front: 'FRONT', side: 'SIDE', back: 'BACK' };

// ============================================================
//  PROGRESS PHOTOS — before/after gallery. Each entry is a dated session with
//  three poses (front / side / back). Shown inside the progress dashboard, so the
//  client (editable) uploads their own and the coach sees them. Compare mode puts
//  the earliest session next to the latest for a chosen pose.
// ============================================================
export default function ProgressPhotos({ memberId, editable = false }) {
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [rows, setRows] = useState(null); // null = loading
  const [urls, setUrls] = useState({});
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [files, setFiles] = useState({}); // { front: File, ... }
  const [previews, setPreviews] = useState({}); // { front: objectURL, ... }
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState(false);
  const [comparePose, setComparePose] = useState('front');
  const [lightbox, setLightbox] = useState(null);

  const load = async () => {
    try {
      const data = await listProgressPhotos(memberId);
      const map = await signPhotoUrls(data.map((r) => r.path));
      setUrls(map);
      setRows(data);
    } catch { setRows([]); }
  };
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await listProgressPhotos(memberId);
        const map = await signPhotoUrls(data.map((r) => r.path));
        if (!active) return;
        setUrls(map);
        setRows(data);
      } catch { if (active) setRows([]); }
    })();
    return () => { active = false; };
  }, [memberId]);

  // Group rows into dated sessions (newest first): { date, poses: {front, side, back}, rows }.
  const sessions = useMemo(() => {
    if (!rows) return [];
    const byDate = new Map();
    rows.forEach((r) => {
      if (!byDate.has(r.taken_on)) byDate.set(r.taken_on, { date: r.taken_on, poses: {}, rows: [] });
      const s = byDate.get(r.taken_on);
      s.poses[r.pose || 'front'] = r;
      s.rows.push(r);
    });
    return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [rows]);

  const openAdd = () => {
    setDate(todayISO());
    setFiles({});
    setPreviews({});
    setAdding(true);
  };
  const closeAdd = () => {
    if (busy) return;
    Object.values(previews).forEach((u) => URL.revokeObjectURL(u));
    setAdding(false);
    setFiles({});
    setPreviews({});
  };
  const pickPose = (pose) => (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    if (previews[pose]) URL.revokeObjectURL(previews[pose]);
    setFiles((f) => ({ ...f, [pose]: file }));
    setPreviews((p) => ({ ...p, [pose]: URL.createObjectURL(file) }));
  };

  const allThree = POSES.every((p) => files[p]);

  const save = async () => {
    if (!allThree) return;
    setBusy(true);
    try {
      await addProgressSession(memberId, date, files);
      Object.values(previews).forEach((u) => URL.revokeObjectURL(u));
      setAdding(false);
      setFiles({});
      setPreviews({});
      await load();
      showToast('Photos added.');
    } catch (err) { showToast(err.message || 'Could not upload the photos.'); }
    finally { setBusy(false); }
  };

  const removeSession = (s) => askConfirm({
    message: `Delete the ${s.date} photos?`,
    detail: 'All poses from that day will be removed. This cannot be undone.',
    confirmLabel: 'DELETE', danger: true,
    onConfirm: async () => {
      try { await deleteProgressSession(s.rows); await load(); showToast('Photos deleted.'); }
      catch (err) { showToast(err.message || 'Could not delete.'); }
    },
  });

  // Before/after: oldest & newest session that has the selected pose.
  const withPose = sessions.filter((s) => s.poses[comparePose]);
  const beforeS = withPose.length ? withPose[withPose.length - 1] : null;
  const afterS = withPose.length ? withPose[0] : null;
  const canCompare = sessions.length >= 2;

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="mono flex items-center gap-2" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.moss }}>
          <Camera size={13} /> PROGRESS PHOTOS
        </div>
        <div className="flex gap-2">
          {canCompare && (
            <button onClick={() => setCompare((v) => !v)} className="mono px-3 py-1.5 flex items-center gap-1.5"
              style={{ fontSize: '11px', letterSpacing: '0.1em', background: compare ? C.ink : C.cream, color: compare ? C.gold : C.moss, border: `1px solid ${C.charcoal}20` }}>
              <GitCompare size={12} /> {compare ? 'GALLERY' : 'BEFORE / AFTER'}
            </button>
          )}
          {editable && (
            <button onClick={openAdd} className="mono px-3 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.gold, color: C.bone }}>+ PHOTOS</button>
          )}
        </div>
      </div>

      {rows === null && <div className="mono py-6 text-center" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>LOADING…</div>}

      {rows && sessions.length === 0 && (
        <div className="p-8 text-center" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
          <div className="ui-strong" style={{ fontSize: '20px', color: C.ink }}>No progress photos yet.</div>
          <div className="help mt-1" style={{ fontSize: '14px', color: C.goldDeep }}>{editable ? '— add front, side & back to start your before/after.' : '— none uploaded yet.'}</div>
        </div>
      )}

      {/* Before / after comparison */}
      {sessions.length > 0 && compare && (
        <div>
          <div className="flex gap-1.5 mb-3">
            {POSES.map((p) => (
              <button key={p} onClick={() => setComparePose(p)} className="mono px-3 py-1"
                style={{ fontSize: '11px', letterSpacing: '0.1em', background: comparePose === p ? C.ink : C.cream, color: comparePose === p ? C.gold : C.moss, border: `1px solid ${C.charcoal}20` }}>
                {POSE_LABEL[p]}
              </button>
            ))}
          </div>
          {beforeS && afterS ? (
            <div className="grid grid-cols-2 gap-3">
              {[{ s: beforeS, tag: 'BEFORE', col: C.gold }, { s: afterS, tag: 'AFTER', col: C.forest }].map(({ s, tag, col }) => (
                <figure key={tag} className="m-0">
                  <div className="mono mb-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', color: col }}>{tag} · {s.date}</div>
                  <img src={urls[s.poses[comparePose].path]} alt={tag} onClick={() => setLightbox(urls[s.poses[comparePose].path])}
                    className="w-full" style={{ aspectRatio: '3 / 4', objectFit: 'cover', display: 'block', cursor: 'zoom-in', border: `1px solid ${C.charcoal}20`, background: C.sand }} />
                </figure>
              ))}
            </div>
          ) : (
            <div className="ui-strong p-6 text-center" style={{ fontSize: '18px', color: C.moss }}>No {POSE_LABEL[comparePose].toLowerCase()} photos to compare yet.</div>
          )}
        </div>
      )}

      {/* Gallery — one row per dated session */}
      {sessions.length > 0 && !compare && (
        <div className="space-y-6">
          {sessions.map((s) => (
            <div key={s.date}>
              <div className="flex items-center justify-between mb-2">
                <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.ink }}>{s.date}</div>
                {editable && (
                  <button onClick={() => removeSession(s)} className="p-1" style={{ color: C.moss }} title="Delete this day"><Trash2 size={13} /></button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {POSES.map((pose) => {
                  const r = s.poses[pose];
                  return (
                    <figure key={pose} className="m-0">
                      <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>{POSE_LABEL[pose]}</div>
                      {r ? (
                        <img src={urls[r.path]} alt={pose} loading="lazy" onClick={() => setLightbox(urls[r.path])}
                          className="w-full" style={{ aspectRatio: '3 / 4', objectFit: 'cover', display: 'block', cursor: 'zoom-in', border: `1px solid ${C.charcoal}20`, background: C.sand }} />
                      ) : (
                        <div className="w-full flex items-center justify-center" style={{ aspectRatio: '3 / 4', border: `1px dashed ${C.charcoal}30`, background: C.cream }}>
                          <span className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>—</span>
                        </div>
                      )}
                    </figure>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add session: date + three pose slots */}
      {adding && (
        <Modal onClose={closeAdd}>
          <div className="mono mb-3" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.moss }}>NEW PROGRESS PHOTOS</div>
          <label className="mono block mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>DATE</label>
          <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputClass} style={inputStyle} />
          <div className="grid grid-cols-3 gap-2 mt-4">
            {POSES.map((pose) => (
              <label key={pose} className="cursor-pointer">
                <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: files[pose] ? C.forest : C.moss }}>{POSE_LABEL[pose]}</div>
                <div className="w-full flex items-center justify-center overflow-hidden" style={{ aspectRatio: '3 / 4', border: `1px ${files[pose] ? 'solid' : 'dashed'} ${C.charcoal}${files[pose] ? '30' : '40'}`, background: C.cream }}>
                  {previews[pose]
                    ? <img src={previews[pose]} alt={pose} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span className="mono text-center" style={{ fontSize: '18px', color: C.moss }}>+</span>}
                </div>
                <input type="file" accept="image/*" onChange={pickPose(pose)} style={{ display: 'none' }} />
              </label>
            ))}
          </div>
          <div className="help mt-2" style={{ fontSize: '13px', color: allThree ? C.forest : C.gold }}>
            {allThree ? '— all three ready.' : '— add front, side & back to save.'}
          </div>
          <div className="flex gap-2 mt-4">
            <Btn variant="primary" onClick={save} disabled={busy || !allThree}>{busy ? 'UPLOADING…' : 'SAVE PHOTOS'}</Btn>
            <Btn variant="ghost" onClick={closeAdd}>CANCEL</Btn>
          </div>
        </Modal>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.9)', cursor: 'zoom-out' }}>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2" style={{ color: '#fff' }}><X size={22} /></button>
          <img src={lightbox} alt="Progress" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      )}
    </div>
  );
}
