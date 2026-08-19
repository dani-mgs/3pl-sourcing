"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "3pl-sourcing-documents";

export type UploadDocumentState = { error?: string };

export async function uploadDocument(
  projectId: string,
  formData: FormData,
): Promise<UploadDocumentState> {
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

  const filePath = `${projectId}/${crypto.randomUUID()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file);

  if (uploadError) {
    return { error: uploadError.message };
  }

  const { error: insertError } = await supabase.from("documents").insert({
    project_id: projectId,
    type,
    file_path: filePath,
    file_name: file.name,
    uploaded_by: user.id,
  });

  if (insertError) {
    return { error: insertError.message };
  }

  revalidatePath(`/projects/${projectId}/requirements`);
  return {};
}
