import { isBinaryPart } from "./field.js";
import {
  TransportExecutionError,
  type BodyEncoding,
  type DefaultHttpOptions,
  type HttpRetryOptions,
  type MultipartAdapter,
  type MultipartPart,
  type StreamResponse,
  type Transport,
  type TransportMiddleware,
  type TransportRequest,
  type TransportResponse,
} from "./transport.js";

const DEFAULT_RETRY_STATUSES = Object.freeze([408, 425, 429, 500, 502, 503, 504]);

interface ResolvedRetryOptions {
  readonly maximumRetries: number;
  readonly statuses: ReadonlySet<number>;
  readonly initialDelayMs: number;
  readonly maximumDelayMs: number;
  readonly jitter: number;
  readonly respectRetryAfter: boolean;
}

export interface PreparedBody {
  readonly body?: BodyInit;
  readonly encoding: Exclude<BodyEncoding, "auto">;
  readonly contentType?: string;
  readonly total?: number;
}

export class MultipartEncodingError extends Error {
  constructor(
    message: string,
    readonly path: readonly (string | number)[] = [],
  ) {
    super(path.length ? `${message} at ${path.join(".")}` : message);
    this.name = "MultipartEncodingError";
  }
}

export const multipartAdapter = Object.freeze({
  dotted(): MultipartAdapter {
    return Object.freeze({
      name: "dotted",
      path: (path: readonly (string | number)[]) => path.join("."),
    });
  },
  brackets(): MultipartAdapter {
    return Object.freeze({
      name: "brackets",
      path: (path: readonly (string | number)[]) =>
        path.length
          ? `${String(path[0])}${path
              .slice(1)
              .map((part) => `[${String(part)}]`)
              .join("")}`
          : "",
    });
  },
  custom(adapter: MultipartAdapter): MultipartAdapter {
    return Object.freeze(adapter);
  },
});

const defaultMultipartAdapter = multipartAdapter.dotted();

export function createDefaultTransport(options: DefaultHttpOptions = {}): Transport {
  return {
    capabilities: { uploadProgress: "indeterminate" },
    request: (request) => executeRequest(request, options),
    openStream: (request) => executeStream(request, options),
  };
}

export function applyTransportMiddleware(
  transport: Transport,
  middleware: readonly TransportMiddleware[] = [],
): Transport {
  if (!middleware.length) return transport;
  const request = middleware.reduceRight<Transport["request"]>(
    (next, current) => (value) => current.request(value, next),
    (value) => transport.request(value),
  );
  const baseStream = transport.openStream;
  if (!baseStream)
    return { ...(transport.capabilities ? { capabilities: transport.capabilities } : {}), request };
  const openStream = middleware.reduceRight<(value: TransportRequest) => Promise<StreamResponse>>(
    (next, current) => (current.openStream ? (value) => current.openStream!(value, next) : next),
    (value) => baseStream(value),
  );
  return {
    ...(transport.capabilities ? { capabilities: transport.capabilities } : {}),
    request,
    openStream,
  };
}

