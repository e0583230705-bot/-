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
  const recognizedExpenses = sum(
    exp.map((e) => {
      const nonDeductibleVat = e.vat - applyPercent(e.vat, e.vatDeductiblePct);
      return applyPercent(e.net + nonDeductibleVat, e.taxDeductiblePct);
    }),
  );
  return {
    period,
    revenue,
    expensesTotal: sum(exp.map((e) => e.net + e.vat)),
    recognizedExpenses,
    profit: revenue - recognizedExpenses,
  };
}
