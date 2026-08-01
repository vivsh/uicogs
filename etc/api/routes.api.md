# @uicogs/routes API

Declaration SHA-256: `4e23d05d83f58b11f9e1d0662856e5176ad02b1f4449c3317a4f19387451188f`

```ts
// index.d.ts
/** Framework-neutral route definitions and access-aware navigation resolution. */
interface RouteLocation {
    readonly path: string;
    /** The canonical declared pattern supplied by a router, when available. */
    readonly pattern?: string;
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
type RouteRedirect = string | {
    readonly name: string;
};
interface RouteBase<TMeta extends object = Readonly<Record<never, never>>> {
    readonly path: string;
    readonly auth?: RouteAuth;
    readonly meta?: TMeta;
}
interface ComponentRouteEntry<TComponent = unknown, TMeta extends object = Readonly<Record<never, never>>> extends RouteBase<TMeta> {
    readonly component: TComponent;
    readonly name?: string;
    readonly redirect?: never;
}
interface RedirectRouteEntry<TMeta extends object = Readonly<Record<never, never>>> extends RouteBase<TMeta> {
    readonly redirect: RouteRedirect;
    readonly name?: string;
    readonly component?: never;
}
type RouteEntry<TComponent = unknown, TMeta extends object = Readonly<Record<never, never>>> = ComponentRouteEntry<TComponent, TMeta> | RedirectRouteEntry<TMeta>;
interface RouteGroup<TComponent = unknown, TMeta extends object = Readonly<Record<never, never>>> extends RouteBase<TMeta> {
    readonly component?: TComponent;
    readonly children: readonly RouteNode<TComponent, TMeta>[];
    readonly redirect?: never;
}
type RouteNode<TComponent = unknown, TMeta extends object = Readonly<Record<never, never>>> = RouteEntry<TComponent, TMeta> | RouteGroup<TComponent, TMeta>;
interface ResolvedRouteBase<TMeta extends object> {
    readonly path: string;
    readonly name?: string;
    readonly auth?: RouteAuth;
    readonly meta?: TMeta;
    readonly accessRules: readonly RouteAuth[];
}
type ResolvedRouteEntry<TComponent = unknown, TMeta extends object = object> = (ResolvedRouteBase<TMeta> & {
    readonly component: TComponent;
    readonly redirect?: never;
}) | (ResolvedRouteBase<TMeta> & {
    readonly redirect: string;
    readonly component?: never;
});
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
    readonly routes?: readonly RouteNode<TComponent, TMeta>[];
    readonly navigation?: NavigationPlacements<TIcon>;
    readonly breadcrumbsFrom?: string;
}
interface ResolvedRouteLink<TIcon = unknown> {
    readonly kind: "route";
    readonly route: ResolvedRouteEntry<unknown, object>;
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
    readonly tree: readonly RouteNode<TComponent, TMeta>[];
    readonly entries: readonly ResolvedRouteEntry<TComponent, TMeta>[];
    readonly navigation: NavigationPlacements<TIcon>;
    readonly breadcrumbsFrom?: string;
    private readonly byPath;
    private readonly byName;
    private readonly matchers;
    constructor(options?: RouteRegistryOptions<TComponent, TIcon, TMeta>);
    /** Returns a leaf by its canonical declared path. */
    entry(path: string): ResolvedRouteEntry<TComponent, TMeta> | undefined;
    /** Returns a leaf by its unique route name. */
    named(name: string): ResolvedRouteEntry<TComponent, TMeta> | undefined;
    /** Returns the first declared leaf whose portable path pattern matches a concrete path. */
    match(path: string): ResolvedRouteEntry<TComponent, TMeta> | undefined;
    /** Resolves a router location, preferring its declared pattern over concrete matching. */
    resolve(location: RouteLocation): ResolvedRouteEntry<TComponent, TMeta> | undefined;
    /** Evaluates the effective inherited rule chain for a declared leaf. */
    hasPermission(path: string, access: RouteAccess): boolean;
    /** Resolves one navigation placement for the current access and route location. */
    navigationTree(placement: string, access: RouteAccess, location: RouteLocation): readonly ResolvedNavigationNode<TIcon>[];
    /** Resolves the active breadcrumb trail from the configured navigation placement. */
    breadcrumbs(access: RouteAccess, location: RouteLocation): readonly Breadcrumb<TIcon>[];
}
/** Creates an immutable registry without importing any UI or router APIs. */
declare function createRouteRegistry<TComponent = unknown, TIcon = unknown, TMeta extends object = Readonly<Record<never, never>>>(options?: RouteRegistryOptions<TComponent, TIcon, TMeta>): RouteRegistry<TComponent, TIcon, TMeta>;
/** Evaluates a resolved route or standalone rule against effective permissions. */
declare function canAccess(entry: Pick<RouteEntry<unknown, object>, "auth"> & {
    readonly accessRules?: readonly RouteAuth[];
}, access: RouteAccess): boolean;
/** Resolves a root or child declaration to one canonical absolute route pattern. */
declare function resolveRoutePath(parentPath: string | undefined, path: string): string;

export { type Breadcrumb, type ComponentRouteEntry, type NavigationGroup, type NavigationItem, type NavigationPlacements, type NavigationRouteLink, type RedirectRouteEntry, type ResolvedNavigationGroup, type ResolvedNavigationNode, type ResolvedRouteEntry, type ResolvedRouteLink, type RouteAccess, type RouteAuth, type RouteBase, type RouteEntry, type RouteGroup, type RouteIcon, type RouteLabel, type RouteLocation, type RouteNode, type RouteRedirect, RouteRegistry, type RouteRegistryOptions, canAccess, createRouteRegistry, resolveRoutePath };
```
