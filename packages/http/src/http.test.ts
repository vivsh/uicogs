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
  sse,
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
    const source = sse({ url: "events/" });
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
    expect(requestUrl).toBe("/api/events/");
    expect(requestHeaders?.["Last-Event-ID"]).toBe("6");
    expect(frames).toHaveLength(1);
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
    expect(jsonApi?.issues.map((issue) => issue.path)).toEqual([["attributes", "name"], [], []]);
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
