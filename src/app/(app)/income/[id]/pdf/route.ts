import { loadDocumentForPrint, documentHtml, markForDownload } from "@/lib/pdf/document-pdf";
import { assertPdfAvailable, htmlToPdf, PdfUnavailableError } from "@/lib/pdf/render";

export async function GET(_req: Request, { params }: RouteContext<"/income/[id]/pdf">) {
  const { id } = await params;
  const loaded = await loadDocumentForPrint(id);
  if (!loaded) return new Response("המסמך לא נמצא", { status: 404 });

  let pdf: Uint8Array;
  let mark: "original" | "copy";
  try {
    // קודם מוודאים שאפשר להפיק, ורק אז "שורפים" את סימון המקור
    await assertPdfAvailable();
    mark = await markForDownload(loaded);
    pdf = await htmlToPdf(await documentHtml(loaded, mark));
  } catch (e) {
    if (e instanceof PdfUnavailableError) {
      return new Response("הפקת PDF אינה זמינה בשרת התצוגה הזה. אפשר לצפות במסמך במסך.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    throw e;
  }
  const filename = `${loaded.doc.type}-${loaded.doc.number}${mark === "copy" ? "-copy" : ""}.pdf`;

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
