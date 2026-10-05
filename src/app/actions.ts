"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ORG_COOKIE, getCurrentOrg } from "@/lib/current-org";
import { createOrganization, getOrganization, ValidationError } from "@/lib/services/organizations";
import { issueDocument } from "@/lib/services/documents";
import { addExpense } from "@/lib/services/expenses";
import { parseShekels } from "@/lib/domain/money";

export type FormState = { error?: string; ok?: boolean };

function errorMessage(e: unknown): FormState {
  if (e instanceof ValidationError) return { error: e.message };
  if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "קלט לא תקין" };
  console.error(e);
  return { error: "אירעה שגיאה. נסו שוב." };
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין");
const shekels = (msg: string) =>
  z.string().transform((v, ctx) => {
    const a = parseShekels(v);
    if (a === null) {
      ctx.addIssue({ code: "custom", message: msg });
      return z.NEVER;
    }
    return a;
  });

const orgSchema = z.object({
  name: z.string().trim().min(1, "חסר שם עסק"),
  businessType: z.enum(["osek_patur", "osek_murshe", "company", "partnership", "nonprofit"]),
  taxId: z.string().trim().min(5, "חסר מספר עוסק / ח.פ."),
  vatFrequency: z.enum(["monthly", "bimonthly"]).optional(),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
});

export async function createOrganizationAction(_: FormState, formData: FormData): Promise<FormState> {
  let orgId: string;
  try {
    const input = orgSchema.parse(Object.fromEntries(formData));
    orgId = (await createOrganization(input)).id;
  } catch (e) {
    return errorMessage(e);
  }
  (await cookies()).set(ORG_COOKIE, orgId, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/");
}

export async function switchOrganizationAction(formData: FormData) {
  const id = String(formData.get("orgId") ?? "");
  if (await getOrganization(id)) {
    (await cookies()).set(ORG_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/" });
  }
  revalidatePath("/", "layout");
}

const documentSchema = z.object({
  type: z.enum(["proforma", "tax_invoice", "tax_invoice_receipt", "credit_note", "receipt", "donation_receipt"]),
  issueDate: date,
  customerName: z.string().trim().min(1, "חסר שם לקוח"),
  customerTaxId: z.string().trim().optional(),
  customerIsVatRegistered: z.literal("on").optional(),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1, "חסר תיאור לשורה"),
        quantity: z.coerce.number().positive("כמות חייבת להיות חיובית"),
        unitPrice: shekels("מחיר לא תקין"),
      }),
    )
    .min(1, "יש להוסיף לפחות שורה אחת"),
});

export async function issueDocumentAction(_: FormState, formData: FormData): Promise<FormState> {
  const org = await getCurrentOrg();
  if (!org) return { error: "לא נבחר עסק" };
  try {
    const descriptions = formData.getAll("lineDescription").map(String);
    const quantities = formData.getAll("lineQuantity").map(String);
    const prices = formData.getAll("linePrice").map(String);
    const input = documentSchema.parse({
      ...Object.fromEntries(formData),
      lines: descriptions.map((description, i) => ({
        description,
        quantity: quantities[i],
        unitPrice: prices[i],
      })),
    });
    await issueDocument({
      organizationId: org.id,
      type: input.type,
      issueDate: input.issueDate,
      customer: {
        name: input.customerName,
        taxId: input.customerTaxId,
        isVatRegistered: input.customerIsVatRegistered === "on",
      },
      lines: input.lines,
      notes: input.notes,
    });
  } catch (e) {
    return errorMessage(e);
  }
  revalidatePath("/", "layout");
  redirect("/income");
}

const expenseSchema = z.object({
  date,
  supplierName: z.string().trim().min(1, "חסר שם ספק"),
  supplierTaxId: z.string().trim().optional(),
  categoryId: z.string().uuid("יש לבחור קטגוריה"),
  gross: shekels("סכום לא תקין"),
  vat: shekels("סכום מע\"מ לא תקין"),
  description: z.string().optional(),
  referenceNumber: z.string().optional(),
});

export async function addExpenseAction(_: FormState, formData: FormData): Promise<FormState> {
  const org = await getCurrentOrg();
  if (!org) return { error: "לא נבחר עסק" };
  try {
    const input = expenseSchema.parse(Object.fromEntries(formData));
    await addExpense({ organizationId: org.id, ...input });
  } catch (e) {
    return errorMessage(e);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
