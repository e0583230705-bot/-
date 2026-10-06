import Link from "next/link";
import { notFound } from "next/navigation";
import { documentHtml, loadDocumentForPrint } from "@/lib/pdf/document-pdf";
import { documentTitle } from "@/lib/pdf/document-html";
import { formatDate } from "@/lib/format";
import { listDocumentEmails } from "@/lib/services/documents";
import { getCustomer } from "@/lib/services/customers";
import { emailConfigured } from "@/lib/email/send";
import { SendDocumentForm } from "@/components/send-document-form";
import { sendDocumentAction } from "../../../actions";

const EMAIL_STATUS: Record<string, string> = { sent: "נשלח", simulated: "לא נשלח (אין שירות מיילים)", failed: "נכשל" };

export default async function DocumentPage({ params }: PageProps<"/income/[id]">) {
  const { id } = await params;
  const loaded = await loadDocumentForPrint(id);
  if (!loaded) notFound();
  const { doc, ctx } = loaded;
  const html = await documentHtml(loaded, "preview");
  const originalDelivered = Boolean(doc.originalDeliveredAt);
  const willBeOriginal = !originalDelivered && ctx.can("write_books");
  const [emails, customer] = await Promise.all([
    listDocumentEmails(ctx.org.id, doc.id),
    doc.customerId ? getCustomer(ctx.org.id, doc.customerId) : null,
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/income" className="text-sm text-brand">
            → חזרה למסמכים
          </Link>
          <h1 className="text-2xl font-bold">{documentTitle(doc.type, doc.number)}</h1>
          <p className="text-sm text-muted">
            {doc.customerName} · <span className="num">{formatDate(doc.issueDate)}</span>
          </p>
        </div>
        <a href={`/income/${doc.id}/pdf`} className="btn" download>
          {willBeOriginal ? "הורדת המקור (PDF)" : "הורדת העתק (PDF)"}
        </a>
      </div>

      {doc.allocationRequired && !doc.allocationNumber && (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          חשבונית זו דורשת מספר הקצאה מרשות המסים. בלי מספר הקצאה הלקוח לא יוכל לקזז את המע״מ. החיבור
          לרשות המסים יתווסף בשלב הבא.
        </p>
      )}
      <p className="text-xs text-muted">
        {willBeOriginal
          ? "ההורדה הראשונה מסומנת \"מקור\" ומיועדת ללקוח. כל הורדה נוספת תסומן \"העתק נאמן למקור\"."
          : originalDelivered
            ? "המקור כבר הופק. הורדות נוספות מסומנות \"העתק נאמן למקור\"."
            : "צפייה בלבד: ההורדה תסומן כהעתק."}
      </p>

      {ctx.can("write_books") && (
        <div className="card space-y-3">
          <h2 className="font-bold">שליחה ללקוח</h2>
          <SendDocumentForm
            action={sendDocumentAction.bind(null, doc.id)}
            defaultEmail={customer?.email ?? undefined}
            configured={emailConfigured()}
          />
          {emails.length > 0 && (
            <ul className="space-y-1 border-t border-border pt-3 text-xs text-muted">
              {emails.map((m) => (
                <li key={m.id}>
                  <span className="num">{m.createdAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}</span>{" "}
                  · <span className="num">{m.to}</span> · {EMAIL_STATUS[m.status] ?? m.status}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <iframe
        title="תצוגת המסמך"
        srcDoc={html}
        sandbox=""
        className="h-[1000px] w-full rounded-xl border border-border bg-white"
      />
    </div>
  );
}
