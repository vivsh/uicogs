# @uicogs/vue API

Declaration SHA-256: `ec53667a8e12ddbd708e44fed39c61baaa14c78d47f2798dd3f97b7141d4d7d9`

```ts
// index.d.ts
import * as _vue_reactivity from '@vue/reactivity';
import * as _uicogs_core from '@uicogs/core';
import { Descriptor, EntityKey, ExternalStore, AuthStrategyDefinition, ResourceDefinitionIdentity, CogsOptions, FormSchema, FormCompatibleSchema, FormController, Schema, Shape } from '@uicogs/core';
export * from '@uicogs/core';
import { Plugin, ComputedRef, Ref, ShallowRef } from 'vue';

interface BoundUiCogs<T> {
    readonly UiCogsPlugin: Plugin;
    useUiCogs(): T;
}
declare function bindUiCogs<T extends object>(runtime: T): BoundUiCogs<T>;
declare function vueReactive<T extends ExternalStore<object>>(controller: T): T;
type VueUiCogsOptions<TApplicationContext, TAuth extends AuthStrategyDefinition | undefined, TResources extends readonly ResourceDefinitionIdentity[]> = Omit<CogsOptions<TApplicationContext, TAuth, TResources>, "adapter">;
declare function createUiCogs<TApplicationContext = undefined, TEvents extends object = Readonly<Record<never, never>>, TAuth extends AuthStrategyDefinition | undefined = undefined, const TResources extends readonly ResourceDefinitionIdentity[] = readonly ResourceDefinitionIdentity[]>(options: VueUiCogsOptions<TApplicationContext, TAuth, TResources>): _uicogs_core.Cogs<TApplicationContext, TEvents, TAuth, TResources>;
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

export { type BoundUiCogs, type RendererRegistry, type UcFieldModel, type UcResourceModel, type UcTableColumnModel, bindUiCogs, createRendererRegistry, createUiCogs, useUcAction, useUcCollection, useUcController, useUcForm, useUcFormModel, useUcObject, useUcResource, useUcResourceView, useUcSnapshot, useUcTableModel, vueReactive };
```
