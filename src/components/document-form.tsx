"use client";

import { useActionState, useState } from "react";
import { issueDocumentAction, type FormState } from "@/app/actions";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/documents";
import { formatILS, parseShekels } from "@/lib/domain/money";
import { FormError } from "./form-error";
import { submitKeepingValues } from "./submit";

interface Line {
  key: number;
  description: string;
  quantity: string;
  price: string;
}

export function DocumentForm({
  allowedTypes,
  vatRate,
  today,
}: {
  allowedTypes: DocumentType[];
  vatRate: number;
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(issueDocumentAction, {});
  const [type, setType] = useState<DocumentType>(allowedTypes[0]);
  const [lines, setLines] = useState<Line[]>([{ key: 0, description: "", quantity: "1", price: "" }]);

  const carriesVat = vatRate > 0 && (DOCUMENT_TYPES[type].isTaxInvoice || type === "proforma");
  const net = lines.reduce(
    (s, l) => s + Math.round((Number(l.quantity) || 0) * (parseShekels(l.price) ?? 0)),
    0,
  );
  const vat = carriesVat ? Math.round((net * vatRate) / 100) : 0;

  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <form onSubmit={submitKeepingValues(action)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="type">סוג מסמך</label>
          <select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as DocumentType)}
            className="input"
          >
            {allowedTypes.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPES[t].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="issueDate">תאריך</label>
          <input id="issueDate" name="issueDate" type="date" defaultValue={today} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="customerName">שם הלקוח</label>
          <input id="customerName" name="customerName" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="customerTaxId">מספר עוסק / ח.פ. של הלקוח</label>
          <input id="customerTaxId" name="customerTaxId" inputMode="numeric" className="input num" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="customerIsVatRegistered" />
        הלקוח הוא עוסק מורשה / חברה (רלוונטי למספר הקצאה)
      </label>

      <fieldset className="space-y-2">
        <legend className="label">פירוט</legend>
        {lines.map((l) => (
          <div key={l.key} className="grid grid-cols-12 gap-2">
            <input
              name="lineDescription"
              placeholder="תיאור"
              value={l.description}
              onChange={(e) => update(l.key, { description: e.target.value })}
              required
              className="input col-span-12 sm:col-span-6"
            />
            <input
              name="lineQuantity"
              placeholder="כמות"
              inputMode="decimal"
              value={l.quantity}
              onChange={(e) => update(l.key, { quantity: e.target.value })}
              required
              className="input num col-span-4 sm:col-span-2"
            />
            <input
              name="linePrice"
              placeholder="מחיר ליחידה"
              inputMode="decimal"
              value={l.price}
              onChange={(e) => update(l.key, { price: e.target.value })}
              required
              className="input num col-span-6 sm:col-span-3"
            />
            <button
              type="button"
              onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
              disabled={lines.length === 1}
              className="btn-ghost col-span-2 sm:col-span-1"
              aria-label="הסרת שורה"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setLines((ls) => [...ls, { key: Date.now(), description: "", quantity: "1", price: "" }])
          }
          className="text-sm text-brand"
        >
          + הוספת שורה
        </button>
        <p className="text-xs text-muted">
          {carriesVat ? "המחירים לפני מע״מ" : "המסמך לא כולל מע״מ"}
        </p>
      </fieldset>

      <div>
        <label className="label" htmlFor="notes">הערות</label>
        <textarea id="notes" name="notes" rows={2} className="input" />
      </div>

      <dl className="card grid max-w-xs gap-1 bg-bg p-4 text-sm">
        <div className="flex justify-between">
          <dt>סכום</dt>
          <dd className="num">{formatILS(net)}</dd>
        </div>
        {carriesVat && (
          <div className="flex justify-between">
            <dt>מע״מ {vatRate}%</dt>
            <dd className="num">{formatILS(vat)}</dd>
          </div>
        )}
        <div className="flex justify-between font-bold">
          <dt>סה״כ</dt>
          <dd className="num">{formatILS(net + vat)}</dd>
        </div>
      </dl>

      <FormError message={state.error} />
      <p className="text-xs text-muted">
        מסמך שהופק לא ניתן למחיקה או לעריכה. לתיקון מפיקים חשבונית זיכוי.
      </p>
      <button className="btn" disabled={pending}>
        {pending ? "מפיק..." : "הפקת המסמך"}
      </button>
    </form>
  );
}
