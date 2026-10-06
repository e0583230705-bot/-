import { getContext } from "@/lib/auth/dal";
import { listCategories, listExpenses, listKnownSuppliers } from "@/lib/services/expenses";
import { findKnownSupplier } from "@/lib/domain/suppliers";
import { getBankTransaction } from "@/lib/services/bank";
import { getPendingReceipt, receiptsForExpenses } from "@/lib/services/receipts";
import { aiConfigured } from "@/lib/ai/receipt";
import { ReceiptUploadForm } from "@/components/receipt-upload-form";
import type { ExpensePrefill } from "@/components/expense-form";
import { profileOf } from "@/lib/services/organizations";
import { vatRateOn } from "@/lib/domain/vat";
import { formatDate, formatILS, todayISO } from "@/lib/format";
import { ExpenseForm } from "@/components/expense-form";
import { Collapsible, EmptyState, PageHeader } from "@/components/page-header";

export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  const { org, can } = await getContext();
  const { fromTx, receipt: receiptParam, scan } = await searchParams;
  const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
  const today = todayISO();
  const tx = isId(fromTx) ? await getBankTransaction(org.id, fromTx) : null;
  const receipt = isId(receiptParam) ? await getPendingReceipt(org.id, receiptParam, today) : null;

  const suppliers = await listKnownSuppliers(org.id);

  let prefill: ExpensePrefill | undefined;
  if (tx && tx.amount < 0 && tx.status === "unmatched") {
    const known = findKnownSupplier(tx.description, suppliers);
    prefill = {
      bankTransactionId: tx.id,
      date: tx.date,
      supplierName: known?.name ?? tx.description,
      supplierTaxId: known?.supplierTaxId ?? undefined,
      categoryId: known?.categoryId,
      gross: -tx.amount,
    };
  } else if (receipt) {
    const p = receipt.prefill;
    // היסטוריית הספק אמינה יותר מניחוש הקטגוריה של ה־AI
    const known = p.supplierName ? findKnownSupplier(p.supplierName, suppliers) : null;
    prefill = {
      receiptId: receipt.id,
      categoryId: known?.categoryId ?? receipt.categoryId,
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
    <div className="space-y-5">
      <PageHeader
        title="הוצאות"
        description="הוצאות העסק, עם המע״מ לקיזוז והחלק המוכר למס לפי הקטגוריה. אפשר לצלם קבלה, והפרטים יתמלאו מעצמם."
      />
      {can("write_books") && !prefill && (
        <Collapsible title="צילום או העלאת קבלה" description="הקבלה נשמרת, והפרטים נקראים ממנה אוטומטית" open={rows.length === 0}>
          <ReceiptUploadForm aiEnabled={aiConfigured()} />
        </Collapsible>
      )}
      {prefill?.bankTransactionId && (
        <p className="notice notice-info">
          רישום הוצאה מתנועת בנק. השלימו קטגוריה ובדקו את המע״מ מול החשבונית של הספק.
        </p>
      )}
      {receipt && (
        <div className="notice notice-info space-y-2">
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
      <Collapsible title="רישום הוצאה ידני" description="ספק, סכום וקטגוריה" open={Boolean(prefill) || rows.length === 0}>
        <ExpenseForm
          categories={categories.map((c) => ({ id: c.id, label: c.label }))}
          vatRate={vatRateOn(today)}
          canDeductVat={profile.chargesVat}
          today={today}
          prefill={prefill}
          suppliers={suppliers}
          key={prefill?.receiptId ?? prefill?.bankTransactionId ?? "new"}
        />
      </Collapsible>
      )}
      <div className="table-wrap">
        {rows.length === 0 ? (
          <EmptyState title="עדיין לא נרשמו הוצאות" description="מעלים קבלה או ממלאים את הטופס למעלה. ההוצאה הראשונה היא הכי קלה." />
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
                        className="link text-xs"
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
