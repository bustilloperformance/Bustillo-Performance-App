import { useState } from 'react';
import { Wallet, ArrowUpRight, TrendingUp, Plus, Trash2, Edit2 } from 'lucide-react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast, useConfirm } from '../../components/feedback';
import { addExpense, deleteExpense, addPayment, deletePayment, addCategory, deleteCategory, saveTax, toggleTax, deleteTax, addRemittance, deleteRemittance } from '../../data/studio';
import { todayISO } from '../../lib/helpers';
import { balances, monthRange, shiftMonth, monthLabel, TYPE_LABEL, taxForPayment, taxPayable, taxSummary } from '../../lib/financeHelpers';
import { PageHeader, Btn, StatCard, Modal, Field } from '../../components/ui';
import { inputClass, inputStyle } from '../../components/uiStyles';

const EXPENSE_DEFAULTS = ['Studio', 'Equipment', 'Supplies', 'Marketing', 'Utilities', 'Salaries', 'Taxes', 'Other'];
const INCOME_DEFAULTS = ['membership', 'program', 'pos', 'other'];

// ============================================================
//  FINANCE VIEW — staff cash-flow dashboard (income, expenses, tax).
//  Reads payments/expenses/categories/taxes via useData(); records income &
//  expenses, manages categories and the tax-inclusive engine via data/studio.
//  Revenue is shown net of collected tax; figures use lib/financeHelpers.
// ============================================================
export default function FinanceView({ setView }) {
  const { data, refresh } = useData();
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [showExpense, setShowExpense] = useState(false);
  const [showIncome, setShowIncome] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showTaxes, setShowTaxes] = useState(false);
  const [expForm, setExpForm] = useState({ amount: '', category: 'Supplies', note: '', date: todayISO(), paidFrom: 'bank' });
  const [incForm, setIncForm] = useState({ amount: '', method: 'cash', type: 'membership', note: '', memberId: '', date: todayISO() });
  const [period, setPeriod] = useState({ mode: 'month', ym: todayISO().slice(0, 7) }); // month | all

  // Filter the period's payments/expenses; balances are cumulative as-of period end.
  const r = period.mode === 'month' ? monthRange(period.ym) : { start: null, end: null };
  const inPeriod = (d) => (!r.start || d >= r.start) && (!r.end || d <= r.end);
  const pays = data.payments.filter((p) => inPeriod(p.date));
  const exps = data.expenses.filter((e) => inPeriod(e.date));

  // Revenue figures are NET of any tax collected (tax is a liability, not income).
  const netOf = (p) => p.amount - taxForPayment(p, data.taxes);
  const totalIncome = pays.reduce((s, p) => s + netOf(p), 0);
  const totalExpenses = exps.reduce((s, e) => s + e.amount, 0);
  const net = totalIncome - totalExpenses;
  const byCategory = exps.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + e.amount; return acc; }, {});
  const byMethod = pays.reduce((acc, p) => { const k = p.method || 'other'; acc[k] = (acc[k] || 0) + netOf(p); return acc; }, {});
  const byType = pays.reduce((acc, p) => { const k = p.type || 'other'; acc[k] = (acc[k] || 0) + netOf(p); return acc; }, {});
  const byMember = pays.reduce((acc, p) => { if (p.memberId) acc[p.memberId] = (acc[p.memberId] || 0) + netOf(p); return acc; }, {});
  const walkInIncome = pays.filter((p) => !p.memberId).reduce((s, p) => s + netOf(p), 0);
  const bal = balances(data.payments, data.expenses, period.mode === 'month' ? r.end : undefined, data.taxRemittances); // { cash, bank, total }
  const taxOwed = taxPayable(data.payments, data.taxRemittances, data.taxes, period.mode === 'month' ? r.end : undefined);
  const periodTax = taxSummary(pays, data.taxRemittances.filter((rr) => inPeriod(rr.date)), data.taxes); // collected/remitted this period
  const hasTaxes = data.taxes.length > 0;
  const METHOD_LABEL = { cash: 'Cash', card: 'Card / Stripe', zelle: 'Zelle', transfer: 'Transfer', other: 'Other' };
  const memberName = (id) => data.members.find((m) => m.id === id)?.name || '';
  const SOURCE_COLOR = { membership: C.forest, pos: C.gold, dropin: C.navy, program: C.moss, other: C.sand };

  // Built-in categories + the owner's custom ones.
  const customExpense = data.categories.filter((c) => c.kind === 'expense').map((c) => c.name);
  const customIncome = data.categories.filter((c) => c.kind === 'income').map((c) => c.name);
  const expenseCats = [...EXPENSE_DEFAULTS, ...customExpense.filter((n) => !EXPENSE_DEFAULTS.includes(n))];
  const incomeCats = [...INCOME_DEFAULTS, ...customIncome.filter((n) => !INCOME_DEFAULTS.includes(n))];

  const recordExpense = async () => {
    if (!expForm.amount) { showToast('Enter an amount.'); return; }
    try { await addExpense(expForm); await refresh(); setExpForm({ amount: '', category: 'Supplies', note: '', date: todayISO(), paidFrom: 'bank' }); setShowExpense(false); showToast(`Expense −$${expForm.amount}.`); }
    catch (err) { showToast(err.message || 'Could not record.'); }
  };
  const recordIncome = async () => {
    if (!incForm.amount) { showToast('Enter an amount.'); return; }
    try { await addPayment(incForm); await refresh(); setIncForm({ amount: '', method: 'cash', type: 'membership', note: '', memberId: '', date: todayISO() }); setShowIncome(false); showToast(`Income +$${incForm.amount}.`); }
    catch (err) { showToast(err.message || 'Could not record.'); }
  };

  // Same button for both sides of the ledger: income goes through
  // deletePayment, an expense through deleteExpense.
  const removeTransaction = (t) => askConfirm({
    message: `Delete this ${t.kind === 'in' ? 'income' : 'expense'} of $${t.amount}?`,
    detail: `${t.date} · ${(t.source || '').toUpperCase()}${t.who ? ` · ${t.who}` : ''}${t.detail ? ` · ${t.detail}` : ''}. It comes straight out of your totals. This can't be undone.`,
    confirmLabel: 'DELETE',
    danger: true,
    onConfirm: async () => {
      try {
        if (t.kind === 'in') await deletePayment(t.id); else await deleteExpense(t.id);
        await refresh();
        showToast('Transaction deleted.');
      } catch (err) { showToast(err.message || 'Could not delete.'); }
    },
  });

  const transactions = [
    ...pays.map((p) => ({ ...p, kind: 'in', source: TYPE_LABEL[p.type] || p.type || 'Other', who: memberName(p.memberId), detail: p.note })),
    ...exps.map((e) => ({ ...e, kind: 'out', source: e.category, who: '', detail: e.note })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 15);

  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="12" section="STUDIO · CASH FLOW" title="Money." subtitle="— measured, not guessed."
        action={<div className="flex gap-2"><Btn variant="forest" icon={Plus} onClick={() => setShowIncome(true)}>INCOME</Btn><Btn icon={Plus} onClick={() => setShowExpense(true)}>EXPENSE</Btn></div>} />

      {/* Period selector */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {period.mode === 'month' ? (
          <>
            <button onClick={() => setPeriod({ ...period, ym: shiftMonth(period.ym, -1) })} className="mono px-3 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.cream, color: C.ink, border: `1px solid ${C.charcoal}20` }}>←</button>
            <div className="ui-strong" style={{ fontSize: '22px', minWidth: 150, textAlign: 'center' }}>{monthLabel(period.ym)}</div>
            <button onClick={() => setPeriod({ ...period, ym: shiftMonth(period.ym, 1) })} className="mono px-3 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.cream, color: C.ink, border: `1px solid ${C.charcoal}20` }}>→</button>
          </>
        ) : <div className="ui-strong" style={{ fontSize: '22px' }}>All time</div>}
        <button onClick={() => setPeriod(period.mode === 'month' ? { mode: 'all' } : { mode: 'month', ym: todayISO().slice(0, 7) })} className="mono px-3 py-1.5 ml-2" style={{ fontSize: '11px', letterSpacing: '0.1em', background: period.mode === 'all' ? C.gold : 'transparent', color: period.mode === 'all' ? C.bone : C.moss, border: `1px solid ${C.charcoal}30` }}>{period.mode === 'all' ? '◉ ALL TIME' : 'ALL TIME'}</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <StatCard label="CASH ON HAND" value={`$${bal.cash.toLocaleString()}`} icon={Wallet} accent="gold" />
        <StatCard label="IN THE BANK" value={`$${bal.bank.toLocaleString()}`} icon={Wallet} accent="forest" />
        <StatCard label="TOTAL INCOME" value={`$${totalIncome.toLocaleString()}`} icon={ArrowUpRight} accent="ink" />
        <StatCard label="NET PROFIT" value={`$${net.toLocaleString()}`} icon={TrendingUp} accent="bone" />
      </div>
      <div className="mb-6 mono" style={{ fontSize: '12px', letterSpacing: '0.1em', color: C.moss }}>
        TOTAL ON HAND: <strong style={{ color: C.ink }}>${bal.total.toLocaleString()}</strong> · TOTAL EXPENSES: ${totalExpenses.toLocaleString()}{hasTaxes && <> · SALES TAX OWED: <strong style={{ color: C.gold }}>${taxOwed.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></>} · <button onClick={() => setView && setView('reports')} className="underline" style={{ color: C.moss }}>view full reports →</button> · <button onClick={() => setShowCategories(true)} className="underline" style={{ color: C.moss }}>manage categories</button> · <button onClick={() => setShowTaxes(true)} className="underline" style={{ color: C.moss }}>tax settings</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        {/* Revenue by source / action */}
        <div className="p-6" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
          <div className="serif-italic mb-4" style={{ fontSize: '28px' }}>Revenue by Source</div>
          {Object.keys(byType).length === 0 ? (
            <div className="ui-strong" style={{ fontSize: '18px', color: C.moss }}>No income recorded yet.</div>
          ) : (
            <div className="space-y-3">
              {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, amt]) => (
                <div key={t}>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="ui-strong" style={{ fontSize: '17px' }}>{TYPE_LABEL[t] || t}</span>
                    <span className="mono" style={{ fontSize: '14px', fontWeight: 600 }}>${amt.toLocaleString()} <span style={{ color: C.moss, fontWeight: 400 }}>· {Math.round((amt / totalIncome) * 100)}%</span></span>
                  </div>
                  <div className="h-1.5" style={{ background: C.bone }}><div className="h-full" style={{ width: `${(amt / totalIncome) * 100}%`, background: SOURCE_COLOR[t] || C.moss }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Revenue by member */}
        <div className="p-6" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
          <div className="serif-italic mb-4" style={{ fontSize: '28px' }}>Top Members by Revenue</div>
          {Object.keys(byMember).length === 0 && walkInIncome === 0 ? (
            <div className="ui-strong" style={{ fontSize: '18px', color: C.moss }}>No member income yet.</div>
          ) : (
            <div className="space-y-2.5">
              {Object.entries(byMember).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, amt]) => (
                <div key={id} className="flex items-baseline justify-between">
                  <span className="ui-strong truncate" style={{ fontSize: '17px', maxWidth: '70%' }}>{memberName(id) || 'Unknown'}</span>
                  <span className="mono" style={{ fontSize: '14px', fontWeight: 600 }}>${amt.toLocaleString()}</span>
                </div>
              ))}
              {walkInIncome > 0 && (
                <div className="flex items-baseline justify-between pt-2" style={{ borderTop: `1px solid ${C.charcoal}15` }}>
                  <span className="ui-strong" style={{ fontSize: '17px', color: C.moss }}>Walk-ins / unlinked</span>
                  <span className="mono" style={{ fontSize: '14px', fontWeight: 600, color: C.moss }}>${walkInIncome.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        <div className="p-6" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
          <div className="serif-italic mb-4" style={{ fontSize: '28px' }}>Income by Method</div>
          {Object.keys(byMethod).length === 0 ? (
            <div className="ui-strong" style={{ fontSize: '18px', color: C.moss }}>No income recorded yet.</div>
          ) : (
            <div className="space-y-3">
              {Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([m, amt]) => (
                <div key={m}>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="ui-strong" style={{ fontSize: '17px' }}>{METHOD_LABEL[m] || m}</span>
                    <span className="mono" style={{ fontSize: '14px', fontWeight: 600 }}>${amt.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5" style={{ background: C.bone }}><div className="h-full" style={{ width: `${(amt / totalIncome) * 100}%`, background: m === 'cash' ? C.forest : m === 'card' ? C.gold : C.moss }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
          <div className="serif-italic mb-4" style={{ fontSize: '28px' }}>Expenses by Category</div>
          {Object.keys(byCategory).length === 0 ? (
            <div className="ui-strong" style={{ fontSize: '18px', color: C.moss }}>No expenses recorded yet.</div>
          ) : (
            <div className="space-y-3">
              {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                <div key={cat}>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="ui-strong" style={{ fontSize: '17px' }}>{cat}</span>
                    <span className="mono" style={{ fontSize: '14px', fontWeight: 600 }}>${amt.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5" style={{ background: C.bone }}><div className="h-full" style={{ width: `${(amt / totalExpenses) * 100}%`, background: C.gold }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="p-6" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
        <div className="serif-italic mb-4" style={{ fontSize: '28px' }}>Recent Transactions</div>
        {transactions.length === 0 ? (
          <div className="ui-strong" style={{ fontSize: '18px', color: C.moss }}>No transactions yet.</div>
        ) : (
          <div className="space-y-1.5">
            {transactions.map((t) => (
              <div key={`${t.kind}-${t.id}`} className="flex items-center gap-3 py-2 group" style={{ borderBottom: `1px solid ${C.charcoal}10` }}>
                <div className="w-1 h-8" style={{ background: t.kind === 'in' ? C.forest : C.gold }} />
                <span className="mono px-1.5 py-0.5 shrink-0" style={{ fontSize: '10px', letterSpacing: '0.1em', background: t.kind === 'in' ? (SOURCE_COLOR[t.type] || C.sand) : C.bone, color: t.kind === 'in' && (t.type === 'membership' || t.type === 'dropin' || t.type === 'program') ? C.bone : C.ink }}>{(t.source || '').toUpperCase()}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate">{t.who || t.detail || (t.kind === 'in' ? 'Walk-in' : t.source)}</div>
                  <div className="mono" style={{ fontSize: '11px', color: C.moss }}>{t.date}{t.who && t.detail ? ` · ${t.detail}` : ''}{t.method ? ` · ${(t.method || '').toUpperCase()}` : ''}</div>
                </div>
                <div className="mono" style={{ fontSize: '13px', fontWeight: 600, color: t.kind === 'in' ? C.forest : C.charcoal }}>{t.kind === 'in' ? '+' : '−'}${t.amount}</div>
                {/* Income had no way out at all — only expenses could be
                    deleted. A renewal booked on a comped member, or any charge
                    entered twice, was stuck in the totals for good. */}
                <button onClick={() => removeTransaction(t)} className="p-1 shrink-0 md:opacity-55 md:group-hover:opacity-100 transition" title="Delete this transaction">
                  <Trash2 size={11} style={{ color: C.moss }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showExpense && (
        <Modal title="Record Expense" eyebrow="STUDIO · OUTFLOW" onClose={() => setShowExpense(false)} size="md">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="AMOUNT"><input value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} type="number" className={inputClass} style={inputStyle} /></Field>
              <Field label="CATEGORY">
                <select value={expForm.category} onChange={(e) => setExpForm({ ...expForm, category: e.target.value })} className={inputClass} style={inputStyle}>
                  {expenseCats.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="DATE"><input type="date" value={expForm.date} onChange={(e) => setExpForm({ ...expForm, date: e.target.value })} className={inputClass} style={inputStyle} /></Field>
              <Field label="PAID FROM">
                <div className="flex gap-1">
                  {[{ id: 'bank', label: 'BANK' }, { id: 'cash', label: 'CASH' }].map((a) => (
                    <button key={a.id} type="button" onClick={() => setExpForm({ ...expForm, paidFrom: a.id })} className="mono flex-1 py-2"
                      style={{ fontSize: '11px', letterSpacing: '0.1em', background: expForm.paidFrom === a.id ? C.gold : C.cream, color: expForm.paidFrom === a.id ? C.bone : C.moss, border: `1px solid ${C.charcoal}30` }}>{a.label}</button>
                  ))}
                </div>
              </Field>
            </div>
            <Field label="DESCRIPTION"><input value={expForm.note} onChange={(e) => setExpForm({ ...expForm, note: e.target.value })} className={inputClass} style={inputStyle} /></Field>
            <Btn full onClick={recordExpense}>RECORD EXPENSE</Btn>
          </div>
        </Modal>
      )}

      {showIncome && (
        <Modal title="Record Income" eyebrow="STUDIO · INFLOW" onClose={() => setShowIncome(false)} size="md">
          <div className="space-y-3">
            <div className="help text-center" style={{ fontSize: '14px', color: C.gold }}>— a cash/zelle/transfer payment for a membership, drop-in, etc.</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="AMOUNT"><input value={incForm.amount} onChange={(e) => setIncForm({ ...incForm, amount: e.target.value })} type="number" className={inputClass} style={inputStyle} /></Field>
              <Field label="TYPE">
                <select value={incForm.type} onChange={(e) => setIncForm({ ...incForm, type: e.target.value })} className={inputClass} style={inputStyle}>
                  {incomeCats.map((c) => <option key={c} value={c}>{TYPE_LABEL[c] || c}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="METHOD">
                <select value={incForm.method} onChange={(e) => setIncForm({ ...incForm, method: e.target.value })} className={inputClass} style={inputStyle}>
                  {['cash', 'card', 'zelle', 'transfer'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="MEMBER (OPTIONAL)">
                <select value={incForm.memberId} onChange={(e) => setIncForm({ ...incForm, memberId: e.target.value })} className={inputClass} style={inputStyle}>
                  <option value="">Walk-in / none</option>
                  {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="NOTE"><input value={incForm.note} onChange={(e) => setIncForm({ ...incForm, note: e.target.value })} className={inputClass} style={inputStyle} /></Field>
            <Btn full onClick={recordIncome}>RECORD INCOME</Btn>
          </div>
        </Modal>
      )}

      {showCategories && (
        <CategoriesModal
          categories={data.categories}
          incomeDefaults={INCOME_DEFAULTS}
          expenseDefaults={EXPENSE_DEFAULTS}
          onClose={() => setShowCategories(false)}
          refresh={refresh}
          showToast={showToast}
        />
      )}

      {showTaxes && (
        <TaxSettingsModal
          taxes={data.taxes}
          remittances={data.taxRemittances}
          incomeCats={incomeCats}
          payable={taxPayable(data.payments, data.taxRemittances, data.taxes)}
          periodCollected={periodTax.collected}
          onClose={() => setShowTaxes(false)}
          refresh={refresh}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function TaxSettingsModal({ taxes, remittances, incomeCats, payable, periodCollected, onClose, refresh, showToast }) {
  const blank = { name: 'Sales Tax', rate: '8.25', appliesTo: [], effectiveFrom: todayISO(), enabled: true };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [remit, setRemit] = useState({ amount: '', date: todayISO(), note: '', paidFrom: 'bank' });

  const toggleSource = (src) => setForm((f) => ({ ...f, appliesTo: f.appliesTo.includes(src) ? f.appliesTo.filter((s) => s !== src) : [...f.appliesTo, src] }));
  const save = async () => {
    if (!form.name.trim()) { showToast('Name the tax.'); return; }
    if (!form.appliesTo.length) { showToast('Pick at least one source it applies to.'); return; }
    try { await saveTax(form, editing); await refresh(); setForm(blank); setEditing(null); showToast(editing ? 'Tax updated.' : 'Tax added.'); }
    catch (err) { showToast(err.message || 'Could not save.'); }
  };
  const edit = (t) => { setEditing(t.id); setForm({ name: t.name, rate: String(t.rate), appliesTo: t.appliesTo || [], effectiveFrom: t.effectiveFrom, enabled: t.enabled }); };
  const del = async (id) => { try { await deleteTax(id); await refresh(); if (editing === id) { setEditing(null); setForm(blank); } } catch (err) { showToast(err.message || 'Could not delete.'); } };
  const flip = async (t) => { try { await toggleTax(t.id, t.enabled); await refresh(); } catch (err) { showToast(err.message || 'Could not toggle.'); } };
  const saveRemit = async () => {
    if (!remit.amount) { showToast('Enter an amount.'); return; }
    try { await addRemittance(remit); await refresh(); setRemit({ amount: '', date: todayISO(), note: '', paidFrom: 'bank' }); showToast('Remittance recorded.'); }
    catch (err) { showToast(err.message || 'Could not record.'); }
  };
  const delRemit = async (id) => { try { await deleteRemittance(id); await refresh(); } catch (err) { showToast(err.message || 'Could not delete.'); } };

  return (
    <Modal title="Tax Settings" eyebrow="STUDIO · TAXES" onClose={onClose} size="lg">
      <div className="space-y-5">
        <div className="help text-center" style={{ fontSize: '14px', color: C.gold }}>— define a tax, choose which income it applies to. The tax is carved out of that revenue and tracked as owed to the state. Built for products; confirm with your CPA what's taxable.</div>

        {/* Owed summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3" style={{ background: C.cream, color: C.ink }}>
            <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.sand }}>TAX OWED (ALL TIME)</div>
            <div className="display" style={{ fontSize: '26px', fontWeight: 600, color: C.gold }}>${payable.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          </div>
          <div className="p-3" style={{ background: C.bone }}>
            <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>COLLECTED (THIS PERIOD)</div>
            <div className="display" style={{ fontSize: '26px', fontWeight: 600 }}>${periodCollected.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          </div>
        </div>

        {/* Add / edit a tax rule */}
        <div className="p-4" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
          <div className="mono mb-3" style={{ fontSize: '11px', letterSpacing: '0.14em', color: C.gold }}>{editing ? 'EDIT TAX' : 'NEW TAX'}</div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="col-span-2"><Field label="NAME"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} style={inputStyle} /></Field></div>
            <Field label="RATE %"><input type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} className={inputClass} style={inputStyle} /></Field>
          </div>
          <div className="mono mb-1.5" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>APPLIES TO</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {incomeCats.map((src) => {
              const on = form.appliesTo.includes(src);
              return (
                <button key={src} type="button" onClick={() => toggleSource(src)} className="mono px-2.5 py-1.5" style={{ fontSize: '11px', letterSpacing: '0.05em', background: on ? C.forest : C.cream, color: on ? C.ink : C.moss, border: `1px solid ${C.charcoal}30` }}>
                  {(TYPE_LABEL[src] || src).toUpperCase()}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 items-end">
            <Field label="EFFECTIVE FROM"><input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} className={inputClass} style={inputStyle} /></Field>
            <div className="flex gap-2">
              <Btn full icon={Plus} onClick={save}>{editing ? 'UPDATE' : 'ADD TAX'}</Btn>
              {editing && <Btn variant="ghost" onClick={() => { setEditing(null); setForm(blank); }}>CANCEL</Btn>}
            </div>
          </div>
          <div className="help mt-2" style={{ fontSize: '13px', color: C.moss }}>— effective date keeps past sales (before you owed tax) out of the total.</div>
        </div>

        {/* Existing rules */}
        {taxes.length > 0 && (
          <div className="space-y-1">
            {taxes.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2" style={{ background: C.bone, border: `1px solid ${C.charcoal}15`, opacity: t.enabled ? 1 : 0.5 }}>
                <div className="flex-1 min-w-0">
                  <div className="ui-strong truncate" style={{ fontSize: '17px' }}>{t.name} · {t.rate}%</div>
                  <div className="mono" style={{ fontSize: '11px', color: C.moss }}>{(t.appliesTo || []).map((s) => (TYPE_LABEL[s] || s)).join(', ') || 'no sources'} · from {t.effectiveFrom}</div>
                </div>
                <button onClick={() => flip(t)} className="mono px-2 py-1" style={{ fontSize: '10px', letterSpacing: '0.1em', background: t.enabled ? C.forest : C.sand, color: t.enabled ? C.ink : C.bone }}>{t.enabled ? 'ON' : 'OFF'}</button>
                <button onClick={() => edit(t)} className="p-1" style={{ background: C.cream, border: `1px solid ${C.charcoal}40` }}><Edit2 size={11} /></button>
                <button onClick={() => del(t.id)} className="p-1" style={{ background: C.sand, color: C.bone }}><Trash2 size={11} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Remittances */}
        <div className="p-4" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
          <div className="mono mb-3" style={{ fontSize: '11px', letterSpacing: '0.14em', color: C.gold }}>RECORD A REMITTANCE (PAY THE STATE)</div>
          <div className="grid grid-cols-4 gap-2 items-end">
            <Field label="AMOUNT"><input type="number" value={remit.amount} onChange={(e) => setRemit({ ...remit, amount: e.target.value })} className={inputClass} style={inputStyle} /></Field>
            <Field label="DATE"><input type="date" value={remit.date} onChange={(e) => setRemit({ ...remit, date: e.target.value })} className={inputClass} style={inputStyle} /></Field>
            <Field label="FROM">
              <select value={remit.paidFrom} onChange={(e) => setRemit({ ...remit, paidFrom: e.target.value })} className={inputClass} style={inputStyle}><option value="bank">Bank</option><option value="cash">Cash</option></select>
            </Field>
            <Btn full onClick={saveRemit}>RECORD</Btn>
          </div>
          {remittances.length > 0 && (
            <div className="space-y-1 mt-3 max-h-32 overflow-y-auto">
              {[...remittances].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((rr) => (
                <div key={rr.id} className="flex items-center justify-between px-2 py-1.5" style={{ background: C.bone }}>
                  <span className="mono" style={{ fontSize: '11px', color: C.moss }}>{rr.date} · {rr.paidFrom.toUpperCase()}</span>
                  <div className="flex items-center gap-2"><span className="mono" style={{ fontSize: '13px', fontWeight: 600 }}>${rr.amount.toLocaleString()}</span><button onClick={() => delRemit(rr.id)} className="p-1" style={{ background: C.sand, color: C.bone }}><Trash2 size={10} /></button></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function CategoriesModal({ categories, incomeDefaults, expenseDefaults, onClose, refresh, showToast }) {
  const [form, setForm] = useState({ kind: 'expense', name: '' });
  const add = async () => {
    if (!form.name.trim()) { showToast('Enter a name.'); return; }
    try { await addCategory(form); await refresh(); setForm({ kind: form.kind, name: '' }); }
    catch (err) { showToast(err.message || 'Could not add.'); }
  };
  const del = async (id) => { try { await deleteCategory(id); await refresh(); } catch (err) { showToast(err.message || 'Could not delete.'); } };

  return (
    <Modal title="Categories" eyebrow="STUDIO · INCOME & EXPENSES" onClose={onClose} size="md">
      <div className="space-y-4">
        <div className="help text-center" style={{ fontSize: '14px', color: C.gold }}>— add your own income sources and expense categories. The built-in ones (grey) always stay available.</div>
        <div className="grid grid-cols-4 gap-2 items-end">
          <Field label="FOR">
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={inputClass} style={inputStyle}><option value="expense">Expense</option><option value="income">Income</option></select>
          </Field>
          <div className="col-span-3"><Field label="NEW CATEGORY"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Retreat, Rent, Sponsorship…" className={inputClass} style={inputStyle} onKeyDown={(e) => e.key === 'Enter' && add()} /></Field></div>
        </div>
        <Btn full icon={Plus} onClick={add}>ADD CATEGORY</Btn>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2" style={{ borderTop: `1px solid ${C.charcoal}15` }}>
          <CategoryGroup title="INCOME SOURCES" categories={categories} kind="income" defaults={incomeDefaults} onDelete={del} />
          <CategoryGroup title="EXPENSE CATEGORIES" categories={categories} kind="expense" defaults={expenseDefaults} onDelete={del} />
        </div>
      </div>
    </Modal>
  );
}

function CategoryGroup({ title, categories, kind, defaults, onDelete }) {
  const custom = categories.filter((c) => c.kind === kind);
  return (
    <div>
      <div className="mono mb-2" style={{ fontSize: '11px', letterSpacing: '0.14em', color: C.gold }}>{title}</div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {defaults.map((d) => (
          <span key={d} className="mono px-2 py-1" style={{ fontSize: '11px', letterSpacing: '0.05em', background: C.bone, color: C.moss, border: `1px solid ${C.charcoal}15` }}>{(TYPE_LABEL[d] || d).toUpperCase()}</span>
        ))}
      </div>
      {custom.length === 0 ? (
        <div className="ui-strong" style={{ fontSize: '15px', color: C.moss }}>No custom ones yet.</div>
      ) : (
        <div className="space-y-1">
          {custom.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-3 py-1.5" style={{ background: C.bone, border: `1px solid ${C.charcoal}15` }}>
              <span className="ui-strong" style={{ fontSize: '16px' }}>{c.name}</span>
              <button onClick={() => onDelete(c.id)} className="p-1" style={{ background: C.sand, color: C.bone }}><Trash2 size={11} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
