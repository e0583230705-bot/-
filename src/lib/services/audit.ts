import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { decodeBankFile, parseBankStatement, type BankRow } from "@/lib/domain/bank/parse";
import { parseLedgerCsv } from "@/lib/domain/ledger/import-csv";
import {
  crossCheckIni,
  decodeUniform,
  parseBkmvdata,
  parseIni,
  type IniInfo,
  type UniformIssue,
} from "@/lib/domain/ledger/uniform-format";
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

const startsWith = (bytes: Uint8Array, code: string) =>
  bytes.byteLength >= 4 && String.fromCharCode(...bytes.subarray(0, 4)) === code;

type ImportedAccount = LedgerAccount & { trialBalanceCode?: string; trialBalanceName?: string; classification?: string };

/** מזהה את סוג הקבצים לפי התוכן: INI.TXT מתחיל ב־A000, BKMVDATA.TXT ב־A100, אחרת — כרטסת CSV */
function parseLedgerFiles(files: { name: string; bytes: Uint8Array }[]) {
  const iniFile = files.find((f) => startsWith(f.bytes, "A000"));
  const bkmvFile = files.find((f) => startsWith(f.bytes, "A100"));
  if (iniFile && !bkmvFile) throw new ValidationError("נבחר INI.TXT בלבד — יש לבחור גם את BKMVDATA.TXT מאותה ספרייה");
  if (bkmvFile) {
    const ini: IniInfo | null = iniFile ? parseIni(decodeUniform(iniFile.bytes)) : null;
    const bkmv = parseBkmvdata(decodeUniform(bkmvFile.bytes, ini?.charset ?? undefined));
    const issues: UniformIssue[] = [...bkmv.issues, ...(ini ? crossCheckIni(ini, bkmv) : [])];
    if (!ini) issues.push({ severity: "warning", message: "לא נבחר INI.TXT — לא ניתן לאמת את סיכומי הרשומות" });
    return {
      sourceType: "uniform" as const,
      filename: [bkmvFile.name, iniFile?.name].filter(Boolean).join(" + "),
      accounts: bkmv.accounts as ImportedAccount[],
      lines: bkmv.lines.map((l) => ({
        entryId: l.entryId,
        date: l.date,
        accountCode: l.accountCode,
        amount: l.amount,
        description: l.description,
        reference: l.reference,
      })),
      skipped: 0,
      issues,
      meta: {
        businessTaxId: bkmv.businessTaxId,
        businessName: ini?.businessName ?? null,
        softwareName: ini?.softwareName ?? null,
        softwareRegistration: ini?.softwareRegistration ?? null,
        rangeFrom: ini?.rangeFrom ?? null,
        rangeTo: ini?.rangeTo ?? null,
        counts: bkmv.counts,
      },
    };
  }
  if (files.length !== 1) throw new ValidationError("יש לבחור קובץ כרטסת אחד, או את שני קבצי המבנה האחיד");
  const csv = parseLedgerCsv(decodeBankFile(files[0].bytes));
  return {
    sourceType: "csv" as const,
    filename: files[0].name,
    accounts: csv.accounts as ImportedAccount[],
    lines: csv.lines,
    skipped: csv.skipped,
    issues: [] as UniformIssue[],
    meta: null,
  };
}

/**
 * קליטת ספרי הלקוח לתיק: קבצי מבנה אחיד (BKMVDATA.TXT + INI.TXT) או כרטסת CSV.
 * קליטה חוזרת מחליפה את הנתונים הקודמים (למשל אחרי תיקונים של הלקוח).
 */
export type LedgerPeriod = "current" | "prior";

