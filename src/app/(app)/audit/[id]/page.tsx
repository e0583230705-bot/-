import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth/dal";
import { loadEngagementLedger } from "@/lib/services/audit";
import { trialBalance, unbalancedEntries } from "@/lib/domain/ledger/trial-balance";
import { FLAG_LABELS, testJournalEntries, type JournalFlag } from "@/lib/domain/ledger/journal-tests";
import { benford, BENFORD_MIN_SAMPLE, CONFORMITY_LABELS } from "@/lib/domain/ledger/benford";
import { computeMateriality, MATERIALITY_BASES, type MaterialityBasis } from "@/lib/domain/ledger/materiality";
import { monetaryUnitSample } from "@/lib/domain/ledger/sampling";
import { formatDate, formatILS } from "@/lib/format";
import { LedgerImportForm, MaterialityForm } from "@/components/audit-forms";
import { importLedgerAction, redrawSampleAction, setMaterialityAction } from "../../../actions";

const TABS = [
  { key: "tb", label: "מאזן בוחן" },
  { key: "je", label: "פקודות חריגות" },
  { key: "benford", label: "חוק בנפורד" },
  { key: "sample", label: "מדגם" },
] as const;

export default async function EngagementPage({ params, searchParams }: PageProps<"/audit/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { org, can } = await getContext();
  const data = /^[0-9a-f-]{36}$/i.test(id) ? await loadEngagementLedger(org.id, id) : null;
  if (!data) notFound();
  const { engagement: e, accounts, lines } = data;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "tb";
  const write = can("write_books");

  const materiality =
    e.materialityBase && e.materialityPct ? computeMateriality(e.materialityBase, e.materialityPct) : null;

  return (
    <div className="space-y-4">
      <Link href="/audit" className="text-sm text-brand">
        → כל התיקים
      </Link>
      <div>
        <h1 className="text-2xl font-bold">
          {e.clientName} · <span className="num">{e.fiscalYear}</span>
        </h1>
        <p className="text-sm text-muted">
          {e.clientTaxId && (
            <>
              ח.פ. <span className="num">{e.clientTaxId}</span> ·{" "}
            </>
          )}
          {e.sourceFilename ? (
            <>
              נקלט מ־<span className="num">{e.sourceFilename}</span> · {lines.length.toLocaleString("he-IL")} שורות
            </>
          ) : (
            "עדיין לא נקלטו נתונים"
          )}
        </p>
      </div>

      <SourcePanel engagement={e} />

      <div className="grid gap-4 lg:grid-cols-2">
        {write && (
          <div className="card space-y-2">
            <h2 className="font-bold">קליטת ספרי הלקוח</h2>
            <p className="text-xs text-muted">
              מומלץ: <strong>קובץ במבנה אחיד</strong> — בחרו יחד את BKMVDATA.TXT ו־INI.TXT מספריית OPENFRMT שהופקה
              בתוכנה של הלקוח. אפשר גם כרטסת הנהלת חשבונות בקובץ CSV. קליטה חוזרת מחליפה את הנתונים.
            </p>
            <LedgerImportForm action={importLedgerAction.bind(null, e.id)} />
          </div>
        )}
        <div className="card space-y-2">
          <h2 className="font-bold">מהותיות</h2>
          {write && (
            <MaterialityForm
              action={setMaterialityAction.bind(null, e.id)}
              initial={{ basis: e.materialityBasis, base: e.materialityBase, pct: e.materialityPct }}
            />
          )}
          {materiality ? (
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-muted">כוללת</dt>
                <dd className="num font-bold">{formatILS(materiality.overall)}</dd>
              </div>
              <div>
                <dt className="text-muted">לביצוע</dt>
                <dd className="num font-bold">{formatILS(materiality.performance)}</dd>
              </div>
              <div>
                <dt className="text-muted">זניחה</dt>
                <dd className="num font-bold">{formatILS(materiality.trivial)}</dd>
              </div>
              <dd className="col-span-3 text-xs text-muted">
                לפי {MATERIALITY_BASES[e.materialityBasis as MaterialityBasis]?.label} · {e.materialityPct}%
              </dd>
            </dl>
          ) : (
            <p className="text-xs text-muted">הגדירו מהותיות כדי לסמן פקודות מהותיות ולחשב מדגם.</p>
          )}
        </div>
      </div>

      {lines.length > 0 && (
        <>
          <nav className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <Link key={t.key} href={`/audit/${e.id}?tab=${t.key}`} className={t.key === tab ? "btn" : "btn-ghost"}>
                {t.label}
              </Link>
            ))}
          </nav>
          {tab === "tb" && <TrialBalanceTab accounts={accounts} lines={lines} />}
          {tab === "je" && (
            <JournalTab lines={lines} yearEnd={e.yearEnd} performance={materiality?.performance ?? Number.MAX_SAFE_INTEGER} />
          )}
          {tab === "benford" && <BenfordTab lines={lines} />}
          {tab === "sample" && (
            <SampleTab
              lines={lines}
              seed={e.sampleSeed}
              size={Math.min(200, Math.max(1, Number(sp.n) || 25))}
              engagementId={e.id}
              canRedraw={write}
            />
          )}
        </>
      )}
    </div>
  );
}

