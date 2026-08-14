import { defineSchema, registerResource } from "./test-utils.js";

import { describe, expect, it, vi } from "vitest";
import { createUiCogs } from "./factory.js";
import { fields } from "./field.js";
import { operation } from "./resource.js";
import { pagination, type Transport, type TransportRequest } from "./transport.js";

describe("resource definitions and operation builders", () => {
  it("creates deeply stable definitions and canonical operation defaults", () => {
    expect(operation.list()).toEqual({ kind: "list", method: "GET" });
    expect(operation.retrieve()).toEqual({ kind: "retrieve", method: "GET" });
    expect(operation.retrieve({ method: "POST" }).method).toBe("POST");
    expect(operation.create()).toEqual({ kind: "create", method: "POST" });
    expect(operation.replace()).toEqual({ kind: "replace", method: "PUT" });
    expect(operation.patch()).toEqual({ kind: "patch", method: "PATCH" });
    expect(operation.remove()).toEqual({ kind: "remove", method: "DELETE" });
    expect(operation.all()).toEqual({
      list: { kind: "list", method: "GET" },
      retrieve: { kind: "retrieve", method: "GET" },
      create: { kind: "create", method: "POST" },
      replace: { kind: "replace", method: "PUT" },
      patch: { kind: "patch", method: "PATCH" },
      remove: { kind: "remove", method: "DELETE" },
    });
    expect(operation.action({ path: "publish/" })).toEqual({
      kind: "action",
      method: "POST",
      path: "publish/",
    });
    expect(operation.bulk({ bulk: {} })).toEqual({
      kind: "action",
      method: "POST",
      bulk: {},
    });
    expect(Object.isFrozen(operation.list())).toBe(true);
    expect(Object.isFrozen(operation.all())).toBe(true);

    const { cogs, schema } = fixture();
    const definition = registerResource(cogs)({
      name: "tasks",
      url: "tasks/",
      schema,
      key: "id",
      actions: { publish: operation.action({ path: "publish/" }) },
      operations: { list: operation.list({ path: "all/" }) },
      ttl: 500,
    });
    expect(definition.actions).toBe(definition.operations);
    expect(Object.keys(definition.actions)).toEqual(["publish", "list"]);
    expect(definition).toMatchObject({ resourceName: "tasks", name: "tasks", ttl: 500 });
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.actions)).toBe(true);
  });

  it("declares every standard resource operation through operation.all", () => {
    const { cogs, schema } = fixture();
    const definition = registerResource(cogs)({
      name: "tasks",
      url: "tasks/",
      schema,
      key: "id",
      operations: operation.all(),
    });

    expect(Object.keys(definition.operations)).toEqual([
      "list",
      "retrieve",
      "create",
      "replace",
      "patch",
      "remove",
    ]);
    expect(definition.operation("list").name).toBe("list");
  });

  it("rejects missing, duplicate, and invalid-view resource definitions", () => {
    const { cogs, schema } = fixture();
    expect(() => cogs.resource("missing")).toThrow("not registered");
    registerResource(cogs)({ name: "tasks", url: "tasks/", schema, key: "id" });
    expect(() =>
      registerResource(cogs)({ name: "tasks", url: "other/", schema, key: "id" }),
    ).toThrow("already registered");
    const summaryWithoutKey = schema.view({ fields: ["title"] as const });
    expect(() =>
      registerResource(cogs)({
        name: "invalid-view",
        url: "invalid/",
        schema,
        key: "id",
        views: { summary: summaryWithoutKey },
      }),
    ).toThrow("must include key id");
  });

  it("uses custom key functions, key encoders, bound controller adapters, and context updates", async () => {
    const adapted: object[] = [];
    const cogs = createUiCogs({
      context: { version: 1 },
      transport: {
        request: async () => ({ status: 200, data: { code: "one", title: "Task" } }),
      },
    });
    cogs.bindControllerAdapter((controller) => {
      adapted.push(controller);
      return controller;
    });
    const schema = defineSchema({
      code: fields.Str({ required: true }),
      title: fields.Str({ required: true }),
      label: fields.Computed<string, { version: number }>({
        dependsOn: ["title"],
        get: ({ title }, context) => `${title}:${context.version}`,
      }),
    });
    const definition = registerResource(cogs)({
      name: "tasks",
      url: "tasks/",
      schema,
      key: (value) => value.code ?? "missing",
      keyEncoder: (key) => String(key).toUpperCase(),
    });
    const resource = cogs.resource(definition);
    const object = resource.get("one");
    await object.load();
    expect(object.getSnapshot().key).toBe("ONE");
    expect(object.value?.label).toBe("Task:1");
    const revision = object.getSnapshot().revision;
    cogs.context.update({ version: 2 });
    expect(object.value?.label).toBe("Task:2");
    expect(object.getSnapshot().revision).toBeGreaterThan(revision);
    expect(adapted).toContain(resource);
    expect(adapted).toContain(object);
  });
});

