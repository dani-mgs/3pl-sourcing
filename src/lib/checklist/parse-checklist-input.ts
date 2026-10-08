import { z } from "zod";
import { NOTE_MAX } from "./checklist";

// Validates the checklist Server Action's arguments. Anything reaching a
// Server Action can be tampered with, so the ids, the tick state and the
// version are checked here (and again in the database function).

const INVALID_REQUEST = "Something went wrong with that request. Reload the page and try again.";

const setItemSchema = z.object({
  itemId: z.uuid({ error: INVALID_REQUEST }),
  done: z.boolean({ error: INVALID_REQUEST }),
  note: z
    .string({ error: INVALID_REQUEST })
    .trim()
    .max(NOTE_MAX, `A note must be ${NOTE_MAX} characters or fewer.`)
    .transform((value) => value || null),
  version: z.number({ error: INVALID_REQUEST }).int({ error: INVALID_REQUEST }).min(0, INVALID_REQUEST).max(1_000_000, INVALID_REQUEST),
});

export type ParsedSetItem = z.infer<typeof setItemSchema>;

export function parseSetItem(raw: { itemId: unknown; done: unknown; note: unknown; version: unknown }) {
  const parsed = setItemSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("setChecklistItem validation failed:", parsed.error.issues);
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? INVALID_REQUEST };
  }
  return { ok: true as const, data: parsed.data };
}
