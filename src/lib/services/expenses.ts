import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ISODate } from "@/lib/domain/vat";
import { getOrganization, ValidationError } from "./organizations";

export interface NewExpense {
  organizationId: string;
  date: ISODate;
  supplierName: string;
  supplierTaxId?: string;
  categoryId: string;
  /** סכום כולל מע"מ, באגורות */
  gross: number;
  /** מע"מ שמופיע בחשבונית, באגורות */
  vat: number;
  description?: string;
  referenceNumber?: string;
  /** אם ההוצאה נוצרה מתנועת בנק — משייכים אותה לתנועה */
  bankTransactionId?: string;
  /** קבלה שהועלתה — משייכים אותה להוצאה */
  receiptId?: string;
}

export async function addExpense(input: NewExpense) {
  const org = await getOrganization(input.organizationId);
  if (!org) throw new ValidationError("העסק לא נמצא");
  if (input.gross <= 0) throw new ValidationError("הסכום חייב להיות חיובי");
  if (input.vat < 0 || input.vat >= input.gross) throw new ValidationError("סכום המע\"מ לא תקין");
  if (!input.supplierName.trim()) throw new ValidationError("חסר שם ספק");

  const db = await getDb();
  // ודא שהקטגוריה שייכת לאותו עסק — הגנה על הפרדת הנתונים בין עסקים
  const [category] = await db
    .select()
    .from(schema.expenseCategories)
    .where(
      and(
        eq(schema.expenseCategories.id, input.categoryId),
        eq(schema.expenseCategories.organizationId, org.id),
      ),
    );
  if (!category) throw new ValidationError("קטגוריה לא תקינה");

  return db.transaction(async (tx) => {
    const [expense] = await tx
      .insert(schema.expenses)
      .values({
        organizationId: org.id,
        date: input.date,
        supplierName: input.supplierName.trim(),
        supplierTaxId: input.supplierTaxId || null,
        categoryId: category.id,
        description: input.description || null,
        referenceNumber: input.referenceNumber || null,
        net: input.gross - input.vat,
        vat: input.vat,
        gross: input.gross,
      })
      .returning();
    if (input.receiptId) {
      const attached = await tx
        .update(schema.receipts)
        .set({ expenseId: expense.id })
        .where(
          and(
            eq(schema.receipts.id, input.receiptId),
            eq(schema.receipts.organizationId, org.id),
            isNull(schema.receipts.expenseId),
          ),
        )
        .returning({ id: schema.receipts.id });
      if (attached.length === 0) throw new ValidationError("הקבלה כבר שויכה להוצאה אחרת");
    }
    if (input.bankTransactionId) {
      const linked = await tx
        .update(schema.bankTransactions)
        .set({ status: "matched", matchedExpenseId: expense.id })
        .where(
          and(
            eq(schema.bankTransactions.id, input.bankTransactionId),
            eq(schema.bankTransactions.organizationId, org.id),
            eq(schema.bankTransactions.status, "unmatched"),
          ),
        )
        .returning({ id: schema.bankTransactions.id });
      if (linked.length === 0) throw new ValidationError("תנועת הבנק כבר טופלה");
    }
    await tx.insert(schema.auditLog).values({
      organizationId: org.id,
      action: "create",
      entity: "expense",
      entityId: expense.id,
      data: { gross: expense.gross, category: category.key },
    });
    return expense;
  });
}

export async function listExpenses(organizationId: string) {
  const db = await getDb();
  return db
    .select({
      expense: schema.expenses,
      categoryLabel: schema.expenseCategories.label,
    })
    .from(schema.expenses)
    .innerJoin(schema.expenseCategories, eq(schema.expenses.categoryId, schema.expenseCategories.id))
    .where(eq(schema.expenses.organizationId, organizationId))
    .orderBy(desc(schema.expenses.date), desc(schema.expenses.createdAt));
}

export async function listCategories(organizationId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.expenseCategories)
    .where(eq(schema.expenseCategories.organizationId, organizationId))
    .orderBy(asc(schema.expenseCategories.label));
}
