"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "3pl-sourcing-documents";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

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

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { error: "File exceeds the 10MB upload limit" };
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

export type DeleteDocumentState = { error?: string };

export async function deleteDocument(
  projectId: string,
  documentId: string,
): Promise<DeleteDocumentState> {
  const supabase = await createClient();

  // The delete is scoped by RLS to documents the current user owns; a row
  // is only returned here if the delete was actually allowed to happen.
  const { data: deletedDocs, error: deleteError } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId)
    .eq("project_id", projectId)
    .select("file_path");

  if (deleteError) {
    return { error: deleteError.message };
  }

  const deletedDoc = deletedDocs?.[0];

  if (!deletedDoc) {
    return { error: "You don't have permission to delete this document." };
  }

  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([deletedDoc.file_path]);

  if (storageError) {
    return { error: storageError.message };
  }

  revalidatePath(`/projects/${projectId}/requirements`);
  return {};
}
