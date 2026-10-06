import Link from "next/link";
import { getContext } from "@/lib/auth/dal";
import { vatReport } from "@/lib/services/reports";
import { profileOf } from "@/lib/services/organizations";
import { reportingPeriods } from "@/lib/domain/tax-calendar";
import type { VatFrequency } from "@/lib/domain/business-types";
import { formatILS, todayISO } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

export default async function VatPage({ searchParams }: PageProps<"/vat">) {
  const { org } = await getContext();
  const profile = profileOf(org);

  if (!profile.chargesVat) {
    return (
      <div className="space-y-5">
        <PageHeader title="דוח מע״מ" />
        <div className="notice notice-info">{profile.label} אינו מדווח מע״מ תקופתי, ולכן אין כאן מה להגיש.</div>
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
    <div className="space-y-5">
      <PageHeader
        title="דוח מע״מ"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/vat?year=${year - 1}&p=0`} className="btn-ghost btn-sm num">
          {year - 1}
        </Link>
        <div className="pills">
          {periods.map((p, i) => (
            <Link
              key={p.label}
              href={`/vat?year=${year}&p=${i}`}
              className={`pill num ${p.label === period.label ? "pill-active" : ""}`}
            >
              {p.label.split("/")[0]}
            </Link>
          ))}
        </div>
        <Link href={`/vat?year=${year + 1}&p=0`} className="btn-ghost btn-sm num">
          {year + 1}
        </Link>
      </div>
      <div className="card max-w-lg">
        <h2 className="card-title mb-3">
          תקופה <span className="num">{period.label}</span>
        </h2>
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
