import { describe, expect, it } from "vitest";
import { createUiCogs, uiCogsIconNames } from "./index.js";

describe("UiCogs icon registry", () => {
  it("keeps semantic defaults immutable and resolves application overrides", () => {
    const cogs = createUiCogs({
      icons: {
        close: "xmark",
        archive: "box-archive",
      },
    });

    expect(uiCogsIconNames).toContain("dateRange");
    expect(cogs.icon("close")).toBe("xmark");
    expect(cogs.icon("archive")).toBe("box-archive");
    expect(cogs.icon("unknown")).toBe("unknown");
    expect(Object.isFrozen(cogs.icons)).toBe(true);
    expect(Reflect.set(cogs.icons, "close", "changed")).toBe(false);
    expect(createUiCogs({ icons: { close: undefined } }).icons.close).toBe("close");
  });

  it("rejects non-string JavaScript icon overrides", () => {
    expect(() =>
      createUiCogs({ icons: { close: 1 } as unknown as { readonly close: string } }),
    ).toThrow("UiCogs icon close must be a string");
  });
});
