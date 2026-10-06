import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import {
  MAX_RECEIPT_BYTES,
  normalizeReceipt,
  sniffReceiptType,
  type RawReceipt,
  type ReceiptPrefill,
} from "@/lib/domain/receipt";
import { aiConfigured, extractReceipt, ReceiptExtractionError } from "@/lib/ai/receipt";
import { listCategories } from "./expenses";
import { ValidationError } from "./organizations";

/** מעלה קבלה, ואם מוגדר AI — מחלץ ממנה פרטים. הקובץ נשמר גם אם החילוץ נכשל. */
export async function uploadReceipt(
  organizationId: string,
  userId: string,
  file: { name: string; bytes: Uint8Array },
  /** לבדיקות: החלפת קריאת ה־AI. בלעדיה החילוץ פועל רק כשמוגדר מפתח */
  extract?: typeof extractReceipt,
) {
  if (file.bytes.byteLength === 0) throw new ValidationError("הקובץ ריק");
  if (file.bytes.byteLength > MAX_RECEIPT_BYTES) throw new ValidationError("הקובץ גדול מדי (עד 10MB)");
  const contentType = sniffReceiptType(file.bytes);
  if (!contentType) throw new ValidationError("ניתן להעלות תמונה (JPG, PNG, WEBP) או PDF");

  let extractionStatus = "none";
  let extracted: RawReceipt | null = null;
  let error: string | undefined;
  const run = extract ?? (aiConfigured() ? extractReceipt : null);
  if (run) {
    const categories = (await listCategories(organizationId)).map((c) => ({ key: c.key, label: c.label }));
    try {
      extracted = await run(file.bytes, contentType, categories);
      extractionStatus = "done";
    } catch (e) {
      if (!(e instanceof ReceiptExtractionError)) throw e;
      extractionStatus = "failed";
      error = e.message;
    }
  }

  const db = await getDb();
  const [receipt] = await db
    .insert(schema.receipts)
    .values({
      organizationId,
      filename: file.name.slice(0, 200) || "receipt",
      contentType,
      size: file.bytes.byteLength,
      data: Buffer.from(file.bytes),
      extractionStatus,
      extracted,
      uploadedBy: userId,
    })
    .returning({ id: schema.receipts.id });
  return { id: receipt.id, extractionStatus, error };
}

/** קבלה שעדיין לא שויכה להוצאה, עם הפרטים שחולצו ממנה (אם חולצו) מוכנים לטופס */
export async function getPendingReceipt(organizationId: string, id: string, today: string) {
  const db = await getDb();
  const [receipt] = await db
    .select({
      id: schema.receipts.id,
      filename: schema.receipts.filename,
      extractionStatus: schema.receipts.extractionStatus,
      extracted: schema.receipts.extracted,
    })
    .from(schema.receipts)
    .where(
      and(
        eq(schema.receipts.id, id),
        eq(schema.receipts.organizationId, organizationId),
        isNull(schema.receipts.expenseId),
      ),
    );
  if (!receipt) return null;

  let prefill: ReceiptPrefill = { warnings: [] };
  if (receipt.extractionStatus === "done" && receipt.extracted) {
    const categories = await listCategories(organizationId);
    const normalized = normalizeReceipt(receipt.extracted as RawReceipt, categories.map((c) => c.key), today);
    prefill = normalized;
    const category = categories.find((c) => c.key === normalized.categoryKey);
    return { ...receipt, prefill, categoryId: category?.id };
  }
  return { ...receipt, prefill, categoryId: undefined };
}

export async function getReceiptFile(organizationId: string, id: string) {
  const db = await getDb();
  const [receipt] = await db
    .select()
    .from(schema.receipts)
    .where(and(eq(schema.receipts.id, id), eq(schema.receipts.organizationId, organizationId)));
  return receipt ?? null;
}

export async function receiptsForExpenses(organizationId: string) {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.receipts.id, expenseId: schema.receipts.expenseId })
    .from(schema.receipts)
    .where(eq(schema.receipts.organizationId, organizationId));
  return new Map(rows.filter((r) => r.expenseId).map((r) => [r.expenseId!, r.id]));
}
