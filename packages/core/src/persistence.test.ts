import { describe, expect, it, vi } from "vitest";
import { createUiCogs } from "./factory.js";
import { fields } from "./field.js";
import {
  encodePersistenceValue,
  decodePersistenceValue,
  type PersistenceBackend,
} from "./persistence.js";
import { local, resource } from "./resource.js";
import { schema } from "./schema.js";

const Item = schema({
  id: fields.ID(),
  title: fields.Str({ required: true }),
});
const Items = resource({
  name: "persistent-items",
  schema: Item,
  key: "id",
  source: local({ initial: [{ id: 1, title: "Initial" }] }),
});

describe("shared runtime persistence", () => {
  it("persists context and normalized local resources through one backend", async () => {
    const backend = new TestBackend();
    const first = createUiCogs({
      resources: [Items],
      context: { locale: "en", changedAt: new Date("2026-01-01T00:00:00.000Z") },
      persistence: { backend },
    });
    await eventually(() => first.context.persistenceStatus === "ready");
    first.context.update({ locale: "fr" });
    const items = first.resource(Items);
    items.cache.upsert({ id: 1, title: "Restored" });
    items.cache.add({ id: 2, title: "Added" });
    await eventually(() => backend.values.has("context") && backend.values.has("cache/anonymous"));
    first.dispose();

    const second = createUiCogs({
      resources: [Items],
      context: { locale: "en", changedAt: new Date("2025-01-01T00:00:00.000Z") },
      persistence: { backend },
    });
    const restored = second.resource(Items);
    const listener = vi.fn();
    restored.subscribe(listener);
    await eventually(() => second.cache.persistenceStatus === "ready");
    await eventually(() => second.context.persistenceStatus === "ready");

    expect(second.context.value.locale).toBe("fr");
    expect(second.context.value.changedAt).toBeInstanceOf(Date);
    expect(restored.all().map((item) => item.title)).toEqual(["Restored", "Added"]);
    expect(listener).toHaveBeenCalled();
    second.dispose();
  });

  it("waits for cache hydration before a cache-first remote load", async () => {
    const backend = new TestBackend();
    const RemoteItems = resource({
      name: "remote-persistent-items",
      url: "items/",
      schema: Item,
      key: "id",
    });
    const seed = createUiCogs({ resources: [RemoteItems], persistence: { backend } });
    const seeded = seed.resource(RemoteItems);
    seeded.cache.replaceAll([{ id: 1, title: "Cached" }]);
    await eventually(() => backend.values.has("cache/anonymous"));
    seed.dispose();

    backend.pause("cache/anonymous");
    const request = vi.fn(async () => ({ status: 200, data: [] }));
    const runtime = createUiCogs({
      resources: [RemoteItems],
      persistence: { backend, context: false },
      transport: { request },
    });
    const loading = runtime.resource(RemoteItems).load();
    await Promise.resolve();
    expect(request).not.toHaveBeenCalled();
    backend.resume("cache/anonymous");
    await expect(loading).resolves.toEqual([expect.objectContaining({ title: "Cached" })]);
    expect(request).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("reports unsupported values without rolling back memory", async () => {
    const backend = new TestBackend();
    const api = createUiCogs({ context: { locale: "en" }, persistence: { backend, cache: false } });
    await eventually(() => api.context.persistenceStatus === "ready");
    api.context.set({ locale: "en", unsupported: new Map() } as never);
    await eventually(() => api.context.persistenceStatus === "error");
    expect(api.context.value).toHaveProperty("unsupported");
    expect(api.context.persistenceError).toContain("plain objects");
    api.dispose();
  });
});

describe("portable persistence values", () => {
  it("round trips dates and undefined and rejects cycles", () => {
    const value = { date: new Date("2026-01-01T00:00:00.000Z"), missing: undefined };
    expect(decodePersistenceValue(encodePersistenceValue(value))).toEqual(value);
    const reserved = { $uicogs: "date", value: "application value" };
    expect(decodePersistenceValue(encodePersistenceValue(reserved))).toEqual(reserved);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => encodePersistenceValue(cyclic)).toThrow("cyclic");
  });

  it("rejects malformed and unsupported portable values", () => {
    expect(() => decodePersistenceValue({ $uicogs: "date", value: "not-a-date" })).toThrow(
      "Persisted date is invalid",
    );
    expect(() => decodePersistenceValue({ $uicogs: "record", value: [[1, "invalid"]] })).toThrow(
      "Persisted record is invalid",
    );
    expect(() => encodePersistenceValue(Number.POSITIVE_INFINITY)).toThrow("non-finite");
    expect(() => encodePersistenceValue(new Date(Number.NaN))).toThrow("invalid dates");
    expect(() => encodePersistenceValue(Symbol("unsupported"))).toThrow("symbol values");
  });
});

class TestBackend implements PersistenceBackend {
  readonly values = new Map<string, unknown>();
  private readonly paused = new Map<string, { promise: Promise<void>; resume: () => void }>();

  async read(key: string): Promise<unknown | undefined> {
    await this.paused.get(key)?.promise;
    return this.values.get(key);
  }
  async write(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
  pause(key: string): void {
    let resume = (): void => undefined;
    const promise = new Promise<void>((resolve) => {
      resume = resolve;
    });
    this.paused.set(key, { promise, resume });
  }
  resume(key: string): void {
    this.paused.get(key)?.resume();
    this.paused.delete(key);
  }
}

async function eventually(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Condition was not reached");
}
