import { defineSchema, registerResource } from "../../core/src/test-utils.js";

import { describe, expect, it } from "vitest";
import { createUiCogs, type Transport } from "@uicogs/core";
import { DataSource, fields, ModelSchema } from "./index.js";

interface Project {
  readonly id: number;
  readonly name: string;
}

describe("legacy migration adapters", () => {
  it("supports constructor fields and immutable schema composition", async () => {
    const model = new ModelSchema<Project, undefined>([
      new fields.IDField(),
      new fields.CharField({
        name: "name",
        required: true,
        validate: [({ value }) => value.length > 1 || "Too short"],
      }),
    ]);
    const extended = model.extend(new fields.TextField({ name: "note" }));

    expect(model.get("note")).toBeUndefined();
    expect(extended.get("note")).toBeDefined();
    const value = model.parse({ id: "1", name: "Example" });
    expect(value).toEqual({ id: 1, name: "Example" });
    expect((await model.validate(value)).valid).toBe(true);
  });

  it("maps the complete scalar constructor catalog to immutable runtime fields", () => {
    const constructors = [
      new fields.CharField("name", { required: true }),
      new fields.TextField({ name: "description" }),
      new fields.RichTextField({ name: "content" }),
      new fields.EmailField({ name: "email" }),
      new fields.PasswordField({ name: "password" }),
      new fields.PhoneNumberField({ name: "phone" }),
      new fields.IDField({ name: "identifier" }),
      new fields.IntegerField({ name: "count" }),
      new fields.FloatField({ name: "ratio" }),
      new fields.BooleanField({ name: "enabled" }),
      new fields.DateField({ name: "date" }),
      new fields.DatetimeField({ name: "datetime" }),
      new fields.TimeField({ name: "time" }),
      new fields.DateRangeField({ name: "range" }),
      new fields.StrListField({ name: "tags" }),
      new fields.IntegerListField({ name: "ids" }),
      new fields.RecordField({ name: "metadata" }),
      new fields.FileField({ name: "file" }),
      new fields.ImageField({ name: "image" }),
    ];

    expect(constructors.map((field) => field.name)).toEqual([
      "name",
      "description",
      "content",
      "email",
      "password",
      "phone",
      "identifier",
      "count",
      "ratio",
      "enabled",
      "date",
      "datetime",
      "time",
      "range",
      "tags",
      "ids",
      "metadata",
      "file",
      "image",
    ]);
    expect(constructors.every(Object.isFrozen)).toBe(true);
    expect(constructors[0]!.modify({ label: "Display name" })).not.toBe(constructors[0]);
  });

  it("supports both enum constructor forms", () => {
    const named = new fields.EnumField({
      name: "state",
      choices: ["draft", "ready"] as const,
      required: true,
    });
    const positional = new fields.EnumField("priority", [1, 2] as const);
    expect(named.field.parse("ready", ["state"])).toBe("ready");
    expect(positional.field.parse(2, ["priority"])).toBe(2);
  });

  it("composes model schemas without mutating the source", async () => {
    const context = { locale: "en" };
    const model = new ModelSchema<{ id: number; name: string }, typeof context>({
      fields: [new fields.IDField(), new fields.CharField("name", { required: true })],
      context: () => context,
    });
    const kept = model.keep("name");
    const dropped = model.drop("id");
    const modified = model.modify({ name: (field) => field.modify({ label: "Title" }) });
    const reordered = model.reorder("name", "id");
    const form = model.toForm({ mode: "patch" });

    expect(model.fields).toHaveLength(2);
    expect(kept.get("id")).toBeUndefined();
    expect(dropped.get("id")).toBeUndefined();
    expect(modified.get("name")?.options.label).toBe("Title");
    expect(Object.keys(reordered.schema.shape)).toEqual(["name", "id"]);
    expect(form.mode).toBe("patch");
    expect(model.write(model.parse({ id: 1, name: "One" }))).toEqual({ name: "One" });
    expect((await model.validate({ id: 1, name: "One" })).valid).toBe(true);
  });

  it("keeps mutable chaining while using the normalized resource engine", async () => {
    const transport: Transport = {
      request: async (request) => ({
        status: 200,
        data:
          request.method === "GET"
            ? [{ id: 1, name: "Existing" }]
            : { id: 1, ...(request.body as object) },
      }),
    };
    const cogs = createUiCogs({ context: undefined, transport });
    const schema = defineSchema({
      id: cogs.fields.ID({ readonly: true }),
      name: cogs.fields.Str({ required: true }),
    });
    const definition = registerResource(cogs)({
      name: "projects",
      url: "projects/",
      schema,
      key: "id",
    });
    const source = new DataSource<Project, number>({
      resource: cogs.resource(definition),
      key: "id",
    });

    expect(source.filter({ search: "one" }).sort("name").page(1, 10)).toBe(source);
    await source.load();
    expect(source.all()).toEqual([{ id: 1, name: "Existing" }]);
    expect(source.get(1)?.name).toBe("Existing");
    expect(await source.save({ id: 1, name: "Updated" })).toMatchObject({ name: "Updated" });
  });

  it("delegates every mutable data-source workflow to one resource instance", async () => {
    const resource = new FakeResource();
    const source = new DataSource<Project, number>({ resource, key: "id" });

    expect(source.loading).toBe(false);
    expect(source.error).toBeUndefined();
    expect(source.filter({ search: "one" }, { merge: false })).toBe(source);
    expect(source.sort("name", true)).toBe(source);
    expect(source.page(2)).toBe(source);
    expect(source.accumulate(false).nextPage().previousPage()).toBe(source);
    expect(source.hasMorePages()).toBe(true);
    await expect(source.load()).resolves.toEqual([{ id: 1, name: "One" }]);
    await expect(source.load(2)).resolves.toEqual({ id: 2, name: "Object" });
    await expect(source.refresh()).resolves.toEqual([{ id: 1, name: "One" }]);
    expect(source.all()).toEqual([{ id: 1, name: "One" }]);
    expect(source.get(2)).toEqual({ id: 2, name: "Object" });
    expect(source.object(2).key).toBe(2);
    await expect(source.create({ name: "Created" })).resolves.toMatchObject({ name: "Created" });
    await expect(source.update(2, { name: "Updated" })).resolves.toMatchObject({ name: "Updated" });
    await expect(source.save({ name: "New" })).resolves.toMatchObject({ name: "New" });
    await expect(source.save({ id: 2, name: "Saved" })).resolves.toMatchObject({ name: "Saved" });
    await expect(source.remove(2)).resolves.toBeUndefined();
    await expect(source.request("publish", { id: 2 })).resolves.toEqual({ published: true });
    source.invalidate();

    expect(resource.calls).toContain("filter");
    expect(resource.calls).toContain("invalidate");
  });

  it("supports direct resources, custom key selectors, and id fallback", async () => {
    const resource = new FakeResource();
    const direct = new DataSource<Project, number>(resource);
    const selected = new DataSource<Project, number>({
      resource,
      key: (value) => value.id,
    });

    await expect(direct.save({ id: 1, name: "Fallback" })).resolves.toMatchObject({
      name: "Fallback",
    });
    await expect(selected.save({ id: 2, name: "Selected" })).resolves.toMatchObject({
      name: "Selected",
    });
  });
});

