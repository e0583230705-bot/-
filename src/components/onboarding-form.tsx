"use client";

import { useActionState, useState } from "react";
import { createOrganizationAction, type FormState } from "@/app/actions";
import { BUSINESS_TYPES, type BusinessType } from "@/lib/domain/business-types";
import { FormError } from "./form-error";

export function OnboardingForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createOrganizationAction, {});
  const [type, setType] = useState<BusinessType>("osek_murshe");
  const profile = BUSINESS_TYPES[type];

  return (
    <form action={action} className="space-y-5">
      <fieldset>
        <legend className="label">סוג העסק</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.values(BUSINESS_TYPES).map((p) => (
            <label
              key={p.type}
              className={`cursor-pointer rounded-lg border p-3 ${
                type === p.type ? "border-brand bg-brand-soft" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="businessType"
                value={p.type}
                checked={type === p.type}
                onChange={() => setType(p.type)}
                className="sr-only"
              />
              <span className="block font-semibold">{p.label}</span>
              <span className="text-sm text-muted">{p.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">שם העסק</label>
          <input id="name" name="name" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="taxId">
            {type === "company" || type === "nonprofit" ? "מספר ח.פ. / עמותה" : "מספר עוסק / ת.ז."}
          </label>
          <input id="taxId" name="taxId" required inputMode="numeric" className="input num" />
        </div>
        {profile.chargesVat && (
          <div>
            <label className="label" htmlFor="vatFrequency">תדירות דיווח מע&quot;מ</label>
            <select
              id="vatFrequency"
              name="vatFrequency"
              defaultValue={profile.defaultVatFrequency}
              key={type}
              className="input"
            >
              <option value="monthly">חודשי</option>
              <option value="bimonthly">דו־חודשי</option>
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">אימייל</label>
          <input id="email" name="email" type="email" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="phone">טלפון</label>
          <input id="phone" name="phone" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="address">כתובת</label>
          <input id="address" name="address" className="input" />
        </div>
      </div>

      <FormError message={state.error} />
      <button className="btn" disabled={pending}>
        {pending ? "יוצר..." : "יצירת העסק"}
      </button>
    </form>
  );
}
