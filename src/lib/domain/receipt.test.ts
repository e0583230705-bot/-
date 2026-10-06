import { describe, expect, it } from "vitest";
import { normalizeReceipt, sniffReceiptType, type RawReceipt } from "./receipt";

const base: RawReceipt = {
  is_receipt: true,
  supplier_name: " פז חברת נפט בע\"מ ",
  supplier_tax_id: "51-555555-5",
  document_number: "88231",
  date: "2026-09-05",
  total_amount: "590.00",
  vat_amount: "90.00",
  currency: "ILS",
  category_key: "vehicle",
  description: "דלק 95",
};
const keys = ["vehicle", "office_supplies"];

describe("normalizeReceipt", () => {
  it("turns a clean extraction into form values", () => {
    expect(normalizeReceipt(base, keys, "2026-10-06")).toEqual({
      supplierName: 'פז חברת נפט בע"מ',
      supplierTaxId: "515555555",
      referenceNumber: "88231",
      date: "2026-09-05",
      gross: 59000,
      vat: 9000,
      categoryKey: "vehicle",
      description: "דלק 95",
      warnings: [],
    });
  });

  it("drops values it cannot trust and explains why", () => {
    const r = normalizeReceipt(
      { ...base, supplier_tax_id: "123456789", date: "2027-01-01", category_key: "made_up", vat_amount: "300" },
      keys,
      "2026-10-06",
    );
    expect(r.supplierTaxId).toBeUndefined();
    expect(r.date).toBeUndefined();
    expect(r.categoryKey).toBeUndefined();
    expect(r.warnings.join(" ")).toMatch(/מספר העוסק/);
    expect(r.warnings.join(" ")).toMatch(/תאריך/);
    expect(r.warnings.join(" ")).toMatch(/המע״מ/);
  });

  it("keeps a zero VAT and refuses to guess shekel amounts for foreign currency", () => {
    expect(normalizeReceipt({ ...base, vat_amount: "0" }, keys, "2026-10-06").vat).toBe(0);
    const usd = normalizeReceipt({ ...base, currency: "USD", total_amount: "20.00" }, keys, "2026-10-06");
    expect(usd.gross).toBeUndefined();
    expect(usd.warnings.join(" ")).toMatch(/USD/);
  });

  it("flags documents that are not receipts", () => {
    expect(normalizeReceipt({ ...base, is_receipt: false }, keys, "2026-10-06").warnings[0]).toMatch(/אינו קבלה/);
  });
});

describe("sniffReceiptType", () => {
  it("detects files by content, not by name", () => {
    expect(sniffReceiptType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffReceiptType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(sniffReceiptType(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffReceiptType(new TextEncoder().encode("RIFF\0\0\0\0WEBP"))).toBe("image/webp");
    expect(sniffReceiptType(new TextEncoder().encode("<html><script>"))).toBeNull();
  });
});
