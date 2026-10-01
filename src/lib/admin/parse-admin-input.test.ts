import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  parseCreateUser,
  parseDeleteClient,
  parseDeleteUser,
  parseReassignOwner,
  parseUpdateClient,
  parseUpdateUserDisplayName,
  parseUpdateUserRole,
} from "./parse-admin-input";

const VALID_UUID = "123e4567-e89b-42d3-a456-426614174000";
const OTHER_UUID = "00000000-0000-4000-8000-0000000000a1";
const INVALID_REQUEST = "Something went wrong with that request. Reload the page and try again.";

// Failures log the raw issues server-side; keep test output quiet but check
// that it happens.
let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

function errorOf(result: { ok: true } | { ok: false; error: string }): string | null {
  return result.ok ? null : result.error;
}

describe("parseReassignOwner", () => {
  test("accepts valid input for either module", () => {
    for (const table of ["three_pl_projects", "forwarder_projects"]) {
      const result = parseReassignOwner({ projectId: VALID_UUID, newOwnerId: OTHER_UUID, table });
      expect(result).toEqual({
        ok: true,
        data: { projectId: VALID_UUID, newOwnerId: OTHER_UUID, table },
      });
    }
  });

  test("rejects an unknown table", () => {
    const result = parseReassignOwner({ projectId: VALID_UUID, newOwnerId: OTHER_UUID, table: "clients" });
    expect(errorOf(result)).toBe(INVALID_REQUEST);
  });

  test("rejects malformed ids and logs the issues", () => {
    expect(errorOf(parseReassignOwner({ projectId: "1", newOwnerId: OTHER_UUID, table: "forwarder_projects" }))).toBe(
      INVALID_REQUEST,
    );
    expect(errorOf(parseReassignOwner({ projectId: VALID_UUID, newOwnerId: null, table: "forwarder_projects" }))).toBe(
      INVALID_REQUEST,
    );
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("parseUpdateUserDisplayName", () => {
  test("trims the name", () => {
    expect(parseUpdateUserDisplayName({ userId: VALID_UUID, name: "  Dani  " })).toEqual({
      ok: true,
      data: { userId: VALID_UUID, name: "Dani" },
    });
  });

  test("rejects a blank name", () => {
    expect(errorOf(parseUpdateUserDisplayName({ userId: VALID_UUID, name: "   " }))).toBe("Name is required.");
  });

  test("rejects a name over 200 characters", () => {
    expect(errorOf(parseUpdateUserDisplayName({ userId: VALID_UUID, name: "a".repeat(201) }))).toBe(
      "Name must be 200 characters or fewer.",
    );
  });

  test("rejects a malformed user id", () => {
    expect(errorOf(parseUpdateUserDisplayName({ userId: "abc", name: "Dani" }))).toBe(INVALID_REQUEST);
  });
});

describe("parseCreateUser", () => {
  const valid = {
    email: "  new.user@example.com ",
    password: "correct horse",
    firstName: " Sam ",
    role: "logistics_expert",
  };

  test("accepts valid input, trimming email and first name but not the password", () => {
    expect(parseCreateUser({ ...valid, password: " spaced pw " })).toEqual({
      ok: true,
      data: {
        email: "new.user@example.com",
        password: " spaced pw ",
        firstName: "Sam",
        role: "logistics_expert",
      },
    });
  });

  test("allows a blank first name", () => {
    const result = parseCreateUser({ ...valid, firstName: "  " });
    expect(result.ok && result.data.firstName).toBe("");
  });

  test("rejects a blank or invalid email", () => {
    expect(errorOf(parseCreateUser({ ...valid, email: " " }))).toBe("Email is required.");
    expect(errorOf(parseCreateUser({ ...valid, email: "not-an-email" }))).toBe("Enter a valid email address.");
  });

  test("rejects a password shorter than 8 or longer than 72 characters", () => {
    expect(errorOf(parseCreateUser({ ...valid, password: "short" }))).toBe(
      "Password must be at least 8 characters.",
    );
    expect(errorOf(parseCreateUser({ ...valid, password: "x".repeat(73) }))).toBe(
      "Password must be 72 characters or fewer.",
    );
    expect(parseCreateUser({ ...valid, password: "x".repeat(72) }).ok).toBe(true);
  });

  test("rejects an unknown role", () => {
    expect(errorOf(parseCreateUser({ ...valid, role: "superuser" }))).toBe("Choose a valid role.");
  });

  test("rejects an over-long first name", () => {
    expect(errorOf(parseCreateUser({ ...valid, firstName: "a".repeat(201) }))).toBe(
      "First name must be 200 characters or fewer.",
    );
  });
});

describe("parseDeleteUser", () => {
  test("accepts a uuid", () => {
    expect(parseDeleteUser({ userId: VALID_UUID })).toEqual({ ok: true, data: { userId: VALID_UUID } });
  });

  test("rejects a malformed id", () => {
    expect(errorOf(parseDeleteUser({ userId: "" }))).toBe(INVALID_REQUEST);
  });
});

describe("parseUpdateUserRole", () => {
  test("accepts both roles", () => {
    for (const newRole of ["admin", "logistics_expert"]) {
      expect(parseUpdateUserRole({ userId: VALID_UUID, newRole })).toEqual({
        ok: true,
        data: { userId: VALID_UUID, newRole },
      });
    }
  });

  test("rejects an unknown role or malformed id", () => {
    expect(errorOf(parseUpdateUserRole({ userId: VALID_UUID, newRole: "owner" }))).toBe("Choose a valid role.");
    expect(errorOf(parseUpdateUserRole({ userId: "x", newRole: "admin" }))).toBe(INVALID_REQUEST);
  });
});

describe("parseUpdateClient", () => {
  test("trims the name and turns a blank business model into null", () => {
    expect(parseUpdateClient({ clientId: VALID_UUID, name: " Acme ", businessModel: "  " })).toEqual({
      ok: true,
      data: { clientId: VALID_UUID, name: "Acme", businessModel: null },
    });
    const result = parseUpdateClient({ clientId: VALID_UUID, name: "Acme", businessModel: " DTC " });
    expect(result.ok && result.data.businessModel).toBe("DTC");
  });

  test("rejects a blank or over-long name", () => {
    expect(errorOf(parseUpdateClient({ clientId: VALID_UUID, name: " ", businessModel: "" }))).toBe(
      "Client name is required.",
    );
    expect(errorOf(parseUpdateClient({ clientId: VALID_UUID, name: "a".repeat(201), businessModel: "" }))).toBe(
      "Client name must be 200 characters or fewer.",
    );
  });

  test("rejects an over-long business model", () => {
    expect(
      errorOf(parseUpdateClient({ clientId: VALID_UUID, name: "Acme", businessModel: "a".repeat(501) })),
    ).toBe("Business model must be 500 characters or fewer.");
  });

  test("rejects a malformed client id", () => {
    expect(errorOf(parseUpdateClient({ clientId: "nope", name: "Acme", businessModel: "" }))).toBe(INVALID_REQUEST);
  });
});

describe("parseDeleteClient", () => {
  test("accepts a uuid and rejects anything else", () => {
    expect(parseDeleteClient({ clientId: VALID_UUID })).toEqual({ ok: true, data: { clientId: VALID_UUID } });
    expect(errorOf(parseDeleteClient({ clientId: 42 }))).toBe(INVALID_REQUEST);
  });
});
