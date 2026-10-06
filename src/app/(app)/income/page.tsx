import Link from "next/link";
import { getContext } from "@/lib/auth/dal";
import { listDocuments } from "@/lib/services/documents";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/documents";
import { formatDate, formatILS, todayISO } from "@/lib/format";
import { paymentStatus, summarizeReceivables } from "@/lib/domain/receivables";
import { PaymentBadge } from "@/components/payment-badge";

export default async function IncomePage({ searchParams }: PageProps<"/income">) {
  const { org, can } = await getContext();
  const today = todayISO();
  const all = await listDocuments(org.id);
  const openOnly = (await searchParams).filter === "open";
  const docs = openOnly
    ? all.filter((d) => {
        const s = paymentStatus(d, today);
        return s && s.kind !== "paid";
      })
    : all;
  const receivables = summarizeReceivables(all, today);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">הכנסות ומסמכים</h1>
        {can("write_books") && (
          <Link href="/income/new" className="btn">
            מסמך חדש
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/income" className={openOnly ? "btn-ghost" : "btn"}>
          כל המסמכים
        </Link>
        <Link href="/income?filter=open" className={openOnly ? "btn" : "btn-ghost"}>
          ממתינים לתשלום ({receivables.openCount})
        </Link>
        {receivables.openCount > 0 && (
          <span className="text-muted">
            סה״כ פתוח <span className="num">{formatILS(receivables.open)}</span>
            {receivables.overdueCount > 0 && (
              <span className="text-danger">
                {" "}
                · באיחור <span className="num">{formatILS(receivables.overdue)}</span>
              </span>
            )}
          </span>
        )}
      </div>
      <div className="card overflow-x-auto p-0">
        {docs.length === 0 ? (
          <p className="p-6 text-center text-muted">
            {openOnly ? "אין חשבוניות שממתינות לתשלום 🎉" : "עדיין לא הופקו מסמכים."}
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>מסמך</th>
                <th>תאריך</th>
                <th>לקוח</th>
                <th className="text-end">לפני מע״מ</th>
                <th className="text-end">סה״כ</th>
                <th>תשלום</th>
                <th>מספר הקצאה</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/income/${d.id}`} className="text-brand hover:underline">
                      {DOCUMENT_TYPES[d.type as DocumentType].label}{" "}
                      <span className="num">#{d.number}</span>
                    </Link>
                  </td>
                  <td className="num">{formatDate(d.issueDate)}</td>
                  <td>{d.customerName}</td>
                  <td className="num text-end">{formatILS(d.net)}</td>
                  <td className="num text-end font-medium">{formatILS(d.gross)}</td>
                  <td>
                    <PaymentBadge status={paymentStatus(d, today)} />
                  </td>
                  <td>
                    {d.allocationRequired ? (
                      d.allocationNumber ?? (
                        <span className="rounded bg-warn-soft px-2 py-0.5 text-xs text-warn">נדרש</span>
                      )
                    ) : (
                      <span className="text-muted">—</span>
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
