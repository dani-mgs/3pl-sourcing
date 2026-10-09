import { createClient } from "@/lib/supabase/server";

export type TariffPermissions = {
  userId: string | null;
  isAdmin: boolean;
  // Tariff editor or admin: may maintain duty and fee data (mirrors the SQL
  // is_tariff_editor()).
  canEditTariffData: boolean;
};

export async function getTariffPermissions(): Promise<TariffPermissions> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const meta = user?.app_metadata ?? {};
  const isAdmin = meta.role === "admin";
  // The editor flag only counts on top of an assigned role (has_app_role()).
  const hasRole = isAdmin || meta.role === "logistics_expert";
  return {
    userId: user?.id ?? null,
    isAdmin,
    canEditTariffData: isAdmin || (hasRole && meta.tariff_editor === true),
  };
}
