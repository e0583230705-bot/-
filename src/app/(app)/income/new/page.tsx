import { getCurrentOrg } from "@/lib/current-org";
import { profileOf } from "@/lib/services/organizations";
import { vatRateOn } from "@/lib/domain/vat";
import { todayISO } from "@/lib/format";
import { DocumentForm } from "@/components/document-form";

export default async function NewDocumentPage() {
  const org = (await getCurrentOrg())!;
  const profile = profileOf(org);
  const today = todayISO();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">הפקת מסמך</h1>
      <div className="card">
        <DocumentForm
          allowedTypes={profile.allowedDocuments}
          vatRate={profile.chargesVat ? vatRateOn(today) : 0}
          today={today}
        />
      </div>
    </div>
  );
}
