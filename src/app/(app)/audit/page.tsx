import Link from "next/link";
import { getContext } from "@/lib/auth/dal";
import { listEngagements } from "@/lib/services/audit";
import { CreateEngagementForm } from "@/components/audit-forms";
import { formatDate, todayISO } from "@/lib/format";
import { Collapsible, EmptyState, PageHeader } from "@/components/page-header";

export default async function AuditPage() {
  const { org, can } = await getContext();
  const engagements = await listEngagements(org.id);
  const year = Number(todayISO().slice(0, 4));
  return (
    <div className="space-y-5">
      <PageHeader
        title="ביקורת דוחות"
        description="תיקי ביקורת של לקוחות המשרד. המערכת מבצעת את הבדיקות ומכינה את החומר; שיקול הדעת וחוות הדעת נשארים אצל רואה החשבון המבקר."
      />
      {can("write_books") && (
        <Collapsible title="תיק ביקורת חדש" description="שם הלקוח המבוקר, ח.פ. ושנת הדוח" open={engagements.length === 0}>
          <CreateEngagementForm defaultYear={year - 1} />
        </Collapsible>
      )}
      <div className="table-wrap">
        {engagements.length === 0 ? (
          <EmptyState title="עדיין אין תיקי ביקורת" description="פותחים תיק ללקוח, קולטים את הספרים שלו, והבדיקות רצות מעצמן." />
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
                    <Link href={`/audit/${e.id}`} className="link">
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
