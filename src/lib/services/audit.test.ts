import { describe, expect, it } from "vitest";
import { registerUser } from "./auth";
import { createOrganization } from "./organizations";
import {
  createEngagement,
  getEngagement,
  importLedger,
  listEngagements,
  loadEngagementLedger,
  redrawSample,
  setMateriality,
} from "./audit";

async function firm(email: string) {
  const user = await registerUser({ email, name: "רו\"ח", password: "correct horse battery" });
  const org = await createOrganization({ ownerUserId: user.id, name: "משרד רו\"ח", businessType: "partnership", taxId: "123456782" });
  return { user, org };
}

const LEDGER = [
  "תאריך,מספר תנועה,חשבון,שם חשבון,פרטים,חובה,זכות",
  "05/03/2026,1,1000,קופה,מכירה,1180,",
  "05/03/2026,1,4000,הכנסות,מכירה,,1000",
  "05/03/2026,1,2200,מע\"מ עסקאות,מכירה,,180",
].join("\n");
const enc = (s: string) => new TextEncoder().encode(s);

describe("audit engagements", () => {
  it("creates an engagement, imports and re-imports a ledger", async () => {
    const { user, org } = await firm("audit1@example.com");
    await expect(createEngagement(org.id, user.id, { clientName: "", fiscalYear: 2026 })).rejects.toThrow(/שם/);
    await expect(createEngagement(org.id, user.id, { clientName: "x", clientTaxId: "123456789", fiscalYear: 2026 })).rejects.toThrow(/לא תקין/);
    const e = await createEngagement(org.id, user.id, { clientName: "לקוח בע\"מ", clientTaxId: "515555555", fiscalYear: 2026 });
    expect(e.yearEnd).toBe("2026-12-31");

    expect(await importLedger(org.id, e.id, { name: "gl.csv", bytes: enc(LEDGER) })).toEqual({ accounts: 3, lines: 3, skipped: 0 });
    // קליטה חוזרת מחליפה ולא מכפילה
    await importLedger(org.id, e.id, { name: "gl2.csv", bytes: enc(LEDGER) });
    const loaded = await loadEngagementLedger(org.id, e.id);
    expect(loaded?.lines).toHaveLength(3);
    expect(loaded?.engagement.sourceFilename).toBe("gl2.csv");
    expect((await listEngagements(org.id))[0].lineCount).toBe(3);
  });

  it("validates materiality and records sample redraws", async () => {
    const { user, org } = await firm("audit2@example.com");
    const e = await createEngagement(org.id, user.id, { clientName: "לקוח", fiscalYear: 2026 });
    await expect(setMateriality(org.id, e.id, { basis: "revenue", base: 0, pct: 1 })).rejects.toThrow(/חיובי/);
    await setMateriality(org.id, e.id, { basis: "revenue", base: 100000000, pct: 1 });
    expect((await getEngagement(org.id, e.id))?.materialityBase).toBe(100000000);
    const before = e.sampleSeed;
    await redrawSample(org.id, e.id, user.id);
    expect((await getEngagement(org.id, e.id))?.sampleSeed).not.toBe(before);
  });

  it("keeps firms apart", async () => {
    const a = await firm("audit3@example.com");
    const b = await firm("audit4@example.com");
    const e = await createEngagement(a.org.id, a.user.id, { clientName: "לקוח של א", fiscalYear: 2026 });
    expect(await getEngagement(b.org.id, e.id)).toBeNull();
    expect(await loadEngagementLedger(b.org.id, e.id)).toBeNull();
    await expect(importLedger(b.org.id, e.id, { name: "x.csv", bytes: enc(LEDGER) })).rejects.toThrow(/לא נמצא/);
    await expect(setMateriality(b.org.id, e.id, { basis: "revenue", base: 1, pct: 1 })).rejects.toThrow(/לא נמצא/);
    expect(await listEngagements(b.org.id)).toHaveLength(0);
  });
});
