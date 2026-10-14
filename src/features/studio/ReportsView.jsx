import { useState } from 'react';
import { Printer, Plus, Trash2 } from 'lucide-react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast } from '../../components/feedback';
import { addBalanceItem, deleteBalanceItem } from '../../data/studio';
import { todayISO } from '../../lib/helpers';
import { profitAndLoss, cashFlow, balances, monthRange, shiftMonth, monthLabel, taxPayable } from '../../lib/financeHelpers';
import { PageHeader, Btn, Modal, Field } from '../../components/ui';
import { inputClass, inputStyle } from '../../components/uiStyles';

// ============================================================
//  REPORTS VIEW — staff financial statements (P&L, cash flow, balance sheet).
//  Reads payments/expenses/products/taxes/balanceItems via useData(); computes
//  statements over a month/year/all period with lib/financeHelpers and prints to PDF.
//  Manual balance-sheet assets/liabilities are edited via data/studio.
// ============================================================
export default function ReportsView() {
  const { data, refresh } = useData();
  const showToast = useToast();
  const today = todayISO();
  const [mode, setMode] = useState('month'); // month | year | all
  const [ym, setYm] = useState(today.slice(0, 7));
  const [showManage, setShowManage] = useState(false);

  const yr = Number(ym.slice(0, 4));
  const range = mode === 'month' ? { ...monthRange(ym), label: monthLabel(ym) }
    : mode === 'year' ? { start: `${yr}-01-01`, end: `${yr}-12-31`, label: `${yr}` }
    : { start: null, end: today, label: 'All time' };

  const pnl = profitAndLoss(data.payments, data.expenses, range.start, range.end, data.taxes);
  const cf = cashFlow(data.payments, data.expenses, range.start, range.end, data.taxRemittances);
  const bal = balances(data.payments, data.expenses, range.end, data.taxRemittances);
  const taxOwed = taxPayable(data.payments, data.taxRemittances, data.taxes, range.end);

  const manualAssets = data.balanceItems.filter((b) => b.kind === 'asset');
  const manualLiab = data.balanceItems.filter((b) => b.kind === 'liability');
  const assetRows = [
    { label: 'Cash on hand', amount: bal.cash },
    { label: 'Bank', amount: bal.bank },
    ...manualAssets.map((a) => ({ label: a.name, amount: a.amount })),
  ];
  const liabRows = [
    ...(Math.abs(taxOwed) > 0.005 ? [{ label: 'Sales tax payable', amount: taxOwed }] : []),
    ...manualLiab.map((l) => ({ label: l.name, amount: l.amount })),
  ];
  const totalAssets = assetRows.reduce((s, a) => s + a.amount, 0);
  const totalLiab = liabRows.reduce((s, l) => s + l.amount, 0);
  const equity = totalAssets - totalLiab;

  const money = (n) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="14" section="STUDIO · ACCOUNTING" title="Reports."
        subtitle="— profit & loss · balance sheet · cash flow."
        action={<button onClick={() => window.print()} className="mono px-4 py-3 flex items-center gap-2 no-print" style={{ fontSize: '12px', letterSpacing: '0.1em', background: C.cream, border: `1px solid ${C.charcoal}40`, color: C.gold }}><Printer size={14} /> PRINT / PDF</button>} />

      {/* Period selector */}
      <div className="flex items-center gap-2 mb-6 flex-wrap no-print">
        {[{ id: 'month', label: 'MONTH' }, { id: 'year', label: 'YEAR' }, { id: 'all', label: 'ALL TIME' }].map((p) => (
          <button key={p.id} onClick={() => setMode(p.id)} className="mono px-3 py-2" style={{ fontSize: '11px', letterSpacing: '0.1em', background: mode === p.id ? C.gold : C.cream, color: mode === p.id ? C.bone : C.moss, border: `1px solid ${C.charcoal}20` }}>{p.label}</button>
        ))}
        {mode === 'month' && (
          <div className="flex items-center gap-2 ml-2">
            <button onClick={() => setYm(shiftMonth(ym, -1))} className="mono px-3 py-1.5" style={{ fontSize: '11px', background: C.cream, border: `1px solid ${C.charcoal}20` }}>←</button>
            <span className="ui-strong" style={{ fontSize: '18px', minWidth: 120, textAlign: 'center' }}>{monthLabel(ym)}</span>
            <button onClick={() => setYm(shiftMonth(ym, 1))} className="mono px-3 py-1.5" style={{ fontSize: '11px', background: C.cream, border: `1px solid ${C.charcoal}20` }}>→</button>
          </div>
        )}
        {mode === 'year' && (
          <div className="flex items-center gap-2 ml-2">
            <button onClick={() => setYm(shiftMonth(ym, -12))} className="mono px-3 py-1.5" style={{ fontSize: '11px', background: C.cream, border: `1px solid ${C.charcoal}20` }}>←</button>
            <span className="ui-strong" style={{ fontSize: '18px', minWidth: 70, textAlign: 'center' }}>{yr}</span>
            <button onClick={() => setYm(shiftMonth(ym, 12))} className="mono px-3 py-1.5" style={{ fontSize: '11px', background: C.cream, border: `1px solid ${C.charcoal}20` }}>→</button>
          </div>
        )}
      </div>

      <div className="mb-6 hidden print:block">
        <div className="serif-italic" style={{ fontSize: '28px' }}>Bustillo Performance — Financial Statements</div>
        <div className="mono" style={{ fontSize: '12px', color: C.moss }}>{range.label.toUpperCase()}</div>
      </div>

      <div className="space-y-4">
        {/* PROFIT & LOSS */}
        <Statement title="Profit & Loss" sub={range.label}>
          <Section label="REVENUE" rows={pnl.income} money={money} />
          <Total label="Total Revenue" value={pnl.incomeTotal} money={money} />
          {pnl.taxCollected > 0.005 && <div className="flex items-baseline justify-between py-1" style={{ fontSize: '11px' }}><span className="mono" style={{ color: C.moss }}>+ sales tax collected (held, not revenue)</span><span className="mono" style={{ color: C.sand }}>{money(pnl.taxCollected)}</span></div>}
          <Section label="EXPENSES" rows={pnl.expenses} money={money} className="mt-3" />
          <Total label="Total Expenses" value={pnl.expenseTotal} money={money} />
          <Grand label="NET PROFIT" value={pnl.net} money={money} good={pnl.net >= 0} />
        </Statement>

        {/* CASH FLOW */}
        <Statement title="Cash Flow" sub={range.label}>
          <Section label="CASH IN (by method)" rows={cf.inByMethod} money={money} />
          <Total label="Total In" value={cf.inflow} money={money} />
          <div className="flex items-baseline justify-between py-1.5 mt-3"><span className="ui-strong" style={{ fontSize: '17px' }}>Total Out (expenses)</span><span className="mono" style={{ fontSize: '14px', fontWeight: 600 }}>({money(cf.outflow)})</span></div>
          <Grand label="NET CASH FLOW" value={cf.net} money={money} good={cf.net >= 0} />
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="p-2" style={{ background: C.bone }}><div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>NET TO CASH</div><div className="mono" style={{ fontSize: '15px', fontWeight: 600 }}>{money(cf.cashNet)}</div></div>
            <div className="p-2" style={{ background: C.bone }}><div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>NET TO BANK</div><div className="mono" style={{ fontSize: '15px', fontWeight: 600 }}>{money(cf.bankNet)}</div></div>
          </div>
        </Statement>

        {/* BALANCE SHEET */}
        <Statement title="Balance Sheet" sub={`as of ${range.end}`}
          action={<button onClick={() => setShowManage(true)} className="mono px-3 py-1.5 no-print" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.gold, color: C.bone }}>+ MANAGE ITEMS</button>}>
          <Section label="ASSETS" rows={assetRows} money={money} />
          <Total label="Total Assets" value={totalAssets} money={money} />
          <Section label="LIABILITIES" rows={liabRows.length ? liabRows : [{ label: 'None', amount: 0 }]} money={money} className="mt-3" />
          <Total label="Total Liabilities" value={totalLiab} money={money} />
          <Grand label="OWNER'S EQUITY" value={equity} money={money} good />
          <div className="help mt-2 no-print" style={{ fontSize: '13px', color: C.moss }}>— equity = assets − liabilities. add equipment, loans, etc. with "manage items".</div>
        </Statement>
      </div>

      {showManage && <ManageItemsModal items={data.balanceItems} onClose={() => setShowManage(false)} refresh={refresh} showToast={showToast} />}
    </div>
  );
}

