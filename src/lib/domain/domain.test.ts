import { describe, expect, it } from "vitest";
import { applyPercent, formatILS, parseShekels, toAgorot } from "./money";
import { addVat, splitGross, vatRateOn } from "./vat";
import { isValidIsraeliId } from "./israeli-id";
import {
  allocationThresholdOn,
  documentRecordsIncome,
  requiresAllocationNumber,
} from "./documents";
import { computeProfitAndLoss, computeVatReport } from "./reports";
import { BUSINESS_TYPES } from "./business-types";
import { buildTaxCalendar, reportingPeriods, shiftFromWeekend } from "./tax-calendar";

describe("money", () => {
  it("parses user input to agorot", () => {
    expect(parseShekels("1,234.50")).toBe(123450);
    expect(parseShekels("₪99")).toBe(9900);
    expect(parseShekels("abc")).toBeNull();
    expect(parseShekels("1.234")).toBeNull();
  });
  it("avoids floating point drift", () => {
    expect(toAgorot(0.1 + 0.2)).toBe(30);
    expect(applyPercent(1000, 66.67)).toBe(667);
  });
  it("formats shekels", () => {
    expect(formatILS(123450)).toContain("1,234.50");
  });
});

describe("vat", () => {
  it("knows the rate by date", () => {
    expect(vatRateOn("2024-12-31")).toBe(17);
    expect(vatRateOn("2025-01-01")).toBe(18);
  });
  it("adds and splits VAT consistently", () => {
    expect(addVat(10000, 18)).toEqual({ net: 10000, vat: 1800, gross: 11800, rate: 18 });
    const s = splitGross(11800, 18);
    expect(s.net).toBe(10000);
    expect(s.vat).toBe(1800);
    const odd = splitGross(999, 18);
    expect(odd.net + odd.vat).toBe(999);
  });
});

describe("israeli id", () => {
  it("validates check digit", () => {
    expect(isValidIsraeliId("123456782")).toBe(true);
    expect(isValidIsraeliId("000000018")).toBe(true);
    expect(isValidIsraeliId("123456789")).toBe(false);
    expect(isValidIsraeliId("12a")).toBe(false);
  });
});

describe("documents", () => {
  it("applies the allocation number schedule", () => {
    expect(allocationThresholdOn("2024-01-01")).toBeNull();
    expect(allocationThresholdOn("2026-03-01")).toBe(10_000);
    expect(allocationThresholdOn("2026-10-05")).toBe(5_000);
  });
  it("requires allocation only for large tax invoices to VAT-registered customers", () => {
    const base = { type: "tax_invoice" as const, issueDate: "2026-10-05", customerIsVatRegistered: true };
    expect(requiresAllocationNumber({ ...base, net: 600_000 })).toBe(true);
    expect(requiresAllocationNumber({ ...base, net: 400_000 })).toBe(false);
    expect(requiresAllocationNumber({ ...base, net: 600_000, customerIsVatRegistered: false })).toBe(false);
    expect(requiresAllocationNumber({ ...base, type: "receipt", net: 600_000 })).toBe(false);
  });
  it("decides which document records income", () => {
    expect(documentRecordsIncome("receipt", false)).toBe(true);
    expect(documentRecordsIncome("receipt", true)).toBe(false);
    expect(documentRecordsIncome("tax_invoice", true)).toBe(true);
  });
});

describe("reports", () => {
  const period = { from: "2026-01-01", to: "2026-02-28" };
  const income = [
    { date: "2026-01-10", net: 100000, vat: 18000, isCredit: false },
    { date: "2026-02-10", net: 20000, vat: 3600, isCredit: true },
    { date: "2026-03-01", net: 999999, vat: 1, isCredit: false },
  ];
  const expenses = [
    { date: "2026-01-15", net: 10000, vat: 1800, taxDeductiblePct: 100, vatDeductiblePct: 100 },
    { date: "2026-01-20", net: 30000, vat: 5400, taxDeductiblePct: 45, vatDeductiblePct: 66.67 },
  ];
  it("computes VAT due", () => {
    const r = computeVatReport(period, income, expenses);
    expect(r.salesNet).toBe(80000);
    expect(r.outputVat).toBe(14400);
    expect(r.inputVat).toBe(1800 + 3600);
    expect(r.vatDue).toBe(14400 - 5400);
  });
  it("computes profit with partial recognition", () => {
    const pl = computeProfitAndLoss(period, income, expenses);
    expect(pl.revenue).toBe(80000);
    // רכב: 45% מ־(30000 + 1800 מע"מ שלא קוזז) = 14310
    expect(pl.recognizedExpenses).toBe(10000 + 14310);
    expect(pl.profit).toBe(80000 - 24310);
  });
});

