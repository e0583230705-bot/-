import Link from "next/link";
import { getContext } from "@/lib/auth/dal";
import { loadLedger } from "@/lib/services/reports";
import { computeProfitAndLoss, computeVatReport } from "@/lib/domain/reports";
import { buildTaxCalendar, upcomingDeadlines } from "@/lib/domain/tax-calendar";
import { osekPaturCeiling, type VatFrequency } from "@/lib/domain/business-types";
import { formatDate, formatILS, todayISO } from "@/lib/format";
import { periodContaining } from "@/lib/periods";
import { Stat } from "@/components/stat";
import { Icons } from "@/components/icons";
import { listDocuments } from "@/lib/services/documents";
import { summarizeReceivables } from "@/lib/domain/receivables";
import { bankSummary } from "@/lib/services/bank";

const DAY = 24 * 60 * 60 * 1000;
function daysUntil(date: string, today: string) {
  return Math.round((Date.parse(date) - Date.parse(today)) / DAY);
}
function dueLabel(days: number) {
  if (days < 0) return { text: "עבר", tone: "badge-bad" };
  if (days === 0) return { text: "היום", tone: "badge-bad" };
  if (days === 1) return { text: "מחר", tone: "badge-warn" };
  if (days <= 7) return { text: `בעוד ${days} ימים`, tone: "badge-warn" };
  return { text: `בעוד ${days} ימים`, tone: "badge-muted" };
}
function greeting(hour: number) {
  if (hour < 5) return "לילה טוב";
  if (hour < 12) return "בוקר טוב";
  if (hour < 17) return "צהריים טובים";
  if (hour < 21) return "ערב טוב";
  return "לילה טוב";
}

