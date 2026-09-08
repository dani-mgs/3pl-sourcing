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

export async function updateUserDisplayName(
  userId: string,
  newName: string,
): Promise<AdminActionState> {
  if ((await getUserRole()) !== "admin") {
    return { error: "You don't have permission to make this change." };
  }

  const trimmed = newName.trim();
  if (!trimmed) {
    return { error: "Name is required." };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    user_metadata: { first_name: trimmed },
  });

  if (error) {
    console.error("updateUserDisplayName error:", error);
    return { error: "An unexpected error occurred." };
  }

  revalidatePath("/admin");
  return { success: true };
}

export async function createUser(
  email: string,
  password: string,
  firstName: string,
  role: "admin" | "logistics_expert",
): Promise<AdminActionState> {
  if ((await getUserRole()) !== "admin") {
    return { error: "You don't have permission to make this change." };
  }

  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    return { error: "Email is required." };
  }
  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const trimmedFirstName = firstName.trim();

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.createUser({
    email: trimmedEmail,
    password,
    email_confirm: true,
    user_metadata: trimmedFirstName ? { first_name: trimmedFirstName } : {},
    app_metadata: { role },
  });

  if (error) {
    console.error("createUser error:", error);
    if (error.code === "email_exists") {
      return { error: "A user with that email already exists." };
    }
    return { error: "An unexpected error occurred." };
  }

  revalidatePath("/admin");
  return { success: true };
}

export async function deleteUser(userId: string): Promise<AdminActionState> {
  if ((await getUserRole()) !== "admin") {
    return { error: "You don't have permission to make this change." };
  }

  const supabase = await createClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  if (currentUser?.id === userId) {
    return { error: "You can't delete your own account." };
  }

  const { count } = await supabase
    .from("client_requirements")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId);

  if (count && count > 0) {
    return {
      error: `This user owns ${count} client(s). Reassign ownership before deleting this user.`,
    };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.deleteUser(userId);

  if (error) {
    console.error("deleteUser error:", error);
    return { error: "An unexpected error occurred." };
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
