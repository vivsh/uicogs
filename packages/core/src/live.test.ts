import { defineSchema, registerResource } from "./test-utils.js";

import { describe, expect, it, vi } from "vitest";
import { createUiCogs } from "./factory.js";
import { fields } from "./field.js";
import { LiveSourceError, type LiveFrame, type LiveOpenOptions, type LiveSource } from "./live.js";

class FrameQueue implements AsyncIterable<LiveFrame> {
  private readonly frames: LiveFrame[] = [];
  private readonly waiters: ((result: IteratorResult<LiveFrame>) => void)[] = [];
  private closed = false;

  push(frame: LiveFrame): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ done: false, value: frame });
    else this.frames.push(frame);
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterator<LiveFrame> {
    return {
      next: () => {
        const frame = this.frames.shift();
        if (frame) return Promise.resolve({ done: false, value: frame });
        if (this.closed) return Promise.resolve({ done: true, value: undefined });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

function controlledLive<TContext>(
  queue: FrameQueue,
  options: Partial<LiveSource<TContext>> = {},
): LiveSource<TContext> {
  return {
    retry: { initialMs: 60_000, maximumMs: 60_000, jitter: 0 },
    ...options,
    open: async (connection: LiveOpenOptions<TContext>) => {
      connection.signal.addEventListener("abort", () => queue.close(), { once: true });
      return { status: 200, frames: queue };
    },
  };
}

function event(type: string, payload: unknown, id?: string): LiveFrame {
  return {
    kind: "event",
    event: { type, data: JSON.stringify(payload), ...(id ? { id } : {}) },
  };
}

describe("live source", () => {
  it("is always present and disabled without configuration", () => {
    const cogs = createUiCogs({ context: undefined });
    expect(cogs.live.status).toBe("disabled");
    cogs.dispose();
    expect(cogs.live.status).toBe("closed");
  });

  it("waits while disabled and reconnects without replay state after a scope change", async () => {
    let enabled = false;
    let scope = "anonymous";
    const connections: Array<{
      readonly scope: string;
      readonly lastEventId?: string;
      readonly signal: AbortSignal;
      readonly queue: FrameQueue;
    }> = [];
    const live: LiveSource<{ scope: string }> = {
      enabled: () => enabled,
      open: async (connection) => {
        const queue = new FrameQueue();
        connection.signal.addEventListener("abort", () => queue.close(), { once: true });
        connections.push({
          scope: connection.scope,
          ...(connection.lastEventId ? { lastEventId: connection.lastEventId } : {}),
          signal: connection.signal,
          queue,
        });
        return { status: 200, frames: queue };
      },
    };
    const cogs = createUiCogs<{ scope: string }>({
      context: { scope },
      cacheScope: () => scope,
      live,
    });
    const schema = defineSchema({ id: fields.ID(), title: fields.Str() });
    const Tasks = registerResource(cogs)({
      name: "scoped-live-tasks",
      url: "tasks/",
      schema,
      key: "id",
    });
    const task = cogs.resource(Tasks).get(1);
    await Promise.resolve();
    expect(cogs.live.status).toBe("waiting");
    expect(connections).toHaveLength(0);

    enabled = true;
    cogs.context.update({ scope });
    await vi.waitFor(() => expect(cogs.live.status).toBe("open"));
    connections[0]?.queue.push(event("scoped-live-tasks", { id: 1, title: "First" }, "scope-1"));
    await vi.waitFor(() => expect(task.value?.title).toBe("First"));
    expect(cogs.live.lastEventId).toBe("scope-1");

    scope = "subject:1";
    cogs.context.update({ scope });
    await vi.waitFor(() => expect(connections).toHaveLength(2));
    expect(connections[0]?.signal.aborted).toBe(true);
    expect(connections[1]).toMatchObject({ scope: "subject:1" });
    expect(connections[1]?.lastEventId).toBeUndefined();
    expect(cogs.live.lastEventId).toBeUndefined();
    cogs.dispose();
  });

  it("closes without reconnecting after a 204 response", async () => {
    const cogs = createUiCogs({
      context: undefined,
      live: {
        open: async () => ({ status: 204, frames: new FrameQueue() }),
      },
    });
    await vi.waitFor(() => expect(cogs.live.status).toBe("closed"));
    cogs.dispose();
  });

  it("maps custom events to single and batched cache mutations", async () => {
    const queue = new FrameQueue();
    const cogs = createUiCogs({
      context: undefined,
      live: controlledLive(queue, {
        map: ({ event: type, payload }) => {
          if (type === "task.changed")
            return { action: "upsert", resource: "mapped-tasks", value: payload };
          if (type === "task.batch")
            return [
              { action: "upsert", resource: "mapped-tasks", value: payload },
              { action: "invalidate", resource: "mapped-tasks" },
            ];
          return undefined;
        },
      }),
    });
    const schema = defineSchema({ id: fields.ID(), title: fields.Str() });
    const Tasks = registerResource(cogs)({
      name: "mapped-tasks",
      url: "tasks/",
      schema,
      key: "id",
    });
    const tasks = cogs.resource(Tasks);
    await vi.waitFor(() => expect(cogs.live.status).toBe("open"));

    queue.push(event("task.changed", { id: 1, title: "Mapped" }));
    await vi.waitFor(() => expect(tasks.get(1).value?.title).toBe("Mapped"));
    queue.push(event("task.batch", { id: 2, title: "Batch" }));
    await vi.waitFor(() => expect(tasks.get(2).value?.title).toBe("Batch"));
    expect(tasks.stale).toBe(true);
    cogs.dispose();
  });

  it("reconnects retryable statuses, retry directives, EOF, and thrown failures", async () => {
    let opens = 0;
    const queue = new FrameQueue();
    const live: LiveSource<void> = {
      retry: { initialMs: 1, maximumMs: 2, jitter: 0 },
      open: async ({ signal }) => {
        opens += 1;
        if (opens === 1) return { status: 503, frames: new FrameQueue() };
        if (opens === 2)
          return {
            status: 200,
            frames: {
              async *[Symbol.asyncIterator]() {
                yield { kind: "retry" as const, milliseconds: 1 };
              },
            },
          };
        if (opens === 3) throw "temporary failure";
        signal.addEventListener("abort", () => queue.close(), { once: true });
        return { status: 200, frames: queue };
      },
    };
    const cogs = createUiCogs({ context: undefined, live });
    await vi.waitFor(() => expect(opens).toBe(4));
    expect(cogs.live.status).toBe("open");
    expect(cogs.live.connectedAt).toBeTypeOf("number");
    expect(cogs.live.retryAt).toBeUndefined();
    cogs.dispose();
  });

  it("treats client statuses, source errors, invalid versions, and mapper errors as terminal or event diagnostics", async () => {
    const terminal = createUiCogs({
      context: undefined,
      live: { open: async () => ({ status: 403, frames: new FrameQueue() }) },
    });
    await vi.waitFor(() => expect(terminal.live.status).toBe("error"));
    expect(terminal.live.lastError).toMatchObject({ kind: "transport", retryable: false });
    terminal.dispose();

    const sourceError = createUiCogs({
      context: undefined,
      live: { open: async () => Promise.reject(new LiveSourceError("unsupported")) },
    });
    await vi.waitFor(() => expect(sourceError.live.status).toBe("error"));
    expect(sourceError.live.lastError?.message).toBe("unsupported");
    sourceError.dispose();

    const queue = new FrameQueue();
    const invalid: LiveSource<void> = controlledLive(queue, {
      version: (({ event: sourceEvent }) =>
        sourceEvent.type === "invalid-live-tasks"
          ? true
          : undefined) as LiveSource<void>["version"],
      map: () => {
        throw new Error("mapper failed");
      },
    });
    const cogs = createUiCogs({ context: undefined, live: invalid });
    const schema = defineSchema({ id: fields.ID() });
    registerResource(cogs)({ name: "invalid-live-tasks", url: "tasks/", schema, key: "id" });
    await vi.waitFor(() => expect(cogs.live.status).toBe("open"));
    queue.push(event("invalid-live-tasks", { id: 1 }, "invalid-version"));
    await vi.waitFor(() => expect(cogs.live.lastError?.kind).toBe("schema"));
    expect(cogs.live.lastError?.eventId).toBe("invalid-version");
    queue.push(event("mapper-error", { id: 2 }, "mapper-error"));
    await vi.waitFor(() => expect(cogs.live.lastError?.message).toBe("mapper failed"));
    cogs.dispose();
  });

  it("starts after resource registration and applies resource events", async () => {
    const queue = new FrameQueue();
    const unhandled = vi.fn();
    const cogs = createUiCogs({
      context: undefined,
      live: controlledLive(queue, { onUnhandled: unhandled }),
    });
    const schema = defineSchema({ id: fields.ID(), title: fields.Str() });
    const Tasks = registerResource(cogs)({ name: "live-tasks", url: "tasks/", schema, key: "id" });
    const tasks = cogs.resource(Tasks);
    tasks.cache.replaceAll([{ id: 1, title: "Initial" }]);

    await vi.waitFor(() => expect(cogs.live.status).toBe("open"));
    queue.push(event("live-tasks", { id: 1, title: "Updated" }, "1"));
    await vi.waitFor(() => expect(tasks.get(1).value?.title).toBe("Updated"));

    queue.push(event("live-tasks", { id: 2, title: "Inserted" }, "2"));
    await vi.waitFor(() => expect(tasks.all().map((value) => value.id)).toEqual([1, 2]));

    queue.push(event("live-tasks:invalidate", {}, "3"));
    await vi.waitFor(() => expect(tasks.stale).toBe(true));
    expect(tasks.all()).toHaveLength(2);

    queue.push(event("live-tasks:delete", { id: 1 }, "4"));
    await vi.waitFor(() => expect(tasks.get(1).value).toBeUndefined());
    expect(tasks.all().map((value) => value.id)).toEqual([2]);

    queue.push(event("unknown-event", { value: true }, "5"));
    await vi.waitFor(() => expect(unhandled).toHaveBeenCalledOnce());
    expect(cogs.live.status).toBe("open");
    expect(cogs.live.lastError?.kind).toBe("unhandled");
    cogs.dispose();
  });

  it("keeps malformed events open and suppresses duplicate and older versions", async () => {
    const queue = new FrameQueue();
    const cogs = createUiCogs({
      context: undefined,
      live: controlledLive(queue, {
        version: ({ payload }) =>
          typeof payload === "object" && payload !== null && "version" in payload
            ? (payload.version as number)
            : undefined,
      }),
    });
    const schema = defineSchema({ id: fields.ID(), title: fields.Str(), version: fields.Int() });
    const Tasks = registerResource(cogs)({
      name: "versioned-tasks",
      url: "tasks/",
      schema,
      key: "id",
    });
    const task = cogs.resource(Tasks).get(1);
    await vi.waitFor(() => expect(cogs.live.status).toBe("open"));

    queue.push(event("versioned-tasks", { id: 1, title: "New", version: 2 }, "event-2"));
    await vi.waitFor(() => expect(task.value?.title).toBe("New"));
    queue.push(event("versioned-tasks", { id: 1, title: "Duplicate", version: 3 }, "event-2"));
    queue.push(event("versioned-tasks", { id: 1, title: "Old", version: 1 }, "event-1"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(task.value?.title).toBe("New");

    queue.push({ kind: "event", event: { type: "versioned-tasks", data: "{", id: "bad" } });
    await vi.waitFor(() => expect(cogs.live.lastError?.kind).toBe("json"));
    expect(cogs.live.lastEventId).toBe("bad");
    expect(cogs.live.status).toBe("open");
    cogs.dispose();
  });

  it("marks a dirty form base stale after a live entity update", async () => {
    const queue = new FrameQueue();
    const cogs = createUiCogs({ context: undefined, live: controlledLive(queue) });
    const schema = defineSchema({ id: fields.ID(), title: fields.Str() });
    const Tasks = registerResource(cogs)({
      name: "form-live-tasks",
      url: "tasks/",
      schema,
      key: "id",
    });
    const tasks = cogs.resource(Tasks);
    tasks.cache.add({ id: 1, title: "Initial" });
    const form = tasks.get(1).form(schema.keep("title").toForm({ mode: "patch" }));
    form.set("title", "Draft");
    await vi.waitFor(() => expect(cogs.live.status).toBe("open"));
    queue.push(event("form-live-tasks", { id: 1, title: "Server" }));
    await vi.waitFor(() => expect(form.baseStale).toBe(true));
    expect(form.values.title).toBe("Draft");
    cogs.dispose();
  });
});
