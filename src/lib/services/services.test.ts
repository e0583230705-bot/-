import { describe, expect, it } from "vitest";
import { createOrganization, ValidationError } from "./organizations";
import { claimOriginal, getDocument, issueDocument, listDocuments } from "./documents";
import { addExpense, listCategories } from "./expenses";
import { profitAndLoss, vatReport } from "./reports";
import { registerUser } from "./auth";

let n = 0;
const newUser = () =>
  registerUser({ email: `user${++n}@example.com`, name: "בודק", password: "correct horse battery" });

const customer = { name: "לקוח בע\"מ", taxId: "515555555", isVatRegistered: true };

describe("services (in-memory Postgres)", () => {
  it("rejects an invalid tax id", async () => {
    await expect(
      createOrganization({ ownerUserId: (await newUser()).id, name: "x", businessType: "osek_murshe", taxId: "123456789" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("runs a full osek murshe flow", async () => {
    const org = await createOrganization({
      ownerUserId: (await newUser()).id,
      name: "סטודיו דוגמה",
      businessType: "osek_murshe",
      taxId: "123456782",
    });
    expect(org.vatFrequency).toBe("bimonthly");

    const d1 = await issueDocument({
      organizationId: org.id,
      type: "tax_invoice",
      issueDate: "2026-09-01",
      customer,
      lines: [{ description: "עיצוב לוגו", quantity: 2, unitPrice: 300000 }],
    });
    expect(d1.number).toBe(1);
    expect(d1.vat).toBe(108000);
    expect(d1.allocationRequired).toBe(true);

    const d2 = await issueDocument({
      organizationId: org.id,
      type: "tax_invoice",
      issueDate: "2026-09-10",
      customer: { name: "לקוח פרטי", isVatRegistered: false },
      lines: [{ description: "ייעוץ", quantity: 1, unitPrice: 50000 }],
    });
    expect(d2.number).toBe(2);
    expect(d2.allocationRequired).toBe(false);

    await expect(
      issueDocument({
        organizationId: org.id,
        type: "tax_invoice",
        issueDate: "2026-08-01",
        customer,
        lines: [{ description: "x", quantity: 1, unitPrice: 100 }],
      }),
    ).rejects.toThrow(/מוקדם/);

    const cats = await listCategories(org.id);
    const vehicle = cats.find((c) => c.key === "vehicle")!;
    await addExpense({
      organizationId: org.id,
      date: "2026-09-05",
      supplierName: "תחנת דלק",
      categoryId: vehicle.id,
      gross: 59000,
      vat: 9000,
    });

    const period = { from: "2026-09-01", to: "2026-10-31" };
    const vat = await vatReport(org.id, period);
    expect(vat.outputVat).toBe(108000 + 9000);
    expect(vat.inputVat).toBe(6000); // 2/3 מ־9000
    const pl = await profitAndLoss(org.id, period);
    expect(pl.revenue).toBe(650000);
    expect(pl.recognizedExpenses).toBe(Math.round((50000 + 3000) * 0.45));
    expect(await listDocuments(org.id)).toHaveLength(2);

    // מקור מופק פעם אחת בלבד, ומסמך של עסק אחר לא נגיש
    const userId = (await newUser()).id;
    expect(await claimOriginal(org.id, d1.id, userId)).toBe(true);
    expect(await claimOriginal(org.id, d1.id, userId)).toBe(false);
    const loaded = await getDocument(org.id, d1.id);
    expect(loaded?.lines[0].description).toBe("עיצוב לוגו");
    expect(loaded?.doc.originalDeliveredAt).toBeInstanceOf(Date);
    const otherOrg = await createOrganization({
      ownerUserId: userId,
      name: "אחר",
      businessType: "company",
      taxId: "123456782",
    });
    expect(await getDocument(otherOrg.id, d1.id)).toBeNull();
    expect(await claimOriginal(otherOrg.id, d2.id, userId)).toBe(false);
  });

  it("enforces document types per business type and isolates tenants", async () => {
    const patur = await createOrganization({
      ownerUserId: (await newUser()).id,
      name: "עוסק פטור",
      businessType: "osek_patur",
      taxId: "000000018",
    });
    await expect(
      issueDocument({
        organizationId: patur.id,
        type: "tax_invoice",
        issueDate: "2026-09-01",
        customer,
        lines: [{ description: "x", quantity: 1, unitPrice: 100 }],
      }),
    ).rejects.toThrow(/אינו רשאי/);

    const receipt = await issueDocument({
      organizationId: patur.id,
      type: "receipt",
      issueDate: "2026-09-01",
      customer,
      lines: [{ description: "שיעור פרטי", quantity: 1, unitPrice: 20000 }],
    });
    expect(receipt.vat).toBe(0);
    expect(receipt.number).toBe(1);

    const other = await createOrganization({
      ownerUserId: (await newUser()).id,
      name: "עסק אחר",
      businessType: "company",
      taxId: "123456782",
    });
    const foreignCategory = (await listCategories(other.id))[0];
    await expect(
      addExpense({
        organizationId: patur.id,
        date: "2026-09-01",
        supplierName: "ספק",
        categoryId: foreignCategory.id,
        gross: 1000,
        vat: 0,
      }),
    ).rejects.toThrow(/קטגוריה/);
  });
});
