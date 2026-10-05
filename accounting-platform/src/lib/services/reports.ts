import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { documentRecordsIncome, type DocumentType } from "@/lib/domain/documents";
import {
  computeProfitAndLoss,
  computeVatReport,
  type ExpenseEntry,
  type IncomeEntry,
  type Period,
} from "@/lib/domain/reports";
import { getOrganization, profileOf } from "./organizations";

/** טוען את כל תנועות העסק בפורמט של שכבת החישובים */
export async function loadLedger(organizationId: string) {
  const org = await getOrganization(organizationId);
  if (!org) throw new Error("העסק לא נמצא");
  const profile = profileOf(org);
  const db = await getDb();

  const docs = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.organizationId, org.id));
  const income: IncomeEntry[] = docs
    .filter((d) => documentRecordsIncome(d.type as DocumentType, profile.chargesVat))
    .map((d) => ({
      date: d.issueDate,
      net: d.net,
      vat: d.vat,
      isCredit: d.type === "credit_note",
    }));

  const rows = await db
    .select({ e: schema.expenses, c: schema.expenseCategories })
    .from(schema.expenses)
    .innerJoin(schema.expenseCategories, eq(schema.expenses.categoryId, schema.expenseCategories.id))
    .where(eq(schema.expenses.organizationId, org.id));
  const expenses: ExpenseEntry[] = rows.map(({ e, c }) => ({
    date: e.date,
    net: e.net,
    vat: e.vat,
    taxDeductiblePct: c.taxDeductiblePct,
    // עסק שלא גובה מע"מ גם לא מקזז מע"מ תשומות — המע"מ הופך לחלק מההוצאה
    vatDeductiblePct: profile.chargesVat ? c.vatDeductiblePct : 0,
  }));

  return { org, profile, income, expenses };
}

export async function vatReport(organizationId: string, period: Period) {
  const { income, expenses } = await loadLedger(organizationId);
  return computeVatReport(period, income, expenses);
}

export async function profitAndLoss(organizationId: string, period: Period) {
  const { income, expenses } = await loadLedger(organizationId);
  return computeProfitAndLoss(period, income, expenses);
}
