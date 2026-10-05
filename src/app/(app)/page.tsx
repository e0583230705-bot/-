import Link from "next/link";
import { getContext } from "@/lib/auth/dal";
import { loadLedger } from "@/lib/services/reports";
import { computeProfitAndLoss, computeVatReport } from "@/lib/domain/reports";
import { buildTaxCalendar, upcomingDeadlines } from "@/lib/domain/tax-calendar";
import { osekPaturCeiling, type VatFrequency } from "@/lib/domain/business-types";
import { formatDate, formatILS, todayISO } from "@/lib/format";
import { periodContaining } from "@/lib/periods";
import { Stat } from "@/components/stat";

export default async function DashboardPage() {
  const { org, can } = await getContext();
  const { profile, income, expenses } = await loadLedger(org.id);
  const today = todayISO();
  const year = Number(today.slice(0, 4));
  const ytd = computeProfitAndLoss({ from: `${year}-01-01`, to: `${year}-12-31` }, income, expenses);

  const vatFrequency = org.vatFrequency as VatFrequency;
  const vatPeriod = profile.chargesVat ? periodContaining(today, vatFrequency) : null;
  const vat = vatPeriod ? computeVatReport(vatPeriod, income, expenses) : null;

  const deadlines = upcomingDeadlines(
    [
      ...buildTaxCalendar(year - 1, profile, vatFrequency),
      ...buildTaxCalendar(year, profile, vatFrequency),
    ].sort((a, b) => a.due.localeCompare(b.due)),
    today,
  );

  const ceiling = org.businessType === "osek_patur" ? osekPaturCeiling(year) : undefined;
  const ceilingPct = ceiling ? Math.min(100, Math.round((ytd.revenue / (ceiling * 100)) * 100)) : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">לוח בקרה</h1>
        <p className="text-muted">שנת {year}, נכון ל־{formatDate(today)}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="הכנסות מתחילת השנה" value={formatILS(ytd.revenue)} hint="לפני מע״מ" />
        <Stat label="הוצאות מוכרות" value={formatILS(ytd.recognizedExpenses)} />
        <Stat
          label="רווח לפני מס"
          value={formatILS(ytd.profit)}
          tone={ytd.profit >= 0 ? "good" : "bad"}
        />
        {vat ? (
          <Stat
            label={vat.vatDue >= 0 ? "מע״מ לתשלום בתקופה" : "החזר מע״מ צפוי"}
            value={formatILS(Math.abs(vat.vatDue))}
            hint={`תקופה ${vatPeriod!.label}`}
          />
        ) : (
          <Stat label="מע״מ" value="פטור" hint={`${profile.label} אינו מדווח מע״מ`} />
        )}
      </section>

      {ceiling && (
        <section className="card">
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-semibold">תקרת מחזור עוסק פטור</span>
            <span className="num text-muted">
              {formatILS(ytd.revenue)} / {formatILS(ceiling * 100)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-bg">
            <div
              className={`h-full ${ceilingPct >= 85 ? "bg-warn" : "bg-brand"}`}
              style={{ width: `${ceilingPct}%` }}
            />
          </div>
          {ceilingPct >= 85 && (
            <p className="mt-2 text-sm text-warn">
              מתקרבים לתקרה. מעבר לתקרה מחייב מעבר לעוסק מורשה, כדאי להתכונן מראש.
            </p>
          )}
        </section>
      )}

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">המועדים הקרובים</h2>
          <Link href="/calendar" className="text-sm text-brand">
            ללוח המלא
          </Link>
        </div>
        <ul className="divide-y divide-border">
          {deadlines.map((d) => (
            <li key={`${d.kind}-${d.due}-${d.periodLabel}`} className="flex justify-between py-2 text-sm">
              <span>
                {d.title} <span className="text-muted">({d.periodLabel})</span>
              </span>
              <span className="num font-medium">{formatDate(d.due)}</span>
            </li>
          ))}
        </ul>
      </section>

      {can("write_books") && (
      <section className="flex flex-wrap gap-3">
        <Link href="/income/new" className="btn">
          הפקת מסמך חדש
        </Link>
        <Link href="/expenses" className="btn-ghost">
          רישום הוצאה
        </Link>
      </section>
      )}
    </div>
  );
}
