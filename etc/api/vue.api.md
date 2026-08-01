# @uicogs/vue API

Declaration SHA-256: `1c755fd9c82de271b1c6a2e42fa5c7d4df3b2ac2080130ce06bc96d8d601f48e`

```ts
// index.d.ts
import * as _vue_reactivity from '@vue/reactivity';
import * as _uicogs_core from '@uicogs/core';
import { Descriptor, EntityKey, ExternalStore, RuntimeAuthController, ControllerAdapter, FormSchema, FormCompatibleSchema, FormController, Schema, Shape } from '@uicogs/core';
export * from '@uicogs/core';
import { RouteRegistry, ResolvedNavigationNode, Breadcrumb, RouteEntry, RouteLocation } from '@uicogs/routes';
import { ComputedRef, Plugin, Ref, ShallowRef } from 'vue';
import { RouteRecordRaw } from 'vue-router';

declare function vueReactive<T extends ExternalStore<object>>(controller: T): T;
interface WithVueOptions {
    readonly onDenied?: (input: {
        readonly route: RouteEntry<unknown, object>;
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
/** Compiles UiCogs route entries into standard Vue Router records. */
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

export { type RendererRegistry, type UcFieldModel, type UcResourceModel, type UcTableColumnModel, type VueBoundUiCogs, type VueRouteRuntime, type VueUiCogsBinding, type WithVueOptions, createRendererRegistry, toRoutes, useUcAction, useUcCollection, useUcController, useUcForm, useUcFormModel, useUcObject, useUcResource, useUcResourceView, useUcSnapshot, useUcTableModel, useUiCogs, vueReactive, withVue };
```
