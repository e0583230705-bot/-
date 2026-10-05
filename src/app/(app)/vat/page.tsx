import Link from "next/link";
import { getContext } from "@/lib/auth/dal";
import { vatReport } from "@/lib/services/reports";
import { profileOf } from "@/lib/services/organizations";
import { reportingPeriods } from "@/lib/domain/tax-calendar";
import type { VatFrequency } from "@/lib/domain/business-types";
import { formatILS, todayISO } from "@/lib/format";

export default async function VatPage({ searchParams }: PageProps<"/vat">) {
  const { org } = await getContext();
  const profile = profileOf(org);

  if (!profile.chargesVat) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">דוח מע״מ</h1>
        <div className="card text-muted">{profile.label} אינו מדווח מע״מ תקופתי.</div>
      </div>
    );
  }

  const today = todayISO();
  const sp = await searchParams;
  const year = Number(sp.year) || Number(today.slice(0, 4));
  const periods = reportingPeriods(year, org.vatFrequency as VatFrequency);
  const currentIdx = periods.findIndex((p) => today >= p.from && today <= p.to);
  const idx = sp.p !== undefined ? Number(sp.p) : currentIdx >= 0 ? currentIdx : periods.length - 1;
  const period = periods[Math.min(Math.max(idx, 0), periods.length - 1)];
  const r = await vatReport(org.id, period);

  const rows: [string, number][] = [
    ["עסקאות חייבות (לפני מע״מ)", r.salesNet],
    ["מע״מ עסקאות", r.outputVat],
    ["תשומות (לפני מע״מ)", r.inputsNet],
    ["מע״מ תשומות לקיזוז", r.inputVat],
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">דוח מע״מ</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/vat?year=${year - 1}&p=0`} className="btn-ghost">
          {year - 1}
        </Link>
        {periods.map((p, i) => (
          <Link
            key={p.label}
            href={`/vat?year=${year}&p=${i}`}
            className={p.label === period.label ? "btn" : "btn-ghost"}
          >
            <span className="num">{p.label.split("/")[0]}</span>
          </Link>
        ))}
        <Link href={`/vat?year=${year + 1}&p=0`} className="btn-ghost">
          {year + 1}
        </Link>
      </div>
      <div className="card max-w-lg">
        <p className="mb-3 text-sm text-muted">
          תקופה <span className="num">{period.label}</span>
        </p>
        <dl className="divide-y divide-border">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between py-2 text-sm">
              <dt>{label}</dt>
              <dd className="num">{formatILS(value)}</dd>
            </div>
          ))}
          <div className="flex justify-between py-3 font-bold">
            <dt>{r.vatDue >= 0 ? "סה״כ לתשלום" : "סה״כ להחזר"}</dt>
            <dd className={`num ${r.vatDue >= 0 ? "" : "text-brand"}`}>{formatILS(Math.abs(r.vatDue))}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">
          אלה הנתונים להזנה בדיווח המקוון באתר רשות המסים. מומלץ להשוות למסמכים לפני הדיווח.
        </p>
      </div>
    </div>
  );
}