async function executeRequest(
  request: TransportRequest,
  options: DefaultHttpOptions,
): Promise<TransportResponse<unknown>> {
  if (request.signal.aborted) throw abortReason(request.signal);
  if (request.method === "GET" && request.body !== undefined)
    throw protocolError("GET requests cannot contain a body");
  const prepared = prepareBody(
    request.body,
    request.encoding,
    request.multipart ?? options.multipart,
  );
  assertMultipartHeader(prepared, request.headers);
  const headers = mergeHeaders(
    { Accept: "application/json" },
    request.headers,
    prepared.contentType ? { "Content-Type": prepared.contentType } : undefined,
  );
  const timeoutMs = validateNonNegative(options.timeoutMs ?? 30_000, "timeoutMs");
  const deadline = timeoutMs === 0 ? undefined : Date.now() + timeoutMs;
  const retry = resolveRetry(options.retry);
  const maximumAttempts = request.method === "GET" && retry ? retry.maximumRetries + 1 : 1;
  const url = withQuery(request.url, request.query);

  if (request.body !== undefined)
    request.onUploadProgress?.({ loaded: 0, lengthComputable: false });

  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const remaining = remainingMs(deadline);
    if (remaining !== undefined && remaining <= 0) throw timeoutError();
    try {
      const response = await fetchAttempt(request, options, prepared, headers, url, remaining);
      if (attempt + 1 < maximumAttempts && retry?.statuses.has(response.status)) {
        await waitForRetry(response.headers, attempt, retry, deadline, request.signal);
        continue;
      }
      if (request.body !== undefined)
        request.onUploadProgress?.({
          loaded: prepared.total ?? 1,
          ...(prepared.total ? { total: prepared.total, fraction: 1 } : {}),
          lengthComputable: false,
        });
      return response;
    } catch (error) {
      if (request.signal.aborted) throw abortReason(request.signal);
      const normalized = normalizeFetchError(error);
      if (normalized.code !== "network") throw normalized;
      if (attempt + 1 >= maximumAttempts || !retry || !normalized.retryable) throw normalized;
      await waitForRetry(undefined, attempt, retry, deadline, request.signal);
    }
  }
  throw new TransportExecutionError("network", "HTTP request failed", true);
}

async function fetchAttempt(
  request: TransportRequest,
  options: DefaultHttpOptions,
  prepared: PreparedBody,
  headers: Readonly<Record<string, string>>,
  url: string,
  remaining: number | undefined,
): Promise<TransportResponse<unknown>> {
  const fetcher = resolveFetch(options.fetch);
  const attempt = combineAbort(request.signal, remaining);
  try {
    const response = await fetcher(url, {
      method: request.method,
      headers,
      ...(request.credentials ? { credentials: request.credentials } : {}),
      ...(prepared.body !== undefined ? { body: prepared.body } : {}),
      signal: attempt.signal,
    });
    const normalizedHeaders = normalizeHeaders(response.headers);
    const data = await parseResponse(response, normalizedHeaders);
    return { status: response.status, data, headers: normalizedHeaders };
  } catch (error) {
    if (request.signal.aborted) throw abortReason(request.signal);
    if (attempt.timedOut()) throw timeoutError(error);
    throw error;
  } finally {
    attempt.dispose();
  }
}

async function executeStream(
  request: TransportRequest,
  options: DefaultHttpOptions,
): Promise<StreamResponse> {
  if (request.signal.aborted) throw abortReason(request.signal);
  if (request.method === "GET" && request.body !== undefined)
    throw protocolError("GET requests cannot contain a body");
  const fetcher = resolveFetch(options.fetch);
  try {
    const response = await fetcher(withQuery(request.url, request.query), {
      method: request.method,
      headers: mergeHeaders({ Accept: "text/event-stream" }, request.headers),
      ...(request.credentials ? { credentials: request.credentials } : {}),
      signal: request.signal,
    });
    const headers = normalizeHeaders(response.headers);
    if (response.status >= 200 && response.status < 300 && response.status !== 204) {
      const contentType = header(headers, "content-type");
      if (!contentType?.toLowerCase().startsWith("text/event-stream")) {
        await response.body?.cancel();
        throw protocolError(
          `Expected text/event-stream but received ${contentType ?? "no content type"}`,
          response.status,
        );
      }
    }
    return {
      status: response.status,
      headers,
      body: response.body ? readableStream(response.body, request.signal) : emptyBytes(),
    };
  } catch (error) {
    if (request.signal.aborted) throw abortReason(request.signal);
    throw normalizeFetchError(error);
  }
}

export function withQuery(url: string, query?: Readonly<Record<string, unknown>>): string {
  if (!query) return url;
  const fragmentIndex = url.indexOf("#");
  const base = fragmentIndex < 0 ? url : url.slice(0, fragmentIndex);
  const fragment = fragmentIndex < 0 ? "" : url.slice(fragmentIndex);
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) appendQuery(params, name, value);
  const encoded = params.toString();
  return encoded ? `${base}${base.includes("?") ? "&" : "?"}${encoded}${fragment}` : url;
}

