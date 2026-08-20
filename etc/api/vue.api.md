# @uicogs/vue API

Declaration SHA-256: `86eb6f289fbafe9dcefe6312a6897b84ab7bca3b3e9a3a33ea4a491f428ecf8c`

```ts
// index.d.ts
import * as _vue_reactivity from '@vue/reactivity';
import * as _uicogs_core from '@uicogs/core';
import { EntityKey, Shape, FormController, FormSchema, Schema, Infer, ValidationIssue, Descriptor, ExternalStore, ActionPlacement, ResourceActionResolveOptions, ResourceActionDescriptor, NotificationController, AlertController, RuntimeAuthController, ControllerAdapter, FormCompatibleSchema } from '@uicogs/core';
export * from '@uicogs/core';
import { ComputedRef, WritableComputedRef, Ref, Plugin, ShallowRef } from 'vue';
import { NavigationGroup, NavigationDefinition, ScopeAccess } from '@uicogs/routes';
import { RouteLocationNormalizedLoaded, RouteLocationRaw, RouteRecordNormalized, Router } from 'vue-router';

/** Presentation metadata attached to a standard Vue Router route record. */
interface UiCogsRouteMeta {
    readonly scopes?: readonly string[];
    readonly navigation?: Readonly<Record<string, UiCogsNavigationLink>>;
}
/** One route link's presentation for a named navigation placement. */
interface UiCogsNavigationLink {
    readonly parent?: string;
    readonly label?: UiCogsNavigationLabel;
    readonly icon?: UiCogsNavigationIcon;
    readonly order?: number;
}
/** One non-link group declared once for a navigation placement. */
type UiCogsNavigationGroup = NavigationGroup<UiCogsNavigationLabel, UiCogsNavigationIcon>;
/** Named group declarations used by the Vue binding. */
type UiCogsNavigationOptions = NavigationDefinition<UiCogsNavigationLabel, UiCogsNavigationIcon>;
/** Current Vue Router location supplied to dynamic navigation presentation. */
interface UiCogsNavigationContext {
    readonly route: RouteLocationNormalizedLoaded;
}
type UiCogsNavigationLabel = string | ((context: UiCogsNavigationContext) => string);
type UiCogsNavigationIcon = unknown | ((context: UiCogsNavigationContext) => unknown);
/** A scope-filtered link suitable for rendering by a Vue application. */
interface UiCogsNavigationRoute {
    readonly kind: "route";
    readonly id: string;
    readonly label: string;
    readonly icon?: unknown;
    readonly to?: RouteLocationRaw;
    readonly current: boolean;
}
/** A scope-filtered non-link group suitable for rendering by a Vue application. */
interface UiCogsNavigationGroupNode {
    readonly kind: "group";
    readonly id: string;
    readonly label: string;
    readonly icon?: unknown;
    readonly children: readonly UiCogsNavigationNode[];
}
type UiCogsNavigationNode = UiCogsNavigationRoute | UiCogsNavigationGroupNode;
/** One breadcrumb derived from a named navigation placement. */
interface UiCogsBreadcrumb {
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
/** Evaluates the additive scope policy for Vue Router's matched records. */
declare function canAccessRoute(matched: readonly RouteRecordNormalized[], access: ScopeAccess): boolean;
/** Creates composition-safe reactive navigation helpers without retaining a router on UiCogs. */
declare function useUiCogsNavigation(navigation: UiCogsNavigationOptions, access: () => ScopeAccess, records?: readonly RouteRecordNormalized[]): Readonly<{
    navigation: (placement: string) => ComputedRef<readonly UiCogsNavigationNode[]>;
    breadcrumbs: (placement: string) => ComputedRef<readonly UiCogsBreadcrumb[]>;
}>;
/** Validates group identity, parent relationships, and group cycles before installation. */
declare function validateNavigation(navigation: UiCogsNavigationOptions): void;

type EmptyShape = Readonly<Record<never, never>>;
type RouteUrlValue = string | number | boolean | null | readonly (string | number | boolean | null)[];
type RouteQueryValues = Readonly<Record<string, RouteUrlValue | undefined>>;
type RouteQueryValue<S extends Shape, TContext> = Readonly<Partial<Infer<Schema<S, TContext>>>>;
/** Typed schemas and the named route owned by a route-state controller. */
interface RouteStateOptions<TQuery extends Shape = EmptyShape, TQueryContext = unknown, TParams extends Shape = EmptyShape, TParamsContext = unknown> {
    readonly route: string;
    readonly query?: Schema<TQuery, TQueryContext>;
    readonly params?: Schema<TParams, TParamsContext>;
}
/** A typed update which changes only declared URL state and preserves all other state. */
interface RouteStateUpdate<TQuery extends Shape, TQueryContext, TParams extends Shape, TParamsContext> {
    readonly query?: RouteQueryValue<TQuery, TQueryContext>;
    readonly params?: Readonly<Partial<Infer<Schema<TParams, TParamsContext>>>>;
    /** Additional owned query values for a higher-level URL codec, such as pagination. */
    readonly extraQuery?: RouteQueryValues;
}
/** Reactive, schema-decoded URL state for one named Vue Router route. */
interface RouteState<TQuery extends Shape, TQueryContext, TParams extends Shape, TParamsContext> {
    readonly route: string;
    readonly query: ComputedRef<RouteQueryValue<TQuery, TQueryContext>>;
    readonly params: ComputedRef<Readonly<Partial<Infer<Schema<TParams, TParamsContext>>>>>;
    readonly issues: ComputedRef<readonly ValidationIssue[]>;
    push(update?: RouteStateUpdate<TQuery, TQueryContext, TParams, TParamsContext>): Promise<void>;
    replace(update?: RouteStateUpdate<TQuery, TQueryContext, TParams, TParamsContext>): Promise<void>;
}
/**
 * Binds schemas to a named Vue Router location. Invalid owned values are removed with replace,
 * while valid values and every foreign query value remain intact.
 */
declare function useRouteState<TQuery extends Shape = EmptyShape, TQueryContext = unknown, TParams extends Shape = EmptyShape, TParamsContext = unknown>(options: RouteStateOptions<TQuery, TQueryContext, TParams, TParamsContext>): RouteState<TQuery, TQueryContext, TParams, TParamsContext>;
/** A form whose successful submissions write one canonical route location. */
declare function useRouteForm<TSchema extends Shape, TContext, TParams extends Shape, TParamsContext>(options: {
    readonly route: RouteState<TSchema, TContext, TParams, TParamsContext>;
    readonly schema: Schema<TSchema, TContext>;
    readonly history?: "push" | "replace";
}): FormController<FormSchema<Schema<TSchema, TContext>, Infer<Schema<TSchema, TContext>>>>;
/** The route keys read and written by a page/sort codec. */
interface RoutePaginationCodec {
    readonly keys: readonly string[];
    read(query: RouteQueryValues): Readonly<{
        index: number;
        size: number;
        ordering?: string;
    }>;
    write(state: Readonly<{
        index: number;
        size: number;
        ordering?: string;
    }>): RouteQueryValues;
}
/** The standard `page`, `page_size`, and `ordering` query convention. */
declare const standardRoutePagination: RoutePaginationCodec;
/** A collection facade whose filter, sorting, and page changes first update the URL. */
type RouteCollection<TCollection extends RouteCollectionSource> = Omit<TCollection, "resource" | "sort" | "page" | "nextPage"> & {
    readonly resource: RouteCollectionMetadata;
    sort(field?: string, descending?: boolean): Promise<void>;
    page(index: number, size?: number): Promise<void>;
    nextPage(): Promise<void>;
};
/** Immutable metadata shared by resources and named query collections. */
interface RouteCollectionMetadata {
    readonly name: string;
    readonly key: string | ((value: Readonly<Record<string, unknown>>) => EntityKey);
    readonly schema: {
        readonly shape: Readonly<Record<string, {
            readonly options: Readonly<{
                readonly wireName?: string;
            }>;
            parse(value: unknown, path?: readonly (string | number)[]): unknown;
        }>>;
    };
}
/** The collection contract shared by a resource and named resource query controllers. */
interface RouteCollectionSource {
    readonly resource?: RouteCollectionMetadata;
    readonly definition?: RouteCollectionMetadata;
    readonly loading: boolean;
    readonly pageInfo?: unknown;
    all(): readonly object[];
    load(): Promise<unknown>;
    refresh(): Promise<unknown>;
    filter(values: Readonly<Record<string, unknown>>): unknown;
    sort(field?: string, descending?: boolean): unknown;
    page(index: number, size?: number): unknown;
    nextPage(): unknown;
    hasMore(): boolean;
}
/** Binds collection filters, sorting, and pagination to an existing route state controller. */
declare function useRouteCollection<TCollection extends RouteCollectionSource, TFilters extends Shape = EmptyShape, TContext = unknown, TParams extends Shape = EmptyShape, TParamsContext = unknown>(options: {
    readonly route: RouteState<TFilters, TContext, TParams, TParamsContext>;
    readonly collection: TCollection;
    readonly filters?: Schema<TFilters, TContext>;
    readonly pagination?: RoutePaginationCodec;
    /** Observes a failed URL-driven load after the collection has updated its own error state. */
    readonly onFailure?: (failure: unknown) => void;
}): RouteCollection<TCollection>;
/** Key codecs are needed only when a resource key is calculated rather than a schema field. */
interface RouteKeyOptions<TKey extends EntityKey> {
    readonly parseKey?: (value: string) => TKey;
    readonly formatKey?: (key: TKey) => string;
}
/** A resource-view capability which can be guarded by scopes or application policy. */
type ResourceCapability = "view" | "create" | "edit";
/** Required scopes for each resource-view capability. */
type ResourceScopes = Readonly<Partial<Record<ResourceCapability, readonly string[]>>>;
/** A current resource target supplied to an access rule. */
interface ResourcePermitTarget<TKey extends EntityKey, TValue extends Readonly<Record<string, unknown>>> {
    readonly key?: TKey;
    readonly value?: TValue;
}
/** Immutable input supplied to an application-owned resource access rule. */
interface ResourcePermitContext<TKey extends EntityKey, TValue extends Readonly<Record<string, unknown>>> extends ResourcePermitTarget<TKey, TValue> {
    readonly action: ResourceCapability;
    readonly authenticated: boolean;
    readonly scopes: ReadonlySet<string>;
}
/** A synchronous application-owned rule which may further restrict a resource capability. */
type ResourcePermit<TKey extends EntityKey, TValue extends Readonly<Record<string, unknown>>> = (context: ResourcePermitContext<TKey, TValue>) => boolean;
/** Declarative and callback-based policy for resource-view capabilities. */
interface ResourceAccessOptions<TKey extends EntityKey, TValue extends Readonly<Record<string, unknown>>> {
    readonly scopes?: ResourceScopes;
    readonly permit?: ResourcePermit<TKey, TValue>;
}
/** Reactive, shared evaluator for resource-view capability policy. */
interface ResourceAccess<TKey extends EntityKey, TValue extends Readonly<Record<string, unknown>>> {
    readonly state: ComputedRef<Readonly<{
        readonly authenticated: boolean;
        readonly scopes: ReadonlySet<string>;
    }>>;
    can(action: ResourceCapability, target?: ResourcePermitTarget<TKey, TValue>): boolean;
}
/**
 * Resolves capability access from the installed UiCogs auth controller and an optional policy.
 *
 * An absent policy permits access. Scope-protected capabilities fail closed when no UiCogs
 * runtime is installed, while callback errors are contained and deny access.
 */
declare function useResourceAccess<TKey extends EntityKey = EntityKey, TValue extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>>(options?: ResourceAccessOptions<TKey, TValue>): ResourceAccess<TKey, TValue>;
/** A resource page composed from route state, route filters, a route list, and active detail state. */
interface RouteResourceSource extends RouteCollectionSource {
    readonly definition: RouteCollectionMetadata & {
        readonly operations?: Readonly<Record<string, unknown>>;
    };
    get(...args: never[]): {
        readonly value?: Readonly<Record<string, unknown>>;
        readonly loading: boolean;
        load(): Promise<unknown>;
    };
}
type RouteResourceKey<TResource> = TResource extends {
    get(key: infer TKey): unknown;
} ? Extract<TKey, EntityKey> : EntityKey;
type RouteResourceValue<TResource extends RouteResourceSource> = ReturnType<TResource["get"]> extends {
    readonly value?: infer TValue;
} ? TValue extends Readonly<Record<string, unknown>> ? TValue : Readonly<Record<string, unknown>> : Readonly<Record<string, unknown>>;
/** Controls whether one route-resource navigation creates or replaces browser history. */
interface RouteResourceNavigationOptions {
    readonly history?: "push" | "replace";
}
/** The route-owned surface currently selected by a resource page. */
type RouteResourceMode = "list" | "detail" | "create";
/**
 * Immutable route-backed resource-page controller.
 *
 * The URL is the source of truth for its list, detail, and create state. Framework
 * views should call `open()`, `create()`, and `close()` rather than maintaining a
 * second selected-key or create-state model.
 */
interface RouteResource<TResource extends RouteResourceSource, TFilters extends Shape, TFilterContext = unknown> {
    readonly resource: TResource;
    readonly collection: RouteCollection<TResource>;
    readonly filterForm: FormController<FormSchema<Schema<TFilters, TFilterContext>, Infer<Schema<TFilters, TFilterContext>>>>;
    readonly route: RouteState<TFilters, TFilterContext, EmptyShape, unknown>;
    readonly activeKey: WritableComputedRef<RouteResourceKey<TResource> | undefined>;
    readonly activeObject: ComputedRef<ReturnType<TResource["get"]> | undefined>;
    readonly creating: WritableComputedRef<boolean>;
    readonly mode: ComputedRef<RouteResourceMode>;
    readonly access: ResourceAccess<RouteResourceKey<TResource>, RouteResourceValue<TResource>>;
    can(action: ResourceCapability, target?: ResourcePermitTarget<RouteResourceKey<TResource>, RouteResourceValue<TResource>>): boolean;
    open(key: RouteResourceKey<TResource> | undefined, options?: RouteResourceNavigationOptions): Promise<void>;
    create(options?: RouteResourceNavigationOptions): Promise<void>;
    close(options?: RouteResourceNavigationOptions): Promise<void>;
}
declare function useRouteResource<TResource extends RouteResourceSource, TFilters extends Shape, TFilterContext = unknown>(options: {
    readonly route: string;
    readonly resource: TResource;
    readonly filters: Schema<TFilters, TFilterContext>;
    readonly key?: RouteKeyOptions<RouteResourceKey<TResource>>;
    readonly pagination?: RoutePaginationCodec;
    /** Observes a failed URL-driven list load after the resource has updated its error state. */
    readonly onCollectionFailure?: (failure: unknown) => void;
    readonly scopes?: ResourceScopes;
    readonly permit?: ResourcePermit<RouteResourceKey<TResource>, RouteResourceValue<TResource>>;
}): RouteResource<TResource, TFilters, TFilterContext>;

declare function vueReactive<T extends ExternalStore<object>>(controller: T): T;
interface WithVueOptions {
    readonly navigation?: UiCogsNavigationOptions;
    /**
     * An optional route integration installed before UiCogs captures the application's
     * static route records. Framework extensions can use this to add opt-in routes.
     */
    readonly stylebook?: VueRouteIntegration;
    readonly onDenied?: (input: {
        readonly to: RouteLocationNormalizedLoaded;
        readonly scopes: readonly string[];
    }) => RouteLocationRaw | false | void;
}
/**
 * A framework-neutral Vue Router extension installed during `withVue()` setup.
 * Implementations must only add their own static router records.
 */
interface VueRouteIntegration {
    install(router: Router): void;
}
interface VueRuntimeSource extends Record<never, never> {
    readonly ready: Promise<void>;
    readonly context: ExternalStore<object>;
    readonly live: ExternalStore<object>;
    readonly notifications: NotificationController;
    readonly alerts: AlertController;
    readonly auth?: RuntimeAuthController;
    icon?(name: string): string;
    bindControllerAdapter(adapter: ControllerAdapter): void;
}
type VueBoundUiCogs<T extends VueRuntimeSource> = Omit<T, "context" | "live" | "auth" | "notifications" | "alerts"> & {
    readonly core: T;
    readonly context: T["context"];
    readonly live: T["live"];
    readonly notifications: T["notifications"];
    readonly alerts: T["alerts"];
    readonly auth: T["auth"];
    navigation(placement: string): ComputedRef<readonly UiCogsNavigationNode[]>;
    breadcrumbs(placement: string): ComputedRef<readonly UiCogsBreadcrumb[]>;
    hasScope(scope: string): ComputedRef<boolean>;
    hasScopes(scopes: readonly string[]): ComputedRef<boolean>;
};
/** A Vue plugin and its application-specific, fully typed component composable. */
interface VueUiCogsBinding<T extends VueRuntimeSource> {
    readonly uiCogs: Plugin;
    useUiCogs(): VueBoundUiCogs<T>;
}
/** Awaits one core runtime and creates its Vue plugin and typed component composable. */
declare function withVue<T extends VueRuntimeSource>(cogs: T, options?: WithVueOptions): Promise<VueUiCogsBinding<T>>;
/** Returns the Vue-bound application runtime installed by withVue(). */
declare function useUiCogs<T extends VueRuntimeSource = VueRuntimeSource>(): VueBoundUiCogs<T>;
declare function useUcController<T extends ExternalStore<object>>(controller: T): T;
declare const useUcResource: typeof useUcController;
declare const useUcObject: typeof useUcController;
declare const useUcCollection: typeof useUcController;
declare const useUcForm: typeof useUcController;
declare const useUcAction: typeof useUcController;
/** Declarative narrowing for generated resource actions; access rules always remain enforced. */
type UcResourceActionOverride = false | readonly string[] | ((names: readonly string[]) => readonly string[]);
/** Options shared by the Vue resource-action composables. */
interface UcResourceActionOptions<TKey extends EntityKey> {
    readonly placement: ActionPlacement;
    readonly selectedKeys?: Readonly<Ref<readonly TKey[]>> | readonly TKey[];
    readonly actions?: UcResourceActionOverride;
}
/** The core resource surface consumed by framework action bindings. */
interface UcResourceActionSource<TKey extends EntityKey> extends ExternalStore<object> {
    actions(options: ResourceActionResolveOptions<TKey>): readonly ResourceActionDescriptor<TKey>[];
}
/** The object surface consumed by object-bound Vue action bindings. */
interface UcObjectActionSource<TKey extends EntityKey> extends ExternalStore<object> {
    readonly key: TKey;
    readonly value?: Readonly<Record<string, unknown>>;
}
/** Resolves placement actions reactively while preserving core scope and visibility checks. */
declare function useUcResourceActions<TKey extends EntityKey>(resource: UcResourceActionSource<TKey>, options: UcResourceActionOptions<TKey>): ComputedRef<readonly ResourceActionDescriptor<TKey>[]>;
/** Resolves object-bound placement actions reactively for a current resource object. */
declare function useUcObjectActions<TKey extends EntityKey>(resource: UcResourceActionSource<TKey>, object: UcObjectActionSource<TKey>, options: UcResourceActionOptions<TKey>): ComputedRef<readonly ResourceActionDescriptor<TKey>[]>;
declare function useUcSnapshot<T extends object>(store: ExternalStore<T>): Readonly<ShallowRef<T>>;
interface RendererRegistry<TEditor, TFormatter> {
    registerEditor(kind: string, renderer: TEditor): RendererRegistry<TEditor, TFormatter>;
    registerFormatter(kind: string, renderer: TFormatter): RendererRegistry<TEditor, TFormatter>;
    editor(descriptor: Descriptor | undefined): TEditor | undefined;
    formatter(descriptor: Descriptor | undefined): TFormatter | undefined;
}
declare function createRendererRegistry<TEditor, TFormatter>(): RendererRegistry<TEditor, TFormatter>;
interface UcFieldModel {
    readonly name: string;
    readonly descriptor?: Descriptor;
    readonly label: string;
    readonly help?: string;
    readonly state: ComputedRef<Readonly<Record<string, unknown>>>;
}
declare function useUcFormModel<TForm extends FormSchema<FormCompatibleSchema, unknown>, TController extends FormController<TForm>>(controller: TController): Readonly<{
    form: TController;
    fields: ComputedRef<readonly UcFieldModel[]>;
    summary: ComputedRef<_uicogs_core.ValidationIssue[]>;
}>;
interface UcTableColumnModel {
    readonly name: string;
    readonly label: string;
    readonly descriptor?: Descriptor;
    readonly sortable: boolean;
    readonly hidden: boolean;
}
declare function useUcTableModel<TContext, TSchema extends Schema<Shape, TContext>, TCollection extends {
    readonly values: readonly Readonly<Record<string, unknown>>[];
    readonly loading: boolean;
    readonly pageInfo?: unknown;
    sort(field?: string, descending?: boolean): unknown;
    page(index: number, size?: number): unknown;
    load(): Promise<unknown>;
}>(collection: TCollection, schema: TSchema): Readonly<{
    collection: TCollection;
    columns: ComputedRef<readonly UcTableColumnModel[]>;
    rows: ComputedRef<readonly Readonly<Record<string, unknown>>[]>;
}>;
interface UcResourceModel<TKey extends EntityKey, TEntity> extends ExternalStore<object> {
    readonly loading: boolean;
    all(): readonly Readonly<TEntity>[];
    get(key: TKey): ExternalStore<object>;
}
declare function useUcResourceView<TKey extends EntityKey, TEntity, TResource extends UcResourceModel<TKey, TEntity>>(resource: TResource, options?: {
    readonly activeKey?: Ref<TKey | undefined>;
    readonly selectedKeys?: Ref<readonly TKey[]>;
}): Readonly<{
    resource: TResource;
    activeKey: Ref<TKey | undefined, TKey | undefined>;
    selectedKeys: Ref<readonly TKey[], readonly TKey[]> | Ref<readonly _vue_reactivity.UnwrapRefSimple<TKey>[], readonly TKey[] | readonly _vue_reactivity.UnwrapRefSimple<TKey>[]>;
    creating: Readonly<Ref<boolean, boolean>>;
    activeObject: ComputedRef<ExternalStore<object> | undefined>;
    mode: ComputedRef<"list" | "create" | "detail">;
    open(key: TKey): void;
    create(): void;
    close(): void;
}>;

export { type RendererRegistry, type ResourceAccess, type ResourceAccessOptions, type ResourceCapability, type ResourcePermit, type ResourcePermitContext, type ResourcePermitTarget, type ResourceScopes, type RouteCollection, type RouteCollectionMetadata, type RouteCollectionSource, type RouteKeyOptions, type RoutePaginationCodec, type RouteResource, type RouteResourceMode, type RouteResourceNavigationOptions, type RouteResourceSource, type RouteState, type RouteStateOptions, type RouteStateUpdate, type UcFieldModel, type UcObjectActionSource, type UcResourceActionOptions, type UcResourceActionOverride, type UcResourceActionSource, type UcResourceModel, type UcTableColumnModel, type UiCogsBreadcrumb, type UiCogsNavigationContext, type UiCogsNavigationGroup, type UiCogsNavigationGroupNode, type UiCogsNavigationIcon, type UiCogsNavigationLabel, type UiCogsNavigationLink, type UiCogsNavigationNode, type UiCogsNavigationOptions, type UiCogsNavigationRoute, type UiCogsRouteMeta, type VueBoundUiCogs, type VueRouteIntegration, type VueUiCogsBinding, type WithVueOptions, canAccessRoute, createRendererRegistry, standardRoutePagination, useResourceAccess, useRouteCollection, useRouteForm, useRouteResource, useRouteState, useUcAction, useUcCollection, useUcController, useUcForm, useUcFormModel, useUcObject, useUcObjectActions, useUcResource, useUcResourceActions, useUcResourceView, useUcSnapshot, useUcTableModel, useUiCogs, useUiCogsNavigation, validateNavigation, vueReactive, withVue };
```
