import { type Agorot, applyPercent, sum } from "./money";
import type { ISODate } from "./vat";

export interface IncomeEntry {
  date: ISODate;
  net: Agorot;
  vat: Agorot;
  /** חשבונית זיכוי — מקטינה את ההכנסה */
  isCredit: boolean;
}

export interface ExpenseEntry {
  date: ISODate;
  /** שם הקטגוריה — לפילוח בדוחות */
  category?: string;
  net: Agorot;
  vat: Agorot;
  taxDeductiblePct: number;
  vatDeductiblePct: number;
}

export interface Period {
  from: ISODate;
  to: ISODate;
}

function inPeriod(date: ISODate, p: Period) {
  return date >= p.from && date <= p.to;
}

const signed = (e: IncomeEntry, v: Agorot) => (e.isCredit ? -v : v);

export interface VatReport {
  period: Period;
  salesNet: Agorot;
  outputVat: Agorot;
  inputsNet: Agorot;
  inputVat: Agorot;
  /** חיובי — לתשלום; שלילי — החזר */
  vatDue: Agorot;
}

export function computeVatReport(
  period: Period,
  income: IncomeEntry[],
  expenses: ExpenseEntry[],
): VatReport {
  const inc = income.filter((e) => inPeriod(e.date, period));
  const exp = expenses.filter((e) => inPeriod(e.date, period));
  const outputVat = sum(inc.map((e) => signed(e, e.vat)));
  const inputVat = sum(exp.map((e) => applyPercent(e.vat, e.vatDeductiblePct)));
  return {
    period,
    salesNet: sum(inc.map((e) => signed(e, e.net))),
    outputVat,
    inputsNet: sum(exp.map((e) => e.net)),
    inputVat,
    vatDue: outputVat - inputVat,
  };
}

export interface ProfitAndLoss {
  period: Period;
  revenue: Agorot;
  expensesTotal: Agorot;
  /** החלק המוכר למס, כולל מע"מ שלא קוזז (שהופך לחלק מההוצאה) */
  recognizedExpenses: Agorot;
  profit: Agorot;
}

export function computeProfitAndLoss(
  period: Period,
  income: IncomeEntry[],
  expenses: ExpenseEntry[],
): ProfitAndLoss {
  const inc = income.filter((e) => inPeriod(e.date, period));
  const exp = expenses.filter((e) => inPeriod(e.date, period));
  const revenue = sum(inc.map((e) => signed(e, e.net)));
  const recognizedExpenses = sum(exp.map(recognizedAmount));
  return {
    period,
    revenue,
    expensesTotal: sum(exp.map((e) => e.net + e.vat)),
    recognizedExpenses,
    profit: revenue - recognizedExpenses,
  };
}

/** ההוצאה המוכרת למס מתוך תנועת הוצאה אחת (כולל מע"מ שלא קוזז) */
export function recognizedAmount(e: ExpenseEntry): Agorot {
  const nonDeductibleVat = e.vat - applyPercent(e.vat, e.vatDeductiblePct);
  return applyPercent(e.net + nonDeductibleVat, e.taxDeductiblePct);
}

export interface MonthRow {
  month: number;
  revenue: Agorot;
  recognizedExpenses: Agorot;
  profit: Agorot;
  outputVat: Agorot;
  inputVat: Agorot;
}

export function monthlyBreakdown(year: number, income: IncomeEntry[], expenses: ExpenseEntry[]): MonthRow[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const to = `${year}-${String(month).padStart(2, "0")}-31`;
    const pl = computeProfitAndLoss({ from, to }, income, expenses);
    const vat = computeVatReport({ from, to }, income, expenses);
    return {
      month,
      revenue: pl.revenue,
      recognizedExpenses: pl.recognizedExpenses,
      profit: pl.profit,
      outputVat: vat.outputVat,
      inputVat: vat.inputVat,
    };
  });
}

export interface CategoryRow {
  category: string;
  total: Agorot;
  recognized: Agorot;
  count: number;
}

export function expensesByCategory(period: Period, expenses: ExpenseEntry[]): CategoryRow[] {
  const rows = new Map<string, CategoryRow>();
  for (const e of expenses.filter((x) => inPeriod(x.date, period))) {
    const key = e.category ?? "ללא קטגוריה";
    const row = rows.get(key) ?? { category: key, total: 0, recognized: 0, count: 0 };
    row.total += e.net + e.vat;
    row.recognized += recognizedAmount(e);
    row.count += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.recognized - a.recognized);
}
