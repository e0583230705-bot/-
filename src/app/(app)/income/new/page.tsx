import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth/dal";
import { profileOf } from "@/lib/services/organizations";
import { vatRateOn } from "@/lib/domain/vat";
import { todayISO } from "@/lib/format";
import { DocumentForm } from "@/components/document-form";
import { listCustomers } from "@/lib/services/customers";
import { getDocument } from "@/lib/services/documents";
import { PAYMENT_FOR } from "@/lib/domain/receivables";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/documents";
import { documentTitle } from "@/lib/pdf/document-html";
import { PageHeader } from "@/components/page-header";

export default async function NewDocumentPage({ searchParams }: PageProps<"/income/new">) {
  const { org, can } = await getContext();
  if (!can("write_books")) redirect("/income");
  const profile = profileOf(org);
  const today = todayISO();
  const customers = (await listCustomers(org.id)).map(({ customer: c }) => ({
    id: c.id,
    name: c.name,
    taxId: c.taxId,
    isVatRegistered: c.isVatRegistered,
  }));
  const { customer, for: forId } = await searchParams;
  const related =
    typeof forId === "string" && /^[0-9a-f-]{36}$/i.test(forId) ? await getDocument(org.id, forId) : null;
  const paymentType = related
    ? (Object.entries(PAYMENT_FOR).find(([, payable]) => payable === related.doc.type)?.[0] as DocumentType | undefined)
    : undefined;
  const paymentFor =
    related && paymentType && !related.doc.paidAt && profile.allowedDocuments.includes(paymentType)
      ? {
          documentId: related.doc.id,
          title: documentTitle(related.doc.type, related.doc.number),
          type: paymentType,
          customer: {
            id: related.doc.customerId,
            name: related.doc.customerName,
            taxId: related.doc.customerTaxId,
            isVatRegistered: customers.find((c) => c.id === related.doc.customerId)?.isVatRegistered ?? false,
          },
          // קבלה: שורה אחת בסכום הכולל. חשבונית מס קבלה: אותן שורות כמו בחשבון העסקה
          lines: DOCUMENT_TYPES[paymentType].isTaxInvoice
            ? related.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice }))
            : [
                {
                  description: `תשלום עבור ${documentTitle(related.doc.type, related.doc.number)}`,
                  quantity: 1,
                  unitPrice: related.doc.gross,
                },
              ],
        }
      : undefined;
  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/income", label: "הכנסות ומסמכים" }}
        title={paymentFor ? "הפקת מסמך תשלום" : "הפקת מסמך"}
        description={paymentFor ? undefined : "המע״מ והסכומים מחושבים תוך כדי מילוי. אחרי ההפקה המסמך נעול, ולתיקון מפיקים זיכוי."}
      />
      <div className="card max-w-3xl">
        <DocumentForm
          allowedTypes={profile.allowedDocuments}
          vatRate={profile.chargesVat ? vatRateOn(today) : 0}
          today={today}
          customers={customers}
          initialCustomerId={typeof customer === "string" ? customer : undefined}
          paymentFor={paymentFor}
        />
      </div>
    </div>
  );
}
