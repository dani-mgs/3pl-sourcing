"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "3pl-sourcing-documents";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

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

export type DeleteProviderDocumentState = { error?: string };

export async function deleteProviderDocument(
  projectId: string,
  providerId: string,
  documentId: string,
): Promise<DeleteProviderDocumentState> {
  const supabase = await createClient();

  const { data: document, error: fetchError } = await supabase
    .from("provider_documents")
    .select("file_path")
    .eq("id", documentId)
    .eq("provider_id", providerId)
    .single();

  if (fetchError || !document) {
    return { error: fetchError?.message ?? "Document not found." };
  }

  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([document.file_path]);

  if (storageError) {
    return { error: storageError.message };
  }

  const { error: deleteError } = await supabase
    .from("provider_documents")
    .delete()
    .eq("id", documentId)
    .eq("provider_id", providerId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  revalidatePath(`/projects/${projectId}/providers/${providerId}`);
  return {};
}

export type DeleteProviderState = { error?: string };

export async function deleteProvider(
  projectId: string,
  providerId: string,
): Promise<DeleteProviderState> {
  const supabase = await createClient();

  const { data: documents, error: fetchError } = await supabase
    .from("provider_documents")
    .select("id, file_path")
    .eq("provider_id", providerId);

  if (fetchError) {
    return { error: fetchError.message };
  }

  const filePaths = (documents ?? []).map((doc) => doc.file_path);

  if (filePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove(filePaths);

    if (storageError) {
      return { error: storageError.message };
    }
  }

  const { error: deleteDocsError } = await supabase
    .from("provider_documents")
    .delete()
    .eq("provider_id", providerId);

  if (deleteDocsError) {
    return { error: deleteDocsError.message };
  }

  const { error: deleteProviderError } = await supabase
    .from("providers")
    .delete()
    .eq("id", providerId);

  if (deleteProviderError) {
    return { error: deleteProviderError.message };
  }

  redirect(`/projects/${projectId}/providers`);
}
