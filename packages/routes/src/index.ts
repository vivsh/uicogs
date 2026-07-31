/** Framework-neutral route definitions and access-aware navigation resolution. */

export interface RouteLocation {
  readonly path: string;
  readonly params: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly query: Readonly<Record<string, unknown>>;
}

export interface RouteAccess {
  readonly authenticated: boolean;
  readonly permissions: ReadonlySet<string>;
}

export type RouteAuth =
  | { readonly all: readonly string[]; readonly any?: never }
  | { readonly any: readonly string[]; readonly all?: never };

export type RouteLabel = string | ((context: RouteLocation) => string);

export type RouteIcon<TIcon> = TIcon | ((context: RouteLocation) => TIcon | undefined);

export interface RouteEntry<
  TComponent = unknown,
  TMeta extends object = Readonly<Record<never, never>>,
> {
  readonly path: string;
  readonly component: TComponent;
  readonly auth?: RouteAuth;
  readonly meta?: TMeta;
}

export interface NavigationRouteLink<TIcon = unknown> {
  readonly route: string;
  readonly label?: RouteLabel;
  readonly icon?: RouteIcon<TIcon>;
}

export interface NavigationGroup<TIcon = unknown> {
  readonly id: string;
  readonly label: RouteLabel;
  readonly icon?: RouteIcon<TIcon>;
  readonly children: readonly NavigationItem<TIcon>[];
}

export type NavigationItem<TIcon = unknown> = NavigationRouteLink<TIcon> | NavigationGroup<TIcon>;

export type NavigationPlacements<TIcon = unknown> = Readonly<
  Record<string, readonly NavigationItem<TIcon>[]>
>;

export interface RouteRegistryOptions<
  TComponent = unknown,
  TIcon = unknown,
  TMeta extends object = Readonly<Record<never, never>>,
> {
  readonly routes?: readonly RouteEntry<TComponent, TMeta>[];
  readonly navigation?: NavigationPlacements<TIcon>;
  readonly breadcrumbsFrom?: string;
}

export interface ResolvedRouteLink<TIcon = unknown> {
  readonly kind: "route";
  readonly route: RouteEntry<unknown, object>;
  readonly to?: string;
  readonly label: string;
  readonly icon?: TIcon;
  readonly current: boolean;
}

export interface ResolvedNavigationGroup<TIcon = unknown> {
  readonly kind: "group";
  readonly id: string;
  readonly label: string;
  readonly icon?: TIcon;
  readonly children: readonly ResolvedNavigationNode<TIcon>[];
}

export type ResolvedNavigationNode<TIcon = unknown> =
  ResolvedRouteLink<TIcon> | ResolvedNavigationGroup<TIcon>;

export interface Breadcrumb<TIcon = unknown> {
  readonly label: string;
  readonly icon?: TIcon;
  readonly to?: string;
  readonly current: boolean;
}

/** Validates immutable route declarations and resolves access-aware navigation. */
export class RouteRegistry<TComponent = unknown, TIcon = unknown, TMeta extends object = object> {
  readonly entries: readonly RouteEntry<TComponent, TMeta>[];
  readonly navigation: NavigationPlacements<TIcon>;
  readonly breadcrumbsFrom?: string;
  private readonly byPath: ReadonlyMap<string, RouteEntry<TComponent, TMeta>>;

  constructor(options: RouteRegistryOptions<TComponent, TIcon, TMeta> = {}) {
    this.entries = Object.freeze([...(options.routes ?? [])]);
    this.navigation = freezePlacements(options.navigation ?? {});
    this.breadcrumbsFrom = options.breadcrumbsFrom;
    this.byPath = validateEntries(this.entries);
    validateNavigation(this.navigation, this.byPath, this.breadcrumbsFrom);
    Object.freeze(this);
  }

  entry(path: string): RouteEntry<TComponent, TMeta> | undefined {
    return this.byPath.get(path);
  }

  /** Returns the declared entry whose static or parameterized path matches a location. */
  match(path: string): RouteEntry<TComponent, TMeta> | undefined {
    return this.entries.find((entry) => matchesPath(entry.path, path));
  }

  hasPermission(path: string, access: RouteAccess): boolean {
    const entry = this.byPath.get(path);
    return entry ? canAccess(entry, access) : false;
  }

