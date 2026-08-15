import { defineSchema } from "./test-utils.js";

import { describe, expect, it, vi } from "vitest";
import { fields, localFile, removedFile, remoteFile } from "./field.js";
import { ParseError, clientIssue } from "./issues.js";
import { struct } from "./struct.js";

describe("schema parsing and writing", () => {
  it("strips, passes through, and strictly checks unknown keys", () => {
    const shape = { name: fields.Str({ wireName: "display_name" }) };
    expect(defineSchema(shape).parse({ display_name: "Ada", ignored: true })).toEqual({
      name: "Ada",
    });
    expect(
      defineSchema(shape, { unknownKeys: "passthrough" }).parse({
        display_name: "Ada",
        ignored: true,
      }),
    ).toEqual({ display_name: "Ada", ignored: true, name: "Ada" });

    const strict = defineSchema(shape, { unknownKeys: "strict" });
    expect(strict.parse({ name: "Ada" })).toEqual({ name: "Ada" });
    expect(strict.parse({ display_name: "Ada" })).toEqual({ name: "Ada" });
    expect(() => strict.parse({ display_name: "Ada", ignored: true })).toThrow(ParseError);
    try {
      strict.parse({ ignored: true });
    } catch (error) {
      expect((error as ParseError).issues).toEqual([
        expect.objectContaining({ path: ["ignored"], code: "unknown_key" }),
      ]);
    }
  });

  it("parses partial values and reports object and field failures", () => {
    const schema = defineSchema({
      id: fields.Int({ required: true }),
      name: fields.Str({ required: true }),
    });
    expect(schema.parsePartial({ id: "2" })).toEqual({ id: 2 });
    expect(() => schema.parse("invalid")).toThrow("Expected an object");
    expect(() => schema.writeInput("invalid")).toThrow("Expected an object");
    expect(() => schema.writeInput({ id: "not-a-number", name: "Valid" })).toThrow(ParseError);
    expect(schema.canMaterialize({ id: 1 })).toBe(false);
    expect(schema.canMaterialize({ id: 1, name: "Ada" })).toBe(true);
  });

  it("retains valid partial values when another field cannot be parsed", () => {
    const schema = defineSchema({
      page: fields.Int({ wireName: "p" }),
      search: fields.Str({ wireName: "q" }),
    });

    const result = schema.parsePartialResult({ p: "2", q: ["invalid"] });

    expect(result.values).toEqual({ page: 2 });
    expect(result.issues).toMatchObject([{ path: ["search"] }]);
    expect(Object.isFrozen(result.values)).toBe(true);
    expect(Object.isFrozen(result.issues)).toBe(true);
  });

  it("applies access-aware field writers and query encoders", () => {
    const context = { writable: false, suffix: "!" };
    const definition = defineSchema.withContext<typeof context>()({
      id: fields.ID({ readonly: true }),
      name: fields.Str<typeof context>({
        required: true,
        wireName: "display_name",
        write: (value, current) => `${value.trim()}${current.suffix}`,
        query: (value) => value.toLowerCase(),
      }),
      secret: fields.Str({ writeonly: true }),
      protected: fields.Str<typeof context>({ writableWhen: (current) => current.writable }),
      note: fields.Str(),
      label: fields.Computed({ dependsOn: ["name"], get: ({ name }) => String(name) }),
    });
    const schema = definition.bindContext(() => context);
    const value = schema.parse({ id: 1, name: " Ada ", secret: "token", protected: "no" });
    expect(schema.write(value)).toEqual({ display_name: "Ada!", secret: "token" });
    expect(schema.writePartial({ name: " Bob ", note: undefined })).toEqual({
      display_name: "Bob!",
    });
    expect(schema.writeInput({ name: " Cara " }, { partial: true })).toEqual({
      display_name: "Cara!",
    });
    expect(schema.toQuery(value)).toEqual({ id: 1, display_name: " ada ", protected: "no" });
    const querySchema = schema.toQuery();
    expect(() => querySchema.parse({})).not.toThrow();
  });

  it("formats with bound context and describes serializable runtime metadata", () => {
    const definition = defineSchema.withContext<{ readonly locale: string }>()(
      {
        name: fields.Str({
          required: true,
          label: "Name",
          validate: [() => "hidden function"],
          metadata: { section: "identity" },
        }),
      },
      { format: (value, context) => `${value.name}:${context.locale}` },
    );
    const schema = definition.bindContext(() => ({ locale: "en" }));
    const value = schema.parse({ name: "Ada" });
    expect(schema.format(value)).toBe("Ada:en");
    expect(schema.describe().name).toMatchObject({
      kind: "string",
      label: "Name",
      metadata: { section: "identity" },
    });
    expect(schema.describe().name).not.toHaveProperty("validate");
    expect(schema.bindContext(() => ({ locale: "fr" })).format(value)).toBe("Ada:fr");
  });
});

