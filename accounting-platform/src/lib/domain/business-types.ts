import type { DocumentType } from "./documents";

export type BusinessType =
  | "osek_patur"
  | "osek_murshe"
  | "company"
  | "partnership"
  | "nonprofit";

export type VatFrequency = "monthly" | "bimonthly" | "none";

export interface BusinessTypeProfile {
  type: BusinessType;
  label: string;
  description: string;
  /** האם העסק גובה מע"מ מלקוחות ומקזז מע"מ תשומות */
  chargesVat: boolean;
  /** סוגי המסמכים שהעסק רשאי להפיק */
  allowedDocuments: DocumentType[];
  defaultVatFrequency: VatFrequency;
  /** טופס הדוח השנתי למס הכנסה */
  annualReportForm: string;
  /** האם נדרשים דוחות כספיים מבוקרים בחתימת רו"ח */
  requiresAuditedStatements: boolean;
  /** האם העסק משלם ביטוח לאומי כעצמאי (לעומת חברה ששכר בעליה עובר בתלוש) */
  paysSelfEmployedNationalInsurance: boolean;
}

/**
 * פרופילים לפי סוג עסק. הכללים כאן הם ברירות מחדל מקובלות,
 * ויש לאמת אותם מול רשות המסים / איש מקצוע לפני הסתמכות בדיווח אמיתי.
 */
export const BUSINESS_TYPES: Record<BusinessType, BusinessTypeProfile> = {
  osek_patur: {
    type: "osek_patur",
    label: "עוסק פטור",
    description: "עצמאי עם מחזור שנתי מתחת לתקרה, לא גובה מע\"מ",
    chargesVat: false,
    allowedDocuments: ["receipt", "credit_note"],
    defaultVatFrequency: "none",
    annualReportForm: "1301",
    requiresAuditedStatements: false,
    paysSelfEmployedNationalInsurance: true,
  },
  osek_murshe: {
    type: "osek_murshe",
    label: "עוסק מורשה",
    description: "עצמאי שגובה מע\"מ ומדווח למע\"מ",
    chargesVat: true,
    allowedDocuments: [
      "tax_invoice",
      "tax_invoice_receipt",
      "receipt",
      "credit_note",
      "proforma",
    ],
    defaultVatFrequency: "bimonthly",
    annualReportForm: "1301",
    requiresAuditedStatements: false,
    paysSelfEmployedNationalInsurance: true,
  },
  company: {
    type: "company",
    label: "חברה בע\"מ",
    description: "ישות משפטית נפרדת, דוחות כספיים מבוקרים",
    chargesVat: true,
    allowedDocuments: [
      "tax_invoice",
      "tax_invoice_receipt",
      "receipt",
      "credit_note",
      "proforma",
    ],
    defaultVatFrequency: "monthly",
    annualReportForm: "1214",
    requiresAuditedStatements: true,
    paysSelfEmployedNationalInsurance: false,
  },
  partnership: {
    type: "partnership",
    label: "שותפות",
    description: "שני שותפים או יותר, כל שותף מדווח על חלקו",
    chargesVat: true,
    allowedDocuments: [
      "tax_invoice",
      "tax_invoice_receipt",
      "receipt",
      "credit_note",
      "proforma",
    ],
    defaultVatFrequency: "bimonthly",
    annualReportForm: "1301",
    requiresAuditedStatements: false,
    paysSelfEmployedNationalInsurance: true,
  },
  nonprofit: {
    type: "nonprofit",
    label: "עמותה / מלכ\"ר",
    description: "מוסד ללא כוונת רווח, אינו גובה מע\"מ",
    chargesVat: false,
    allowedDocuments: ["receipt", "donation_receipt", "credit_note"],
    defaultVatFrequency: "none",
    annualReportForm: "1215",
    requiresAuditedStatements: true,
    paysSelfEmployedNationalInsurance: false,
  },
};

/**
 * תקרת מחזור לעוסק פטור לפי שנה (בשקלים). מתעדכנת מדי שנה —
 * יש לעדכן ולאמת מול רשות המסים.
 */
export const OSEK_PATUR_CEILING: Record<number, number> = {
  2025: 120_000,
  2026: 120_000,
};

export function osekPaturCeiling(year: number): number | undefined {
  return OSEK_PATUR_CEILING[year];
}
