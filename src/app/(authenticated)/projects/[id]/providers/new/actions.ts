"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CreateProviderState = { error?: string };

export async function createProvider(
  projectId: string,
  formData: FormData,
): Promise<CreateProviderState> {
  const companyName = formData.get("company_name") as string;
  const websiteInput = formData.get("website") as string;
  const website =
    websiteInput && !/^https?:\/\//i.test(websiteInput)
      ? `https://${websiteInput}`
      : websiteInput;
  const contactPerson = formData.get("contact_person") as string;
  const email = formData.get("email") as string;
  const phoneCountry = (formData.get("phone_country") as string) || "+1";
  const phoneNumber = (formData.get("phone_number") as string) || "";
  const phone = phoneNumber ? `${phoneCountry} ${phoneNumber}` : "";
  const location = formData.get("location") as string;
  const cost = formData.get("cost") as string;
  const serviceCapability = formData.get("service_capability") as string;
  const turnaroundTime = formData.get("turnaround_time") as string;
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
    cost,
    service_capability: serviceCapability,
    turnaround_time: turnaroundTime,
    notes,
    status,
  });

  if (error) {
    return { error: error.message };
  }

  redirect(`/projects/${projectId}/providers`);
}
