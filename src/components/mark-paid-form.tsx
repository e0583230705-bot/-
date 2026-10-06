"use client";

import type { FormState } from "@/app/actions";
import { FormError } from "./form-error";
import { useFormAction } from "./submit";

export function MarkPaidForm({
  action: serverAction,
  today,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  today: string;
}) {
  const [state, action, pending, ready] = useFormAction<FormState>(serverAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm" htmlFor="paidAt">
          שולם בתאריך
        </label>
        <input id="paidAt" name="paidAt" type="date" defaultValue={today} required className="input w-auto" />
        <button className="btn-ghost" disabled={pending || !ready}>
          סימון כשולם
        </button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}