function appendQuery(parameters: URLSearchParams, name: string, value: unknown): void {
  if (value === undefined || value === null || value === "") return;
  if (Array.isArray(value)) {
    for (const item of value) appendQueryScalar(parameters, name, item);
    return;
  }
  appendQueryScalar(parameters, name, value);
}

function appendQueryScalar(parameters: URLSearchParams, name: string, value: unknown): void {
  if (value === undefined || value === null || value === "") return;
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")
    throw protocolError(`Query parameter ${name} must be a scalar or scalar array`);
  if (typeof value === "number" && !Number.isFinite(value))
    throw protocolError(`Query parameter ${name} must be finite`);
  parameters.append(name, String(value));
}

export function prepareBody(
  body: unknown,
  encoding: BodyEncoding = "auto",
  adapter: MultipartAdapter = defaultMultipartAdapter,
): PreparedBody {
  if (body === undefined) return { encoding: "raw" };
  if (isFormData(body)) return { body, encoding: "multipart", total: binarySize(body) };
  const hasBinary = inspectBinary(body);
  const resolved = encoding === "auto" ? (hasBinary ? "multipart" : "json") : encoding;
  if (resolved === "multipart") {
    if (!isRecord(body)) throw new MultipartEncodingError("Multipart bodies must be objects");
    return { body: multipart(body, adapter), encoding: "multipart", total: binarySize(body) };
  }
  if (resolved === "json") {
    if (hasBinary) throw new MultipartEncodingError("JSON encoding cannot contain binary values");
    try {
      return { body: JSON.stringify(body), encoding: "json", contentType: "application/json" };
    } catch (error) {
      throw protocolError("JSON body could not be serialized", undefined, error);
    }
  }
  if (!isBodyInit(body)) throw protocolError("Raw body is not a supported Fetch body type");
  return { body, encoding: "raw" };
}

export function multipart(
  values: Readonly<Record<string, unknown>>,
  adapter: MultipartAdapter = defaultMultipartAdapter,
): FormData {
  if (typeof FormData === "undefined")
    throw protocolError("FormData is not available in this runtime");
  const data = new FormData();
  for (const [name, value] of Object.entries(values))
    appendValue(data, [name], value, adapter, new Set());
  return data;
}

