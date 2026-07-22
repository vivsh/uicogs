import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyTransportMiddleware,
  createDefaultTransport,
  multipartAdapter,
  prepareBody,
  withQuery,
} from "./default-http.js";
import { TransportExecutionError, type TransportRequest } from "./transport.js";

describe("default Fetch transport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("serializes supported query values before a fragment", () => {
    expect(
      withQuery("/items?active=true#results", {
        id: [3, 7, 12],
        page: 2,
        exact: false,
        empty: "",
      }),
    ).toBe("/items?active=true&id=3&id=7&id=12&page=2&exact=false#results");
    expect(() => withQuery("/items", { nested: { value: 1 } })).toThrow(
      "must be a scalar or scalar array",
    );
    expect(() => withQuery("/items", { invalid: Number.NaN })).toThrow("must be finite");
  });

  it("constructs JSON requests with case-insensitive header precedence", async () => {
    let captured: { readonly url: string; readonly init?: RequestInit } | undefined;
    const transport = createDefaultTransport({
      fetch: async (input, init) => {
        captured = { url: String(input), init };
        return new Response('\uFEFF{"id":1}', {
          status: 201,
          headers: { "content-type": "application/vnd.api+json", "X-Result": "created" },
        });
      },
    });
    const progress: unknown[] = [];
    const response = await transport.request({
      method: "POST",
      url: "/items#new",
      credentials: "include",
      query: { active: true },
      headers: { accept: "application/problem+json" },
      body: { name: "Example" },
      signal: new AbortController().signal,
      onUploadProgress: (value) => progress.push(value),
    });

    expect(captured?.url).toBe("/items?active=true#new");
    expect(captured?.init?.credentials).toBe("include");
    expect(new Headers(captured?.init?.headers).get("accept")).toBe("application/problem+json");
    expect(new Headers(captured?.init?.headers).get("content-type")).toBe("application/json");
    expect(captured?.init?.body).toBe('{"name":"Example"}');
    expect(response).toEqual({
      status: 201,
      data: { id: 1 },
      headers: { "content-type": "application/vnd.api+json", "x-result": "created" },
    });
    expect(progress).toEqual([
      { loaded: 0, lengthComputable: false },
      { loaded: 1, lengthComputable: false },
    ]);
  });

  it("returns undefined for empty responses and text for non-JSON bodies", async () => {
    const responses = [
      new Response(null, { status: 204 }),
      new Response(null, { status: 205 }),
      new Response("plain", { headers: { "content-type": "text/plain" } }),
      new Response("{invalid", {
        status: 400,
        headers: { "content-type": "application/problem+json" },
      }),
      new Response("null", { headers: { "content-type": "application/json" } }),
    ];
    const transport = createDefaultTransport({ fetch: async () => responses.shift()! });
    expect((await transport.request(getRequest())).data).toBeUndefined();
    expect((await transport.request(getRequest())).data).toBeUndefined();
    expect((await transport.request(getRequest())).data).toBe("plain");
    expect((await transport.request(getRequest())).data).toBe("{invalid");
    expect((await transport.request(getRequest())).data).toBeNull();
  });

  it("reports malformed successful JSON as a protocol failure", async () => {
    const transport = createDefaultTransport({
      fetch: async () =>
        new Response("{invalid", { headers: { "content-type": "application/json" } }),
    });
    await expect(transport.request(getRequest())).rejects.toMatchObject({
      name: "TransportExecutionError",
      code: "protocol",
      retryable: false,
      status: 200,
    });
  });

  it("retries retryable GET responses and network failures within one chain", async () => {
    let attempts = 0;
    const transport = createDefaultTransport({
      retry: { maximumRetries: 2, initialDelayMs: 0, jitter: 0 },
      fetch: async () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("offline");
        return new Response(attempts === 2 ? "busy" : "ok", {
          status: attempts === 2 ? 503 : 200,
        });
      },
    });
    expect((await transport.request(getRequest())).data).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("never retries mutations, authorization failures, or protocol failures", async () => {
    let mutationAttempts = 0;
    const mutation = createDefaultTransport({
      retry: { initialDelayMs: 0 },
      fetch: async () => {
        mutationAttempts += 1;
        return new Response("busy", { status: 503 });
      },
    });
    expect((await mutation.request({ ...getRequest(), method: "POST" })).status).toBe(503);
    expect(mutationAttempts).toBe(1);

    let unauthorizedAttempts = 0;
    const unauthorized = createDefaultTransport({
      retry: { initialDelayMs: 0 },
      fetch: async () => {
        unauthorizedAttempts += 1;
        return new Response("unauthorized", { status: 401 });
      },
    });
    expect((await unauthorized.request(getRequest())).status).toBe(401);
    expect(unauthorizedAttempts).toBe(1);

    await expect(
      mutation.request({ ...getRequest(), body: { invalid: true } }),
    ).rejects.toMatchObject({ code: "protocol" });
  });

  it("honors Retry-After without exceeding the total deadline", async () => {
    const transport = createDefaultTransport({
      timeoutMs: 5,
      retry: { initialDelayMs: 0, jitter: 0 },
      fetch: async () => new Response("busy", { status: 503, headers: { "Retry-After": "1" } }),
    });
    await expect(transport.request(getRequest())).rejects.toMatchObject({ code: "timeout" });
  });

  it("parses HTTP-date Retry-After values and ignores malformed directives", async () => {
    const dateRetry = createDefaultTransport({
      timeoutMs: 5,
      retry: { initialDelayMs: 0, jitter: 0 },
      fetch: async () =>
        new Response("busy", {
          status: 503,
          headers: { "Retry-After": new Date(Date.now() + 1_000).toUTCString() },
        }),
    });
    await expect(dateRetry.request(getRequest())).rejects.toMatchObject({ code: "timeout" });

    let attempts = 0;
    const malformed = createDefaultTransport({
      retry: { maximumRetries: 1, initialDelayMs: 0, jitter: 0 },
      fetch: async () => {
        attempts += 1;
        return new Response(attempts === 1 ? "busy" : "ready", {
          status: attempts === 1 ? 503 : 200,
          headers: { "Retry-After": "not-a-date" },
        });
      },
    });
    expect((await malformed.request(getRequest())).data).toBe("ready");
  });

  it("cancels an active retry delay immediately", async () => {
    const controller = new AbortController();
    const transport = createDefaultTransport({
      timeoutMs: 0,
      retry: { initialDelayMs: 1_000, jitter: 0, respectRetryAfter: false },
      fetch: async () => new Response("busy", { status: 503 }),
    });
    const pending = transport.request({ ...getRequest(), signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not dispatch a request whose caller is already aborted", async () => {
    let called = false;
    const controller = new AbortController();
    controller.abort();
    const transport = createDefaultTransport({
      fetch: async (_input, init) => {
        called = true;
        throw init?.signal?.reason;
      },
    });
    await expect(
      transport.request({ ...getRequest(), signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(called).toBe(false);
  });

  it("uses one total deadline and distinguishes timeout from caller cancellation", async () => {
    const waitingFetch: typeof fetch = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    const timed = createDefaultTransport({ fetch: waitingFetch, timeoutMs: 5, retry: false });
    await expect(timed.request(getRequest())).rejects.toMatchObject({ code: "timeout" });

    const controller = new AbortController();
    const cancelled = createDefaultTransport({ fetch: waitingFetch, timeoutMs: 0 });
    const pending = cancelled.request({ ...getRequest(), signal: controller.signal });
    controller.abort(new DOMException("Stopped", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError", message: "Stopped" });
  });

  it("resolves global Fetch lazily and reports its absence clearly", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: undefined });
    try {
      const transport = createDefaultTransport();
      await expect(transport.request(getRequest())).rejects.toMatchObject({
        code: "protocol",
        message: "Fetch is unavailable. Provide http.fetch or a custom transport.",
      });
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "fetch", descriptor);
    }
  });

  it("leaves multipart boundaries to Fetch and rejects manual content types", async () => {
    let captured: RequestInit | undefined;
    const transport = createDefaultTransport({
      fetch: async (_input, init) => {
        captured = init;
        return new Response(null, { status: 204 });
      },
      multipart: multipartAdapter.brackets(),
    });
    await transport.request({
      method: "POST",
      url: "/upload",
      body: { items: [{ file: new Blob(["file"]) }] },
      signal: new AbortController().signal,
    });
    expect(new Headers(captured?.headers).has("content-type")).toBe(false);
    expect(captured?.body).toBeInstanceOf(FormData);
    expect((captured?.body as FormData).get("items[0][file]")).toBeInstanceOf(Blob);

    await expect(
      transport.request({
        method: "POST",
        url: "/upload",
        headers: { "Content-Type": "multipart/form-data" },
        body: { file: new Blob(["file"]) },
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: "protocol" });
  });

  it("validates raw and cyclic request bodies", () => {
    expect(() => prepareBody(new Map(), "raw")).toThrow("supported Fetch body type");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => prepareBody(cyclic)).toThrow("Cyclic payload");
  });

  it("validates timeout and retry configuration before dispatch", async () => {
    await expect(createDefaultTransport({ timeoutMs: -1 }).request(getRequest())).rejects.toThrow(
      "timeoutMs must be non-negative",
    );
    await expect(
      createDefaultTransport({ retry: { maximumRetries: 1.5 } }).request(getRequest()),
    ).rejects.toThrow("maximumRetries must be an integer");
    await expect(
      createDefaultTransport({ retry: { jitter: 2 } }).request(getRequest()),
    ).rejects.toThrow("jitter must be between 0 and 1");
  });

  it("opens unbuffered event streams without request retries or deadlines", async () => {
    let attempts = 0;
    const transport = createDefaultTransport({
      timeoutMs: 1,
      retry: { maximumRetries: 2, initialDelayMs: 0 },
      fetch: async () => {
        attempts += 1;
        return new Response("event: tasks\ndata: {}\n\n", {
          headers: { "content-type": "text/event-stream" },
        });
      },
    });
    const stream = await transport.openStream!(getRequest());
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream.body) chunks.push(chunk);
    expect(new TextDecoder().decode(chunks[0])).toContain("event: tasks");
    expect(attempts).toBe(1);
  });

  it("rejects successful streams with the wrong media type", async () => {
    const transport = createDefaultTransport({
      fetch: async () => new Response("not SSE", { headers: { "content-type": "text/plain" } }),
    });
    await expect(transport.openStream!(getRequest())).rejects.toMatchObject({ code: "protocol" });
  });

  it("provides an empty stream for responses without a body", async () => {
    const transport = createDefaultTransport({
      fetch: async () => new Response(null, { status: 204 }),
    });
    const response = await transport.openStream!(getRequest());
    const values = [];
    for await (const value of response.body) values.push(value);
    expect(values).toEqual([]);
  });

  it("runs middleware in declaration order for requests and streams", async () => {
    const calls: string[] = [];
    const transport = applyTransportMiddleware(
      {
        request: async () => {
          calls.push("transport");
          return { status: 200, data: undefined };
        },
        openStream: async () => {
          calls.push("stream-transport");
          return { status: 204, body: emptyBytes() };
        },
      },
      ["first", "second"].map((name) => ({
        async request(request, next) {
          calls.push(`${name}:before`);
          const response = await next(request);
          calls.push(`${name}:after`);
          return response;
        },
        async openStream(request, next) {
          calls.push(`${name}:stream-before`);
          const response = await next(request);
          calls.push(`${name}:stream-after`);
          return response;
        },
      })),
    );
    await transport.request(getRequest());
    await transport.openStream!(getRequest());
    expect(calls).toEqual([
      "first:before",
      "second:before",
      "transport",
      "second:after",
      "first:after",
      "first:stream-before",
      "second:stream-before",
      "stream-transport",
      "second:stream-after",
      "first:stream-after",
    ]);
  });

  it("normalizes network errors without exposing request details", async () => {
    const transport = createDefaultTransport({
      retry: false,
      fetch: async () => {
        throw new TypeError("connection reset for https://secret.invalid?token=value");
      },
    });
    const error = await transport.request(getRequest()).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(TransportExecutionError);
    expect(error).toMatchObject({ code: "network", message: "Network request failed" });
    expect(String(error)).not.toContain("secret.invalid");
  });
});

function getRequest(): TransportRequest {
  return {
    method: "GET",
    url: "/items",
    signal: new AbortController().signal,
  };
}

async function* emptyBytes(): AsyncIterable<Uint8Array> {
  yield* [];
}
