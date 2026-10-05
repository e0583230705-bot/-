"use client";

import { useActionState, useState } from "react";
import { addExpenseAction, type FormState } from "@/app/actions";
import { parseShekels } from "@/lib/domain/money";
import { splitGross } from "@/lib/domain/vat";
import { FormError } from "./form-error";

export function ExpenseForm({
  categories,
  vatRate,
  canDeductVat,
  today,
}: {
  categories: { id: string; label: string }[];
  vatRate: number;
  canDeductVat: boolean;
  today: string;
}) {
  const [gross, setGross] = useState("");
  const [vat, setVat] = useState("");
  const [vatTouched, setVatTouched] = useState(false);
  // React מאפס את השדות הלא־מבוקרים אחרי שליחה מוצלחת; את המבוקרים מאפסים כאן
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await addExpenseAction(prev, formData);
    if (result.ok) {
      setGross("");
      setVat("");
      setVatTouched(false);
    }
    return result;
  }, {});

  function onGrossChange(value: string) {
    setGross(value);
    if (vatTouched) return;
    const g = parseShekels(value);
    setVat(g ? (splitGross(g, vatRate).vat / 100).toFixed(2) : "");
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="label" htmlFor="date">תאריך</label>
          <input id="date" name="date" type="date" defaultValue={today} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="supplierName">ספק</label>
          <input id="supplierName" name="supplierName" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="categoryId">קטגוריה</label>
          <select id="categoryId" name="categoryId" required className="input" defaultValue="">
            <option value="" disabled>
              בחירה...
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="gross">סכום כולל מע״מ</label>
          <input
            id="gross"
            name="gross"
            inputMode="decimal"
            value={gross}
            onChange={(e) => onGrossChange(e.target.value)}
            required
            className="input num"
          />
        </div>
        <div>
          <label className="label" htmlFor="vat">מע״מ בחשבונית</label>
          <input
            id="vat"
            name="vat"
            inputMode="decimal"
            value={vat}
            onChange={(e) => {
              setVatTouched(true);
              setVat(e.target.value);
            }}
            required
            className="input num"
          />
          <p className="mt-1 text-xs text-muted">
            מחושב אוטומטית. אם הספק פטור ממע״מ, יש להזין 0.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="referenceNumber">מספר חשבונית הספק</label>
          <input id="referenceNumber" name="referenceNumber" className="input num" />
        </div>
        <div>
          <label className="label" htmlFor="supplierTaxId">מספר עוסק של הספק</label>
          <input id="supplierTaxId" name="supplierTaxId" inputMode="numeric" className="input num" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">תיאור</label>
          <input id="description" name="description" className="input" />
        </div>
      </div>
      {!canDeductVat && (
        <p className="text-xs text-muted">העסק אינו מקזז מע״מ, ולכן המע״מ ייחשב חלק מההוצאה.</p>
      )}
      <FormError message={state.error} />
      {state.ok && <p className="text-sm text-brand">ההוצאה נרשמה.</p>}
      <button className="btn" disabled={pending}>
        {pending ? "שומר..." : "רישום הוצאה"}
      </button>
    </form>
  );
}
