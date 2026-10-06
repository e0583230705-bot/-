import { describe, expect, it } from "vitest";
import { registerUser } from "./auth";
import { createOrganization } from "./organizations";
import { issueDocument } from "./documents";
import { addExpense, listCategories } from "./expenses";
import { bankSummary, importBankFile, listBankTransactions, matchTransaction, setTransactionIgnored } from "./bank";

const enc = (s: string) => new TextEncoder().encode(s);

async function setup(email: string) {
  const user = await registerUser({ email, name: "x", password: "correct horse battery" });
  return createOrganization({ ownerUserId: user.id, name: "עסק", businessType: "osek_murshe", taxId: "123456782" });
}

const STATEMENT = [
  "תאריך,הפעולה,אסמכתא,חובה,זכות,יתרה",
  "03/09/2026,העברה מלקוח,1234,,4720.00,14720.00",
  "05/09/2026,פז תחנת דלק,5555,590.00,,14130.00",
  "06/09/2026,העברה לחיסכון,6666,1000.00,,13130.00",
].join("\n");

describe("bank import service", () => {
  it("imports, skips duplicates, suggests and confirms matches", async () => {
    const org = await setup("bank1@example.com");
    const doc = await issueDocument({
      organizationId: org.id,
      type: "tax_invoice",
      issueDate: "2026-09-01",
      customer: { name: "לקוח", isVatRegistered: false },
      lines: [{ description: "שירות", quantity: 1, unitPrice: 400000 }],
    });
    const vehicle = (await listCategories(org.id)).find((c) => c.key === "vehicle")!;
    const fuel = await addExpense({
      organizationId: org.id,
      date: "2026-09-05",
      supplierName: "פז",
      categoryId: vehicle.id,
      gross: 59000,
      vat: 9000,
    });

    expect(await importBankFile(org.id, enc(STATEMENT))).toEqual({ imported: 3, duplicates: 0, skipped: 0 });
    expect(await importBankFile(org.id, enc(STATEMENT))).toEqual({ imported: 0, duplicates: 3, skipped: 0 });

    const txs = await listBankTransactions(org.id, "unmatched");
    const income = txs.find((t) => t.amount === 472000)!;
    const fuelTx = txs.find((t) => t.amount === -59000)!;
    const transfer = txs.find((t) => t.amount === -100000)!;
    expect(income.suggestion).toMatchObject({ kind: "document", id: doc.id });
    expect(fuelTx.suggestion).toMatchObject({ kind: "expense", id: fuel.id });
    expect(transfer.suggestion).toBeNull();

    await matchTransaction(org.id, income.id, { kind: "document", id: doc.id });
    await expect(matchTransaction(org.id, income.id, { kind: "document", id: doc.id })).rejects.toThrow(/טופלה/);
    await expect(matchTransaction(org.id, transfer.id, { kind: "expense", id: fuel.id })).rejects.toThrow(/לא תואמת/);
    await setTransactionIgnored(org.id, transfer.id, true);

    expect(await bankSummary(org.id)).toEqual({ unmatched: 1, matched: 1, ignored: 1 });
    // מסמך שכבר הותאם לא מוצע שוב
    const remaining = await listBankTransactions(org.id, "unmatched");
    expect(remaining.map((t) => t.id)).toEqual([fuelTx.id]);
  });

  it("links an expense created from a transaction", async () => {
    const org = await setup("bank2@example.com");
    await importBankFile(org.id, enc(STATEMENT));
    const tx = (await listBankTransactions(org.id)).find((t) => t.amount === -100000)!;
    const cat = (await listCategories(org.id))[0];
    await addExpense({
      organizationId: org.id,
      date: tx.date,
      supplierName: tx.description,
      categoryId: cat.id,
      gross: 100000,
      vat: 0,
      bankTransactionId: tx.id,
    });
    expect((await listBankTransactions(org.id)).find((t) => t.id === tx.id)?.status).toBe("matched");
  });

  it("keeps businesses apart", async () => {
    const a = await setup("bank3@example.com");
    const b = await setup("bank4@example.com");
    await importBankFile(a.id, enc(STATEMENT));
    // אותו קובץ בעסק אחר אינו "כפילות"
    expect((await importBankFile(b.id, enc(STATEMENT))).imported).toBe(3);
    const txOfA = (await listBankTransactions(a.id))[0];
    await setTransactionIgnored(b.id, txOfA.id, true);
    expect((await listBankTransactions(a.id)).find((t) => t.id === txOfA.id)?.status).toBe("unmatched");
    const docOfB = await issueDocument({
      organizationId: b.id,
      type: "tax_invoice",
      issueDate: "2026-09-01",
      customer: { name: "לקוח", isVatRegistered: false },
      lines: [{ description: "שירות", quantity: 1, unitPrice: 400000 }],
    });
    const incomeOfA = (await listBankTransactions(a.id)).find((t) => t.amount === 472000)!;
    await expect(matchTransaction(a.id, incomeOfA.id, { kind: "document", id: docOfB.id })).rejects.toThrow(/לא תואם/);
  });

  it("rejects files that are not bank statements", async () => {
    const org = await setup("bank5@example.com");
    await expect(importBankFile(org.id, enc("hello,world\n1,2"))).rejects.toThrow(/לא זוהו/);
    await expect(importBankFile(org.id, new Uint8Array())).rejects.toThrow(/ריק/);
  });
});
