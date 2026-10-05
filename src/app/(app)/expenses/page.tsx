import { getContext } from "@/lib/auth/dal";
import { listCategories, listExpenses } from "@/lib/services/expenses";
import { profileOf } from "@/lib/services/organizations";
import { vatRateOn } from "@/lib/domain/vat";
import { formatDate, formatILS, todayISO } from "@/lib/format";
import { ExpenseForm } from "@/components/expense-form";

export default async function ExpensesPage() {
  const { org, can } = await getContext();
  const profile = profileOf(org);
  const [rows, categories] = await Promise.all([listExpenses(org.id), listCategories(org.id)]);
  const today = todayISO();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">הוצאות</h1>
      {can("write_books") && (
      <div className="card">
        <ExpenseForm
          categories={categories.map((c) => ({ id: c.id, label: c.label }))}
          vatRate={vatRateOn(today)}
          canDeductVat={profile.chargesVat}
          today={today}
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
