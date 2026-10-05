import { loadDocumentForPrint, documentHtml, markForDownload } from "@/lib/pdf/document-pdf";
import { htmlToPdf } from "@/lib/pdf/render";

export async function GET(_req: Request, { params }: RouteContext<"/income/[id]/pdf">) {
  const { id } = await params;
  const loaded = await loadDocumentForPrint(id);
  if (!loaded) return new Response("המסמך לא נמצא", { status: 404 });

  const mark = await markForDownload(loaded);
  const pdf = await htmlToPdf(await documentHtml(loaded, mark));
  const filename = `${loaded.doc.type}-${loaded.doc.number}${mark === "copy" ? "-copy" : ""}.pdf`;

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
