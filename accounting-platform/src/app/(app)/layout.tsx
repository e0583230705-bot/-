import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { getCurrentOrg } from "@/lib/current-org";
import { listOrganizations, profileOf } from "@/lib/services/organizations";
import { switchOrganizationAction } from "../actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const org = await getCurrentOrg();
  if (!org) redirect("/onboarding");
  const orgs = await listOrganizations();

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 px-4 py-4 md:flex-row md:gap-6 md:py-8">
      <aside className="md:w-56 md:shrink-0">
        <div className="card space-y-4 p-4">
          <div>
            <p className="text-xs text-muted">העסק הפעיל</p>
            <p className="font-bold">{org.name}</p>
            <p className="text-xs text-muted">{profileOf(org).label}</p>
          </div>
          {orgs.length > 1 && (
            <form action={switchOrganizationAction} className="flex gap-2">
              <select name="orgId" defaultValue={org.id} className="input" aria-label="החלפת עסק">
                {orgs.map((o) => (
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
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
