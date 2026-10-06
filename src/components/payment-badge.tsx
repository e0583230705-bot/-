import type { PaymentStatus } from "@/lib/domain/receivables";

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  if (!status) return <span className="text-muted">—</span>;
  if (status.kind === "paid") return <span className="badge badge-good">שולם</span>;
  if (status.kind === "overdue") {
    return <span className="badge badge-bad">באיחור · {status.days} ימים</span>;
  }
  return <span className="badge badge-warn">פתוח · {status.days} ימים</span>;
}
