import { describe, expect, it } from "vitest";
import { registerUser } from "./auth";
import { createOrganization } from "./organizations";
import { addExpense, listCategories } from "./expenses";
import { getPendingReceipt, getReceiptFile, receiptsForExpenses, uploadReceipt } from "./receipts";
import { ReceiptExtractionError } from "@/lib/ai/receipt";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

async function setup(email: string) {
  const user = await registerUser({ email, name: "x", password: "correct horse battery" });
  const org = await createOrganization({ ownerUserId: user.id, name: "עסק", businessType: "osek_murshe", taxId: "123456782" });
  return { user, org };
}

const fakeExtract = async () => ({
  is_receipt: true,
  supplier_name: "פז",
  supplier_tax_id: "515555555",
  document_number: "1",
  date: "2026-09-05",
  total_amount: "590",
  vat_amount: "90",
  currency: "ILS",
  category_key: "vehicle",
  description: "דלק",
});

describe("receipts", () => {
  it("stores the file, prefills from the extraction and attaches to the expense once", async () => {
    const { user, org } = await setup("rcpt1@example.com");
    const up = await uploadReceipt(org.id, user.id, { name: "fuel.jpg", bytes: JPEG }, fakeExtract);
    expect(up.extractionStatus).toBe("done");

    const pending = await getPendingReceipt(org.id, up.id, "2026-10-06");
    const vehicle = (await listCategories(org.id)).find((c) => c.key === "vehicle")!;
    expect(pending?.prefill).toMatchObject({ supplierName: "פז", gross: 59000, vat: 9000 });
    expect(pending?.categoryId).toBe(vehicle.id);

    const expense = await addExpense({
      organizationId: org.id,
      date: "2026-09-05",
      supplierName: "פז",
      categoryId: vehicle.id,
      gross: 59000,
      vat: 9000,
      receiptId: up.id,
    });
    expect((await receiptsForExpenses(org.id)).get(expense.id)).toBe(up.id);
    expect(await getPendingReceipt(org.id, up.id, "2026-10-06")).toBeNull();
    await expect(
      addExpense({ organizationId: org.id, date: "2026-09-05", supplierName: "x", categoryId: vehicle.id, gross: 100, vat: 0, receiptId: up.id }),
    ).rejects.toThrow(/כבר שויכה/);
    // הוצאה שנכשלה לא נשמרה (הכול בטרנזקציה אחת)
    expect((await receiptsForExpenses(org.id)).size).toBe(1);
  });

  it("keeps the file when extraction fails, and works without AI at all", async () => {
    const { user, org } = await setup("rcpt2@example.com");
    const failed = await uploadReceipt(org.id, user.id, { name: "r.jpg", bytes: JPEG }, async () => {
      throw new ReceiptExtractionError("שירות זיהוי הקבלות לא זמין כרגע");
    });
    expect(failed).toMatchObject({ extractionStatus: "failed", error: "שירות זיהוי הקבלות לא זמין כרגע" });
    expect((await getReceiptFile(org.id, failed.id))?.data.length).toBe(JPEG.length);

    const manual = await uploadReceipt(org.id, user.id, { name: "r.jpg", bytes: JPEG });
    expect(manual.extractionStatus).toBe("none");
    expect((await getPendingReceipt(org.id, manual.id, "2026-10-06"))?.prefill).toEqual({ warnings: [] });
  });

  it("rejects non-receipt files and keeps businesses apart", async () => {
    const a = await setup("rcpt3@example.com");
    const b = await setup("rcpt4@example.com");
    await expect(uploadReceipt(a.org.id, a.user.id, { name: "x.html", bytes: new TextEncoder().encode("<html>") })).rejects.toThrow(/תמונה/);
    const up = await uploadReceipt(a.org.id, a.user.id, { name: "r.jpg", bytes: JPEG });
    expect(await getReceiptFile(b.org.id, up.id)).toBeNull();
    expect(await getPendingReceipt(b.org.id, up.id, "2026-10-06")).toBeNull();
    const catB = (await listCategories(b.org.id))[0];
    await expect(
      addExpense({ organizationId: b.org.id, date: "2026-09-05", supplierName: "x", categoryId: catB.id, gross: 100, vat: 0, receiptId: up.id }),
    ).rejects.toThrow(/כבר שויכה/);
  });
});
