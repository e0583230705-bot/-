import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth/dal";
import { profileOf } from "@/lib/services/organizations";
import { vatRateOn } from "@/lib/domain/vat";
import { todayISO } from "@/lib/format";
import { DocumentForm } from "@/components/document-form";
import { listCustomers } from "@/lib/services/customers";

export default async function NewDocumentPage({ searchParams }: PageProps<"/income/new">) {
  const { org, can } = await getContext();
  if (!can("write_books")) redirect("/income");
  const profile = profileOf(org);
  const today = todayISO();
  const { customer } = await searchParams;
  const customers = (await listCustomers(org.id)).map(({ customer: c }) => ({
    id: c.id,
    name: c.name,
    taxId: c.taxId,
    isVatRegistered: c.isVatRegistered,
  }));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">הפקת מסמך</h1>
      <div className="card">
        <DocumentForm
          allowedTypes={profile.allowedDocuments}
          vatRate={profile.chargesVat ? vatRateOn(today) : 0}
          today={today}
          customers={customers}
          initialCustomerId={typeof customer === "string" ? customer : undefined}
        />
      </div>
    </div>
  );
}