describe("collections and queries", () => {
  it("encodes named query input, filters, sorting, path, and pagination", async () => {
    const requests: TransportRequest[] = [];
    const { cogs, schema } = fixture(async (request) => {
      requests.push(request);
      return {
        status: 200,
        data: { count: 1, results: [{ id: 1, title: "One", done: false }] },
      };
    });
    const query = defineSchema({
      search: fields.Str({ wireName: "q", query: (value) => value.trim() }),
      owner: fields.Int(),
    });
    const definition = registerResource(cogs)({
      name: "tasks",
      url: "tasks/",
      schema,
      key: "id",
      queries: {
        search: {
          input: query,
          path: "search/",
          sortParam: "sort",
          pagination: pagination.page({ pageParam: "number", sizeParam: "limit" }),
        },
      },
    });
    let input = { search: " first " };
    const collection = cogs
      .resource(definition)
      .query("search", () => input)
      .filter({ owner: 2 })
      .filter({ search: " merged " }, { merge: true })
      .sort("title", true)
      .page(3, 10);
    await collection.load();
    expect(requests[0]).toMatchObject({
      method: "GET",
      url: "tasks/search/",
      query: { q: "merged", owner: 2, sort: "-title", number: 3, limit: 10 },
    });
    expect(collection.values).toEqual(collection.all());
    expect(collection.pageInfo).toMatchObject({ count: 1 });
    expect(collection.stale).toBe(false);

    input = { search: "second" };
    await collection.refresh();
    expect(requests[1]?.query).toMatchObject({ q: "merged" });
    collection.sort().filter({}).reset();
    await collection.load({ policy: "network-only" });
    expect(requests[2]?.query).not.toHaveProperty("sort");
  });

  it("uses cache-first, network-only, and stale-while-revalidate independently", async () => {
    let requests = 0;
    const { cogs, schema } = fixture(async () => {
      requests += 1;
      return { status: 200, data: [{ id: 1, title: `Task ${requests}`, done: false }] };
    });
    const definition = registerResource(cogs)({ name: "tasks", url: "tasks/", schema, key: "id" });
    const collection = cogs.resource(definition);
    await collection.load();
    await collection.load();
    expect(requests).toBe(1);
    await collection.refresh();
    expect(requests).toBe(2);
    const immediate = await collection.load({ policy: "stale-while-revalidate" });
    expect(immediate[0]?.title).toBe("Task 2");
    await vi.waitFor(() => expect(requests).toBe(3));
    await vi.waitFor(() => expect(collection.all()[0]?.title).toBe("Task 3"));
    collection.invalidate();
    expect(collection.stale).toBe(true);
  });

  it("navigates pages conservatively and supports accumulation reset", async () => {
    const { cogs, schema } = fixture(async () => ({
      status: 200,
      data: [
        { id: 1, title: "One", done: false },
        { id: 2, title: "Two", done: false },
        { id: 3, title: "Three", done: false },
      ],
    }));
    const definition = registerResource(cogs)({
      name: "tasks",
      url: "tasks/",
      schema,
      key: "id",
      pagination: pagination.client(),
    });
    const resource = cogs.resource(definition).page(1, 2).accumulate();
    resource.previousPage();
    await resource.load();
    expect(resource.hasMore()).toBe(true);
    resource.nextPage();
    await resource.load();
    expect(resource.all().map((value) => value.id)).toEqual([1, 2, 3]);
    resource.nextPage();
    expect(resource.pageInfo).toMatchObject({ index: 2 });
    resource.previousPage();
    await resource.load();
    resource.accumulate(false).reset();
    expect(resource.all().map((value) => value.id)).toEqual([1, 2]);
  });

  it("keeps errors local, clears them, and rejects unknown queries", async () => {
    const { cogs, schema } = fixture(async () => ({ status: 503, data: {} }));
    const query = defineSchema({ search: fields.Str() });
    const definition = registerResource(cogs)({
      name: "tasks",
      url: "tasks/",
      schema,
      key: "id",
      queries: { search: { input: query } },
    });
    const resource = cogs.resource(definition);
    const collection = resource.query("search", {});
    await expect(collection.load()).rejects.toThrow(
      "The server encountered an error. Please try again.",
    );
    expect(collection.error).toMatchObject({ kind: "server", status: 503, retryable: true });
    collection.clearError();
    expect(collection.error).toBeUndefined();
    expect(() => resource.query("missing" as "search", {})).toThrow("not defined");
  });

  it("cancels local collection observers without retaining loading state", async () => {
    const { cogs, schema } = fixture(
      (request) =>
        new Promise((resolve, reject) => {
          request.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Stopped", "AbortError")),
            { once: true },
          );
          void resolve;
        }),
    );
    const definition = registerResource(cogs)({ name: "tasks", url: "tasks/", schema, key: "id" });
    const resource = cogs.resource(definition);
    const loading = resource.load();
    resource.cancel();
    await expect(loading).rejects.toHaveProperty("name", "AbortError");
    expect(resource.loading).toBe(false);
  });
});

