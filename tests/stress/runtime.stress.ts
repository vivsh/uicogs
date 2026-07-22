import { describe, expect, it } from "vitest";
import { createUiCogs, fields, RequestCoordinator } from "@uicogs/core";
import { defineSchema, registerResource } from "../../packages/core/src/test-utils.js";

describe("runtime longevity", () => {
  it("publishes 10,000 immutable cache updates without losing the latest value", () => {
    const cogs = createUiCogs({ context: undefined });
    const Item = defineSchema({ id: fields.ID(), value: fields.Int() });
    const Items = registerResource(cogs)({
      name: "stress-items",
      schema: Item,
      key: "id",
      source: cogs.local(),
    });
    const items = cogs.resource(Items);
    const object = items.get(1);
    let notifications = 0;
    const unsubscribe = object.subscribe(() => {
      notifications += 1;
    });
    items.cache.add({ id: 1, value: 0 });
    for (let value = 1; value <= 10_000; value += 1) items.cache.upsert({ id: 1, value });
    expect(object.value?.value).toBe(10_000);
    expect(Object.isFrozen(object.value)).toBe(true);
    expect(notifications).toBeGreaterThanOrEqual(10_000);
    unsubscribe();
    object.dispose();
    cogs.dispose();
  });

  it("creates and disposes 1,000 controller graphs without stale updates", () => {
    const cogs = createUiCogs({ context: undefined });
    const Item = defineSchema({ id: fields.ID(), value: fields.Int() });
    const Items = registerResource(cogs)({
      name: "controller-items",
      schema: Item,
      key: "id",
      source: cogs.local({ initial: [{ id: 1, value: 1 }] }),
    });
    let staleNotifications = 0;
    const finalResource = cogs.resource(Items);
    for (let index = 0; index < 1_000; index += 1) {
      const resource = index === 999 ? finalResource : cogs.resource(Items);
      const object = resource.get(1);
      const unsubscribe = object.subscribe(() => {
        staleNotifications += 1;
      });
      unsubscribe();
      object.dispose();
    }
    finalResource.cache.upsert({ id: 1, value: 2 });
    expect(staleNotifications).toBe(0);
    cogs.dispose();
  });

  it("handles randomized observer cancellation on shared requests", async () => {
    for (let cycle = 0; cycle < 100; cycle += 1) {
      const coordinator = new RequestCoordinator();
      const observers = Array.from({ length: 10 }, () => new AbortController());
      let resolve: ((value: number) => void) | undefined;
      const load = () => new Promise<number>((done) => (resolve = done));
      const results = observers.map((controller) =>
        coordinator.coordinate("shared", load, controller.signal).catch(() => -1),
      );
      observers.forEach((controller, index) => {
        if ((index + cycle) % 3 === 0) controller.abort();
      });
      resolve?.(cycle);
      const values = await Promise.all(results);
      expect(values.every((value) => value === -1 || value === cycle)).toBe(true);
      coordinator.dispose();
    }
  });
});
