import { describe, expect, it } from "vitest";
import { runAudit, type AuditInput } from "./audit";
import { allocationThresholdOn } from "./documents";

const base: AuditInput = {
  today: "2026-10-06",
  business: { chargesVat: true, yearRevenue: 0 },
  documents: [],
  expenses: [],
  bankTransactions: [],
  allocationThreshold: allocationThresholdOn,
};
const expense = (over: Partial<AuditInput["expenses"][number]> = {}) => ({
  id: "e1",
  date: "2026-09-05",
  supplierName: "פז",
  supplierTaxId: "515555555",
  referenceNumber: "100",
  gross: 59000,
  vat: 9000,
  vatDeductiblePct: 66.67,
  hasReceipt: true,
  ...over,
});
const keys = (input: Partial<AuditInput>) => runAudit({ ...base, ...input }).map((f) => f.key.split(":")[0]);

describe("runAudit", () => {
  it("finds nothing in clean books", () => {
    expect(runAudit({ ...base, expenses: [expense()] })).toEqual([]);
  });

  it("flags income that reached the bank without a document, but not fresh or handled ones", () => {
    const tx = (id: string, date: string, status = "unmatched") => ({ id, date, description: "העברה", amount: 100000, status });
    expect(
      runAudit({ ...base, bankTransactions: [tx("t1", "2026-09-01"), tx("t2", "2026-10-04"), tx("t3", "2026-09-01", "ignored")] })
        .filter((f) => f.key.startsWith("unreported-income"))
        .map((f) => f.key),
    ).toEqual(["unreported-income:t1"]);
  });

  it("flags deducted VAT without a valid supplier tax id, only for VAT-registered businesses", () => {
    expect(keys({ expenses: [expense({ supplierTaxId: null })] })).toContain("vat-no-supplier-id");
    expect(keys({ expenses: [expense({ supplierTaxId: "123456789" })] })).toContain("vat-no-supplier-id");
    expect(keys({ business: { chargesVat: false, yearRevenue: 0 }, expenses: [expense({ supplierTaxId: null })] })).not.toContain(
      "vat-no-supplier-id",
    );
  });

  it("flags VAT that does not fit the rate, duplicates, missing receipts and future dates", () => {
    expect(keys({ expenses: [expense({ vat: 2000 })] })).toContain("vat-mismatch");
    const dup = runAudit({ ...base, expenses: [expense(), expense({ id: "e2", date: "2026-09-20" })] }).find((f) =>
      f.key.startsWith("duplicate-expense"),
    );
    expect(dup).toMatchObject({ severity: "error", key: "duplicate-expense:e1,e2" });
    expect(keys({ expenses: [expense({ hasReceipt: false })] })).toContain("no-receipt");
    expect(keys({ expenses: [expense({ hasReceipt: false, gross: 1500, vat: 229 })] })).not.toContain("no-receipt");
    expect(keys({ expenses: [expense({ date: "2026-12-01" })] })).toContain("future-expense");
  });

  it("checks allocation numbers, overdue invoices and the osek patur ceiling", () => {
    const doc = {
      id: "d1",
      type: "tax_invoice",
      number: 1,
      issueDate: "2026-07-01",
      customerName: "לקוח",
      customerTaxId: "515555555",
      net: 600000,
      gross: 708000,
      allocationRequired: false,
      allocationNumber: null,
      paidAt: null,
    };
    expect(keys({ documents: [doc] })).toEqual(expect.arrayContaining(["allocation-check", "overdue"]));
    expect(keys({ documents: [{ ...doc, allocationRequired: true }] })).toContain("missing-allocation");
    const near = runAudit({ ...base, business: { chargesVat: false, ceilingShekels: 120_000, yearRevenue: 10_500_000 } });
    expect(near[0]).toMatchObject({ severity: "warning", title: expect.stringContaining("88%") });
    const over = runAudit({ ...base, business: { chargesVat: false, ceilingShekels: 120_000, yearRevenue: 12_500_000 } });
    expect(over[0].severity).toBe("error");
  });

  it("orders errors first", () => {
    const sev = runAudit({ ...base, expenses: [expense({ supplierTaxId: null, hasReceipt: false })] }).map((f) => f.severity);
    expect(sev).toEqual([...sev].sort((a, b) => ["error", "warning", "info"].indexOf(a) - ["error", "warning", "info"].indexOf(b)));
  });
});
