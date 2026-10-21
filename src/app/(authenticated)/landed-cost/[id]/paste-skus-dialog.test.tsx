import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { scenario, vietnamScenario, workspace } from "@/lib/landed-cost/__fixtures__/workspace-builders";
import { toEditorDraft } from "@/lib/landed-cost/editor-draft";
import { parseSkuPaste } from "@/lib/landed-cost/parse-sku-paste";
import { previewSkuPaste } from "@/lib/landed-cost/sku-paste";
import { PastePreviewTable } from "./paste-skus-dialog";

// The paste preview as rendered: what happens to each row, in words.

describe("PastePreviewTable", () => {
  test("Update, Add and Error in words, with the errors, warnings and ignored columns", () => {
    const draft = toEditorDraft(workspace({ scenarios: [scenario(), vietnamScenario()] }))!;
    const parsed = parseSkuPaste("SKU\tQuantity\tTariff Cost\nSKU-001\t\t$9\nSKU-002 - VIETNAM\t5\nSKU-003\tmany\n");
    if (!parsed.ok) throw new Error(parsed.error);
    const html = renderToStaticMarkup(<PastePreviewTable preview={previewSkuPaste(draft, draft.scenarios[1].ref, parsed)} />);
    expect(html).toContain("1 to update, 1 to add, 1 with errors (skipped if you apply the valid rows).");
    for (const word of [">Update<", ">Add<", ">Error<", ">kept<"]) expect(html).toContain(word);
    expect(html).toContain("Enter the quantity as a whole number from 1 to 999,999,999,999.");
    expect(html).toContain("Still needed before saving: HTS code");
    expect(html).toContain("This SKU code seems to include a country (VIETNAM).");
    expect(html).toContain("Columns not imported");
    expect(html).toContain("Rates and fees come from the tariff engine.");
  });
});
