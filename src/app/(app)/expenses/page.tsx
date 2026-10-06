import { getContext } from "@/lib/auth/dal";
import { listCategories, listExpenses } from "@/lib/services/expenses";
import { getBankTransaction } from "@/lib/services/bank";
import { getPendingReceipt, receiptsForExpenses } from "@/lib/services/receipts";
import { aiConfigured } from "@/lib/ai/receipt";
import { ReceiptUploadForm } from "@/components/receipt-upload-form";
import type { ExpensePrefill } from "@/components/expense-form";
import { profileOf } from "@/lib/services/organizations";
import { vatRateOn } from "@/lib/domain/vat";
import { formatDate, formatILS, todayISO } from "@/lib/format";
import { ExpenseForm } from "@/components/expense-form";

export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  const { org, can } = await getContext();
  const { fromTx, receipt: receiptParam, scan } = await searchParams;
  const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
  const today = todayISO();
  const tx = isId(fromTx) ? await getBankTransaction(org.id, fromTx) : null;
  const receipt = isId(receiptParam) ? await getPendingReceipt(org.id, receiptParam, today) : null;

  let prefill: ExpensePrefill | undefined;
  if (tx && tx.amount < 0 && tx.status === "unmatched") {
    prefill = { bankTransactionId: tx.id, date: tx.date, supplierName: tx.description, gross: -tx.amount };
  } else if (receipt) {
    const p = receipt.prefill;
    prefill = {
      receiptId: receipt.id,
      categoryId: receipt.categoryId,
      date: p.date,
      supplierName: p.supplierName,
      supplierTaxId: p.supplierTaxId,
      referenceNumber: p.referenceNumber,
      gross: p.gross,
      vat: p.vat,
      description: p.description,
    };
  }
  const receiptMap = await receiptsForExpenses(org.id);
  const profile = profileOf(org);
  const [rows, categories] = await Promise.all([listExpenses(org.id), listCategories(org.id)]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">הוצאות</h1>
      {can("write_books") && !prefill && (
        <div className="card">
          <ReceiptUploadForm aiEnabled={aiConfigured()} />
        </div>
      )}
      {prefill?.bankTransactionId && (
        <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">
          רישום הוצאה מתנועת בנק. השלימו קטגוריה ובדקו את המע״מ מול החשבונית של הספק.
        </p>
      )}
      {receipt && (
        <div className="space-y-2 rounded-lg bg-brand-soft px-3 py-2 text-sm">
          <p className="text-brand">
            {receipt.extractionStatus === "done"
              ? "הפרטים מולאו מהקבלה. בדקו אותם מול הקבלה לפני השמירה."
              : scan === "failed"
                ? "לא הצלחנו לקרוא את הקבלה אוטומטית. הקבלה נשמרה — מלאו את הפרטים ידנית."
                : "הקבלה נשמרה. מלאו את הפרטים, והיא תצורף להוצאה."}{" "}
            <a href={`/expenses/receipts/${receipt.id}`} target="_blank" rel="noopener" className="underline">
              צפייה בקבלה
            </a>
          </p>
          {receipt.prefill.warnings.map((w) => (
            <p key={w} className="text-warn">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}
      {can("write_books") && (
      <div className="card">
        <ExpenseForm
          categories={categories.map((c) => ({ id: c.id, label: c.label }))}
          vatRate={vatRateOn(today)}
          canDeductVat={profile.chargesVat}
          today={today}
          prefill={prefill}
          key={prefill?.receiptId ?? prefill?.bankTransactionId ?? "new"}
        />
      </div>
      )}
      <div className="card overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-muted">עדיין לא נרשמו הוצאות.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>תאריך</th>
                <th>ספק</th>
                <th>קטגוריה</th>
                <th className="text-end">מע״מ</th>
                <th className="text-end">סה״כ</th>
                <th aria-label="קבלה" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ expense: e, categoryLabel }) => (
                <tr key={e.id}>
                  <td className="num">{formatDate(e.date)}</td>
                  <td>
                    {e.supplierName}
                    {e.description && <span className="block text-xs text-muted">{e.description}</span>}
                  </td>
                  <td>{categoryLabel}</td>
                  <td className="num text-end">{formatILS(e.vat)}</td>
                  <td className="num text-end font-medium">{formatILS(e.gross)}</td>
                  <td>
                    {receiptMap.has(e.id) && (
                      <a
                        href={`/expenses/receipts/${receiptMap.get(e.id)}`}
                        target="_blank"
                        rel="noopener"
                        className="text-xs text-brand"
                      >
                        קבלה
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
