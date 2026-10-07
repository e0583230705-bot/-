"use client";

import type { FormState } from "@/app/actions";
import { PAYROLL_GROUPS, type PayrollAccountGroup, type PayrollAccountMap } from "@/lib/domain/payroll/ledger-reconciliation";
import { FormError } from "./form-error";
import { useFormAction } from "./submit";

export function PayrollImportForm({ action: serverAction, hasFile }: { action: (s: FormState, f: FormData) => Promise<FormState>; hasFile: boolean }) {
  const [state, action, pending, ready] = useFormAction<FormState>(serverAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".txt,.126,.dat,text/plain"
          required
          aria-label="קובץ 126"
          className="text-sm text-muted file:me-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-brand-soft file:px-3.5 file:py-2 file:text-sm file:font-semibold file:text-brand"
        />
        <button className="btn" disabled={pending || !ready}>
          {pending ? "קולט..." : hasFile ? "קליטה מחדש" : "קליטת קובץ 126"}
        </button>
      </div>
      <FormError message={state.error} />
      {state.message && <p className="text-sm text-brand">{state.message}</p>}
    </form>
  );
}

/** מיפוי חשבונות השכר בספרים: בחירה מרובה לכל קבוצה */
export function PayrollMappingForm({
  action: serverAction,
  accounts,
  mapping,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  accounts: { code: string; name: string }[];
  mapping: PayrollAccountMap;
}) {
  const [state, action, pending, ready] = useFormAction<FormState>(serverAction, {});
  const groups = Object.keys(PAYROLL_GROUPS) as PayrollAccountGroup[];
  return (
    <form method="post" onSubmit={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <label key={g} className="text-sm">
            <span className="label">{PAYROLL_GROUPS[g].label}</span>
            <select name={g} multiple size={4} defaultValue={mapping[g] ?? []} className="input text-xs">
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
            {PAYROLL_GROUPS[g].hint && <span className="help">{PAYROLL_GROUPS[g].hint}</span>}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted">ההצעה הראשונית לפי שמות החשבונות. אפשר לבחור כמה חשבונות (Ctrl / לחיצה ארוכה).</p>
      <button className="btn-ghost" disabled={pending || !ready}>
        שמירת המיפוי
      </button>
      <FormError message={state.error} />
      {state.ok && !pending && <p className="text-sm text-brand">נשמר</p>}
    </form>
  );
}
