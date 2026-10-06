import { SubNav } from "@/components/nav";

const TABS = [
  { href: "/", label: "לוח", exact: true },
  { href: "/income", label: "הכנסות" },
  { href: "/expenses", label: "הוצאות" },
  { href: "/customers", label: "לקוחות" },
  { href: "/bank", label: "בנק" },
];

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <SubNav items={TABS} />
      {children}
    </div>
  );
}
