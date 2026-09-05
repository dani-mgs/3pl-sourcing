"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { getUserRole } from "@/lib/auth/get-user-role";

export type AdminActionState = { error?: string; success?: boolean };

export async function reassignOwner(
  clientRequirementId: string,
  newOwnerId: string,
): Promise<AdminActionState> {
  if ((await getUserRole()) !== "admin") {
    return { error: "You don't have permission to make this change." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("client_requirements")
    .update({ owner_id: newOwnerId })
    .eq("id", clientRequirementId)
    .select();

  if (error) {
    console.error("reassignOwner error:", error);
    return { error: "An unexpected error occurred." };
  }

  if (!data || data.length === 0) {
    return { error: "You don't have permission to make this change." };
  }

  revalidatePath("/admin");
  return { success: true };
}

export async function updateUserRole(
  userId: string,
  newRole: "admin" | "logistics_expert",
): Promise<AdminActionState> {
  if ((await getUserRole()) !== "admin") {
    return { error: "You don't have permission to make this change." };
  }

  const supabase = await createClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  if (currentUser?.id === userId && newRole !== "admin") {
    return { error: "You can't demote yourself." };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: { role: newRole },
  });

  if (error) {
    console.error("updateUserRole error:", error);
    return { error: "An unexpected error occurred." };
  }

  revalidatePath("/admin");
  return { success: true };
}
