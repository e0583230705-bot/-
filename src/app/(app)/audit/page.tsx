import Link from "next/link";
import { getContext } from "@/lib/auth/dal";
import { listEngagements } from "@/lib/services/audit";
import { CreateEngagementForm } from "@/components/audit-forms";
import { formatDate, todayISO } from "@/lib/format";

export default async function AuditPage() {
  const { org, can } = await getContext();
  const engagements = await listEngagements(org.id);
  const year = Number(todayISO().slice(0, 4));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">ביקורת דוחות</h1>
        <p className="text-sm text-muted">
          תיקי ביקורת של לקוחות המשרד. המערכת מבצעת את הבדיקות ומכינה את החומר; שיקול הדעת וחוות הדעת נשארים אצל רואה
          החשבון המבקר.
        </p>
      </div>
      {can("write_books") && (
        <div className="card space-y-2">
          <h2 className="font-bold">תיק ביקורת חדש</h2>
          <CreateEngagementForm defaultYear={year - 1} />
        </div>
      )}
      <div className="card overflow-x-auto p-0">
        {engagements.length === 0 ? (
          <p className="p-6 text-center text-muted">עדיין אין תיקי ביקורת.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>לקוח</th>
                <th>שנת דוח</th>
                <th className="text-end">שורות פקודה</th>
                <th>נקלט</th>
              </tr>
            </thead>
            <tbody>
              {engagements.map(({ engagement: e, lineCount }) => (
                <tr key={e.id}>
                  <td>
                    <Link href={`/audit/${e.id}`} className="text-brand hover:underline">
                      {e.clientName}
                    </Link>
                    {e.clientTaxId && <span className="num ms-2 text-xs text-muted">{e.clientTaxId}</span>}
                  </td>
                  <td className="num">{e.fiscalYear}</td>
                  <td className="num text-end">{lineCount.toLocaleString("he-IL")}</td>
                  <td className="num">{e.importedAt ? formatDate(e.importedAt.toISOString().slice(0, 10)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
