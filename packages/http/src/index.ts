import {
  LiveSourceError,
  pagination as corePagination,
  type ErrorAdapter,
  type LiveFrame,
  type LiveMutation,
  type LiveOpenOptions,
  type LiveRetryOptions,
  type LiveSource,
  type LiveVersion,
  type NormalizedFailure,
  type PaginationAdapter,
  type TransportResponse,
  type ValidationIssue,
} from "@uicogs/core";
import { createParser } from "eventsource-parser";

export {
  MultipartEncodingError,
  multipart,
  multipartAdapter,
  prepareBody,
  withQuery,
  type PreparedBody,
} from "@uicogs/core";

export interface SseOptions<TContext> {
  readonly url: string;
  readonly enabled?: (options: { readonly context: TContext; readonly scope: string }) => boolean;
  readonly retry?: LiveRetryOptions;
  readonly version?: (options: {
    readonly event: { readonly type: string; readonly data: string; readonly id?: string };
    readonly payload: unknown;
  }) => LiveVersion | undefined;
  readonly map?: (options: {
    readonly event: string;
    readonly payload: unknown;
    readonly source: { readonly type: string; readonly data: string; readonly id?: string };
  }) =>
    | LiveMutation
    | readonly LiveMutation[]
    | undefined
    | Promise<LiveMutation | readonly LiveMutation[] | undefined>;
  readonly onUnhandled?: (event: {
    readonly type: string;
    readonly data: string;
    readonly id?: string;
  }) => void;
}

export function sse<TContext = unknown>(options: SseOptions<TContext>): LiveSource<TContext> {
  return Object.freeze({
    ...(options.retry ? { retry: options.retry } : {}),
    ...(options.enabled ? { enabled: options.enabled } : {}),
    ...(options.version ? { version: options.version } : {}),
    ...(options.map ? { map: options.map } : {}),
    ...(options.onUnhandled ? { onUnhandled: options.onUnhandled } : {}),
    async open(connection: LiveOpenOptions<TContext>) {
      if (!connection.transport.openStream)
        throw new LiveSourceError("Configured transport does not support streaming");
      const response = await connection.transport.openStream({
        method: "GET",
        url: joinUrl(connection.baseUrl, options.url),
        headers: {
          Accept: "text/event-stream",
          ...(connection.lastEventId ? { "Last-Event-ID": connection.lastEventId } : {}),
        },
        signal: connection.signal,
      });
      return {
        status: response.status,
        ...(response.headers ? { headers: response.headers } : {}),
        frames: parseEventStream(response.body),
      };
    },
  });
}

export async function* parseEventStream(body: AsyncIterable<Uint8Array>): AsyncIterable<LiveFrame> {
  const decoder = new TextDecoder();
  let pending: LiveFrame[] = [];
  const parser = createParser({
    onEvent(event) {
      pending.push({
        kind: "event",
        event: {
          type: event.event || "message",
          data: event.data,
          ...(event.id !== undefined ? { id: event.id } : {}),
        },
      });
    },
    onRetry(milliseconds) {
      pending.push({ kind: "retry", milliseconds });
    },
  });
  for await (const chunk of body) {
    parser.feed(decoder.decode(chunk, { stream: true }));
    const frames = pending;
    pending = [];
    yield* frames;
  }
  const remaining = decoder.decode();
  if (remaining) parser.feed(remaining);
  yield* pending;
}

export const pagination = {
  ...corePagination,
  drf: (): PaginationAdapter => corePagination.page(),
  cursor: (options: { readonly cursorParam?: string } = {}): PaginationAdapter => ({
    name: "cursor",
    request: (page) => ({
      ...(page.token ? { [options.cursorParam ?? "cursor"]: page.token } : {}),
      page_size: page.size,
    }),
    response: (response) => {
      const data = asRecord(response.data);
      const next = cursorFrom(data.next);
      const previous = cursorFrom(data.previous);
      return {
        items: Array.isArray(data.results) ? data.results : [],
        pageInfo: {
          hasNext: next !== undefined,
          hasPrevious: previous !== undefined,
          ...(next ? { nextToken: next } : {}),
          ...(previous ? { previousToken: previous } : {}),
        },
        nextPage: next,
        previousPage: previous,
      };
    },
  }),
  linkHeader: (): PaginationAdapter => ({
    name: "link-header",
    request: (page) => ({ page: page.index, page_size: page.size }),
    response: (response) => {
      const links = parseLinks(response.headers?.link);
      return {
        items: Array.isArray(response.data) ? response.data : [],
        pageInfo: {
          hasNext: Boolean(links.next),
          hasPrevious: Boolean(links.prev ?? links.previous),
          ...(links.next ? { nextToken: links.next } : {}),
          ...((links.prev ?? links.previous)
            ? { previousToken: links.prev ?? links.previous }
            : {}),
        },
        nextPage: links.next,
        previousPage: links.prev ?? links.previous,
      };
    },
  }),
};

