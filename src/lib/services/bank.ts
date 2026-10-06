import "server-only";
import { and, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { decodeBankFile, fingerprints, parseBankStatement } from "@/lib/domain/bank/parse";
import { suggestMatches, type Suggestion } from "@/lib/domain/bank/match";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/documents";
import { ValidationError } from "./organizations";

export const MAX_BANK_FILE_BYTES = 5 * 1024 * 1024;

export async function importBankFile(organizationId: string, bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new ValidationError("הקובץ ריק");
  if (bytes.byteLength > MAX_BANK_FILE_BYTES) throw new ValidationError("הקובץ גדול מדי (עד 5MB)");

  const { rows, skipped } = parseBankStatement(decodeBankFile(bytes));
  const prints = fingerprints(rows);
  const db = await getDb();
  const inserted = await db
    .insert(schema.bankTransactions)
    .values(rows.map((r, i) => ({ organizationId, ...r, fingerprint: prints[i] })))
    .onConflictDoNothing({ target: [schema.bankTransactions.organizationId, schema.bankTransactions.fingerprint] })
    .returning({ id: schema.bankTransactions.id });

  await db.insert(schema.auditLog).values({
    organizationId,
    action: "import",
    entity: "bank_transactions",
    data: { rows: rows.length, imported: inserted.length },
  });
  return { imported: inserted.length, duplicates: rows.length - inserted.length, skipped };
}

export type BankFilter = "all" | "unmatched";

/** התנועות של העסק, עם הצעת התאמה לכל תנועה שעדיין לא טופלה */
export async function listBankTransactions(organizationId: string, filter: BankFilter = "all") {
  const db = await getDb();
  const where = and(
    eq(schema.bankTransactions.organizationId, organizationId),
    filter === "unmatched" ? eq(schema.bankTransactions.status, "unmatched") : undefined,
  );
  const transactions = await db
    .select()
    .from(schema.bankTransactions)
    .where(where)
    .orderBy(desc(schema.bankTransactions.date), desc(schema.bankTransactions.importedAt))
    .limit(500);

  // מועמדים להתאמה: מסמכים והוצאות שעוד לא שויכו לאף תנועה
  const linkedDocs = db
    .select({ id: schema.bankTransactions.matchedDocumentId })
    .from(schema.bankTransactions)
    .where(and(eq(schema.bankTransactions.organizationId, organizationId), sql`${schema.bankTransactions.matchedDocumentId} is not null`));
  const linkedExpenses = db
    .select({ id: schema.bankTransactions.matchedExpenseId })
    .from(schema.bankTransactions)
    .where(and(eq(schema.bankTransactions.organizationId, organizationId), sql`${schema.bankTransactions.matchedExpenseId} is not null`));

  const docs = await db
    .select()
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.organizationId, organizationId),
        inArray(schema.documents.type, ["tax_invoice", "tax_invoice_receipt", "receipt", "donation_receipt"]),
        notInArray(schema.documents.id, linkedDocs),
      ),
    );
  const exps = await db
    .select()
    .from(schema.expenses)
    .where(and(eq(schema.expenses.organizationId, organizationId), notInArray(schema.expenses.id, linkedExpenses)));

  const suggestions = suggestMatches(
    transactions.filter((t) => t.status === "unmatched"),
    docs.map((d) => ({
      id: d.id,
      issueDate: d.issueDate,
      gross: d.gross,
      label: `${DOCUMENT_TYPES[d.type as DocumentType].label} ${d.number} · ${d.customerName}`,
    })),
    exps.map((e) => ({ id: e.id, date: e.date, gross: e.gross, label: e.supplierName })),
  );

  return transactions.map((t) => ({ ...t, suggestion: suggestions.get(t.id) ?? null }));
}

export async function getBankTransaction(organizationId: string, id: string) {
  const db = await getDb();
  const [tx] = await db
    .select()
    .from(schema.bankTransactions)
    .where(and(eq(schema.bankTransactions.id, id), eq(schema.bankTransactions.organizationId, organizationId)));
  return tx ?? null;
}

/** שיוך תנועה למסמך או להוצאה של אותו עסק — כולל בדיקה שהסכום והכיוון תואמים */
export async function matchTransaction(organizationId: string, txId: string, target: Pick<Suggestion, "kind" | "id">) {
  const db = await getDb();
  const tx = await getBankTransaction(organizationId, txId);
  if (!tx) throw new ValidationError("התנועה לא נמצאה");
  if (tx.status !== "unmatched") throw new ValidationError("התנועה כבר טופלה");

  if (target.kind === "document") {
    const [doc] = await db
      .select()
      .from(schema.documents)
      .where(and(eq(schema.documents.id, target.id), eq(schema.documents.organizationId, organizationId)));
    if (!doc || tx.amount !== doc.gross) throw new ValidationError("המסמך לא תואם לתנועה");
  } else {
    const [exp] = await db
      .select()
      .from(schema.expenses)
      .where(and(eq(schema.expenses.id, target.id), eq(schema.expenses.organizationId, organizationId)));
    if (!exp || -tx.amount !== exp.gross) throw new ValidationError("ההוצאה לא תואמת לתנועה");
  }

  // העדכון מותנה בסטטוס, כך ששתי התאמות במקביל לא ידרסו זו את זו
  const updated = await db
    .update(schema.bankTransactions)
    .set({
      status: "matched",
      matchedDocumentId: target.kind === "document" ? target.id : null,
      matchedExpenseId: target.kind === "expense" ? target.id : null,
    })
    .where(
      and(
        eq(schema.bankTransactions.id, tx.id),
        eq(schema.bankTransactions.status, "unmatched"),
        isNull(schema.bankTransactions.matchedDocumentId),
        isNull(schema.bankTransactions.matchedExpenseId),
      ),
    )
    .returning({ id: schema.bankTransactions.id });
  if (updated.length === 0) throw new ValidationError("התנועה כבר טופלה");
}

export async function setTransactionIgnored(organizationId: string, txId: string, ignored: boolean) {
  const db = await getDb();
  await db
    .update(schema.bankTransactions)
    .set(
      ignored
        ? { status: "ignored" }
        : { status: "unmatched", matchedDocumentId: null, matchedExpenseId: null },
    )
    .where(and(eq(schema.bankTransactions.id, txId), eq(schema.bankTransactions.organizationId, organizationId)));
}

export async function bankSummary(organizationId: string) {
  const db = await getDb();
  const rows = await db
    .select({ status: schema.bankTransactions.status, count: sql<number>`count(*)::int` })
    .from(schema.bankTransactions)
    .where(eq(schema.bankTransactions.organizationId, organizationId))
    .groupBy(schema.bankTransactions.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.count]));
  return { unmatched: by.unmatched ?? 0, matched: by.matched ?? 0, ignored: by.ignored ?? 0 };
}
