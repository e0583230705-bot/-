import type { Agorot } from "./money";
import type { ISODate } from "./vat";

/**
 * סוגי מסמכים. הקודים תואמים לקודי "מבנה אחיד" של רשות המסים,
 * כדי שנוכל להפיק את הקובץ בהמשך.
 */
export type DocumentType =
  | "proforma"
  | "tax_invoice"
  | "tax_invoice_receipt"
  | "credit_note"
  | "receipt"
  | "donation_receipt";

export const DOCUMENT_TYPES: Record<
  DocumentType,
  { label: string; code: number; isTaxInvoice: boolean; recordsIncome: boolean }
> = {
  proforma: { label: "חשבון עסקה", code: 300, isTaxInvoice: false, recordsIncome: false },
  tax_invoice: { label: "חשבונית מס", code: 305, isTaxInvoice: true, recordsIncome: true },
  tax_invoice_receipt: {
    label: "חשבונית מס קבלה",
    code: 320,
    isTaxInvoice: true,
    recordsIncome: true,
  },
  credit_note: { label: "חשבונית זיכוי", code: 330, isTaxInvoice: true, recordsIncome: true },
  receipt: { label: "קבלה", code: 400, isTaxInvoice: false, recordsIncome: false },
  donation_receipt: { label: "קבלה על תרומה", code: 405, isTaxInvoice: false, recordsIncome: false },
};

/**
 * מתי קבלה נחשבת הכנסה: אצל עוסק פטור ועמותה הקבלה היא מסמך ההכנסה.
 * אצל עוסק מורשה ההכנסה נרשמת לפי חשבונית המס.
 */
export function documentRecordsIncome(type: DocumentType, chargesVat: boolean): boolean {
  if (!chargesVat) return type === "receipt" || type === "donation_receipt" || type === "credit_note";
  return DOCUMENT_TYPES[type].recordsIncome;
}

/**
 * ספי "חשבוניות ישראל": מעל הסכום (לפני מע"מ) נדרש מספר הקצאה מרשות המסים
 * בחשבונית מס שמוצאת לעוסק מורשה. לוח הזמנים כפי שפורסם — לאמת מול רשות המסים.
 */
export const ALLOCATION_THRESHOLDS: { from: ISODate; thresholdShekels: number }[] = [
  { from: "2024-05-05", thresholdShekels: 25_000 },
  { from: "2025-01-01", thresholdShekels: 20_000 },
  { from: "2026-01-01", thresholdShekels: 10_000 },
  { from: "2026-06-01", thresholdShekels: 5_000 },
];

export function allocationThresholdOn(date: ISODate): number | null {
  let threshold: number | null = null;
  for (const t of ALLOCATION_THRESHOLDS) {
    if (date >= t.from) threshold = t.thresholdShekels;
  }
  return threshold;
}

export function requiresAllocationNumber(params: {
  type: DocumentType;
  issueDate: ISODate;
  net: Agorot;
  customerIsVatRegistered: boolean;
}): boolean {
  if (!DOCUMENT_TYPES[params.type].isTaxInvoice) return false;
  if (params.type === "credit_note") return false;
  if (!params.customerIsVatRegistered) return false;
  const threshold = allocationThresholdOn(params.issueDate);
  if (threshold === null) return false;
  return params.net > threshold * 100;
}

/** המספר הבא ברצף: לכל סוג מסמך רצף נפרד ללא קפיצות, כנדרש בהוראות ניהול ספרים. */
export function nextDocumentNumber(lastNumber: number | null, startAt = 1): number {
  return lastNumber === null ? startAt : lastNumber + 1;
}
