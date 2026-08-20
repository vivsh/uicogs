# @uicogs/react API

Declaration SHA-256: `68b4a16f5e93076eb8464a11abc80d4525a9f16e9da38f01db59f47ec7d9940e`

```ts
// index.d.ts
import { EntityKey, ExternalStore, RuntimeAuthController, ActionPlacement, ResourceActionResolveOptions, ResourceActionDescriptor } from '@uicogs/core';
export * from '@uicogs/core';
import { NavigationDefinition, NavigationGroup } from '@uicogs/routes';
import { ReactNode, createElement } from 'react';

declare function useController<TSnapshot extends object, TController extends ExternalStore<TSnapshot>>(controller: TController): TController;
declare const useResource: typeof useController;
declare const useObject: typeof useController;
declare const useCollection: typeof useController;
declare const useForm: typeof useController;
declare const useAction: typeof useController;
declare const useAuth: typeof useController;
/** Declarative narrowing for generated resource actions; core presentation checks still apply. */
type ResourceActionOverride = false | readonly string[] | ((names: readonly string[]) => readonly string[]);
/** Options shared by React resource-action hooks. */
interface ResourceActionOptions<TKey extends EntityKey> {
    readonly placement: ActionPlacement;
    readonly selectedKeys?: readonly TKey[];
    readonly actions?: ResourceActionOverride;
}
/** Framework-neutral resource surface consumed by React action hooks. */
interface ResourceActionSource<TKey extends EntityKey> extends ExternalStore<object> {
    actions(options: ResourceActionResolveOptions<TKey>): readonly ResourceActionDescriptor<TKey>[];
}
/** Framework-neutral object surface consumed by React object-action hooks. */
interface ObjectActionSource<TKey extends EntityKey> extends ExternalStore<object> {
    readonly key: TKey;
    readonly value?: Readonly<Record<string, unknown>>;
}
/** Returns core-resolved placement actions and rerenders when the resource or auth state changes. */
declare function useResourceActions<TKey extends EntityKey>(resource: ResourceActionSource<TKey>, options: ResourceActionOptions<TKey>): readonly ResourceActionDescriptor<TKey>[];
/** Returns core-resolved object actions and rerenders when the object or auth state changes. */
declare function useObjectActions<TKey extends EntityKey>(resource: ResourceActionSource<TKey>, object: ObjectActionSource<TKey>, options: ResourceActionOptions<TKey>): readonly ResourceActionDescriptor<TKey>[];
/** Current native React Router matches supplied to navigation presentation callbacks. */
interface UiCogsReactNavigationContext {
    readonly matches: readonly UiCogsReactRouteMatch[];
}
type UiCogsReactNavigationLabel = string | ((context: UiCogsReactNavigationContext) => string);
type UiCogsReactNavigationIcon = unknown | ((context: UiCogsReactNavigationContext) => unknown);
/** One route link's presentation for a named navigation placement. */
interface UiCogsReactNavigationLink {
    readonly parent?: string;
    readonly label?: UiCogsReactNavigationLabel;
    readonly icon?: UiCogsReactNavigationIcon;
    readonly order?: number;
}
/** One non-link group shared by React and other framework bindings. */
type UiCogsReactNavigationGroup = NavigationGroup<UiCogsReactNavigationLabel, UiCogsReactNavigationIcon>;
/** Named non-link group declarations for React navigation placements. */
type UiCogsReactNavigationOptions = NavigationDefinition<UiCogsReactNavigationLabel, UiCogsReactNavigationIcon>;
/** Scope and link metadata stored in a native React Router route `handle`. */
interface UiCogsReactRouteMeta {
    readonly scopes?: readonly string[];
    readonly navigation?: Readonly<Record<string, UiCogsReactNavigationLink>>;
}
/** The `handle` shape UiCogs reads from native React Router matches. */
interface UiCogsReactRouteHandle {
    readonly uicogs?: UiCogsReactRouteMeta;
}
/** The minimal native React Router match surface required for scope checks. */
interface UiCogsReactRouteMatch {
    readonly id?: string;
    readonly pathname?: string;
    readonly handle?: UiCogsReactRouteHandle;
}
/** Structural native React Router route record used only to read static metadata. */
interface UiCogsReactRouteDefinition {
    readonly id?: string;
    readonly path?: string;
    readonly index?: boolean;
    readonly handle?: UiCogsReactRouteHandle;
    readonly children?: readonly UiCogsReactRouteDefinition[];
}
/** A scope-filtered route link suitable for rendering by a React application. */
interface UiCogsReactNavigationRoute {
    readonly kind: "route";
    readonly id: string;
    readonly label: string;
    readonly icon?: unknown;
    readonly to?: string;
    readonly current: boolean;
}
/** A scope-filtered non-link group suitable for rendering by a React application. */
interface UiCogsReactNavigationGroupNode {
    readonly kind: "group";
    readonly id: string;
    readonly label: string;
    readonly icon?: unknown;
    readonly children: readonly UiCogsReactNavigationNode[];
}
type UiCogsReactNavigationNode = UiCogsReactNavigationRoute | UiCogsReactNavigationGroupNode;
/** One breadcrumb derived from a named React navigation placement. */
interface UiCogsReactBreadcrumb {
    readonly label: string;
    readonly icon?: unknown;
    readonly to?: string;
    readonly current: boolean;
}
interface ReactRuntimeSource extends Record<never, never> {
    readonly auth?: RuntimeAuthController;
}
/** Native React Router hooks supplied by an application without a router dependency. */
interface ReactBindingOptions {
    readonly useMatches?: () => readonly UiCogsReactRouteMatch[];
    readonly routes?: readonly UiCogsReactRouteDefinition[];
    readonly navigation?: UiCogsReactNavigationOptions;
}
type ReactBoundUiCogs<T extends ReactRuntimeSource> = T & {
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
declare function withReact<T extends ReactRuntimeSource>(cogs: T, options?: ReactBindingOptions): ReactBoundUiCogs<T>;
/** Returns the React-bound runtime supplied by the matching withReact() binding. */
declare function useUiCogs<T extends ReactRuntimeSource = ReactRuntimeSource>(): ReactBoundUiCogs<T>;

export { type ObjectActionSource, type ReactBindingOptions, type ReactBoundUiCogs, type ResourceActionOptions, type ResourceActionOverride, type ResourceActionSource, type UiCogsReactBreadcrumb, type UiCogsReactNavigationContext, type UiCogsReactNavigationGroup, type UiCogsReactNavigationGroupNode, type UiCogsReactNavigationIcon, type UiCogsReactNavigationLabel, type UiCogsReactNavigationLink, type UiCogsReactNavigationNode, type UiCogsReactNavigationOptions, type UiCogsReactNavigationRoute, type UiCogsReactRouteDefinition, type UiCogsReactRouteHandle, type UiCogsReactRouteMatch, type UiCogsReactRouteMeta, useAction, useAuth, useCollection, useController, useForm, useObject, useObjectActions, useResource, useResourceActions, useUiCogs, withReact };
```
