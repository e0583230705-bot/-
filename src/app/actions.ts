"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { endSession, getContext, requirePermission, requireUser, startSession } from "@/lib/auth/dal";
import {
  authenticate,
  createPasswordReset,
  registerUser,
  resetPassword,
  setActiveOrganization,
} from "@/lib/services/auth";
import { appUrl, EmailError, sendEmail } from "@/lib/email/send";
import { passwordResetEmail } from "@/lib/email/templates";
import { sendDocumentToCustomer } from "@/lib/email/send-document";
import { addMember, ForbiddenError, getRole, removeMember } from "@/lib/services/members";
import { createOrganization, ValidationError } from "@/lib/services/organizations";
import { issueDocument, markDocumentPaid, markDocumentUnpaid } from "@/lib/services/documents";
import { addExpense } from "@/lib/services/expenses";
import { createCustomer, updateCustomer } from "@/lib/services/customers";
import { uploadReceipt } from "@/lib/services/receipts";
import {
  createEngagement,
  importBankStatement,
  importLedger,
  redrawSample,
  saveNote,
  setMateriality,
  setStatementBalance,
  setVatConfig,
} from "@/lib/services/audit";
import { parseShekels as parseMoney } from "@/lib/domain/money";
import { importBankFile, matchTransaction, setTransactionIgnored } from "@/lib/services/bank";
import { BankParseError } from "@/lib/domain/bank/parse";
import { parseShekels } from "@/lib/domain/money";

export type FormState = { error?: string; ok?: boolean; message?: string };

function errorMessage(e: unknown): FormState {
  unstable_rethrow(e); // הפניות של Next (למשל לדף ההתחברות) צריכות לעבור הלאה
  if (e instanceof ValidationError || e instanceof ForbiddenError || e instanceof BankParseError || e instanceof EmailError) {
    return { error: e.message };
  }
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
  return next.startsWith("/") && !next.startsWith("//") ? next : "/audit";
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
  redirect("/audit");
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
  customerId: z.union([z.uuid(), z.literal("")]).optional(),
  relatedDocumentId: z.union([z.uuid(), z.literal("")]).optional(),
  saveCustomer: z.literal("on").optional(),
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
      saveCustomer: input.saveCustomer === "on",
      relatedDocumentId: input.relatedDocumentId || undefined,
      customer: {
        id: input.customerId || undefined,
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
  bankTransactionId: z.union([z.uuid(), z.literal("")]).optional(),
  receiptId: z.union([z.uuid(), z.literal("")]).optional(),
});

export async function addExpenseAction(_: FormState, formData: FormData): Promise<FormState> {
  let next: string | null = null;
  try {
    const { org } = await requirePermission("write_books");
    const { bankTransactionId, receiptId, ...input } = expenseSchema.parse(Object.fromEntries(formData));
    await addExpense({
      organizationId: org.id,
      ...input,
      bankTransactionId: bankTransactionId || undefined,
      receiptId: receiptId || undefined,
    });
    if (bankTransactionId) next = "/bank";
    else if (receiptId) next = "/expenses";
  } catch (e) {
    return errorMessage(e);
  }
  revalidatePath("/", "layout");
  if (next) redirect(next);
  return { ok: true };
}

export async function importBankFileAction(_: FormState, formData: FormData): Promise<FormState> {
  let message: string;
  try {
    const { org } = await requirePermission("write_books");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "יש לבחור קובץ" };
    const r = await importBankFile(org.id, new Uint8Array(await file.arrayBuffer()));
    message = `יובאו ${r.imported} תנועות חדשות` + (r.duplicates ? `, ${r.duplicates} כבר היו במערכת` : "");
  } catch (e) {
    return errorMessage(e);
  }
  revalidatePath("/bank");
  return { ok: true, message };
}

const uuid = z.uuid();

/** פעולות כפתור בדף הבנק: קלט לא תקין או תנועה שכבר טופלה פשוט מתעדכנים בתצוגה, בלי דף שגיאה */
async function bankButtonAction(run: (orgId: string) => Promise<void>) {
  try {
    const { org } = await requirePermission("write_books");
    await run(org.id);
  } catch (e) {
    unstable_rethrow(e);
    if (!(e instanceof ValidationError || e instanceof z.ZodError)) throw e;
  }
  revalidatePath("/bank");
}

export async function matchTransactionAction(formData: FormData) {
  await bankButtonAction((orgId) =>
    matchTransaction(orgId, uuid.parse(formData.get("txId")), {
      kind: formData.get("kind") === "document" ? "document" : "expense",
      id: uuid.parse(formData.get("targetId")),
    }),
  );
}

export async function ignoreTransactionAction(formData: FormData) {
  await bankButtonAction((orgId) =>
    setTransactionIgnored(orgId, uuid.parse(formData.get("txId")), formData.get("ignored") === "1"),
  );
}

