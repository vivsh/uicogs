import { computed, type ComputedRef } from "vue";
import {
  canAccessScopes,
  createNavigation,
  type NavigationDefinition,
  type NavigationGroup,
  type ScopeAccess,
} from "@uicogs/routes";
import {
  useRouter,
  type RouteLocationNormalizedLoaded,
  type RouteLocationRaw,
  type RouteRecordNormalized,
  type RouteRecordRaw,
  type Router,
} from "vue-router";

/** Presentation metadata attached to a standard Vue Router route record. */
export interface UiCogsRouteMeta {
  readonly scopes?: readonly string[];
  readonly navigation?: Readonly<Record<string, UiCogsNavigationLink>>;
}

/** One route link's presentation for a named navigation placement. */
export interface UiCogsNavigationLink {
  readonly parent?: string;
  readonly label?: UiCogsNavigationLabel;
  readonly icon?: UiCogsNavigationIcon;
  readonly order?: number;
}

/** One non-link group declared once for a navigation placement. */
export type UiCogsNavigationGroup = NavigationGroup<UiCogsNavigationLabel, UiCogsNavigationIcon>;

/** Named group declarations used by the Vue binding. */
export type UiCogsNavigationOptions = NavigationDefinition<
  UiCogsNavigationLabel,
  UiCogsNavigationIcon
>;

/** Current Vue Router location supplied to dynamic navigation presentation. */
export interface UiCogsNavigationContext {
  readonly route: RouteLocationNormalizedLoaded;
}

export type UiCogsNavigationLabel = string | ((context: UiCogsNavigationContext) => string);
export type UiCogsNavigationIcon = unknown | ((context: UiCogsNavigationContext) => unknown);

/** A scope-filtered link suitable for rendering by a Vue application. */
export interface UiCogsNavigationRoute {
  readonly kind: "route";
  readonly id: string;
  readonly label: string;
  readonly icon?: unknown;
  readonly to?: RouteLocationRaw;
  readonly current: boolean;
}

/** A scope-filtered non-link group suitable for rendering by a Vue application. */
export interface UiCogsNavigationGroupNode {
  readonly kind: "group";
  readonly id: string;
  readonly label: string;
  readonly icon?: unknown;
  readonly children: readonly UiCogsNavigationNode[];
}

export type UiCogsNavigationNode = UiCogsNavigationRoute | UiCogsNavigationGroupNode;

/** One breadcrumb derived from a named navigation placement. */
export interface UiCogsBreadcrumb {
  readonly label: string;
  readonly icon?: unknown;
  readonly to?: RouteLocationRaw;
  readonly current: boolean;
}

declare module "vue-router" {
  interface RouteMeta {
    readonly uicogs?: UiCogsRouteMeta;
  }
}

interface RouteCandidate {
  readonly record: RouteRecordNormalized;
  readonly scopes: readonly string[];
  readonly authenticationRequired: boolean;
  readonly index: number;
}

interface RouteDeclaration {
  readonly name?: string | symbol;
  readonly path: string;
  readonly ancestors: readonly RouteRecordRaw[];
}

interface NodeEntry {
  readonly node: UiCogsNavigationNode;
  readonly order: number;
  readonly index: number;
}

/** Evaluates the additive scope policy for Vue Router's matched records. */
export function canAccessRoute(
  matched: readonly RouteRecordNormalized[],
  access: ScopeAccess,
): boolean {
  return canAccessScopes(
    matched.map((record) => record.meta.uicogs?.scopes),
    access,
  );
}

/** Creates composition-safe reactive navigation helpers without retaining a router on UiCogs. */
export function useUiCogsNavigation(
  navigation: UiCogsNavigationOptions,
  access: () => ScopeAccess,
  records?: readonly RouteRecordNormalized[],
) {
  const router = useRouter();
  validateNavigation(navigation);
  return Object.freeze({
    navigation: (placement: string): ComputedRef<readonly UiCogsNavigationNode[]> =>
      computed(() => resolveNavigation(router, navigation, placement, access(), records)),
    breadcrumbs: (placement: string): ComputedRef<readonly UiCogsBreadcrumb[]> =>
      computed(() => resolveBreadcrumbs(router, navigation, placement, access(), records)),
  });
}

