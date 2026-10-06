import { SubNav } from "@/components/nav";

const TABS = [
  { href: "/reports", label: "דוח שנתי" },
  { href: "/vat", label: "דוח מע\"מ" },
  { href: "/calendar", label: "מועדי דיווח" },
];

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <SubNav items={TABS} />
      {children}
    </div>
  );
}
