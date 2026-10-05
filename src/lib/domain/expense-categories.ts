/**
 * קטגוריות הוצאה ברירת מחדל ושיעורי ההכרה המקובלים בהן.
 * taxDeductiblePct — כמה מההוצאה (נטו) מוכר כהוצאה לצורך מס הכנסה.
 * vatDeductiblePct — כמה ממע"מ התשומות מותר לקזז.
 * הערכים הם ברירות מחדל נפוצות; כל עסק יכול לשנות אותם, ויש לאמתם מול איש מקצוע.
 */
export interface ExpenseCategoryDef {
  key: string;
  label: string;
  taxDeductiblePct: number;
  vatDeductiblePct: number;
  note?: string;
}

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategoryDef[] = [
  { key: "office_supplies", label: "ציוד משרדי", taxDeductiblePct: 100, vatDeductiblePct: 100 },
  { key: "rent", label: "שכירות משרד", taxDeductiblePct: 100, vatDeductiblePct: 100 },
  {
    key: "vehicle",
    label: "רכב (דלק, טיפולים, ביטוח)",
    taxDeductiblePct: 45,
    vatDeductiblePct: 66.67,
    note: "רכב פרטי בשימוש עסקי: מקובל 45% למס הכנסה ו־2/3 מהמע\"מ",
  },
  {
    key: "phone",
    label: "טלפון נייד",
    taxDeductiblePct: 50,
    vatDeductiblePct: 66.67,
  },
  {
    key: "refreshments",
    label: "כיבוד קל במשרד",
    taxDeductiblePct: 80,
    vatDeductiblePct: 0,
  },
  {
    key: "meals",
    label: "ארוחות ואירוח",
    taxDeductiblePct: 0,
    vatDeductiblePct: 0,
    note: "ככלל לא מוכר, למעט חריגים",
  },
  {
    key: "gifts",
    label: "מתנות ללקוחות",
    taxDeductiblePct: 100,
    vatDeductiblePct: 0,
    note: "מוכר עד תקרה שנתית לכל מקבל",
  },
  { key: "professional_services", label: "שירותים מקצועיים", taxDeductiblePct: 100, vatDeductiblePct: 100 },
  { key: "marketing", label: "פרסום ושיווק", taxDeductiblePct: 100, vatDeductiblePct: 100 },
  { key: "software", label: "תוכנה ומנויים", taxDeductiblePct: 100, vatDeductiblePct: 100 },
  { key: "training", label: "השתלמויות מקצועיות", taxDeductiblePct: 100, vatDeductiblePct: 100 },
  { key: "bank_fees", label: "עמלות בנק", taxDeductiblePct: 100, vatDeductiblePct: 0 },
  { key: "insurance", label: "ביטוח עסקי", taxDeductiblePct: 100, vatDeductiblePct: 0 },
  {
    key: "equipment",
    label: "ציוד ורכוש קבוע",
    taxDeductiblePct: 100,
    vatDeductiblePct: 100,
    note: "ציוד יקר מוכר בדרך כלל דרך פחת על פני כמה שנים",
  },
  { key: "other", label: "אחר", taxDeductiblePct: 100, vatDeductiblePct: 100 },
];
