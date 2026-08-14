import { isLoggedIn, type ExternalStore, type RuntimeAuthController } from "@uicogs/core";
import {
  canAccessScopes,
  createNavigation,
  type NavigationDefinition,
  type NavigationGroup,
  type ScopeAccess,
} from "@uicogs/routes";
import {
  createContext,
  createElement,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export * from "@uicogs/core";

const uiCogsContext = createContext<ReactBoundUiCogs<ReactRuntimeSource> | undefined>(undefined);

export function useController<
  TSnapshot extends object,
  TController extends ExternalStore<TSnapshot>,
>(controller: TController): TController {
  useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getSnapshot(),
    () => controller.getSnapshot(),
  );
  return controller;
}

export const useResource = useController;
export const useObject = useController;
export const useCollection = useController;
export const useForm = useController;
export const useAction = useController;
export const useAuth = useController;

/** Current native React Router matches supplied to navigation presentation callbacks. */
export interface UiCogsReactNavigationContext {
  readonly matches: readonly UiCogsReactRouteMatch[];
}

export type UiCogsReactNavigationLabel =
  string | ((context: UiCogsReactNavigationContext) => string);
export type UiCogsReactNavigationIcon =
  unknown | ((context: UiCogsReactNavigationContext) => unknown);

/** One route link's presentation for a named navigation placement. */
export interface UiCogsReactNavigationLink {
  readonly parent?: string;
  readonly label?: UiCogsReactNavigationLabel;
  readonly icon?: UiCogsReactNavigationIcon;
  readonly order?: number;
}

/** One non-link group shared by React and other framework bindings. */
export type UiCogsReactNavigationGroup = NavigationGroup<
  UiCogsReactNavigationLabel,
  UiCogsReactNavigationIcon
>;

/** Named non-link group declarations for React navigation placements. */
export type UiCogsReactNavigationOptions = NavigationDefinition<
  UiCogsReactNavigationLabel,
  UiCogsReactNavigationIcon
>;

/** Scope and link metadata stored in a native React Router route `handle`. */
export interface UiCogsReactRouteMeta {
  readonly scopes?: readonly string[];
  readonly navigation?: Readonly<Record<string, UiCogsReactNavigationLink>>;
}

/** The `handle` shape UiCogs reads from native React Router matches. */
export interface UiCogsReactRouteHandle {
  readonly uicogs?: UiCogsReactRouteMeta;
}

/** The minimal native React Router match surface required for scope checks. */
export interface UiCogsReactRouteMatch {
  readonly id?: string;
  readonly pathname?: string;
  readonly handle?: UiCogsReactRouteHandle;
}

/** Structural native React Router route record used only to read static metadata. */
export interface UiCogsReactRouteDefinition {
  readonly id?: string;
  readonly path?: string;
  readonly index?: boolean;
  readonly handle?: UiCogsReactRouteHandle;
  readonly children?: readonly UiCogsReactRouteDefinition[];
}

/** A scope-filtered route link suitable for rendering by a React application. */
export interface UiCogsReactNavigationRoute {
  readonly kind: "route";
  readonly id: string;
  readonly label: string;
  readonly icon?: unknown;
  readonly to?: string;
  readonly current: boolean;
}

/** A scope-filtered non-link group suitable for rendering by a React application. */
export interface UiCogsReactNavigationGroupNode {
  readonly kind: "group";
  readonly id: string;
  readonly label: string;
  readonly icon?: unknown;
  readonly children: readonly UiCogsReactNavigationNode[];
}

export type UiCogsReactNavigationNode = UiCogsReactNavigationRoute | UiCogsReactNavigationGroupNode;

/** One breadcrumb derived from a named React navigation placement. */
export interface UiCogsReactBreadcrumb {
  readonly label: string;
  readonly icon?: unknown;
  readonly to?: string;
  readonly current: boolean;
}

interface ReactRuntimeSource extends Record<never, never> {
  readonly auth?: RuntimeAuthController;
}

/** Native React Router hooks supplied by an application without a router dependency. */
export interface ReactBindingOptions {
  readonly useMatches?: () => readonly UiCogsReactRouteMatch[];
  readonly routes?: readonly UiCogsReactRouteDefinition[];
  readonly navigation?: UiCogsReactNavigationOptions;
}

export type ReactBoundUiCogs<T extends ReactRuntimeSource> = T & {
  readonly core: T;
  useCanAccessRoute(): boolean;
  useHasScope(scope: string): boolean;
  useHasScopes(scopes: readonly string[]): boolean;
  useNavigation(placement: string): readonly UiCogsReactNavigationNode[];
  useBreadcrumbs(placement: string): readonly UiCogsReactBreadcrumb[];
  readonly Provider: (properties: {
    readonly children?: ReactNode;
  }) => ReturnType<typeof createElement>;
};

