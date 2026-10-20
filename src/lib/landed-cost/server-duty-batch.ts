import type { createClient } from "@/lib/supabase/server";
import { todayUtc } from "@/lib/fx/server-rates";
import { customsValueInUsd, type ReleaseInfo } from "@/lib/tariff/calculate";
import { inForce } from "@/lib/tariff/customs-fees";
import { formatHtsCode } from "@/lib/tariff/hts-code";
import { matchHtsLine } from "@/lib/tariff/hts-line-match";
import { assembleAdditionalDutyData } from "@/lib/tariff/server-duty-data";
import { parseDutyRequest, type DutyBatchResult, type DutyRequest, type LineDutyResult, type ValidLine } from "./duty-request";
import { readHtsLines, readReviewDetails, readScope, readShared } from "./server-duty-reads";
import { computeSkuDuty } from "./sku-duty";

// SERVER-ONLY. Duties for many SKU lines and origins in one call, from the
// Tariff Calculator's engine: for each line the same base duty, additional
// duties, warnings, reviews and incomplete status as buildEstimate gives for
// that HTS code, origin, value, quantity and entry date (fees excluded:
// Landed Cost works them out per entry). Shared data is read once per call
// (server-duty-reads.ts); a bad line fails alone. Uses the caller's client,
// so RLS applies. The caller (a Server Action) checks requireStaff() first.

type Supabase = Awaited<ReturnType<typeof createClient>>;

const LOAD_FAILED = "Duties couldn't be loaded right now. Try again.";

// `calculatedOn` defaults to today (UTC): the entry date's bounds and the age
// of duty reviews are judged on it, as for an estimate.
export async function loadSkuDuties(
  supabase: Supabase,
  request: DutyRequest,
  calculatedOn: string = todayUtc(),
): Promise<DutyBatchResult> {
  const parsed = parseDutyRequest(request, calculatedOn);
  if (!parsed.ok) return parsed;
  const { entryDate, items } = parsed;
  const valid = items.filter((i): i is ValidLine => !("ok" in i));
  if (valid.length === 0) return { ok: true, entryDate, lines: items as LineDutyResult[] };

  try {
    const origins = [...new Set(valid.map((v) => v.originCountry))];
    const shared = await readShared(supabase, origins);
    if (!shared.release) {
      return { ok: false, code: "no_release", message: "HTS data hasn't been imported yet. Try again later." };
    }
    const release = shared.release;
    const [htsLines, reviewDetails] = await Promise.all([
      readHtsLines(supabase, release.id, [...new Set(valid.map((v) => v.digits))]),
      readReviewDetails(supabase, shared.statuses),
    ]);
    const releaseInfo: ReleaseInfo = { name: release.name, title: release.title, release_start_date: release.release_start_date };
    const matches = new Map(valid.map((v) => [v.digits, matchHtsLine(v.digits, htsLines)]));
    const codes = [...new Set([...matches.values()].flatMap((m) => (m && "line" in m ? [m.line.hts_code] : [])))];
    const scope = await readScope(supabase, codes);

    const dutyDataByCode = new Map(
      codes.map((code) => [
        code,
        assembleAdditionalDutyData(code, entryDate, { duties: shared.duties, scope, statuses: shared.statuses, ...reviewDetails }),
      ]),
    );
    const column2 = new Set(shared.column2.filter((r) => inForce(r, entryDate)).map((r) => r.country_code));

    const lines = items.map((item): LineDutyResult => {
      if ("ok" in item) return item;
      const match = matches.get(item.digits);
      if (!match) {
        return {
          ok: false,
          lineId: item.lineId,
          code: "hts_not_found",
          message: `${formatHtsCode(item.digits)} isn't in the current HTS (${release.title ?? release.name}). Check the code.`,
        };
      }
      if ("error" in match) return { ok: false, lineId: item.lineId, code: "hts_ambiguous", message: match.error };
      return computeSkuDuty({
        lineId: item.lineId,
        line: match.line,
        matchedTenDigit: match.matchedTenDigit,
        release: releaseInfo,
        originCountry: item.originCountry,
        originIsColumn2: column2.has(item.originCountry),
        // USD already: the value rounded to the cent, as buildEstimate does at rate 1.
        customsValueUsd: customsValueInUsd(item.enteredValueUsd, "1"),
        quantity: item.quantity,
        programs: shared.programs,
        dutyData: dutyDataByCode.get(match.line.hts_code)!,
        asOfDate: calculatedOn,
        entryDate,
      });
    });
    return { ok: true, entryDate, lines };
  } catch (error) {
    // Details stay in the server log; the caller gets a plain message.
    console.error("loadSkuDuties error:", error);
    return { ok: false, code: "load_failed", message: LOAD_FAILED };
  }
}
