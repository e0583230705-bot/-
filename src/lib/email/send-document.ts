import "server-only";
import { formatILS } from "@/lib/domain/money";
import { documentHtml, loadDocumentForPrint, markForDownload } from "@/lib/pdf/document-pdf";
import { documentTitle } from "@/lib/pdf/document-html";
import { htmlToPdf } from "@/lib/pdf/render";
import { ValidationError } from "@/lib/services/organizations";
import { sendEmail } from "./send";
import { documentEmail } from "./templates";

/** שליחת מסמך ללקוח: PDF מצורף, מסומן "מקור" אם זו ההפקה הראשונה */
export async function sendDocumentToCustomer(documentId: string, to: string, message?: string) {
  const loaded = await loadDocumentForPrint(documentId);
  if (!loaded) throw new ValidationError("המסמך לא נמצא");
  if (!loaded.ctx.can("write_books")) throw new ValidationError("אין לך הרשאה לשלוח מסמכים");

  const { doc, ctx } = loaded;
  const title = documentTitle(doc.type, doc.number);
  const mark = await markForDownload(loaded);
  const pdf = await htmlToPdf(await documentHtml(loaded, mark));
  const email = documentEmail({
    businessName: ctx.org.name,
    documentTitle: title,
    customerName: doc.customerName,
    total: formatILS(doc.gross),
    message,
  });
  const result = await sendEmail({
    to,
    ...email,
    attachments: [{ filename: `${title}.pdf`, content: pdf }],
    organizationId: ctx.org.id,
    documentId: doc.id,
  });
  return { ...result, mark };
}
