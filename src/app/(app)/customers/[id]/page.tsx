import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth/dal";
import { getCustomer, listCustomerDocuments } from "@/lib/services/customers";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/documents";
import { formatDate, formatILS } from "@/lib/format";

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  const { org, can } = await getContext();
  const customer = /^[0-9a-f-]{36}$/i.test(id) ? await getCustomer(org.id, id) : null;
  if (!customer) notFound();
  const docs = await listCustomerDocuments(org.id, customer.id);
  const details = [customer.taxId, customer.email, customer.phone, customer.address].filter(Boolean);

  return (
    <div className="space-y-4">
      <Link href="/customers" className="text-sm text-brand">
        → כל הלקוחות
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{customer.name}</h1>
          <p className="text-sm text-muted">
            {customer.isVatRegistered ? "עוסק מורשה / חברה" : "לקוח פרטי / עוסק פטור"}
            {details.length > 0 && <> · <span className="num">{details.join(" · ")}</span></>}
          </p>
        </div>
        {can("write_books") && (
          <div className="flex gap-2">
            <Link href={`/customers/${customer.id}/edit`} className="btn-ghost">
              עריכה
            </Link>
            <Link href={`/income/new?customer=${customer.id}`} className="btn">
              מסמך חדש ללקוח
            </Link>
          </div>
        )}
      </div>
      <div className="card overflow-x-auto p-0">
        {docs.length === 0 ? (
          <p className="p-6 text-center text-muted">עדיין לא הופקו מסמכים ללקוח הזה.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>מסמך</th>
                <th>תאריך</th>
                <th className="text-end">סה״כ</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/income/${d.id}`} className="text-brand hover:underline">
                      {DOCUMENT_TYPES[d.type as DocumentType].label} <span className="num">#{d.number}</span>
                    </Link>
                  </td>
                  <td className="num">{formatDate(d.issueDate)}</td>
                  <td className="num text-end">{formatILS(d.gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
