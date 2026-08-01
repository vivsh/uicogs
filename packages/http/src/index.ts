import {
  LiveSourceError,
  pagination as corePagination,
  RequestError,
  responseAdapters as coreResponseAdapters,
  type ErrorAdapter,
  type LiveFrame,
  type LiveMutation,
  type LiveOpenOptions,
  type LiveRetryOptions,
  type LiveSource,
  type LiveVersion,
  type NormalizedFailure,
  type PaginationAdapter,
  type PageState,
  type ResponseAdapter,
  type ResponseDecodeContext,
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

/** Options for JSON:API pagination metadata and request parameters. */
export interface JsonApiResponseOptions {
  readonly countKey?: string;
  readonly pageParam?: string;
  readonly sizeParam?: string;
}

/** Options for locating and paging a GraphQL connection response. */
export interface GraphqlConnectionResponseOptions {
  readonly connection: string | readonly (string | number)[];
  readonly cursorParam?: string;
  readonly sizeParam?: string;
}

/** Common response profiles for documented HTTP API contracts. */
export const responseAdapters = {
  custom: coreResponseAdapters.custom,

  /** Handles Vyuh direct responses, Page envelopes, and ErrorReport failures. */
  vyuh(): ResponseAdapter {
    return profile("vyuh", vyuhPagination(), vyuhErrors());
  },

  /** Handles Django REST Framework page envelopes and error dictionaries. */
  drf(): ResponseAdapter {
    return profile("drf", pagination.drf(), drfErrors());
  },

  /** Handles Laravel paginator envelopes and validation failures. */
  laravel(): ResponseAdapter {
    return profile("laravel", laravelPagination(), laravelErrors());
  },

  /** Handles Spring Data Page envelopes and Problem Details failures. */
  springData(): ResponseAdapter {
    return profile("spring-data", springDataPagination(), problemDetailsErrors());
  },

  /** Handles JSON:API primary data, pagination links, and errors. */
  jsonApi(options: JsonApiResponseOptions = {}): ResponseAdapter {
    return Object.freeze({
      name: "json-api",
      pagination: jsonApiPagination(options),
      errorAdapter: jsonApiErrors(),
      decode: decodeJsonApi,
    });
  },

  /** Handles an explicitly located GraphQL connection and GraphQL errors. */
  graphqlConnection(options: GraphqlConnectionResponseOptions): ResponseAdapter {
    const path = normalizePath(options.connection);
    return Object.freeze({
      name: "graphql-connection",
      pagination: graphqlConnectionPagination(options),
      errorAdapter: graphqlErrors(),
      decode(response: TransportResponse<unknown>, context: ResponseDecodeContext) {
        const failure = graphqlErrors().adapt(response);
        if (failure) throw new RequestError(failure);
        return context.kind === "collection" ? valueAtPath(response.data, path) : response.data;
      },
    });
  },
};

function profile(
  name: string,
  paginationAdapter: PaginationAdapter,
  errorAdapter: ErrorAdapter,
): ResponseAdapter {
  return Object.freeze({ name, pagination: paginationAdapter, errorAdapter });
}

function vyuhPagination(): PaginationAdapter {
  return Object.freeze({
    name: "vyuh",
    request: (page: PageState) => ({ page: page.index, per_page: page.size }),
    response(response: TransportResponse<unknown>, page: PageState = { index: 1, size: 25 }) {
      if (Array.isArray(response.data)) return boundedPage(response.data, page);
      const data = asRecord(response.data);
      const items = Array.isArray(data.items) ? data.items : [];
      const index = positiveNumber(data.page) ?? page.index;
      const size = positiveNumber(data.per_page) ?? page.size;
      const count = nonNegativeNumber(data.total);
      const totalPages = nonNegativeNumber(data.total_pages);
      return {
        items,
        pageInfo: Object.freeze({
          index,
          size,
          ...(count !== undefined ? { count } : {}),
          ...(totalPages !== undefined ? { totalPages } : {}),
          hasNext: totalPages !== undefined ? index < totalPages : false,
          hasPrevious: index > 1,
        }),
      };
    },
  });
}

function laravelPagination(): PaginationAdapter {
  return Object.freeze({
    name: "laravel",
    request: (page: PageState) => ({ page: page.index, per_page: page.size }),
    response(response: TransportResponse<unknown>, page: PageState = { index: 1, size: 25 }) {
      const data = asRecord(response.data);
      const items = Array.isArray(data.data) ? data.data : [];
      const index = positiveNumber(data.current_page) ?? page.index;
      const size = positiveNumber(data.per_page) ?? page.size;
      const count = nonNegativeNumber(data.total);
      const totalPages = nonNegativeNumber(data.last_page);
      const next = nullableString(data.next_page_url);
      const previous = nullableString(data.prev_page_url);
      return {
        items,
        pageInfo: Object.freeze({
          index,
          size,
          ...(count !== undefined ? { count } : {}),
          ...(totalPages !== undefined ? { totalPages } : {}),
          hasNext: next !== undefined || (totalPages !== undefined && index < totalPages),
          hasPrevious: previous !== undefined || index > 1,
          ...(next ? { nextToken: next } : {}),
          ...(previous ? { previousToken: previous } : {}),
        }),
        ...(next ? { nextPage: next } : {}),
        ...(previous ? { previousPage: previous } : {}),
      };
    },
  });
}

function springDataPagination(): PaginationAdapter {
  return Object.freeze({
    name: "spring-data",
    request: (page: PageState) => ({ page: Math.max(0, page.index - 1), size: page.size }),
    response(response: TransportResponse<unknown>, page: PageState = { index: 1, size: 25 }) {
      const data = asRecord(response.data);
      const items = Array.isArray(data.content) ? data.content : [];
      const number = nonNegativeNumber(data.number);
      const index = number === undefined ? page.index : number + 1;
      const size = positiveNumber(data.size) ?? page.size;
      const count = nonNegativeNumber(data.totalElements);
      const totalPages = nonNegativeNumber(data.totalPages);
      return {
        items,
        pageInfo: Object.freeze({
          index,
          size,
          ...(count !== undefined ? { count } : {}),
          ...(totalPages !== undefined ? { totalPages } : {}),
          hasNext: totalPages !== undefined ? index < totalPages : false,
          hasPrevious: index > 1,
        }),
      };
    },
  });
}

function jsonApiPagination(options: JsonApiResponseOptions): PaginationAdapter {
  const pageParam = options.pageParam ?? "page[number]";
  const sizeParam = options.sizeParam ?? "page[size]";
  return Object.freeze({
    name: "json-api",
    request(page: PageState) {
      return typeof page.token === "string"
        ? queryFromUrl(page.token)
        : { [pageParam]: page.index, [sizeParam]: page.size };
    },
    response(response: TransportResponse<unknown>, page: PageState = { index: 1, size: 25 }) {
      const data = asRecord(response.data);
      const links = asRecord(data.links);
      const meta = asRecord(data.meta);
      const next = nullableString(links.next);
      const previous = nullableString(links.prev);
      const count = options.countKey ? nonNegativeNumber(meta[options.countKey]) : undefined;
      return {
        items: Array.isArray(data.data) ? data.data : [],
        pageInfo: Object.freeze({
          index: page.index,
          size: page.size,
          ...(count !== undefined
            ? { count, totalPages: page.size > 0 ? Math.ceil(count / page.size) : 1 }
            : {}),
          hasNext: next !== undefined,
          hasPrevious: previous !== undefined,
          ...(next ? { nextToken: next } : {}),
          ...(previous ? { previousToken: previous } : {}),
        }),
        ...(next ? { nextPage: next } : {}),
        ...(previous ? { previousPage: previous } : {}),
      };
    },
  });
}

function graphqlConnectionPagination(options: GraphqlConnectionResponseOptions): PaginationAdapter {
  const cursorParam = options.cursorParam ?? "after";
  const sizeParam = options.sizeParam ?? "first";
  return Object.freeze({
    name: "graphql-connection",
    request: (page: PageState) => ({
      ...(page.token !== undefined ? { [cursorParam]: page.token } : {}),
      [sizeParam]: page.size,
    }),
    response(response: TransportResponse<unknown>, page: PageState = { index: 1, size: 25 }) {
      const connection = asRecord(response.data);
      const pageInfo = asRecord(connection.pageInfo);
      const next = pageInfo.endCursor;
      const previous = pageInfo.startCursor;
      const count = nonNegativeNumber(connection.totalCount);
      const hasNext = pageInfo.hasNextPage === true;
      const hasPrevious = pageInfo.hasPreviousPage === true;
      return {
        items: Array.isArray(connection.edges)
          ? connection.edges.map((edge) => asRecord(edge).node)
          : [],
        pageInfo: Object.freeze({
          index: page.index,
          size: page.size,
          ...(count !== undefined ? { count } : {}),
          hasNext,
          hasPrevious,
          ...(hasNext && next !== undefined ? { nextToken: next } : {}),
          ...(hasPrevious && previous !== undefined ? { previousToken: previous } : {}),
        }),
        ...(hasNext && next !== undefined ? { nextPage: next } : {}),
        ...(hasPrevious && previous !== undefined ? { previousPage: previous } : {}),
      };
    },
  });
}

function decodeJsonApi(
  response: TransportResponse<unknown>,
  context: ResponseDecodeContext,
): unknown {
  if (!isRecord(response.data) || !("data" in response.data)) return response.data;
  const primary = response.data.data;
  const decoded = Array.isArray(primary)
    ? primary.map(decodeJsonApiResource)
    : primary === null
      ? null
      : decodeJsonApiResource(primary);
  return context.kind === "collection" ? { ...response.data, data: decoded } : decoded;
}

function decodeJsonApiResource(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const attributes = asRecord(value.attributes);
  return Object.freeze({
    ...attributes,
    ...(value.id !== undefined ? { id: value.id } : {}),
    ...(value.type !== undefined ? { type: value.type } : {}),
  });
}

function boundedPage(items: readonly unknown[], page: PageState) {
  return {
    items,
    pageInfo: Object.freeze({
      index: page.index,
      size: page.size,
      count: items.length,
      totalPages: 1,
      hasNext: false,
      hasPrevious: page.index > 1,
    }),
  };
}

export function drfErrors(): ErrorAdapter {
  return { adapt: (response) => mapDictionaryFailure(response) };
}

/** Normalizes Vyuh ErrorReport responses, including nested field issues. */
export function vyuhErrors(): ErrorAdapter {
  return {
    adapt(response) {
      if (!isRecord(response.data)) return undefined;
      const report = response.data;
      if (!("source" in report || "code" in report || "detail" in report || "errors" in report))
        return undefined;
      const issues = collectVyuhIssues(report.errors);
      return failureFor(response, String(report.detail ?? "Request failed"), issues);
    },
  };
}

/** Normalizes Laravel message and field-error responses. */
export function laravelErrors(): ErrorAdapter {
  return {
    adapt(response) {
      if (!isRecord(response.data) || !isRecord(response.data.errors)) return undefined;
      const issues = Object.entries(response.data.errors).flatMap(([name, messages]) =>
        (Array.isArray(messages) ? messages : [messages]).map((message) =>
          serverIssue(fieldPath(name), String(message)),
        ),
      );
      return failureFor(response, String(response.data.message ?? "Request failed"), issues);
    },
  };
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
          jsonApiPointerPath(pointer),
          String(error.detail ?? error.title ?? "Invalid value"),
        );
      });
      return failureFor(response, issues[0]?.message ?? "Request failed", issues);
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
      return failureFor(response, issues[0]?.message ?? "Request failed", issues);
    },
  };
}