/** Binds one common UiCogs runtime to React context. */
export function withReact<T extends ReactRuntimeSource>(
  cogs: T,
  options: ReactBindingOptions = {},
): ReactBoundUiCogs<T> {
  const navigation = createNavigation(options.navigation ?? {});
  const routes = Object.freeze([...(options.routes ?? [])]);
  const bound = Object.create(cogs) as ReactBoundUiCogs<T>;
  const Provider = ({ children }: { readonly children?: ReactNode }) =>
    createElement(uiCogsContext.Provider, { value: bound }, children);
  Object.defineProperties(bound, {
    core: { value: cogs },
    useCanAccessRoute: {
      value: () => {
        if (!options.useMatches)
          throw new Error("withReact() requires useMatches to evaluate the current route");
        const access = useScopeAccess(cogs.auth);
        return canAccessScopes(
          options.useMatches().map((match) => match.handle?.uicogs?.scopes),
          access,
        );
      },
    },
    useHasScope: {
      value: (scope: string) => {
        const access = useScopeAccess(cogs.auth);
        return access.authenticated && access.scopes.has(scope);
      },
    },
    useHasScopes: {
      value: (scopes: readonly string[]) => {
        const access = useScopeAccess(cogs.auth);
        return access.authenticated && scopes.every((scope) => access.scopes.has(scope));
      },
    },
    useNavigation: {
      value: (placement: string) => {
        const access = useScopeAccess(cogs.auth);
        const matches = useMatches(options);
        return resolveNavigation(routes, navigation, placement, access, matches);
      },
    },
    useBreadcrumbs: {
      value: (placement: string) => {
        const access = useScopeAccess(cogs.auth);
        const matches = useMatches(options);
        return resolveBreadcrumbs(routes, navigation, placement, access, matches);
      },
    },
    Provider: { value: Provider },
  });
  return bound;
}

function useMatches(options: ReactBindingOptions): readonly UiCogsReactRouteMatch[] {
  if (!options.useMatches)
    throw new Error("withReact() requires useMatches to evaluate route access or navigation");
  return options.useMatches();
}

function useScopeAccess(auth: RuntimeAuthController | undefined): ScopeAccess {
  useSyncExternalStore(
    (listener) => auth?.subscribe(listener) ?? (() => undefined),
    () => auth?.getSnapshot(),
    () => auth?.getSnapshot(),
  );
  return {
    authenticated: isLoggedIn(auth),
    scopes: auth?.scopes ?? new Set<string>(),
  };
}

interface ReactRouteCandidate {
  readonly id: string;
  readonly path: string;
  readonly scopes: readonly string[];
  readonly authenticationRequired: boolean;
  readonly navigation?: Readonly<Record<string, UiCogsReactNavigationLink>>;
  readonly index: number;
}

interface NavigationNodeEntry {
  readonly node: UiCogsReactNavigationNode;
  readonly order: number;
  readonly index: number;
}

