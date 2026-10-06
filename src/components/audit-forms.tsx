"use client";

import type { FormState } from "@/app/actions";
import { createEngagementAction } from "@/app/actions";
import { MATERIALITY_BASES } from "@/lib/domain/ledger/materiality";
import { FormError } from "./form-error";
import { useFormAction } from "./submit";

export function CreateEngagementForm({ defaultYear }: { defaultYear: number }) {
  const [state, action, pending, ready] = useFormAction<FormState>(createEngagementAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <input name="clientName" placeholder="שם הלקוח המבוקר" aria-label="שם הלקוח המבוקר" required className="input" />
        <input name="clientTaxId" placeholder="ח.פ. / מספר עוסק" aria-label="ח.פ." inputMode="numeric" className="input num" />
        <input
          name="fiscalYear"
          type="number"
          defaultValue={defaultYear}
          aria-label="שנת הדוח"
          min={2000}
          max={2100}
          required
          className="input num"
        />
        <button className="btn" disabled={pending || !ready}>
          פתיחת תיק
        </button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}

export function LedgerImportForm({
  action: serverAction,
  label = "קליטת הנתונים",
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  label?: string;
}) {
  const [state, action, pending, ready] = useFormAction<FormState>(serverAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".csv,.txt,text/csv,text/plain"
          multiple
          required
          aria-label="קובצי הנהלת החשבונות"
          className="text-sm file:me-3 file:rounded-lg file:border file:border-border file:bg-bg file:px-3 file:py-2 file:text-sm"
        />
        <button className="btn" disabled={pending || !ready}>
          {pending ? "קולט..." : label}
        </button>
      </div>
      <FormError message={state.error} />
      {state.message && <p className="text-sm text-brand">{state.message}</p>}
    </form>
  );
}

export function MaterialityForm({
  action: serverAction,
  initial,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  initial: { basis: string | null; base: number | null; pct: number | null };
}) {
  const [state, action, pending, ready] = useFormAction<FormState>(serverAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem_auto]">
        <select name="basis" defaultValue={initial.basis ?? "profit_before_tax"} aria-label="בסיס" className="input">
          {Object.entries(MATERIALITY_BASES).map(([key, b]) => (
            <option key={key} value={key}>
              {b.label} ({b.defaultPct}%)
            </option>
          ))}
        </select>
        <input
          name="base"
          inputMode="decimal"
          placeholder="סכום הבסיס בש״ח"
          aria-label="סכום הבסיס"
          defaultValue={initial.base ? (initial.base / 100).toFixed(2) : ""}
          required
          className="input num"
        />
        <input
          name="pct"
          inputMode="decimal"
          aria-label="אחוז"
          defaultValue={initial.pct ?? 5}
          required
          className="input num"
        />
        <button className="btn-ghost" disabled={pending || !ready}>
          חישוב
        </button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}

export function NoteForm({
  action: serverAction,
  initial,
  meta,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  initial?: string;
  meta?: string;
}) {
  const [state, action, pending, ready] = useFormAction<FormState>(serverAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-1">
      <div className="flex gap-2">
        <textarea
          name="text"
          rows={1}
          defaultValue={initial}
          placeholder="הסבר לשינוי ומה נבדק"
          aria-label="הסבר"
          className="input min-h-9 text-xs"
        />
        <button className="btn-ghost text-xs" disabled={pending || !ready}>
          {pending ? "..." : "שמירה"}
        </button>
      </div>
      {meta && <p className="text-[11px] text-muted">{meta}</p>}
      {state.ok && !pending && <p className="text-[11px] text-brand">נשמר</p>}
      <FormError message={state.error} />
    </form>
  );
}
