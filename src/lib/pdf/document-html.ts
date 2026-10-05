import { BUSINESS_TYPES, type BusinessType } from "@/lib/domain/business-types";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/documents";
import { formatILS } from "@/lib/domain/money";

/**
 * תבנית HTML עצמאית למסמך (חשבונית / קבלה), שממנה מפיקים PDF.
 * עצמאית = בלי Tailwind ובלי קבצים חיצוניים, כדי שתיראה זהה בדפדפן וב־PDF.
 */

export type CopyMark = "original" | "copy" | "preview";

export interface DocumentForPrint {
  org: {
    name: string;
    businessType: string;
    taxId: string;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  doc: {
    type: string;
    number: number;
    issueDate: string;
    customerName: string;
    customerTaxId: string | null;
    net: number;
    vat: number;
    gross: number;
    vatRate: number;
    allocationNumber: string | null;
    notes: string | null;
  };
  lines: { position: number; description: string; quantity: number; unitPrice: number; lineNet: number }[];
  mark: CopyMark;
  /** @font-face מוטמע (data URI) — מועבר מבחוץ כדי שהתבנית תישאר טהורה ונוחה לבדיקה */
  fontCss?: string;
}

const MARK_LABEL: Record<CopyMark, string> = {
  original: "מקור",
  copy: "העתק נאמן למקור",
  preview: "תצוגה מקדימה",
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const e = (v: string | null | undefined) => escapeHtml(v ?? "");
const money = (agorot: number) => `<bdi class="num">${escapeHtml(formatILS(agorot))}</bdi>`;
const ltr = (v: string | number) => `<bdi class="num">${escapeHtml(String(v))}</bdi>`;

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function taxIdLabel(businessType: string) {
  if (businessType === "company") return "ח.פ.";
  if (businessType === "nonprofit") return "מס' עמותה";
  return "עוסק מורשה מס'";
}

export function documentTitle(type: string, number: number) {
  const label = DOCUMENT_TYPES[type as DocumentType]?.label ?? type;
  return `${label} ${String(number).padStart(4, "0")}`;
}

export function renderDocumentHtml({ org, doc, lines, mark, fontCss = "" }: DocumentForPrint): string {
  const profile = BUSINESS_TYPES[org.businessType as BusinessType];
  const typeInfo = DOCUMENT_TYPES[doc.type as DocumentType];
  const showVat = doc.vatRate > 0;
  const idLabel = org.businessType === "osek_patur" ? "עוסק פטור מס'" : taxIdLabel(org.businessType);
  const contact = [org.address, org.phone, org.email].filter(Boolean).map((v) => e(v)).join(" · ");

  const rows = lines
    .map(
      (l) => `<tr>
        <td class="c">${l.position}</td>
        <td>${e(l.description)}</td>
        <td class="c">${ltr(l.quantity)}</td>
        <td class="n">${money(l.unitPrice)}</td>
        <td class="n">${money(l.lineNet)}</td>
      </tr>`,
    )
    .join("");

  const totals = showVat
    ? `<tr><th>סה"כ לפני מע"מ</th><td>${money(doc.net)}</td></tr>
       <tr><th>מע"מ ${ltr(`${doc.vatRate}%`)}</th><td>${money(doc.vat)}</td></tr>
       <tr class="grand"><th>סה"כ לתשלום</th><td>${money(doc.gross)}</td></tr>`
    : `<tr class="grand"><th>סה"כ</th><td>${money(doc.gross)}</td></tr>`;

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>${e(documentTitle(doc.type, doc.number))} · ${e(org.name)}</title>
<style>
${fontCss}
@page { size: A4; margin: 16mm 14mm; }
* { box-sizing: border-box; }
html { background: #fff; }
body { margin: 0; font-family: Heebo, Arial, sans-serif; color: #16202c; font-size: 13px; line-height: 1.5; }
.page { max-width: 760px; margin: 0 auto; padding: 24px; }
@media print { .page { padding: 0; max-width: none; } }
.num { direction: ltr; unicode-bidi: isolate; font-variant-numeric: tabular-nums; }
header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 3px solid #0f6e5a; padding-bottom: 16px; }
.biz h1 { margin: 0; font-size: 24px; }
.muted { color: #5d6b7c; }
.doc { text-align: left; }
.doc h2 { margin: 0; font-size: 20px; }
.mark { display: inline-block; margin-top: 6px; padding: 2px 10px; border: 1.5px solid currentColor; border-radius: 4px; font-weight: 700; }
.mark.original { color: #0f6e5a; }
.mark.copy, .mark.preview { color: #5d6b7c; }
.meta { margin-top: 6px; }
.to { margin: 20px 0; padding: 12px 16px; background: #f6f7f9; border-radius: 8px; }
.to b { font-size: 15px; }
table.lines { width: 100%; border-collapse: collapse; }
.lines th { text-align: right; background: #e3f2ee; color: #0f6e5a; padding: 8px; font-weight: 700; }
.lines td { padding: 8px; border-bottom: 1px solid #e3e6eb; vertical-align: top; }
.lines .c { text-align: center; width: 48px; }
.lines .n { text-align: left; white-space: nowrap; width: 120px; }
table.totals { margin-top: 16px; margin-right: auto; border-collapse: collapse; min-width: 260px; }
.totals th { text-align: right; font-weight: 400; padding: 4px 8px; }
.totals td { text-align: left; padding: 4px 8px; white-space: nowrap; }
.totals .grand th, .totals .grand td { font-weight: 700; font-size: 16px; border-top: 2px solid #16202c; padding-top: 8px; }
.notes { margin-top: 24px; white-space: pre-wrap; }
footer { margin-top: 40px; padding-top: 10px; border-top: 1px solid #e3e6eb; font-size: 11px; }
</style>
</head>
<body>
<div class="page">
  <header>
    <div class="biz">
      <h1>${e(org.name)}</h1>
      <div>${idLabel} ${ltr(org.taxId)}</div>
      ${contact ? `<div class="muted">${contact}</div>` : ""}
    </div>
    <div class="doc">
      <h2>${e(typeInfo?.label ?? doc.type)} ${ltr(String(doc.number).padStart(4, "0"))}</h2>
      <div class="meta">תאריך: ${ltr(formatDate(doc.issueDate))}</div>
      ${doc.allocationNumber ? `<div class="meta">מספר הקצאה: ${ltr(doc.allocationNumber)}</div>` : ""}
      <span class="mark ${mark}">${MARK_LABEL[mark]}</span>
    </div>
  </header>

  <section class="to">
    <div class="muted">לכבוד</div>
    <b>${e(doc.customerName)}</b>
    ${doc.customerTaxId ? `<div>מספר עוסק / ח.פ.: ${ltr(doc.customerTaxId)}</div>` : ""}
  </section>

  <table class="lines">
    <thead><tr><th class="c">#</th><th>תיאור</th><th class="c">כמות</th><th class="n">מחיר ליחידה</th><th class="n">סה"כ</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="totals"><tbody>${totals}</tbody></table>

  ${doc.notes ? `<div class="notes"><b>הערות:</b> ${e(doc.notes)}</div>` : ""}

  <footer class="muted">
    מסמך ממוחשב · ${e(profile?.label ?? "")} · ${e(org.name)}
  </footer>
</div>
</body>
</html>`;
}
