import { defineSchema, registerResource } from "./test-utils.js";

import { createGzip } from "node:zlib";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUiCogs } from "./factory.js";
import { fields } from "./field.js";
import { createDefaultTransport } from "./default-http.js";

describe("default Fetch transport over HTTP", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | undefined;
  let retries = 0;

  beforeAll(async () => {
    const server = createServer((request, response) => route(request, response));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind TCP");
    baseUrl = `http://127.0.0.1:${address.port}/`;
    closeServer = () => new Promise<void>((resolve) => server.close(() => resolve()));

    function route(request: IncomingMessage, response: ServerResponse): void {
      const url = new URL(request.url ?? "/", baseUrl);
      if (url.pathname === "/echo") {
        json(response, {
          query: url.searchParams.getAll("id"),
          existing: url.searchParams.get("existing"),
          accept: request.headers.accept,
        });
        return;
      }
      if (url.pathname === "/tasks/") {
        json(response, [{ id: 1, title: "From server" }]);
        return;
      }
      if (url.pathname === "/retry") {
        retries += 1;
        if (retries < 3) {
          response.writeHead(503, { "Retry-After": "0" });
          response.end("busy");
        } else response.end("ready");
        return;
      }
      if (url.pathname === "/delayed") {
        setTimeout(() => response.end("late"), 50);
        return;
      }
      if (url.pathname === "/gzip") {
        response.writeHead(200, { "Content-Type": "application/json", "Content-Encoding": "gzip" });
        const gzip = createGzip();
        gzip.pipe(response);
        gzip.end('{"compressed":true}');
        return;
      }
      if (url.pathname === "/upload") {
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () =>
          json(response, {
            contentType: request.headers["content-type"],
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        return;
      }
      if (url.pathname === "/redirect") {
        response.writeHead(302, { Location: "/echo?id=9" });
        response.end();
        return;
      }
      if (url.pathname === "/chunked") {
        response.writeHead(200, { "Content-Type": "text/plain" });
        response.write("first");
        setTimeout(() => response.end("-second"), 5);
        return;
      }
      if (url.pathname === "/reset") {
        request.socket.destroy();
        return;
      }
      if (url.pathname === "/events") {
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        response.write('event: tasks\ndata: {"id":1}\n\n');
        return;
      }
      response.writeHead(404);
      response.end("missing");
    }
  });

  afterAll(async () => closeServer?.());

  it("powers remote resources without an application-created transport", async () => {
    const cogs = createUiCogs({ context: undefined, baseUrl });
    const Task = defineSchema({ id: fields.ID(), title: fields.Text({ required: true }) });
    const Tasks = registerResource(cogs)({ name: "tasks", url: "tasks/", schema: Task, key: "id" });
    const tasks = cogs.resource(Tasks);
    await tasks.load();
    expect(tasks.all()).toEqual([{ id: 1, title: "From server" }]);
    cogs.dispose();
  });

  it("preserves existing queries and repeated values", async () => {
    const transport = createDefaultTransport();
    const response = await transport.request({
      method: "GET",
      url: `${baseUrl}echo?existing=yes#ignored`,
      query: { id: [3, 7, 12] },
      signal: new AbortController().signal,
    });
    expect(response.data).toEqual({
      query: ["3", "7", "12"],
      existing: "yes",
      accept: "application/json",
    });
  });

  it("retries GET failures and honors a zero Retry-After", async () => {
    retries = 0;
    const response = await createDefaultTransport({
      retry: { maximumRetries: 2, initialDelayMs: 100, respectRetryAfter: true },
    }).request(get(`${baseUrl}retry`));
    expect(response.data).toBe("ready");
    expect(retries).toBe(3);
  });

  it("enforces the total timeout while reading a response", async () => {
    await expect(
      createDefaultTransport({ timeoutMs: 5, retry: false }).request(get(`${baseUrl}delayed`)),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("handles gzip, redirects, and chunked bodies through Fetch", async () => {
    const transport = createDefaultTransport();
    expect((await transport.request(get(`${baseUrl}gzip`))).data).toEqual({ compressed: true });
    expect((await transport.request(get(`${baseUrl}redirect`))).data).toMatchObject({
      query: ["9"],
    });
    expect((await transport.request(get(`${baseUrl}chunked`))).data).toBe("first-second");
  });

  it("sends real multipart bodies without a manual boundary", async () => {
    const response = await createDefaultTransport().request({
      method: "POST",
      url: `${baseUrl}upload`,
      body: { title: "Document", attachment: new Blob(["contents"], { type: "text/plain" }) },
      signal: new AbortController().signal,
    });
    expect(response.data).toMatchObject({
      contentType: expect.stringContaining("multipart/form-data; boundary="),
      body: expect.stringContaining("contents"),
    });
  });

  it("surfaces connection resets as sanitized network failures", async () => {
    const error = await createDefaultTransport({ retry: false })
      .request(get(`${baseUrl}reset?secret=value`))
      .catch((value: unknown) => value);
    expect(error).toMatchObject({ code: "network", message: "Network request failed" });
    expect(String(error)).not.toContain("secret=value");
  });

  it("cancels and releases a live response reader", async () => {
    const controller = new AbortController();
    const response = await createDefaultTransport().openStream!({
      ...get(`${baseUrl}events`),
      signal: controller.signal,
    });
    const iterator = response.body[Symbol.asyncIterator]();
    expect(new TextDecoder().decode((await iterator.next()).value)).toContain("event: tasks");
    controller.abort();
    await iterator.return?.();
  });
});

function get(url: string) {
  return { method: "GET" as const, url, signal: new AbortController().signal };
}

function json(response: ServerResponse, value: unknown): void {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}
