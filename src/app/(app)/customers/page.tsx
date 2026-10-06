import Link from "next/link";
import { getContext } from "@/lib/auth/dal";
import { listCustomers } from "@/lib/services/customers";
import { formatDate, formatILS } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Icons } from "@/components/icons";

export default async function CustomersPage() {
  const { org, can } = await getContext();
  const rows = await listCustomers(org.id);
  return (
    <div className="space-y-5">
      <PageHeader
        title="לקוחות"
        description="כל מי שהופק לו מסמך, עם סך החיובים והמסמך האחרון."
        actions={
          can("write_books") && (
            <Link href="/customers/new" className="btn">
              <Icons.plus size={16} />
              לקוח חדש
            </Link>
          )
        }
      />
      <div className="table-wrap">
        {rows.length === 0 ? (
          <EmptyState
            title="עדיין אין לקוחות שמורים"
            description="אפשר להוסיף לקוח כאן, או פשוט להפיק מסמך: הלקוח יישמר מעצמו."
            action={
              can("write_books") && (
                <Link href="/customers/new" className="btn">
                  הוספת לקוח
                </Link>
              )
            }
          />
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
                    <Link href={`/customers/${c.id}`} className="link">
                      {c.name}
                    </Link>
                    {c.isVatRegistered && <span className="badge badge-muted ms-2">עוסק מורשה</span>}
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
