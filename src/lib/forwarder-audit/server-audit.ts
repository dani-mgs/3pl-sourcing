import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import { runAudit } from "./engine";
import { parseInputs } from "./input-schema";
import type { AuditInputs } from "./types";

// SERVER-ONLY. Reads Forwarder Audits through the caller's client (RLS: any
// staff member reads; a client or anon gets nothing, which reads as not
// found). Only the inputs are stored: the status shown in the list is
// recalculated from them.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const LIST_LIMIT = 100;
const COLUMNS = "id, owner_id, inputs, created_at, updated_at";

export type LoadedAudit = { id: string; ownerId: string; inputs: AuditInputs; createdAt: string; updatedAt: string };
export type LoadAuditResult =
  | { ok: true; audit: LoadedAudit }
  | { ok: false; code: "not_found" | "invalid_data" | "load_failed"; message: string };

export const NOT_FOUND = "This audit doesn't exist, or you can't open it.";

const rowSchema = z.object({ id: z.uuid(), owner_id: z.uuid(), inputs: z.unknown(), created_at: z.string(), updated_at: z.string() });

function toAudit(row: unknown): LoadAuditResult {
  const r = rowSchema.safeParse(row);
  const inputs = r.success ? parseInputs(r.data.inputs) : null;
  if (!r.success || !inputs || !inputs.ok) {
    console.error("loadAudit: unexpected row shape");
    return { ok: false, code: "invalid_data", message: "This audit's data couldn't be read. Ask an admin to check it." };
  }
  return { ok: true, audit: { id: r.data.id, ownerId: r.data.owner_id, inputs: inputs.inputs, createdAt: r.data.created_at, updatedAt: r.data.updated_at } };
}

export async function loadAudit(supabase: Supabase, id: string): Promise<LoadAuditResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, code: "not_found", message: NOT_FOUND };
  const { data, error } = await supabase.from("forwarder_audits").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) {
    console.error("loadAudit error:", error);
    return { ok: false, code: "load_failed", message: "The audit couldn't be loaded right now. Try again." };
  }
  if (!data) return { ok: false, code: "not_found", message: NOT_FOUND };
  return toAudit(data);
}

export type AuditListRow = {
  id: string;
  ownerId: string;
  reference: string;
  client: string;
  forwarder: string;
  status: string;
  updatedAt: string;
};
export type AuditList = { ok: true; rows: AuditListRow[]; more: boolean } | { ok: false; message: string };

export async function listAudits(supabase: Supabase): Promise<AuditList> {
  const { data, error } = await supabase
    .from("forwarder_audits")
    .select(COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(LIST_LIMIT + 1);
  if (error) {
    console.error("listAudits error:", error);
    return { ok: false, message: "The audits couldn't be loaded right now. Try again." };
  }
  const rows: AuditListRow[] = [];
  for (const row of (data ?? []).slice(0, LIST_LIMIT)) {
    const loaded = toAudit(row);
    if (!loaded.ok) {
      const id = (row as { id: string }).id;
      rows.push({ id, ownerId: "", reference: "(unreadable)", client: "", forwarder: "", status: "Can't be read", updatedAt: (row as { updated_at: string }).updated_at });
      continue;
    }
    const { audit } = loaded;
    rows.push({
      id: audit.id,
      ownerId: audit.ownerId,
      reference: audit.inputs.shipment.auditReference,
      client: audit.inputs.shipment.client,
      forwarder: audit.inputs.quotation.forwarder,
      status: runAudit(audit.inputs).figures.status,
      updatedAt: audit.updatedAt,
    });
  }
  return { ok: true, rows, more: (data ?? []).length > LIST_LIMIT };
}
