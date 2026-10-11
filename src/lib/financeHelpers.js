// ============================================================
//  FINANCE HELPERS — balances + report computations.
//  Income account is derived from payment.method: cash → cash; everything else
//  (card/Stripe, zelle, transfer) → bank. Expenses carry paidFrom (cash|bank).
// ============================================================
const isCash = (method) => method === 'cash';
const inRange = (d, start, end) => (!start || d >= start) && (!end || d <= end);

const TYPE_LABEL = { membership: 'Memberships', pos: 'Retail / POS', dropin: 'Drop-ins', program: 'Online Programs', other: 'Other' };
const METHOD_LABEL = { cash: 'Cash', card: 'Card / Stripe', zelle: 'Zelle', transfer: 'Transfer', other: 'Other' };

function sum(arr, f) { return arr.reduce((s, x) => s + f(x), 0); }
function groupSum(arr, key, val) {
  return arr.reduce((acc, x) => { const k = x[key] || 'other'; acc[k] = (acc[k] || 0) + val(x); return acc; }, {});
}

// Cash & bank balances as of a date (inclusive). Omit asOf for all-time.
// Tax remittances (paying collected tax to the state) reduce cash/bank too.
export function balances(payments, expenses, asOf, remittances = []) {
  const pay = payments.filter((p) => inRange(p.date, null, asOf));
  const exp = expenses.filter((e) => inRange(e.date, null, asOf));
  const rem = (remittances || []).filter((r) => inRange(r.date, null, asOf));
  const cashIn = sum(pay.filter((p) => isCash(p.method)), (p) => p.amount);
  const bankIn = sum(pay.filter((p) => !isCash(p.method)), (p) => p.amount);
  const cashOut = sum(exp.filter((e) => e.paidFrom === 'cash'), (e) => e.amount) + sum(rem.filter((r) => r.paidFrom === 'cash'), (r) => r.amount);
  const bankOut = sum(exp.filter((e) => e.paidFrom !== 'cash'), (e) => e.amount) + sum(rem.filter((r) => r.paidFrom !== 'cash'), (r) => r.amount);
  const cash = cashIn - cashOut;
  const bank = bankIn - bankOut;
  return { cash, bank, total: cash + bank };
}

// ---- Configurable taxes ----
// Tax is treated as INCLUDED in the recorded amount: the portion carved out of
// revenue and owed to the state. A rule applies if it's enabled, lists the
// payment's source type, and the payment is dated on/after its effective date.
export function taxRateFor(type, date, taxes) {
  return (taxes || [])
    .filter((t) => t.enabled && (t.appliesTo || []).includes(type) && (!t.effectiveFrom || (date || '') >= t.effectiveFrom))
    .reduce((s, t) => s + (Number(t.rate) || 0), 0);
}
export function taxForPayment(p, taxes) {
  const rate = taxRateFor(p.type, p.date, taxes);
  if (!rate) return 0;
  return Math.round((p.amount * rate / (100 + rate)) * 100) / 100; // tax-inclusive portion
}
// Tax collected vs remitted in a period.
export function taxSummary(payments, remittances, taxes, start, end) {
  const collected = payments.filter((p) => inRange(p.date, start, end)).reduce((s, p) => s + taxForPayment(p, taxes), 0);
  const remitted = (remittances || []).filter((r) => inRange(r.date, start, end)).reduce((s, r) => s + r.amount, 0);
  return { collected, remitted };
}
// Outstanding liability as of a date: all tax collected minus all remitted.
export function taxPayable(payments, remittances, taxes, asOf) {
  const collected = payments.filter((p) => inRange(p.date, null, asOf)).reduce((s, p) => s + taxForPayment(p, taxes), 0);
  const remitted = (remittances || []).filter((r) => inRange(r.date, null, asOf)).reduce((s, r) => s + r.amount, 0);
  return collected - remitted;
}


// Profit & Loss for a period. Revenue is shown NET of any tax collected (tax is
// a liability, not income). `taxCollected` is reported separately.
export function profitAndLoss(payments, expenses, start, end, taxes = []) {
  const pay = payments.filter((p) => inRange(p.date, start, end));
  const exp = expenses.filter((e) => inRange(e.date, start, end));
  const netOf = (p) => p.amount - taxForPayment(p, taxes);
  const incomeByType = groupSum(pay, 'type', netOf);
  const expenseByCategory = groupSum(exp, 'category', (e) => e.amount);
  const incomeTotal = sum(pay, netOf);
  const expenseTotal = sum(exp, (e) => e.amount);
  const taxCollected = sum(pay, (p) => taxForPayment(p, taxes));
  return {
    income: Object.entries(incomeByType).map(([k, v]) => ({ label: TYPE_LABEL[k] || k, amount: v })).sort((a, b) => b.amount - a.amount),
    incomeTotal,
    expenses: Object.entries(expenseByCategory).map(([k, v]) => ({ label: k, amount: v })).sort((a, b) => b.amount - a.amount),
    expenseTotal,
    taxCollected,
    net: incomeTotal - expenseTotal,
  };
}

// Cash flow for a period (operating in/out, split by cash vs bank). Tax
// remittances count as cash out.
export function cashFlow(payments, expenses, start, end, remittances = []) {
  const pay = payments.filter((p) => inRange(p.date, start, end));
  const exp = expenses.filter((e) => inRange(e.date, start, end));
  const rem = (remittances || []).filter((r) => inRange(r.date, start, end));
  const inByMethod = groupSum(pay, 'method', (p) => p.amount);
  const inflow = sum(pay, (p) => p.amount);
  const outflow = sum(exp, (e) => e.amount) + sum(rem, (r) => r.amount);
  const cashNet = sum(pay.filter((p) => isCash(p.method)), (p) => p.amount) - sum(exp.filter((e) => e.paidFrom === 'cash'), (e) => e.amount) - sum(rem.filter((r) => r.paidFrom === 'cash'), (r) => r.amount);
  const bankNet = sum(pay.filter((p) => !isCash(p.method)), (p) => p.amount) - sum(exp.filter((e) => e.paidFrom !== 'cash'), (e) => e.amount) - sum(rem.filter((r) => r.paidFrom !== 'cash'), (r) => r.amount);
  return {
    inflow,
    outflow,
    net: inflow - outflow,
    cashNet,
    bankNet,
    inByMethod: Object.entries(inByMethod).map(([k, v]) => ({ label: METHOD_LABEL[k] || k, amount: v })).sort((a, b) => b.amount - a.amount),
  };
}

// ---- Month helpers for the period selectors ----
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function monthRange(ym) {
  const [yy, mm] = ym.split('-').map(Number);
  const last = new Date(yy, mm, 0).getDate();
  return { start: `${ym}-01`, end: `${ym}-${String(last).padStart(2, '0')}` };
}
export function shiftMonth(ym, delta) {
  let [yy, mm] = ym.split('-').map(Number);
  mm += delta;
  while (mm < 1) { mm += 12; yy--; }
  while (mm > 12) { mm -= 12; yy++; }
  return `${yy}-${String(mm).padStart(2, '0')}`;
}
export function monthLabel(ym) { const [yy, mm] = ym.split('-').map(Number); return `${MON[mm - 1]} ${yy}`; }

export { TYPE_LABEL, METHOD_LABEL };