/** Validates group identity, parent relationships, and group cycles before installation. */
export function validateNavigation(navigation: UiCogsNavigationOptions): void {
  createNavigation(navigation);
}

function resolveNavigation(
  router: Router,
  navigation: UiCogsNavigationOptions,
  placement: string,
  access: ScopeAccess,
  records: readonly RouteRecordNormalized[] | undefined,
): readonly UiCogsNavigationNode[] {
  const groups = navigation[placement]?.groups ?? [];
  const children = new Map<string | undefined, NodeEntry[]>();
  const knownGroups = new Set(groups.map((group) => group.id));
  for (const candidate of routeCandidates(router, records)) {
    const presentation = candidate.record.meta.uicogs?.navigation?.[placement];
    if (!presentation || !canAccessCandidate(candidate, access)) continue;
    if (presentation.parent && !knownGroups.has(presentation.parent))
      throw new Error(`Unknown UiCogs navigation parent: ${presentation.parent}`);
    append(children, presentation.parent, {
      node: routeNode(candidate, presentation, router.currentRoute.value),
      order: presentation.order ?? 0,
      index: candidate.index,
    });
  }
  const byId = new Map(groups.map((group, index) => [group.id, { group, index }]));
  const buildGroup = (id: string): NodeEntry | undefined => {
    const state = byId.get(id);
    if (!state) return undefined;
    const nested = groups
      .filter((group) => group.parent === id)
      .map((group) => buildGroup(group.id))
      .filter((entry): entry is NodeEntry => entry !== undefined);
    const entries = [...(children.get(id) ?? []), ...nested];
    if (!entries.length) return undefined;
    const group = state.group;
    return {
      node: Object.freeze({
        kind: "group" as const,
        id: group.id,
        label: labelOf(group.label, router.currentRoute.value),
        ...(group.icon === undefined
          ? {}
          : { icon: iconOf(group.icon, router.currentRoute.value) }),
        children: Object.freeze(sortEntries(entries).map((entry) => entry.node)),
      }),
      order: group.order ?? 0,
      index: state.index,
    };
  };
  const roots = [
    ...(children.get(undefined) ?? []),
    ...groups
      .filter((group) => group.parent === undefined)
      .map((group) => buildGroup(group.id))
      .filter((entry): entry is NodeEntry => entry !== undefined),
  ];
  return Object.freeze(sortEntries(roots).map((entry) => entry.node));
}

function resolveBreadcrumbs(
  router: Router,
  navigation: UiCogsNavigationOptions,
  placement: string,
  access: ScopeAccess,
  records: readonly RouteRecordNormalized[] | undefined,
): readonly UiCogsBreadcrumb[] {
  const current = router.currentRoute.value;
  const candidate = [...routeCandidates(router, records)]
    .reverse()
    .find(
      (item) =>
        item.record.meta.uicogs?.navigation?.[placement] !== undefined &&
        isCurrent(item.record, current) &&
        canAccessCandidate(item, access),
    );
  if (!candidate) return Object.freeze([]);
  const presentation = candidate.record.meta.uicogs!.navigation![placement]!;
  const groups = new Map((navigation[placement]?.groups ?? []).map((group) => [group.id, group]));
  const link = routeNode(candidate, presentation, current);
  return Object.freeze([
    ...groupTrail(presentation.parent, groups).map((group) =>
      Object.freeze({
        label: labelOf(group.label, current),
        ...(group.icon === undefined ? {} : { icon: iconOf(group.icon, current) }),
        current: false,
      }),
    ),
    Object.freeze({
      label: link.label,
      ...(link.icon === undefined ? {} : { icon: link.icon }),
      ...(link.to === undefined ? {} : { to: link.to }),
      current: true,
    }),
  ]);
}

