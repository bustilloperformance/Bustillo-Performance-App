import { useCallback, useState } from 'react';
import { Check } from 'lucide-react';
import { C } from '../theme';
import { ToastContext, ConfirmContext } from './feedback';

// ============================================================
//  FEEDBACK PROVIDER — mounts the toast + confirmation UI and provides the
//  contexts consumed by useToast() / useConfirm(). Mounted once at the app root.
// ============================================================
export function FeedbackProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [dialog, setDialog] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }, []);

  const askConfirm = useCallback((opts) => {
    setDialog({
      message: opts.message || 'Are you sure?',
      detail: opts.detail || '',
      confirmLabel: opts.confirmLabel || 'CONFIRM',
      danger: opts.danger !== false, // default to destructive styling
      onConfirm: opts.onConfirm,
    });
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      <ConfirmContext.Provider value={askConfirm}>
        {children}

        {toast && (
          <div
            className="fixed bottom-6 right-6 px-5 py-3 anim-up shadow-2xl flex items-center gap-2 z-[70]"
            style={{ background: C.cream, color: C.gold, fontFamily: 'IBM Plex Mono', fontSize: '12px', letterSpacing: '0.1em' }}
          >
            <Check size={14} />
            {toast}
          </div>
        )}

        {dialog && <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

function ConfirmDialog({ dialog, onClose }) {
  const { message, detail, confirmLabel, danger, onConfirm } = dialog;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-6"
      style={{ background: 'rgba(11, 26, 20, 0.85)' }}
      onClick={onClose}
    >
      <div className="w-full max-w-md anim-up" style={{ background: C.cream }} onClick={(e) => e.stopPropagation()}>
        <div className="p-5" style={{ background: C.cream, color: C.ink, borderBottom: `2px solid ${danger ? C.gold : C.forest}` }}>
          <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.sand }}>
            CONFIRMATION REQUIRED
          </div>
          <div className="ui-strong" style={{ fontSize: '24px' }}>{message}</div>
        </div>
        <div className="p-6">
          {detail && <div className="text-sm mb-5" style={{ color: C.charcoal }}>{detail}</div>}
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="mono px-5 py-3"
              style={{ fontSize: '12px', letterSpacing: '0.1em', background: 'transparent', color: C.ink, border: `1px solid ${C.charcoal}40` }}>
              CANCEL
            </button>
            <button onClick={() => { onConfirm?.(); onClose(); }} className="mono px-5 py-3"
              style={{ fontSize: '12px', letterSpacing: '0.1em', background: danger ? C.gold : C.ink, color: danger ? C.ink : C.gold }}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FeedbackProvider;
