import Link from "next/link";
import { getContext } from "@/lib/auth/dal";
import { loadLedger } from "@/lib/services/reports";
import { expensesByCategory, monthlyBreakdown } from "@/lib/domain/reports";
import { formatILS, todayISO } from "@/lib/format";

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">דוח שנתי {year}</h1>
        <div className="flex gap-2">
          <Link href={`/reports?year=${year - 1}`} className="btn-ghost">
            {year - 1}
          </Link>
          {year < currentYear && (
            <Link href={`/reports?year=${year + 1}`} className="btn-ghost">
              {year + 1}
            </Link>
          )}
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm text-muted">הכנסות (לפני מע״מ)</p>
          <p className="num mt-1 text-right text-2xl font-bold">{formatILS(totals.revenue)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted">הוצאות מוכרות</p>
          <p className="num mt-1 text-right text-2xl font-bold">{formatILS(totals.recognizedExpenses)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted">רווח לפני מס</p>
          <p className={`num mt-1 text-right text-2xl font-bold ${totals.profit >= 0 ? "text-brand" : "text-danger"}`}>
            {formatILS(totals.profit)}
          </p>
        </div>
      </section>

      <section className="card overflow-x-auto p-0">
        <h2 className="p-4 pb-0 font-bold">פילוח חודשי</h2>
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
        <p className="flex gap-4 p-4 pt-2 text-xs text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-4 rounded bg-brand" /> הכנסות
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-4 rounded bg-muted/50" /> הוצאות מוכרות
          </span>
        </p>
      </section>

      <section className="card overflow-x-auto p-0">
        <h2 className="p-4 pb-0 font-bold">הוצאות לפי קטגוריה</h2>
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
        <h2 className="font-bold">ייצוא לרואה החשבון</h2>
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
