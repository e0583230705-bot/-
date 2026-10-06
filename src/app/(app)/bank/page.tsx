import Link from "next/link";
import { getContext } from "@/lib/auth/dal";
import { bankSummary, listBankTransactions, type BankFilter } from "@/lib/services/bank";
import { formatDate, formatILS } from "@/lib/format";
import { BankUploadForm } from "@/components/bank-upload-form";
import { ignoreTransactionAction, matchTransactionAction } from "../../actions";

const STATUS: Record<string, { label: string; className: string }> = {
  matched: { label: "הותאם", className: "bg-brand-soft text-brand" },
  ignored: { label: "לא רלוונטי", className: "bg-bg text-muted" },
  unmatched: { label: "ממתין", className: "bg-warn-soft text-warn" },
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
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">תנועות בנק</h1>

      {write && (
        <div className="card space-y-2">
          <h2 className="font-bold">ייבוא מקובץ</h2>
          <p className="text-sm text-muted">
            ייצאו מאתר הבנק את תנועות החשבון כקובץ CSV והעלו אותו כאן. אפשר להעלות קבצים חופפים, ותנועות
            שכבר יובאו לא ייכנסו פעמיים.
          </p>
          <BankUploadForm />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/bank" className={filter === "unmatched" ? "btn" : "btn-ghost"}>
          ממתינות לטיפול ({summary.unmatched})
        </Link>
        <Link href="/bank?filter=all" className={filter === "all" ? "btn" : "btn-ghost"}>
          הכול ({summary.unmatched + summary.matched + summary.ignored})
        </Link>
      </div>

      <div className="card overflow-x-auto p-0">
        {transactions.length === 0 ? (
          <p className="p-6 text-center text-muted">
            {filter === "unmatched" && summary.matched + summary.ignored > 0
              ? "כל התנועות טופלו 🎉"
              : "עדיין לא יובאו תנועות."}
          </p>
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
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS[t.status].className}`}>
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
          <button className="rounded-lg bg-brand-soft px-2 py-1 text-xs font-semibold text-brand">
            התאמה ל{tx.suggestion.label}
          </button>
        </form>
      )}
      {!tx.suggestion && tx.amount < 0 && (
        <Link href={`/expenses?fromTx=${tx.id}`} className="rounded-lg border border-border px-2 py-1 text-xs">
          רישום כהוצאה
        </Link>
      )}
      {!tx.suggestion && tx.amount > 0 && (
        <Link href="/income/new" className="rounded-lg border border-border px-2 py-1 text-xs">
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
