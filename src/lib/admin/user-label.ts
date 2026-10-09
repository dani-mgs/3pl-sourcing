// Admin-only labels for a user: the name with the email beside it, so two
// users with the same name can still be told apart. Non-admin views show the
// name alone.
export function adminUserLabel(
  firstName: string | null | undefined,
  email: string,
  style: "parens" | "dot",
): string {
  const name = firstName?.trim();
  if (!name) return email;
  return style === "parens" ? `${name} (${email})` : `${name} · ${email}`;
}
