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
          className="text-sm file:me-3 file:rounded-lg file:border file:border-border file:bg-bg file:px-3 file:py-2 file:text-sm"
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
