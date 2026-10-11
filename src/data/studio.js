import { supabase } from '../lib/supabaseClient';
import { todayISO } from '../lib/helpers';

// ============================================================
//  STUDIO — expenses, income entries, communications, balance sheet, taxes.
//  Cash on hand is derived in the UI (sum payments - sum expenses).
// ============================================================

// ---- Expenses ----
export async function addExpense(form) {
  const { error } = await supabase.from('expenses').insert({
    date: form.date || todayISO(), amount: Number(form.amount) || 0, category: form.category || 'Other', note: form.note || '',
    paid_from: form.paidFrom || 'bank',
  });
  if (error) throw error;
}
export async function deleteExpense(id) {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

// ---- A manual income entry (membership/drop-in/other paid in person) ----
export async function addPayment(form) {
  const { error } = await supabase.from('payments').insert({
    member_id: form.memberId || null, amount: Number(form.amount) || 0, date: form.date || todayISO(),
    method: form.method || 'cash', type: form.type || 'other', note: form.note || '',
  });
  if (error) throw error;
}

// Remove an income row. Payments are the books, so this is a real deletion,
// not a flag — a cycle booked by mistake shouldn't sit in the totals forever.
export async function deletePayment(id) {
  const { error } = await supabase.from('payments').delete().eq('id', id);
  if (error) throw error;
}

// ---- Communications ----
export async function saveCampaign(form, editingId) {
  const row = { name: form.name, trigger: form.trigger || '', channel: form.channel || 'email', status: form.status || 'active' };
  if (editingId) {
    const { error } = await supabase.from('communications').update(row).eq('id', editingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('communications').insert(row);
    if (error) throw error;
  }
}
export async function toggleCampaign(id, status) {
  const { error } = await supabase.from('communications').update({ status: status === 'active' ? 'paused' : 'active' }).eq('id', id);
  if (error) throw error;
}
export async function logSend(id, sent) {
  const { error } = await supabase.from('communications').update({ sent: (sent || 0) + 1 }).eq('id', id);
  if (error) throw error;
}
export async function deleteCampaign(id) {
  const { error } = await supabase.from('communications').delete().eq('id', id);
  if (error) throw error;
}

// ---- Balance sheet items (manual assets / liabilities) ----
export async function addBalanceItem({ kind, name, amount }) {
  const { error } = await supabase.from('balance_items').insert({ kind, name, amount: Number(amount) || 0 });
  if (error) throw error;
}
export async function deleteBalanceItem(id) {
  const { error } = await supabase.from('balance_items').delete().eq('id', id);
  if (error) throw error;
}

// ---- Custom income / expense categories ----
export async function addCategory({ kind, name }) {
  const clean = (name || '').trim();
  if (!clean) throw new Error('Name is required.');
  const { error } = await supabase.from('categories').insert({ kind, name: clean });
  if (error) throw error.code === '23505' ? new Error('That category already exists.') : error;
}
export async function deleteCategory(id) {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

// ---- Taxes (configurable rules) ----
export async function saveTax(form, editingId) {
  const row = {
    name: (form.name || '').trim() || 'Tax',
    rate: Number(form.rate) || 0,
    applies_to: form.appliesTo || [],
    effective_from: form.effectiveFrom || todayISO(),
    enabled: form.enabled !== false,
  };
  if (editingId) {
    const { error } = await supabase.from('taxes').update(row).eq('id', editingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('taxes').insert(row);
    if (error) throw error;
  }
}
export async function toggleTax(id, enabled) {
  const { error } = await supabase.from('taxes').update({ enabled: !enabled }).eq('id', id);
  if (error) throw error;
}
export async function deleteTax(id) {
  const { error } = await supabase.from('taxes').delete().eq('id', id);
  if (error) throw error;
}

// ---- Tax remittances (paying the collected tax to the authority) ----
export async function addRemittance(form) {
  const { error } = await supabase.from('tax_remittances').insert({
    amount: Number(form.amount) || 0, date: form.date || todayISO(), note: form.note || '', paid_from: form.paidFrom || 'bank',
  });
  if (error) throw error;
}
export async function deleteRemittance(id) {
  const { error } = await supabase.from('tax_remittances').delete().eq('id', id);
  if (error) throw error;
}
