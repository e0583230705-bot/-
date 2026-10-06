import Link from "next/link";
import { MobileNav, SideNav } from "@/components/nav";
import { Icons } from "@/components/icons";
import { getContext } from "@/lib/auth/dal";
import { profileOf } from "@/lib/services/organizations";
import { ROLES } from "@/lib/domain/permissions";
import { logoutAction, switchOrganizationAction } from "../actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, org, role, orgs } = await getContext();
  const initials = user.name.trim().slice(0, 1) || "?";

  return (
    <div className="min-h-screen">
      {/* פס עליון: העסק הפעיל בצד אחד, המשתמש בצד השני */}
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white" aria-label="לוח הבקרה">
              ח
            </Link>
            {orgs.length > 1 ? (
              <form action={switchOrganizationAction} className="flex min-w-0 items-center gap-2">
                <select
                  name="orgId"
                  defaultValue={org.id}
                  className="input w-auto max-w-[14rem] truncate py-1.5 font-semibold"
                  aria-label="החלפת עסק"
                >
                  {orgs.map(({ org: o }) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <button className="btn-ghost btn-sm">החלף</button>
              </form>
            ) : (
              <div className="min-w-0 leading-tight">
                <p className="truncate font-semibold">{org.name}</p>
                <p className="truncate text-xs text-muted">
                  {profileOf(org).label} · {ROLES[role].label}
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link href="/onboarding" className="btn-ghost btn-sm hidden sm:inline-flex">
              <Icons.plus size={14} />
              עסק נוסף
            </Link>
            <div className="hidden items-center gap-2 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand" aria-hidden>
                {initials}
              </span>
              <span className="max-w-[10rem] truncate text-sm font-medium" title={user.email}>
                {user.name}
              </span>
            </div>
            <form action={logoutAction}>
              <button className="btn-ghost btn-sm" title="התנתקות">
                <Icons.logout size={14} />
                <span className="hidden sm:inline">התנתקות</span>
              </button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 pb-2 md:hidden">
          <MobileNav />
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6 md:px-6 md:py-8">
        <aside className="hidden w-56 shrink-0 md:block">
          <div className="sticky top-20">
            <SideNav />
          </div>
        </aside>
        <main className="min-w-0 flex-1 space-y-6">{children}</main>
      </div>
    </div>
  );
}
