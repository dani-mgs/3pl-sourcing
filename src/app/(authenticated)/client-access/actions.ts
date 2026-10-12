"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/require-staff";
import { createClientUserAccount, resetClientUserPassword } from "@/lib/client-users/create-client-user";

// The one-time password comes back once, in this response only, for the
// staff member to pass on. It isn't stored or logged anywhere.
export type ClientUserActionState = {
  error?: string;
  issued?: { email: string; oneTimePassword: string };
};

// Admins: any client. Logistics experts: clients of projects they own (the
// check is in createClientUserAccount).
export async function createClientUser(
  _prev: ClientUserActionState,
  formData: FormData,
): Promise<ClientUserActionState> {
  await requireStaff();
  const result = await createClientUserAccount({
    clientId: formData.get("client_id"),
    email: formData.get("email"),
    firstName: formData.get("first_name"),
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/client-access");
  return { issued: { email: result.email, oneTimePassword: result.oneTimePassword } };
}

// Admins only (checked in resetClientUserPassword).
export async function resetClientPassword(userId: string): Promise<ClientUserActionState> {
  await requireStaff();
  const result = await resetClientUserPassword({ userId });
  if (!result.ok) return { error: result.error };
  return { issued: { email: result.email, oneTimePassword: result.oneTimePassword } };
}
