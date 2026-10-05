import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { describe, expect, it } from "vitest";
import { documentTitle, escapeHtml, renderDocumentHtml, type DocumentForPrint } from "./document-html";
import { htmlToPdf } from "./render";

const base: DocumentForPrint = {
  org: {
    name: "סטודיו דוגמה",
    businessType: "osek_murshe",
    taxId: "123456782",
    address: "הרצל 1, תל אביב",
    phone: "050-1234567",
    email: "studio@example.com",
  },
  doc: {
    type: "tax_invoice",
    number: 7,
    issueDate: "2026-10-05",
    customerName: "לקוח בע\"מ",
    customerTaxId: "515555555",
    net: 1000000,
    vat: 180000,
    gross: 1180000,
    vatRate: 18,
    allocationNumber: "123456789",
    notes: null,
  },
  lines: [{ position: 1, description: "פיתוח אתר", quantity: 2, unitPrice: 500000, lineNet: 1000000 }],
  mark: "original",
};

describe("document template", () => {
  it("includes the details a tax invoice must show", () => {
    const html = renderDocumentHtml(base);
    for (const text of [
      "סטודיו דוגמה",
      "עוסק מורשה מס'",
      "123456782",
      "חשבונית מס",
      "0007",
      "05/10/2026",
      "לקוח בע&quot;מ",
      "515555555",
      "פיתוח אתר",
      "מע\"מ",
      "18%",
      "11,800.00",
      "מספר הקצאה",
      "מקור",
    ]) {
      expect(html).toContain(text);
    }
  });

  it("marks copies and hides VAT for documents without VAT", () => {
    const html = renderDocumentHtml({
      ...base,
      org: { ...base.org, businessType: "osek_patur" },
      doc: { ...base.doc, type: "receipt", vat: 0, gross: 1000000, vatRate: 0, allocationNumber: null },
      mark: "copy",
    });
    expect(html).toContain("העתק נאמן למקור");
    expect(html).toContain("עוסק פטור מס'");
    expect(html).not.toContain("מע\"מ");
    expect(html).not.toContain("מספר הקצאה");
  });

  it("escapes user input", () => {
    const html = renderDocumentHtml({
      ...base,
      doc: { ...base.doc, customerName: "<script>alert(1)</script>", notes: "<img src=x onerror=alert(1)>" },
    });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(escapeHtml(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  });

  it("pads document numbers", () => {
    expect(documentTitle("receipt", 12)).toBe("קבלה 0012");
  });
});

const hasChromium = (() => {
  try {
    return existsSync(process.env.CHROMIUM_PATH || chromium.executablePath());
  } catch {
    return false;
  }
})();

describe.skipIf(!hasChromium)("pdf rendering", () => {
  it("produces a valid PDF", async () => {
    const pdf = await htmlToPdf(renderDocumentHtml(base));
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  }, 30_000);
});