const customerSchema = z.object({
  name: z.string(),
  taxId: z.string().optional(),
  isVatRegistered: z.literal("on").optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

function parseCustomer(formData: FormData) {
  const input = customerSchema.parse(Object.fromEntries(formData));
  return { ...input, isVatRegistered: input.isVatRegistered === "on" };
}

export async function createCustomerAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const { org } = await requirePermission("write_books");
    await createCustomer(org.id, parseCustomer(formData));
  } catch (e) {
    return errorMessage(e);
  }
  revalidatePath("/customers");
  redirect("/customers");
}

export async function updateCustomerAction(id: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { org } = await requirePermission("write_books");
    await updateCustomer(org.id, uuid.parse(id), parseCustomer(formData));
  } catch (e) {
    return errorMessage(e);
  }
  revalidatePath("/customers");
  redirect(`/customers/${id}`);
}

const emailField = z.string().trim().email("כתובת אימייל לא תקינה");

/** תמיד אותה תשובה ובערך אותו זמן — כדי לא לחשוף אילו כתובות רשומות */
export async function requestPasswordResetAction(_: FormState, formData: FormData): Promise<FormState> {
  const started = Date.now();
  try {
    const email = emailField.parse(formData.get("email"));
    const reset = await createPasswordReset(email);
    if (reset) {
      const link = appUrl(`/reset-password?token=${encodeURIComponent(reset.token)}`);
      await sendEmail({ to: reset.user.email, ...passwordResetEmail({ name: reset.user.name, link }) });
    }
  } catch (e) {
    if (e instanceof z.ZodError) return errorMessage(e);
    unstable_rethrow(e);
    console.error(e);
  }
  const wait = 1200 - (Date.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return { ok: true, message: "אם הכתובת רשומה במערכת, נשלח אליה קישור לאיפוס הסיסמה." };
}

export async function resetPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const userId = await resetPassword(String(formData.get("token") ?? ""), String(formData.get("password") ?? ""));
    await startSession(userId);
  } catch (e) {
    return errorMessage(e);
  }
  redirect("/audit");
}

export async function sendDocumentAction(documentId: string, _: FormState, formData: FormData): Promise<FormState> {
  let message: string;
  try {
    const to = emailField.parse(formData.get("to"));
    const result = await sendDocumentToCustomer(documentId, to, String(formData.get("message") ?? ""));
    message =
      result.status === "sent"
        ? `המסמך נשלח אל ${to}`
        : `שירות המיילים עוד לא מוגדר, ולכן המייל לא נשלח בפועל (נרשם ביומן). המסמך סומן כ"${result.mark === "original" ? "מקור" : "העתק"}".`;
  } catch (e) {
    return errorMessage(e);
  }
  revalidatePath(`/income/${documentId}`);
  return { ok: true, message };
}

export async function scanReceiptAction(_: FormState, formData: FormData): Promise<FormState> {
  let target: string;
  try {
    const { org, user } = await requirePermission("write_books");
    const file = formData.get("receipt");
    if (!(file instanceof File) || file.size === 0) return { error: "יש לבחור קובץ" };
    const result = await uploadReceipt(org.id, user.id, {
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    // גם כשהזיהוי נכשל הקובץ נשמר, וממשיכים למילוי ידני
    target = `/expenses?receipt=${result.id}${result.error ? "&scan=failed" : ""}`;
  } catch (e) {
    return errorMessage(e);
  }
  redirect(target);
}

export async function markPaidAction(documentId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { org, user } = await requirePermission("write_books");
    await markDocumentPaid(org.id, uuid.parse(documentId), date.parse(formData.get("paidAt")), user.id);
  } catch (e) {
    return errorMessage(e);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function markUnpaidAction(documentId: string) {
  const { org, user } = await requirePermission("write_books");
  try {
    await markDocumentUnpaid(org.id, uuid.parse(documentId), user.id);
  } catch (e) {
    unstable_rethrow(e);
    if (!(e instanceof ValidationError || e instanceof z.ZodError)) throw e;
  }
  revalidatePath("/", "layout");
}

const engagementSchema = z.object({
  clientName: z.string(),
  clientTaxId: z.string().optional(),
  fiscalYear: z.coerce.number().int(),
});

export async function createEngagementAction(_: FormState, formData: FormData): Promise<FormState> {
  let id: string;
  try {
    const { org, user } = await requirePermission("write_books");
    id = (await createEngagement(org.id, user.id, engagementSchema.parse(Object.fromEntries(formData)))).id;
  } catch (e) {
    return errorMessage(e);
  }
  redirect(`/audit/${id}`);
}

export async function importLedgerAction(
  engagementId: string,
  period: "current" | "prior",
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  let message: string;
  try {
    const { org } = await requirePermission("write_books");
    const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return { error: "יש לבחור קובץ" };
    const r = await importLedger(
      org.id,
      uuid.parse(engagementId),
      await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))),
      period === "prior" ? "prior" : "current",
    );
    message =
      `נקלטו ${r.lines.toLocaleString("he-IL")} שורות פקודה ב־${r.accounts} חשבונות` +
      (r.sourceType === "uniform" ? " מקובץ מבנה אחיד" : "") +
      (r.skipped ? ` (${r.skipped} שורות דולגו)` : "") +
      (r.issues.length ? ` · נמצאו ${r.issues.length} בעיות בקבצים` : "");
  } catch (e) {
    return errorMessage(e);
  }
  revalidatePath(`/audit/${engagementId}`);
  return { ok: true, message };
}

