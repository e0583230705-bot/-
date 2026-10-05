import Link from "next/link";
import { getContext } from "@/lib/auth/dal";
import { listDocuments } from "@/lib/services/documents";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/documents";
import { formatDate, formatILS } from "@/lib/format";

export default async function IncomePage() {
  const { org, can } = await getContext();
  const docs = await listDocuments(org.id);
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
      <div className="card overflow-x-auto p-0">
        {docs.length === 0 ? (
          <p className="p-6 text-center text-muted">עדיין לא הופקו מסמכים.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>מסמך</th>
                <th>תאריך</th>
                <th>לקוח</th>
                <th className="text-end">לפני מע״מ</th>
                <th className="text-end">סה״כ</th>
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
