import { getContext } from "@/lib/auth/dal";
import { loadLedger } from "@/lib/services/reports";
import { listDocuments } from "@/lib/services/documents";
import { listExpenses } from "@/lib/services/expenses";
import { expensesByCategory, monthlyBreakdown } from "@/lib/domain/reports";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/documents";
import { csvMoney, toCsv } from "@/lib/csv";

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

export async function GET(req: Request) {
  const { org } = await getContext();
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  const kind = url.searchParams.get("kind");
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return new Response("שנה לא תקינה", { status: 400 });
  const inYear = (d: string) => d.startsWith(`${year}-`);

  let rows: (string | number | null)[][];
  if (kind === "documents") {
    rows = [
      ["סוג", "מספר", "תאריך", "לקוח", "מספר עוסק לקוח", "לפני מע\"מ", "מע\"מ", "סה\"כ", "מספר הקצאה"],
      ...(await listDocuments(org.id))
        .filter((d) => inYear(d.issueDate))
        .reverse()
        .map((d) => [
          DOCUMENT_TYPES[d.type as DocumentType].label,
          d.number,
          d.issueDate,
          d.customerName,
          d.customerTaxId,
          csvMoney(d.net),
          csvMoney(d.vat),
          csvMoney(d.gross),
          d.allocationNumber,
        ]),
    ];
  } else if (kind === "expenses") {
    rows = [
      ["תאריך", "ספק", "מספר עוסק ספק", "קטגוריה", "מספר חשבונית", "לפני מע\"מ", "מע\"מ", "סה\"כ", "תיאור"],
      ...(await listExpenses(org.id))
        .filter(({ expense }) => inYear(expense.date))
        .reverse()
        .map(({ expense: e, categoryLabel }) => [
          e.date,
          e.supplierName,
          e.supplierTaxId,
          categoryLabel,
          e.referenceNumber,
          csvMoney(e.net),
          csvMoney(e.vat),
          csvMoney(e.gross),
          e.description,
        ]),
    ];
  } else {
    const { income, expenses } = await loadLedger(org.id);
    const months = monthlyBreakdown(year, income, expenses);
    const categories = expensesByCategory({ from: `${year}-01-01`, to: `${year}-12-31` }, expenses);
    const total = (k: "revenue" | "recognizedExpenses" | "profit" | "outputVat" | "inputVat") =>
      csvMoney(months.reduce((s, m) => s + m[k], 0));
    rows = [
      [`סיכום שנתי ${year}`, org.name, org.taxId],
      [],
      ["חודש", "הכנסות (לפני מע\"מ)", "הוצאות מוכרות", "רווח", "מע\"מ עסקאות", "מע\"מ תשומות"],
      ...months.map((m) => [
        MONTHS[m.month - 1],
        csvMoney(m.revenue),
        csvMoney(m.recognizedExpenses),
        csvMoney(m.profit),
        csvMoney(m.outputVat),
        csvMoney(m.inputVat),
      ]),
      ["סה\"כ", total("revenue"), total("recognizedExpenses"), total("profit"), total("outputVat"), total("inputVat")],
      [],
      ["קטגוריית הוצאה", "סה\"כ ששולם", "מוכר למס", "מספר הוצאות"],
      ...categories.map((c) => [c.category, csvMoney(c.total), csvMoney(c.recognized), c.count]),
    ];
  }

  const name = kind === "documents" || kind === "expenses" ? kind : "summary";
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${year}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
