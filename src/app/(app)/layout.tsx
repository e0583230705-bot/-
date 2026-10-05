import Link from "next/link";
import { Nav } from "@/components/nav";
import { getContext } from "@/lib/auth/dal";
import { profileOf } from "@/lib/services/organizations";
import { ROLES } from "@/lib/domain/permissions";
import { logoutAction, switchOrganizationAction } from "../actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, org, role, orgs } = await getContext();

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 px-4 py-4 md:flex-row md:gap-6 md:py-8">
      <aside className="md:w-56 md:shrink-0">
        <div className="card space-y-4 p-4">
          <div>
            <p className="text-xs text-muted">העסק הפעיל</p>
            <p className="font-bold">{org.name}</p>
            <p className="text-xs text-muted">
              {profileOf(org).label} · {ROLES[role].label}
            </p>
          </div>
          {orgs.length > 1 && (
            <form action={switchOrganizationAction} className="flex gap-2">
              <select name="orgId" defaultValue={org.id} className="input" aria-label="החלפת עסק">
                {orgs.map(({ org: o }) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <button className="btn-ghost">החלף</button>
            </form>
          )}
          <Nav />
          <Link href="/onboarding" className="block text-sm text-brand">
            + הוספת עסק
          </Link>
          <div className="border-t border-border pt-3 text-sm">
            <p className="truncate font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <form action={logoutAction}>
              <button className="mt-2 text-xs text-muted hover:text-danger">התנתקות</button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
