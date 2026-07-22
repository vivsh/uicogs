import { defineSchema } from "./test-utils.js";

import { describe, expect, it } from "vitest";
import { fields } from "./field.js";
import { ParseError } from "./issues.js";
import { struct } from "./struct.js";

@struct.Struct()
class ProjectModel {
  @struct.ID()
  readonly id!: number;

  @struct.Str({ required: true })
  name!: string;

  display(): string {
    return this.name.toUpperCase();
  }
}

describe("immutable schemas", () => {
  it("parses synchronously and composes without modifying its source", async () => {
    const base = defineSchema({
      id: fields.ID({ readonly: true }),
      name: fields.Str({
        required: true,
        validate: [({ value }) => value.length > 1 || "Too short"],
      }),
    });
    const extended = base.extend({ note: fields.Str() });
    const kept = extended.keep("id", "name");
    const modified = base.modify({
      name: (field) => field.modify({ help: "Visible label" }),
    });

    expect(base).not.toBe(extended);
    expect(extended).not.toBe(kept);
    expect(Object.keys(base.shape)).toEqual(["id", "name"]);
    expect(Object.keys(extended.shape)).toEqual(["id", "name", "note"]);
    expect(base.get("name").options.help).toBeUndefined();
    expect(modified.get("name").options.help).toBe("Visible label");
    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(base.shape)).toBe(true);

    const value = base.parse({ id: "4", name: "Ada" });
    expect(value).toEqual({ id: 4, name: "Ada" });
    expect((await base.validate(value)).valid).toBe(true);
    expect((await base.validate(base.parse({ id: 4, name: "A" }))).valid).toBe(false);
  });

  it("reports structured parse failures", () => {
    const schema = defineSchema({ name: fields.Str({ required: true }) });
    expect(() => schema.parse({})).toThrow(ParseError);
  });

  it("creates immutable read-only views with computed fields", () => {
    const schema = defineSchema({ id: fields.ID(), name: fields.Str({ required: true }) });
    const view = schema.view({
      fields: ["id", "name"] as const,
      computed: {
        label: fields.Computed({
          dependsOn: ["name"],
          get: ({ name }) => String(name).toUpperCase(),
        }),
      },
    });
    expect(view.materialize({ id: 1, name: "Ada" })).toEqual({ id: 1, name: "Ada", label: "ADA" });
    expect(() => view.write(view.parse({ id: 1, name: "Ada" }))).toThrow("read-only");
    expect(Object.isFrozen(view)).toBe(true);
  });

  it("constructs frozen class instances with their methods", () => {
    const schema = struct.toSchema(ProjectModel);
    const value = schema.parse({ id: 1, name: "Example" });
    expect(value).toBeInstanceOf(ProjectModel);
    expect(value.display()).toBe("EXAMPLE");
    expect(Object.isFrozen(value)).toBe(true);
  });
});