class FakeResource {
  readonly loading = false;
  readonly error = undefined;
  readonly calls: string[] = [];

  filter(): this {
    this.calls.push("filter");
    return this;
  }
  sort(): this {
    this.calls.push("sort");
    return this;
  }
  page(): this {
    this.calls.push("page");
    return this;
  }
  accumulate(): this {
    this.calls.push("accumulate");
    return this;
  }
  nextPage(): this {
    this.calls.push("nextPage");
    return this;
  }
  previousPage(): this {
    this.calls.push("previousPage");
    return this;
  }
  hasMore(): boolean {
    return true;
  }
  async load(): Promise<readonly Project[]> {
    return this.all();
  }
  async refresh(): Promise<readonly Project[]> {
    return this.all();
  }
  all(): readonly Project[] {
    return [{ id: 1, name: "One" }];
  }
  get(key: number) {
    return {
      key,
      value: { id: key, name: "Object" },
      load: async () => ({ id: key, name: "Object" }),
      form: () => ({}),
    };
  }
  async create(input: Partial<Project>): Promise<Project> {
    return { id: 1, name: input.name ?? "Created" };
  }
  async update(key: number, input: Partial<Project>): Promise<Project> {
    return { id: key, name: input.name ?? "Updated" };
  }
  async replace(key: number, input: Partial<Project>): Promise<Project> {
    return { id: key, name: input.name ?? "Replaced" };
  }
  async remove(): Promise<void> {}
  async action(): Promise<unknown> {
    return { published: true };
  }
  invalidate(): void {
    this.calls.push("invalidate");
  }
}
