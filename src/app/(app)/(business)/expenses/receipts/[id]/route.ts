import { getContext } from "@/lib/auth/dal";
import { getReceiptFile } from "@/lib/services/receipts";

export async function GET(_req: Request, { params }: RouteContext<"/expenses/receipts/[id]">) {
  const { id } = await params;
  const { org, can } = await getContext();
  const receipt = can("read") && /^[0-9a-f-]{36}$/i.test(id) ? await getReceiptFile(org.id, id) : null;
  if (!receipt) return new Response("הקבלה לא נמצאה", { status: 404 });
  return new Response(new Uint8Array(receipt.data), {
    headers: {
      // סוג הקובץ נקבע מהתוכן בעת ההעלאה, לא ממה שהמשתמש הצהיר
      "Content-Type": receipt.contentType,
      "Content-Disposition": `inline; filename="receipt-${receipt.id}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
