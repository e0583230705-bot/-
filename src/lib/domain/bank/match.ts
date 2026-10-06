import type { Agorot } from "../money";
import type { ISODate } from "../vat";

/**
 * הצעות התאמה בין תנועות בנק למסמכים ולהוצאות שכבר במערכת.
 * זיכוי (כסף נכנס) ← מסמך הכנסה באותו סכום, עד 90 יום אחרי תאריך המסמך.
 * חובה (כסף יוצא) ← הוצאה באותו סכום, עד 10 ימים לפני או אחרי.
 */

export interface TxForMatch {
  id: string;
  date: ISODate;
  amount: Agorot;
}
export interface DocForMatch {
  id: string;
  issueDate: ISODate;
  gross: Agorot;
  label: string;
}
export interface ExpenseForMatch {
  id: string;
  date: ISODate;
  gross: Agorot;
  label: string;
}

export type Suggestion =
  | { kind: "document"; id: string; label: string }
  | { kind: "expense"; id: string; label: string };

const DAY = 24 * 60 * 60 * 1000;
const daysBetween = (from: ISODate, to: ISODate) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

export function suggestMatches(
  transactions: TxForMatch[],
  documents: DocForMatch[],
  expenses: ExpenseForMatch[],
): Map<string, Suggestion> {
  const result = new Map<string, Suggestion>();
  const usedDocs = new Set<string>();
  const usedExpenses = new Set<string>();

  // התנועות הישנות קודם, וכל מועמד משמש להצעה אחת בלבד
  for (const tx of [...transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    if (tx.amount > 0) {
      const best = documents
        .filter((d) => !usedDocs.has(d.id) && d.gross === tx.amount)
        .map((d) => ({ d, gap: daysBetween(d.issueDate, tx.date) }))
        .filter(({ gap }) => gap >= -3 && gap <= 90)
        .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap))[0];
      if (best) {
        usedDocs.add(best.d.id);
        result.set(tx.id, { kind: "document", id: best.d.id, label: best.d.label });
      }
    } else {
      const best = expenses
        .filter((e) => !usedExpenses.has(e.id) && e.gross === -tx.amount)
        .map((e) => ({ e, gap: Math.abs(daysBetween(e.date, tx.date)) }))
        .filter(({ gap }) => gap <= 10)
        .sort((a, b) => a.gap - b.gap)[0];
      if (best) {
        usedExpenses.add(best.e.id);
        result.set(tx.id, { kind: "expense", id: best.e.id, label: best.e.label });
      }
    }
  }
  return result;
}