describe("schema validation", () => {
  it("collects every validator result shape in deterministic order", async () => {
    const explicit = clientIssue(["name"], "Explicit", "explicit", "warning");
    const definition = defineSchema.withContext<{ readonly prefix: string }>()(
      {
        name: fields.Str({
          validate: [
            () => undefined,
            () => true,
            () => false,
            () => "String issue",
            ({ issue }) => issue("Field issue", "field"),
            () => [explicit],
          ],
        }),
      },
      {
        validate: [
          () => undefined,
          () => true,
          () => false,
          () => "Schema issue",
          ({ issue, context }) => issue([], context.prefix, "context"),
          () => [clientIssue([], "Schema warning", "warning", "warning")],
        ],
      },
    );
    const schema = definition.bindContext(() => ({ prefix: "ctx" }));
    const result = await schema.validate(schema.parse({ name: "Ada" }));
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message)).toEqual([
      "Invalid value",
      "String issue",
      "Field issue",
      "Explicit",
      "Invalid value",
      "Schema issue",
      "ctx",
      "Schema warning",
    ]);
    expect(Object.isFrozen(result.issues)).toBe(true);
  });

  it("stops pending validation when cancelled", async () => {
    const controller = new AbortController();
    const second = vi.fn();
    const schema = defineSchema(
      {
        name: fields.Str({
          validate: [
            () => {
              controller.abort();
              return "first";
            },
            second,
          ],
        }),
      },
      { validate: [second] },
    );
    const result = await schema.validate(schema.parse({ name: "Ada" }), {
      signal: controller.signal,
    });
    expect(result.issues.map((issue) => issue.message)).toEqual(["first"]);
    expect(second).not.toHaveBeenCalled();
  });

  it("treats warning-only validation as valid", async () => {
    const schema = defineSchema(
      { name: fields.Str() },
      { validate: [() => clientIssue([], "Warning", "warning", "warning")] },
    );
    expect(await schema.validate(schema.parse({ name: "Ada" }))).toMatchObject({ valid: true });
  });
});

describe("immutable schema composition and views", () => {
  it("supports merge, partial, required, drop, reorder, and form derivation", () => {
    const base = defineSchema({
      id: fields.ID({ required: true }),
      name: fields.Str(),
      obsolete: fields.Bool(),
    });
    const merged = base.merge(
      defineSchema({ name: fields.Text({ required: true }), note: fields.Str() }),
    );
    expect(Object.keys(merged.shape)).toEqual(["id", "name", "obsolete", "note"]);
    expect(merged.get("name").options.kind).toBe("text");
    expect(Object.keys(merged.drop("obsolete").shape)).toEqual(["id", "name", "note"]);
    expect(Object.keys(merged.reorder("note", "id").shape)).toEqual([
      "note",
      "id",
      "name",
      "obsolete",
    ]);
    expect(() => merged.partial().parse({})).not.toThrow();
    expect(() => base.required().parse({ id: 1 })).toThrow(ParseError);
    expect(merged.toForm({ mode: "patch" }).mode).toBe("patch");
    expect(Object.keys(base.shape)).toEqual(["id", "name", "obsolete"]);
  });

  it("materializes computed fields only when dependencies are available", () => {
    const source = defineSchema
      .withContext<{ readonly suffix: string }>()({
        id: fields.ID(),
        name: fields.Str({ required: true }),
      })
      .bindContext(() => ({ suffix: "!" }));
    const view = source.view({
      fields: ["id", "name"] as const,
      computed: {
        label: fields.Computed<string, { suffix: string }>({
          dependsOn: ["name"],
          get: (value, context) => `${value.name}${context.suffix}`,
        }),
        unavailable: fields.Computed({ dependsOn: ["missing"], get: () => "never" }),
      },
    });
    expect(view.source).toBe(source);
    expect(view.selected).toEqual(["id", "name"]);
    expect(view.materialize({ id: 1, name: "Ada" })).toEqual({
      id: 1,
      name: "Ada",
      label: "Ada!",
    });
    expect(() => view.writePartial({ id: 1 })).toThrow("read-only");
    expect(() => view.writeInput({ id: 1 })).toThrow("read-only");
  });
});

