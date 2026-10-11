import { useState } from 'react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast, useConfirm } from '../../components/feedback';
import { saveNutrition, deleteNutrition } from '../../data/nutrition';
import { Btn } from '../../components/ui';
import NutritionViewer from './NutritionViewer';

// ============================================================
//  NUTRITION EDITOR (staff) — upload a PDF plan for a member. Stored as-is; the
//  client views it embedded (desktop) or in the native viewer (iOS).
// ============================================================
export default function NutritionEditor({ member }) {
  const { refresh } = useData();
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf') { showToast('Please choose a PDF file.'); return; }
    setBusy(true);
    try {
      await saveNutrition(member.id, file);
      await refresh();
      setReloadKey((k) => k + 1);
      showToast('Plan uploaded.');
    } catch (err) { showToast(err.message || 'Could not upload the PDF.'); }
    finally { setBusy(false); }
  };

  const remove = () => askConfirm({
    message: 'Remove the nutrition plan?',
    detail: 'The client will no longer see it. You can upload a new one anytime.',
    confirmLabel: 'REMOVE PLAN', danger: true,
    onConfirm: async () => {
      try { await deleteNutrition(member.id); await refresh(); setReloadKey((k) => k + 1); showToast('Plan removed.'); }
      catch (err) { showToast(err.message || 'Could not remove.'); }
    },
  });

  return (
    <div className="space-y-4">
      <div className="p-6 flex items-center justify-between gap-4 flex-wrap" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        <div className="min-w-0">
          <div className="mono mb-1" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.moss }}>NUTRITION PLAN</div>
          <div className="ui-strong" style={{ fontSize: '20px', color: C.ink }}>{member.name.split(' ')[0]}&rsquo;s plan</div>
          <div className="help" style={{ fontSize: '14px', color: member.hasNutrition ? C.forest : C.gold }}>
            {busy ? '— uploading…' : member.hasNutrition ? '— uploaded · the client can see it in their menu.' : '— upload the client’s plan (PDF).'}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <label className="mono px-4 py-3 flex items-center" style={{ fontSize: '12px', letterSpacing: '0.1em', background: C.ink, color: C.goldDeep, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'PROCESSING…' : member.hasNutrition ? '↑ REPLACE PDF' : '↑ UPLOAD PDF'}
            <input type="file" accept="application/pdf" onChange={onFile} disabled={busy} style={{ display: 'none' }} />
          </label>
          {member.hasNutrition && !busy && <Btn variant="gold" onClick={remove}>REMOVE</Btn>}
        </div>
      </div>
      {member.hasNutrition && <NutritionViewer key={reloadKey} memberId={member.id} />}
    </div>
  );
}
