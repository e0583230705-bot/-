import type { Agorot } from "./money";
import type { ISODate } from "./vat";
import { splitGross, vatRateOn } from "./vat";
import { daysBetween, paymentStatus } from "./receivables";
import { isValidIsraeliId } from "./israeli-id";
import { normalizeSupplierName } from "./suppliers";

/**
 * ביקורת עצמית על הספרים: בדיקות קבועות שמאתרות טעויות וסיכונים לפני שרשות המסים
 * או רואה החשבון מאתרים אותם. אין כאן ניחושים — כל ממצא נשען על כלל מוגדר.
 * זו אינה ביקורת של רואה חשבון בחתימתו.
 */

export type Severity = "error" | "warning" | "info";

export interface Finding {
  /** מזהה יציב — כדי שאפשר יהיה לסמן ממצא כ"נבדק ותקין" */
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  /** מה לעשות */
  action: string;
  href?: string;
  amount?: Agorot;
  date?: ISODate;
}

export interface AuditInput {
  today: ISODate;
  business: { chargesVat: boolean; ceilingShekels?: number; yearRevenue: Agorot };
  documents: {
    id: string;
    type: string;
    number: number;
    issueDate: ISODate;
    customerName: string;
    customerTaxId: string | null;
    net: Agorot;
    gross: Agorot;
    allocationRequired: boolean;
    allocationNumber: string | null;
    paidAt: ISODate | null;
  }[];
  expenses: {
    id: string;
    date: ISODate;
    supplierName: string;
    supplierTaxId: string | null;
    referenceNumber: string | null;
    gross: Agorot;
    vat: Agorot;
    vatDeductiblePct: number;
    hasReceipt: boolean;
  }[];
  bankTransactions: { id: string; date: ISODate; description: string; amount: Agorot; status: string }[];
  allocationThreshold: (date: ISODate) => number | null;
}

const LABEL: Record<string, string> = {
  tax_invoice: "חשבונית מס",
  tax_invoice_receipt: "חשבונית מס קבלה",
  proforma: "חשבון עסקה",
  receipt: "קבלה",
  credit_note: "חשבונית זיכוי",
  donation_receipt: "קבלה על תרומה",
};
const docName = (d: { type: string; number: number }) => `${LABEL[d.type] ?? d.type} ${String(d.number).padStart(4, "0")}`;

/** מתחת לסכום הזה לא מתריעים על קבלה חסרה (קפה, חניה) — כדי לא להציף */
export const RECEIPT_REQUIRED_FROM: Agorot = 200_00;
const STALE_BANK_DAYS = 30;