@struct.Struct()
class DecoratedBase {
  @struct.ID({ required: true })
  readonly id!: number;

  @struct.Str()
  inherited!: string;
}

@struct.Struct()
class DecoratedCatalog extends DecoratedBase {
  @struct.Text()
  text!: string;
  @struct.RichText()
  rich!: string;
  @struct.Markdown()
  markdown!: string;
  @struct.Email()
  email!: string;
  @struct.Password()
  password!: string;
  @struct.Phone()
  phone!: string;
  @struct.Int()
  count!: number;
  @struct.Float()
  ratio!: number;
  @struct.Bool()
  active!: boolean;
  @struct.Date()
  date!: Date;
  @struct.DateTime()
  dateTime!: Date;
  @struct.Time()
  time!: string;
  @struct.DateRange()
  range!: readonly [Date, Date];
  @struct.Enum(["open", "closed"] as const)
  status!: "open" | "closed";
  @struct.EnumList(["one", "two"] as const)
  choices!: readonly ("one" | "two")[];
  @struct.StrList()
  tags!: readonly string[];
  @struct.IntList()
  ids!: readonly number[];
  @struct.Record<{ readonly enabled: boolean }>()
  settings!: Readonly<{ enabled: boolean }>;
  @struct.File()
  attachment!: ReturnType<typeof remoteFile>;
  @struct.FileList()
  files!: readonly ReturnType<typeof removedFile>[];
  @struct.Image()
  image!: ReturnType<typeof localFile>;
  @struct.ImageList()
  images!: readonly ReturnType<typeof remoteFile>[];
  @struct.Computed({ dependsOn: ["text"], get: ({ text }) => String(text).toUpperCase() })
  label!: string;
}

describe("class schema authoring", () => {
  it("collects inherited decorator metadata and the complete scalar catalog", () => {
    const schema = struct.toSchema(DecoratedCatalog);
    const blob = new Blob(["image"], { type: "image/png" });
    const value = schema.parse({
      id: "1",
      inherited: "base",
      text: "text",
      rich: "<p>rich</p>",
      markdown: "## Markdown",
      email: "person@example.test",
      password: "secret",
      phone: "+1 555 0100",
      count: "2",
      ratio: "1.5",
      active: "true",
      date: "2026-07-21",
      dateTime: "2026-07-21T10:00:00Z",
      time: "10:30",
      range: ["2026-07-01", "2026-07-31"],
      status: "open",
      choices: ["one"],
      tags: ["a"],
      ids: ["2"],
      settings: { enabled: true },
      attachment: "https://example.test/file.txt",
      files: [removedFile()],
      image: blob,
      images: [remoteFile("https://example.test/image.png")],
    });
    expect(value).toBeInstanceOf(DecoratedCatalog);
    expect(value.label).toBe("TEXT");
    expect(value.count).toBe(2);
    expect(value.image.kind).toBe("local");
    expect(Object.keys(schema.shape)).toContain("inherited");
  });

  it("allows subclasses to replace inherited field declarations", () => {
    class Parent {
      @struct.Str()
      value!: unknown;
    }
    class Child extends Parent {
      @struct.Int()
      override value = 0;
    }
    const schema = struct.toSchema(Child);
    expect(schema.parse({ value: "3" }).value).toBe(3);
  });
});
