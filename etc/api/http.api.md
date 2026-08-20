# @uicogs/http API

Declaration SHA-256: `5082ac66d1ed3516d294d1b2d0e5cee46aab7d019371e656ad9a5fbe5fa679c8`

```ts
// index.d.ts
import { LiveRetryOptions, LiveVersion, LiveEffectResult, LiveOpenOptions, ErrorAdapter, PaginationAdapter, LiveFrame, LiveSource, ResponseAdapter } from '@uicogs/core';
export { MultipartEncodingError, PreparedBody, multipart, multipartAdapter, prepareBody, withQuery } from '@uicogs/core';

interface SseOptions<TContext> {
    readonly url: string;
    readonly enabled?: (options: {
        readonly context: TContext;
        readonly scope: string;
    }) => boolean;
    readonly retry?: LiveRetryOptions;
    readonly version?: (options: {
        readonly event: {
            readonly type: string;
            readonly data: string;
            readonly id?: string;
        };
        readonly payload: unknown;
    }) => LiveVersion | undefined;
    readonly map?: (options: {
        readonly event: string;
        readonly payload: unknown;
        readonly source: {
            readonly type: string;
            readonly data: string;
            readonly id?: string;
        };
    }) => LiveEffectResult | Promise<LiveEffectResult>;
    readonly onUnhandled?: (event: {
        readonly type: string;
        readonly data: string;
        readonly id?: string;
    }) => void;
}
declare function sse<TContext = unknown>(options: SseOptions<TContext>): LiveSource<TContext>;
interface WebSocketMessage {
    readonly data: string;
}
interface LiveWebSocket {
    readonly readyState?: number;
    close(code?: number, reason?: string): void;
    addEventListener?(type: "open" | "message" | "error" | "close", listener: (event: unknown) => void): void;
    removeEventListener?(type: "open" | "message" | "error" | "close", listener: (event: unknown) => void): void;
    onopen?: (() => void) | null;
    onmessage?: ((event: WebSocketMessage) => void) | null;
    onerror?: (() => void) | null;
    onclose?: (() => void) | null;
}
interface WebSocketOptions<TContext> extends Omit<SseOptions<TContext>, "url"> {
    readonly url: string;
    readonly createSocket?: (url: string) => LiveWebSocket;
}
/** Creates an injected-or-browser WebSocket live source without exposing browser APIs to core. */
declare function websocket<TContext = unknown>(options: WebSocketOptions<TContext>): LiveSource<TContext>;
interface PollOptions<TContext> extends Omit<SseOptions<TContext>, "url"> {
    readonly intervalMs: number;
    request(options: {
        readonly context: TContext;
        readonly scope: string;
        readonly transport: LiveOpenOptions<TContext>["transport"];
        readonly baseUrl: string;
        readonly signal: AbortSignal;
    }): Promise<LiveEventResult | readonly LiveEventResult[] | undefined>;
}
interface LiveEventResult {
    readonly type: string;
    readonly data: string;
    readonly id?: string;
}
/** Polls one non-overlapping request per live connection; controller retry schedules the next poll. */
declare function poll<TContext = unknown>(options: PollOptions<TContext>): LiveSource<TContext>;
declare function parseEventStream(body: AsyncIterable<Uint8Array>): AsyncIterable<LiveFrame>;
declare const pagination: {
    drf: () => PaginationAdapter;
    cursor: (options?: {
        readonly cursorParam?: string;
    }) => PaginationAdapter;
    linkHeader: () => PaginationAdapter;
    page(options?: {
        readonly pageParam?: string;
        readonly sizeParam?: string;
        readonly resultsKey?: string;
        readonly countKey?: string;
        readonly nextKey?: string;
        readonly previousKey?: string;
    }): PaginationAdapter;
    offset(options?: {
        readonly offsetParam?: string;
        readonly limitParam?: string;
    }): PaginationAdapter;
    client(): PaginationAdapter;
    custom(adapter: PaginationAdapter): PaginationAdapter;
};
/** Options for JSON:API pagination metadata and request parameters. */
interface JsonApiResponseOptions {
    readonly countKey?: string;
    readonly pageParam?: string;
    readonly sizeParam?: string;
}
/** Options for locating and paging a GraphQL connection response. */
interface GraphqlConnectionResponseOptions {
    readonly connection: string | readonly (string | number)[];
    readonly cursorParam?: string;
    readonly sizeParam?: string;
}
/** Common response profiles for documented HTTP API contracts. */
declare const responseAdapters: {
    custom: (adapter: ResponseAdapter) => ResponseAdapter;
    /** Handles Vyuh direct responses, Page envelopes, and ErrorReport failures. */
    vyuh(): ResponseAdapter;
    /** Handles Django REST Framework page envelopes and error dictionaries. */
    drf(): ResponseAdapter;
    /** Handles Laravel paginator envelopes and validation failures. */
    laravel(): ResponseAdapter;
    /** Handles Spring Data Page envelopes and Problem Details failures. */
    springData(): ResponseAdapter;
    /** Handles JSON:API primary data, pagination links, and errors. */
    jsonApi(options?: JsonApiResponseOptions): ResponseAdapter;
    /** Handles an explicitly located GraphQL connection and GraphQL errors. */
    graphqlConnection(options: GraphqlConnectionResponseOptions): ResponseAdapter;
};
declare function drfErrors(): ErrorAdapter;
/** Normalizes Vyuh ErrorReport responses, including nested field issues. */
declare function vyuhErrors(): ErrorAdapter;
/** Normalizes Laravel message and field-error responses. */
declare function laravelErrors(): ErrorAdapter;
declare function problemDetailsErrors(): ErrorAdapter;
declare function jsonApiErrors(): ErrorAdapter;
declare function graphqlErrors(): ErrorAdapter;

export { type GraphqlConnectionResponseOptions, type JsonApiResponseOptions, type LiveEventResult, type LiveWebSocket, type PollOptions, type SseOptions, type WebSocketMessage, type WebSocketOptions, drfErrors, graphqlErrors, jsonApiErrors, laravelErrors, pagination, parseEventStream, poll, problemDetailsErrors, responseAdapters, sse, vyuhErrors, websocket };
```
