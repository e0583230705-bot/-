import Link from "next/link";
import { getContext } from "@/lib/auth/dal";
import { loadLedger } from "@/lib/services/reports";
import { expensesByCategory, monthlyBreakdown } from "@/lib/domain/reports";
import { formatILS, todayISO } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const { org } = await getContext();
  const currentYear = Number(todayISO().slice(0, 4));
  const requested = Number((await searchParams).year);
  const year = Number.isInteger(requested) && requested > 2000 && requested < 2100 ? requested : currentYear;

  const { profile, income, expenses } = await loadLedger(org.id);
  const months = monthlyBreakdown(year, income, expenses);
  const categories = expensesByCategory({ from: `${year}-01-01`, to: `${year}-12-31` }, expenses);
  const totals = months.reduce(
    (t, m) => ({
      revenue: t.revenue + m.revenue,
      recognizedExpenses: t.recognizedExpenses + m.recognizedExpenses,
      profit: t.profit + m.profit,
      outputVat: t.outputVat + m.outputVat,
      inputVat: t.inputVat + m.inputVat,
    }),
    { revenue: 0, recognizedExpenses: 0, profit: 0, outputVat: 0, inputVat: 0 },
  );
  const maxBar = Math.max(1, ...months.map((m) => Math.max(m.revenue, m.recognizedExpenses)));

  return (
    <div className="space-y-6">
      <PageHeader
        title={<>דוח שנתי <span className="num">{year}</span></>}
        description="סיכום השנה לקראת הדוח השנתי: הכנסות, הוצאות מוכרות ורווח, לפי חודשים ולפי קטגוריות."
        actions={
          <div className="pills">
            <Link href={`/reports?year=${year - 1}`} className="pill num">
              {year - 1}
            </Link>
            <span className="pill pill-active num">{year}</span>
            {year < currentYear && (
              <Link href={`/reports?year=${year + 1}`} className="pill num">
                {year + 1}
              </Link>
            )}
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="הכנסות (לפני מע״מ)" value={formatILS(totals.revenue)} />
        <Stat label="הוצאות מוכרות" value={formatILS(totals.recognizedExpenses)} />
        <Stat label="רווח לפני מס" value={formatILS(totals.profit)} tone={totals.profit >= 0 ? "good" : "bad"} />
      </section>

      <section className="table-wrap">
        <h2 className="card-title p-5 pb-0">פילוח חודשי</h2>
        <table className="table mt-2">
          <thead>
            <tr>
              <th>חודש</th>
              <th className="text-end">הכנסות</th>
              <th className="text-end">הוצאות מוכרות</th>
              <th className="text-end">רווח</th>
              {profile.chargesVat && <th className="text-end">מע״מ נטו</th>}
              <th className="w-40" aria-label="השוואה" />
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <td>{MONTHS[m.month - 1]}</td>
                <td className="num text-end">{formatILS(m.revenue)}</td>
                <td className="num text-end">{formatILS(m.recognizedExpenses)}</td>
                <td className={`num text-end ${m.profit < 0 ? "text-danger" : ""}`}>{formatILS(m.profit)}</td>
                {profile.chargesVat && <td className="num text-end">{formatILS(m.outputVat - m.inputVat)}</td>}
                <td>
                  <div className="space-y-0.5" title="הכנסות מול הוצאות">
                    <div className="h-1.5 rounded bg-brand" style={{ width: `${(m.revenue / maxBar) * 100}%` }} />
                    <div className="h-1.5 rounded bg-muted/50" style={{ width: `${(m.recognizedExpenses / maxBar) * 100}%` }} />
                  </div>
                </td>
              </tr>
            ))}
            <tr className="font-bold">
              <td>סה״כ</td>
              <td className="num text-end">{formatILS(totals.revenue)}</td>
              <td className="num text-end">{formatILS(totals.recognizedExpenses)}</td>
              <td className="num text-end">{formatILS(totals.profit)}</td>
              {profile.chargesVat && <td className="num text-end">{formatILS(totals.outputVat - totals.inputVat)}</td>}
              <td />
            </tr>
          </tbody>
        </table>
        <p className="flex gap-4 p-5 pt-3 text-xs text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-4 rounded bg-brand" /> הכנסות
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-4 rounded bg-muted/50" /> הוצאות מוכרות
          </span>
        </p>
      </section>

      <section className="table-wrap">
        <h2 className="card-title p-5 pb-0">הוצאות לפי קטגוריה</h2>
        {categories.length === 0 ? (
          <p className="p-4 text-sm text-muted">אין הוצאות בשנה הזו.</p>
        ) : (
          <table className="table mt-2">
            <thead>
              <tr>
                <th>קטגוריה</th>
                <th className="text-end">שולם</th>
                <th className="text-end">מוכר למס</th>
                <th className="text-end">הוצאות</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.category}>
                  <td>{c.category}</td>
                  <td className="num text-end">{formatILS(c.total)}</td>
                  <td className="num text-end">{formatILS(c.recognized)}</td>
                  <td className="num text-end">{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="card-title">ייצוא לרואה החשבון</h2>
        <p className="text-sm text-muted">
          קבצים שנפתחים באקסל. הם מרכזים את הנתונים לקראת הדוח השנתי (טופס {profile.annualReportForm}), אבל הם לא
          הדוח עצמו.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={`/reports/export?year=${year}&kind=summary`} className="btn-ghost" download>
            סיכום שנתי
          </a>
          <a href={`/reports/export?year=${year}&kind=documents`} className="btn-ghost" download>
            כל המסמכים
          </a>
          <a href={`/reports/export?year=${year}&kind=expenses`} className="btn-ghost" download>
            כל ההוצאות
          </a>
        </div>
      </section>
    </div>
  );
}
