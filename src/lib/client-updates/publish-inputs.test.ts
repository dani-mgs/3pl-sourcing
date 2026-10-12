import { describe, expect, test } from "vitest";
import { parsePublishForm, parseStoredInputs } from "./publish-inputs";

const A = "00000000-0000-4000-8000-0000000f0000";
const B = "00000000-0000-4000-8000-0000000f0001";

function form(fields: Record<string, string | string[]>) {
  const data = new FormData();
  const base: Record<string, string | string[]> = {
    stage: "4",
    headline: "Comparing options",
    summary: "We have six like-for-like quotes.",
    ...fields,
  };
  for (const [k, v] of Object.entries(base)) for (const one of [v].flat()) data.append(k, one);
  return data;
}

describe("parsePublishForm", () => {
  test("a full form", () => {
    const result = parsePublishForm(
      form({
        nextStep: " Your decision ",
        nextStepDue: "2026-10-17",
        needsClientAction: "on",
        milestone_label_0: "Quotes due",
        milestone_planned_0: "2026-10-01",
        milestone_actual_0: "2026-10-03",
        partnerIds: [A, B, A],
        recommendedId: A,
        reason_0: "Cheapest",
        reason_1: " ",
        reason_2: "Weekly sailings",
        tradeOff_0: "Insurance extra",
        basedOn: "You told us cost matters most.",
        section_cost: "on",
        section_funnel: "on",
        includeAnnual: "on",
        contactEmail: " Team@Move.Example ",
      }),
    );
    expect(result).toEqual({
      ok: true,
      data: {
        stage: 4,
        headline: "Comparing options",
        summary: "We have six like-for-like quotes.",
        nextStep: "Your decision",
        nextStepDue: "2026-10-17",
        needsClientAction: true,
        milestones: [{ label: "Quotes due", planned: "2026-10-01", actual: "2026-10-03" }],
        partnerIds: [A, B],
        recommendedId: A,
        reasons: ["Cheapest", "Weekly sailings"],
        tradeOffs: ["Insurance extra"],
        basedOn: "You told us cost matters most.",
        sections: { funnel: true, cost: true, leadTime: false, fcr: false, validity: false },
        includeAnnual: true,
        contactEmail: "team@move.example",
      },
    });
  });

  test("the contact email is optional", () => {
    const result = parsePublishForm(form({}));
    expect(result.ok && result.data.contactEmail).toBeNull();
  });

  test.each([
    [{ stage: "8" }, "Choose a stage."],
    [{ stage: "" }, "Choose a stage."],
    [{ headline: " " }, "Write a headline."],
    [{ summary: "" }, "Write where we are."],
    [{ headline: "x".repeat(121) }, "Headline: use 120 characters or fewer."],
    [{ nextStepDue: "2026-02-30" }, "Next step due: use a real date."],
    [{ contactEmail: "not an email" }, "Contact email: enter a valid email address, or leave it empty."],
    [{ partnerIds: "' or 1=1" }, "Choose partners from the list."],
    [{ recommendedId: "x" }, "Choose the recommended partner from the list."],
    [{ partnerIds: B, recommendedId: A }, "Include the recommended partner in the partners you share."],
    [{ milestone_planned_0: "2026-10-01" }, "Give every milestone a name, or clear its dates."],
    [{ milestone_label_0: "Kickoff" }, 'Milestone "Kickoff": add a planned or actual date.'],
    [{ milestone_label_0: "Kickoff", milestone_planned_0: "10/01/2026" }, 'Milestone "Kickoff": use real dates.'],
  ])("refuses %o", (fields, error) => {
    expect(parsePublishForm(form(fields))).toEqual({ ok: false, error });
  });

  test("stored inputs round-trip, and junk is ignored", () => {
    const result = parsePublishForm(form({ contactEmail: "a@b.co", nextStepDue: "2026-10-17" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(parseStoredInputs(JSON.parse(JSON.stringify(result.data)))).toEqual(result.data);
    expect(parseStoredInputs({ stage: 3 })).toBeNull();
    expect(parseStoredInputs(null)).toBeNull();
  });
});
