import type { BusinessTypeProfile, VatFrequency } from "./business-types";
import type { ISODate } from "./vat";

export type DeadlineKind = "vat" | "income_tax_advance" | "national_insurance" | "annual_report";

export interface Deadline {
  kind: DeadlineKind;
  title: string;
  due: ISODate;
  /** התקופה שעליה מדווחים */
  periodLabel: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** אם המועד נופל בשישי או שבת — דוחים לראשון. (חגים עדיין לא מטופלים.) */
export function shiftFromWeekend(date: ISODate): ISODate {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.getUTCDay();
  if (day === 5) d.setUTCDate(d.getUTCDate() + 2);
  if (day === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** תקופות דיווח בשנה: חודשי — 12 תקופות, דו־חודשי — 6 תקופות. */
export function reportingPeriods(year: number, frequency: VatFrequency) {
  if (frequency === "none") return [];
  const step = frequency === "monthly" ? 1 : 2;
  const periods: { from: ISODate; to: ISODate; label: string; lastMonth: number }[] = [];
  for (let m = 1; m <= 12; m += step) {
    const last = m + step - 1;
    const lastDay = new Date(Date.UTC(year, last, 0)).getUTCDate();
    periods.push({
      from: iso(year, m, 1),
      to: iso(year, last, lastDay),
      label: step === 1 ? `${pad(m)}/${year}` : `${pad(m)}-${pad(last)}/${year}`,
      lastMonth: last,
    });
  }
  return periods;
}

/** מועד הדיווח: ה־15 בחודש שאחרי סוף התקופה. */
function dueAfter(year: number, lastMonth: number): ISODate {
  const y = lastMonth === 12 ? year + 1 : year;
  const m = lastMonth === 12 ? 1 : lastMonth + 1;
  return shiftFromWeekend(iso(y, m, 15));
}

/**
 * לוח מועדים שנתי לפי פרופיל העסק. המועדים הם הכללים הכלליים —
 * יש עסקים עם מועדים אחרים (למשל דיווח מפורט עד ה־23), ולכן הכול ניתן להתאמה.
 */
export function buildTaxCalendar(
  year: number,
  profile: BusinessTypeProfile,
  vatFrequency: VatFrequency,
  advancesFrequency: VatFrequency = profile.chargesVat ? vatFrequency : "bimonthly",
): Deadline[] {
  const deadlines: Deadline[] = [];

  if (profile.chargesVat) {
    for (const p of reportingPeriods(year, vatFrequency)) {
      deadlines.push({
        kind: "vat",
        title: "דיווח ותשלום מע\"מ",
        due: dueAfter(year, p.lastMonth),
        periodLabel: p.label,
      });
    }
  }

  for (const p of reportingPeriods(year, advancesFrequency)) {
    deadlines.push({
      kind: "income_tax_advance",
      title: "מקדמות מס הכנסה",
      due: dueAfter(year, p.lastMonth),
      periodLabel: p.label,
    });
  }

  if (profile.paysSelfEmployedNationalInsurance) {
    for (const p of reportingPeriods(year, "monthly")) {
      deadlines.push({
        kind: "national_insurance",
        title: "מקדמות ביטוח לאומי",
        due: dueAfter(year, p.lastMonth),
        periodLabel: p.label,
      });
    }
  }

  deadlines.push({
    kind: "annual_report",
    title: `דוח שנתי (טופס ${profile.annualReportForm})`,
    due: shiftFromWeekend(iso(year + 1, 5, 31)),
    periodLabel: String(year),
  });

  return deadlines.sort((a, b) => a.due.localeCompare(b.due));
}

export function upcomingDeadlines(deadlines: Deadline[], today: ISODate, limit = 5): Deadline[] {
  return deadlines.filter((d) => d.due >= today).slice(0, limit);
}
