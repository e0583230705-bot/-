import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { parseReceiptResponse, receiptRequest, ReceiptExtractionError } from "./receipt";

const categories = [{ key: "vehicle", label: "רכב" }];

function message(partial: Partial<Anthropic.Beta.BetaMessage>): Anthropic.Beta.BetaMessage {
  return { stop_reason: "end_turn", content: [], ...partial } as unknown as Anthropic.Beta.BetaMessage;
}

describe("receipt request", () => {
  it("sends images and PDFs as the right content blocks with a strict schema", () => {
    const img = receiptRequest(new Uint8Array([1, 2, 3]), "image/jpeg", categories);
    expect(img.model).toBe("claude-opus-5-5");
    expect(img.fallbacks).toBe("default");
    expect(img.betas).toEqual(["server-side-fallback-2026-07-01"]);
    const [file, text] = img.messages[0].content as Anthropic.Beta.BetaContentBlockParam[];
    expect(file).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AQID" } });
    expect(text).toMatchObject({ type: "text" });
    const schema = img.output_config.format.schema as { required: string[]; properties: Record<string, { enum?: string[] }> };
    expect(schema.required).toContain("vat_amount");
    expect(schema.properties.category_key.enum).toEqual(["vehicle", "unknown"]);

    const pdf = receiptRequest(new Uint8Array([1]), "application/pdf", categories);
    expect((pdf.messages[0].content as Anthropic.Beta.BetaContentBlockParam[])[0]).toMatchObject({
      type: "document",
      source: { media_type: "application/pdf" },
    });
  });
});

describe("parseReceiptResponse", () => {
  const valid = {
    is_receipt: true,
    supplier_name: "פז",
    supplier_tax_id: "",
    document_number: "",
    date: "2026-09-05",
    total_amount: "590",
    vat_amount: "90",
    currency: "ILS",
    category_key: "vehicle",
    description: "דלק",
  };

  it("parses the structured output", () => {
    const m = message({ content: [{ type: "text", text: JSON.stringify(valid) }] as never });
    expect(parseReceiptResponse(m)).toEqual(valid);
  });

  it("turns refusals, truncation and malformed output into readable errors", () => {
    expect(() => parseReceiptResponse(message({ stop_reason: "refusal" }))).toThrow(ReceiptExtractionError);
    expect(() => parseReceiptResponse(message({ stop_reason: "max_tokens" }))).toThrow(/לא הושלמה/);
    expect(() =>
      parseReceiptResponse(message({ content: [{ type: "text", text: '{"supplier_name": 1}' }] as never })),
    ).toThrow(/לא הייתה תקינה/);
  });
});
