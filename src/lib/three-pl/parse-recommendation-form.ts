import { z } from "zod";
import { RECOMMENDATION_PRIORITY_OPTIONS } from "./three-pl-fields";

// Turns the recommendation form into a validated `recommendation` row
// (everything except three_pl_project_id/generated_at, which the action
// sets). Field names in the form are the column names.

function blankToNull(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const optionalUuid = z.preprocess(blankToNull, z.string().uuid().nullable());

const recommendationSchema = z.object({
  priority: z.preprocess(blankToNull, z.enum(RECOMMENDATION_PRIORITY_OPTIONS)),
  provider_id_1: optionalUuid,
  provider_id_2: optionalUuid,
  provider_id_3: optionalUuid,
});

export type RecommendationFields = z.infer<typeof recommendationSchema>;

const FIELD_NAMES = Object.keys(recommendationSchema.shape) as (keyof RecommendationFields)[];

export type ParseRecommendationResult =
  | { ok: true; data: RecommendationFields }
  | { ok: false; error: string };

export function parseRecommendationForm(formData: FormData): ParseRecommendationResult {
  const raw: Record<string, unknown> = {};
  for (const name of FIELD_NAMES) {
    raw[name] = formData.get(name);
  }

  const parsed = recommendationSchema.safeParse(raw);
  if (!parsed.success) {
    // Field-level schema detail stays server-side (docs/SECURITY.md).
    console.error("parseRecommendationForm validation failed:", parsed.error.issues);
    if (parsed.error.issues.some((issue) => issue.path[0] === "priority")) {
      return { ok: false, error: "Priority is required." };
    }
    return {
      ok: false,
      error: "Some fields have values that aren't allowed. Check the form and try again.",
    };
  }

  return { ok: true, data: parsed.data };
}
