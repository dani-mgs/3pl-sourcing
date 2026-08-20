"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CreateProviderState = { error?: string };

export async function createProvider(
  projectId: string,
  formData: FormData,
): Promise<CreateProviderState> {
  const companyName = formData.get("company_name") as string;
  const website = formData.get("website") as string;
  const contactPerson = formData.get("contact_person") as string;
  const email = formData.get("email") as string;
  const phone = formData.get("phone") as string;
  const location = formData.get("location") as string;
  const notes = formData.get("notes") as string;
  const status = formData.get("status") as string;

  const supabase = await createClient();

  const { error } = await supabase.from("providers").insert({
    project_id: projectId,
    company_name: companyName,
    website,
    contact_person: contactPerson,
    email,
    phone,
    location,
    notes,
    status,
  });

  if (error) {
    return { error: error.message };
  }

  redirect(`/projects/${projectId}/providers`);
}