describe("objects and cache policies", () => {
  it("memoizes local objects and honors cache policies and invalidation", async () => {
    let requests = 0;
    const { cogs, schema } = fixture(async () => {
      requests += 1;
      return { status: 200, data: { id: 1, title: `Task ${requests}`, done: false } };
    });
    const definition = registerResource(cogs)({ name: "tasks", url: "tasks/", schema, key: "id" });
    const resource = cogs.resource(definition);
    const object = resource.get(1);
    expect(resource.get(1)).toBe(object);
    await object.load();
    await object.load();
    expect(requests).toBe(1);
    await object.refresh();
    expect(requests).toBe(2);
    const immediate = await object.load({ policy: "stale-while-revalidate" });
    expect(immediate?.title).toBe("Task 2");
    await vi.waitFor(() => expect(requests).toBe(3));
    object.invalidate();
    expect(object.stale).toBe(true);
    await object.load();
    expect(requests).toBe(4);
  });

  it("uses retrieve overrides and clears object failures", async () => {
    const requests: TransportRequest[] = [];
    const { cogs, schema } = fixture(async (request) => {
      requests.push(request);
      return { status: 404, data: {} };
    });
    const definition = registerResource(cogs)({
      name: "tasks",
      url: "tasks/",
      schema,
      key: "id",
      operations: {
        retrieve: operation.retrieve({
          method: "POST",
          path: (value: unknown) => pathFor(value, "find"),
        }),
      },
    });
    const object = cogs.resource(definition).get(2);
    await expect(object.load()).rejects.toThrow("The requested record could not be found.");
    expect(requests[0]).toMatchObject({ method: "POST", url: "tasks/find/2/" });
    expect(object.error).toMatchObject({ kind: "not-found", retryable: false });
    object.clearError();
    expect(object.error).toBeUndefined();
  });

  it("rebinds dynamic objects, clears scopes, and disposes subscriptions", async () => {
    const { cogs, schema } = fixture(async (request) => {
      const id = Number(request.url.match(/(\d+)\/$/)?.[1]);
      return { status: 200, data: { id, title: `Task ${id}`, done: false } };
    });
    const definition = registerResource(cogs)({ name: "tasks", url: "tasks/", schema, key: "id" });
    let key = 1;
    const source = () => key;
    const resource = cogs.resource(definition);
    const object = resource.get(source);
    expect(resource.get(source)).toBe(object);
    await object.load();
    key = 2;
    expect(object.key).toBe(2);
    await object.load();
    expect(object.value?.id).toBe(2);
    cogs.clearScope();
    expect(object.value).toBeUndefined();
    const revision = object.getSnapshot().revision;
    object.dispose();
    cogs.context.set(undefined);
    expect(object.getSnapshot().revision).toBeGreaterThanOrEqual(revision);
  });

  it("does not let an older retrieve overwrite a newer mutation", async () => {
    let resolveRetrieve: ((response: { status: number; data: unknown }) => void) | undefined;
    const { cogs, schema } = fixture((request) => {
      if (request.method === "GET")
        return new Promise((resolve) => {
          resolveRetrieve = resolve;
        });
      return Promise.resolve({
        status: 200,
        data: { id: 1, title: "Mutation", done: false },
      });
    });
    const definition = registerResource(cogs)({ name: "tasks", url: "tasks/", schema, key: "id" });
    const resource = cogs.resource(definition);
    const object = resource.get(1);
    const retrieve = object.load();
    await resource.update(1, { title: "Mutation" });
    resolveRetrieve?.({ status: 200, data: { id: 1, title: "Old", done: false } });
    await retrieve;
    expect(object.value?.title).toBe("Mutation");
  });
});

