import { getContext } from "@/lib/auth/dal";
import { listMembers } from "@/lib/services/members";
import { isRole, ROLES } from "@/lib/domain/permissions";
import { AddMemberForm } from "@/components/add-member-form";
import { removeMemberAction } from "../../actions";

export default async function SettingsPage() {
  const { org, user, can } = await getContext();
  const members = await listMembers(org.id);
  const manage = can("manage_members");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">משתמשים והרשאות</h1>
      <p className="text-sm text-muted">
        אפשר לתת גישה לרואה חשבון, לשותף או לעובד, כל אחד ברמת ההרשאה שמתאימה לו.
      </p>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>שם</th>
              <th>אימייל</th>
              <th>תפקיד</th>
              {manage && <th />}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId}>
                <td>
                  {m.name}
                  {m.userId === user.id && <span className="text-xs text-muted"> (את/ה)</span>}
                </td>
                <td className="num">{m.email}</td>
                <td>{isRole(m.role) ? ROLES[m.role].label : m.role}</td>
                {manage && (
                  <td className="text-end">
                    {m.userId !== user.id && (
                      <form action={removeMemberAction}>
                        <input type="hidden" name="userId" value={m.userId} />
                        <button className="text-xs text-danger">הסרה</button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {manage && (
        <div className="card space-y-3">
          <h2 className="font-bold">הוספת משתמש</h2>
          <AddMemberForm />
          <ul className="space-y-1 text-xs text-muted">
            {Object.values(ROLES).map((r) => (
              <li key={r.label}>
                <span className="font-medium">{r.label}:</span> {r.description}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
