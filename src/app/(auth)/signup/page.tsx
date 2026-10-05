import { SignupForm } from "@/components/auth-forms";

export default function SignupPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">יצירת חשבון</h1>
      <p className="mb-6 text-muted">אחרי ההרשמה נקים יחד את העסק הראשון שלך</p>
      <div className="card">
        <SignupForm />
      </div>
    </>
  );
}