describe("mutations and actions", () => {
  it("accepts empty mutation responses and invalidates affected cache state", async () => {
    const { cogs, schema } = fixture(async (request) =>
      request.method === "GET"
        ? { status: 200, data: { id: 1, title: "Existing", done: false } }
        : { status: 204, data: undefined },
    );
    const definition = registerResource(cogs)({ name: "tasks", url: "tasks/", schema, key: "id" });
    const resource = cogs.resource(definition);
    const object = resource.get(1);
    await object.load();
    await expect(resource.update(1, { title: "Changed" })).resolves.toBeUndefined();
    expect(object.value?.title).toBe("Existing");
    expect(object.stale).toBe(true);
    await expect(resource.replace(1, { title: "Changed" })).resolves.toBeUndefined();
    await expect(resource.create({ title: "Created" })).resolves.toBeUndefined();
  });

  it("applies operation paths, requests, encodings, writers, and tombstones", async () => {
    const requests: TransportRequest[] = [];
    const { cogs, schema } = fixture(
      async (request) => {
        requests.push(request);
        if (request.method === "DELETE") return { status: 204, data: undefined };
        const body = request.body as Readonly<Record<string, unknown>>;
        return {
          status: 200,
          data: { id: request.url.includes("create") ? 3 : 1, title: body.task_title, done: false },
        };
      },
      { wireTitle: true },
    );
    const input = defineSchema({ title: fields.Str({ wireName: "task_title", required: true }) });
    const definition = registerResource(cogs)({
      name: "tasks",
      url: "tasks/",
      schema,
      key: "id",
      operations: {
        create: operation.create({ input, path: "create/", encoding: "json" }),
        replace: operation.replace({
          request: (value: unknown) => ({
            input: value,
            method: "PATCH" as const,
            path: "replace-one/",
            query: { mode: "replace" },
            encoding: "multipart" as const,
          }),
        }),
        update: operation.patch({ path: (value: unknown) => pathFor(value, "edit") }),
        remove: operation.remove({ path: (value: unknown) => pathFor(value, "remove") }),
      },
    });
    const resource = cogs.resource(definition);
    await resource.create({ title: "Created" });
    await resource.replace(1, { title: "Replaced" });
    await resource.update(1, { title: "Updated" }, { encoding: "raw" });
    await resource.remove(1);
    expect(requests.map(({ method, url }) => [method, url])).toEqual([
      ["POST", "tasks/create/"],
      ["PATCH", "tasks/replace-one/"],
      ["PATCH", "tasks/edit/1/"],
      ["DELETE", "tasks/remove/1/"],
    ]);
    expect(requests[0]).toMatchObject({ body: { task_title: "Created" }, encoding: "json" });
    expect(requests[1]).toMatchObject({ query: { mode: "replace" }, encoding: "multipart" });
    expect(requests[2]).toMatchObject({ body: { task_title: "Updated" }, encoding: "raw" });
    expect(resource.get(1).value).toBeUndefined();
  });

  it("normalizes default, explicit-schema, and view action outputs", async () => {
    const responses: unknown[] = [
      { id: 1, title: "Published", done: true },
      { ok: true },
      { id: 2, title: "Summary", done: false },
    ];
    const { cogs, schema } = fixture(async () => ({ status: 200, data: responses.shift() }));
    const resultSchema = defineSchema({ ok: fields.Bool({ required: true }) });
    const summary = schema.view({ fields: ["id", "title"] as const });
    const definition = registerResource(cogs)({
      name: "tasks",
      url: "tasks/",
      schema,
      key: "id",
      views: { summary },
      actions: {
        publish: operation.action({ invalidate: "resource" }),
        inspect: operation.action({ output: resultSchema, invalidate: "none" }),
        summarize: operation.action({ view: "summary", invalidate: "collections" }),
      },
    });
    const resource = cogs.resource(definition);
    expect(await resource.action("publish", {})).toMatchObject({ id: 1, done: true });
    expect(resource.get(1).value?.title).toBe("Published");
    expect(await resource.action("inspect", {})).toEqual({ ok: true });
    expect(await resource.action("summarize", {})).toEqual({ id: 2, title: "Summary" });
    expect(resource.get(2).value?.title).toBe("Summary");
  });

  it("supports custom action request builders and GET actions", async () => {
    let request: TransportRequest | undefined;
    const { cogs, schema } = fixture(async (value) => {
      request = value;
      return { status: 200, data: { id: 1, title: "Done", done: true } };
    });
    const input = defineSchema({ reason: fields.Str({ required: true, wireName: "message" }) });
    const definition = registerResource(cogs)({
      name: "tasks",
      url: "tasks/",
      schema,
      key: "id",
      actions: {
        complete: operation.action({
          input,
          request: (value: { readonly reason: string }) => ({
            input: value,
            method: "GET" as const,
            path: "complete/",
            query: { reason: value.reason },
          }),
        }),
      },
    });
    await cogs.resource(definition).action("complete", { reason: "finished" });
    expect(request).toMatchObject({
      method: "GET",
      url: "tasks/complete/",
      query: { reason: "finished" },
    });
    expect(request).not.toHaveProperty("body");
  });

  it("exposes action progress, deduplicates submission, and normalizes failures", async () => {
    let resolve: ((response: { status: number; data: unknown }) => void) | undefined;
    let request: TransportRequest | undefined;
    const { cogs, schema } = fixture(
      (value) =>
        new Promise((done) => {
          request = value;
          resolve = done;
        }),
    );
    const definition = registerResource(cogs)({
      name: "tasks",
      url: "tasks/",
      schema,
      key: "id",
      actions: { publish: operation.action({}) },
    });
    const controller = cogs.resource(definition).operation("publish", {});
    const listener = vi.fn();
    controller.subscribe(listener);
    const first = controller.execute();
    const second = controller.execute();
    expect(first).toBe(second);
    request?.onUploadProgress?.({ loaded: 5, total: 10, fraction: 0.5, lengthComputable: true });
    expect(controller.progress?.fraction).toBe(0.5);
    resolve?.({ status: 200, data: { id: 1, title: "Published", done: true } });
    await expect(first).resolves.toMatchObject({ success: true });
    expect(controller.result).toMatchObject({ id: 1 });
    expect(controller.loading).toBe(false);
    expect(listener).toHaveBeenCalled();

    const failedCogs = createUiCogs({
      context: undefined,
      transport: { request: async () => ({ status: 409, data: {} }) },
    });
    const failedSchema = defineSchema({ id: fields.ID(), title: fields.Str() });
    const failedDefinition = registerResource(failedCogs)({
      name: "failed",
      url: "failed/",
      schema: failedSchema,
      key: "id",
      actions: { run: operation.action({}) },
    });
    const failed = failedCogs.resource(failedDefinition).operation("run", {});
    await expect(failed.execute()).resolves.toMatchObject({
      success: false,
      failure: { kind: "conflict" },
    });
    expect(failed.error?.kind).toBe("conflict");
  });

  it("supports custom bulk encoding, decoding, GET requests, and partial remove", async () => {
    const requests: TransportRequest[] = [];
    const { cogs, schema } = fixture(async (request) => {
      requests.push(request);
      if (request.method === "DELETE" && request.url.includes("2"))
        return { status: 500, data: {} };
      if (request.method === "DELETE") return { status: 204, data: undefined };
      return { status: 200, data: [{ id: 1, title: "Bulk", done: true }] };
    });
    const definition = registerResource(cogs)({
      name: "tasks",
      url: "tasks/",
      schema,
      key: "id",
      actions: {
        archive: operation.bulk({
          bulk: {
            path: "archive-many/",
            encode: (keys: readonly (string | number)[], input: unknown) => ({ ids: keys, input }),
            decode: (data: unknown) => ({
              succeeded: [1],
              failed: [
                {
                  key: 2,
                  failure: { kind: "conflict" as const, issues: [], retryable: false },
                },
              ],
              values: data as readonly unknown[],
            }),
          },
        }),
        inspect: operation.bulk({ method: "GET", bulk: { method: "GET" } }),
      },
    });
    const resource = cogs.resource(definition);
    const archived = await resource.bulk.action("archive", [1, 2], { reason: "done" });
    expect(requests[0]).toMatchObject({
      method: "POST",
      url: "tasks/archive-many/",
      body: { ids: [1, 2], input: { reason: "done" } },
    });
    expect(archived.succeeded).toEqual([1]);
    expect(archived.failed[0]?.key).toBe(2);
    await resource.bulk.action("inspect", [1], {});
    expect(requests[1]).toMatchObject({ method: "GET", query: { keys: [1], input: {} } });
    await expect(resource.bulk.action("missing" as "archive", [1], {})).rejects.toThrow(
      "does not define bulk behavior",
    );
    const removed = await resource.bulk.remove([1, 2]);
    expect(removed.succeeded).toEqual([1]);
    expect(removed.failed).toHaveLength(1);
    expect(removed.failed[0]?.failure.kind).toBe("server");
  });
});

function fixture(
  responder: (
    request: TransportRequest,
  ) => Promise<{ status: number; data: unknown }> = async () => ({ status: 200, data: [] }),
  options: { readonly wireTitle?: boolean } = {},
) {
  const transport: Transport = { request: responder };
  const cogs = createUiCogs({ context: undefined, transport });
  const schema = defineSchema({
    id: fields.ID(),
    title: fields.Str({
      required: true,
      ...(options.wireTitle ? { wireName: "task_title" } : {}),
    }),
    done: fields.Bool({ default: false }),
  });
  return { cogs, schema };
}

function pathFor(value: unknown, action: string): string {
  if (typeof value !== "object" || value === null || !("key" in value))
    throw new Error("Operation key is missing");
  const key = value.key;
  if (typeof key !== "string" && typeof key !== "number")
    throw new Error("Operation key is invalid");
  return `${action}/${key}/`;
}