type Data = NonNullable<Awaited<ReturnType<typeof loadEngagementLedger>>>;

function TrialBalanceTab({ accounts, lines }: Pick<Data, "accounts" | "lines">) {
  const tb = trialBalance(accounts, lines);
  const unbalanced = unbalancedEntries(lines);
  return (
    <div className="space-y-3">
      {tb.balanced && unbalanced.length === 0 ? (
        <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">המאזן מאוזן: סך החובה שווה לסך הזכות בכל הפקודות.</p>
      ) : (
        <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          <p className="font-bold">המאזן אינו מאוזן — {unbalanced.length} פקודות שהחובה והזכות בהן לא שווים</p>
          <ul className="mt-1 list-inside list-disc">
            {unbalanced.slice(0, 20).map((u) => (
              <li key={u.entryId}>
                פקודה <span className="num">{u.entryId}</span> · הפרש <span className="num">{formatILS(u.difference)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>חשבון</th>
              <th>שם</th>
              <th className="text-end">חובה</th>
              <th className="text-end">זכות</th>
              <th className="text-end">יתרה</th>
            </tr>
          </thead>
          <tbody>
            {tb.rows.map((r) => (
              <tr key={r.code}>
                <td className="num">{r.code}</td>
                <td>{r.name}</td>
                <td className="num text-end">{formatILS(r.debits)}</td>
                <td className="num text-end">{formatILS(r.credits)}</td>
                <td className="num text-end font-medium">
                  {formatILS(Math.abs(r.closing))} {r.closing > 0 ? "ח" : r.closing < 0 ? "ז" : ""}
                </td>
              </tr>
            ))}
            <tr className="font-bold">
              <td colSpan={2}>סה״כ</td>
              <td className="num text-end">{formatILS(tb.totals.debits)}</td>
              <td className="num text-end">{formatILS(tb.totals.credits)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function JournalTab({ lines, yearEnd, performance }: { lines: Data["lines"]; yearEnd: string; performance: number }) {
  const flagged = testJournalEntries(lines, { yearEnd, performanceMateriality: performance });
  const counts = new Map<JournalFlag, number>();
  for (const f of flagged) for (const flag of f.flags) counts.set(flag, (counts.get(flag) ?? 0) + 1);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        {[...counts.entries()].map(([flag, n]) => (
          <span key={flag} className="rounded-lg bg-warn-soft px-2 py-1 text-warn">
            {FLAG_LABELS[flag]}: <span className="num">{n}</span>
          </span>
        ))}
        {flagged.length === 0 && <span className="text-muted">לא נמצאו פקודות חריגות.</span>}
      </div>
      {performance === Number.MAX_SAFE_INTEGER && (
        <p className="text-xs text-muted">בדיקת &quot;סכום גבוה מהמהותיות&quot; תופעל אחרי הגדרת מהותיות.</p>
      )}
      {flagged.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>פקודה</th>
                <th>תאריך</th>
                <th>תיאור</th>
                <th className="text-end">סכום</th>
                <th>סיבות לבדיקה</th>
              </tr>
            </thead>
            <tbody>
              {flagged.slice(0, 300).map((f) => (
                <tr key={f.entryId}>
                  <td className="num">{f.entryId}</td>
                  <td className="num whitespace-nowrap">{formatDate(f.date)}</td>
                  <td>{f.description || <span className="text-muted">—</span>}</td>
                  <td className="num text-end">{formatILS(f.total)}</td>
                  <td className="text-xs">{f.flags.map((x) => FLAG_LABELS[x]).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {flagged.length > 300 && <p className="p-3 text-xs text-muted">מוצגות 300 הפקודות בעלות הסיכון הגבוה ביותר מתוך {flagged.length}.</p>}
        </div>
      )}
    </div>
  );
}

function BenfordTab({ lines }: { lines: Data["lines"] }) {
  const r = benford(lines.filter((l) => l.amount > 0).map((l) => l.amount));
  const max = Math.max(...r.observed, ...r.expected);
  return (
    <div className="card space-y-3">
      <p className="text-sm">
        נבדקו <span className="num">{r.n.toLocaleString("he-IL")}</span> סכומי חובה מעל 10 ₪ · סטייה ממוצעת (MAD){" "}
        <span className="num">{r.mad.toFixed(4)}</span> ·{" "}
        <strong className={r.conformity === "nonconformity" ? "text-danger" : r.conformity === "marginal" ? "text-warn" : "text-brand"}>
          {CONFORMITY_LABELS[r.conformity]}
        </strong>
      </p>
      {!r.reliable && (
        <p className="text-xs text-warn">פחות מ־{BENFORD_MIN_SAMPLE} סכומים — לתוצאה אין משמעות סטטיסטית.</p>
      )}
      <table className="table">
        <thead>
          <tr>
            <th>ספרה ראשונה</th>
            <th className="text-end">צפוי</th>
            <th className="text-end">בפועל</th>
            <th className="w-1/2" aria-label="השוואה" />
          </tr>
        </thead>
        <tbody>
          {r.expected.map((exp, i) => (
            <tr key={i}>
              <td className="num">{i + 1}</td>
              <td className="num text-end">{(exp * 100).toFixed(1)}%</td>
              <td className="num text-end">{(r.observed[i] * 100).toFixed(1)}%</td>
              <td>
                <div className="space-y-0.5">
                  <div className="h-1.5 rounded bg-muted/50" style={{ width: `${(exp / max) * 100}%` }} />
                  <div className="h-1.5 rounded bg-brand" style={{ width: `${(r.observed[i] / max) * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-4 rounded bg-muted/50" /> צפוי לפי בנפורד
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-4 rounded bg-brand" /> בפועל
        </span>
      </p>
    </div>
  );
}

function SampleTab({
  lines,
  seed,
  size,
  engagementId,
  canRedraw,
}: {
  lines: Data["lines"];
  seed: number;
  size: number;
  engagementId: string;
  canRedraw: boolean;
}) {
  // האוכלוסייה: פקודות, לפי סך צד החובה של כל פקודה
  const entries = new Map<string, { id: string; amount: number; date: string; description: string }>();
  for (const l of lines) {
    const e = entries.get(l.entryId) ?? { id: l.entryId, amount: 0, date: l.date, description: l.description };
    if (l.amount > 0) e.amount += l.amount;
    if (!e.description && l.description) e.description = l.description;
    entries.set(l.entryId, e);
  }
  const population = [...entries.values()];
  const sample = monetaryUnitSample(population, size, seed);
  const byId = new Map(population.map((p) => [p.id, p]));
  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-center gap-3 text-sm">
        <form className="flex items-center gap-2">
          <input type="hidden" name="tab" value="sample" />
          <label htmlFor="n">גודל מדגם</label>
          <input id="n" name="n" type="number" min={1} max={200} defaultValue={size} className="input num w-24" />
          <button className="btn-ghost">עדכון</button>
        </form>
        <span className="text-muted">
          אוכלוסייה <span className="num">{population.length.toLocaleString("he-IL")}</span> פקודות · מרווח{" "}
          <span className="num">{formatILS(sample.interval)}</span> · seed <span className="num">{seed}</span>
        </span>
        {canRedraw && (
          <form action={redrawSampleAction.bind(null, engagementId)}>
            <button className="text-xs text-muted hover:text-text">דגימה מחדש</button>
          </form>
        )}
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>פקודה</th>
              <th>תאריך</th>
              <th>תיאור</th>
              <th className="text-end">סכום</th>
              <th>סוג בחירה</th>
            </tr>
          </thead>
          <tbody>
            {sample.selected.map((s) => {
              const e = byId.get(s.id)!;
              return (
                <tr key={s.id}>
                  <td className="num">{s.id}</td>
                  <td className="num">{formatDate(e.date)}</td>
                  <td>{e.description || <span className="text-muted">—</span>}</td>
                  <td className="num text-end">{formatILS(s.amount)}</td>
                  <td className="text-xs">{s.reason === "key" ? "פריט מפתח (גדול מהמרווח)" : "נדגם"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        המדגם נקבע לפי ה־seed ולכן ניתן לשחזור מלא בתיק הביקורת. כל דגימה מחדש נרשמת ביומן הפעולות.
      </p>
    </div>
  );
}

interface SourceMeta {
  businessTaxId: string;
  businessName: string | null;
  softwareName: string | null;
  softwareRegistration: string | null;
  rangeFrom: string | null;
  rangeTo: string | null;
}

function SourcePanel({ engagement: e }: { engagement: Data["engagement"] }) {
  if (!e.importedAt) return null;
  const meta = e.sourceMeta as SourceMeta | null;
  const issues = (e.importIssues as { severity: "error" | "warning"; message: string }[] | null) ?? [];
  return (
    <div className="card space-y-2 text-sm">
      <h2 className="font-bold">מקור הנתונים</h2>
      {e.sourceType === "uniform" && meta ? (
        <p className="text-muted">
          קובץ במבנה אחיד
          {meta.softwareName && <> · תוכנה: {meta.softwareName}</>}
          {meta.softwareRegistration && (
            <>
              {" "}
              (רישום <span className="num">{meta.softwareRegistration}</span>)
            </>
          )}
          {meta.businessName && <> · {meta.businessName}</>} · עוסק <span className="num">{meta.businessTaxId}</span>
          {meta.rangeFrom && meta.rangeTo && (
            <>
              {" "}
              · תקופה <span className="num">{formatDate(meta.rangeFrom)}</span>–<span className="num">{formatDate(meta.rangeTo)}</span>
            </>
          )}
        </p>
      ) : (
        <p className="text-muted">כרטסת הנהלת חשבונות (CSV)</p>
      )}
      {issues.length === 0 ? (
        <p className="text-brand">{e.sourceType === "uniform" ? "בדיקות שלמות הקובץ עברו ללא ממצאים." : "הקובץ נקלט."}</p>
      ) : (
        <ul className="space-y-1">
          {issues.map((i) => (
            <li key={i.message} className={i.severity === "error" ? "text-danger" : "text-warn"}>
              {i.severity === "error" ? "✕" : "⚠"} {i.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
