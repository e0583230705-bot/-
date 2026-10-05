import "server-only";
import { cookies } from "next/headers";
import { getOrganization, listOrganizations } from "@/lib/services/organizations";

export const ORG_COOKIE = "org";

/**
 * העסק הפעיל כרגע.
 * שימו לב: עדיין אין מערכת התחברות — זה שלב פיתוח בלבד. לפני עלייה לאוויר
 * חובה להוסיף אימות משתמשים ולבדוק חברות (membership) בכל בקשה.
 */
export async function getCurrentOrg() {
  const id = (await cookies()).get(ORG_COOKIE)?.value;
  const org = id ? await getOrganization(id) : null;
  if (org) return org;
  const [first] = await listOrganizations();
  return first ?? null;
}
