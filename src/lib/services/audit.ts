import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { decodeBankFile } from "@/lib/domain/bank/parse";
import { parseLedgerCsv } from "@/lib/domain/ledger/import-csv";
import { MATERIALITY_BASES, type MaterialityBasis } from "@/lib/domain/ledger/materiality";
import type { LedgerAccount, LedgerLine } from "@/lib/domain/ledger/types";
import { isValidIsraeliId } from "@/lib/domain/israeli-id";
import { ValidationError } from "./organizations";

export const MAX_LEDGER_BYTES = 30 * 1024 * 1024;

export async function createEngagement(
  organizationId: string,
  userId: string,
  input: { clientName: string; clientTaxId?: string; fiscalYear: number },
) {
  const clientName = input.clientName.trim();
  if (!clientName) throw new ValidationError("חסר שם הלקוח המבוקר");
  const taxId = input.clientTaxId?.trim() || null;
  if (taxId && !isValidIsraeliId(taxId)) throw new ValidationError("מספר ח.פ. / עוסק של הלקוח לא תקין");
  if (!Number.isInteger(input.fiscalYear) || input.fiscalYear < 2000 || input.fiscalYear > 2100) {
    throw new ValidationError("שנת דוח לא תקינה");
  }
  const db = await getDb();
  const [engagement] = await db
    .insert(schema.auditEngagements)
    .values({
      organizationId,
      clientName,
      clientTaxId: taxId,
      fiscalYear: input.fiscalYear,
      yearEnd: `${input.fiscalYear}-12-31`,
      sampleSeed: randomInt(1, 2_000_000_000),
      createdBy: userId,
    })
    .returning();
  await db.insert(schema.auditLog).values({
    organizationId,
    action: "create",
    entity: "audit_engagement",
    entityId: engagement.id,
    data: { clientName, fiscalYear: input.fiscalYear, by: userId },
  });
  return engagement;
}

export async function listEngagements(organizationId: string) {
  const db = await getDb();
  return db
    .select({
      engagement: schema.auditEngagements,
      lineCount: sql<number>`count(${schema.auditLines.id})::int`,
    })
    .from(schema.auditEngagements)
    .leftJoin(schema.auditLines, eq(schema.auditLines.engagementId, schema.auditEngagements.id))
    .where(eq(schema.auditEngagements.organizationId, organizationId))
    .groupBy(schema.auditEngagements.id)
    .orderBy(desc(schema.auditEngagements.fiscalYear), asc(schema.auditEngagements.clientName));
}

export async function getEngagement(organizationId: string, id: string) {
  const db = await getDb();
  const [engagement] = await db
    .select()
    .from(schema.auditEngagements)
    .where(and(eq(schema.auditEngagements.id, id), eq(schema.auditEngagements.organizationId, organizationId)));
  return engagement ?? null;
}

/** קליטת כרטסת לתיק. קליטה חוזרת מחליפה את הנתונים הקודמים (למשל אחרי תיקונים של הלקוח) */
export async function importLedger(organizationId: string, engagementId: string, file: { name: string; bytes: Uint8Array }) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) throw new ValidationError("תיק הביקורת לא נמצא");
  if (file.bytes.byteLength === 0) throw new ValidationError("הקובץ ריק");
  if (file.bytes.byteLength > MAX_LEDGER_BYTES) throw new ValidationError("הקובץ גדול מדי (עד 30MB)");

  const { accounts, lines, skipped } = parseLedgerCsv(decodeBankFile(file.bytes));
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(schema.auditLines).where(eq(schema.auditLines.engagementId, engagement.id));
    await tx.delete(schema.auditAccounts).where(eq(schema.auditAccounts.engagementId, engagement.id));
    for (let i = 0; i < accounts.length; i += 1000) {
      await tx
        .insert(schema.auditAccounts)
        .values(accounts.slice(i, i + 1000).map((a) => ({ engagementId: engagement.id, ...a })));
    }
    for (let i = 0; i < lines.length; i += 1000) {
      await tx
        .insert(schema.auditLines)
        .values(lines.slice(i, i + 1000).map((l) => ({ engagementId: engagement.id, ...l })));
    }
    await tx
      .update(schema.auditEngagements)
      .set({ sourceFilename: file.name.slice(0, 200), importedAt: new Date() })
      .where(eq(schema.auditEngagements.id, engagement.id));
    await tx.insert(schema.auditLog).values({
      organizationId,
      action: "import_ledger",
      entity: "audit_engagement",
      entityId: engagement.id,
      data: { filename: file.name, accounts: accounts.length, lines: lines.length, skipped },
    });
  });
  return { accounts: accounts.length, lines: lines.length, skipped };
}

export async function loadEngagementLedger(organizationId: string, engagementId: string) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) return null;
  const db = await getDb();
  const accounts: LedgerAccount[] = await db
    .select({ code: schema.auditAccounts.code, name: schema.auditAccounts.name, openingBalance: schema.auditAccounts.openingBalance })
    .from(schema.auditAccounts)
    .where(eq(schema.auditAccounts.engagementId, engagement.id));
  const lines: LedgerLine[] = await db
    .select({
      entryId: schema.auditLines.entryId,
      date: schema.auditLines.date,
      accountCode: schema.auditLines.accountCode,
      amount: schema.auditLines.amount,
      description: schema.auditLines.description,
      reference: schema.auditLines.reference,
    })
    .from(schema.auditLines)
    .where(eq(schema.auditLines.engagementId, engagement.id))
    .orderBy(asc(schema.auditLines.date));
  return { engagement, accounts, lines };
}

export async function setMateriality(
  organizationId: string,
  engagementId: string,
  input: { basis: MaterialityBasis; base: number; pct: number },
) {
  if (!(input.basis in MATERIALITY_BASES)) throw new ValidationError("בסיס מהותיות לא תקין");
  if (!(input.base > 0)) throw new ValidationError("סכום הבסיס חייב להיות חיובי");
  if (!(input.pct > 0 && input.pct <= 20)) throw new ValidationError("האחוז חייב להיות בין 0 ל־20");
  const db = await getDb();
  const updated = await db
    .update(schema.auditEngagements)
    .set({ materialityBasis: input.basis, materialityBase: input.base, materialityPct: input.pct })
    .where(and(eq(schema.auditEngagements.id, engagementId), eq(schema.auditEngagements.organizationId, organizationId)))
    .returning({ id: schema.auditEngagements.id });
  if (updated.length === 0) throw new ValidationError("תיק הביקורת לא נמצא");
}

/** מדגם חדש: seed חדש (הקודם מתועד ביומן, כדי שאפשר יהיה להראות שהמדגם לא "נבחר ידנית") */
export async function redrawSample(organizationId: string, engagementId: string, userId: string) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) throw new ValidationError("תיק הביקורת לא נמצא");
  const db = await getDb();
  const seed = randomInt(1, 2_000_000_000);
  await db.update(schema.auditEngagements).set({ sampleSeed: seed }).where(eq(schema.auditEngagements.id, engagement.id));
  await db.insert(schema.auditLog).values({
    organizationId,
    action: "redraw_sample",
    entity: "audit_engagement",
    entityId: engagement.id,
    data: { previousSeed: engagement.sampleSeed, seed, by: userId },
  });
}