function appendValue(
  data: FormData,
  path: readonly (string | number)[],
  value: unknown,
  adapter: MultipartAdapter,
  ancestors: Set<object>,
): void {
  if (value === undefined) return;
  if (value === null) {
    const parts = adapter.removal?.(path) ?? [{ name: adapter.path(path), value: "null" }];
    for (const part of parts) appendPart(data, part.name, part.value, path);
    return;
  }
  if (isBlob(value) || isBinaryPart(value) || typeof value !== "object") {
    appendAdaptedPart(data, path, value, adapter);
    return;
  }
  if (ancestors.has(value)) throw new MultipartEncodingError("Cyclic multipart payload", path);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const containsObjects = value.some(isMultipartObject);
      if (!containsObjects || !inspectBinary(value)) {
        if (containsObjects) appendAdaptedPart(data, path, value, adapter);
        else for (const item of value) appendValue(data, path, item, adapter, ancestors);
      } else {
        value.forEach((item, index) =>
          appendValue(data, [...path, index], item, adapter, ancestors),
        );
      }
      return;
    }
    if (!inspectBinary(value)) {
      appendAdaptedPart(data, path, value, adapter);
      return;
    }
    for (const [name, item] of Object.entries(value))
      appendValue(data, [...path, name], item, adapter, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function appendAdaptedPart(
  data: FormData,
  path: readonly (string | number)[],
  value: unknown,
  adapter: MultipartAdapter,
): void {
  const part = { name: adapter.path(path), value, path };
  const parts: readonly MultipartPart[] = adapter.parts?.(part) ?? [part];
  for (const encoded of parts) appendPart(data, encoded.name, encoded.value, path);
}

function appendPart(
  data: FormData,
  name: string,
  value: unknown,
  path: readonly (string | number)[],
): void {
  if (isBlob(value)) {
    const fileName = "name" in value && typeof value.name === "string" ? value.name : undefined;
    if (fileName) data.append(name, value, fileName);
    else data.append(name, value);
  } else if (isBinaryPart(value)) {
    throw new MultipartEncodingError(
      "Multipart binary parts must be Blob or File values in this runtime",
      path,
    );
  } else if (value === null) data.append(name, "null");
  else if (typeof value === "object") data.append(name, JSON.stringify(value));
  else data.append(name, String(value));
}

function inspectBinary(
  value: unknown,
  path: readonly (string | number)[] = [],
  ancestors = new Set<object>(),
): boolean {
  if (isFormData(value) || isBlob(value) || isBinaryPart(value)) return true;
  if (typeof value !== "object" || value === null) return false;
  if (ancestors.has(value)) throw new MultipartEncodingError("Cyclic payload", path);
  ancestors.add(value);
  try {
    const entries: readonly (readonly [string | number, unknown])[] = Array.isArray(value)
      ? value.map((item, index) => [index, item] as const)
      : Object.entries(value);
    return entries.some(([name, item]) => inspectBinary(item, [...path, name], ancestors));
  } finally {
    ancestors.delete(value);
  }
}

function binarySize(value: unknown, seen = new Set<object>()): number | undefined {
  if (isBlob(value) || isBinaryPart(value)) return value.size;
  if (typeof value !== "object" || value === null || seen.has(value) || isFormData(value))
    return undefined;
  seen.add(value);
  const sizes = (Array.isArray(value) ? value : Object.values(value))
    .map((item) => binarySize(item, seen))
    .filter((size): size is number => size !== undefined);
  return sizes.length ? sizes.reduce((total, size) => total + size, 0) : undefined;
}

async function parseResponse(
  response: Response,
  headers: Readonly<Record<string, string>>,
): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined;
  const text = (await response.text()).replace(/^\uFEFF/, "");
  if (!text) return undefined;
  const contentType = header(headers, "content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const json =
    contentType === "application/json" || Boolean(contentType?.match(/^application\/[^/]+\+json$/));
  if (!json) return text;
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (response.ok) throw protocolError("Server returned malformed JSON", response.status, error);
    return text;
  }
}

function resolveFetch(configured: typeof globalThis.fetch | undefined): typeof globalThis.fetch {
  const fetcher = configured ?? globalThis.fetch;
  if (typeof fetcher !== "function")
    throw new TransportExecutionError(
      "protocol",
      "Fetch is unavailable. Provide http.fetch or a custom transport.",
      false,
    );
  return fetcher;
}

function resolveRetry(
  options: false | HttpRetryOptions | undefined,
): ResolvedRetryOptions | undefined {
  if (options === false) return undefined;
  const value = options ?? {};
  return {
    maximumRetries: validateNonNegativeInteger(value.maximumRetries ?? 2, "maximumRetries"),
    statuses: new Set(value.statuses ?? DEFAULT_RETRY_STATUSES),
    initialDelayMs: validateNonNegative(value.initialDelayMs ?? 250, "initialDelayMs"),
    maximumDelayMs: validateNonNegative(value.maximumDelayMs ?? 2_000, "maximumDelayMs"),
    jitter: validateRange(value.jitter ?? 0.2, "jitter", 0, 1),
    respectRetryAfter: value.respectRetryAfter ?? true,
  };
}

async function waitForRetry(
  headers: Readonly<Record<string, string>> | undefined,
  attempt: number,
  retry: ResolvedRetryOptions,
  deadline: number | undefined,
  signal: AbortSignal,
): Promise<void> {
  const retryAfter = retry.respectRetryAfter
    ? parseRetryAfter(header(headers, "retry-after"))
    : undefined;
  const exponential = Math.min(retry.maximumDelayMs, retry.initialDelayMs * 2 ** attempt);
  const randomized = exponential * (1 + (Math.random() * 2 - 1) * retry.jitter);
  const delay = Math.max(0, retryAfter ?? randomized);
  const remaining = remainingMs(deadline);
  if (remaining !== undefined && delay >= remaining) throw timeoutError();
  await abortableDelay(delay, signal);
}

function parseRetryAfter(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : undefined;
}

