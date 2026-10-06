import { ForgotPasswordForm } from "@/components/password-reset-forms";

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">שכחתי סיסמה</h1>
      <p className="mb-6 text-muted">נשלח אליך קישור לבחירת סיסמה חדשה</p>
      <div className="card">
        <ForgotPasswordForm />
      </div>
    </>
  );
}
