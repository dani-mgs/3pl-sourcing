import { z } from "zod";
import { MESSAGE_MAX } from "./text";

// The portal's request form, checked on the server before the database
// checks it again (submit_client_request, submit_client_introduction,
// submit_market_report_interest). Keys are the portal's opaque hashes, never
// ids; a partner is its bare letter ("D"), never a name.

const key = z.string().regex(/^[0-9a-f]{32}$/);
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).transform((s) => (s === "" ? null : s));

export const requestInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("approve"),
    engagementKey: key,
    updateKey: key,
    message: optionalText(MESSAGE_MAX.approve),
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
  z.strictObject({
    kind: z.literal("introduction"),
    engagementKey: key,
    label: z.string().regex(/^[A-Z]{1,2}$/),
    message: optionalText(MESSAGE_MAX.introduction),
    wantsCall: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("report_interest"),
    message: optionalText(MESSAGE_MAX.report_interest),
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
  const message = get("message") ?? "";
  const wantsCall = formData.get("wantsCall") === "on";
  const base = { kind, engagementKey: get("engagementKey"), message };
  const candidate =
    kind === "question"
      ? { ...base, wantsCall }
      : kind === "introduction"
        ? { ...base, label: get("label"), wantsCall }
        : kind === "report_interest"
          ? { kind, message, wantsCall }
          : { ...base, updateKey: get("updateKey") };
  const parsed = requestInputSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export const replyInputSchema = z.strictObject({
  requestId: z.uuid(),
  reply: text(MESSAGE_MAX.reply),
});
