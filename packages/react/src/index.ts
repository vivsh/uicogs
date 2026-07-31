import { isLoggedIn, type ExternalStore, type RuntimeAuthController } from "@uicogs/core";
import {
  type Breadcrumb,
  type ResolvedNavigationNode,
  type RouteAccess,
  type RouteLocation,
  type RouteRegistry,
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
  readonly Component: unknown;
  readonly meta?: object;
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
    records: toReactRoutes(cogs.routes),
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
      const entry = cogs.routes.match(location.path);
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

/** Compiles UiCogs entries into React Router-compatible Component route records. */
export function toReactRoutes(
  registry: RouteRegistry<unknown, unknown, object>,
): readonly ReactRouteRecord[] {
  return Object.freeze(
    registry.entries.map((entry) =>
      Object.freeze({
        path: entry.path,
        Component: entry.component,
        ...(entry.meta === undefined ? {} : { meta: entry.meta }),
      }),
    ),
  );
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
