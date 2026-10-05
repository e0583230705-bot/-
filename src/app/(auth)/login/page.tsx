import { LoginForm } from "@/components/auth-forms";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">התחברות</h1>
      <p className="mb-6 text-muted">ברוכים השבים</p>
      <div className="card">
        <LoginForm next={typeof next === "string" ? next : undefined} />
      </div>
    </>
  );
}
