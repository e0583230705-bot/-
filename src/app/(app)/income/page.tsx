import Link from "next/link";
import { getContext } from "@/lib/auth/dal";
import { listDocuments } from "@/lib/services/documents";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/documents";
import { formatDate, formatILS, todayISO } from "@/lib/format";
import { paymentStatus, summarizeReceivables } from "@/lib/domain/receivables";
import { PaymentBadge } from "@/components/payment-badge";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Icons } from "@/components/icons";

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
    <div className="space-y-5">
      <PageHeader
        title="הכנסות ומסמכים"
        description="חשבוניות, קבלות וחשבונות עסקה שהופקו ללקוחות. מסמך שהופק לא משתנה; לתיקון מפיקים זיכוי."
        actions={
          can("write_books") && (
            <Link href="/income/new" className="btn">
              <Icons.plus size={16} />
              מסמך חדש
            </Link>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="pills">
          <Link href="/income" className={`pill ${openOnly ? "" : "pill-active"}`}>
            כל המסמכים
          </Link>
          <Link href="/income?filter=open" className={`pill ${openOnly ? "pill-active" : ""}`}>
            ממתינים לתשלום ({receivables.openCount})
          </Link>
        </div>
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
      <div className="table-wrap">
        {docs.length === 0 ? (
          openOnly ? (
            <EmptyState title="אין חשבוניות שממתינות לתשלום" description="כל הלקוחות שילמו. יופי." />
          ) : (
            <EmptyState
              title="עדיין לא הופקו מסמכים"
              description="המסמך הראשון לוקח דקה: בוחרים סוג, לקוח ושורות, והמערכת מחשבת את המע״מ."
              action={
                can("write_books") && (
                  <Link href="/income/new" className="btn">
                    הפקת מסמך ראשון
                  </Link>
                )
              }
            />
          )
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
                    <Link href={`/income/${d.id}`} className="link">
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
                        <span className="badge badge-warn">נדרש</span>
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
