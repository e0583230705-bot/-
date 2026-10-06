import { notFound, redirect } from "next/navigation";
import { getContext } from "@/lib/auth/dal";
import { getCustomer } from "@/lib/services/customers";
import { CustomerForm } from "@/components/customer-form";
import { updateCustomerAction } from "../../../../actions";

export default async function EditCustomerPage({ params }: PageProps<"/customers/[id]/edit">) {
  const { id } = await params;
  const { org, can } = await getContext();
  if (!can("write_books")) redirect(`/customers/${id}`);
  const customer = /^[0-9a-f-]{36}$/i.test(id) ? await getCustomer(org.id, id) : null;
  if (!customer) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">עריכת לקוח</h1>
      <p className="text-sm text-muted">שינוי פרטי הלקוח לא משנה מסמכים שכבר הופקו.</p>
      <div className="card">
        <CustomerForm action={updateCustomerAction.bind(null, customer.id)} initial={customer} submitLabel="שמירה" />
      </div>
    </div>
  );
}
