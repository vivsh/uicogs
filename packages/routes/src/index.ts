/** Framework-neutral route definitions and access-aware navigation resolution. */

export interface RouteLocation {
  readonly path: string;
  /** The canonical declared pattern supplied by a router, when available. */
  readonly pattern?: string;
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

export type RouteRedirect = string | { readonly name: string };

export interface RouteBase<TMeta extends object = Readonly<Record<never, never>>> {
  readonly path: string;
  readonly auth?: RouteAuth;
  readonly meta?: TMeta;
}

export interface ComponentRouteEntry<
  TComponent = unknown,
  TMeta extends object = Readonly<Record<never, never>>,
> extends RouteBase<TMeta> {
  readonly component: TComponent;
  readonly name?: string;
  readonly redirect?: never;
}

export interface RedirectRouteEntry<
  TMeta extends object = Readonly<Record<never, never>>,
> extends RouteBase<TMeta> {
  readonly redirect: RouteRedirect;
  readonly name?: string;
  readonly component?: never;
}

export type RouteEntry<
  TComponent = unknown,
  TMeta extends object = Readonly<Record<never, never>>,
> = ComponentRouteEntry<TComponent, TMeta> | RedirectRouteEntry<TMeta>;

export interface RouteGroup<
  TComponent = unknown,
  TMeta extends object = Readonly<Record<never, never>>,
> extends RouteBase<TMeta> {
  readonly component?: TComponent;
  readonly children: readonly RouteNode<TComponent, TMeta>[];
  readonly redirect?: never;
}

export type RouteNode<TComponent = unknown, TMeta extends object = Readonly<Record<never, never>>> =
  RouteEntry<TComponent, TMeta> | RouteGroup<TComponent, TMeta>;

interface ResolvedRouteBase<TMeta extends object> {
  readonly path: string;
  readonly name?: string;
  readonly auth?: RouteAuth;
  readonly meta?: TMeta;
  readonly accessRules: readonly RouteAuth[];
}

export type ResolvedRouteEntry<TComponent = unknown, TMeta extends object = object> =
  | (ResolvedRouteBase<TMeta> & {
      readonly component: TComponent;
      readonly redirect?: never;
    })
  | (ResolvedRouteBase<TMeta> & {
      readonly redirect: string;
      readonly component?: never;
    });

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
  readonly routes?: readonly RouteNode<TComponent, TMeta>[];
  readonly navigation?: NavigationPlacements<TIcon>;
  readonly breadcrumbsFrom?: string;
}

export interface ResolvedRouteLink<TIcon = unknown> {
  readonly kind: "route";
  readonly route: ResolvedRouteEntry<unknown, object>;
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

interface NormalizedRoutes<TComponent, TMeta extends object> {
  readonly tree: readonly RouteNode<TComponent, TMeta>[];
  readonly entries: readonly ResolvedRouteEntry<TComponent, TMeta>[];
  readonly byPath: ReadonlyMap<string, ResolvedRouteEntry<TComponent, TMeta>>;
  readonly byName: ReadonlyMap<string, ResolvedRouteEntry<TComponent, TMeta>>;
  readonly matchers: ReadonlyMap<ResolvedRouteEntry<TComponent, TMeta>, RegExp>;
}

interface PendingRoute<TComponent, TMeta extends object> {
  readonly path: string;
  readonly name?: string;
  readonly auth?: RouteAuth;
  readonly meta?: TMeta;
  readonly component?: TComponent;
  readonly redirect?: RouteRedirect;
  readonly accessRules: readonly RouteAuth[];
  readonly matcher: RegExp;
}

/** Validates immutable route declarations and resolves access-aware navigation. */
export class RouteRegistry<TComponent = unknown, TIcon = unknown, TMeta extends object = object> {
  readonly tree: readonly RouteNode<TComponent, TMeta>[];
  readonly entries: readonly ResolvedRouteEntry<TComponent, TMeta>[];
  readonly navigation: NavigationPlacements<TIcon>;
  readonly breadcrumbsFrom?: string;
  private readonly byPath: ReadonlyMap<string, ResolvedRouteEntry<TComponent, TMeta>>;
  private readonly byName: ReadonlyMap<string, ResolvedRouteEntry<TComponent, TMeta>>;
  private readonly matchers: ReadonlyMap<ResolvedRouteEntry<TComponent, TMeta>, RegExp>;

