import { defineSchema, registerResource } from "./test-utils.js";

import { describe, expect, it } from "vitest";
import { clientIssue } from "./issues.js";
import { createUiCogs } from "./factory.js";
import {
  Field,
  fields,
  isBinaryPart,
  isFileValue,
  localFile,
  relation,
  remoteFile,
} from "./field.js";

const path = ["value"] as const;
const context = { allowed: true };

describe("field edge contracts", () => {
  it("handles required, defaults, empties, nulls, and parser failures", () => {
    const required = fields.Text({ required: true });
    expect(() => required.parse(undefined, path)).toThrow("Field is required");
    expect(() => required.parse(null, path)).toThrow("Null is not allowed");
    expect(fields.Text({ default: () => "generated" }).parse(undefined, path)).toBe("generated");
    expect(fields.Text({ empty: "null", nullable: true }).parse("", path)).toBeNull();
    expect(fields.Text().parse(undefined, path)).toBeUndefined();
    expect(() => fields.Text().parse(4, path)).toThrow("Expected a string");
    expect(() =>
      fields
        .Text({
          parse: () => {
            throw "invalid";
          },
        })
        .parse("x", path),
    ).toThrow("Invalid value");
  });

  it("applies string and numeric constraints in both directions", async () => {
    const text = fields.Text({ minLength: 2, maxLength: 4, pattern: /^[A-Z]+$/, trim: true });
    expect(text.parse(" AB ", path)).toBe("AB");
    expect((await validate(text, "A")).map((issue) => issue.message)).toEqual([
      "Must contain at least 2 characters",
    ]);
    expect((await validate(text, "ABCDE")).map((issue) => issue.message)).toEqual([
      "Must contain at most 4 characters",
    ]);
    expect((await validate(text, "Ab")).map((issue) => issue.message)).toEqual(["Invalid format"]);
    expect(await validate(text, "ABC")).toEqual([]);

    const integer = fields.Int({ min: 2, max: 4 });
    expect((await validate(integer, 1))[0]?.message).toBe("Must be at least 2");
    expect((await validate(integer, 5))[0]?.message).toBe("Must be at most 4");
    expect(await validate(integer, 3)).toEqual([]);
    expect(fields.Int({ parse: () => 9 }).parse("custom", path)).toBe(9);
  });

  it("covers every boolean, date, time, and range representation", () => {
    for (const truthy of [true, "true", "yes", "on", 1, "1"]) {
      expect(fields.Bool().parse(truthy, path)).toBe(true);
    }
    for (const falsey of [false, "false", "no", "off", 0, "0"]) {
      expect(fields.Bool().parse(falsey, path)).toBe(false);
    }
    expect(() => fields.Bool().parse("sometimes", path)).toThrow("Expected a boolean");

    const source = new Date("2026-02-03T04:05:06Z");
    expect(fields.Date().parse(source, path)).not.toBe(source);
    expect(fields.DateTime().parse(source.getTime(), path).toISOString()).toBe(
      source.toISOString(),
    );
    expect(fields.Date().toQuery(source, undefined)).toBe("2026-02-03");
    expect(fields.DateTime().toQuery(source, undefined)).toBe(source.toISOString());
    expect(fields.Time().parse("23:59:58", path)).toBe("23:59:58");
    expect(fields.DateRange().parse("2026-02-03", path)).toHaveLength(2);
    expect(fields.DateRange().parse(["2026-02-03", "2026-02-04"], path)).toHaveLength(2);
    expect(() => fields.DateRange().parse(["2026-02-03"], path)).toThrow("Expected a date range");
  });

  it("validates lists, JSON boundaries, and generated empty defaults", () => {
    expect(fields.StrList().parse(undefined, path)).toEqual([]);
    expect(fields.IntList().write([1, 2], undefined)).toEqual([1, 2]);
    expect(() => fields.StrList().parse(["one", 2], path)).toThrow("Expected a string");
    expect(() => fields.IntList().parse([1.5], path)).toThrow("Expected an integer");
    expect(() => fields.EnumList(["one"] as const).parse(["two"], path)).toThrow(
      "Expected an allowed value",
    );
    expect(fields.JSON({ nullable: true }).parse(null, path)).toBeNull();
    for (const value of ["text", true, 2, [1, false], { nested: "yes" }]) {
      expect(fields.JSON().parse(value, path)).toEqual(value);
    }
    expect(() => fields.JSON().parse(Number.NaN, path)).toThrow("Expected a JSON value");
    expect(() => fields.JSON().parse(Symbol("invalid"), path)).toThrow("Expected a JSON value");
  });

  it("normalizes file inputs, names, and guards", () => {
    const blob = new Blob(["file"], { type: "text/plain" });
    const local = localFile(blob);
    const remote = remoteFile("/files/report%20one.txt?download=true");
    expect(local.name).toBe("file");
    expect(remote.name).toBe("report one.txt");
    expect(fields.File().parse("/files/one.txt", path)).toMatchObject({ kind: "remote" });
    expect(fields.File().parse(blob, path)).toMatchObject({ kind: "local" });
    expect(() => fields.File().parse({}, path)).toThrow("Expected a file");
    expect(isBinaryPart(blob)).toBe(true);
    expect(isBinaryPart({ size: 1, type: "text/plain" })).toBe(false);
    expect(isFileValue(local)).toBe(true);
    expect(isFileValue({ kind: "unknown" })).toBe(false);
  });

  it("collects every validator result deterministically and respects abort", async () => {
    const warning = clientIssue(path, "Warning", "warning", "warning");
    const field = fields.Text({
      validate: [
        () => undefined,
        () => true,
        () => false,
        () => "Message",
        () => [warning],
        ({ issue }) => issue("Direct", "direct"),
      ],
    });
    expect((await validate(field, "value")).map((issue) => issue.message)).toEqual([
      "Invalid value",
      "Message",
      "Warning",
      "Direct",
    ]);
    const controller = new AbortController();
    controller.abort();
    expect(await field.validate("value", {}, undefined, controller.signal, path)).toEqual([]);
  });

  it("writes nested values and prefixes nested-list issues", async () => {
    const Nested = defineSchema({
      name: fields.Text({ required: true, validate: [() => "Nested issue"] }),
    });
    const object = fields.Object(Nested);
    const list = fields.ObjectList(Nested);
    expect(object.write({ name: "one" }, undefined)).toEqual({ name: "one" });
    expect(list.write([{ name: "one" }], undefined)).toEqual([{ name: "one" }]);
    const issues = await list.validate(
      [{ name: "one" }, { name: "two" }],
      {},
      undefined,
      new AbortController().signal,
      ["items"],
    );
    expect(issues.map((issue) => issue.path)).toEqual([
      ["items", 0, "name"],
      ["items", 1, "name"],
    ]);
  });

  it("encodes scalar and entity relation values for every key strategy", () => {
    const cogs = createUiCogs({ context: undefined });
    const Target = defineSchema({ id: fields.ID(), slug: fields.Text({ required: true }) });
    const Targets = registerResource(cogs)({
      name: "targets",
      schema: Target,
      key: "slug",
      source: cogs.local(),
    });
    const byFunction = {
      resourceName: "function-targets",
      key: (value: Readonly<Record<string, unknown>>) => value.id,
    };
    const ref = fields.Ref({ resource: Targets });
    const refs = fields.RefList({ resource: cogs.resource(Targets) });
    expect(runtimeWrite(ref, "direct")).toBe("direct");
    expect(ref.write({ id: 1, slug: "one" }, undefined)).toBe("one");
    expect(runtimeWrite(refs, [{ id: 1, slug: "one" }, 2])).toEqual(["one", 2]);
    expect(runtimeWrite(fields.Ref({ resource: byFunction }), { id: 3, slug: "three" })).toBe(3);
    expect(() => runtimeWrite(ref, {})).toThrow("does not contain");
    expect(() => runtimeWrite(ref, null)).toThrow("Expected a relation key or entity");
    expect(() => refs.parse("invalid", path)).toThrow("Expected an array");
    expect(relation.parent()).toEqual({ kind: "parent" });
    expect(relation.endpoints({ add: "add/" })).toEqual({ kind: "endpoints", add: "add/" });
    expect(relation.byKeys()).toEqual({});
  });

  it("uses explicit field parse, write, query, access, and descriptors", () => {
    const field = new Field<string, number, string, typeof context>({
      kind: "custom",
      parse: (value) => Number(value),
      write: (value) => String(value),
      query: (value) => value * 2,
      readableWhen: ({ allowed }) => allowed,
      writableWhen: ({ allowed }) => allowed,
      metadata: { stable: true },
    });
    expect(field.parse("4", path)).toBe(4);
    expect(field.write(4, context)).toBe("4");
    expect(field.toQuery(4, context)).toBe(8);
    expect(field.options.readableWhen?.(context)).toBe(true);
    expect(field.options.writableWhen?.(context)).toBe(true);
    expect(field.describe()).toMatchObject({ kind: "custom", metadata: { stable: true } });
    expect(field.describe()).not.toHaveProperty("parse");
  });
});

async function validate<T>(field: Field<unknown, T, unknown>, value: T) {
  return field.validate(value, { value }, undefined, new AbortController().signal, path);
}

function runtimeWrite(field: Field<unknown, unknown, unknown>, value: unknown): unknown {
  return field.write(value, undefined);
}