function combineAbort(
  caller: AbortSignal,
  timeoutMs: number | undefined,
): {
  readonly signal: AbortSignal;
  readonly timedOut: () => boolean;
  readonly dispose: () => void;
} {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  const abort = () => controller.abort(caller.reason);
  if (caller.aborted) abort();
  else caller.addEventListener("abort", abort, { once: true });
  if (timeoutMs !== undefined) {
    timeout = setTimeout(() => {
      expired = true;
      controller.abort();
    }, timeoutMs);
  }
  return {
    signal: controller.signal,
    timedOut: () => expired,
    dispose: () => {
      caller.removeEventListener("abort", abort);
      if (timeout) clearTimeout(timeout);
    },
  };
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener("abort", aborted, { once: true });
    function done(): void {
      signal.removeEventListener("abort", aborted);
      resolve();
    }
    function aborted(): void {
      clearTimeout(timer);
      reject(abortReason(signal));
    }
  });
}

function normalizeFetchError(error: unknown): TransportExecutionError {
  if (error instanceof TransportExecutionError) return error;
  return new TransportExecutionError("network", "Network request failed", true, { cause: error });
}

function timeoutError(cause?: unknown): TransportExecutionError {
  return new TransportExecutionError("timeout", "Request deadline exceeded", true, { cause });
}

function protocolError(message: string, status?: number, cause?: unknown): TransportExecutionError {
  return new TransportExecutionError("protocol", message, false, {
    ...(status !== undefined ? { status } : {}),
    ...(cause !== undefined ? { cause } : {}),
  });
}

function abortReason(signal: AbortSignal): unknown {
  if (signal.reason instanceof Error) return signal.reason;
  return new DOMException("The operation was aborted", "AbortError");
}

function mergeHeaders(
  ...sources: readonly (Readonly<Record<string, string>> | undefined)[]
): Readonly<Record<string, string>> {
  const headers = new Map<string, { readonly name: string; readonly value: string }>();
  for (const source of sources)
    for (const [name, value] of Object.entries(source ?? {}))
      headers.set(name.toLowerCase(), { name, value });
  return Object.fromEntries([...headers.values()].map(({ name, value }) => [name, value]));
}

function assertMultipartHeader(
  body: PreparedBody,
  headers: Readonly<Record<string, string>> | undefined,
): void {
  if (body.encoding !== "multipart") return;
  if (Object.keys(headers ?? {}).some((name) => name.toLowerCase() === "content-type"))
    throw protocolError("Do not set Content-Type for multipart requests; Fetch adds the boundary");
}

function normalizeHeaders(headers: Headers): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries([...headers.entries()].map(([name, value]) => [name.toLowerCase(), value])),
  );
}

function header(
  headers: Readonly<Record<string, string>> | undefined,
  name: string,
): string | undefined {
  const expected = name.toLowerCase();
  return Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === expected)?.[1];
}

function remainingMs(deadline: number | undefined): number | undefined {
  return deadline === undefined ? undefined : Math.max(0, deadline - Date.now());
}

function validateNonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be non-negative`);
  return value;
}

function validateNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be an integer`);
  return validateNonNegative(value, name);
}

function validateRange(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum)
    throw new RangeError(`${name} must be between ${minimum} and ${maximum}`);
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMultipartObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return isRecord(value) && !isBlob(value) && !isBinaryPart(value);
}

function isBlob(value: unknown): value is Blob & { readonly name?: string } {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function isBodyInit(value: unknown): value is BodyInit {
  return (
    typeof value === "string" ||
    isBlob(value) ||
    isFormData(value) ||
    value instanceof URLSearchParams ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (typeof ReadableStream !== "undefined" && value instanceof ReadableStream)
  );
}

async function* readableStream(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncIterable<Uint8Array> {
  const reader = stream.getReader();
  const abort = () => void reader.cancel(signal.reason).catch(() => undefined);
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      yield result.value;
    }
  } finally {
    signal.removeEventListener("abort", abort);
    try {
      await reader.cancel();
    } catch {
      // The response may already be closed or aborted.
    }
    reader.releaseLock();
  }
}

function emptyBytes(): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]: () => ({
      next: async () => ({ done: true, value: undefined }),
    }),
  };
}
