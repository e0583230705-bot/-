import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth/dal";
import { CustomerForm } from "@/components/customer-form";
import { createCustomerAction } from "../../../actions";

export default async function NewCustomerPage() {
  const { can } = await getContext();
  if (!can("write_books")) redirect("/customers");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">לקוח חדש</h1>
      <div className="card">
        <CustomerForm action={createCustomerAction} submitLabel="שמירת הלקוח" />
      </div>
    </div>
  );
}