  constructor(options: RouteRegistryOptions<TComponent, TIcon, TMeta> = {}) {
    const normalized = normalizeRoutes(options.routes ?? []);
    this.tree = normalized.tree;
    this.entries = normalized.entries;
    this.byPath = normalized.byPath;
    this.byName = normalized.byName;
    this.matchers = normalized.matchers;
    this.navigation = freezePlacements(options.navigation ?? {});
    this.breadcrumbsFrom = options.breadcrumbsFrom;
    validateNavigation(this.navigation, this.byPath, this.breadcrumbsFrom);
    Object.freeze(this);
  }

  /** Returns a leaf by its canonical declared path. */
  entry(path: string): ResolvedRouteEntry<TComponent, TMeta> | undefined {
    return this.byPath.get(safeCanonicalPath(path));
  }

  /** Returns a leaf by its unique route name. */
  named(name: string): ResolvedRouteEntry<TComponent, TMeta> | undefined {
    return this.byName.get(name);
  }

  /** Returns the first declared leaf whose portable path pattern matches a concrete path. */
  match(path: string): ResolvedRouteEntry<TComponent, TMeta> | undefined {
    const concrete = pathOnly(path);
    return this.entries.find((entry) => this.matchers.get(entry)?.test(concrete));
  }

  /** Resolves a router location, preferring its declared pattern over concrete matching. */
  resolve(location: RouteLocation): ResolvedRouteEntry<TComponent, TMeta> | undefined {
    if (location.pattern) {
      const exact = this.entry(location.pattern);
      if (exact) return exact;
    }
    return this.match(location.path);
  }

  /** Evaluates the effective inherited rule chain for a declared leaf. */
  hasPermission(path: string, access: RouteAccess): boolean {
    const entry = this.entry(path);
    return entry ? canAccess(entry, access) : false;
  }

  /** Resolves one navigation placement for the current access and route location. */
  navigationTree(
    placement: string,
    access: RouteAccess,
    location: RouteLocation,
  ): readonly ResolvedNavigationNode<TIcon>[] {
    return resolveNavigation(this.navigation[placement] ?? [], this, access, location);
  }

