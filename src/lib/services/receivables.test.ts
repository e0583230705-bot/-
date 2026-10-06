import { describe, expect, it } from "vitest";
import { registerUser } from "./auth";
import { createOrganization } from "./organizations";
import { getDocument, issueDocument, markDocumentPaid, markDocumentUnpaid } from "./documents";
import { importBankFile, listBankTransactions, matchTransaction, setTransactionIgnored } from "./bank";

async function setup(email: string) {
  const user = await registerUser({ email, name: "x", password: "correct horse battery" });
  const org = await createOrganization({ ownerUserId: user.id, name: "עסק", businessType: "osek_murshe", taxId: "123456782" });
  return { user, org };
}

const customer = { name: "לקוח", isVatRegistered: false };
const invoice = (organizationId: string, issueDate = "2026-09-01") =>
  issueDocument({
    organizationId,
    type: "tax_invoice",
    issueDate,
    customer,
    lines: [{ description: "שירות", quantity: 1, unitPrice: 400000 }],
  });

describe("receivables", () => {
  it("a receipt for an invoice marks it paid, once, and only for the same amount", async () => {
    const { org } = await setup("recv1@example.com");
    const inv = await invoice(org.id);
    const receiptFor = (amount: number, issueDate = "2026-09-10") =>
      issueDocument({
        organizationId: org.id,
        type: "receipt",
        issueDate,
        customer,
        lines: [{ description: "תשלום", quantity: 1, unitPrice: amount }],
        relatedDocumentId: inv.id,
      });

    await expect(receiptFor(100000)).rejects.toThrow(/תשלום חלקי/);
    await expect(receiptFor(472000, "2026-08-01")).rejects.toThrow(/לפני/);
    const receipt = await receiptFor(472000);
    expect(receipt.relatedDocumentId).toBe(inv.id);
    expect((await getDocument(org.id, inv.id))?.doc).toMatchObject({ paidAt: "2026-09-10", paidVia: "receipt" });
    await expect(receiptFor(472000, "2026-09-11")).rejects.toThrow(/כבר סומן/);
    // ידני לא מבטל תשלום שנקבע מקבלה
    await expect(markDocumentUnpaid(org.id, inv.id, "u")).rejects.toThrow(/ידני/);
  });

  it("only allows the documented pairs", async () => {
    const { org } = await setup("recv2@example.com");
    const inv = await invoice(org.id);
    await expect(
      issueDocument({
        organizationId: org.id,
        type: "tax_invoice_receipt",
        issueDate: "2026-09-10",
        customer,
        lines: [{ description: "x", quantity: 1, unitPrice: 400000 }],
        relatedDocumentId: inv.id,
      }),
    ).rejects.toThrow(/לא ניתן לקשר/);
  });

  it("marks and unmarks manual payments", async () => {
    const { user, org } = await setup("recv3@example.com");
    const inv = await invoice(org.id);
    await expect(markDocumentPaid(org.id, inv.id, "2026-08-01", user.id)).rejects.toThrow(/לפני/);
    await markDocumentPaid(org.id, inv.id, "2026-09-15", user.id);
    await expect(markDocumentPaid(org.id, inv.id, "2026-09-16", user.id)).rejects.toThrow(/כבר סומן/);
    await markDocumentUnpaid(org.id, inv.id, user.id);
    expect((await getDocument(org.id, inv.id))?.doc.paidAt).toBeNull();
  });

  it("a bank match pays the invoice and undoing it reopens it", async () => {
    const { org } = await setup("recv4@example.com");
    const inv = await invoice(org.id);
    await importBankFile(org.id, new TextEncoder().encode("תאריך,תיאור,סכום\n12/09/2026,העברה מלקוח,4720.00"));
    const [tx] = await listBankTransactions(org.id);
    expect(tx.suggestion).toMatchObject({ kind: "document", id: inv.id });
    await matchTransaction(org.id, tx.id, { kind: "document", id: inv.id });
    expect((await getDocument(org.id, inv.id))?.doc).toMatchObject({ paidAt: "2026-09-12", paidVia: "bank" });
    await setTransactionIgnored(org.id, tx.id, false);
    expect((await getDocument(org.id, inv.id))?.doc.paidAt).toBeNull();
  });

  it("does not suggest an invoice already paid by a receipt — the receipt is suggested instead", async () => {
    const { org } = await setup("recv5@example.com");
    const inv = await invoice(org.id);
    const receipt = await issueDocument({
      organizationId: org.id,
      type: "receipt",
      issueDate: "2026-09-10",
      customer,
      lines: [{ description: "תשלום", quantity: 1, unitPrice: 472000 }],
      relatedDocumentId: inv.id,
    });
    await importBankFile(org.id, new TextEncoder().encode("תאריך,תיאור,סכום\n12/09/2026,העברה מלקוח,4720.00"));
    const [tx] = await listBankTransactions(org.id);
    expect(tx.suggestion).toMatchObject({ kind: "document", id: receipt.id });
  });

  it("keeps businesses apart", async () => {
    const a = await setup("recv6@example.com");
    const b = await setup("recv7@example.com");
    const inv = await invoice(a.org.id);
    await expect(markDocumentPaid(b.org.id, inv.id, "2026-09-15", b.user.id)).rejects.toThrow(/לא נמצא/);
    await expect(
      issueDocument({
        organizationId: b.org.id,
        type: "receipt",
        issueDate: "2026-09-10",
        customer,
        lines: [{ description: "x", quantity: 1, unitPrice: 472000 }],
        relatedDocumentId: inv.id,
      }),
    ).rejects.toThrow(/לא נמצא/);
  });
});