  navigationTree(
    placement: string,
    access: RouteAccess,
    location: RouteLocation,
  ): readonly ResolvedNavigationNode<TIcon>[] {
    return resolveNavigation(this.navigation[placement] ?? [], this.byPath, access, location);
  }

  breadcrumbs(access: RouteAccess, location: RouteLocation): readonly Breadcrumb<TIcon>[] {
    if (!this.breadcrumbsFrom) return [];
    const trail = findTrail(
      this.navigation[this.breadcrumbsFrom] ?? [],
      location.path,
      this.byPath,
      access,
      location,
    );
    return trail.map((node, index) => {
      const current = index === trail.length - 1 && node.kind === "route";
      return Object.freeze({
        label: node.label,
        ...(node.icon === undefined ? {} : { icon: node.icon }),
        ...(node.kind === "route" && node.to && !current ? { to: node.to } : {}),
        current,
      });
    });
  }
}

/** Creates an immutable registry without importing any UI or router APIs. */
export function createRouteRegistry<
  TComponent = unknown,
  TIcon = unknown,
  TMeta extends object = Readonly<Record<never, never>>,
>(
  options: RouteRegistryOptions<TComponent, TIcon, TMeta> = {},
): RouteRegistry<TComponent, TIcon, TMeta> {
  return new RouteRegistry(options);
}

/** Evaluates a guest or authenticated route rule against effective permissions. */
export function canAccess(
  entry: Pick<RouteEntry<unknown, object>, "auth">,
  access: RouteAccess,
): boolean {
  if (!entry.auth) return !access.authenticated;
  if (!access.authenticated) return false;
  if ("all" in entry.auth)
    return (entry.auth.all ?? []).every((permission) => access.permissions.has(permission));
  return (entry.auth.any ?? []).some((permission) => access.permissions.has(permission));
}

function validateEntries<TComponent, TMeta extends object>(
  entries: readonly RouteEntry<TComponent, TMeta>[],
): ReadonlyMap<string, RouteEntry<TComponent, TMeta>> {
  const byPath = new Map<string, RouteEntry<TComponent, TMeta>>();
  for (const entry of entries) {
    if (!entry.path.startsWith("/")) throw new Error(`Route path must be absolute: ${entry.path}`);
    if (byPath.has(entry.path))
      throw new Error(`Route path is declared more than once: ${entry.path}`);
    validateAuth(entry.auth, entry.path);
    byPath.set(entry.path, Object.freeze({ ...entry }));
  }
  return byPath;
}

function validateAuth(auth: RouteAuth | undefined, path: string): void {
  if (!auth) return;
  const hasAll = "all" in auth;
  const values = hasAll ? auth.all : auth.any;
  if (!Array.isArray(values))
    throw new Error(`Route auth must use all or any permissions: ${path}`);
}

function validateNavigation<TComponent, TIcon, TMeta extends object>(
  placements: NavigationPlacements<TIcon>,
  entries: ReadonlyMap<string, RouteEntry<TComponent, TMeta>>,
  breadcrumbsFrom: string | undefined,
): void {
  for (const [placement, items] of Object.entries(placements)) {
    const seenGroups = new Set<string>();
    const seenRoutes = new Set<string>();
    validateItems(items, entries, seenGroups, seenRoutes, placement);
    if (placement === breadcrumbsFrom)
      for (const route of seenRoutes)
        if (countRoute(items, route) > 1)
          throw new Error(`Breadcrumb route appears more than once: ${route}`);
  }
  if (breadcrumbsFrom && !placements[breadcrumbsFrom])
    throw new Error(`Breadcrumb placement is not declared: ${breadcrumbsFrom}`);
}

function validateItems<TComponent, TIcon, TMeta extends object>(
  items: readonly NavigationItem<TIcon>[],
  entries: ReadonlyMap<string, RouteEntry<TComponent, TMeta>>,
  groups: Set<string>,
  routes: Set<string>,
  placement: string,
): void {
  for (const item of items) {
    if ("route" in item) {
      if (!entries.has(item.route))
        throw new Error(`Navigation route is not declared: ${item.route} (${placement})`);
      routes.add(item.route);
      continue;
    }
    if (groups.has(item.id))
      throw new Error(`Navigation group is declared more than once: ${item.id}`);
    groups.add(item.id);
    validateItems(item.children, entries, groups, routes, placement);
  }
}

