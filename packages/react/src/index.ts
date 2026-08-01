import { isLoggedIn, type ExternalStore, type RuntimeAuthController } from "@uicogs/core";
import {
  type Breadcrumb,
  type ResolvedNavigationNode,
  type RouteAccess,
  type RouteLocation,
  type RouteNode,
  type RouteRegistry,
  resolveRoutePath,
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

export interface ReactRouteRecord {
  readonly path: string;
  readonly name?: string;
  readonly Component?: unknown;
  readonly meta?: object;
  readonly children?: readonly ReactRouteRecord[];
}

export interface ReactRouteConversionOptions {
  readonly redirect?: (target: string) => unknown;
}

export interface ReactRouteRuntime {
  readonly registry: RouteRegistry<unknown, unknown, object>;
  readonly records: readonly ReactRouteRecord[];
  useNavigationTree(placement: string): readonly ResolvedNavigationNode[];
  useBreadcrumbs(): readonly Breadcrumb[];
  useHasPermission(path: string): boolean;
  canNavigate(location: RouteLocation): boolean;
}

interface ReactRuntimeSource extends Record<never, never> {
  readonly routes: RouteRegistry<unknown, unknown, Record<never, never>>;
  readonly auth?: RuntimeAuthController;
}

export interface ReactBindingOptions {
  readonly router: unknown;
  readonly useLocation: () => RouteLocation;
  readonly redirect?: (target: string) => unknown;
}

export type ReactBoundUiCogs<T extends ReactRuntimeSource> = Omit<T, "routes"> & {
  readonly core: T;
  readonly router: unknown;
  readonly routes: ReactRouteRuntime;
  readonly Provider: (properties: {
    readonly children?: ReactNode;
  }) => ReturnType<typeof createElement>;
};

/** Binds one common UiCogs runtime to React context and router-aware route helpers. */
export function withReact<T extends ReactRuntimeSource>(
  cogs: T,
  options: ReactBindingOptions,
): ReactBoundUiCogs<T> {
  const access = (): RouteAccess => accessFor(cogs.auth);
  const routeRuntime: ReactRouteRuntime = Object.freeze({
    registry: cogs.routes,
    records: toReactRoutes(cogs.routes, { redirect: options.redirect }),
    useNavigationTree: (placement: string) => {
      const snapshot = useAuthSnapshot(cogs.auth);
      return cogs.routes.navigationTree(
        placement,
        accessForSnapshot(snapshot),
        options.useLocation(),
      );
    },
    useBreadcrumbs: () => {
      const snapshot = useAuthSnapshot(cogs.auth);
      return cogs.routes.breadcrumbs(accessForSnapshot(snapshot), options.useLocation());
    },
    useHasPermission: (path: string) => {
      const snapshot = useAuthSnapshot(cogs.auth);
      return cogs.routes.hasPermission(path, accessForSnapshot(snapshot));
    },
    canNavigate: (location: RouteLocation) => {
      const entry = cogs.routes.resolve(location);
      return !entry || cogs.routes.hasPermission(entry.path, access());
    },
  });
  const bound = Object.create(cogs) as ReactBoundUiCogs<T>;
  const Provider = ({ children }: { readonly children?: ReactNode }) =>
    createElement(uiCogsContext.Provider, { value: bound }, children);
  Object.defineProperties(bound, {
    core: { value: cogs },
    router: { value: options.router },
    routes: { value: routeRuntime },
    Provider: { value: Provider },
  });
  return bound;
}

/** Returns the React-bound runtime supplied by the matching withReact() binding. */
export function useUiCogs<
  T extends ReactRuntimeSource = ReactRuntimeSource,
>(): ReactBoundUiCogs<T> {
  const runtime = useContext(uiCogsContext);
  if (!runtime) throw new Error("withReact() has not provided a UiCogs runtime");
  return runtime as ReactBoundUiCogs<T>;
}

/** Compiles the UiCogs route tree into nested React Router-compatible records. */
export function toReactRoutes(
  registry: RouteRegistry<unknown, unknown, object>,
  options: ReactRouteConversionOptions = {},
): readonly ReactRouteRecord[] {
  return Object.freeze(
    registry.tree.map((node) => toReactRoute(node, registry, options, undefined)),
  );
}

function toReactRoute(
  node: RouteNode<unknown, object>,
  registry: RouteRegistry<unknown, unknown, object>,
  options: ReactRouteConversionOptions,
  parentPath: string | undefined,
): ReactRouteRecord {
  const resolvedPath = resolveRoutePath(parentPath, node.path);
  if ("children" in node) {
    return Object.freeze({
      path: node.path,
      ...(node.component === undefined ? {} : { Component: node.component }),
      ...(node.meta === undefined ? {} : { meta: node.meta }),
      children: Object.freeze(
        node.children.map((child) => toReactRoute(child, registry, options, resolvedPath)),
      ),
    });
  }
  if (node.redirect !== undefined) {
    const target = registry.entry(resolvedPath)?.redirect;
    if (!options.redirect)
      throw new Error("React route redirects require a toReactRoutes() redirect adapter");
    if (!target) throw new Error(`Route redirect was not resolved: ${node.path}`);
    return Object.freeze({
      path: node.path,
      ...(node.name === undefined ? {} : { name: node.name }),
      Component: options.redirect(target),
      ...(node.meta === undefined ? {} : { meta: node.meta }),
    });
  }
  return Object.freeze({
    path: node.path,
    ...(node.name === undefined ? {} : { name: node.name }),
    Component: node.component,
    ...(node.meta === undefined ? {} : { meta: node.meta }),
  });
}

function useAuthSnapshot(auth: RuntimeAuthController | undefined): object | undefined {
  return useSyncExternalStore(
    (listener) => auth?.subscribe(listener) ?? (() => undefined),
    () => auth?.getSnapshot(),
    () => auth?.getSnapshot(),
  );
}

function accessFor(auth: RuntimeAuthController | undefined): RouteAccess {
  return accessForSnapshot(auth ? auth.getSnapshot() : undefined, auth);
}

function accessForSnapshot(
  snapshot: object | undefined,
  auth?: RuntimeAuthController,
): RouteAccess {
  const candidate = snapshot as { readonly permissions?: ReadonlySet<string> } | undefined;
  return {
    authenticated: isLoggedIn(auth),
    permissions: candidate?.permissions ?? new Set<string>(),
  };
}
