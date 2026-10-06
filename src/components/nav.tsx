"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "לוח בקרה" },
  { href: "/income", label: "הכנסות ומסמכים" },
  { href: "/expenses", label: "הוצאות" },
  { href: "/bank", label: "תנועות בנק" },
  { href: "/vat", label: "דוח מע\"מ" },
  { href: "/calendar", label: "מועדי דיווח" },
  { href: "/settings", label: "משתמשים והרשאות" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${
              active ? "bg-brand-soft font-semibold text-brand" : "text-muted hover:bg-bg"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
