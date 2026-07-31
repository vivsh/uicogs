# @uicogs/react API

Declaration SHA-256: `bbaea7375c69d152ca2671c40927d532929a59d43a6643a9cc486aa7741b2512`

```ts
// index.d.ts
import { RuntimeAuthController, ExternalStore } from '@uicogs/core';
export * from '@uicogs/core';
import { RouteLocation, RouteRegistry, ResolvedNavigationNode, Breadcrumb } from '@uicogs/routes';
import { ReactNode, createElement } from 'react';

declare function useController<TSnapshot extends object, TController extends ExternalStore<TSnapshot>>(controller: TController): TController;
declare const useResource: typeof useController;
declare const useObject: typeof useController;
declare const useCollection: typeof useController;
declare const useForm: typeof useController;
declare const useAction: typeof useController;
declare const useAuth: typeof useController;
interface ReactRouteRecord {
    readonly path: string;
    readonly Component: unknown;
    readonly meta?: object;
}
interface ReactRouteRuntime {
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
interface ReactBindingOptions {
    readonly router: unknown;
    readonly useLocation: () => RouteLocation;
}
type ReactBoundUiCogs<T extends ReactRuntimeSource> = Omit<T, "routes"> & {
    readonly core: T;
    readonly router: unknown;
    readonly routes: ReactRouteRuntime;
    readonly Provider: (properties: {
        readonly children?: ReactNode;
    }) => ReturnType<typeof createElement>;
};
/** Binds one common UiCogs runtime to React context and router-aware route helpers. */
declare function withReact<T extends ReactRuntimeSource>(cogs: T, options: ReactBindingOptions): ReactBoundUiCogs<T>;
/** Returns the React-bound runtime supplied by the matching withReact() binding. */
declare function useUiCogs<T extends ReactRuntimeSource = ReactRuntimeSource>(): ReactBoundUiCogs<T>;
/** Compiles UiCogs entries into React Router-compatible Component route records. */
declare function toReactRoutes(registry: RouteRegistry<unknown, unknown, object>): readonly ReactRouteRecord[];

export { type ReactBindingOptions, type ReactBoundUiCogs, type ReactRouteRecord, type ReactRouteRuntime, toReactRoutes, useAction, useAuth, useCollection, useController, useForm, useObject, useResource, useUiCogs, withReact };
```