function Statement({ title, sub, action, children }) {
  return (
    <div className="p-6" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
      <div className="flex items-baseline justify-between mb-4" style={{ borderBottom: `1px solid ${C.charcoal}20`, paddingBottom: '8px' }}>
        <div className="serif-italic" style={{ fontSize: '28px' }}>{title}</div>
        <div className="flex items-center gap-3">
          <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>{(sub || '').toUpperCase()}</div>
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}

function Section({ label, rows, money, className = '' }) {
  return (
    <div className={className}>
      <div className="mono mb-1.5" style={{ fontSize: '11px', letterSpacing: '0.14em', color: C.gold }}>{label}</div>
      {rows.length === 0 ? <div className="ui-strong" style={{ fontSize: '15px', color: C.moss }}>— none —</div>
        : rows.map((rr, i) => (
          <div key={i} className="flex items-baseline justify-between py-1" style={{ borderBottom: `1px solid ${C.charcoal}10` }}>
            <span className="text-sm" style={{ color: C.ink }}>{rr.label}</span>
            <span className="mono" style={{ fontSize: '13px' }}>{money(rr.amount)}</span>
          </div>
        ))}
    </div>
  );
}

function Total({ label, value, money }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 mt-1" style={{ borderTop: `1px solid ${C.charcoal}30` }}>
      <span className="mono" style={{ fontSize: '12px', letterSpacing: '0.1em', fontWeight: 600 }}>{label}</span>
      <span className="mono" style={{ fontSize: '14px', fontWeight: 600 }}>{money(value)}</span>
    </div>
  );
}

