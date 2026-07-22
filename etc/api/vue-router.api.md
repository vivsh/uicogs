# @uicogs/vue-router API

Declaration SHA-256: `a3a422ca99cc31ecec3b1fab5f3909fd64456a497dc1f41199afe0b2424fcf90`

```ts
// index.d.ts
import { ComputedRef } from 'vue';

interface RouteLocationLike {
    readonly name?: unknown;
    readonly params: Readonly<Record<string, unknown>>;
    readonly query: Readonly<Record<string, unknown>>;
}
interface RouterLike {
    push(location: Readonly<Record<string, unknown>>): Promise<unknown> | unknown;
    replace(location: Readonly<Record<string, unknown>>): Promise<unknown> | unknown;
    back?(): void;
}
interface ResourceRouteState<TKey extends string | number> {
    readonly mode: "list" | "detail" | "create" | "action";
    readonly key?: TKey;
    readonly action?: string;
    readonly query: Readonly<Record<string, unknown>>;
}
interface ResourceRouteOptions<TKey extends string | number> {
    readonly router: RouterLike;
    readonly route: RouteLocationLike;
    readonly keyParam?: string;
    readonly actionParam?: string;
    readonly createValue?: string | number;
    readonly parseKey?: (value: unknown) => TKey;
    readonly preserveParams?: readonly string[];
}
declare function useUcResourceRoute<TKey extends string | number = number>(options: ResourceRouteOptions<TKey>): Readonly<{
    state: ComputedRef<ResourceRouteState<TKey>>;
    openList: (replace?: boolean) => unknown;
    openCreate: () => unknown;
    openDetail: (key: TKey) => unknown;
    openAction: (key: TKey, action: string) => unknown;
    setQuery(query: Readonly<Record<string, unknown>>, replace?: boolean): unknown;
    back(): void;
}>;

export { type ResourceRouteOptions, type ResourceRouteState, type RouteLocationLike, type RouterLike, useUcResourceRoute };
```
