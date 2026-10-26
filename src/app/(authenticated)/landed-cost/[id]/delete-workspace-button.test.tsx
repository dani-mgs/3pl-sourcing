import { describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../actions", () => ({ deleteWorkspaceAction: vi.fn() }));

const { deleteDialogContent } = await import("./delete-workspace-button");

// B-13: the Delete workspace dialog says up front when locked versions are in
// the way, in the action's own words, and then offers no Delete.

describe("deleteDialogContent", () => {
  test("no locked versions: the confirmation, with Delete", () => {
    expect(deleteDialogContent("ZZQA LC Main", 0)).toEqual({
      message: "Delete “ZZQA LC Main” with all its SKUs, inputs and costs? This cannot be undone.",
      offerDelete: true,
      closeLabel: "Cancel",
    });
  });

  test("one locked version: delete it first, no Delete", () => {
    expect(deleteDialogContent("ZZQA LC Main", 1)).toEqual({
      message: "This workspace has 1 locked version. Delete it first.",
      offerDelete: false,
      closeLabel: "Close",
    });
  });

  test("two locked versions: delete them first, no Delete", () => {
    expect(deleteDialogContent("ZZQA LC Main", 2)).toEqual({
      message: "This workspace has 2 locked versions. Delete them first.",
      offerDelete: false,
      closeLabel: "Close",
    });
  });

  test("count unknown (the versions list didn't load): the confirmation, and the action decides", () => {
    expect(deleteDialogContent("ZZQA LC Main", null).offerDelete).toBe(true);
  });
});