export default async function DashboardPage() {
  const { org, user, can } = await getContext();
  const { profile, income, expenses } = await loadLedger(org.id);
  const today = todayISO();
  const year = Number(today.slice(0, 4));
  const ytd = computeProfitAndLoss({ from: `${year}-01-01`, to: `${year}-12-31` }, income, expenses);

  const vatFrequency = org.vatFrequency as VatFrequency;
  const vatPeriod = profile.chargesVat ? periodContaining(today, vatFrequency) : null;
  const vat = vatPeriod ? computeVatReport(vatPeriod, income, expenses) : null;

  const deadlines = upcomingDeadlines(
    [...buildTaxCalendar(year - 1, profile, vatFrequency), ...buildTaxCalendar(year, profile, vatFrequency)].sort(
      (a, b) => a.due.localeCompare(b.due),
    ),
    today,
  );

  const [docs, bank] = await Promise.all([listDocuments(org.id), bankSummary(org.id)]);
  const receivables = summarizeReceivables(docs, today);
  const isEmpty = docs.length === 0 && expenses.length === 0;
  const write = can("write_books");

  const ceiling = org.businessType === "osek_patur" ? osekPaturCeiling(year) : undefined;
  const ceilingPct = ceiling ? Math.min(100, Math.round((ytd.revenue / (ceiling * 100)) * 100)) : 0;
  const hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Jerusalem" }));
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[1.75rem]">
            {greeting(hour)}, {firstName}
          </h1>
          <p className="text-sm text-muted">
            {org.name} · שנת {year}, נכון ל־<span className="num">{formatDate(today)}</span>
          </p>
        </div>
        {write && (
          <div className="flex flex-wrap gap-2">
            <Link href="/income/new" className="btn">
              <Icons.plus size={16} />
              מסמך חדש
            </Link>
            <Link href="/expenses" className="btn-ghost">
              <Icons.receipt size={16} />
              רישום הוצאה
            </Link>
          </div>
        )}
      </header>

      {isEmpty && (
        <section className="card flex flex-col gap-4 border-teal/30 bg-teal-soft/40 sm:flex-row sm:items-center">
          <div className="bubble h-12 w-12 bg-teal text-white">
            <Icons.sparkles size={22} />
          </div>
          <div className="flex-1">
            <p className="font-bold">העסק מוכן. מתחילים?</p>
            <p className="text-sm text-muted">מפיקים מסמך ראשון או מייבאים את תנועות הבנק, והמספרים כאן מתמלאים מעצמם.</p>
          </div>
          {write && (
            <div className="flex flex-wrap gap-2">
              <Link href="/income/new" className="btn">
                להפיק מסמך ראשון
              </Link>
              <Link href="/bank" className="btn-ghost">
                לייבא תנועות בנק
              </Link>
            </div>
          )}
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="הכנסות השנה" value={formatILS(ytd.revenue)} hint="לפני מע״מ" tone="teal" icon="fileText" />
        <Stat label="הוצאות מוכרות" value={formatILS(ytd.recognizedExpenses)} tone="orange" icon="receipt" />
        <Stat label="רווח לפני מס" value={formatILS(ytd.profit)} tone={ytd.profit >= 0 ? "good" : "bad"} icon="chart" />
        {vat ? (
          <Stat
            label={vat.vatDue >= 0 ? "מע״מ לתשלום" : "החזר מע״מ צפוי"}
            value={formatILS(Math.abs(vat.vatDue))}
            hint={`תקופה ${vatPeriod!.label}`}
            tone="sky"
            icon="percent"
          />
        ) : (
          <Stat label="מע״מ" value="פטור" hint={`${profile.label} אינו מדווח מע״מ`} tone="sky" icon="percent" />
        )}
      </section>

      {(receivables.openCount > 0 || bank.unmatched > 0) && (
        <section className={`grid gap-3 ${receivables.openCount > 0 && bank.unmatched > 0 ? "md:grid-cols-2" : ""}`}>
          {receivables.openCount > 0 && (
            <Link href="/income?filter=open" className="card flex items-center justify-between gap-4 transition hover:border-brand/50">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warn-soft text-warn">
                  <Icons.clock size={20} />
                </span>
                <div>
                  <p className="font-bold">ממתין לתשלום מלקוחות</p>
                  <p className="text-sm text-muted">
                    {receivables.openCount} חשבוניות פתוחות
                    {receivables.overdueCount > 0 && (
                      <span className="text-danger"> · {receivables.overdueCount} באיחור של יותר מ־30 יום</span>
                    )}
                  </p>
                </div>
              </div>
              <p className="num text-xl font-bold">{formatILS(receivables.open)}</p>
            </Link>
          )}
          {bank.unmatched > 0 && (
            <Link href="/bank" className="card flex items-center justify-between gap-4 transition hover:border-brand/50">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <Icons.bank size={20} />
                </span>
                <div>
                  <p className="font-bold">תנועות בנק לטיפול</p>
                  <p className="text-sm text-muted">תנועות שעוד לא הותאמו למסמך או להוצאה</p>
                </div>
              </div>
              <p className="num text-xl font-bold">{bank.unmatched}</p>
            </Link>
          )}
        </section>
      )}

      {ceiling && (
        <section className="card">
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-semibold">תקרת מחזור עוסק פטור</span>
            <span className="num text-muted">
              {formatILS(ytd.revenue)} / {formatILS(ceiling * 100)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className={`h-full rounded-full ${ceilingPct >= 85 ? "bg-warn" : "bg-brand"}`} style={{ width: `${ceilingPct}%` }} />
          </div>
          {ceilingPct >= 85 && (
            <p className="mt-2 text-sm text-warn">
              מתקרבים לתקרה. מעבר לתקרה מחייב מעבר לעוסק מורשה, כדאי להתכונן מראש.
            </p>
          )}
        </section>
      )}

      <section className="card p-0">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="card-title">המועדים הקרובים</h2>
          <Link href="/calendar" className="link text-sm">
            ללוח המלא
          </Link>
        </div>
        <ul className="divide-y divide-border border-t border-border">
          {deadlines.map((d) => {
            const days = daysUntil(d.due, today);
            const l = dueLabel(days);
            return (
              <li key={`${d.kind}-${d.due}-${d.periodLabel}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.title}</p>
                  <p className="text-xs text-muted">
                    תקופה <span className="num">{d.periodLabel}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`badge ${l.tone}`}>{l.text}</span>
                  <span className="num w-20 text-end text-muted">{formatDate(d.due)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
