import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth/dal";
import { CustomerForm } from "@/components/customer-form";
import { createCustomerAction } from "@/app/actions";
import { PageHeader } from "@/components/page-header";

export default async function NewCustomerPage() {
  const { can } = await getContext();
  if (!can("write_books")) redirect("/customers");
  return (
    <div className="space-y-5">
      <PageHeader back={{ href: "/customers", label: "כל הלקוחות" }} title="לקוח חדש" />
      <div className="card max-w-2xl">
        <CustomerForm action={createCustomerAction} submitLabel="שמירת הלקוח" />
      </div>
    </div>
  );
}
