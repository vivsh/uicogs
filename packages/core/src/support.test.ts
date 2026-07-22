import { describe, expect, it, vi } from "vitest";
import { ParseError, RequestError, clientIssue, normalizeFailure, parseIssue } from "./issues.js";
import { RequestCoordinator } from "./request.js";
import { EventBus, Store } from "./store.js";
import { pagination, type PaginationAdapter } from "./transport.js";

describe("pagination contracts", () => {
  it("adapts plain arrays and object pages", () => {
    const adapter = pagination.page();
    expect(adapter.request({ index: 2, size: 10 })).toEqual({ page: 2, page_size: 10 });
    expect(adapter.response({ status: 200, data: [1, 2] }, { index: 2, size: 10 })).toEqual({
      items: [1, 2],
      pageInfo: {
        index: 2,
        size: 10,
        count: 2,
        totalPages: 1,
        hasNext: false,
        hasPrevious: true,
      },
    });
    expect(
      adapter.response(
        {
          status: 200,
          data: { count: 41, next: false, previous: null, results: [1] },
        },
        { index: 3, size: 0 },
      ),
    ).toMatchObject({
      items: [1],
      pageInfo: {
        count: 41,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
        nextToken: false,
        previousToken: null,
      },
    });
  });

  it("supports custom page response keys", () => {
    const adapter = pagination.page({
      pageParam: "number",
      sizeParam: "limit",
      resultsKey: "rows",
      countKey: "total",
      nextKey: "after",
      previousKey: "before",
    });
    expect(adapter.request({ index: 4, size: 5 })).toEqual({ number: 4, limit: 5 });
    expect(
      adapter.response({
        status: 200,
        data: { rows: [1], total: 11, after: "next", before: "previous" },
      }),
    ).toMatchObject({
      items: [1],
      nextPage: "next",
      previousPage: "previous",
      pageInfo: { hasNext: true, hasPrevious: true },
    });
    expect(adapter.response({ status: 200, data: "invalid" })).toMatchObject({ items: [] });
  });

  it("encodes offset and cursor pages", () => {
    expect(pagination.offset().request({ index: 0, size: 20 })).toEqual({
      offset: 0,
      limit: 20,
    });
    expect(
      pagination.offset({ offsetParam: "start", limitParam: "count" }).request({
        index: 3,
        size: 10,
      }),
    ).toEqual({ start: 20, count: 10 });
    expect(pagination.cursor().request({ index: 1, size: 25 })).toEqual({ page_size: 25 });
    expect(
      pagination.cursor({ cursorParam: "after", sizeParam: "limit" }).request({
        index: 2,
        size: 10,
        token: "abc",
      }),
    ).toEqual({ after: "abc", limit: 10 });
  });

  it("slices client pages and retains custom adapters", () => {
    const client = pagination.client();
    expect(client.request({ index: 1, size: 2 })).toEqual({});
    expect(client.response({ status: 200, data: [1, 2, 3] }, { index: 2, size: 2 })).toEqual({
      items: [3],
      pageInfo: {
        index: 2,
        size: 2,
        count: 3,
        totalPages: 2,
        hasNext: false,
        hasPrevious: true,
      },
    });
    expect(client.response({ status: 200, data: {} }, { index: 1, size: 0 })).toMatchObject({
      items: [],
      pageInfo: { totalPages: 1 },
    });
    const custom: PaginationAdapter = {
      name: "custom",
      request: () => ({ custom: true }),
      response: () => ({ items: [] }),
    };
    expect(pagination.custom(custom)).toMatchObject({ name: "custom" });
    expect(Object.isFrozen(pagination.custom(custom))).toBe(true);
  });
});

describe("failure normalization", () => {
  it("creates parse and client issues with defaults and warnings", () => {
    expect(parseIssue(["name"], "Required")).toMatchObject({
      code: "invalid_type",
      source: "parse",
      severity: "error",
    });
    expect(clientIssue([], "Check", undefined, "warning")).toMatchObject({
      code: "invalid",
      source: "client",
      severity: "warning",
    });
    expect(new ParseError([]).message).toBe("Input could not be parsed");
  });

  it("preserves request failures and converts parse errors", () => {
    const failure = {
      kind: "permission" as const,
      status: 403,
      message: "Denied",
      issues: [],
      retryable: false,
    };
    const request = new RequestError(failure);
    expect(request.name).toBe("RequestError");
    expect(normalizeFailure(request)).toBe(failure);

    const issue = parseIssue(["name"], "Required");
    const parsed = normalizeFailure(new ParseError([issue]));
    expect(parsed).toEqual({
      kind: "validation",
      message: "Required",
      issues: [issue],
      retryable: false,
    });
  });

  it("distinguishes abort, ordinary, and non-error values", () => {
    expect(normalizeFailure(new DOMException("Stopped", "AbortError"))).toMatchObject({
      kind: "network",
      message: "Stopped",
      retryable: false,
    });
    expect(normalizeFailure(new Error("Broken"))).toMatchObject({
      kind: "unknown",
      message: "Broken",
      retryable: true,
    });
    expect(normalizeFailure("broken")).toEqual({ kind: "unknown", issues: [], retryable: false });
  });
});

