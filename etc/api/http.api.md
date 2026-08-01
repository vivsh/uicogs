# @uicogs/http API

Declaration SHA-256: `be86da09920503a2d8d5571f58fa5bfe517efc2ab77cf379e1a28e2b536836c2`

```ts
// index.d.ts
import { LiveRetryOptions, LiveVersion, LiveMutation, ErrorAdapter, PaginationAdapter, LiveFrame, ResponseAdapter, LiveSource } from '@uicogs/core';
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
    }) => LiveMutation | readonly LiveMutation[] | undefined | Promise<LiveMutation | readonly LiveMutation[] | undefined>;
    readonly onUnhandled?: (event: {
        readonly type: string;
        readonly data: string;
        readonly id?: string;
    }) => void;
}
declare function sse<TContext = unknown>(options: SseOptions<TContext>): LiveSource<TContext>;
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

export { type GraphqlConnectionResponseOptions, type JsonApiResponseOptions, type SseOptions, drfErrors, graphqlErrors, jsonApiErrors, laravelErrors, pagination, parseEventStream, problemDetailsErrors, responseAdapters, sse, vyuhErrors };
```
