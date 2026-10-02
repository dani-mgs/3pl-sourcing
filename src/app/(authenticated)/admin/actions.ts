"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { getUserRole } from "@/lib/auth/get-user-role";
import type { ProjectTable } from "@/lib/auth/get-ownership-context";
import type { UserRole } from "@/lib/auth/get-user-role";
import {
  PROJECT_TABLES,
  parseCreateUser,
  parseDeleteUser,
  parseReassignOwner,
  parseUpdateUserDisplayName,
  parseUpdateTariffEditor,
  parseUpdateUserRole,
} from "@/lib/admin/parse-admin-input";

export type AdminActionState = { error?: string; success?: boolean };

export async function reassignOwner(
  clientRequirementId: string,
  newOwnerId: string,
  table: ProjectTable = "three_pl_projects",
): Promise<AdminActionState> {
  if ((await getUserRole()) !== "admin") {
    return { error: "You don't have permission to make this change." };
  }
  // The table name comes from the client, so only known ones are accepted.
  const parsed = parseReassignOwner({ projectId: clientRequirementId, newOwnerId, table });
  if (!parsed.ok) {
    return { error: parsed.error };
  }
  const { projectId, newOwnerId: ownerId, table: projectTable } = parsed.data;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from(projectTable)
    .update({ owner_id: ownerId })
    .eq("id", projectId)
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

  const parsed = parseUpdateUserDisplayName({ userId, name: newName });
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(parsed.data.userId, {
    user_metadata: { first_name: parsed.data.name },
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
  role: UserRole,
): Promise<AdminActionState> {
  if ((await getUserRole()) !== "admin") {
    return { error: "You don't have permission to make this change." };
  }

  const parsed = parseCreateUser({ email, password, firstName, role });
  if (!parsed.ok) {
    return { error: parsed.error };
  }
  const input = parsed.data;

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: input.firstName ? { first_name: input.firstName } : {},
    app_metadata: { role: input.role },
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

export async function deleteUser(rawUserId: string): Promise<AdminActionState> {
  if ((await getUserRole()) !== "admin") {
    return { error: "You don't have permission to make this change." };
  }

  const parsed = parseDeleteUser({ userId: rawUserId });
  if (!parsed.ok) {
    return { error: parsed.error };
  }
  const { userId } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  if (currentUser?.id === userId) {
    return { error: "You can't delete your own account." };
  }

  // Projects in every module block the delete (owner_id has no ON DELETE).
  const counts = await Promise.all(
    PROJECT_TABLES.map((table) =>
      supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId),
    ),
  );
  const count = counts.reduce((sum, { count: n }) => sum + (n ?? 0), 0);

  if (count > 0) {
    return {
      error: `This user owns ${count} project(s). Reassign ownership before deleting this user.`,
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
  rawUserId: string,
  rawRole: UserRole,
): Promise<AdminActionState> {
  if ((await getUserRole()) !== "admin") {
    return { error: "You don't have permission to make this change." };
  }

  const parsed = parseUpdateUserRole({ userId: rawUserId, newRole: rawRole });
  if (!parsed.ok) {
    return { error: parsed.error };
  }
  const { userId, newRole } = parsed.data;

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

// Grants or revokes the narrow tariff-editor permission (maintains duty and
// fee data in the Tariff Calculator). Stored in app_metadata, which users
// can't edit; GoTrue merges app_metadata keys, so the role is untouched, and
// null removes the key. Takes effect on the user's next token refresh.
export async function updateTariffEditor(
  rawUserId: string,
  rawGrant: boolean,
): Promise<AdminActionState> {
  if ((await getUserRole()) !== "admin") {
    return { error: "You don't have permission to make this change." };
  }

  const parsed = parseUpdateTariffEditor({ userId: rawUserId, grant: rawGrant });
  if (!parsed.ok) {
    return { error: parsed.error };
  }
  const { userId, grant } = parsed.data;

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: { tariff_editor: grant ? true : null },
  });

  if (error) {
    console.error("updateTariffEditor error:", error);
    return { error: "An unexpected error occurred." };
  }

  revalidatePath("/admin");
  return { success: true };
}