function routeCandidates(
  router: Router,
  records: readonly RouteRecordNormalized[] | undefined,
): readonly RouteCandidate[] {
  const declarations = routeDeclarations(router.options.routes);
  return (records ?? router.getRoutes()).map((record, index) => {
    const declaration = declarationFor(record, declarations);
    const ancestors = declaration?.ancestors ?? [];
    return Object.freeze({
      record,
      scopes: Object.freeze([
        ...ancestors.flatMap((parent) => parent.meta?.uicogs?.scopes ?? []),
        ...(record.meta.uicogs?.scopes ?? []),
      ]),
      authenticationRequired:
        record.meta.uicogs?.scopes !== undefined ||
        ancestors.some((parent) => parent.meta?.uicogs?.scopes !== undefined),
      index,
    });
  });
}

function routeDeclarations(routes: readonly RouteRecordRaw[]): readonly RouteDeclaration[] {
  const declarations: RouteDeclaration[] = [];
  const visit = (
    entries: readonly RouteRecordRaw[],
    parentPath: string,
    ancestors: readonly RouteRecordRaw[],
  ) => {
    for (const route of entries) {
      const path = joinPath(parentPath, route.path);
      declarations.push(Object.freeze({ name: route.name, path, ancestors }));
      if (route.children) visit(route.children, path, [...ancestors, route]);
    }
  };
  visit(routes, "", []);
  return Object.freeze(declarations);
}

function declarationFor(
  record: RouteRecordNormalized,
  declarations: readonly RouteDeclaration[],
): RouteDeclaration | undefined {
  return declarations.find(
    (declaration) =>
      (record.name !== undefined && declaration.name === record.name) ||
      declaration.path === record.path,
  );
}

function joinPath(parent: string, child: string): string {
  if (child.startsWith("/")) return child;
  if (!parent) return child.startsWith("/") ? child : `/${child}`;
  return `${parent.replace(/\/$/, "")}/${child}`.replace(/\/+/g, "/");
}

function canAccessCandidate(candidate: RouteCandidate, access: ScopeAccess): boolean {
  return canAccessScopes([candidate.authenticationRequired ? candidate.scopes : undefined], access);
}

function append(
  children: Map<string | undefined, NodeEntry[]>,
  parent: string | undefined,
  entry: NodeEntry,
): void {
  const entries = children.get(parent) ?? [];
  entries.push(entry);
  children.set(parent, entries);
}

function routeNode(
  candidate: RouteCandidate,
  presentation: UiCogsNavigationLink,
  current: RouteLocationNormalizedLoaded,
): UiCogsNavigationRoute {
  const name = candidate.record.name;
  const id = typeof name === "string" ? name : candidate.record.path;
  return Object.freeze({
    kind: "route",
    id,
    label: presentation.label ? labelOf(presentation.label, current) : defaultLabel(id),
    ...(presentation.icon === undefined ? {} : { icon: iconOf(presentation.icon, current) }),
    ...(isNavigable(candidate.record.path)
      ? { to: name === undefined ? { path: candidate.record.path } : { name } }
      : {}),
    current: isCurrent(candidate.record, current),
  });
}

function groupTrail(
  parent: string | undefined,
  groups: ReadonlyMap<string, UiCogsNavigationGroup>,
): readonly UiCogsNavigationGroup[] {
  const trail: UiCogsNavigationGroup[] = [];
  let id = parent;
  while (id) {
    const group = groups.get(id);
    if (!group) throw new Error(`Unknown UiCogs navigation parent: ${id}`);
    trail.unshift(group);
    id = group.parent;
  }
  return trail;
}

function sortEntries(entries: readonly NodeEntry[]): NodeEntry[] {
  return [...entries].sort((left, right) => left.order - right.order || left.index - right.index);
}

function labelOf(label: UiCogsNavigationLabel, route: RouteLocationNormalizedLoaded): string {
  return typeof label === "function" ? label({ route }) : label;
}

function iconOf(icon: UiCogsNavigationIcon, route: RouteLocationNormalizedLoaded): unknown {
  return typeof icon === "function" ? icon({ route }) : icon;
}

function defaultLabel(value: string): string {
  return value
    .replace(/^\//, "")
    .replace(/[_/-]+/g, " ")
    .replace(/^./, (part) => part.toUpperCase());
}

function isNavigable(path: string): boolean {
  return !/:[^/]+/.test(path);
}

function isCurrent(record: RouteRecordNormalized, current: RouteLocationNormalizedLoaded): boolean {
  return current.matched.includes(record);
}
