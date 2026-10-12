import { requireClient } from "@/lib/auth/require-client";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const { mustChangePassword } = await requireClient();

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-neutral-border bg-white p-8 shadow-sm">
      <h1 className="mb-2 font-display text-2xl font-semibold text-move-navy">
        {mustChangePassword ? "Choose your password" : "Change your password"}
      </h1>
      <p className="mb-6 text-sm text-neutral-muted">
        {mustChangePassword
          ? "You signed in with a one-time password from Move. Choose your own to continue; the one-time password stops working."
          : "Choose a new password for your portal login."}
      </p>
      <ChangePasswordForm />
    </div>
  );
}