  /** Resolves the active breadcrumb trail from the configured navigation placement. */
  breadcrumbs(access: RouteAccess, location: RouteLocation): readonly Breadcrumb<TIcon>[] {
    if (!this.breadcrumbsFrom) return [];
    const trail = findTrail(this.navigation[this.breadcrumbsFrom] ?? [], this, access, location);
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

/** Evaluates a resolved route or standalone rule against effective permissions. */
export function canAccess(
  entry: Pick<RouteEntry<unknown, object>, "auth"> & {
    readonly accessRules?: readonly RouteAuth[];
  },
  access: RouteAccess,
): boolean {
  const rules = entry.accessRules ?? (entry.auth ? [entry.auth] : []);
  if (!rules.length) return !access.authenticated;
  if (!access.authenticated) return false;
  return rules.every((rule) => canAccessRule(rule, access.permissions));
}

function canAccessRule(rule: RouteAuth, permissions: ReadonlySet<string>): boolean {
  if ("all" in rule) return (rule.all ?? []).every((permission) => permissions.has(permission));
  return (rule.any ?? []).some((permission) => permissions.has(permission));
}

function normalizeRoutes<TComponent, TMeta extends object>(
  routes: readonly RouteNode<TComponent, TMeta>[],
): NormalizedRoutes<TComponent, TMeta> {
  const tree = freezeRouteNodes(routes);
  const pending: PendingRoute<TComponent, TMeta>[] = [];
  const pendingByPath = new Map<string, PendingRoute<TComponent, TMeta>>();
  const pendingByName = new Map<string, PendingRoute<TComponent, TMeta>>();
  collectRoutes(tree, undefined, [], undefined, pending, pendingByPath, pendingByName);

  const resolvedByPending = new Map<
    PendingRoute<TComponent, TMeta>,
    ResolvedRouteEntry<TComponent, TMeta>
  >();
  const resolving = new Set<PendingRoute<TComponent, TMeta>>();

  const resolvePending = (
    route: PendingRoute<TComponent, TMeta>,
  ): ResolvedRouteEntry<TComponent, TMeta> => {
    const existing = resolvedByPending.get(route);
    if (existing) return existing;
    if (resolving.has(route)) throw new Error(`Route redirect cycle includes: ${route.path}`);
    resolving.add(route);
    let resolved: ResolvedRouteEntry<TComponent, TMeta>;
    if (route.redirect !== undefined) {
      const target = redirectTarget(route.redirect, pendingByPath, pendingByName, route.path);
      const finalTarget = resolvePending(target);
      resolved = Object.freeze({
        path: route.path,
        ...(route.name === undefined ? {} : { name: route.name }),
        ...(route.auth === undefined ? {} : { auth: route.auth }),
        ...(route.meta === undefined ? {} : { meta: route.meta }),
        redirect: finalTarget.redirect ?? finalTarget.path,
        accessRules: finalTarget.accessRules,
      });
    } else {
      resolved = Object.freeze({
        path: route.path,
        ...(route.name === undefined ? {} : { name: route.name }),
        ...(route.auth === undefined ? {} : { auth: route.auth }),
        ...(route.meta === undefined ? {} : { meta: route.meta }),
        component: route.component as TComponent,
        accessRules: route.accessRules,
      });
    }
    resolving.delete(route);
    resolvedByPending.set(route, resolved);
    return resolved;
  };

  const entries = Object.freeze(pending.map(resolvePending));
  const byPath = new Map(entries.map((entry) => [entry.path, entry] as const));
  const byName = new Map(
    entries.flatMap((entry) => (entry.name ? ([[entry.name, entry]] as const) : [])),
  );
  const matchers = new Map(pending.map((route) => [resolvePending(route), route.matcher] as const));
  return { tree, entries, byPath, byName, matchers };
}

function collectRoutes<TComponent, TMeta extends object>(
  nodes: readonly RouteNode<TComponent, TMeta>[],
  parentPath: string | undefined,
  inheritedRules: readonly RouteAuth[],
  inheritedMeta: TMeta | undefined,
  pending: PendingRoute<TComponent, TMeta>[],
  byPath: Map<string, PendingRoute<TComponent, TMeta>>,
  byName: Map<string, PendingRoute<TComponent, TMeta>>,
): void {
  for (const node of nodes) {
    validateSourcePath(node.path, parentPath === undefined);
    const path = resolveRoutePath(parentPath, node.path);
    validateAuth(node.auth, path);
    const rules = node.auth ? Object.freeze([...inheritedRules, node.auth]) : inheritedRules;
    const meta = mergeMeta(inheritedMeta, node.meta);
    if (isRouteGroup(node)) {
      if (node.redirect !== undefined)
        throw new Error(`Route group cannot declare a redirect: ${path}`);
      if (!node.children.length) throw new Error(`Route group must declare children: ${path}`);
      collectRoutes(node.children, path, rules, meta, pending, byPath, byName);
      continue;
    }
    validateLeaf(node, path);
    if (byPath.has(path)) throw new Error(`Route path is declared more than once: ${path}`);
    if (node.name && byName.has(node.name))
      throw new Error(`Route name is declared more than once: ${node.name}`);
    const route: PendingRoute<TComponent, TMeta> = {
      path,
      ...(node.name === undefined ? {} : { name: node.name }),
      ...(node.auth === undefined ? {} : { auth: node.auth }),
      ...(meta === undefined ? {} : { meta }),
      ...(node.component === undefined ? {} : { component: node.component }),
      ...(node.redirect === undefined ? {} : { redirect: node.redirect }),
      accessRules: Object.freeze([...rules]),
      matcher: compileRoutePattern(path),
    };
    pending.push(route);
    byPath.set(path, route);
    if (node.name) byName.set(node.name, route);
  }
}

function redirectTarget<TComponent, TMeta extends object>(
  redirect: RouteRedirect,
  byPath: ReadonlyMap<string, PendingRoute<TComponent, TMeta>>,
  byName: ReadonlyMap<string, PendingRoute<TComponent, TMeta>>,
  source: string,
): PendingRoute<TComponent, TMeta> {
  const target =
    typeof redirect === "string"
      ? byPath.get(canonicalRoutePath(redirect))
      : byName.get(redirect.name);
  if (!target) {
    const description = typeof redirect === "string" ? redirect : `name ${redirect.name}`;
    throw new Error(`Route redirect target is not declared: ${description} (${source})`);
  }
  return target;
}

function validateLeaf<TComponent, TMeta extends object>(
  node: RouteEntry<TComponent, TMeta>,
  path: string,
): void {
  const hasComponent = node.component !== undefined;
  const hasRedirect = node.redirect !== undefined;
  if (hasComponent === hasRedirect)
    throw new Error(`Route leaf must declare exactly one of component or redirect: ${path}`);
  if (node.name !== undefined && !node.name.length)
    throw new Error(`Route name must not be empty: ${path}`);
  if (hasRedirect && typeof node.redirect !== "string") {
    if (!node.redirect || typeof node.redirect.name !== "string" || !node.redirect.name.length)
      throw new Error(`Named route redirect must declare a name: ${path}`);
  }
}

function validateAuth(auth: RouteAuth | undefined, path: string): void {
  if (!auth) return;
  const hasAll = "all" in auth && Array.isArray(auth.all);
  const hasAny = "any" in auth && Array.isArray(auth.any);
  if (hasAll === hasAny) throw new Error(`Route auth must use exactly one of all or any: ${path}`);
}

function isRouteGroup<TComponent, TMeta extends object>(
  node: RouteNode<TComponent, TMeta>,
): node is RouteGroup<TComponent, TMeta> {
  return "children" in node;
}

function freezeRouteNodes<TComponent, TMeta extends object>(
  nodes: readonly RouteNode<TComponent, TMeta>[],
): readonly RouteNode<TComponent, TMeta>[] {
  return Object.freeze(
    nodes.map((node) => {
      const auth = freezeAuth(node.auth);
      const meta = node.meta ? Object.freeze({ ...node.meta }) : undefined;
      if (isRouteGroup(node)) {
        return Object.freeze({
          ...node,
          ...(auth === undefined ? {} : { auth }),
          ...(meta === undefined ? {} : { meta }),
          children: freezeRouteNodes(node.children),
        });
      }
      if (node.redirect !== undefined) {
        const redirect =
          typeof node.redirect === "object" ? Object.freeze({ ...node.redirect }) : node.redirect;
        return Object.freeze({
          ...node,
          ...(auth === undefined ? {} : { auth }),
          ...(meta === undefined ? {} : { meta }),
          redirect,
        });
      }
      return Object.freeze({
        ...node,
        ...(auth === undefined ? {} : { auth }),
        ...(meta === undefined ? {} : { meta }),
        component: node.component,
      });
    }),
  );
}

function freezeAuth(auth: RouteAuth | undefined): RouteAuth | undefined {
  if (!auth) return undefined;
  return "all" in auth
    ? Object.freeze({ all: Object.freeze([...(auth.all ?? [])]) })
    : Object.freeze({ any: Object.freeze([...(auth.any ?? [])]) });
}

function mergeMeta<TMeta extends object>(parent: TMeta | undefined, child: TMeta | undefined) {
  if (!parent && !child) return undefined;
  return Object.freeze({ ...(parent ?? {}), ...(child ?? {}) }) as TMeta;
}

function validateSourcePath(path: string, root: boolean): void {
  if (typeof path !== "string" || hasQueryMarker(path) || path.includes("#"))
    throw new Error(`Route path must not contain a query or fragment: ${String(path)}`);
  if (root && !path.startsWith("/")) throw new Error(`Root route path must be absolute: ${path}`);
  if (path.includes("//")) throw new Error(`Route path must not contain empty segments: ${path}`);
}

/** Resolves a root or child declaration to one canonical absolute route pattern. */
export function resolveRoutePath(parentPath: string | undefined, path: string): string {
  if (path.startsWith("/")) return canonicalRoutePath(path);
  if (parentPath === undefined) throw new Error(`Root route path must be absolute: ${path}`);
  const parent = canonicalRoutePath(parentPath);
  return canonicalRoutePath(path ? `${parent === "/" ? "" : parent}/${path}` : parent);
}

function canonicalRoutePath(path: string): string {
  if (!path.startsWith("/")) throw new Error(`Route path must be absolute: ${path}`);
  if (hasQueryMarker(path) || path.includes("#"))
    throw new Error(`Route path must not contain a query or fragment: ${path}`);
  if (path.includes("//")) throw new Error(`Route path must not contain empty segments: ${path}`);
  const canonical = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return canonical || "/";
}

function hasQueryMarker(path: string): boolean {
  return path.split("/").some((segment) => {
    const first = segment.indexOf("?");
    return first >= 0 && !(segment.startsWith(":") && first === segment.length - 1);
  });
}

function safeCanonicalPath(path: string): string {
  try {
    return canonicalRoutePath(path);
  } catch {
    return path;
  }
}

function pathOnly(path: string): string {
  const end = [path.indexOf("?"), path.indexOf("#")]
    .filter((index) => index >= 0)
    .reduce((smallest, index) => Math.min(smallest, index), path.length);
  const value = path.slice(0, end);
  return value.length > 1 ? value.replace(/\/+$/, "") : value;
}

function compileRoutePattern(path: string): RegExp {
  if (path === "/") return /^\/?$/;
  const segments = path.slice(1).split("/");
  let expression = "^";
  for (const segment of segments) expression += compileSegment(segment, path);
  try {
    return new RegExp(`${expression}/?$`);
  } catch {
    throw new Error(`Route path contains an invalid parameter pattern: ${path}`);
  }
}

function compileSegment(segment: string, path: string): string {
  if (!segment.startsWith(":")) return `/${escapeRegExp(segment)}`;
  const match = /^:([A-Za-z_][A-Za-z0-9_]*)(?:\((.*)\))?([?*+]?)$/.exec(segment);
  if (!match) throw new Error(`Route path contains a malformed parameter: ${path}`);
  const custom = match[2];
  const modifier = match[3] ?? "";
  if (custom === "") throw new Error(`Route path contains an empty parameter pattern: ${path}`);
  const pattern = custom ?? "[^/]+";
  try {
    new RegExp(`^(?:${pattern})$`);
  } catch {
    throw new Error(`Route path contains an invalid parameter pattern: ${path}`);
  }
  if (modifier === "?") return `(?:/(?:${pattern}))?`;
  if (modifier === "*") return `(?:/(?:${pattern})(?:/(?:${pattern}))*)?`;
  if (modifier === "+") return `/(?:${pattern})(?:/(?:${pattern}))*`;
  return `/(?:${pattern})`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateNavigation<TComponent, TIcon, TMeta extends object>(
  placements: NavigationPlacements<TIcon>,
  entries: ReadonlyMap<string, ResolvedRouteEntry<TComponent, TMeta>>,
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
  entries: ReadonlyMap<string, ResolvedRouteEntry<TComponent, TMeta>>,
  groups: Set<string>,
  routes: Set<string>,
  placement: string,
): void {
  for (const item of items) {
    if ("route" in item) {
      const route = safeCanonicalPath(item.route);
      if (!entries.has(route))
        throw new Error(`Navigation route is not declared: ${item.route} (${placement})`);
      routes.add(route);
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
      count +
      ("route" in item
        ? Number(safeCanonicalPath(item.route) === route)
        : countRoute(item.children, route)),
    0,
  );
}

function resolveNavigation<TComponent, TIcon, TMeta extends object>(
  items: readonly NavigationItem<TIcon>[],
  registry: RouteRegistry<TComponent, TIcon, TMeta>,
  access: RouteAccess,
  location: RouteLocation,
): readonly ResolvedNavigationNode<TIcon>[] {
  return Object.freeze(
    items.flatMap((item): readonly ResolvedNavigationNode<TIcon>[] => {
      if ("route" in item) {
        const entry = registry.entry(item.route);
        if (!entry || !canAccess(entry, access)) return [];
        const current = isCurrent(registry, entry, location);
        const icon = resolveIcon(item.icon, location);
        return [
          Object.freeze({
            kind: "route" as const,
            route: entry as ResolvedRouteEntry<unknown, object>,
            ...(entry.path.includes(":") ? {} : { to: entry.path }),
            label: resolveLabel(item.label, entry.path, location),
            ...(icon === undefined ? {} : { icon }),
            current,
          }),
        ];
      }
      const children = resolveNavigation(item.children, registry, access, location);
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

function isCurrent<TComponent, TIcon, TMeta extends object>(
  registry: RouteRegistry<TComponent, TIcon, TMeta>,
  entry: ResolvedRouteEntry<TComponent, TMeta>,
  location: RouteLocation,
): boolean {
  if (location.pattern) return registry.entry(location.pattern)?.path === entry.path;
  return registry.match(location.path)?.path === entry.path;
}

function findTrail<TComponent, TIcon, TMeta extends object>(
  items: readonly NavigationItem<TIcon>[],
  registry: RouteRegistry<TComponent, TIcon, TMeta>,
  access: RouteAccess,
  location: RouteLocation,
): readonly ResolvedNavigationNode<TIcon>[] {
  return findTrailNode(resolveNavigation(items, registry, access, location), registry, location);
}

function findTrailNode<TComponent, TIcon, TMeta extends object>(
  nodes: readonly ResolvedNavigationNode<TIcon>[],
  registry: RouteRegistry<TComponent, TIcon, TMeta>,
  location: RouteLocation,
): readonly ResolvedNavigationNode<TIcon>[] {
  for (const node of nodes) {
    if (node.kind === "route" && isCurrent(registry, node.route, location)) return [node];
    if (node.kind === "group") {
      const child = findTrailNode(node.children, registry, location);
      if (child.length) return [node, ...child];
    }
  }
  return [];
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