export async function importLedger(
  organizationId: string,
  engagementId: string,
  input: { name: string; bytes: Uint8Array } | { name: string; bytes: Uint8Array }[],
  period: LedgerPeriod = "current",
) {
  const files = Array.isArray(input) ? input : [input];
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) throw new ValidationError("תיק הביקורת לא נמצא");
  if (files.length === 0 || files.some((f) => f.bytes.byteLength === 0)) throw new ValidationError("הקובץ ריק");
  if (files.reduce((s, f) => s + f.bytes.byteLength, 0) > MAX_LEDGER_BYTES) {
    throw new ValidationError("הקבצים גדולים מדי (עד 30MB)");
  }

  const parsed = parseLedgerFiles(files);
  const { accounts, lines, skipped } = parsed;
  const issues = [...parsed.issues];
  // קובץ של שנה אחרת מזו שנבחרה — טעות נפוצה ומסוכנת (השוואה לא נכונה, ביקורת על שנה שגויה)
  const expectedYear = String(period === "prior" ? engagement.fiscalYear - 1 : engagement.fiscalYear);
  const outside = lines.filter((l) => !l.date.startsWith(expectedYear)).length;
  if (lines.length > 0 && outside / lines.length > 0.05) {
    issues.unshift({
      severity: "error",
      message: `${Math.round((outside / lines.length) * 100)}% מהתנועות אינן משנת ${expectedYear} — ייתכן שנבחר קובץ של שנה אחרת`,
    });
  }
  if (parsed.meta && engagement.clientTaxId && parsed.meta.businessTaxId.replace(/^0+/, "") !== engagement.clientTaxId.replace(/^0+/, "")) {
    issues.unshift({
      severity: "error",
      message: `מספר העוסק בקובץ (${parsed.meta.businessTaxId}) שונה ממספר הח.פ. של הלקוח בתיק (${engagement.clientTaxId})`,
    });
  }
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.auditLines)
      .where(and(eq(schema.auditLines.engagementId, engagement.id), eq(schema.auditLines.period, period)));
    await tx
      .delete(schema.auditAccounts)
      .where(and(eq(schema.auditAccounts.engagementId, engagement.id), eq(schema.auditAccounts.period, period)));
    for (let i = 0; i < accounts.length; i += 1000) {
      await tx.insert(schema.auditAccounts).values(
        accounts.slice(i, i + 1000).map((a) => ({
          engagementId: engagement.id,
          period,
          code: a.code,
          name: a.name,
          openingBalance: a.openingBalance,
          trialBalanceCode: a.trialBalanceCode || null,
          trialBalanceName: a.trialBalanceName || null,
          classification: a.classification || null,
        })),
      );
    }
    for (let i = 0; i < lines.length; i += 1000) {
      await tx
        .insert(schema.auditLines)
        .values(lines.slice(i, i + 1000).map((l) => ({ engagementId: engagement.id, period, ...l })));
    }
    await tx
      .update(schema.auditEngagements)
      .set(
        period === "current"
          ? {
              sourceFilename: parsed.filename.slice(0, 200),
              sourceType: parsed.sourceType,
              sourceMeta: parsed.meta,
              importIssues: issues,
              importedAt: new Date(),
            }
          : {
              priorSource: {
                filename: parsed.filename.slice(0, 200),
                type: parsed.sourceType,
                meta: parsed.meta,
                issues,
                importedAt: new Date().toISOString(),
              },
            },
      )
      .where(eq(schema.auditEngagements.id, engagement.id));
    await tx.insert(schema.auditLog).values({
      organizationId,
      action: "import_ledger",
      entity: "audit_engagement",
      entityId: engagement.id,
      data: { period, filename: parsed.filename, source: parsed.sourceType, accounts: accounts.length, lines: lines.length, skipped, issues: issues.length },
    });
  });
  return { accounts: accounts.length, lines: lines.length, skipped, sourceType: parsed.sourceType, issues };
}

async function loadPeriod(engagementId: string, period: LedgerPeriod) {
  const db = await getDb();
  const accounts = await db
    .select({
      code: schema.auditAccounts.code,
      name: schema.auditAccounts.name,
      openingBalance: schema.auditAccounts.openingBalance,
      trialBalanceCode: schema.auditAccounts.trialBalanceCode,
      trialBalanceName: schema.auditAccounts.trialBalanceName,
    })
    .from(schema.auditAccounts)
    .where(and(eq(schema.auditAccounts.engagementId, engagementId), eq(schema.auditAccounts.period, period)));
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
    .where(and(eq(schema.auditLines.engagementId, engagementId), eq(schema.auditLines.period, period)))
    .orderBy(asc(schema.auditLines.date));
  return { accounts, lines };
}

export async function loadEngagementLedger(organizationId: string, engagementId: string) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) return null;
  const [current, prior] = await Promise.all([loadPeriod(engagement.id, "current"), loadPeriod(engagement.id, "prior")]);
  return { engagement, accounts: current.accounts, lines: current.lines, prior };
}

/** שמירת הסבר/תיעוד לממצא בתיק. טקסט ריק מוחק את ההסבר */
export async function saveNote(organizationId: string, engagementId: string, itemKey: string, text: string, userId: string) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) throw new ValidationError("תיק הביקורת לא נמצא");
  if (!/^[a-z]+:[^\r\n]{1,200}$/.test(itemKey)) throw new ValidationError("מזהה ממצא לא תקין");
  const db = await getDb();
  const clean = text.trim().slice(0, 5000);
  if (!clean) {
    await db
      .delete(schema.auditNotes)
      .where(and(eq(schema.auditNotes.engagementId, engagement.id), eq(schema.auditNotes.itemKey, itemKey)));
    return;
  }
  await db
    .insert(schema.auditNotes)
    .values({ engagementId: engagement.id, itemKey, text: clean, authorId: userId })
    .onConflictDoUpdate({
      target: [schema.auditNotes.engagementId, schema.auditNotes.itemKey],
      set: { text: clean, authorId: userId, updatedAt: new Date() },
    });
}

