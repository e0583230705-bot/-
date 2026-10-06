"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icons, type IconName } from "./icons";

interface NavLink {
  href: string;
  label: string;
  icon: IconName;
}

/* התפריט מחולק לקבוצות קטנות, כדי שהעין תמצא מהר: עבודה שוטפת, דוחות, ביקורת, הגדרות */
export const NAV_GROUPS: { title: string; links: NavLink[] }[] = [
  {
    title: "שוטף",
    links: [
      { href: "/", label: "לוח בקרה", icon: "home" },
      { href: "/income", label: "הכנסות ומסמכים", icon: "fileText" },
      { href: "/expenses", label: "הוצאות", icon: "receipt" },
      { href: "/customers", label: "לקוחות", icon: "users" },
      { href: "/bank", label: "תנועות בנק", icon: "bank" },
    ],
  },
  {
    title: "דוחות",
    links: [
      { href: "/vat", label: "דוח מע\"מ", icon: "percent" },
      { href: "/reports", label: "דוח שנתי", icon: "chart" },
      { href: "/calendar", label: "מועדי דיווח", icon: "calendar" },
    ],
  },
  {
    title: "משרד",
    links: [
      { href: "/audit", label: "ביקורת דוחות", icon: "audit" },
      { href: "/settings", label: "משתמשים והרשאות", icon: "settings" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** תפריט צד למסך רחב */
export function SideNav() {
  const pathname = usePathname();
  return (
    <nav className="space-y-5" aria-label="ניווט ראשי">
      {NAV_GROUPS.map((g) => (
        <div key={g.title}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted/80">{g.title}</p>
          <ul className="space-y-0.5">
            {g.links.map((l) => {
              const active = isActive(pathname, l.href);
              const Icon = Icons[l.icon];
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                      active
                        ? "bg-brand-soft font-semibold text-brand"
                        : "text-muted hover:bg-surface-2 hover:text-text"
                    }`}
                  >
                    <Icon size={18} className={active ? "" : "opacity-80"} />
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** תפריט אופקי לנייד: שורה אחת שנגללת לצדדים */
export function MobileNav() {
  const pathname = usePathname();
  const links = NAV_GROUPS.flatMap((g) => g.links);
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label="ניווט ראשי">
      {links.map((l) => {
        const active = isActive(pathname, l.href);
        const Icon = Icons[l.icon];
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
              active ? "bg-brand-soft font-semibold text-brand" : "text-muted hover:bg-surface-2"
            }`}
          >
            <Icon size={16} />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
