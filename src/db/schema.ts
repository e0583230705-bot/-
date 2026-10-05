import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * מודל רב־עסקי (multi-tenant): כל רשומה שייכת לעסק (organization),
 * וכל גישה לנתונים חייבת לעבור דרך מזהה העסק.
 * סכומים — באגורות (integer).
 */

const id = () => uuid("id").primaryKey().defaultRandom();
const orgRef = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  businessType: text("business_type").notNull(),
  taxId: text("tax_id").notNull(),
  vatFrequency: text("vat_frequency").notNull(),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

/** משתמש יכול להיות שייך לכמה עסקים (למשל יועץ שמנהל כמה לקוחות) */
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    organizationId: orgRef(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // owner | accountant | viewer
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_org_user").on(t.organizationId, t.userId)],
);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    organizationId: orgRef(),
    name: text("name").notNull(),
    taxId: text("tax_id"),
    isVatRegistered: boolean("is_vat_registered").notNull().default(false),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    createdAt: createdAt(),
  },
  (t) => [index("customers_org").on(t.organizationId)],
);

export const documents = pgTable(
  "documents",
  {
    id: id(),
    organizationId: orgRef(),
    type: text("type").notNull(),
    number: integer("number").notNull(),
    issueDate: date("issue_date").notNull(),
    customerId: uuid("customer_id").references(() => customers.id),
    /** צילום פרטי הלקוח ביום ההפקה — מסמך שהופק לא משתנה */
    customerName: text("customer_name").notNull(),
    customerTaxId: text("customer_tax_id"),
    net: integer("net").notNull(),
    vat: integer("vat").notNull(),
    gross: integer("gross").notNull(),
    vatRate: doublePrecision("vat_rate").notNull(),
    allocationRequired: boolean("allocation_required").notNull().default(false),
    allocationNumber: text("allocation_number"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("documents_org_type_number").on(t.organizationId, t.type, t.number),
    index("documents_org_date").on(t.organizationId, t.issueDate),
  ],
);

export const documentLines = pgTable("document_lines", {
  id: id(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  description: text("description").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  lineNet: integer("line_net").notNull(),
});

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: id(),
    organizationId: orgRef(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    taxDeductiblePct: doublePrecision("tax_deductible_pct").notNull(),
    vatDeductiblePct: doublePrecision("vat_deductible_pct").notNull(),
  },
  (t) => [uniqueIndex("expense_categories_org_key").on(t.organizationId, t.key)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    organizationId: orgRef(),
    date: date("date").notNull(),
    supplierName: text("supplier_name").notNull(),
    supplierTaxId: text("supplier_tax_id"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => expenseCategories.id),
    description: text("description"),
    referenceNumber: text("reference_number"),
    net: integer("net").notNull(),
    vat: integer("vat").notNull(),
    gross: integer("gross").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("expenses_org_date").on(t.organizationId, t.date)],
);

/** יומן פעולות — חובה לצורך הוראות ניהול ספרים ולביקורת */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    organizationId: orgRef(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    data: jsonb("data"),
    at: createdAt(),
  },
  (t) => [index("audit_org_at").on(t.organizationId, t.at)],
);
