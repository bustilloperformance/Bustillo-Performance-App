import { createContext, useContext } from 'react';

// ============================================================
//  FEEDBACK — toast + confirmation contexts and their hooks.
//  The provider component lives in FeedbackProvider.jsx so this file stays
//  component-free (clean Fast Refresh). Use useToast() / useConfirm().
// ============================================================

export const ToastContext = createContext(null);
export const ConfirmContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a FeedbackProvider');
  return ctx;
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a FeedbackProvider');
  return ctx;
}
