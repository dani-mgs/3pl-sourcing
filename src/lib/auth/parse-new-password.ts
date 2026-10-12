import { z } from "zod";

// A client user's own password (portal change-password). Longer than the
// staff minimum because it guards an external login; 72 is bcrypt's limit,
// which Supabase Auth enforces.
export const CLIENT_PASSWORD_MIN = 12;
export const CLIENT_PASSWORD_MAX = 72;

const schema = z
  .object({
    password: z
      .string({ error: `Use at least ${CLIENT_PASSWORD_MIN} characters.` })
      .min(CLIENT_PASSWORD_MIN, `Use at least ${CLIENT_PASSWORD_MIN} characters.`)
      .max(CLIENT_PASSWORD_MAX, `Use ${CLIENT_PASSWORD_MAX} characters or fewer.`),
    confirm: z.string({ error: "Type the new password twice." }),
  })
  .refine((v) => v.password === v.confirm, { message: "The two passwords don't match.", path: ["confirm"] });

export function parseNewPassword(raw: { password: unknown; confirm: unknown }):
  | { ok: true; password: string }
  | { ok: false; error: string } {
  const parsed = schema.safeParse(raw);
  // Never log the issues: they'd include the password.
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the new password." };
  return { ok: true, password: parsed.data.password };
}
