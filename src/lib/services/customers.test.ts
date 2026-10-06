import { describe, expect, it } from "vitest";
import { registerUser } from "./auth";
import { createOrganization } from "./organizations";
import { issueDocument } from "./documents";
import { createCustomer, getCustomer, listCustomerDocuments, listCustomers, updateCustomer } from "./customers";

async function setup(email: string) {
  const user = await registerUser({ email, name: "x", password: "correct horse battery" });
  return createOrganization({ ownerUserId: user.id, name: "עסק", businessType: "osek_murshe", taxId: "123456782" });
}

const line = [{ description: "שירות", quantity: 1, unitPrice: 100000 }];

describe("customers", () => {
  it("validates customer details", async () => {
    const org = await setup("cust1@example.com");
    await expect(createCustomer(org.id, { name: " ", isVatRegistered: false })).rejects.toThrow(/שם/);
    await expect(createCustomer(org.id, { name: "x", taxId: "123456789", isVatRegistered: false })).rejects.toThrow(
      /לא תקין/,
    );
    await expect(createCustomer(org.id, { name: "x", isVatRegistered: true })).rejects.toThrow(/מספר עוסק/);
  });

  it("links documents, totals billing and keeps issued documents unchanged on edit", async () => {
    const org = await setup("cust2@example.com");
    const c = await createCustomer(org.id, { name: "לקוח א", taxId: "515555555", isVatRegistered: true });
    await issueDocument({
      organizationId: org.id,
      type: "tax_invoice",
      issueDate: "2026-09-01",
      customer: { id: c.id, name: c.name, taxId: c.taxId!, isVatRegistered: true },
      lines: line,
    });
    await issueDocument({
      organizationId: org.id,
      type: "credit_note",
      issueDate: "2026-09-02",
      customer: { id: c.id, name: c.name, isVatRegistered: true },
      lines: [{ description: "זיכוי", quantity: 1, unitPrice: 20000 }],
    });

    const [row] = await listCustomers(org.id);
    expect(row.documentCount).toBe(2);
    expect(row.billed).toBe(118000 - 23600);
    expect(row.lastDocument).toBe("2026-09-02");

    await updateCustomer(org.id, c.id, { name: "לקוח א בע\"מ", taxId: "515555555", isVatRegistered: true });
    expect((await getCustomer(org.id, c.id))?.name).toBe("לקוח א בע\"מ");
    const docs = await listCustomerDocuments(org.id, c.id);
    expect(docs.map((d) => d.customerName)).toEqual(["לקוח א", "לקוח א"]);
  });

  it("saves a new customer together with the document, only if the document is issued", async () => {
    const org = await setup("cust3@example.com");
    await issueDocument({
      organizationId: org.id,
      type: "tax_invoice",
      issueDate: "2026-09-10",
      customer: { name: "לקוח חדש", isVatRegistered: false },
      lines: line,
      saveCustomer: true,
    });
    // מסמך שנכשל (תאריך מוקדם) לא משאיר לקוח יתום
    await expect(
      issueDocument({
        organizationId: org.id,
        type: "tax_invoice",
        issueDate: "2026-09-01",
        customer: { name: "לקוח שנכשל", isVatRegistered: false },
        lines: line,
        saveCustomer: true,
      }),
    ).rejects.toThrow(/מוקדם/);
    const names = (await listCustomers(org.id)).map((r) => r.customer.name);
    expect(names).toEqual(["לקוח חדש"]);
  });

  it("does not let one business use or see another business's customers", async () => {
    const a = await setup("cust4@example.com");
    const b = await setup("cust5@example.com");
    const c = await createCustomer(a.id, { name: "של א", isVatRegistered: false });
    expect(await getCustomer(b.id, c.id)).toBeNull();
    await expect(updateCustomer(b.id, c.id, { name: "חטיפה", isVatRegistered: false })).rejects.toThrow(/לא נמצא/);
    await expect(
      issueDocument({
        organizationId: b.id,
        type: "tax_invoice",
        issueDate: "2026-09-01",
        customer: { id: c.id, name: "של א", isVatRegistered: false },
        lines: line,
      }),
    ).rejects.toThrow(/לא נמצא/);
  });
});
