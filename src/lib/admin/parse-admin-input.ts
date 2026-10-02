import { z } from "zod";

// Validates the arguments of the /admin Server Actions (admin/actions.ts,
// admin/client-actions.ts). They're called with typed arguments rather than
// FormData, but anything reaching a Server Action can be tampered with, so
// each one is checked here. Every check carries a message that's safe to
// show; the raw Zod issues are only logged server-side (docs/SECURITY.md).

// Ids only come from the page (a select, a row's button); a bad one means a
// stale page or a tampered request, not a typo.
const INVALID_REQUEST = "Something went wrong with that request. Reload the page and try again.";

const NAME_MAX = 200;
const BUSINESS_MODEL_MAX = 500;
const EMAIL_MAX = 254;
// Supabase Auth rejects passwords longer than 72 characters (bcrypt's limit).
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

export const USER_ROLES = ["admin", "logistics_expert"] as const;
export const PROJECT_TABLES = ["three_pl_projects", "forwarder_projects"] as const;

const id = z.uuid({ error: INVALID_REQUEST });

const requiredName = (label: string) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(NAME_MAX, `${label} must be ${NAME_MAX} characters or fewer.`);

const reassignOwnerSchema = z.object({
  projectId: id,
  newOwnerId: id,
  table: z.enum(PROJECT_TABLES, { error: INVALID_REQUEST }),
});

const updateUserDisplayNameSchema = z.object({
  userId: id,
  name: requiredName("Name"),
});

const createUserSchema = z.object({
  email: z
    .string({ error: "Email is required." })
    .trim()
    .min(1, "Email is required.")
    .max(EMAIL_MAX, `Email must be ${EMAIL_MAX} characters or fewer.`)
    // The same rule as the form's <input type="email">, so nothing the
    // browser accepts is refused here.
    .regex(z.regexes.html5Email, "Enter a valid email address."),
  password: z
    .string({ error: `Password must be at least ${PASSWORD_MIN} characters.` })
    .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters.`)
    .max(PASSWORD_MAX, `Password must be ${PASSWORD_MAX} characters or fewer.`),
  firstName: z
    .string({ error: INVALID_REQUEST })
    .trim()
    .max(NAME_MAX, `First name must be ${NAME_MAX} characters or fewer.`),
  role: z.enum(USER_ROLES, { error: "Choose a valid role." }),
});

const userIdSchema = z.object({ userId: id });

const updateUserRoleSchema = z.object({
  userId: id,
  newRole: z.enum(USER_ROLES, { error: "Choose a valid role." }),
});

const updateTariffEditorSchema = z.object({
  userId: id,
  grant: z.boolean({ error: INVALID_REQUEST }),
});

const updateClientSchema = z.object({
  clientId: id,
  name: requiredName("Client name"),
  businessModel: z
    .string({ error: INVALID_REQUEST })
    .trim()
    .max(BUSINESS_MODEL_MAX, `Business model must be ${BUSINESS_MODEL_MAX} characters or fewer.`)
    .transform((value) => value || null),
});

const clientIdSchema = z.object({ clientId: id });

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

function parse<S extends z.ZodType>(
  schema: S,
  raw: unknown,
  label: string,
): ParseResult<z.infer<S>> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    console.error(`${label} validation failed:`, parsed.error.issues);
    return { ok: false, error: parsed.error.issues[0]?.message ?? INVALID_REQUEST };
  }
  return { ok: true, data: parsed.data };
}

export function parseReassignOwner(raw: { projectId: unknown; newOwnerId: unknown; table: unknown }) {
  return parse(reassignOwnerSchema, raw, "reassignOwner");
}

export function parseUpdateUserDisplayName(raw: { userId: unknown; name: unknown }) {
  return parse(updateUserDisplayNameSchema, raw, "updateUserDisplayName");
}

export function parseCreateUser(raw: {
  email: unknown;
  password: unknown;
  firstName: unknown;
  role: unknown;
}) {
  return parse(createUserSchema, raw, "createUser");
}

export function parseDeleteUser(raw: { userId: unknown }) {
  return parse(userIdSchema, raw, "deleteUser");
}

export function parseUpdateUserRole(raw: { userId: unknown; newRole: unknown }) {
  return parse(updateUserRoleSchema, raw, "updateUserRole");
}

export function parseUpdateTariffEditor(raw: { userId: unknown; grant: unknown }) {
  return parse(updateTariffEditorSchema, raw, "updateTariffEditor");
}

export function parseUpdateClient(raw: { clientId: unknown; name: unknown; businessModel: unknown }) {
  return parse(updateClientSchema, raw, "updateClient");
}

export function parseDeleteClient(raw: { clientId: unknown }) {
  return parse(clientIdSchema, raw, "deleteClient");
}
