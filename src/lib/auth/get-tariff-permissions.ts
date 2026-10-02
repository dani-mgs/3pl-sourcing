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
  return {
    userId: user?.id ?? null,
    isAdmin,
    canEditTariffData: isAdmin || meta.tariff_editor === true,
  };
}
