import type { Agorot } from "./money";
import { isValidIsraeliId } from "./israeli-id";
import { splitGross, vatRateOn } from "./vat";

/**
 * מה שמודל ה־AI מחזיר מקבלה (כל השדות מחרוזות; "" כשלא ידוע),
 * והפיכתו לערכים בטוחים למילוי טופס ההוצאה — עם אזהרות במקום לסמוך עליו בעיניים עצומות.
 */
export interface RawReceipt {
  is_receipt: boolean;
  supplier_name: string;
  supplier_tax_id: string;
  document_number: string;
  date: string;
  total_amount: string;
  vat_amount: string;
  currency: string;
  category_key: string;
  description: string;
}

export interface ReceiptPrefill {
  supplierName?: string;
  supplierTaxId?: string;
  referenceNumber?: string;
  date?: string;
  gross?: Agorot;
  vat?: Agorot;
  categoryKey?: string;
  description?: string;
  warnings: string[];
}

function amount(raw: string): Agorot | undefined {
  const cleaned = raw.replace(/[₪,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined;
  const value = Math.round(Number(cleaned) * 100);
  return value > 0 ? value : undefined;
}

function isoDate(raw: string, today: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const d = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return undefined;
  if (raw > today || raw < "2000-01-01") return undefined;
  return raw;
}

export function normalizeReceipt(raw: RawReceipt, categoryKeys: string[], today: string): ReceiptPrefill {
  const warnings: string[] = [];
  if (!raw.is_receipt) warnings.push("נראה שהקובץ אינו קבלה או חשבונית. בדקו את הפרטים בקפידה.");

  const currency = raw.currency.trim().toUpperCase();
  if (currency && currency !== "ILS" && currency !== "NIS") {
    warnings.push(`הסכומים בקבלה במטבע ${currency}. יש להזין את הסכום בשקלים לפי השער ביום התשלום.`);
  }

  const date = isoDate(raw.date.trim(), today);
  if (raw.date.trim() && !date) warnings.push("לא ניתן היה לזהות תאריך תקין. בדקו את התאריך.");

  const taxIdDigits = raw.supplier_tax_id.replace(/\D/g, "");
  let supplierTaxId: string | undefined;
  if (taxIdDigits) {
    if (isValidIsraeliId(taxIdDigits)) supplierTaxId = taxIdDigits;
    else warnings.push(`מספר העוסק שזוהה (${taxIdDigits}) אינו תקין. בדקו אותו מול הקבלה.`);
  }

  const isForeign = Boolean(currency && currency !== "ILS" && currency !== "NIS");
  const gross = isForeign ? undefined : amount(raw.total_amount);
  let vat = isForeign ? undefined : amount(raw.vat_amount);
  if (raw.vat_amount.trim() === "0" || raw.vat_amount.trim() === "0.00") vat = 0;

  if (gross !== undefined && vat !== undefined && vat > 0) {
    // בדיקת סבירות: המע"מ צריך להתאים בערך לשיעור המע"מ ביום הקבלה
    const expected = splitGross(gross, vatRateOn(date ?? today)).vat;
    if (vat >= gross || Math.abs(vat - expected) > Math.max(100, expected * 0.05)) {
      warnings.push("סכום המע״מ שזוהה לא מתאים לשיעור המע״מ. ייתכן שחלק מהפריטים פטורים — בדקו.");
    }
  }

  return {
    supplierName: raw.supplier_name.trim() || undefined,
    supplierTaxId,
    referenceNumber: raw.document_number.trim() || undefined,
    date,
    gross,
    vat,
    categoryKey: categoryKeys.includes(raw.category_key) ? raw.category_key : undefined,
    description: raw.description.trim() || undefined,
    warnings,
  };
}

export const RECEIPT_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type ReceiptContentType = (typeof RECEIPT_CONTENT_TYPES)[number];
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

/** זיהוי סוג הקובץ לפי התוכן עצמו ולא לפי מה שהדפדפן הצהיר */
export function sniffReceiptType(bytes: Uint8Array): ReceiptContentType | null {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  return null;
}
