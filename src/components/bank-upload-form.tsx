"use client";

import { useActionState, useRef } from "react";
import { importBankFileAction, type FormState } from "@/app/actions";
import { FormError } from "./form-error";
import { submitKeepingValues } from "./submit";

export function BankUploadForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await importBankFileAction(prev, formData);
    if (result.ok) formRef.current?.reset();
    return result;
  }, {});

  return (
    <form ref={formRef} onSubmit={submitKeepingValues(action)} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv,text/plain"
          required
          aria-label="קובץ תנועות"
          className="text-sm file:me-3 file:rounded-lg file:border file:border-border file:bg-bg file:px-3 file:py-2 file:text-sm"
        />
        <button className="btn" disabled={pending}>
          {pending ? "מייבא..." : "ייבוא תנועות"}
        </button>
      </div>
      <FormError message={state.error} />
      {state.message && <p className="text-sm text-brand">{state.message}</p>}
    </form>
  );
}
