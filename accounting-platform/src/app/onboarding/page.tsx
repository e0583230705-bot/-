import Link from "next/link";
import { connection } from "next/server";
import { OnboardingForm } from "@/components/onboarding-form";
import { listOrganizations } from "@/lib/services/organizations";

export default async function OnboardingPage() {
  await connection();
  const hasOrgs = (await listOrganizations()).length > 0;
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-1 text-2xl font-bold">הוספת עסק</h1>
      <p className="mb-6 text-muted">
        סוג העסק קובע אילו מסמכים מותר להפיק, איך מחושב מע&quot;מ ואילו מועדי דיווח יופיעו בלוח.
      </p>
      <div className="card">
        <OnboardingForm />
      </div>
      {hasOrgs && (
        <Link href="/" className="mt-4 inline-block text-sm text-brand">
          חזרה ללוח הבקרה
        </Link>
      )}
    </main>
  );
}
