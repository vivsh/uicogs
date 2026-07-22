# @uicogs/http API

Declaration SHA-256: `ade1e76f7eae00a8e355bde9f81e5a362774dcd84801c3401f8578e1e3ae6165`

```ts
// index.d.ts
import { LiveRetryOptions, LiveVersion, LiveMutation, ErrorAdapter, PaginationAdapter, LiveFrame, LiveSource } from '@uicogs/core';
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
declare function drfErrors(): ErrorAdapter;
declare function problemDetailsErrors(): ErrorAdapter;
declare function jsonApiErrors(): ErrorAdapter;
declare function graphqlErrors(): ErrorAdapter;

export { type SseOptions, drfErrors, graphqlErrors, jsonApiErrors, pagination, parseEventStream, problemDetailsErrors, sse };
```
