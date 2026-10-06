import type { PaymentStatus } from "@/lib/domain/receivables";

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  if (!status) return <span className="text-muted">—</span>;
  if (status.kind === "paid") return <span className="rounded bg-brand-soft px-2 py-0.5 text-xs text-brand">שולם</span>;
  if (status.kind === "overdue") {
    return <span className="rounded bg-danger-soft px-2 py-0.5 text-xs text-danger">באיחור · {status.days} ימים</span>;
  }
  return <span className="rounded bg-warn-soft px-2 py-0.5 text-xs text-warn">פתוח · {status.days} ימים</span>;
}
