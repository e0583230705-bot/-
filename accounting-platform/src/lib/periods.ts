import type { VatFrequency } from "@/lib/domain/business-types";
import { reportingPeriods } from "@/lib/domain/tax-calendar";

/** תקופת הדיווח שמכילה את התאריך הנתון */
export function periodContaining(date: string, frequency: VatFrequency) {
  const year = Number(date.slice(0, 4));
  return reportingPeriods(year, frequency).find((p) => date >= p.from && date <= p.to) ?? null;
}
