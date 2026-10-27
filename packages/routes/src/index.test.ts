import { describe, expect, it } from "vitest";
import { canAccessScopes, collectScopes, createNavigation } from "./index.js";

describe("scope access resolution", () => {
  /** Verifies scopes combine across a matched route chain without duplication. */
  it("collects additive scopes", () => {
    expect(collectScopes([["accounts.read"], undefined, ["accounts.read", "users.read"]])).toEqual([
      "accounts.read",
      "users.read",
    ]);
  });

  /** Verifies guest, authenticated, and required-scope route policies. */
  it("applies the declared access policy", () => {
    const guest = { authenticated: false, scopes: new Set<string>() };
    const member = { authenticated: true, scopes: new Set(["accounts.read", "users.read"]) };
    expect(canAccessScopes([undefined], guest)).toBe(true);
    expect(canAccessScopes([undefined], member)).toBe(false);
    expect(canAccessScopes([[]], member)).toBe(true);
    expect(canAccessScopes([["accounts.read"], ["users.read"]], member)).toBe(true);
    expect(canAccessScopes([["accounts.read"], ["users.write"]], member)).toBe(false);
  });

  /** Verifies shared group definitions are immutable and reject invalid parentage. */
  it("creates validated immutable navigation groups", () => {
    const navigation = createNavigation({
      side: { groups: [{ id: "admin", label: "Administration" }] },
    });
    expect(navigation.side?.groups?.[0]?.label).toBe("Administration");
    expect(Object.isFrozen(navigation)).toBe(true);
    expect(() =>
      createNavigation({ side: { groups: [{ id: "users", parent: "missing", label: "Users" }] } }),
    ).toThrow("Unknown UiCogs navigation group parent");
  });
});
