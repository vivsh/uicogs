# @uicogs/routes API

Declaration SHA-256: `dddaab7ed955691f02b172a5001c58bb120d8b7f08d6304a7793795218e95e7c`

```ts
// index.d.ts
/** Framework-neutral route definitions and access-aware navigation resolution. */
interface RouteLocation {
    readonly path: string;
    readonly params: Readonly<Record<string, string | readonly string[] | undefined>>;
    readonly query: Readonly<Record<string, unknown>>;
}
interface RouteAccess {
    readonly authenticated: boolean;
    readonly permissions: ReadonlySet<string>;
}
type RouteAuth = {
    readonly all: readonly string[];
    readonly any?: never;
} | {
    readonly any: readonly string[];
    readonly all?: never;
};
type RouteLabel = string | ((context: RouteLocation) => string);
type RouteIcon<TIcon> = TIcon | ((context: RouteLocation) => TIcon | undefined);
interface RouteEntry<TComponent = unknown, TMeta extends object = Readonly<Record<never, never>>> {
    readonly path: string;
    readonly component: TComponent;
    readonly auth?: RouteAuth;
    readonly meta?: TMeta;
}
interface NavigationRouteLink<TIcon = unknown> {
    readonly route: string;
    readonly label?: RouteLabel;
    readonly icon?: RouteIcon<TIcon>;
}
interface NavigationGroup<TIcon = unknown> {
    readonly id: string;
    readonly label: RouteLabel;
    readonly icon?: RouteIcon<TIcon>;
    readonly children: readonly NavigationItem<TIcon>[];
}
type NavigationItem<TIcon = unknown> = NavigationRouteLink<TIcon> | NavigationGroup<TIcon>;
type NavigationPlacements<TIcon = unknown> = Readonly<Record<string, readonly NavigationItem<TIcon>[]>>;
interface RouteRegistryOptions<TComponent = unknown, TIcon = unknown, TMeta extends object = Readonly<Record<never, never>>> {
    readonly routes?: readonly RouteEntry<TComponent, TMeta>[];
    readonly navigation?: NavigationPlacements<TIcon>;
    readonly breadcrumbsFrom?: string;
}
interface ResolvedRouteLink<TIcon = unknown> {
    readonly kind: "route";
    readonly route: RouteEntry<unknown, object>;
    readonly to?: string;
    readonly label: string;
    readonly icon?: TIcon;
    readonly current: boolean;
}
interface ResolvedNavigationGroup<TIcon = unknown> {
    readonly kind: "group";
    readonly id: string;
    readonly label: string;
    readonly icon?: TIcon;
    readonly children: readonly ResolvedNavigationNode<TIcon>[];
}
type ResolvedNavigationNode<TIcon = unknown> = ResolvedRouteLink<TIcon> | ResolvedNavigationGroup<TIcon>;
interface Breadcrumb<TIcon = unknown> {
    readonly label: string;
    readonly icon?: TIcon;
    readonly to?: string;
    readonly current: boolean;
}
/** Validates immutable route declarations and resolves access-aware navigation. */
declare class RouteRegistry<TComponent = unknown, TIcon = unknown, TMeta extends object = object> {
    readonly entries: readonly RouteEntry<TComponent, TMeta>[];
    readonly navigation: NavigationPlacements<TIcon>;
    readonly breadcrumbsFrom?: string;
    private readonly byPath;
    constructor(options?: RouteRegistryOptions<TComponent, TIcon, TMeta>);
    entry(path: string): RouteEntry<TComponent, TMeta> | undefined;
    /** Returns the declared entry whose static or parameterized path matches a location. */
    match(path: string): RouteEntry<TComponent, TMeta> | undefined;
    hasPermission(path: string, access: RouteAccess): boolean;
    navigationTree(placement: string, access: RouteAccess, location: RouteLocation): readonly ResolvedNavigationNode<TIcon>[];
    breadcrumbs(access: RouteAccess, location: RouteLocation): readonly Breadcrumb<TIcon>[];
}
/** Creates an immutable registry without importing any UI or router APIs. */
declare function createRouteRegistry<TComponent = unknown, TIcon = unknown, TMeta extends object = Readonly<Record<never, never>>>(options?: RouteRegistryOptions<TComponent, TIcon, TMeta>): RouteRegistry<TComponent, TIcon, TMeta>;
/** Evaluates a guest or authenticated route rule against effective permissions. */
declare function canAccess(entry: Pick<RouteEntry<unknown, object>, "auth">, access: RouteAccess): boolean;

export { type Breadcrumb, type NavigationGroup, type NavigationItem, type NavigationPlacements, type NavigationRouteLink, type ResolvedNavigationGroup, type ResolvedNavigationNode, type ResolvedRouteLink, type RouteAccess, type RouteAuth, type RouteEntry, type RouteIcon, type RouteLabel, type RouteLocation, RouteRegistry, type RouteRegistryOptions, canAccess, createRouteRegistry };
```