export function drfErrors(): ErrorAdapter {
  return { adapt: (response) => mapDictionaryFailure(response) };
}

export function problemDetailsErrors(): ErrorAdapter {
  return {
    adapt(response) {
      if (!isRecord(response.data) || !("type" in response.data || "title" in response.data))
        return undefined;
      const issues = Array.isArray(response.data.errors)
        ? response.data.errors.flatMap(problemIssue)
        : [];
      return failureFor(
        response,
        String(response.data.detail ?? response.data.title ?? "Request failed"),
        issues,
      );
    },
  };
}

export function jsonApiErrors(): ErrorAdapter {
  return {
    adapt(response) {
      if (!isRecord(response.data) || !Array.isArray(response.data.errors)) return undefined;
      const issues = response.data.errors.map((item) => {
        const error = asRecord(item);
        const pointer = isRecord(error.source) ? String(error.source.pointer ?? "") : "";
        return serverIssue(
          pointer.split("/").filter(Boolean).slice(1),
          String(error.detail ?? error.title ?? "Invalid value"),
        );
      });
      return failureFor(response, "Request failed", issues);
    },
  };
}

export function graphqlErrors(): ErrorAdapter {
  return {
    adapt(response) {
      if (!isRecord(response.data) || !Array.isArray(response.data.errors)) return undefined;
      const issues = response.data.errors.map((item) => {
        const error = asRecord(item);
        return serverIssue(
          Array.isArray(error.path) ? (error.path as (string | number)[]) : [],
          String(error.message ?? "Request failed"),
        );
      });
      return failureFor(response, "Request failed", issues);
    },
  };
}

function mapDictionaryFailure(response: TransportResponse<unknown>): NormalizedFailure | undefined {
  if (!isRecord(response.data)) return undefined;
  const issues: ValidationIssue[] = [];
  for (const [name, messages] of Object.entries(response.data)) {
    const path = name === "non_field_errors" || name === "detail" ? [] : [name];
    for (const message of Array.isArray(messages) ? messages : [messages])
      issues.push(serverIssue(path, String(message)));
  }
  return issues.length
    ? failureFor(response, issues[0]?.message ?? "Request failed", issues)
    : undefined;
}

function failureFor(
  response: TransportResponse<unknown>,
  message: string,
  issues: readonly ValidationIssue[],
): NormalizedFailure {
  const kind =
    response.status === 401
      ? "authentication"
      : response.status === 403
        ? "permission"
        : response.status === 404
          ? "not-found"
          : response.status === 409
            ? "conflict"
            : response.status === 429
              ? "rate-limit"
              : response.status >= 500
                ? "server"
                : issues.length
                  ? "validation"
                  : "unknown";
  return {
    kind,
    status: response.status,
    message,
    issues,
    retryable: response.status === 429 || response.status >= 500,
  };
}

function serverIssue(path: readonly (string | number)[], message: string): ValidationIssue {
  return { path, message, code: "server", source: "server", severity: "error" };
}

function problemIssue(value: unknown): ValidationIssue[] {
  if (!isRecord(value)) return [];
  return [
    serverIssue(
      Array.isArray(value.path) ? (value.path as (string | number)[]) : [],
      String(value.message ?? "Invalid value"),
    ),
  ];
}

function parseLinks(value: string | undefined): Readonly<Record<string, string>> {
  if (!value) return {};
  return Object.fromEntries(
    value.split(",").flatMap((part) => {
      const match = part.match(/<([^>]+)>;\s*rel="?([^";]+)"?/);
      return match?.[1] && match[2] ? [[match[2], match[1]]] : [];
    }),
  );
}

function cursorFrom(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return new URL(value, "http://localhost").searchParams.get("cursor") ?? undefined;
}

function joinUrl(base: string, path: string): string {
  if (!base) return path;
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : {};
}
