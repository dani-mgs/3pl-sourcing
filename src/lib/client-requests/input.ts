import { z } from "zod";
import { MESSAGE_MAX } from "./text";

// The portal's request form, checked on the server before the database
// checks it again (submit_client_request). Keys are the portal's opaque
// hashes, never ids.

const key = z.string().regex(/^[0-9a-f]{32}$/);
const text = (max: number) => z.string().trim().min(1).max(max);

export const requestInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("approve"),
    engagementKey: key,
    updateKey: key,
    message: z.string().trim().max(MESSAGE_MAX.approve).transform((s) => (s === "" ? null : s)),
  }),
  z.strictObject({
    kind: z.literal("request_changes"),
    engagementKey: key,
    updateKey: key,
    message: text(MESSAGE_MAX.request_changes),
  }),
  z.strictObject({
    kind: z.literal("question"),
    engagementKey: key,
    message: text(MESSAGE_MAX.question),
    wantsCall: z.boolean(),
  }),
]);

export type RequestInput = z.infer<typeof requestInputSchema>;

export function parseRequestForm(formData: FormData): RequestInput | null {
  const get = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v : undefined;
  };
  const kind = get("kind");
  const base = { kind, engagementKey: get("engagementKey"), message: get("message") ?? "" };
  const candidate =
    kind === "question"
      ? { ...base, wantsCall: formData.get("wantsCall") === "on" }
      : { ...base, updateKey: get("updateKey") };
  const parsed = requestInputSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export const replyInputSchema = z.strictObject({
  requestId: z.uuid(),
  reply: text(MESSAGE_MAX.reply),
});