export function runAudit(input: AuditInput): Finding[] {
  const f: Finding[] = [];
  const { today } = input;

  // 1. כסף שנכנס לבנק בלי מסמך הכנסה — הכנסה שאולי לא דווחה
  for (const t of input.bankTransactions) {
    if (t.amount > 0 && t.status === "unmatched" && daysBetween(t.date, today) > 7) {
      f.push({
        key: `unreported-income:${t.id}`,
        severity: "error",
        title: "כסף נכנס לבנק בלי חשבונית או קבלה",
        detail: `${t.description} · זיכוי מ־${t.date}. אם זו הכנסה מהעסק, חייבים להפיק עליה מסמך ולדווח עליה.`,
        action: "הפיקו חשבונית או קבלה, או סמנו את התנועה כלא רלוונטית (למשל העברה בין חשבונות או הלוואה).",
        href: "/bank",
        amount: t.amount,
        date: t.date,
      });
    }
  }

  // 2. תנועות חובה שלא טופלו זמן רב
  const staleDebits = input.bankTransactions.filter(
    (t) => t.amount < 0 && t.status === "unmatched" && daysBetween(t.date, today) > STALE_BANK_DAYS,
  );
  if (staleDebits.length > 0) {
    f.push({
      key: `stale-bank-debits:${staleDebits.map((t) => t.id).sort().join(",")}`,
      severity: "warning",
      title: `${staleDebits.length} חיובים בבנק לא טופלו יותר מ־${STALE_BANK_DAYS} יום`,
      detail: "הוצאות שלא נרשמו הן הוצאות שלא יוכרו במס — כסף שהולך לאיבוד.",
      action: "רשמו אותן כהוצאות, או סמנו כלא רלוונטיות.",
      href: "/bank",
      amount: -staleDebits.reduce((s, t) => s + t.amount, 0),
    });
  }

  // 3. מע"מ שקוזז בלי מספר עוסק תקין של הספק
  if (input.business.chargesVat) {
    for (const e of input.expenses) {
      if (e.vat > 0 && e.vatDeductiblePct > 0 && !(e.supplierTaxId && isValidIsraeliId(e.supplierTaxId))) {
        f.push({
          key: `vat-no-supplier-id:${e.id}`,
          severity: "error",
          title: "קיזוז מע״מ בלי מספר עוסק של הספק",
          detail: `${e.supplierName} · ${e.date}. מע״מ תשומות מותר לקזז רק לפי חשבונית מס שמופיע בה מספר עוסק מורשה של הספק.`,
          action: "השלימו את מספר העוסק מהחשבונית. אם אין חשבונית מס — הזינו מע״מ 0.",
          href: "/expenses",
          amount: e.vat,
          date: e.date,
        });
      }
    }
  }

  // 4. מע"מ שלא מתאים לשיעור
  for (const e of input.expenses) {
    if (e.vat <= 0) continue;
    const expected = splitGross(e.gross, vatRateOn(e.date)).vat;
    if (Math.abs(e.vat - expected) > Math.max(100, expected * 0.05)) {
      f.push({
        key: `vat-mismatch:${e.id}`,
        severity: "warning",
        title: "סכום המע״מ לא מתאים לשיעור המע״מ",
        detail: `${e.supplierName} · ${e.date}. נרשם מע״מ של ${(e.vat / 100).toFixed(2)} ₪, ולפי השיעור היה צפוי בערך ${(expected / 100).toFixed(2)} ₪.`,
        action: "בדקו מול החשבונית. ייתכן שחלק מהפריטים פטורים ממע״מ — אז הסכום תקין.",
        href: "/expenses",
        amount: e.vat,
        date: e.date,
      });
    }
  }

  // 5. הוצאות כפולות: אותו ספק ואותו סכום, עם אותו מספר חשבונית או באותו יום
  const groups = new Map<string, AuditInput["expenses"]>();
  for (const e of input.expenses) {
    const k = `${normalizeSupplierName(e.supplierName)}|${e.gross}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  for (const list of groups.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [list[i], list[j]];
        const sameRef = a.referenceNumber && a.referenceNumber === b.referenceNumber;
        if (sameRef || a.date === b.date) {
          const ids = [a.id, b.id].sort();
          f.push({
            key: `duplicate-expense:${ids.join(",")}`,
            severity: sameRef ? "error" : "warning",
            title: sameRef ? "אותה חשבונית ספק נרשמה פעמיים" : "ייתכן שהוצאה נרשמה פעמיים",
            detail: `${a.supplierName} · ${(a.gross / 100).toFixed(2)} ₪ · ${a.date}${a.date !== b.date ? ` ו־${b.date}` : ""}${sameRef ? ` · חשבונית ${a.referenceNumber}` : ""}.`,
            action: sameRef ? "מחקו את הרישום הכפול." : "אם אלה שתי רכישות נפרדות — סמנו כתקין.",
            href: "/expenses",
            amount: a.gross,
            date: a.date,
          });
        }
      }
    }
  }

  // 6. הוצאה משמעותית בלי קבלה מצורפת
  const noReceipt = input.expenses.filter((e) => !e.hasReceipt && e.gross >= RECEIPT_REQUIRED_FROM);
  for (const e of noReceipt) {
    f.push({
      key: `no-receipt:${e.id}`,
      severity: "warning",
      title: "הוצאה בלי קבלה מצורפת",
      detail: `${e.supplierName} · ${(e.gross / 100).toFixed(2)} ₪ · ${e.date}. בביקורת מס כל הוצאה צריכה מסמך שמוכיח אותה.`,
      action: "העלו את הקבלה או החשבונית של הספק.",
      href: "/expenses",
      amount: e.gross,
      date: e.date,
    });
  }

  // 7. הוצאה בתאריך עתידי
  for (const e of input.expenses) {
    if (e.date > today) {
      f.push({
        key: `future-expense:${e.id}`,
        severity: "warning",
        title: "הוצאה בתאריך עתידי",
        detail: `${e.supplierName} · ${e.date}. כנראה טעות בהקלדת התאריך — היא תיכנס לתקופת דיווח שגויה.`,
        action: "תקנו את התאריך לפי החשבונית.",
        href: "/expenses",
        amount: e.gross,
        date: e.date,
      });
    }
  }

  for (const d of input.documents) {
    // 8. חשבונית שדורשת מספר הקצאה
    if (d.allocationRequired && !d.allocationNumber) {
      f.push({
        key: `missing-allocation:${d.id}`,
        severity: "error",
        title: "חשבונית בלי מספר הקצאה",
        detail: `${docName(d)} ל${d.customerName}. בלי מספר הקצאה הלקוח לא יוכל לקזז את המע״מ, וזה עלול לפגוע ביחסים איתו.`,
        action: "בקשו מספר הקצאה מרשות המסים והוסיפו אותו לחשבונית.",
        href: `/income/${d.id}`,
        amount: d.gross,
        date: d.issueDate,
      });
    }
    // 9. ללקוח יש מספר עוסק אבל המסמך לא סומן כמחייב הקצאה — אולי הלקוח לא סומן כעוסק מורשה
    const threshold = input.allocationThreshold(d.issueDate);
    if (
      d.type === "tax_invoice" &&
      !d.allocationRequired &&
      d.customerTaxId &&
      threshold !== null &&
      d.net > threshold * 100
    ) {
      f.push({
        key: `allocation-check:${d.id}`,
        severity: "warning",
        title: "ייתכן שחסר מספר הקצאה",
        detail: `${docName(d)} ל${d.customerName} מעל סף ההקצאה, וללקוח יש מספר עוסק — אבל הוא לא סומן כעוסק מורשה.`,
        action: "אם הלקוח עוסק מורשה או חברה — נדרש מספר הקצאה. אם לא — סמנו כתקין.",
        href: `/income/${d.id}`,
        amount: d.gross,
        date: d.issueDate,
      });
    }
    // 10. חשבוניות באיחור
    const status = paymentStatus(d, today);
    if (status?.kind === "overdue") {
      f.push({
        key: `overdue:${d.id}`,
        severity: "info",
        title: `חשבונית באיחור של ${status.days} ימים`,
        detail: `${docName(d)} ל${d.customerName}.`,
        action: "פנו ללקוח, או סמנו כשולמה אם הכסף כבר התקבל.",
        href: `/income/${d.id}`,
        amount: d.gross,
        date: d.issueDate,
      });
    }
  }

  // 11. תקרת עוסק פטור
  const ceiling = input.business.ceilingShekels;
  if (ceiling) {
    const pct = input.business.yearRevenue / (ceiling * 100);
    if (pct >= 1 || pct >= 0.85) {
      f.push({
        key: `osek-patur-ceiling:${today.slice(0, 4)}:${pct >= 1 ? "over" : "near"}`,
        severity: pct >= 1 ? "error" : "warning",
        title: pct >= 1 ? "עברתם את תקרת עוסק פטור" : `הגעתם ל־${Math.round(pct * 100)}% מתקרת עוסק פטור`,
        detail:
          pct >= 1
            ? "עוסק שעבר את התקרה חייב לעבור למעמד עוסק מורשה ולגבות מע״מ."
            : "כדאי להיערך מראש למעבר לעוסק מורשה, כולל תמחור מחדש מול הלקוחות.",
        action: "התייעצו עם רואה החשבון לגבי המעבר והמועד.",
        href: "/",
        amount: input.business.yearRevenue,
      });
    }
  }

  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return f.sort((a, b) => order[a.severity] - order[b.severity] || (b.date ?? "").localeCompare(a.date ?? ""));
}
