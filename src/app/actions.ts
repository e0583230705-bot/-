"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { endSession, getContext, requirePermission, requireUser, startSession } from "@/lib/auth/dal";
import { authenticate, registerUser, setActiveOrganization } from "@/lib/services/auth";
import { addMember, ForbiddenError, getRole, removeMember } from "@/lib/services/members";
import { createOrganization, ValidationError } from "@/lib/services/organizations";
import { issueDocument } from "@/lib/services/documents";
import { addExpense } from "@/lib/services/expenses";
import { parseShekels } from "@/lib/domain/money";

export type FormState = { error?: string; ok?: boolean };

function errorMessage(e: unknown): FormState {
  unstable_rethrow(e); // הפניות של Next (למשל לדף ההתחברות) צריכות לעבור הלאה
  if (e instanceof ValidationError || e instanceof ForbiddenError) return { error: e.message };
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

/** מונע הפניה לכתובת חיצונית אחרי התחברות (open redirect) */
function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

const signupSchema = z.object({
  name: z.string(),
  email: z.string(),
  password: z.string(),
});

export async function signupAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = signupSchema.parse(Object.fromEntries(formData));
    const user = await registerUser(input);
    await startSession(user.id);
  } catch (e) {
    return errorMessage(e);
  }
  redirect("/onboarding");
}

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await authenticate(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
    await startSession(user.id);
  } catch (e) {
    return errorMessage(e);
  }
  redirect(safeNext(formData.get("next")));
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

export async function createOrganizationAction(_: FormState, formData: FormData): Promise<FormState> {
  const session = await requireUser();
  try {
    const input = orgSchema.parse(Object.fromEntries(formData));
    const org = await createOrganization({ ...input, ownerUserId: session.user.id });
    await setActiveOrganization(session.token, org.id);
  } catch (e) {
    return errorMessage(e);
  }
  redirect("/");
}

export async function switchOrganizationAction(formData: FormData) {
  const session = await requireUser();
  const id = String(formData.get("orgId") ?? "");
  // מעבר רק לעסק שהמשתמש חבר בו
  if (await getRole(session.user.id, id)) {
    await setActiveOrganization(session.token, id);
  }
  revalidatePath("/", "layout");
}

const memberSchema = z.object({
  email: z.string().trim().min(1, "חסר אימייל"),
  role: z.enum(["owner", "accountant", "viewer"]),
});

export async function addMemberAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const ctx = await getContext();
    const input = memberSchema.parse(Object.fromEntries(formData));
    await addMember(ctx.user.id, ctx.org.id, input.email, input.role);
  } catch (e) {
    return errorMessage(e);
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function removeMemberAction(formData: FormData) {
  const ctx = await getContext();
  await removeMember(ctx.user.id, ctx.org.id, String(formData.get("userId") ?? ""));
  revalidatePath("/settings");
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
  let issued: { id: string };
  try {
    const { org } = await requirePermission("write_books");
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
    issued = await issueDocument({
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
  redirect(`/income/${issued.id}`);
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
  try {
    const { org } = await requirePermission("write_books");
    const input = expenseSchema.parse(Object.fromEntries(formData));
    await addExpense({ organizationId: org.id, ...input });
  } catch (e) {
    return errorMessage(e);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
