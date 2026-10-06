import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth/dal";
import { getCustomer, listCustomerDocuments } from "@/lib/services/customers";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/documents";
import { formatDate, formatILS } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/page-header";

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  const { org, can } = await getContext();
  const customer = /^[0-9a-f-]{36}$/i.test(id) ? await getCustomer(org.id, id) : null;
  if (!customer) notFound();
  const docs = await listCustomerDocuments(org.id, customer.id);
  const details = [customer.taxId, customer.email, customer.phone, customer.address].filter(Boolean);

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/customers", label: "כל הלקוחות" }}
        title={customer.name}
        description={
          <>
            {customer.isVatRegistered ? "עוסק מורשה / חברה" : "לקוח פרטי / עוסק פטור"}
            {details.length > 0 && <> · <span className="num">{details.join(" · ")}</span></>}
          </>
        }
        actions={
          can("write_books") && (
            <>
              <Link href={`/customers/${customer.id}/edit`} className="btn-ghost">
                עריכה
              </Link>
              <Link href={`/income/new?customer=${customer.id}`} className="btn">
                מסמך חדש ללקוח
              </Link>
            </>
          )
        }
      />
      <div className="table-wrap">
        {docs.length === 0 ? (
          <EmptyState title="עדיין לא הופקו מסמכים ללקוח הזה" />
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
                    <Link href={`/income/${d.id}`} className="link">
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