describe("external stores and events", () => {
  it("publishes changed snapshots and ignores identical snapshots", () => {
    const initial = { count: 0 };
    const store = new Store(initial);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setSnapshot(initial);
    expect(listener).not.toHaveBeenCalled();
    store.update((value) => ({ count: value.count + 1 }));
    expect(store.getSnapshot()).toEqual({ count: 1 });
    expect(Object.isFrozen(store.getSnapshot())).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    store.setSnapshot({ count: 2 });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("subscribes, unsubscribes, runs once, and clears typed events", () => {
    const bus = new EventBus<{ saved: number; deleted: number }>();
    const saved = vi.fn();
    const deleted = vi.fn();
    const unsubscribe = bus.on("saved", saved);
    const cancelOnce = bus.once("deleted", deleted);
    bus.emit("saved", 1);
    bus.emit("deleted", 2);
    bus.emit("deleted", 3);
    expect(saved).toHaveBeenCalledWith(1);
    expect(deleted).toHaveBeenCalledOnce();
    cancelOnce();
    unsubscribe();
    bus.emit("saved", 4);
    expect(saved).toHaveBeenCalledOnce();

    bus.on("saved", saved);
    bus.on("deleted", deleted);
    bus.clear("saved");
    bus.emit("saved", 5);
    bus.clear();
    bus.emit("deleted", 6);
    expect(saved).toHaveBeenCalledOnce();
    expect(deleted).toHaveBeenCalledOnce();
  });
});

describe("request coordination", () => {
  it("shares one request while keeping observers independent", async () => {
    const coordinator = new RequestCoordinator();
    let resolve: ((value: number) => void) | undefined;
    let loads = 0;
    const load = () => {
      loads += 1;
      return new Promise<number>((done) => {
        resolve = done;
      });
    };
    const first = coordinator.coordinate("same", load);
    const second = coordinator.coordinate("same", load);
    expect(loads).toBe(1);
    resolve?.(42);
    await expect(Promise.all([first, second])).resolves.toEqual([42, 42]);
    await coordinator.coordinate("same", async () => {
      loads += 1;
      return 43;
    });
    expect(loads).toBe(2);
  });

  it("detaches one observer without aborting observers still waiting", async () => {
    const coordinator = new RequestCoordinator();
    const firstController = new AbortController();
    const secondController = new AbortController();
    let sharedSignal: AbortSignal | undefined;
    let resolve: ((value: string) => void) | undefined;
    const load = (signal: AbortSignal) => {
      sharedSignal = signal;
      return new Promise<string>((done) => {
        resolve = done;
      });
    };
    const first = coordinator.coordinate("same", load, firstController.signal);
    const second = coordinator.coordinate("same", load, secondController.signal);
    firstController.abort();
    await expect(first).rejects.toHaveProperty("name", "AbortError");
    expect(sharedSignal?.aborted).toBe(false);
    resolve?.("done");
    await expect(second).resolves.toBe("done");
  });

  it("aborts the shared operation after the final observer detaches", async () => {
    const coordinator = new RequestCoordinator();
    const controller = new AbortController();
    let sharedSignal: AbortSignal | undefined;
    const result = coordinator.coordinate(
      "same",
      (signal) => {
        sharedSignal = signal;
        return new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
      },
      controller.signal,
    );
    controller.abort();
    await expect(result).rejects.toHaveProperty("name", "AbortError");
    expect(sharedSignal?.aborted).toBe(true);
  });

  it("rejects already-aborted observers without retaining the request", async () => {
    const coordinator = new RequestCoordinator();
    const controller = new AbortController();
    controller.abort();
    let sharedSignal: AbortSignal | undefined;
    await expect(
      coordinator.coordinate(
        "same",
        (signal) => {
          sharedSignal = signal;
          return new Promise<void>((resolve) => {
            signal.addEventListener("abort", () => resolve(), { once: true });
          });
        },
        controller.signal,
      ),
    ).rejects.toHaveProperty("name", "AbortError");
    expect(sharedSignal?.aborted).toBe(true);
  });

  it("aborts active work and rejects future work after disposal", async () => {
    const coordinator = new RequestCoordinator();
    let sharedSignal: AbortSignal | undefined;
    const active = coordinator.coordinate("active", (signal) => {
      sharedSignal = signal;
      return new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
          once: true,
        });
      });
    });
    coordinator.dispose();
    await expect(active).rejects.toHaveProperty("name", "AbortError");
    expect(sharedSignal?.aborted).toBe(true);
    await expect(coordinator.coordinate("future", async () => undefined)).rejects.toHaveProperty(
      "name",
      "AbortError",
    );
  });

  it("rejects disposal even when the underlying operation ignores abort", async () => {
    const coordinator = new RequestCoordinator();
    let resolve: ((value: string) => void) | undefined;
    const active = coordinator.coordinate(
      "ignored-abort",
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    coordinator.dispose();
    resolve?.("late value");
    await expect(active).rejects.toHaveProperty("name", "AbortError");
  });

  it("converts synchronous loader failures into coordinated rejections", async () => {
    const coordinator = new RequestCoordinator();
    await expect(
      coordinator.coordinate("sync", () => {
        throw new Error("synchronous failure");
      }),
    ).rejects.toThrow("synchronous failure");
  });
});
