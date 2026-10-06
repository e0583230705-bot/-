import { getContext } from "@/lib/auth/dal";
import { listCategories, listExpenses } from "@/lib/services/expenses";
import { getBankTransaction } from "@/lib/services/bank";
import { profileOf } from "@/lib/services/organizations";
import { vatRateOn } from "@/lib/domain/vat";
import { formatDate, formatILS, todayISO } from "@/lib/format";
import { ExpenseForm } from "@/components/expense-form";

export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  const { org, can } = await getContext();
  const { fromTx } = await searchParams;
  const tx =
    typeof fromTx === "string" && /^[0-9a-f-]{36}$/i.test(fromTx) ? await getBankTransaction(org.id, fromTx) : null;
  const fromBank =
    tx && tx.amount < 0 && tx.status === "unmatched"
      ? { id: tx.id, date: tx.date, description: tx.description, gross: -tx.amount }
      : undefined;
  const profile = profileOf(org);
  const [rows, categories] = await Promise.all([listExpenses(org.id), listCategories(org.id)]);
  const today = todayISO();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">הוצאות</h1>
      {fromBank && (
        <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">
          רישום הוצאה מתנועת בנק. השלימו קטגוריה ובדקו את המע״מ מול החשבונית של הספק.
        </p>
      )}
      {can("write_books") && (
      <div className="card">
        <ExpenseForm
          categories={categories.map((c) => ({ id: c.id, label: c.label }))}
          vatRate={vatRateOn(today)}
          canDeductVat={profile.chargesVat}
          today={today}
          fromBank={fromBank}
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
