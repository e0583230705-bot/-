import Link from "next/link";
import { ResetPasswordForm } from "@/components/password-reset-forms";

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">בחירת סיסמה חדשה</h1>
      <div className="card">
        {typeof token === "string" && token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="text-sm">
            הקישור חסר או לא תקין.{" "}
            <Link href="/forgot-password" className="text-brand">
              בקשו קישור חדש
            </Link>
          </p>
        )}
      </div>
    </>
  );
}
