/**
 * זיכרון ספקים: מזהים ספק מוכר לפי השם, גם כשהוא כתוב קצת אחרת
 * (למשל "פז" מול "פז חברת נפט בע\"מ" בתיאור של תנועת בנק).
 */
export interface KnownSupplier {
  name: string;
  categoryId: string;
  supplierTaxId: string | null;
}

// סיומות של שם חברה. רצות אחרי שהפיסוק הוחלף ברווחים, ולכן "בע\"מ" מופיע כאן כ"בע מ"
const SUFFIXES = /\s+(בע מ|בעמ|ltd|inc)$/;

export function normalizeSupplierName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[״"׳'`.,\-_/()*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(SUFFIXES, "")
    .trim();
}

/** התאמה מדויקת קודם; אחרת — שם הספק המוכר מופיע כמילה שלמה בתוך הטקסט (השם הארוך ביותר מנצח) */
export function findKnownSupplier(text: string, suppliers: KnownSupplier[]): KnownSupplier | null {
  const target = normalizeSupplierName(text);
  if (!target) return null;
  const exact = suppliers.find((s) => normalizeSupplierName(s.name) === target);
  if (exact) return exact;
  const words = ` ${target} `;
  return (
    suppliers
      .map((s) => ({ s, n: normalizeSupplierName(s.name) }))
      .filter(({ n }) => n.length >= 2 && words.includes(` ${n} `))
      .sort((a, b) => b.n.length - a.n.length)[0]?.s ?? null
  );
}
