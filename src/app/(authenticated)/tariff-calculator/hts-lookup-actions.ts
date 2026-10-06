"use server";

import { createClient } from "@/lib/supabase/server";
import { parseLookupQuery, type LookupLine } from "@/lib/tariff/hts-lookup";
import { browseHeading, searchHts } from "@/lib/tariff/server-hts-lookup";

// HTS lookup for the calculator's popup. Read-only, as the signed-in user
// (RLS applies, never the service role). Input is validated here: the query
// by parseLookupQuery, the heading as exactly four digits; the row limits are
// fixed server-side (RESULT_LIMIT, BROWSE_LIMIT). The real error is logged;
// the user only gets a generic message.

export type LookupActionResult =
  | { ok: true; kind: "code" | "keywords" | "heading"; lines: LookupLine[]; total: number }
  | { ok: false; error: string };

const SIGN_IN = "Your session has expired. Sign in again.";
const FAILED = "The search didn't work. Try again, or try different words.";

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? supabase : null;
}

export async function searchHtsAction(query: unknown): Promise<LookupActionResult> {
  const parsed = parseLookupQuery(query);
  if (parsed.kind === "empty") return { ok: false, error: "Enter words or an HTS code to search for." };
  if (parsed.kind === "invalid") return { ok: false, error: parsed.error };

  const supabase = await signedIn();
  if (!supabase) return { ok: false, error: SIGN_IN };
  try {
    const result = await searchHts(supabase, parsed);
    return { ok: true, kind: parsed.kind, ...result };
  } catch (error) {
    console.error("searchHtsAction error:", error);
    return { ok: false, error: FAILED };
  }
}

export async function browseHtsHeadingAction(heading: unknown): Promise<LookupActionResult> {
  if (typeof heading !== "string" || !/^[0-9]{4}$/.test(heading)) {
    return { ok: false, error: "Choose a 4-digit heading, e.g. 6402." };
  }
  const supabase = await signedIn();
  if (!supabase) return { ok: false, error: SIGN_IN };
  try {
    const result = await browseHeading(supabase, heading);
    return { ok: true, kind: "heading", ...result };
  } catch (error) {
    console.error("browseHtsHeadingAction error:", error);
    return { ok: false, error: FAILED };
  }
}
