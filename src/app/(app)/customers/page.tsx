import Link from "next/link";
import { getContext } from "@/lib/auth/dal";
import { listCustomers } from "@/lib/services/customers";
import { formatDate, formatILS } from "@/lib/format";

export default async function CustomersPage() {
  const { org, can } = await getContext();
  const rows = await listCustomers(org.id);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">לקוחות</h1>
        {can("write_books") && (
          <Link href="/customers/new" className="btn">
            לקוח חדש
          </Link>
        )}
      </div>
      <div className="card overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-muted">
            עדיין אין לקוחות שמורים. אפשר להוסיף לקוח כאן או לשמור אותו בזמן הפקת מסמך.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>לקוח</th>
                <th>מספר עוסק</th>
                <th className="text-end">מסמכים</th>
                <th className="text-end">סה״כ חיובים</th>
                <th>מסמך אחרון</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ customer: c, documentCount, billed, lastDocument }) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/customers/${c.id}`} className="text-brand hover:underline">
                      {c.name}
                    </Link>
                    {c.isVatRegistered && <span className="ms-2 text-xs text-muted">עוסק מורשה</span>}
                  </td>
                  <td className="num">{c.taxId ?? "—"}</td>
                  <td className="num text-end">{documentCount}</td>
                  <td className="num text-end">{formatILS(billed)}</td>
                  <td className="num">{lastDocument ? formatDate(lastDocument) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