function mapDictionaryFailure(response: TransportResponse<unknown>): NormalizedFailure | undefined {
  if (!isRecord(response.data)) return undefined;
  const issues = collectDictionaryIssues(response.data);
  return issues.length
    ? failureFor(response, issues[0]?.message ?? "Request failed", issues)
    : undefined;
}

function collectDictionaryIssues(
  value: unknown,
  path: readonly (string | number)[] = [],
): ValidationIssue[] {
  if (Array.isArray(value)) {
    if (value.every((item) => !isRecord(item) && !Array.isArray(item)))
      return value.map((item) => serverIssue(path, String(item)));
    return value.flatMap((item, index) => collectDictionaryIssues(item, [...path, index]));
  }
  if (!isRecord(value)) return [serverIssue(path, String(value))];
  return Object.entries(value).flatMap(([name, nested]) =>
    collectDictionaryIssues(
      nested,
      name === "non_field_errors" || name === "detail" ? path : [...path, name],
    ),
  );
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

function serverIssue(
  path: readonly (string | number)[],
  message: string,
  code = "server",
): ValidationIssue {
  return { path, message, code, source: "server", severity: "error" };
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

function collectVyuhIssues(
  value: unknown,
  path: readonly (string | number)[] = [],
): ValidationIssue[] {
  if (Array.isArray(value)) return value.flatMap((item) => collectVyuhIssues(item, path));
  if (typeof value === "string") return [serverIssue(path, value)];
  if (!isRecord(value)) return [];
  if (typeof value.message === "string")
    return [serverIssue(path, value.message, String(value.code ?? "server"))];
  return Object.entries(value).flatMap(([name, nested]) =>
    collectVyuhIssues(
      nested,
      name === "non_field_errors" || name === "detail" ? path : [...path, name],
    ),
  );
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

function queryFromUrl(value: string): Readonly<Record<string, unknown>> {
  const query: Record<string, unknown> = {};
  for (const [name, item] of new URL(value, "http://localhost").searchParams) {
    const current = query[name];
    query[name] =
      current === undefined ? item : Array.isArray(current) ? [...current, item] : [current, item];
  }
  return query;
}

function fieldPath(value: string): readonly (string | number)[] {
  return value
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

function jsonApiPointerPath(value: string): readonly (string | number)[] {
  const path = value
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  const attributes = path.indexOf("attributes");
  return fieldPath((attributes >= 0 ? path.slice(attributes + 1) : path.slice(1)).join("."));
}

function normalizePath(value: string | readonly (string | number)[]): readonly (string | number)[] {
  return typeof value === "string" ? value.split(".").filter(Boolean) : value;
}

function valueAtPath(value: unknown, path: readonly (string | number)[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current) && !Array.isArray(current)) return undefined;
    current = current[segment as keyof typeof current];
  }
  return current;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function nullableString(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

function joinUrl(base: string, path: string): string {
  if (!path) return base;
  if (!base) return path;
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : {};
}
