"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createProject(formData: FormData) {
  const clientName = formData.get("client_name") as string;
  const status = formData.get("status") as string;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to create a project." };
  }

  const { data, error } = await supabase
    .from("client_requirements")
    .insert({
      client_name: clientName,
      status,
      owner_id: user.id,
    })
    .select();

  if (error) {
    return { error: error.message };
  }

  if (!data || data.length === 0) {
    return { error: "You don't have permission to make this change." };
  }

  redirect("/dashboard");
}