const materialitySchema = z.object({
  basis: z.enum(["profit_before_tax", "revenue", "total_assets", "equity"]),
  base: z.string().transform((v, ctx) => {
    const a = parseMoney(v);
    if (a === null) {
      ctx.addIssue({ code: "custom", message: "סכום לא תקין" });
      return z.NEVER;
    }
    return a;
  }),
  pct: z.coerce.number(),
});

export async function setMaterialityAction(engagementId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { org } = await requirePermission("write_books");
    await setMateriality(org.id, uuid.parse(engagementId), materialitySchema.parse(Object.fromEntries(formData)));
  } catch (e) {
    return errorMessage(e);
  }
  revalidatePath(`/audit/${engagementId}`);
  return { ok: true };
}

export async function redrawSampleAction(engagementId: string) {
  const { org, user } = await requirePermission("write_books");
  await redrawSample(org.id, uuid.parse(engagementId), user.id);
  revalidatePath(`/audit/${engagementId}`);
}

export async function saveNoteAction(engagementId: string, itemKey: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { org, user } = await requirePermission("write_books");
    await saveNote(org.id, uuid.parse(engagementId), itemKey, String(formData.get("text") ?? ""), user.id);
  } catch (e) {
    return errorMessage(e);
  }
  revalidatePath(`/audit/${engagementId}`);
  return { ok: true };
}

export async function importBankStatementAction(engagementId: string, _: FormState, formData: FormData): Promise<FormState> {
  let message: string;
  try {
    const { org } = await requirePermission("write_books");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "יש לבחור קובץ" };
    const accountCode = String(formData.get("accountCode") ?? "");
    if (!accountCode) return { error: "יש לבחור את חשבון הבנק בספרים" };
    const r = await importBankStatement(org.id, uuid.parse(engagementId), accountCode, {
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    message = `נקלטו ${r.rows.toLocaleString("he-IL")} תנועות מדף הבנק`;
  } catch (e) {
    return errorMessage(e);
  }
  revalidatePath(`/audit/${engagementId}`);
  return { ok: true, message };
}

export async function setStatementBalanceAction(
  engagementId: string,
  accountCode: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const { org } = await requirePermission("write_books");
    const raw = String(formData.get("balance") ?? "").trim();
    const balance = raw === "" ? null : parseMoney(raw);
    if (raw !== "" && balance === null) return { error: "סכום לא תקין" };
    await setStatementBalance(org.id, uuid.parse(engagementId), accountCode, balance);
  } catch (e) {
    return errorMessage(e);
  }
  revalidatePath(`/audit/${engagementId}`);
  return { ok: true };
}

export async function setVatConfigAction(engagementId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { org } = await requirePermission("write_books");
    await setVatConfig(org.id, uuid.parse(engagementId), {
      revenueAccounts: formData.getAll("revenueAccounts").map(String),
      outputVatAccounts: formData.getAll("outputVatAccounts").map(String),
    });
  } catch (e) {
    return errorMessage(e);
  }
  revalidatePath(`/audit/${engagementId}`);
  return { ok: true };
}

export async function importPayrollAction(engagementId: string, _: FormState, formData: FormData): Promise<FormState> {
  let message: string;
  try {
    const { org } = await requirePermission("write_books");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "יש לבחור קובץ 126" };
    const { importPayroll } = await import("@/lib/services/audit");
    const r = await importPayroll(org.id, uuid.parse(engagementId), { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    message =
      `נקלטו ${r.employees.toLocaleString("he-IL")} עובדים ו־${r.months} חודשי דיווח` +
      (r.issues.length ? ` · נמצאו ${r.issues.length} בעיות בקובץ` : "");
  } catch (e) {
    return errorMessage(e);
  }
  revalidatePath(`/audit/${engagementId}`);
  return { ok: true, message };
}

export async function setPayrollConfigAction(engagementId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { org } = await requirePermission("write_books");
    const { setPayrollConfig } = await import("@/lib/services/audit");
    const { PAYROLL_GROUPS } = await import("@/lib/domain/payroll/ledger-reconciliation");
    const mapping = Object.fromEntries(
      Object.keys(PAYROLL_GROUPS).map((g) => [g, formData.getAll(g).map(String).filter(Boolean)]),
    ) as Parameters<typeof setPayrollConfig>[2];
    await setPayrollConfig(org.id, uuid.parse(engagementId), mapping);
  } catch (e) {
    return errorMessage(e);
  }
  revalidatePath(`/audit/${engagementId}`);
  return { ok: true };
}
