"use client";

import { useRef } from "react";
import { importBankFileAction, type FormState } from "@/app/actions";
import { FormError } from "./form-error";
import { useFormAction } from "./submit";

export function BankUploadForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending, ready] = useFormAction<FormState>(async (prev, formData) => {
    const result = await importBankFileAction(prev, formData);
    if (result.ok) formRef.current?.reset();
    return result;
  }, {});

  return (
    <form ref={formRef} method="post" onSubmit={action} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv,text/plain"
          required
          aria-label="קובץ תנועות"
          className="text-sm text-muted file:me-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-brand-soft file:px-3.5 file:py-2 file:text-sm file:font-semibold file:text-brand"
        />
        <button className="btn" disabled={pending || !ready}>
          {pending ? "מייבא..." : "ייבוא תנועות"}
        </button>
      </div>
      <FormError message={state.error} />
      {state.message && <p className="text-sm text-brand">{state.message}</p>}
    </form>
  );
}
