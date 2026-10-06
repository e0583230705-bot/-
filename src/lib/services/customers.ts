import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { isValidIsraeliId } from "@/lib/domain/israeli-id";
import { ValidationError } from "./organizations";

export interface CustomerInput {
  name: string;
  taxId?: string;
  isVatRegistered: boolean;
  email?: string;
  phone?: string;
  address?: string;
}

function clean(input: CustomerInput) {
  const name = input.name.trim();
  if (!name) throw new ValidationError("חסר שם לקוח");
  const taxId = input.taxId?.trim() || null;
  if (taxId && !isValidIsraeliId(taxId)) throw new ValidationError("מספר עוסק / ח.פ. של הלקוח לא תקין");
  if (input.isVatRegistered && !taxId) throw new ValidationError("ללקוח שהוא עוסק מורשה יש להזין מספר עוסק");
  return {
    name,
    taxId,
    isVatRegistered: input.isVatRegistered,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
  };
}

export async function createCustomer(organizationId: string, input: CustomerInput) {
  const db = await getDb();
  const [customer] = await db
    .insert(schema.customers)
    .values({ organizationId, ...clean(input) })
    .returning();
  return customer;
}

export async function updateCustomer(organizationId: string, id: string, input: CustomerInput) {
  const db = await getDb();
  const [customer] = await db
    .update(schema.customers)
    .set(clean(input))
    .where(and(eq(schema.customers.id, id), eq(schema.customers.organizationId, organizationId)))
    .returning();
  if (!customer) throw new ValidationError("הלקוח לא נמצא");
  return customer;
}

export async function getCustomer(organizationId: string, id: string) {
  const db = await getDb();
  const [customer] = await db
    .select()
    .from(schema.customers)
    .where(and(eq(schema.customers.id, id), eq(schema.customers.organizationId, organizationId)));
  return customer ?? null;
}

/** לקוחות עם סיכום: כמה מסמכים ומה סך החיובים (חשבוניות פחות זיכויים) */
export async function listCustomers(organizationId: string) {
  const db = await getDb();
  const billed = sql<number>`coalesce(sum(case
    when ${schema.documents.type} in ('tax_invoice', 'tax_invoice_receipt') then ${schema.documents.gross}
    when ${schema.documents.type} = 'credit_note' then -${schema.documents.gross}
    else 0 end), 0)::int`;
  return db
    .select({
      customer: schema.customers,
      documentCount: sql<number>`count(${schema.documents.id})::int`,
      billed,
      lastDocument: sql<string | null>`max(${schema.documents.issueDate})`,
    })
    .from(schema.customers)
    .leftJoin(schema.documents, eq(schema.documents.customerId, schema.customers.id))
    .where(eq(schema.customers.organizationId, organizationId))
    .groupBy(schema.customers.id)
    .orderBy(asc(schema.customers.name));
}

export async function listCustomerDocuments(organizationId: string, customerId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.organizationId, organizationId), eq(schema.documents.customerId, customerId)))
    .orderBy(desc(schema.documents.issueDate), desc(schema.documents.number));
}
