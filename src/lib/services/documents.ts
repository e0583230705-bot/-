import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { DOCUMENT_TYPES, type DocumentType, requiresAllocationNumber } from "@/lib/domain/documents";
import { addVat, type ISODate, vatRateOn } from "@/lib/domain/vat";
import { sum } from "@/lib/domain/money";
import { getOrganization, profileOf, ValidationError } from "./organizations";

export interface NewDocument {
  organizationId: string;
  type: DocumentType;
  issueDate: ISODate;
  customer: { name: string; taxId?: string; isVatRegistered: boolean };
  lines: { description: string; quantity: number; unitPrice: number }[];
  notes?: string;
}

/** מסמכים שאינם חשבונית (קבלה, קבלת תרומה) לא נושאים מע"מ משלהם */
function documentCarriesVat(type: DocumentType) {
  return DOCUMENT_TYPES[type].isTaxInvoice || type === "proforma";
}

export async function issueDocument(input: NewDocument) {
  const org = await getOrganization(input.organizationId);
  if (!org) throw new ValidationError("העסק לא נמצא");
  const profile = profileOf(org);
  if (!profile.allowedDocuments.includes(input.type)) {
    throw new ValidationError(`${profile.label} אינו רשאי להפיק ${DOCUMENT_TYPES[input.type].label}`);
  }
  if (input.lines.length === 0) throw new ValidationError("יש להוסיף לפחות שורה אחת");
  if (!input.customer.name.trim()) throw new ValidationError("חסר שם לקוח");

  const lines = input.lines.map((l, i) => ({
    position: i + 1,
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    lineNet: Math.round(l.quantity * l.unitPrice),
  }));
  const net = sum(lines.map((l) => l.lineNet));
  if (net <= 0) throw new ValidationError("סכום המסמך חייב להיות חיובי");

  const rate = profile.chargesVat && documentCarriesVat(input.type) ? vatRateOn(input.issueDate) : 0;
  const totals = addVat(net, rate);
  const allocationRequired = requiresAllocationNumber({
    type: input.type,
    issueDate: input.issueDate,
    net,
    customerIsVatRegistered: input.customer.isVatRegistered,
  });

  const db = await getDb();
  return db.transaction(async (tx) => {
    const [last] = await tx
      .select({ number: schema.documents.number, issueDate: schema.documents.issueDate })
      .from(schema.documents)
      .where(and(eq(schema.documents.organizationId, org.id), eq(schema.documents.type, input.type)))
      .orderBy(desc(schema.documents.number))
      .limit(1);

    // הוראות ניהול ספרים: מסמכים מאותו סוג מופקים ברצף ובסדר כרונולוגי
    if (last && input.issueDate < last.issueDate) {
      throw new ValidationError(
        `לא ניתן להפיק מסמך בתאריך מוקדם מהמסמך האחרון מאותו סוג (${last.issueDate})`,
      );
    }

    const [doc] = await tx
      .insert(schema.documents)
      .values({
        organizationId: org.id,
        type: input.type,
        number: (last?.number ?? 0) + 1,
        issueDate: input.issueDate,
        customerName: input.customer.name.trim(),
        customerTaxId: input.customer.taxId || null,
        net: totals.net,
        vat: totals.vat,
        gross: totals.gross,
        vatRate: rate,
        allocationRequired,
        notes: input.notes || null,
      })
      .returning();
    await tx.insert(schema.documentLines).values(lines.map((l) => ({ ...l, documentId: doc.id })));
    await tx.insert(schema.auditLog).values({
      organizationId: org.id,
      action: "issue",
      entity: "document",
      entityId: doc.id,
      data: { type: doc.type, number: doc.number, gross: doc.gross },
    });
    return doc;
  });
}

export async function listDocuments(organizationId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.organizationId, organizationId))
    .orderBy(desc(schema.documents.issueDate), desc(schema.documents.createdAt));
}

/** מסמך עם השורות שלו — רק אם הוא שייך לעסק המבוקש */
export async function getDocument(organizationId: string, documentId: string) {
  const db = await getDb();
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.id, documentId), eq(schema.documents.organizationId, organizationId)));
  if (!doc) return null;
  const lines = await db
    .select()
    .from(schema.documentLines)
    .where(eq(schema.documentLines.documentId, doc.id))
    .orderBy(asc(schema.documentLines.position));
  return { doc, lines };
}

/**
 * מסמך מופק כ"מקור" פעם אחת בלבד; כל הפקה נוספת היא "העתק נאמן למקור".
 * העדכון אטומי, כך ששתי בקשות במקביל לא יקבלו שתיהן "מקור".
 */
export async function claimOriginal(organizationId: string, documentId: string, userId: string) {
  const db = await getDb();
  const claimed = await db
    .update(schema.documents)
    .set({ originalDeliveredAt: new Date() })
    .where(
      and(
        eq(schema.documents.id, documentId),
        eq(schema.documents.organizationId, organizationId),
        isNull(schema.documents.originalDeliveredAt),
      ),
    )
    .returning({ id: schema.documents.id });
  if (claimed.length > 0) {
    await db.insert(schema.auditLog).values({
      organizationId,
      action: "deliver_original",
      entity: "document",
      entityId: documentId,
      data: { by: userId },
    });
  }
  return claimed.length > 0;
}