function Grand({ label, value, money, good }) {
  return (
    <div className="flex items-baseline justify-between pt-3 mt-2" style={{ borderTop: `2px solid ${C.ink}` }}>
      <span className="display" style={{ fontSize: '16px', fontWeight: 600 }}>{label}</span>
      <span className="display" style={{ fontSize: '24px', fontWeight: 600, color: good ? C.forest : C.gold }}>{money(value)}</span>
    </div>
  );
}

function ManageItemsModal({ items, onClose, refresh, showToast }) {
  const [form, setForm] = useState({ kind: 'asset', name: '', amount: '' });
  const add = async () => {
    if (!form.name || form.amount === '') { showToast('Name and amount required.'); return; }
    try { await addBalanceItem(form); await refresh(); setForm({ kind: form.kind, name: '', amount: '' }); }
    catch (err) { showToast(err.message || 'Could not add.'); }
  };
  const del = async (id) => { try { await deleteBalanceItem(id); await refresh(); } catch (err) { showToast(err.message || 'Could not delete.'); } };

  return (
    <Modal title="Assets & Liabilities" eyebrow="ACCOUNTING · BALANCE SHEET" onClose={onClose} size="md">
      <div className="space-y-3">
        <div className="help text-center" style={{ fontSize: '14px', color: C.gold }}>— add things you own (equipment, deposits) and what you owe (loans, payables). Cash, bank & inventory are automatic.</div>
        <div className="grid grid-cols-4 gap-2 items-end">
          <Field label="TYPE">
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={inputClass} style={inputStyle}><option value="asset">Asset</option><option value="liability">Liability</option></select>
          </Field>
          <div className="col-span-2"><Field label="NAME"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Equipment / Loan…" className={inputClass} style={inputStyle} /></Field></div>
          <Field label="AMOUNT"><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputClass} style={inputStyle} /></Field>
        </div>
        <Btn full onClick={add}><Plus size={12} /> ADD ITEM</Btn>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {items.length === 0 && <div className="ui-strong text-center py-3" style={{ fontSize: '16px', color: C.moss }}>No manual items yet.</div>}
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between px-3 py-2" style={{ background: C.bone, border: `1px solid ${C.charcoal}15` }}>
              <div><span className="mono px-1.5 py-0.5 mr-2" style={{ fontSize: '10px', letterSpacing: '0.1em', background: it.kind === 'asset' ? C.forest : C.gold, color: it.kind === 'asset' ? C.ink : C.bone }}>{it.kind.toUpperCase()}</span><span className="ui-strong" style={{ fontSize: '16px' }}>{it.name}</span></div>
              <div className="flex items-center gap-2"><span className="mono" style={{ fontSize: '14px', fontWeight: 600 }}>${it.amount.toLocaleString()}</span><button onClick={() => del(it.id)} className="p-1" style={{ background: C.sand, color: C.bone }}><Trash2 size={11} /></button></div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
