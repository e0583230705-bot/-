import Link from "next/link";
import { notFound } from "next/navigation";
import { documentHtml, loadDocumentForPrint } from "@/lib/pdf/document-pdf";
import { documentTitle } from "@/lib/pdf/document-html";
import { formatDate, todayISO } from "@/lib/format";
import { paymentStatus, PAYMENT_FOR } from "@/lib/domain/receivables";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/documents";
import { PaymentBadge } from "@/components/payment-badge";
import { BUSINESS_TYPES, type BusinessType } from "@/lib/domain/business-types";
import { MarkPaidForm } from "@/components/mark-paid-form";
import { listDocumentEmails } from "@/lib/services/documents";
import { getCustomer } from "@/lib/services/customers";
import { emailConfigured } from "@/lib/email/send";
import { SendDocumentForm } from "@/components/send-document-form";
import { markPaidAction, markUnpaidAction, sendDocumentAction } from "../../../actions";
import { PageHeader } from "@/components/page-header";

const PAID_VIA: Record<string, string> = { bank: "לפי תנועת בנק", receipt: "לפי קבלה", manual: "סימון ידני" };

function profileAllows(businessType: string, type: DocumentType) {
  return (BUSINESS_TYPES[businessType as BusinessType]?.allowedDocuments ?? []).includes(type);
}

const EMAIL_STATUS: Record<string, string> = { sent: "נשלח", simulated: "לא נשלח (אין שירות מיילים)", failed: "נכשל" };

export default async function DocumentPage({ params }: PageProps<"/income/[id]">) {
  const { id } = await params;
  const loaded = await loadDocumentForPrint(id);
  if (!loaded) notFound();
  const { doc, ctx } = loaded;
  const html = await documentHtml(loaded, "preview");
  const originalDelivered = Boolean(doc.originalDeliveredAt);
  const willBeOriginal = !originalDelivered && ctx.can("write_books");
  const today = todayISO();
  const status = paymentStatus(doc, today);
  const paymentDocType = Object.entries(PAYMENT_FOR).find(([, payable]) => payable === doc.type)?.[0] as
    | DocumentType
    | undefined;
  const canIssuePayment =
    paymentDocType && ctx.can("write_books") && profileAllows(ctx.org.businessType, paymentDocType);
  const [emails, customer] = await Promise.all([
    listDocumentEmails(ctx.org.id, doc.id),
    doc.customerId ? getCustomer(ctx.org.id, doc.customerId) : null,
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/income", label: "הכנסות ומסמכים" }}
        title={documentTitle(doc.type, doc.number)}
        description={
          <>
            {doc.customerName} · <span className="num">{formatDate(doc.issueDate)}</span>
          </>
        }
        actions={
          <a href={`/income/${doc.id}/pdf`} className="btn" download>
            {willBeOriginal ? "הורדת המקור (PDF)" : "הורדת העתק (PDF)"}
          </a>
        }
      />

      {status && (
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="card-title">תשלום</h2>
            <PaymentBadge status={status} />
            {status.kind === "paid" && (
              <span className="text-sm text-muted">
                <span className="num">{formatDate(status.on)}</span> · {PAID_VIA[doc.paidVia ?? ""] ?? ""}
              </span>
            )}
          </div>
          {status.kind !== "paid" && ctx.can("write_books") && (
            <div className="flex flex-wrap items-start gap-4">
              {canIssuePayment && (
                <Link href={`/income/new?for=${doc.id}`} className="btn">
                  הפקת {DOCUMENT_TYPES[paymentDocType!].label}
                </Link>
              )}
              <MarkPaidForm action={markPaidAction.bind(null, doc.id)} today={today} />
            </div>
          )}
          {status.kind === "paid" && doc.paidVia === "manual" && ctx.can("write_books") && (
            <form action={markUnpaidAction.bind(null, doc.id)}>
              <button className="text-xs text-muted hover:text-danger">ביטול סימון התשלום</button>
            </form>
          )}
        </div>
      )}

      {doc.allocationRequired && !doc.allocationNumber && (
        <p className="notice notice-warn">
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
          <h2 className="card-title">שליחה ללקוח</h2>
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
        className="h-[1000px] w-full rounded-2xl border border-border bg-white shadow-card"
      />
    </div>
  );
}
