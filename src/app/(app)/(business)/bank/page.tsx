import Link from "next/link";
import { getContext } from "@/lib/auth/dal";
import { bankSummary, listBankTransactions, type BankFilter } from "@/lib/services/bank";
import { formatDate, formatILS } from "@/lib/format";
import { BankUploadForm } from "@/components/bank-upload-form";
import { ignoreTransactionAction, matchTransactionAction } from "@/app/actions";
import { Collapsible, EmptyState, PageHeader } from "@/components/page-header";

const STATUS: Record<string, { label: string; className: string }> = {
  matched: { label: "הותאם", className: "badge-good" },
  ignored: { label: "לא רלוונטי", className: "badge-muted" },
  unmatched: { label: "ממתין", className: "badge-warn" },
};

export default async function BankPage({ searchParams }: PageProps<"/bank">) {
  const { org, can } = await getContext();
  const filter: BankFilter = (await searchParams).filter === "all" ? "all" : "unmatched";
  const [transactions, summary] = await Promise.all([
    listBankTransactions(org.id, filter),
    bankSummary(org.id),
  ]);
  const write = can("write_books");

  return (
    <div className="space-y-5">
      <PageHeader
        title="תנועות בנק"
      />

      {write && (
        <Collapsible
          title="ייבוא תנועות מקובץ"
          description="קובץ CSV מאתר הבנק. קבצים חופפים בסדר, תנועה לא תיכנס פעמיים."
          open={summary.unmatched + summary.matched + summary.ignored === 0}
        >
          <BankUploadForm />
        </Collapsible>
      )}

      <div className="pills w-fit text-sm">
        <Link href="/bank" className={`pill ${filter === "unmatched" ? "pill-active" : ""}`}>
          ממתינות לטיפול ({summary.unmatched})
        </Link>
        <Link href="/bank?filter=all" className={`pill ${filter === "all" ? "pill-active" : ""}`}>
          הכול ({summary.unmatched + summary.matched + summary.ignored})
        </Link>
      </div>

      <div className="table-wrap">
        {transactions.length === 0 ? (
          filter === "unmatched" && summary.matched + summary.ignored > 0 ? (
            <EmptyState title="כל התנועות טופלו" description="אין תנועות שממתינות להתאמה." />
          ) : (
            <EmptyState title="עדיין לא יובאו תנועות" description="מורידים מאתר הבנק קובץ CSV של תנועות החשבון ומעלים אותו כאן למעלה." />
          )
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>תאריך</th>
                <th>תיאור</th>
                <th className="text-end">סכום</th>
                <th>סטטוס</th>
                {write && <th>פעולה</th>}
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td className="num whitespace-nowrap">{formatDate(t.date)}</td>
                  <td>
                    {t.description}
                    {t.reference && <span className="num block text-xs text-muted">אסמכתא {t.reference}</span>}
                  </td>
                  <td className={`num whitespace-nowrap text-end font-medium ${t.amount > 0 ? "text-brand" : ""}`}>
                    {formatILS(t.amount)}
                  </td>
                  <td>
                    <span className={`badge ${STATUS[t.status].className}`}>
                      {STATUS[t.status].label}
                    </span>
                  </td>
                  {write && (
                    <td className="min-w-56">
                      <TransactionActions tx={t} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function TransactionActions({ tx }: { tx: Awaited<ReturnType<typeof listBankTransactions>>[number] }) {
  if (tx.status !== "unmatched") {
    return (
      <form action={ignoreTransactionAction}>
        <input type="hidden" name="txId" value={tx.id} />
        <input type="hidden" name="ignored" value="0" />
        <button className="text-xs text-muted hover:text-text">ביטול</button>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {tx.suggestion && (
        <form action={matchTransactionAction} className="flex items-center gap-2">
          <input type="hidden" name="txId" value={tx.id} />
          <input type="hidden" name="kind" value={tx.suggestion.kind} />
          <input type="hidden" name="targetId" value={tx.suggestion.id} />
          <button className="btn-soft btn-sm">
            התאמה ל{tx.suggestion.label}
          </button>
        </form>
      )}
      {!tx.suggestion && tx.amount < 0 && (
        <Link href={`/expenses?fromTx=${tx.id}`} className="btn-ghost btn-sm">
          רישום כהוצאה
        </Link>
      )}
      {!tx.suggestion && tx.amount > 0 && (
        <Link href="/income/new" className="btn-ghost btn-sm">
          הפקת מסמך
        </Link>
      )}
      <form action={ignoreTransactionAction}>
        <input type="hidden" name="txId" value={tx.id} />
        <input type="hidden" name="ignored" value="1" />
        <button className="text-xs text-muted hover:text-text" title="למשל העברה בין חשבונות או תשלום מס">
          לא רלוונטי
        </button>
      </form>
    </div>
  );
}
