"use server";

import { redirect } from "next/navigation";
import { requireClient } from "@/lib/auth/require-client";
import { parseNewPassword } from "@/lib/auth/parse-new-password";
import { createClient } from "@/lib/supabase/server";

export type ChangePasswordState = { error?: string };

// One action, two steps, in this order: change the password as the signed-in
// client user, then clear their first-login flag. The flag is only cleared
// once the change has succeeded, so nobody leaves first-login with the
// one-time password a staff member saw. Neither password is logged.
export async function changePassword(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  await requireClient();
  const parsed = parseNewPassword({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.password });
  if (error) {
    if (error.code === "same_password") return { error: "Choose a password different from your current one." };
    if (error.code === "weak_password") return { error: "That password is too weak. Try a longer one." };
    if (error.code === "reauthentication_needed") return { error: "Please sign out, sign in again, and then change your password." };
    console.error("changePassword updateUser failed:", error.code);
    return { error: "Your password couldn't be changed. Please try again." };
  }

  const { error: flagError } = await supabase.rpc("complete_password_change");
  if (flagError) {
    console.error("changePassword complete_password_change failed:", flagError.code);
    return { error: "Your password was changed, but we couldn't finish. Choose another new password and try again." };
  }

  redirect("/portal");
}
