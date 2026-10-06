"use client";

import type { FormState } from "@/app/actions";
import { scanReceiptAction } from "@/app/actions";
import { FormError } from "./form-error";
import { useFormAction } from "./submit";

export function ReceiptUploadForm({ aiEnabled }: { aiEnabled: boolean }) {
  const [state, action, pending, ready] = useFormAction<FormState>(scanReceiptAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="receipt"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          required
          aria-label="קובץ קבלה"
          className="text-sm text-muted file:me-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-brand-soft file:px-3.5 file:py-2 file:text-sm file:font-semibold file:text-brand"
        />
        <button className="btn" disabled={pending || !ready}>
          {pending ? (aiEnabled ? "קורא את הקבלה..." : "מעלה...") : aiEnabled ? "סריקת קבלה" : "העלאת קבלה"}
        </button>
      </div>
      <p className="text-xs text-muted">
        {aiEnabled
          ? "תמונה או PDF של הקבלה. הפרטים ימולאו אוטומטית, ותוכלו לבדוק ולתקן לפני השמירה."
          : "תמונה או PDF של הקבלה. הקובץ יישמר עם ההוצאה. (זיהוי אוטומטי של הפרטים יופעל כשיוגדר מפתח AI)"}
      </p>
      <FormError message={state.error} />
    </form>
  );
}
