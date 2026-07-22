import { defineSchema, registerResource } from "./test-utils.js";

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mergeEntity } from "./cache.js";
import { createUiCogs } from "./factory.js";
import { fields } from "./field.js";
import { multipartAdapter, withQuery } from "./default-http.js";

const propertyOptions = { seed: 20_260_722, numRuns: 250 } as const;

describe("seeded core properties", () => {
  it("round-trips every supported repeated query scalar", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.string(), fc.integer(), fc.boolean()), { maxLength: 20 }),
        (values) => {
          const url = new URL(withQuery("https://example.invalid/items#view", { value: values }));
          expect(url.searchParams.getAll("value")).toEqual(
            values.filter((value) => value !== "").map(String),
          );
          expect(url.hash).toBe("#view");
        },
      ),
      propertyOptions,
    );
  });

  it("produces deterministic dotted and bracket multipart paths", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.string({ minLength: 1 }), fc.nat()), {
          minLength: 1,
          maxLength: 8,
        }),
        (path) => {
          expect(multipartAdapter.dotted().path(path)).toBe(path.join("."));
          expect(multipartAdapter.brackets().path(path)).toBe(
            `${String(path[0])}${path
              .slice(1)
              .map((part) => `[${String(part)}]`)
              .join("")}`,
          );
        },
      ),
      propertyOptions,
    );
  });

  it("keeps every schema composition input deeply immutable", () => {
    const schema = defineSchema({
      id: fields.ID(),
      title: fields.Text(),
      active: fields.Bool(),
    });
    const originalFields = Object.freeze({ ...schema.shape });
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (dropTitle, makePartial) => {
        const changed = dropTitle ? schema.drop("title") : schema.keep("id", "title");
        const composed = makePartial ? changed.partial() : changed.required();
        expect(composed).not.toBe(schema);
        expect(schema.shape).toEqual(originalFields);
        expect(schema.get("id")).toBe(originalFields.id);
        expect(schema.get("title")).toBe(originalFields.title);
        expect(Object.isFrozen(schema)).toBe(true);
      }),
      propertyOptions,
    );
  });

  it("merges partial entities without erasing missing fields or mutating snapshots", () => {
    const dictionary = fc.dictionary(
      fc.string({ minLength: 1, maxLength: 12 }),
      fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
    );
    fc.assert(
      fc.property(dictionary, dictionary, (initial, patch) => {
        const current = mergeEntity(undefined, 1, initial, { ttl: 100, now: 1 });
        const original = structuredClone(current.data);
        const merged = mergeEntity(current, 1, patch, { ttl: 100, now: 2 });
        expect(current.data).toEqual(original);
        expect(merged.data).toEqual({ ...initial, ...patch });
        expect(merged.version).toBe(2);
        expect(Object.isFrozen(merged.data)).toBe(true);
      }),
      propertyOptions,
    );
  });

  it("suppresses equal and older source versions", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (currentVersion, candidateVersion) => {
        const current = mergeEntity(
          undefined,
          1,
          { value: currentVersion },
          {
            ttl: 100,
            now: 1,
            sourceVersion: currentVersion,
          },
        );
        const next = mergeEntity(
          current,
          1,
          { value: candidateVersion },
          {
            ttl: 100,
            now: 2,
            sourceVersion: candidateVersion,
          },
        );
        if (candidateVersion <= currentVersion) expect(next).toBe(current);
        else expect(next.data.value).toBe(candidateVersion);
      }),
      propertyOptions,
    );
  });

  it("preserves local collection order through arbitrary unique cache additions", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 10_000 }), { maxLength: 100 }),
        (keys) => {
          const cogs = createUiCogs({ context: undefined });
          const Item = defineSchema({ id: fields.ID(), label: fields.Text() });
          const Items = registerResource(cogs)({
            name: "items",
            schema: Item,
            key: "id",
            source: cogs.local(),
          });
          const items = cogs.resource(Items);
          keys.forEach((id) => items.cache.add({ id, label: String(id) }));
          expect(items.all().map((value) => value.id)).toEqual(keys);
          cogs.dispose();
        },
      ),
      { seed: propertyOptions.seed, numRuns: 50 },
    );
  });
});
