import type { NormalizedFailure } from "./issues.js";

export type BodyEncoding = "auto" | "json" | "multipart" | "raw";

export interface MultipartPart {
  readonly name: string;
  readonly value: unknown;
}

export interface MultipartAdapter {
  readonly name: string;
  path(path: readonly (string | number)[]): string;
  parts?(
    part: MultipartPart & { readonly path: readonly (string | number)[] },
  ): readonly MultipartPart[];
  removal?(path: readonly (string | number)[]): readonly MultipartPart[];
}

export interface UploadProgress {
  readonly loaded: number;
  readonly total?: number;
  readonly fraction?: number;
  readonly lengthComputable: boolean;
}

export interface TransportRequest {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly url: string;
  readonly query?: Readonly<Record<string, unknown>>;
  readonly body?: unknown;
  readonly encoding?: BodyEncoding;
  readonly multipart?: MultipartAdapter;
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
  readonly onUploadProgress?: (progress: UploadProgress) => void;
  readonly authentication?: "required" | "optional" | "none" | "refresh" | "establish" | "logout";
  readonly credentials?: RequestCredentials;
}

export interface TransportResponse<T = unknown> {
  readonly status: number;
  readonly data: T;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface TransportCapabilities {
  readonly uploadProgress?: "determinate" | "indeterminate";
}

export interface StreamResponse {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body: AsyncIterable<Uint8Array>;
}

export interface Transport {
  readonly capabilities?: TransportCapabilities;
  request(request: TransportRequest): Promise<TransportResponse<unknown>>;
  openStream?(request: TransportRequest): Promise<StreamResponse>;
}

export interface TransportMiddleware {
  request(
    request: TransportRequest,
    next: (request: TransportRequest) => Promise<TransportResponse<unknown>>,
  ): Promise<TransportResponse<unknown>>;
  openStream?(
    request: TransportRequest,
    next: (request: TransportRequest) => Promise<StreamResponse>,
  ): Promise<StreamResponse>;
}

export interface HttpRetryOptions {
  readonly maximumRetries?: number;
  readonly statuses?: readonly number[];
  readonly initialDelayMs?: number;
  readonly maximumDelayMs?: number;
  readonly jitter?: number;
  readonly respectRetryAfter?: boolean;
}

export interface DefaultHttpOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
  readonly retry?: false | HttpRetryOptions;
  readonly multipart?: MultipartAdapter;
}

export class TransportExecutionError extends Error {
  constructor(
    readonly code: "network" | "timeout" | "protocol",
    message: string,
    readonly retryable: boolean,
    options: { readonly status?: number; readonly cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "TransportExecutionError";
    if (options.status !== undefined)
      Object.defineProperty(this, "status", { value: options.status, enumerable: true });
  }

  declare readonly status?: number;
}

export interface ErrorAdapter {
  adapt(response: TransportResponse<unknown>): NormalizedFailure | undefined;
}

export interface PageInfo {
  readonly index?: number;
  readonly size?: number;
  readonly count?: number;
  readonly totalPages?: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
  readonly nextToken?: unknown;
  readonly previousToken?: unknown;
}

export interface PaginationResult {
  readonly items: readonly unknown[];
  readonly pageInfo?: PageInfo;
  readonly nextPage?: unknown;
  readonly previousPage?: unknown;
}

export interface PaginationAdapter {
  readonly name: string;
  request(page: Readonly<PageState>): Readonly<Record<string, unknown>>;
  response(response: TransportResponse<unknown>, page?: Readonly<PageState>): PaginationResult;
}

export interface PageState {
  readonly index: number;
  readonly size: number;
  readonly token?: unknown;
}

export const pagination = {
  page(
    options: {
      readonly pageParam?: string;
      readonly sizeParam?: string;
      readonly resultsKey?: string;
      readonly countKey?: string;
      readonly nextKey?: string;
      readonly previousKey?: string;
    } = {},
  ): PaginationAdapter {
    const pageParam = options.pageParam ?? "page";
    const sizeParam = options.sizeParam ?? "page_size";
    const resultsKey = options.resultsKey ?? "results";
    const countKey = options.countKey ?? "count";
    const nextKey = options.nextKey ?? "next";
    const previousKey = options.previousKey ?? "previous";
    return Object.freeze({
      name: "page",
      request: (page: PageState) => ({
        [pageParam]: page.index,
        [sizeParam]: page.size,
      }),
      response: (
        response: TransportResponse<unknown>,
        page: PageState = { index: 1, size: 25 },
      ) => {
        if (Array.isArray(response.data)) {
          return {
            items: response.data,
            pageInfo: {
              index: page.index,
              size: page.size,
              count: response.data.length,
              totalPages: 1,
              hasNext: false,
              hasPrevious: page.index > 1,
            },
          };
        }
        const data = asRecord(response.data);
        const items = Array.isArray(data[resultsKey]) ? data[resultsKey] : [];
        const count = typeof data[countKey] === "number" ? data[countKey] : undefined;
        const next = data[nextKey];
        const previous = data[previousKey];
        return {
          items,
          pageInfo: Object.freeze({
            index: page.index,
            size: page.size,
            ...(count !== undefined
              ? {
                  count,
                  totalPages: page.size > 0 ? Math.ceil(count / page.size) : 1,
                }
              : {}),
            hasNext: next !== undefined && next !== null && next !== false,
            hasPrevious: previous !== undefined && previous !== null && previous !== false,
            ...(next !== undefined ? { nextToken: next } : {}),
            ...(previous !== undefined ? { previousToken: previous } : {}),
          }),
          nextPage: next,
          previousPage: previous,
        };
      },
    });
  },
  offset(
    options: {
      readonly offsetParam?: string;
      readonly limitParam?: string;
    } = {},
  ): PaginationAdapter {
    const offsetParam = options.offsetParam ?? "offset";
    const limitParam = options.limitParam ?? "limit";
    const pageAdapter = pagination.page();
    return Object.freeze({
      name: "offset",
      request: (page: PageState) => ({
        [offsetParam]: Math.max(0, page.index - 1) * page.size,
        [limitParam]: page.size,
      }),
      response: pageAdapter.response,
    });
  },
  cursor(
    options: {
      readonly cursorParam?: string;
      readonly sizeParam?: string;
    } = {},
  ): PaginationAdapter {
    const cursorParam = options.cursorParam ?? "cursor";
    const sizeParam = options.sizeParam ?? "page_size";
    const pageAdapter = pagination.page();
    return Object.freeze({
      name: "cursor",
      request: (page: PageState) => ({
        ...(page.token !== undefined ? { [cursorParam]: page.token } : {}),
        [sizeParam]: page.size,
      }),
      response: pageAdapter.response,
    });
  },
  client(): PaginationAdapter {
    return Object.freeze({
      name: "client",
      request: () => ({}),
      response: (
        response: TransportResponse<unknown>,
        page: PageState = { index: 1, size: 25 },
      ) => {
        const source = Array.isArray(response.data) ? response.data : [];
        const start = Math.max(0, page.index - 1) * page.size;
        return {
          items: source.slice(start, start + page.size),
          pageInfo: Object.freeze({
            index: page.index,
            size: page.size,
            count: source.length,
            totalPages: page.size > 0 ? Math.ceil(source.length / page.size) : 1,
            hasNext: start + page.size < source.length,
            hasPrevious: page.index > 1,
          }),
        };
      },
    });
  },
  custom(adapter: PaginationAdapter): PaginationAdapter {
    return Object.freeze(adapter);
  },
};

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}
