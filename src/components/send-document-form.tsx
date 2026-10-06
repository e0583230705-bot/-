"use client";

import type { FormState } from "@/app/actions";
import { FormError } from "./form-error";
import { useFormAction } from "./submit";

export function SendDocumentForm({
  action: serverAction,
  defaultEmail,
  configured,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaultEmail?: string;
  configured: boolean;
}) {
  const [state, action, pending, ready] = useFormAction<FormState>(serverAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <input
          name="to"
          type="email"
          defaultValue={defaultEmail}
          placeholder="אימייל של הלקוח"
          aria-label="אימייל של הלקוח"
          required
          className="input num"
        />
        <button className="btn" disabled={pending || !ready}>
          {pending ? "שולח..." : "שליחה במייל"}
        </button>
      </div>
      <textarea
        name="message"
        rows={3}
        placeholder="הודעה אישית (לא חובה). בלי הודעה יישלח נוסח ברירת מחדל."
        aria-label="הודעה"
        className="input"
      />
      {!configured && (
        <p className="text-xs text-warn">
          שירות המיילים עוד לא הוגדר. השליחה תירשם ביומן אבל לא תגיע ללקוח בפועל.
        </p>
      )}
      <FormError message={state.error} />
      {state.message && <p className="text-sm text-brand">{state.message}</p>}
    </form>
  );
}
