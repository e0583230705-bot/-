import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { BUSINESS_TYPES, type BusinessType, type VatFrequency } from "@/lib/domain/business-types";
import { DEFAULT_EXPENSE_CATEGORIES } from "@/lib/domain/expense-categories";
import { isValidIsraeliId } from "@/lib/domain/israeli-id";

export interface NewOrganization {
  name: string;
  businessType: BusinessType;
  taxId: string;
  vatFrequency?: VatFrequency;
  address?: string;
  phone?: string;
  email?: string;
}

export class ValidationError extends Error {}

export async function createOrganization(input: NewOrganization) {
  const profile = BUSINESS_TYPES[input.businessType];
  if (!profile) throw new ValidationError("סוג עסק לא מוכר");
  if (!isValidIsraeliId(input.taxId)) throw new ValidationError("מספר עוסק / ח.פ. לא תקין");
  const vatFrequency = profile.chargesVat
    ? (input.vatFrequency ?? profile.defaultVatFrequency)
    : "none";

  const db = await getDb();
  return db.transaction(async (tx) => {
    const [org] = await tx
      .insert(schema.organizations)
      .values({ ...input, vatFrequency })
      .returning();
    await tx.insert(schema.expenseCategories).values(
      DEFAULT_EXPENSE_CATEGORIES.map((c) => ({
        organizationId: org.id,
        key: c.key,
        label: c.label,
        taxDeductiblePct: c.taxDeductiblePct,
        vatDeductiblePct: c.vatDeductiblePct,
      })),
    );
    await tx.insert(schema.auditLog).values({
      organizationId: org.id,
      action: "create",
      entity: "organization",
      entityId: org.id,
      data: input,
    });
    return org;
  });
}

export async function getOrganization(id: string) {
  const db = await getDb();
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, id));
  return org ?? null;
}

export async function listOrganizations() {
  const db = await getDb();
  return db.select().from(schema.organizations).orderBy(asc(schema.organizations.createdAt));
}

export function profileOf(org: { businessType: string }) {
  return BUSINESS_TYPES[org.businessType as BusinessType];
}
