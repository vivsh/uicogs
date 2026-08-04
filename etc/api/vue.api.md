# @uicogs/vue API

Declaration SHA-256: `8b08bd2b48b5d087b81270809edf8b43b20cbc533d7d219724743a8afd3e6725`

```ts
// index.d.ts
import * as _vue_reactivity from '@vue/reactivity';
import * as _uicogs_core from '@uicogs/core';
import { EntityKey, Shape, Infer, Schema, ValidationIssue, FormController, FormSchema, Descriptor, ExternalStore, RuntimeAuthController, ControllerAdapter, FormCompatibleSchema } from '@uicogs/core';
export * from '@uicogs/core';
import { RouteRegistry, ResolvedNavigationNode, Breadcrumb, ResolvedRouteEntry, RouteLocation } from '@uicogs/routes';
import * as vue from 'vue';
import { ComputedRef, Plugin, Ref, ShallowRef } from 'vue';
import { RouteRecordRaw } from 'vue-router';

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
}): RouteCollection<TCollection>;
/** Detail-key codecs are needed only when a resource key is calculated rather than a schema field. */
interface RouteDetailOptions<TKey extends EntityKey> {
    readonly param: string;
    readonly parseKey?: (value: string) => TKey;
    readonly formatKey?: (key: TKey) => string;
}
/** A resource page composed from route state, route filters, a route list, and active detail state. */
interface RouteResourceSource extends RouteCollectionSource {
    readonly definition: RouteCollectionMetadata;
    get(...args: never[]): {
        readonly value?: Readonly<Record<string, unknown>>;
        readonly loading: boolean;
        load(): Promise<unknown>;
    };
}
type RouteResourceKey<TResource> = TResource extends {
    get(key: infer TKey): unknown;
} ? Extract<TKey, EntityKey> : EntityKey;
declare function useRouteResource<TResource extends RouteResourceSource, TFilters extends Shape, TFilterContext = unknown>(options: {
    readonly route: string;
    readonly resource: TResource;
    readonly filters: Schema<TFilters, TFilterContext>;
    readonly detail: RouteDetailOptions<RouteResourceKey<TResource>>;
    readonly pagination?: RoutePaginationCodec;
}): Readonly<{
    resource: TResource;
    collection: RouteCollection<TResource>;
    filterForm: FormController<FormSchema<Schema<TFilters, TFilterContext>, { [K_1 in keyof TFilters as TFilters[K_1] extends _uicogs_core.Field<unknown, unknown, unknown, unknown, true, boolean, boolean> ? K_1 : never]: TFilters[K_1] extends _uicogs_core.Field<unknown, infer T_1, unknown, unknown, boolean, boolean, boolean> ? T_1 : never; } & { [K_2 in keyof TFilters as TFilters[K_2] extends _uicogs_core.Field<unknown, unknown, unknown, unknown, false, boolean, boolean> ? K_2 : never]?: (TFilters[K_2] extends _uicogs_core.Field<unknown, infer T_1, unknown, unknown, boolean, boolean, boolean> ? T_1 : never) | undefined; } extends infer T ? { [K in keyof T]: T[K]; } : never>>;
    route: RouteState<TFilters, TFilterContext, Readonly<Record<never, never>>, unknown>;
    activeKey: vue.Ref<RouteResourceKey<TResource> | undefined, RouteResourceKey<TResource> | undefined>;
    activeObject: ComputedRef<{
        readonly value?: Readonly<Record<string, unknown>>;
        readonly loading: boolean;
        load(): Promise<unknown>;
    } | undefined>;
    open: (key: RouteResourceKey<TResource> | undefined) => Promise<void>;
    close: () => Promise<void>;
}>;

declare function vueReactive<T extends ExternalStore<object>>(controller: T): T;
interface WithVueOptions {
    readonly onDenied?: (input: {
        readonly route: ResolvedRouteEntry<unknown, object>;
        readonly location: RouteLocation;
    }) => string | false | void;
}
interface VueRouteRuntime<TIcon = unknown> {
    readonly registry: RouteRegistry<unknown, TIcon, object>;
    navigationTree(placement: string): ComputedRef<readonly ResolvedNavigationNode<TIcon>[]>;
    breadcrumbs(): ComputedRef<readonly Breadcrumb<TIcon>[]>;
    hasPermission(path: string): ComputedRef<boolean>;
}
interface VueRuntimeSource extends Record<never, never> {
    readonly ready: Promise<void>;
    readonly routes: RouteRegistry<unknown, unknown, Record<never, never>>;
    readonly context: ExternalStore<object>;
    readonly live: ExternalStore<object>;
    readonly auth?: RuntimeAuthController;
    bindControllerAdapter(adapter: ControllerAdapter): void;
}
type VueBoundUiCogs<T extends VueRuntimeSource> = Omit<T, "routes" | "context" | "live" | "auth"> & {
    readonly core: T;
    readonly routes: VueRouteRuntime;
    readonly context: T["context"];
    readonly live: T["live"];
    readonly auth: T["auth"];
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
/** Compiles the UiCogs route tree into standard nested Vue Router records. */
declare function toRoutes(registry: RouteRegistry<unknown, unknown, object>): readonly RouteRecordRaw[];
declare function useUcController<T extends ExternalStore<object>>(controller: T): T;
declare const useUcResource: typeof useUcController;
declare const useUcObject: typeof useUcController;
declare const useUcCollection: typeof useUcController;
declare const useUcForm: typeof useUcController;
declare const useUcAction: typeof useUcController;
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
    mode: ComputedRef<"list" | "detail" | "create">;
    open(key: TKey): void;
    create(): void;
    close(): void;
}>;

export { type RendererRegistry, type RouteCollection, type RouteCollectionMetadata, type RouteCollectionSource, type RouteDetailOptions, type RoutePaginationCodec, type RouteResourceSource, type RouteState, type RouteStateOptions, type RouteStateUpdate, type UcFieldModel, type UcResourceModel, type UcTableColumnModel, type VueBoundUiCogs, type VueRouteRuntime, type VueUiCogsBinding, type WithVueOptions, createRendererRegistry, standardRoutePagination, toRoutes, useRouteCollection, useRouteForm, useRouteResource, useRouteState, useUcAction, useUcCollection, useUcController, useUcForm, useUcFormModel, useUcObject, useUcResource, useUcResourceView, useUcSnapshot, useUcTableModel, useUiCogs, vueReactive, withVue };
```
