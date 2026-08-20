"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "3pl-sourcing-documents";

export type UploadProviderDocumentState = { error?: string };

export async function uploadProviderDocument(
  projectId: string,
  providerId: string,
  formData: FormData,
): Promise<UploadProviderDocumentState> {
  const type = formData.get("type") as string;
  const file = formData.get("file") as File | null;

  if (!file || file.size === 0) {
    return { error: "Please choose a file to upload." };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to upload a document." };
  }

  const filePath = `providers/${providerId}/${crypto.randomUUID()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file);

  if (uploadError) {
    return { error: uploadError.message };
  }

  const { error: insertError } = await supabase
    .from("provider_documents")
    .insert({
      provider_id: providerId,
      type,
      file_path: filePath,
      file_name: file.name,
      uploaded_by: user.id,
    });

  if (insertError) {
    return { error: insertError.message };
  }

  revalidatePath(`/projects/${projectId}/providers/${providerId}`);
  return {};
}
