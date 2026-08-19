"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createProject(formData: FormData) {
  const clientName = formData.get("client_name") as string;
  const projectName = formData.get("project_name") as string;
  const status = formData.get("status") as string;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to create a project." };
  }

  const { error } = await supabase.from("projects").insert({
    client_name: clientName,
    project_name: projectName,
    status,
    owner_id: user.id,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}
