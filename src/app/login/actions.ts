"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { userRole } from "@/lib/auth/roles";
import { CHANGE_PASSWORD_PATH, PORTAL_PATH } from "@/lib/auth/portal-routing";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("login error:", error);
    return { error: "Invalid email or password." };
  }

  // Client users go straight to the portal (or to choose their password), so
  // the address bar shows where they are. The proxy would send them there
  // anyway, but only inside the client-side fetch for "/".
  const meta = data.user?.app_metadata;
  if (userRole(meta) === "client") {
    redirect(meta?.must_change_password === true ? CHANGE_PASSWORD_PATH : PORTAL_PATH);
  }
  redirect("/");
}
