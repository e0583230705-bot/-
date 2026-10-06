"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions";
import { FormError } from "./form-error";
import { submitKeepingValues } from "./submit";

export interface CustomerValues {
  name: string;
  taxId: string | null;
  isVatRegistered: boolean;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export function CustomerForm({
  action: serverAction,
  initial,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial?: CustomerValues;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(serverAction, {});
  return (
    <form onSubmit={submitKeepingValues(action)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">שם הלקוח</label>
          <input id="name" name="name" defaultValue={initial?.name} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="taxId">מספר עוסק / ח.פ.</label>
          <input id="taxId" name="taxId" defaultValue={initial?.taxId ?? ""} inputMode="numeric" className="input num" />
        </div>
        <div>
          <label className="label" htmlFor="email">אימייל</label>
          <input id="email" name="email" type="email" defaultValue={initial?.email ?? ""} className="input num" />
        </div>
        <div>
          <label className="label" htmlFor="phone">טלפון</label>
          <input id="phone" name="phone" defaultValue={initial?.phone ?? ""} className="input num" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="address">כתובת</label>
          <input id="address" name="address" defaultValue={initial?.address ?? ""} className="input" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isVatRegistered" defaultChecked={initial?.isVatRegistered} />
        הלקוח הוא עוסק מורשה / חברה
      </label>
      <FormError message={state.error} />
      <button className="btn" disabled={pending}>
        {pending ? "שומר..." : submitLabel}
      </button>
    </form>
  );
}
