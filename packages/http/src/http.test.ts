import { describe, expect, it } from "vitest";
import type { Transport } from "@uicogs/core";
import fc from "fast-check";
import {
  drfErrors,
  graphqlErrors,
  jsonApiErrors,
  multipart,
  multipartAdapter,
  MultipartEncodingError,
  pagination,
  parseEventStream,
  prepareBody,
  problemDetailsErrors,
  responseAdapters,
  poll,
  sse,
  websocket,
  vyuhErrors,
  withQuery,
} from "./index.js";

describe("HTTP adapters", () => {
  it("parses split SSE chunks, multiline data, UTF-8, IDs, and retry directives", async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(
      ': comment\nid: 7\nevent: tasks\ndata: {"title":"Café"}\ndata: second\nretry: 2500\n\n',
    );
    async function* chunks(): AsyncIterable<Uint8Array> {
      yield bytes.slice(0, 17);
      yield bytes.slice(17, bytes.length - 2);
      yield bytes.slice(bytes.length - 2);
    }
    const frames = [];
    for await (const frame of parseEventStream(chunks())) frames.push(frame);
    expect(frames).toEqual([
      { kind: "retry", milliseconds: 2500 },
      {
        kind: "event",
        event: { type: "tasks", id: "7", data: '{"title":"Café"}\nsecond' },
      },
    ]);
  });

  it("parses SSE identically across seeded UTF-8 chunk boundaries", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 12 }), { maxLength: 40 }),
        async (sizes) => {
          const source = 'id: 91\nevent: tasks\ndata: {"title":"Café 東京"}\n\n';
          const encoded = new TextEncoder().encode(source);
          async function* split(): AsyncIterable<Uint8Array> {
            let offset = 0;
            for (const size of sizes) {
              if (offset >= encoded.length) break;
              yield encoded.slice(offset, offset + size);
              offset += size;
            }
            if (offset < encoded.length) yield encoded.slice(offset);
          }
          const frames = [];
          for await (const frame of parseEventStream(split())) frames.push(frame);
          expect(frames).toEqual([
            {
              kind: "event",
              event: { type: "tasks", id: "91", data: '{"title":"Café 東京"}' },
            },
          ]);
        },
      ),
      { seed: 20_260_722, numRuns: 250 },
    );
  });

  it("opens Fetch SSE streams with Last-Event-ID", async () => {
    let requestUrl = "";
    let requestHeaders: Readonly<Record<string, string>> | undefined;
    const transport: Transport = {
      request: async () => ({ status: 200, data: undefined }),
      openStream: async (request) => {
        requestUrl = request.url;
        requestHeaders = request.headers;
        return {
          status: 200,
          headers: { "content-type": "text/event-stream" },
          body: bytes("event: tasks\ndata: {}\n\n"),
        };
      },
    };
    const source = sse({ url: "events" });
    const result = await source.open({
      context: undefined,
      scope: "anonymous",
      transport,
      baseUrl: "/api/",
      lastEventId: "6",
      signal: new AbortController().signal,
    });
    const frames = [];
    for await (const frame of result.frames) frames.push(frame);
    expect(requestUrl).toBe("/api/events");
    expect(requestHeaders?.["Last-Event-ID"]).toBe("6");
    expect(frames).toHaveLength(1);
  });

  it("normalizes polling and injected WebSocket messages as live event frames", async () => {
    const pollSource = poll({
      intervalMs: 100,
      request: async () => ({ type: "inbox", data: '{"id":"one"}' }),
    });
    const pollResult = await pollSource.open({
      context: undefined,
      scope: "anonymous",
      transport: { request: async () => ({ status: 200, data: undefined }) },
      baseUrl: "/api/",
      signal: new AbortController().signal,
    });
    expect(await pollResult.frames[Symbol.asyncIterator]().next()).toEqual({
      done: false,
      value: { kind: "event", event: { type: "inbox", data: '{"id":"one"}' } },
    });

    const listeners = new Map<string, (event: unknown) => void>();
    const socket = {
      close: () => undefined,
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        listeners.set(type, listener);
      },
      removeEventListener: (type: string) => listeners.delete(type),
    };
    const source = websocket({ url: "events", createSocket: () => socket });
    const opening = source.open({
      context: undefined,
      scope: "anonymous",
      transport: { request: async () => ({ status: 200, data: undefined }) },
      baseUrl: "/api/",
      signal: new AbortController().signal,
    });
    listeners.get("open")?.({});
    const result = await opening;
    const next = result.frames[Symbol.asyncIterator]().next();
    listeners.get("message")?.({ data: '{"id":"one"}' });
    await expect(next).resolves.toEqual({
      done: false,
      value: { kind: "event", event: { type: "message", data: '{"id":"one"}' } },
    });
  });

  it("rejects unavailable streaming and preserves terminal 204 responses", async () => {
    const source = sse({ url: "events/" });
    const connection = {
      context: undefined,
      scope: "anonymous",
      baseUrl: "/api/",
      signal: new AbortController().signal,
    };
    await expect(
      source.open({
        ...connection,
        transport: { request: async () => ({ status: 200, data: undefined }) },
      }),
    ).rejects.toThrow("does not support streaming");
    const closed = await source.open({
      ...connection,
      transport: {
        request: async () => ({ status: 200, data: undefined }),
        openStream: async () => ({ status: 204, body: bytes("") }),
      },
    });
    expect(closed.status).toBe(204);
  });

  it("preserves every optional live-source policy and opens relative URLs", async () => {
    const enabled = () => true;
    const version = () => 2;
    const map = () => ({ action: "invalidate" as const, resource: "tasks" });
    const onUnhandled = () => undefined;
    const source = sse({
      url: "/events/",
      retry: { initialMs: 5 },
      enabled,
      version,
      map,
      onUnhandled,
    });
    expect(source).toMatchObject({ enabled, version, map, onUnhandled, retry: { initialMs: 5 } });
    let url = "";
    const result = await source.open({
      context: undefined,
      scope: "anonymous",
      baseUrl: "",
      transport: {
        request: async () => ({ status: 200, data: undefined }),
        openStream: async (request) => {
          url = request.url;
          return { status: 204, body: bytes("") };
        },
      },
      signal: new AbortController().signal,
    });
    expect(url).toBe("/events/");
    expect(result.headers).toBeUndefined();
  });

  it("uses message as the unnamed SSE event and tolerates an empty body", async () => {
    const frames = [];
    for await (const frame of parseEventStream(bytes("data: value\n\n"))) frames.push(frame);
    expect(frames).toEqual([{ kind: "event", event: { type: "message", data: "value" } }]);
    const empty = [];
    for await (const frame of parseEventStream(bytes(""))) empty.push(frame);
    expect(empty).toEqual([]);
  });

  it("serializes arrays and omits empty values", () => {
    expect(withQuery("/items", { tag: ["a", "b"], empty: undefined })).toBe("/items?tag=a&tag=b");
    expect(withQuery("/items?active=true", { page: 2, none: null, blank: "" })).toBe(
      "/items?active=true&page=2",
    );
    expect(withQuery("/items", {})).toBe("/items");
    expect(withQuery("/items")).toBe("/items");
  });

  it("normalizes field dictionaries", () => {
    const failure = drfErrors().adapt({
      status: 400,
      data: { name: ["Required"] },
    });
    expect(failure?.kind).toBe("validation");
    expect(failure?.issues[0]?.path).toEqual(["name"]);
    expect(
      drfErrors()
        .adapt({
          status: 400,
          data: {
            detail: "Invalid request",
            non_field_errors: ["Fields disagree"],
          },
        })
        ?.issues.map((issue) => issue.path),
    ).toEqual([[], []]);
    expect(drfErrors().adapt({ status: 400, data: "invalid" })).toBeUndefined();
    expect(drfErrors().adapt({ status: 400, data: {} })).toBeUndefined();
    expect(
      drfErrors()
        .adapt({
          status: 400,
          data: { profile: { email: ["Invalid"] }, items: [{ title: ["Required"] }] },
        })
        ?.issues.map((issue) => issue.path),
    ).toEqual([
      ["profile", "email"],
      ["items", 0, "title"],
    ]);
  });

  it("normalizes problem details", () => {
    const failure = problemDetailsErrors().adapt({
      status: 409,
      data: { type: "conflict", title: "Conflict" },
    });
    expect(failure?.kind).toBe("conflict");
    const validation = problemDetailsErrors().adapt({
      status: 400,
      data: {
        title: "Invalid",
        errors: [{ path: ["items", 0, "name"], message: "Required" }, "ignored"],
      },
    });
    expect(validation?.issues[0]?.path).toEqual(["items", 0, "name"]);
    expect(
      problemDetailsErrors().adapt({ status: 418, data: { type: "about:blank" } }),
    ).toMatchObject({ kind: "unknown", message: "Request failed", issues: [] });
    expect(problemDetailsErrors().adapt({ status: 400, data: {} })).toBeUndefined();
  });

  it("normalizes JSON:API and GraphQL paths", () => {
    const jsonApi = jsonApiErrors().adapt({
      status: 422,
      data: {
        errors: [
          { source: { pointer: "/data/attributes/name" }, detail: "Required" },
          { title: "General" },
          "invalid",
        ],
      },
    });
    expect(jsonApi?.issues.map((issue) => issue.path)).toEqual([["name"], [], []]);
    const graphql = graphqlErrors().adapt({
      status: 200,
      data: {
        errors: [
          { path: ["createTask", "name"], message: "Required" },
          { message: "General" },
          "invalid",
        ],
      },
    });
    expect(graphql?.issues.map((issue) => issue.path)).toEqual([["createTask", "name"], [], []]);
    expect(jsonApiErrors().adapt({ status: 400, data: {} })).toBeUndefined();
    expect(graphqlErrors().adapt({ status: 400, data: {} })).toBeUndefined();
  });

  it("adapts Vyuh pages, direct lists, and nested ErrorReport issues", () => {
    const profile = responseAdapters.vyuh();
    expect(profile.pagination?.request({ index: 2, size: 15 })).toEqual({
      page: 2,
      per_page: 15,
    });
    expect(
      profile.pagination?.response({
        status: 200,
        data: {
          items: [{ id: 1 }],
          total: 31,
          page: 2,
          per_page: 15,
          total_pages: 3,
        },
      }),
    ).toMatchObject({
      items: [{ id: 1 }],
      pageInfo: { index: 2, size: 15, count: 31, totalPages: 3, hasNext: true },
    });
    expect(
      profile.pagination?.response({ status: 200, data: [{ id: 1 }] }, { index: 1, size: 25 }),
    ).toMatchObject({ pageInfo: { count: 1, hasNext: false } });

    const failure = vyuhErrors().adapt({
      status: 422,
      data: {
        source: "validation",
        code: "validation_error",
        detail: "Validation failed.",
        errors: {
          title: [{ code: "required", message: "Required." }],
          profile: { email: [{ code: "invalid", message: "Invalid email." }] },
          non_field_errors: [{ code: "conflict", message: "Fields disagree." }],
        },
      },
    });
    expect(failure).toMatchObject({ kind: "validation", message: "Validation failed." });
    expect(failure?.issues).toMatchObject([
      { path: ["title"], code: "required", message: "Required." },
      { path: ["profile", "email"], code: "invalid", message: "Invalid email." },
      { path: [], code: "conflict", message: "Fields disagree." },
    ]);
  });

  it("adapts Laravel and Spring Data pagination contracts", () => {
    const laravel = responseAdapters.laravel();
    expect(laravel.pagination?.request({ index: 3, size: 20 })).toEqual({
      page: 3,
      per_page: 20,
    });
    expect(
      laravel.pagination?.response({
        status: 200,
        data: {
          data: [{ id: 3 }],
          current_page: 3,
          per_page: 20,
          total: 81,
          last_page: 5,
          next_page_url: "/items?page=4",
          prev_page_url: "/items?page=2",
        },
      }),
    ).toMatchObject({
      items: [{ id: 3 }],
      pageInfo: { index: 3, count: 81, totalPages: 5, hasNext: true, hasPrevious: true },
    });
    expect(
      laravel.errorAdapter?.adapt({
        status: 422,
        data: { message: "Invalid", errors: { "items.0.email": ["Already used"] } },
      }),
    ).toMatchObject({ issues: [{ path: ["items", 0, "email"], message: "Already used" }] });

    const spring = responseAdapters.springData();
    expect(spring.pagination?.request({ index: 2, size: 10 })).toEqual({ page: 1, size: 10 });
    expect(
      spring.pagination?.response({
        status: 200,
        data: {
          content: [{ id: 2 }],
          totalElements: 21,
          totalPages: 3,
          number: 1,
          size: 10,
        },
      }),
    ).toMatchObject({
      items: [{ id: 2 }],
      pageInfo: { index: 2, count: 21, totalPages: 3, hasNext: true },
    });
  });

  it("decodes JSON:API resources and follows configured pagination metadata", () => {
    const profile = responseAdapters.jsonApi({ countKey: "total" });
    const response = {
      status: 200,
      data: {
        data: [{ type: "tasks", id: "1", attributes: { title: "One" } }],
        links: { next: "/tasks?page[number]=2", prev: null },
        meta: { total: 3 },
        included: [{ type: "users", id: "7" }],
      },
    } as const;
    const decoded = profile.decode?.(response, { kind: "collection", resource: "tasks" });
    expect(decoded).toMatchObject({
      data: [{ id: "1", type: "tasks", title: "One" }],
      included: [{ type: "users", id: "7" }],
    });
    expect(
      profile.pagination?.response({ status: 200, data: decoded }, { index: 1, size: 2 }),
    ).toMatchObject({
      items: [{ id: "1", type: "tasks", title: "One" }],
      pageInfo: { count: 3, totalPages: 2, hasNext: true, hasPrevious: false },
    });
    expect(
      profile.pagination?.request({
        index: 2,
        size: 2,
        token: "/tasks?page[number]=2&page[size]=2",
      }),
    ).toEqual({ "page[number]": "2", "page[size]": "2" });
    expect(
      profile.decode?.(
        { status: 200, data: { data: { type: "tasks", id: "1", attributes: { title: "One" } } } },
        { kind: "entity" },
      ),
    ).toEqual({ id: "1", type: "tasks", title: "One" });
  });

  it("requires and decodes an explicit GraphQL connection path", () => {
    const profile = responseAdapters.graphqlConnection({ connection: "data.users" });
    const response = {
      status: 200,
      data: {
        data: {
          users: {
            edges: [{ node: { id: 1, name: "Ada" } }],
            totalCount: 4,
            pageInfo: {
              hasNextPage: true,
              hasPreviousPage: false,
              endCursor: "next-1",
              startCursor: "start-1",
            },
          },
        },
      },
    } as const;
    const decoded = profile.decode?.(response, { kind: "collection" });
    expect(profile.pagination?.response({ status: 200, data: decoded })).toMatchObject({
      items: [{ id: 1, name: "Ada" }],
      pageInfo: { count: 4, hasNext: true, nextToken: "next-1" },
    });
    expect(profile.pagination?.request({ index: 2, size: 25, token: "next-1" })).toEqual({
      after: "next-1",
      first: 25,
    });
    expect(() =>
      profile.decode?.(
        { status: 200, data: { errors: [{ message: "Denied", path: ["users"] }] } },
        { kind: "collection" },
      ),
    ).toThrow("Denied");
  });

  it("packages DRF pagination and error handling as one response profile", () => {
    const profile = responseAdapters.drf();
    expect(
      profile.pagination?.response({
        status: 200,
        data: { count: 1, results: [{ id: 1 }], next: null, previous: null },
      }),
    ).toMatchObject({ items: [{ id: 1 }], pageInfo: { count: 1 } });
    expect(
      profile.errorAdapter?.adapt({ status: 400, data: { title: ["Required"] } }),
    ).toMatchObject({ kind: "validation", issues: [{ path: ["title"] }] });
  });

  it.each([
    [401, "authentication", false],
    [403, "permission", false],
    [404, "not-found", false],
    [409, "conflict", false],
    [429, "rate-limit", true],
    [500, "server", true],
  ] as const)("maps HTTP %i to %s", (status, kind, retryable) => {
    const failure = drfErrors().adapt({
      status,
      data: { detail: "Request failed" },
    });
    expect(failure).toMatchObject({ status, kind, retryable });
  });

  it("selects JSON or multipart automatically", () => {
    const json = prepareBody({ name: "Example" });
    expect(json.encoding).toBe("json");
    expect(json.body).toBe('{"name":"Example"}');

    const binary = new Blob(["file"], { type: "text/plain" });
    const upload = prepareBody({ attachment: binary });
    expect(upload.encoding).toBe("multipart");
    expect(upload.body).toBeInstanceOf(FormData);
    expect((upload.body as FormData).get("attachment")).toBeInstanceOf(Blob);
  });

  it("supports explicit raw, JSON, multipart, and existing FormData bodies", () => {
    expect(prepareBody(undefined)).toEqual({ encoding: "raw" });
    expect(prepareBody("raw", "raw")).toEqual({ body: "raw", encoding: "raw" });
    expect(prepareBody("text", "json")).toEqual({
      body: '"text"',
      encoding: "json",
      contentType: "application/json",
    });
    const direct = new FormData();
    direct.append("name", "Example");
    expect(prepareBody(direct)).toMatchObject({
      body: direct,
      encoding: "multipart",
    });
    expect(() => prepareBody("invalid", "multipart")).toThrow("Multipart bodies must be objects");
  });

  it("uses repeated multipart names and JSON parts for nested values", () => {
    const data = multipart({
      tags: ["one", "two"],
      metadata: { category: "note" },
      empty: null,
      count: 2,
      omitted: undefined,
    });
    expect(data.getAll("tags")).toEqual(["one", "two"]);
    expect(data.get("metadata")).toBe('{"category":"note"}');
    expect(data.get("empty")).toBe("null");
    expect(data.get("count")).toBe("2");
    expect(data.has("omitted")).toBe(false);
  });

  it("encodes nested binary objects and object arrays with dotted paths", () => {
    const avatar = new Blob(["avatar"], { type: "image/png" });
    const first = new Blob(["first"], { type: "text/plain" });
    const second = new Blob(["second"], { type: "text/plain" });
    const data = multipart({
      profile: { name: "Ada", avatar },
      items: [
        { title: "One", file: first },
        { title: "Two", file: second },
      ],
      attachments: [first, second],
    });

    expect(data.get("profile.name")).toBe("Ada");
    expect(data.get("profile.avatar")).toBeInstanceOf(Blob);
    expect(data.get("items.0.title")).toBe("One");
    expect(data.get("items.1.file")).toBeInstanceOf(Blob);
    expect(data.getAll("attachments")).toHaveLength(2);
  });

  it("supports bracket and custom multipart adapters", () => {
    const file = new Blob(["file"]);
    const brackets = multipart({ items: [{ file }] }, multipartAdapter.brackets());
    expect(brackets.get("items[0][file]")).toBeInstanceOf(Blob);

    const custom = multipart(
      { profile: { avatar: file } },
      multipartAdapter.custom({
        name: "uppercase",
        path: (path) => path.join("_").toUpperCase(),
        parts: (part) => [{ name: `payload.${part.name}`, value: part.value }],
      }),
    );
    expect(custom.get("payload.PROFILE_AVATAR")).toBeInstanceOf(Blob);
  });

  it("rejects forced JSON binary values and cyclic payloads", () => {
    expect(() => prepareBody({ file: new Blob(["file"]) }, "json")).toThrow(MultipartEncodingError);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => prepareBody(cyclic)).toThrow(MultipartEncodingError);
  });

  it("rejects structural binary parts that the runtime cannot append", () => {
    const binary = {
      size: 4,
      type: "text/plain",
      arrayBuffer: async () => new ArrayBuffer(4),
    };
    expect(() => prepareBody({ attachment: binary })).toThrow(
      "Multipart binary parts must be Blob or File values in this runtime",
    );
  });

  it("adapts DRF, cursor, and link-header pagination", () => {
    const drf = pagination.drf();
    expect(drf.request({ index: 2, size: 25 })).toEqual({
      page: 2,
      page_size: 25,
    });
    expect(
      drf.response({
        status: 200,
        data: {
          count: 60,
          next: "/items?page=3",
          previous: "/items?page=1",
          results: [1],
        },
      }),
    ).toMatchObject({
      items: [1],
      pageInfo: { hasNext: true, hasPrevious: true, count: 60, totalPages: 3 },
    });

    const cursor = pagination.cursor({ cursorParam: "after" });
    expect(cursor.request({ index: 1, size: 10, token: "next-token" })).toEqual({
      after: "next-token",
      page_size: 10,
    });
    expect(
      cursor.response({
        status: 200,
        data: {
          next: "https://api.example/items?cursor=next",
          previous: "https://api.example/items?cursor=previous",
          results: [1, 2],
        },
      }),
    ).toMatchObject({
      items: [1, 2],
      nextPage: "next",
      previousPage: "previous",
      pageInfo: { hasNext: true, hasPrevious: true },
    });

    const links = pagination.linkHeader();
    expect(links.request({ index: 3, size: 20 })).toEqual({
      page: 3,
      page_size: 20,
    });
    expect(
      links.response({
        status: 200,
        data: [1],
        headers: {
          link: '<https://api.example/items?page=4>; rel="next", <https://api.example/items?page=2>; rel=prev',
        },
      }),
    ).toMatchObject({
      items: [1],
      nextPage: "https://api.example/items?page=4",
      previousPage: "https://api.example/items?page=2",
    });
  });

  it("handles absent and malformed pagination metadata", () => {
    expect(pagination.cursor().request({ index: 1, size: 10 })).toEqual({ page_size: 10 });
    expect(
      pagination.cursor().response({ status: 200, data: { next: 10, previous: null } }),
    ).toMatchObject({
      items: [],
      pageInfo: { hasNext: false, hasPrevious: false },
    });
    expect(
      pagination.linkHeader().response({
        status: 200,
        data: {},
        headers: { link: "malformed" },
      }),
    ).toMatchObject({
      items: [],
      pageInfo: { hasNext: false, hasPrevious: false },
    });
    expect(
      pagination.linkHeader().response({
        status: 200,
        data: [],
        headers: { link: '<https://api.example/items?page=1>; rel="previous"' },
      }),
    ).toMatchObject({ previousPage: "https://api.example/items?page=1" });
  });
});

async function* bytes(value: string): AsyncIterable<Uint8Array> {
  if (value) yield new TextEncoder().encode(value);
}