describe("tax calendar", () => {
  it("builds reporting periods", () => {
    expect(reportingPeriods(2026, "bimonthly")).toHaveLength(6);
    expect(reportingPeriods(2026, "monthly")[1].to).toBe("2026-02-28");
    expect(reportingPeriods(2028, "monthly")[1].to).toBe("2028-02-29");
  });
  it("moves weekend deadlines to Sunday", () => {
    expect(shiftFromWeekend("2026-08-15")).toBe("2026-08-16"); // שבת
    expect(shiftFromWeekend("2026-05-15")).toBe("2026-05-17"); // שישי
    expect(shiftFromWeekend("2026-10-15")).toBe("2026-10-15"); // חמישי
  });
  it("gives an osek patur no VAT deadlines", () => {
    const cal = buildTaxCalendar(2026, BUSINESS_TYPES.osek_patur, "none");
    expect(cal.some((d) => d.kind === "vat")).toBe(false);
    expect(cal.some((d) => d.kind === "national_insurance")).toBe(true);
  });
  it("gives a company monthly VAT and no self-employed national insurance", () => {
    const cal = buildTaxCalendar(2026, BUSINESS_TYPES.company, "monthly");
    expect(cal.filter((d) => d.kind === "vat")).toHaveLength(12);
    expect(cal.some((d) => d.kind === "national_insurance")).toBe(false);
    expect(cal.at(-1)?.kind).toBe("annual_report");
  });
});

describe("annual breakdowns", async () => {
  const { monthlyBreakdown, expensesByCategory } = await import("./reports");
  const income = [
    { date: "2026-01-10", net: 100000, vat: 18000, isCredit: false },
    { date: "2026-03-05", net: 50000, vat: 9000, isCredit: false },
  ];
  const expenses = [
    { date: "2026-01-15", category: "ציוד", net: 10000, vat: 1800, taxDeductiblePct: 100, vatDeductiblePct: 100 },
    { date: "2026-03-20", category: "רכב", net: 30000, vat: 5400, taxDeductiblePct: 45, vatDeductiblePct: 66.67 },
    { date: "2026-03-21", category: "ציוד", net: 5000, vat: 900, taxDeductiblePct: 100, vatDeductiblePct: 100 },
  ];
  it("splits the year by month and sums back to the annual totals", () => {
    const months = monthlyBreakdown(2026, income, expenses);
    expect(months).toHaveLength(12);
    expect(months[0]).toMatchObject({ month: 1, revenue: 100000, recognizedExpenses: 10000, outputVat: 18000, inputVat: 1800 });
    expect(months[1].revenue).toBe(0);
    const annual = computeProfitAndLoss({ from: "2026-01-01", to: "2026-12-31" }, income, expenses);
    expect(months.reduce((s, m) => s + m.profit, 0)).toBe(annual.profit);
  });
  it("groups expenses by category, largest recognized first", () => {
    const rows = expensesByCategory({ from: "2026-01-01", to: "2026-12-31" }, expenses);
    expect(rows.map((r) => r.category)).toEqual(["ציוד", "רכב"]);
    expect(rows[0]).toMatchObject({ total: 17700, recognized: 15000, count: 2 });
    expect(rows[1].recognized).toBe(14310);
  });
});

describe("supplier memory", async () => {
  const { findKnownSupplier, normalizeSupplierName } = await import("./suppliers");
  const suppliers = [
    { name: "פז", categoryId: "vehicle", supplierTaxId: "515555555" },
    { name: "אופיס דיפו בע\"מ", categoryId: "office", supplierTaxId: null },
    { name: "Google", categoryId: "software", supplierTaxId: null },
  ];
  it("normalizes names", () => {
    expect(normalizeSupplierName(' אופיס-דיפו  בע"מ ')).toBe("אופיס דיפו");
    expect(normalizeSupplierName("Google Ltd.")).toBe("google");
  });
  it("finds suppliers by exact name or as a whole word inside a bank description", () => {
    expect(findKnownSupplier("אופיס דיפו", suppliers)?.categoryId).toBe("office");
    expect(findKnownSupplier("פז חברת נפט בע\"מ", suppliers)?.categoryId).toBe("vehicle");
    expect(findKnownSupplier("GOOGLE*WORKSPACE", suppliers)?.categoryId).toBe("software");
    // "פז" כחלק ממילה אחרת אינו התאמה
    expect(findKnownSupplier("פזורה", suppliers)).toBeNull();
    expect(findKnownSupplier("", suppliers)).toBeNull();
  });
});