export async function listNotes(organizationId: string, engagementId: string) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) return new Map<string, { text: string; author: string | null; updatedAt: Date }>();
  const db = await getDb();
  const rows = await db
    .select({
      itemKey: schema.auditNotes.itemKey,
      text: schema.auditNotes.text,
      author: schema.users.name,
      updatedAt: schema.auditNotes.updatedAt,
    })
    .from(schema.auditNotes)
    .leftJoin(schema.users, eq(schema.auditNotes.authorId, schema.users.id))
    .where(eq(schema.auditNotes.engagementId, engagement.id));
  return new Map(rows.map((r) => [r.itemKey, { text: r.text, author: r.author, updatedAt: r.updatedAt }]));
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

const MAX_STATEMENT_ROWS = 200_000;

/** קליטת דף בנק להתאמה מול חשבון בנק בספרים. קליטה חוזרת לאותו חשבון מחליפה את הדף */
export async function importBankStatement(
  organizationId: string,
  engagementId: string,
  accountCode: string,
  file: { name: string; bytes: Uint8Array },
) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) throw new ValidationError("תיק הביקורת לא נמצא");
  const db = await getDb();
  const [account] = await db
    .select({ code: schema.auditAccounts.code })
    .from(schema.auditAccounts)
    .where(
      and(
        eq(schema.auditAccounts.engagementId, engagement.id),
        eq(schema.auditAccounts.period, "current"),
        eq(schema.auditAccounts.code, accountCode),
      ),
    );
  if (!account) throw new ValidationError("החשבון לא נמצא בספרים של התיק");
  if (file.bytes.byteLength === 0) throw new ValidationError("הקובץ ריק");
  if (file.bytes.byteLength > MAX_LEDGER_BYTES) throw new ValidationError("הקובץ גדול מדי");
  const { rows } = parseBankStatement(decodeBankFile(file.bytes));
  if (rows.length > MAX_STATEMENT_ROWS) throw new ValidationError("יותר מדי שורות בדף הבנק");

  await db
    .insert(schema.auditBankStatements)
    .values({ engagementId: engagement.id, accountCode, filename: file.name.slice(0, 200), rows })
    .onConflictDoUpdate({
      target: [schema.auditBankStatements.engagementId, schema.auditBankStatements.accountCode],
      set: { filename: file.name.slice(0, 200), rows, balanceOverride: null, importedAt: new Date() },
    });
  return { rows: rows.length };
}

export async function setStatementBalance(
  organizationId: string,
  engagementId: string,
  accountCode: string,
  balance: number | null,
) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) throw new ValidationError("תיק הביקורת לא נמצא");
  const db = await getDb();
  const updated = await db
    .update(schema.auditBankStatements)
    .set({ balanceOverride: balance })
    .where(
      and(
        eq(schema.auditBankStatements.engagementId, engagement.id),
        eq(schema.auditBankStatements.accountCode, accountCode),
      ),
    )
    .returning({ id: schema.auditBankStatements.id });
  if (updated.length === 0) throw new ValidationError("לא נקלט דף בנק לחשבון הזה");
}

export async function listBankStatements(organizationId: string, engagementId: string) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) return [];
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.auditBankStatements)
    .where(eq(schema.auditBankStatements.engagementId, engagement.id))
    .orderBy(asc(schema.auditBankStatements.accountCode));
  return rows.map((r) => ({ ...r, rows: r.rows as BankRow[] }));
}

export interface VatConfig {
  revenueAccounts: string[];
  outputVatAccounts: string[];
}

export async function setVatConfig(organizationId: string, engagementId: string, config: VatConfig) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) throw new ValidationError("תיק הביקורת לא נמצא");
  if (config.revenueAccounts.length === 0 || config.outputVatAccounts.length === 0) {
    throw new ValidationError("יש לבחור לפחות חשבון הכנסות אחד וחשבון מע״מ עסקאות אחד");
  }
  const db = await getDb();
  const known = new Set(
    (
      await db
        .select({ code: schema.auditAccounts.code })
        .from(schema.auditAccounts)
        .where(and(eq(schema.auditAccounts.engagementId, engagement.id), eq(schema.auditAccounts.period, "current")))
    ).map((a) => a.code),
  );
  const all = [...config.revenueAccounts, ...config.outputVatAccounts];
  if (all.some((c) => !known.has(c))) throw new ValidationError("נבחר חשבון שלא קיים בספרים של התיק");
  if (config.revenueAccounts.some((c) => config.outputVatAccounts.includes(c))) {
    throw new ValidationError("אותו חשבון לא יכול להיות גם הכנסות וגם מע״מ");
  }
  await db.update(schema.auditEngagements).set({ vatConfig: config }).where(eq(schema.auditEngagements.id, engagement.id));
}
