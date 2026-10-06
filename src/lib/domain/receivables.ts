import type { Agorot } from "./money";
import type { DocumentType } from "./documents";
import type { ISODate } from "./vat";

/**
 * חשבוניות שהלקוח צריך לשלם: חשבונית מס וחשבון עסקה.
 * (חשבונית מס קבלה וקבלה הן כבר תשלום, וזיכוי מקטין חוב.)
 */
export const PAYABLE_TYPES: DocumentType[] = ["tax_invoice", "proforma"];

/** איזה מסמך מאשר תשלום על איזה: קבלה על חשבונית מס, חשבונית מס קבלה על חשבון עסקה */
export const PAYMENT_FOR: Partial<Record<DocumentType, DocumentType>> = {
  receipt: "tax_invoice",
  tax_invoice_receipt: "proforma",
};

export const DEFAULT_PAYMENT_TERMS_DAYS = 30;

const DAY = 24 * 60 * 60 * 1000;
export const daysBetween = (from: ISODate, to: ISODate) =>
  Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

export type PaymentStatus = { kind: "paid"; on: ISODate } | { kind: "open"; days: number } | { kind: "overdue"; days: number } | null;

export function paymentStatus(
  doc: { type: string; issueDate: ISODate; paidAt: ISODate | null },
  today: ISODate,
  termsDays = DEFAULT_PAYMENT_TERMS_DAYS,
): PaymentStatus {
  if (!PAYABLE_TYPES.includes(doc.type as DocumentType)) return null;
  if (doc.paidAt) return { kind: "paid", on: doc.paidAt };
  const days = Math.max(0, daysBetween(doc.issueDate, today));
  return days > termsDays ? { kind: "overdue", days } : { kind: "open", days };
}

export function summarizeReceivables(
  docs: { type: string; issueDate: ISODate; paidAt: ISODate | null; gross: Agorot }[],
  today: ISODate,
  termsDays = DEFAULT_PAYMENT_TERMS_DAYS,
) {
  let open = 0;
  let overdue = 0;
  let openCount = 0;
  let overdueCount = 0;
  for (const d of docs) {
    const s = paymentStatus(d, today, termsDays);
    if (!s || s.kind === "paid") continue;
    open += d.gross;
    openCount++;
    if (s.kind === "overdue") {
      overdue += d.gross;
      overdueCount++;
    }
  }
  return { open, openCount, overdue, overdueCount };
}
