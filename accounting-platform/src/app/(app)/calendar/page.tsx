import { getCurrentOrg } from "@/lib/current-org";
import { profileOf } from "@/lib/services/organizations";
import { buildTaxCalendar } from "@/lib/domain/tax-calendar";
import type { VatFrequency } from "@/lib/domain/business-types";
import { formatDate, todayISO } from "@/lib/format";

export default async function CalendarPage() {
  const org = (await getCurrentOrg())!;
  const profile = profileOf(org);
  const today = todayISO();
  const year = Number(today.slice(0, 4));
  const deadlines = buildTaxCalendar(year, profile, org.vatFrequency as VatFrequency);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">מועדי דיווח {year}</h1>
      <p className="text-sm text-muted">
        לפי הכללים הכלליים ל{profile.label}. מועד שנופל בסוף שבוע נדחה ליום ראשון. חגים ודחיות
        מיוחדות של רשות המסים עדיין לא מחושבים, לכן כדאי לוודא מול הודעות הרשות.
      </p>
      <div className="card overflow-x-auto p-0">
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
                  <td className="num">{formatDate(d.due)}</td>
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