function resolveNavigation(
  routes: readonly UiCogsReactRouteDefinition[],
  navigation: UiCogsReactNavigationOptions,
  placement: string,
  access: ScopeAccess,
  matches: readonly UiCogsReactRouteMatch[],
): readonly UiCogsReactNavigationNode[] {
  const groups = navigation[placement]?.groups ?? [];
  const knownGroups = new Set(groups.map((group) => group.id));
  const children = new Map<string | undefined, NavigationNodeEntry[]>();
  for (const candidate of routeCandidates(routes)) {
    const presentation = candidate.navigation?.[placement];
    if (!presentation || !canAccessCandidate(candidate, access)) continue;
    if (presentation.parent && !knownGroups.has(presentation.parent))
      throw new Error(`Unknown UiCogs navigation parent: ${presentation.parent}`);
    appendNode(children, presentation.parent, {
      node: routeNode(candidate, presentation, matches),
      order: presentation.order ?? 0,
      index: candidate.index,
    });
  }
  const byId = new Map(groups.map((group, index) => [group.id, { group, index }]));
  const buildGroup = (id: string): NavigationNodeEntry | undefined => {
    const state = byId.get(id);
    if (!state) return undefined;
    const nested = groups
      .filter((group) => group.parent === id)
      .map((group) => buildGroup(group.id))
      .filter((entry): entry is NavigationNodeEntry => entry !== undefined);
    const entries = [...(children.get(id) ?? []), ...nested];
    if (!entries.length) return undefined;
    const group = state.group;
    return {
      node: Object.freeze({
        kind: "group" as const,
        id: group.id,
        label: labelOf(group.label, matches),
        ...(group.icon === undefined ? {} : { icon: iconOf(group.icon, matches) }),
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
      .filter((entry): entry is NavigationNodeEntry => entry !== undefined),
  ];
  return Object.freeze(sortEntries(roots).map((entry) => entry.node));
}

function resolveBreadcrumbs(
  routes: readonly UiCogsReactRouteDefinition[],
  navigation: UiCogsReactNavigationOptions,
  placement: string,
  access: ScopeAccess,
  matches: readonly UiCogsReactRouteMatch[],
): readonly UiCogsReactBreadcrumb[] {
  const candidate = [...routeCandidates(routes)]
    .reverse()
    .find(
      (item) =>
        item.navigation?.[placement] !== undefined &&
        isCurrent(item, matches) &&
        canAccessCandidate(item, access),
    );
  if (!candidate) return Object.freeze([]);
  const presentation = candidate.navigation![placement]!;
  const groups = new Map((navigation[placement]?.groups ?? []).map((group) => [group.id, group]));
  const link = routeNode(candidate, presentation, matches);
  return Object.freeze([
    ...groupTrail(presentation.parent, groups, matches).map((group) =>
      Object.freeze({
        label: labelOf(group.label, matches),
        ...(group.icon === undefined ? {} : { icon: iconOf(group.icon, matches) }),
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
  routes: readonly UiCogsReactRouteDefinition[],
): readonly ReactRouteCandidate[] {
  const candidates: ReactRouteCandidate[] = [];
  const visit = (
    entries: readonly UiCogsReactRouteDefinition[],
    parentPath: string,
    inheritedScopes: readonly string[],
    inheritedDeclared: boolean,
  ) => {
    for (const route of entries) {
      const path = joinPath(parentPath, route.path);
      const meta = route.handle?.uicogs;
      const scopes = Object.freeze([...inheritedScopes, ...(meta?.scopes ?? [])]);
      const declared = inheritedDeclared || meta?.scopes !== undefined;
      if (route.path !== undefined || route.id !== undefined) {
        candidates.push(
          Object.freeze({
            id: route.id ?? path,
            path,
            scopes,
            authenticationRequired: declared,
            ...(meta?.navigation === undefined ? {} : { navigation: meta.navigation }),
            index: candidates.length,
          }),
        );
      }
      if (route.children) visit(route.children, path, scopes, declared);
    }
  };
  visit(routes, "", [], false);
  return Object.freeze(candidates);
}

function joinPath(parent: string, path: string | undefined): string {
  if (!path) return parent || "/";
  if (path.startsWith("/")) return path;
  if (!parent || parent === "/") return `/${path}`;
  return `${parent.replace(/\/$/, "")}/${path}`.replace(/\/+/g, "/");
}

function canAccessCandidate(candidate: ReactRouteCandidate, access: ScopeAccess): boolean {
  return canAccessScopes([candidate.authenticationRequired ? candidate.scopes : undefined], access);
}

function appendNode(
  children: Map<string | undefined, NavigationNodeEntry[]>,
  parent: string | undefined,
  entry: NavigationNodeEntry,
): void {
  const entries = children.get(parent) ?? [];
  entries.push(entry);
  children.set(parent, entries);
}

function routeNode(
  candidate: ReactRouteCandidate,
  presentation: UiCogsReactNavigationLink,
  matches: readonly UiCogsReactRouteMatch[],
): UiCogsReactNavigationRoute {
  return Object.freeze({
    kind: "route",
    id: candidate.id,
    label: presentation.label ? labelOf(presentation.label, matches) : defaultLabel(candidate.id),
    ...(presentation.icon === undefined ? {} : { icon: iconOf(presentation.icon, matches) }),
    ...(isNavigable(candidate.path) ? { to: candidate.path } : {}),
    current: isCurrent(candidate, matches),
  });
}

function groupTrail(
  parent: string | undefined,
  groups: ReadonlyMap<string, UiCogsReactNavigationGroup>,
  matches: readonly UiCogsReactRouteMatch[],
): readonly UiCogsReactNavigationGroup[] {
  const trail: UiCogsReactNavigationGroup[] = [];
  let id = parent;
  while (id) {
    const group = groups.get(id);
    if (!group) throw new Error(`Unknown UiCogs navigation parent: ${id}`);
    trail.unshift(group);
    id = group.parent;
  }
  return trail;
}

function labelOf(
  label: UiCogsReactNavigationLabel,
  matches: readonly UiCogsReactRouteMatch[],
): string {
  return typeof label === "function" ? label({ matches }) : label;
}

function iconOf(
  icon: UiCogsReactNavigationIcon,
  matches: readonly UiCogsReactRouteMatch[],
): unknown {
  return typeof icon === "function" ? icon({ matches }) : icon;
}

function sortEntries(entries: readonly NavigationNodeEntry[]): NavigationNodeEntry[] {
  return [...entries].sort((left, right) => left.order - right.order || left.index - right.index);
}

function isCurrent(
  candidate: ReactRouteCandidate,
  matches: readonly UiCogsReactRouteMatch[],
): boolean {
  return matches.some((match) => match.id === candidate.id || match.pathname === candidate.path);
}

function isNavigable(path: string): boolean {
  return !/:[^/]+/.test(path);
}

function defaultLabel(value: string): string {
  return value
    .replace(/^\//, "")
    .replace(/[_/-]+/g, " ")
    .replace(/^./, (part) => part.toUpperCase());
}

/** Returns the React-bound runtime supplied by the matching withReact() binding. */
export function useUiCogs<
  T extends ReactRuntimeSource = ReactRuntimeSource,
>(): ReactBoundUiCogs<T> {
  const runtime = useContext(uiCogsContext);
  if (!runtime) throw new Error("withReact() has not provided a UiCogs runtime");
  return runtime as ReactBoundUiCogs<T>;
}
