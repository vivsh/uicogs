# @uicogs/quasar API

Declaration SHA-256: `de6f087c2922d4579f709cb72b3218dd8aac50d61daeef3ac02e524042b800c8`

```ts
// index.d.ts
import * as vue from 'vue';
import { PropType } from 'vue';
import * as _uicogs_vue from '@uicogs/vue';
import { ExternalStore, FormProgress, Descriptor } from '@uicogs/core';
import { QDialogOptions, QNotifyCreateOptions } from 'quasar';

interface FormLike extends ExternalStore<object> {
    readonly schema: {
        readonly fields: {
            readonly shape: Readonly<Record<string, FieldLike>>;
        };
    };
    readonly values: Readonly<Record<string, unknown>>;
    readonly validating: boolean;
    readonly submitting: boolean;
    readonly progress: FormProgress;
    readonly unboundIssues: readonly IssueLike[];
    readonly issues: readonly {
        readonly path: readonly (string | number)[];
        readonly message: string;
    }[];
    set(name: string, value: unknown): void;
    field(name: string): Readonly<Record<string, unknown>>;
    submit(): Promise<unknown>;
}
/** Immutable field projection used only to choose automatically rendered controls or columns. */
interface ViewLike {
    readonly shape: Readonly<Record<string, unknown>>;
}
interface IssueLike {
    readonly path: readonly (string | number)[];
    readonly message: string;
}
interface FieldLike {
    readonly options?: Readonly<{
        readonly kind?: string;
        readonly label?: string;
        readonly help?: string;
        readonly editor?: Descriptor;
        readonly format?: Descriptor;
        readonly sort?: string | Descriptor;
        readonly choices?: readonly Readonly<{
            label: string;
            value: unknown;
            disabled?: boolean;
        }>[] | (() => readonly Readonly<{
            label: string;
            value: unknown;
            disabled?: boolean;
        }>[]);
        readonly multiple?: boolean;
        readonly readonly?: boolean;
        readonly writeonly?: boolean;
    }>;
}
interface CollectionLike extends ExternalStore<object> {
    readonly values: readonly unknown[];
    readonly loading: boolean;
    load(): Promise<unknown>;
}
type EntityKey = string | number;
interface ResourceObjectLike extends ExternalStore<object> {
    readonly key: EntityKey;
    readonly value?: Readonly<Record<string, unknown>>;
    readonly loading: boolean;
    readonly error?: {
        readonly message?: string;
    };
    load(): Promise<unknown>;
    refresh(): Promise<unknown>;
    form?(schema: unknown): FormLike;
}
interface ResourceLike extends ExternalStore<object> {
    readonly definition: {
        readonly key: unknown;
        readonly schema: {
            readonly shape: Readonly<Record<string, unknown>>;
        };
    };
    readonly loading: boolean;
    readonly error?: {
        readonly message?: string;
    };
    readonly pageInfo?: unknown;
    all(): readonly object[];
    load(): Promise<unknown>;
    refresh(): Promise<unknown>;
    page(index: number, size?: number): ResourceLike;
    sort(field?: string, descending?: boolean): ResourceLike;
    nextPage(): ResourceLike;
    hasMore(): boolean;
    form?(schema: unknown, initial?: Readonly<Record<string, unknown>>): FormLike;
    get(...args: never[]): ResourceObjectLike;
}
interface TableCollectionLike extends ExternalStore<object> {
    readonly resource: ResourceLike["definition"];
    readonly loading: boolean;
    readonly error?: {
        readonly message?: string;
    };
    readonly pageInfo?: unknown;
    all(): readonly object[];
    load(): Promise<unknown>;
    refresh(): Promise<unknown>;
    page(index: number, size?: number): TableCollectionLike | Promise<void>;
    sort(field?: string, descending?: boolean): TableCollectionLike | Promise<void>;
    nextPage(): TableCollectionLike | Promise<void>;
    hasMore(): boolean;
}
interface ActionLike extends ExternalStore<object> {
    readonly loading: boolean;
    readonly progress: FormProgress;
    execute(): Promise<unknown>;
    cancel?(): void;
}
interface UcResourceColumn {
    readonly name: string;
    readonly label: string;
    readonly field: string | ((row: Readonly<Record<string, unknown>>) => unknown);
    readonly align?: "left" | "right" | "center";
    readonly sortable?: boolean;
    readonly format?: (value: unknown, row: Readonly<Record<string, unknown>>) => string;
}
declare const quasarRenderers: _uicogs_vue.RendererRegistry<unknown, unknown>;
declare const UcForm: vue.DefineComponent<vue.ExtractPropTypes<{
    form: {
        type: PropType<FormLike>;
        required: true;
    };
    view: PropType<ViewLike>;
    failureMessage: {
        type: StringConstructor;
        default: string;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, ("success" | "failure")[], "success" | "failure", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    form: {
        type: PropType<FormLike>;
        required: true;
    };
    view: PropType<ViewLike>;
    failureMessage: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{
    onSuccess?: ((...args: any[]) => any) | undefined;
    onFailure?: ((...args: any[]) => any) | undefined;
}>, {
    failureMessage: string;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;
declare const UcField: vue.DefineComponent<vue.ExtractPropTypes<{
    name: {
        type: StringConstructor;
        required: true;
    };
    kind: StringConstructor;
    options: PropType<readonly unknown[]>;
    label: StringConstructor;
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, {}, string, vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    name: {
        type: StringConstructor;
        required: true;
    };
    kind: StringConstructor;
    options: PropType<readonly unknown[]>;
    label: StringConstructor;
}>> & Readonly<{}>, {}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;
declare const UcSubmit: vue.DefineComponent<vue.ExtractPropTypes<{
    label: {
        type: StringConstructor;
        default: string;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, {}, string, vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    label: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{}>, {
    label: string;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;
declare const UcFilter: vue.DefineComponent<vue.ExtractPropTypes<{
    form: {
        type: PropType<FormLike>;
        required: true;
    };
    collection: PropType<CollectionLike>;
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, {}, string, vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    form: {
        type: PropType<FormLike>;
        required: true;
    };
    collection: PropType<CollectionLike>;
}>> & Readonly<{}>, {}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;
declare const UcView: vue.DefineComponent<vue.ExtractPropTypes<{
    title: StringConstructor;
    aside: {
        type: BooleanConstructor;
        default: boolean;
    };
    asideWidth: {
        type: StringConstructor;
        default: string;
    };
    mode: {
        type: PropType<"auto" | "split" | "stack" | "dialog">;
        default: string;
    };
    loading: {
        type: BooleanConstructor;
        default: boolean;
    };
    refresh: PropType<() => Promise<unknown>>;
    padding: {
        type: BooleanConstructor;
        default: boolean;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, ("cancel" | "update:aside" | "aside-hidden")[], "cancel" | "update:aside" | "aside-hidden", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    title: StringConstructor;
    aside: {
        type: BooleanConstructor;
        default: boolean;
    };
    asideWidth: {
        type: StringConstructor;
        default: string;
    };
    mode: {
        type: PropType<"auto" | "split" | "stack" | "dialog">;
        default: string;
    };
    loading: {
        type: BooleanConstructor;
        default: boolean;
    };
    refresh: PropType<() => Promise<unknown>>;
    padding: {
        type: BooleanConstructor;
        default: boolean;
    };
}>> & Readonly<{
    onCancel?: ((...args: any[]) => any) | undefined;
    "onUpdate:aside"?: ((...args: any[]) => any) | undefined;
    "onAside-hidden"?: ((...args: any[]) => any) | undefined;
}>, {
    mode: "split" | "dialog" | "auto" | "stack";
    aside: boolean;
    loading: boolean;
    asideWidth: string;
    padding: boolean;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;
declare const UcTable: vue.DefineComponent<vue.ExtractPropTypes<{
    resource: PropType<ResourceLike>;
    collection: PropType<TableCollectionLike>;
    view: PropType<ViewLike>;
    columns: PropType<readonly UcResourceColumn[]>;
    selectedKeys: {
        type: PropType<readonly EntityKey[]>;
        default: () => never[];
    };
    selection: {
        type: PropType<"none" | "single" | "multiple">;
        default: string;
    };
    serial: {
        type: BooleanConstructor;
        default: boolean;
    };
    infinite: {
        type: BooleanConstructor;
        default: boolean;
    };
    noPagination: {
        type: BooleanConstructor;
        default: boolean;
    };
    autoLoad: {
        type: BooleanConstructor;
        default: boolean;
    };
    pageSize: {
        type: NumberConstructor;
        default: number;
    };
    rowClass: PropType<(row: Readonly<Record<string, unknown>>) => string | readonly string[] | undefined>;
    aggregate: PropType<(rows: readonly Readonly<Record<string, unknown>>[]) => readonly Readonly<Record<string, unknown>>[]>;
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, ("select" | "failure" | "update:selectedKeys" | "loaded")[], "select" | "failure" | "update:selectedKeys" | "loaded", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    resource: PropType<ResourceLike>;
    collection: PropType<TableCollectionLike>;
    view: PropType<ViewLike>;
    columns: PropType<readonly UcResourceColumn[]>;
    selectedKeys: {
        type: PropType<readonly EntityKey[]>;
        default: () => never[];
    };
    selection: {
        type: PropType<"none" | "single" | "multiple">;
        default: string;
    };
    serial: {
        type: BooleanConstructor;
        default: boolean;
    };
    infinite: {
        type: BooleanConstructor;
        default: boolean;
    };
    noPagination: {
        type: BooleanConstructor;
        default: boolean;
    };
    autoLoad: {
        type: BooleanConstructor;
        default: boolean;
    };
    pageSize: {
        type: NumberConstructor;
        default: number;
    };
    rowClass: PropType<(row: Readonly<Record<string, unknown>>) => string | readonly string[] | undefined>;
    aggregate: PropType<(rows: readonly Readonly<Record<string, unknown>>[]) => readonly Readonly<Record<string, unknown>>[]>;
}>> & Readonly<{
    onFailure?: ((...args: any[]) => any) | undefined;
    onSelect?: ((...args: any[]) => any) | undefined;
    "onUpdate:selectedKeys"?: ((...args: any[]) => any) | undefined;
    onLoaded?: ((...args: any[]) => any) | undefined;
}>, {
    selectedKeys: readonly EntityKey[];
    selection: "multiple" | "none" | "single";
    serial: boolean;
    infinite: boolean;
    noPagination: boolean;
    autoLoad: boolean;
    pageSize: number;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;
declare const UcResourceView: vue.DefineComponent<vue.ExtractPropTypes<{
    resource: {
        type: PropType<ResourceLike>;
        required: true;
    };
    collection: PropType<TableCollectionLike>;
    title: StringConstructor;
    modelValue: PropType<EntityKey | undefined>;
    selectedKeys: {
        type: PropType<readonly EntityKey[]>;
        default: () => never[];
    };
    selection: {
        type: PropType<"none" | "single" | "multiple">;
        default: string;
    };
    columns: PropType<readonly UcResourceColumn[]>;
    autoLoad: {
        type: BooleanConstructor;
        default: boolean;
    };
    create: {
        type: BooleanConstructor;
        default: boolean;
    };
    asideWidth: {
        type: StringConstructor;
        default: string;
    };
    mode: {
        type: PropType<"auto" | "split" | "stack" | "dialog">;
        default: string;
    };
    emptyLabel: {
        type: StringConstructor;
        default: string;
    };
    createForm: ObjectConstructor;
    editForm: ObjectConstructor;
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, ("select" | "failure" | "view" | "update:selectedKeys" | "loaded" | "update:modelValue" | "create")[], "select" | "failure" | "view" | "update:selectedKeys" | "loaded" | "update:modelValue" | "create", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    resource: {
        type: PropType<ResourceLike>;
        required: true;
    };
    collection: PropType<TableCollectionLike>;
    title: StringConstructor;
    modelValue: PropType<EntityKey | undefined>;
    selectedKeys: {
        type: PropType<readonly EntityKey[]>;
        default: () => never[];
    };
    selection: {
        type: PropType<"none" | "single" | "multiple">;
        default: string;
    };
    columns: PropType<readonly UcResourceColumn[]>;
    autoLoad: {
        type: BooleanConstructor;
        default: boolean;
    };
    create: {
        type: BooleanConstructor;
        default: boolean;
    };
    asideWidth: {
        type: StringConstructor;
        default: string;
    };
    mode: {
        type: PropType<"auto" | "split" | "stack" | "dialog">;
        default: string;
    };
    emptyLabel: {
        type: StringConstructor;
        default: string;
    };
    createForm: ObjectConstructor;
    editForm: ObjectConstructor;
}>> & Readonly<{
    onFailure?: ((...args: any[]) => any) | undefined;
    onSelect?: ((...args: any[]) => any) | undefined;
    "onUpdate:modelValue"?: ((...args: any[]) => any) | undefined;
    "onUpdate:selectedKeys"?: ((...args: any[]) => any) | undefined;
    onLoaded?: ((...args: any[]) => any) | undefined;
    onView?: ((...args: any[]) => any) | undefined;
    onCreate?: ((...args: any[]) => any) | undefined;
}>, {
    mode: "split" | "dialog" | "auto" | "stack";
    asideWidth: string;
    selectedKeys: readonly EntityKey[];
    selection: "multiple" | "none" | "single";
    autoLoad: boolean;
    create: boolean;
    emptyLabel: string;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;
declare const UcFormAction: vue.DefineComponent<vue.ExtractPropTypes<{
    label: {
        type: StringConstructor;
        default: string;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, {}, string, vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    label: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{}>, {
    label: string;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;
declare function UcAlert(message: string, options?: QDialogOptions): Promise<boolean>;
declare function UcConfirm(message: string, options?: QDialogOptions): Promise<boolean>;
declare function UcAlertSuccess(message: string, options?: QNotifyCreateOptions): void;
declare function UcAlertFailure(message: string, options?: QNotifyCreateOptions): void;
declare const UcCancel: vue.DefineComponent<vue.ExtractPropTypes<{
    action: PropType<() => unknown>;
    label: {
        type: StringConstructor;
        default: string;
    };
    icon: {
        type: StringConstructor;
        default: string;
    };
    color: {
        type: StringConstructor;
        default: string;
    };
    flat: {
        type: BooleanConstructor;
        default: boolean;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, "cancel"[], "cancel", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    action: PropType<() => unknown>;
    label: {
        type: StringConstructor;
        default: string;
    };
    icon: {
        type: StringConstructor;
        default: string;
    };
    color: {
        type: StringConstructor;
        default: string;
    };
    flat: {
        type: BooleanConstructor;
        default: boolean;
    };
}>> & Readonly<{
    onCancel?: ((...args: any[]) => any) | undefined;
}>, {
    color: string;
    flat: boolean;
    label: string;
    icon: string;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;
declare const UcAction: vue.DefineComponent<vue.ExtractPropTypes<{
    action: {
        type: PropType<(() => unknown | Promise<unknown>) | ActionLike>;
        required: true;
    };
    label: {
        type: StringConstructor;
        required: true;
    };
    icon: StringConstructor;
    color: {
        type: StringConstructor;
        default: string;
    };
    textColor: StringConstructor;
    flat: {
        type: BooleanConstructor;
        default: boolean;
    };
    disable: {
        type: BooleanConstructor;
        default: boolean;
    };
    confirmMessage: StringConstructor;
    confirmOptions: PropType<QDialogOptions>;
    successMessage: StringConstructor;
    failureMessage: StringConstructor;
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, ("success" | "failure" | "cancel" | "start")[], "success" | "failure" | "cancel" | "start", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    action: {
        type: PropType<(() => unknown | Promise<unknown>) | ActionLike>;
        required: true;
    };
    label: {
        type: StringConstructor;
        required: true;
    };
    icon: StringConstructor;
    color: {
        type: StringConstructor;
        default: string;
    };
    textColor: StringConstructor;
    flat: {
        type: BooleanConstructor;
        default: boolean;
    };
    disable: {
        type: BooleanConstructor;
        default: boolean;
    };
    confirmMessage: StringConstructor;
    confirmOptions: PropType<QDialogOptions>;
    successMessage: StringConstructor;
    failureMessage: StringConstructor;
}>> & Readonly<{
    onSuccess?: ((...args: any[]) => any) | undefined;
    onFailure?: ((...args: any[]) => any) | undefined;
    onCancel?: ((...args: any[]) => any) | undefined;
    onStart?: ((...args: any[]) => any) | undefined;
}>, {
    color: string;
    flat: boolean;
    disable: boolean;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;
declare const UcDelete: vue.DefineComponent<vue.ExtractPropTypes<{
    action: {
        type: PropType<(() => unknown | Promise<unknown>) | ActionLike>;
        required: true;
    };
    label: {
        type: StringConstructor;
        default: string;
    };
    confirmMessage: {
        type: StringConstructor;
        default: string;
    };
    successMessage: StringConstructor;
    failureMessage: StringConstructor;
    flat: {
        type: BooleanConstructor;
        default: boolean;
    };
    disable: {
        type: BooleanConstructor;
        default: boolean;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, ("success" | "failure" | "cancel")[], "success" | "failure" | "cancel", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    action: {
        type: PropType<(() => unknown | Promise<unknown>) | ActionLike>;
        required: true;
    };
    label: {
        type: StringConstructor;
        default: string;
    };
    confirmMessage: {
        type: StringConstructor;
        default: string;
    };
    successMessage: StringConstructor;
    failureMessage: StringConstructor;
    flat: {
        type: BooleanConstructor;
        default: boolean;
    };
    disable: {
        type: BooleanConstructor;
        default: boolean;
    };
}>> & Readonly<{
    onSuccess?: ((...args: any[]) => any) | undefined;
    onFailure?: ((...args: any[]) => any) | undefined;
    onCancel?: ((...args: any[]) => any) | undefined;
}>, {
    flat: boolean;
    label: string;
    disable: boolean;
    confirmMessage: string;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

export { UcAction, UcAlert, UcAlertFailure, UcAlertSuccess, UcCancel, UcConfirm, UcDelete, UcField, UcFilter, UcForm, UcFormAction, type UcResourceColumn, UcResourceView, UcSubmit, UcTable, UcView, quasarRenderers };
```
