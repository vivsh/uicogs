import { defineSchema } from "./test-utils.js";

import { describe, expect, it } from "vitest";
import { editor, filter, format, sort } from "./descriptors.js";
import { fields, localFile, remoteFile, removedFile, type Field, type JsonValue } from "./field.js";

const path = ["value"] as const;
type RuntimeField = Field<unknown, unknown, unknown, unknown, boolean, boolean, boolean>;

describe("field catalog", () => {
  it("parses and writes every scalar and temporal field family", () => {
    expect(fields.Str().parse("value", path)).toBe("value");
    expect(fields.Text().parse("long", path)).toBe("long");
    expect(fields.RichText().parse("<p>text</p>", path)).toBe("<p>text</p>");
    expect(fields.Markdown().parse("## Heading", path)).toBe("## Heading");
    expect(fields.Email().parse("person@example.test", path)).toBe("person@example.test");
    expect(fields.Password().parse("secret", path)).toBe("secret");
    expect(fields.Phone().parse("+12025550123", path)).toBe("+12025550123");
    expect(fields.ID().parse("7", path)).toBe(7);
    expect(fields.Int().parse("8", path)).toBe(8);
    expect(fields.Float().parse("8.5", path)).toBe(8.5);
    expect(fields.Bool().parse("yes", path)).toBe(true);
    expect(fields.Bool().parse("off", path)).toBe(false);
    expect(fields.Bool({ nullable: true }).parse(null, path)).toBeNull();
    const nullableBoolean = defineSchema({ featured: fields.Bool({ nullable: true }) });
    const nullableValue = nullableBoolean.parse({ featured: null });
    expect(nullableBoolean.write(nullableValue)).toEqual({ featured: null });
    expect(nullableBoolean.toQuery(nullableValue)).toEqual({});

    const date = fields.Date().parse("2026-01-02", path);
    const dateTime = fields.DateTime().parse("2026-01-02T03:04:05Z", path);
    expect(fields.Date().write(date, undefined)).toBe("2026-01-02");
    expect(fields.DateTime().write(dateTime, undefined)).toContain("2026-01-02T03:04:05");
    expect(fields.Time().parse("12:30", path)).toBe("12:30");
    const range = fields.DateRange().parse({ from: "2026-01-01", to: "2026-01-02" }, path);
    expect(fields.DateRange().write(range, undefined)).toEqual(["2026-01-01", "2026-01-02"]);
  });

  it("parses enum, list, record, JSON, and unknown boundaries", () => {
    expect(fields.Enum(["open", "closed"] as const).parse("open", path)).toBe("open");
    expect(fields.EnumList(["open", "closed"] as const).parse(["open"], path)).toEqual(["open"]);
    expect(fields.StrList().parse(["one", "two"], path)).toEqual(["one", "two"]);
    expect(fields.IntList().parse(["1", 2], path)).toEqual([1, 2]);
    expect(fields.Record<{ readonly name: string }>().parse({ name: "value" }, path)).toEqual({
      name: "value",
    });
    const json: JsonValue = { nested: [1, true, null] };
    expect(fields.JSON().parse(json, path)).toEqual(json);
    expect(fields.Unknown().parse(Symbol.for("value"), path)).toBe(Symbol.for("value"));
  });

  it("parses nested objects and object lists and delegates validation", async () => {
    const item = defineSchema({
      name: fields.Str({
        required: true,
        validate: [({ value }) => value.length > 1 || "Too short"],
      }),
    });
    const object = fields.Object(item);
    const list = fields.ObjectList(item);
    expect(object.parse({ name: "One" }, path)).toEqual({ name: "One" });
    expect(list.parse([{ name: "One" }], path)).toEqual([{ name: "One" }]);
    expect(
      (
        await object.validate(
          { name: "A" },
          { name: "A" },
          undefined,
          new AbortController().signal,
          path,
        )
      ).length,
    ).toBe(1);
    expect(list.write([{ name: "One" }], undefined)).toEqual([{ name: "One" }]);
  });

  it("represents local, remote, removed, and repeated files explicitly", () => {
    const blob = new Blob(["content"], { type: "text/plain" });
    const local = localFile(blob, "note.txt");
    const remote = remoteFile("/files/note.txt", "note.txt", "text/plain");
    const removed = removedFile();
    expect(fields.File().parse(local, path)).toBe(local);
    expect(fields.Image().parse(remote, path)).toBe(remote);
    expect(fields.File().write(local, undefined)).toBe(blob);
    expect(fields.File().write(remote, undefined)).toBeUndefined();
    expect(fields.File().write(removed, undefined)).toBeNull();
    expect(fields.FileList().write([local, remote, removed], undefined)).toEqual([
      blob,
      undefined,
      null,
    ]);
    expect(fields.ImageList().parse([local], path)).toEqual([local]);
  });

  it("applies defaults, empty policy, nullability, query writers, and access", () => {
    const field = fields.Str({
      default: "default",
      empty: "preserve",
      nullable: true,
      query: (value) => value.toUpperCase(),
      writableWhen: (context: { readonly allowed: boolean }) => context.allowed,
    });
    expect(field.parse(undefined, path)).toBe("default");
    expect(field.parse("", path)).toBe("");
    expect(field.parse(null, path)).toBeNull();
    expect(field.toQuery("value", { allowed: true })).toBe("VALUE");
    expect(field.modify({ help: "Help" }).options.help).toBe("Help");
  });

  it("preserves immutable form and filter layout declarations", () => {
    const field = fields.Str({
      layout: {
        form: { xs: 12, md: 6 },
        filter: { xs: 12, md: 4, placement: "collapsible" },
      },
    });
    expect(field.options.layout).toEqual({
      form: { xs: 12, md: 6 },
      filter: { xs: 12, md: 4, placement: "collapsible" },
    });
    expect(Object.isFrozen(field.options.layout)).toBe(true);
    expect(field.modify({ layout: { form: { xs: "grow" } } }).options.layout).toEqual({
      form: { xs: "grow" },
    });
    expect(field.describe()).toMatchObject({ layout: field.options.layout });
  });

  it("covers semantic editor, formatter, filter, and sorter factories", () => {
    const descriptors = [
      editor.Text(),
      editor.Textarea(),
      editor.RichText(),
      editor.Markdown({ defaultView: "preview" }),
      editor.Email(),
      editor.Password(),
      editor.Number(),
      editor.Checkbox(),
      editor.Switch(),
      editor.Select(),
      editor.Autocomplete(),
      editor.Date(),
      editor.Time(),
      editor.DateTime(),
      editor.DateRange(),
      editor.Reference(),
      editor.ReferenceList(),
      editor.File(),
      editor.Image(),
      editor.Color(),
      editor.StringList(),
      editor.Hidden(),
      format.Text(),
      format.Boolean(),
      format.Number(),
      format.Choice(),
      format.Choices(),
      format.Date(),
      format.Time(),
      format.DateTime(),
      format.DateRange(),
      format.Markdown(),
      format.Reference(),
      format.ReferenceList(),
      format.Image(),
      format.File(),
      format.Link(),
      format.Concat([format.Text()]),
      filter.Contains(),
      filter.Exact(),
      filter.Range(),
      filter.Custom({ predicate: () => true }),
      sort.Value(),
      sort.Key("owner.name"),
      sort.Custom({ compare: () => 0 }),
    ];
    expect(descriptors.every((descriptor) => Object.isFrozen(descriptor))).toBe(true);
    expect(new Set(descriptors.map((descriptor) => descriptor.kind)).size).toBeGreaterThan(20);
  });

  it("rejects invalid catalog inputs", () => {
    const invalid: readonly [RuntimeField, unknown][] = [
      [fields.Int(), "1.5"],
      [fields.Float(), "none"],
      [fields.Date(), "not-date"],
      [fields.Time(), "35:90"],
      [fields.Enum(["one"] as const), "two"],
      [fields.StrList(), "not-list"],
      [fields.Record(), []],
      [fields.JSON({ required: true }), undefined],
    ];
    for (const [field, value] of invalid) expect(() => field.parse(value, path)).toThrow();
  });
});