function countRoute<TIcon>(items: readonly NavigationItem<TIcon>[], route: string): number {
  return items.reduce(
    (count, item) =>
      count + ("route" in item ? Number(item.route === route) : countRoute(item.children, route)),
    0,
  );
}

function resolveNavigation<TComponent, TIcon, TMeta extends object>(
  items: readonly NavigationItem<TIcon>[],
  entries: ReadonlyMap<string, RouteEntry<TComponent, TMeta>>,
  access: RouteAccess,
  location: RouteLocation,
): readonly ResolvedNavigationNode<TIcon>[] {
  return Object.freeze(
    items.flatMap((item): readonly ResolvedNavigationNode<TIcon>[] => {
      if ("route" in item) {
        const entry = entries.get(item.route);
        if (!entry || !canAccess(entry, access)) return [];
        const current = matchesPath(entry.path, location.path);
        return [
          Object.freeze({
            kind: "route" as const,
            route: entry as RouteEntry<unknown, object>,
            ...(entry.path.includes(":") ? {} : { to: entry.path }),
            label: resolveLabel(item.label, entry.path, location),
            ...(resolveIcon(item.icon, location) === undefined
              ? {}
              : { icon: resolveIcon(item.icon, location) }),
            current,
          }),
        ];
      }
      const children = resolveNavigation(item.children, entries, access, location);
      if (!children.length) return [];
      const icon = resolveIcon(item.icon, location);
      return [
        Object.freeze({
          kind: "group" as const,
          id: item.id,
          label: resolveLabel(item.label, item.id, location),
          ...(icon === undefined ? {} : { icon }),
          children,
        }),
      ];
    }),
  );
}

function findTrail<TComponent, TIcon, TMeta extends object>(
  items: readonly NavigationItem<TIcon>[],
  path: string,
  entries: ReadonlyMap<string, RouteEntry<TComponent, TMeta>>,
  access: RouteAccess,
  location: RouteLocation,
): readonly ResolvedNavigationNode<TIcon>[] {
  for (const node of resolveNavigation(items, entries, access, location)) {
    if (node.kind === "route" && matchesPath(node.route.path, path)) return [node];
    if (node.kind === "group") {
      const child = findTrailNode(node.children, path);
      if (child.length) return [node, ...child];
    }
  }
  return [];
}

function findTrailNode<TIcon>(
  nodes: readonly ResolvedNavigationNode<TIcon>[],
  path: string,
): readonly ResolvedNavigationNode<TIcon>[] {
  for (const node of nodes) {
    if (node.kind === "route" && matchesPath(node.route.path, path)) return [node];
    if (node.kind === "group") {
      const child = findTrailNode(node.children, path);
      if (child.length) return [node, ...child];
    }
  }
  return [];
}

function matchesPath(pattern: string, path: string): boolean {
  const expected = pattern.split("/").filter(Boolean);
  const actual = path.split("/").filter(Boolean);
  return (
    expected.length === actual.length &&
    expected.every((part, index) => part.startsWith(":") || part === actual[index])
  );
}

function resolveLabel(
  label: RouteLabel | undefined,
  fallback: string,
  location: RouteLocation,
): string {
  return typeof label === "function" ? label(location) : (label ?? fallback);
}

function resolveIcon<TIcon>(
  icon: RouteIcon<TIcon> | undefined,
  location: RouteLocation,
): TIcon | undefined {
  return typeof icon === "function"
    ? (icon as (context: RouteLocation) => TIcon | undefined)(location)
    : icon;
}

function freezePlacements<TIcon>(
  placements: NavigationPlacements<TIcon>,
): NavigationPlacements<TIcon> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(placements).map(([name, items]) => [name, freezeItems(items)]),
    ),
  ) as NavigationPlacements<TIcon>;
}

function freezeItems<TIcon>(
  items: readonly NavigationItem<TIcon>[],
): readonly NavigationItem<TIcon>[] {
  return Object.freeze(
    items.map((item) =>
      Object.freeze(
        "route" in item ? { ...item } : { ...item, children: freezeItems(item.children) },
      ),
    ),
  );
}
