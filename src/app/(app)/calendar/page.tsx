import { getContext } from "@/lib/auth/dal";
import { profileOf } from "@/lib/services/organizations";
import { buildTaxCalendar } from "@/lib/domain/tax-calendar";
import type { VatFrequency } from "@/lib/domain/business-types";
import { formatDate, todayISO } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

export default async function CalendarPage() {
  const { org } = await getContext();
  const profile = profileOf(org);
  const today = todayISO();
  const year = Number(today.slice(0, 4));
  const deadlines = buildTaxCalendar(year, profile, org.vatFrequency as VatFrequency);

  return (
    <div className="space-y-5">
      <PageHeader
        title={<>מועדי דיווח <span className="num">{year}</span></>}
        description={`לפי הכללים הכלליים ל${profile.label}. מועד שנופל בסוף שבוע נדחה ליום ראשון. חגים ודחיות מיוחדות של רשות המסים עדיין לא מחושבים, לכן כדאי לוודא מול הודעות הרשות.`}
      />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>מועד</th>
              <th>מה</th>
              <th>תקופה</th>
            </tr>
          </thead>
          <tbody>
            {deadlines.map((d) => {
              const past = d.due < today;
              return (
                <tr key={`${d.kind}-${d.due}-${d.periodLabel}`} className={past ? "text-muted" : ""}>
                  <td className="num whitespace-nowrap">
                    {formatDate(d.due)}
                    {!past && d.due === today && <span className="badge badge-bad ms-2">היום</span>}
                  </td>
                  <td>{d.title}</td>
                  <td className="num">{d.periodLabel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
