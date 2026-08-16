# @uicogs/quasar API

Declaration SHA-256: `396ddddfae08dff90969e6c04b1a6cca2597462d0974ce6ca187183d5aeb2d57`

```ts
// index.d.ts
import * as vue from 'vue';
import { PropType, App } from 'vue';
import * as _uicogs_vue from '@uicogs/vue';
import { UiCogsNavigationNode } from '@uicogs/vue';
import { UiNotification, UiNotificationAction, NotificationController, AlertController, EditorResize, Descriptor, Field, FormController, FormSchema, FormCompatibleSchema, ExternalStore, FormProgress, FieldLayout, ResponsiveFieldLayout, ResourceActionResolveOptions, ResourceActionDescriptor } from '@uicogs/core';
import { QEditor, QDialogOptions, QNotifyCreateOptions, QBtnProps } from 'quasar';
import { RouteLocationRaw } from 'vue-router';

/** A small, accessible indicator rendered beside a generated navigation node. */
interface UcNavigationBadge {
    readonly value: string | number;
    readonly label: string;
}
/** Navigation badges keyed by UiCogs navigation node id. */
type UcNavigationBadges = Readonly<Record<string, UcNavigationBadge | undefined>>;
/** Renders a scoped UiCogs navigation tree with optional application-provided badges. */
declare const UcNavigationTree: vue.DefineComponent<vue.ExtractPropTypes<{
    nodes: {
        type: PropType<readonly UiCogsNavigationNode[]>;
        required: true;
    };
    badges: {
        type: PropType<UcNavigationBadges>;
        default: () => {};
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, {}, string, vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    nodes: {
        type: PropType<readonly UiCogsNavigationNode[]>;
        required: true;
    };
    badges: {
        type: PropType<UcNavigationBadges>;
        default: () => {};
    };
}>> & Readonly<{}>, {
    badges: Readonly<Record<string, UcNavigationBadge | undefined>>;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

/** Semantic notification level. UiCogs supplies only class hooks; applications choose appearance. */
type UcNotificationLevel = "info" | "positive" | "warning" | "negative";
type UcNotificationDestination = Readonly<{
    readonly to: RouteLocationRaw;
    readonly href?: never;
}> | Readonly<{
    readonly href: string;
    readonly to?: never;
}> | Readonly<{
    readonly to?: undefined;
    readonly href?: undefined;
}>;
/** One native navigation or application-dispatched notification action. */
type UcNotificationAction = UiNotificationAction & UcNotificationDestination;
/** Presentation-ready notification data. Core live notifications are accepted unchanged. */
type UcNotification = Omit<UiNotification, "actions" | "createdAt"> & Readonly<{
    readonly createdAt?: string | Date;
    readonly actions?: readonly UcNotificationAction[];
}> & UcNotificationDestination;
interface UcNotificationActionEvent {
    readonly notification: UcNotification;
    readonly action: UcNotificationAction;
}
/** Renders a core live inbox by default, or explicit controlled data for alternate inboxes and Storybook. */
declare const UcNotificationList: vue.DefineComponent<vue.ExtractPropTypes<{
    items: PropType<readonly UcNotification[]>;
    source: PropType<NotificationController>;
    loading: {
        type: BooleanConstructor;
        default: boolean;
    };
    error: StringConstructor;
    emptyLabel: {
        type: StringConstructor;
        default: string;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}> | vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>[], {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, ("notification-open" | "notification-action" | "notification-mark-read" | "notification-dismiss" | "notifications-retry")[], "notification-open" | "notification-action" | "notification-mark-read" | "notification-dismiss" | "notifications-retry", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    items: PropType<readonly UcNotification[]>;
    source: PropType<NotificationController>;
    loading: {
        type: BooleanConstructor;
        default: boolean;
    };
    error: StringConstructor;
    emptyLabel: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{
    "onNotification-open"?: ((...args: any[]) => any) | undefined;
    "onNotification-action"?: ((...args: any[]) => any) | undefined;
    "onNotification-mark-read"?: ((...args: any[]) => any) | undefined;
    "onNotification-dismiss"?: ((...args: any[]) => any) | undefined;
    "onNotifications-retry"?: ((...args: any[]) => any) | undefined;
}>, {
    loading: boolean;
    emptyLabel: string;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

type UcAppBrandDestination = Readonly<{
    readonly to: RouteLocationRaw;
    readonly href?: never;
}> | Readonly<{
    readonly href: string;
    readonly to?: never;
}> | Readonly<{
    readonly to?: undefined;
    readonly href?: undefined;
}>;
/** The compact default brand rendered by UcAppLayout when no brand slot is supplied. */
type UcAppBrand = Readonly<{
    readonly label: string;
    readonly icon?: string;
}> & UcAppBrandDestination;
/** Safe presentation properties forwarded to one built-in UcAppLayout header button. */
interface UcAppLayoutActionProps {
    readonly flat?: boolean;
    readonly round?: boolean;
    readonly dense?: boolean;
    readonly size?: string;
    readonly color?: string;
    readonly icon?: string;
    readonly "aria-label"?: string;
}
/** A Quasar application shell composed from UiCogs navigation and its optional live inbox. */
declare const UcAppLayout: vue.DefineComponent<vue.ExtractPropTypes<{
    brand: PropType<UcAppBrand>;
    sidebarPlacement: {
        type: PropType<string | false>;
        default: string;
    };
    topbarPlacement: {
        type: PropType<string | false>;
        default: string;
    };
    drawerFooterPlacement: PropType<string | false | undefined>;
    navigationBadges: {
        type: PropType<UcNavigationBadges>;
        default: () => {};
    };
    navigationWidth: NumberConstructor;
    notificationsWidth: NumberConstructor;
    navigationToggleProps: PropType<UcAppLayoutActionProps>;
    notificationsToggleProps: PropType<UcAppLayoutActionProps>;
    navigationOpen: {
        type: BooleanConstructor;
        default: boolean;
    };
    notificationsOpen: {
        type: BooleanConstructor;
        default: boolean;
    };
    notifications: PropType<readonly UcNotification[]>;
    notificationsLoading: {
        type: BooleanConstructor;
        default: boolean;
    };
    notificationsError: StringConstructor;
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, ("notification-open" | "notification-action" | "notification-mark-read" | "notification-dismiss" | "notifications-retry" | "update:navigationOpen" | "update:notificationsOpen")[], "notification-open" | "notification-action" | "notification-mark-read" | "notification-dismiss" | "notifications-retry" | "update:navigationOpen" | "update:notificationsOpen", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    brand: PropType<UcAppBrand>;
    sidebarPlacement: {
        type: PropType<string | false>;
        default: string;
    };
    topbarPlacement: {
        type: PropType<string | false>;
        default: string;
    };
    drawerFooterPlacement: PropType<string | false | undefined>;
    navigationBadges: {
        type: PropType<UcNavigationBadges>;
        default: () => {};
    };
    navigationWidth: NumberConstructor;
    notificationsWidth: NumberConstructor;
    navigationToggleProps: PropType<UcAppLayoutActionProps>;
    notificationsToggleProps: PropType<UcAppLayoutActionProps>;
    navigationOpen: {
        type: BooleanConstructor;
        default: boolean;
    };
    notificationsOpen: {
        type: BooleanConstructor;
        default: boolean;
    };
    notifications: PropType<readonly UcNotification[]>;
    notificationsLoading: {
        type: BooleanConstructor;
        default: boolean;
    };
    notificationsError: StringConstructor;
}>> & Readonly<{
    "onNotification-open"?: ((...args: any[]) => any) | undefined;
    "onNotification-action"?: ((...args: any[]) => any) | undefined;
    "onNotification-mark-read"?: ((...args: any[]) => any) | undefined;
    "onNotification-dismiss"?: ((...args: any[]) => any) | undefined;
    "onNotifications-retry"?: ((...args: any[]) => any) | undefined;
    "onUpdate:navigationOpen"?: ((...args: any[]) => any) | undefined;
    "onUpdate:notificationsOpen"?: ((...args: any[]) => any) | undefined;
}>, {
    sidebarPlacement: string | false;
    topbarPlacement: string | false;
    navigationBadges: Readonly<Record<string, UcNavigationBadge | undefined>>;
    navigationOpen: boolean;
    notificationsOpen: boolean;
    notificationsLoading: boolean;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

/** Delivers each core live alert once through Quasar Notify. Mount it once outside UcAppLayout. */
declare const UcAlertHost: vue.DefineComponent<vue.ExtractPropTypes<{
    source: PropType<AlertController>;
}>, () => undefined, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, {}, string, vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    source: PropType<AlertController>;
}>> & Readonly<{}>, {}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

/** The supported presentation modes for generated HTML rich-text fields. */
type QuasarRichTextMode = "edit" | "source" | "preview";
/** One application-owned command rendered while a Quasar rich-text editor is editable. */
interface QuasarRichTextTool {
    readonly label: string;
    readonly tip?: string;
    readonly icon?: string;
    readonly run: (editor: QEditor) => void;
}
/** Quasar-specific rich-text options, including named toolbar tools and view modes. */
interface QuasarRichTextEditorOptions {
    /** Quasar command groups shown in WYSIWYG edit mode. */
    readonly toolbar?: readonly (readonly string[])[];
    /** Additional named QEditor commands. Tools run only in WYSIWYG edit mode. */
    readonly tools?: Readonly<Record<string, QuasarRichTextTool>>;
    /** Enabled views. Defaults to `edit` and `preview`. */
    readonly modes?: readonly QuasarRichTextMode[];
    /** Initially visible view. Defaults to `edit`. */
    readonly defaultMode?: QuasarRichTextMode;
    /** Approximate minimum number of editable text rows. */
    readonly rows?: number;
    /** Native drag direction for the editable content area. */
    readonly resize?: EditorResize;
}
/** Builds Quasar-aware editor descriptors without coupling UiCogs core to Quasar. */
declare const quasarEditor: Readonly<{
    RichText: (options?: QuasarRichTextEditorOptions) => Descriptor<"rich-text", QuasarRichTextEditorOptions>;
}>;

type UiClass = string | readonly string[];
type UiStyle = string | Readonly<Record<string, string | number>>;
/** The supported Quasar palette roles that UiCogs can scope to one Vue application. */
interface QuasarPalette {
    readonly primary?: string;
    readonly secondary?: string;
    readonly accent?: string;
    readonly dark?: string;
    readonly positive?: string;
    readonly negative?: string;
    readonly info?: string;
    readonly warning?: string;
}
/** Quasar-compatible classes and styles for a generated form root. */
interface FormSkin {
    readonly class?: UiClass;
    readonly style?: UiStyle;
}
/** Responsive Quasar layout defaults for generated forms or filters. */
interface UcSurfaceLayout {
    readonly mode?: "stack" | "grid";
    readonly gutter?: "none" | "xs" | "sm" | "md" | "lg" | "xl";
    /** Uses Quasar's compact field geometry; inline actions receive the matching height. */
    readonly dense?: boolean;
    /** Applies UiCogs' generated-control typography scale. */
    readonly size?: UcControlSize;
    readonly default?: ResponsiveFieldLayout;
    readonly kinds?: Readonly<Record<string, ResponsiveFieldLayout>>;
}
/** Supported visual scales for generated UiCogs Quasar controls. */
type UcControlSize = "sm" | "md";
/** Application-wide layout defaults for generated forms and filters. */
interface UiCogsQuasarLayout {
    readonly form?: UcSurfaceLayout;
    readonly filter?: UcSurfaceLayout;
}
/** The deliberately small set of common Quasar field appearance properties. */
interface FieldSkin {
    readonly outlined?: boolean;
    readonly filled?: boolean;
    readonly standout?: boolean;
    readonly borderless?: boolean;
    readonly dense?: boolean;
    /** Removes Quasar's empty hint/error reservation; validation messages may grow the field. */
    readonly hideBottomSpace?: boolean;
    readonly color?: string;
    readonly bgColor?: string;
    readonly labelColor?: string;
    readonly class?: UiClass;
    readonly style?: UiStyle;
}
/** Context passed once to a dynamic field skin resolver. */
interface FieldSkinContext {
    readonly name: string;
    readonly field: FieldSkinField;
    readonly form: FieldSkinForm;
}
/** Immutable core field definition exposed to a field-skin resolver. */
type FieldSkinField = Field<unknown, unknown, unknown, unknown, boolean, boolean, boolean>;
/** Core form controller projection exposed to a field-skin resolver. */
type FieldSkinForm = FormController<FormSchema<FormCompatibleSchema, unknown>>;
/** Resolves a complete field appearance from its immutable schema field and form state. */
type FieldSkinResolver = (context: FieldSkinContext) => FieldSkin;
/** Reusable application-level presentation defaults for UiCogs Quasar controls. */
interface UiCogsQuasarSkin {
    readonly palette?: QuasarPalette;
    readonly layout?: UiCogsQuasarLayout;
    readonly form?: FormSkin;
    readonly field?: FieldSkin | FieldSkinResolver;
}
/** Per-form skin overrides. Palette installation is intentionally application-scoped. */
interface UiCogsQuasarFormSkin {
    readonly form?: FormSkin;
    readonly field?: FieldSkin | FieldSkinResolver;
}
/** Controls where a generated form action row is placed. */
type UcFormActionLayout = "footer" | "inline";
/** Public Quasar button controls supported by UiCogs button primitives. */
type UcButtonProps = Pick<QBtnProps, "label" | "icon" | "iconRight" | "color" | "textColor" | "flat" | "outline" | "unelevated" | "round" | "rounded" | "square" | "dense" | "size" | "padding" | "fab" | "fabMini" | "loading" | "disable" | "type" | "noCaps" | "noWrap">;
/** Layout controls for a UiCogs action row. */
interface UcActionsProps {
    readonly inline?: boolean;
}
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
        readonly nullable?: boolean;
        readonly writeonly?: boolean;
        readonly layout?: FieldLayout;
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
        readonly name: string;
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
    actions?(options: ResourceActionResolveOptions<EntityKey>): readonly ResourceActionDescriptor<EntityKey>[];
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
    readonly classes?: UiClass;
    readonly headerClasses?: UiClass;
}
/** Creates an immutable, typed Quasar skin definition. */
declare function defineSkin(skin?: UiCogsQuasarSkin): UiCogsQuasarSkin;
/**
 * Provides one skin to a Vue application and scopes palette variables to its root element.
 * Call before mounting the application. The returned disposer restores the prior palette values.
 */
declare function injectSkin(app: App, skin: UiCogsQuasarSkin): () => void;
declare const quasarRenderers: _uicogs_vue.RendererRegistry<unknown, unknown>;
declare const UcForm: vue.DefineComponent<vue.ExtractPropTypes<{
    form: {
        type: PropType<FormLike>;
        required: true;
    };
    view: PropType<ViewLike>;
    skin: PropType<UiCogsQuasarFormSkin>;
    layout: PropType<UcSurfaceLayout>;
    actionLayout: {
        type: PropType<UcFormActionLayout>;
        default: string;
    };
    dense: {
        type: PropType<boolean | undefined>;
        default: undefined;
    };
    size: PropType<UcControlSize>;
    surface: {
        type: PropType<"form" | "filter">;
        default: string;
    };
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
    skin: PropType<UiCogsQuasarFormSkin>;
    layout: PropType<UcSurfaceLayout>;
    actionLayout: {
        type: PropType<UcFormActionLayout>;
        default: string;
    };
    dense: {
        type: PropType<boolean | undefined>;
        default: undefined;
    };
    size: PropType<UcControlSize>;
    surface: {
        type: PropType<"form" | "filter">;
        default: string;
    };
    failureMessage: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{
    onSuccess?: ((...args: any[]) => any) | undefined;
    onFailure?: ((...args: any[]) => any) | undefined;
}>, {
    dense: boolean | undefined;
    actionLayout: UcFormActionLayout;
    surface: "form" | "filter";
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
    color: {
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
    color: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{}>, {
    label: string;
    color: string;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;
/** Renders an application-owned Quasar button with a stable UiCogs class hook. */
declare const UcButton: vue.DefineComponent<vue.ExtractPropTypes<{
    label: (StringConstructor | NumberConstructor)[];
    icon: StringConstructor;
    iconRight: StringConstructor;
    color: StringConstructor;
    textColor: StringConstructor;
    flat: BooleanConstructor;
    outline: BooleanConstructor;
    unelevated: BooleanConstructor;
    round: BooleanConstructor;
    rounded: BooleanConstructor;
    square: BooleanConstructor;
    dense: {
        type: PropType<boolean | undefined>;
        default: undefined;
    };
    size: StringConstructor;
    padding: StringConstructor;
    fab: BooleanConstructor;
    fabMini: BooleanConstructor;
    loading: BooleanConstructor;
    disable: BooleanConstructor;
    type: StringConstructor;
    noCaps: BooleanConstructor;
    noWrap: BooleanConstructor;
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, {}, string, vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    label: (StringConstructor | NumberConstructor)[];
    icon: StringConstructor;
    iconRight: StringConstructor;
    color: StringConstructor;
    textColor: StringConstructor;
    flat: BooleanConstructor;
    outline: BooleanConstructor;
    unelevated: BooleanConstructor;
    round: BooleanConstructor;
    rounded: BooleanConstructor;
    square: BooleanConstructor;
    dense: {
        type: PropType<boolean | undefined>;
        default: undefined;
    };
    size: StringConstructor;
    padding: StringConstructor;
    fab: BooleanConstructor;
    fabMini: BooleanConstructor;
    loading: BooleanConstructor;
    disable: BooleanConstructor;
    type: StringConstructor;
    noCaps: BooleanConstructor;
    noWrap: BooleanConstructor;
}>> & Readonly<{}>, {
    flat: boolean;
    outline: boolean;
    unelevated: boolean;
    round: boolean;
    rounded: boolean;
    square: boolean;
    dense: boolean | undefined;
    fab: boolean;
    fabMini: boolean;
    loading: boolean;
    disable: boolean;
    noCaps: boolean;
    noWrap: boolean;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;
/** Groups UiCogs or application buttons with Quasar-native responsive action-row layout. */
declare const UcActions: vue.DefineComponent<vue.ExtractPropTypes<{
    inline: {
        type: PropType<UcActionsProps["inline"]>;
        default: boolean;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, {}, string, vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    inline: {
        type: PropType<UcActionsProps["inline"]>;
        default: boolean;
    };
}>> & Readonly<{}>, {
    inline: boolean | undefined;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;
declare const UcFilter: vue.DefineComponent<vue.ExtractPropTypes<{
    form: {
        type: PropType<FormLike>;
        required: true;
    };
    collection: PropType<CollectionLike>;
    layout: PropType<UcSurfaceLayout>;
    dense: {
        type: PropType<boolean | undefined>;
        default: undefined;
    };
    size: PropType<UcControlSize>;
    expanded: {
        type: PropType<boolean | undefined>;
        default: undefined;
    };
    defaultExpanded: {
        type: BooleanConstructor;
        default: boolean;
    };
    failureMessage: StringConstructor;
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, ("failure" | "load-failure" | "update:expanded")[], "failure" | "load-failure" | "update:expanded", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    form: {
        type: PropType<FormLike>;
        required: true;
    };
    collection: PropType<CollectionLike>;
    layout: PropType<UcSurfaceLayout>;
    dense: {
        type: PropType<boolean | undefined>;
        default: undefined;
    };
    size: PropType<UcControlSize>;
    expanded: {
        type: PropType<boolean | undefined>;
        default: undefined;
    };
    defaultExpanded: {
        type: BooleanConstructor;
        default: boolean;
    };
    failureMessage: StringConstructor;
}>> & Readonly<{
    onFailure?: ((...args: any[]) => any) | undefined;
    "onLoad-failure"?: ((...args: any[]) => any) | undefined;
    "onUpdate:expanded"?: ((...args: any[]) => any) | undefined;
}>, {
    dense: boolean | undefined;
    expanded: boolean | undefined;
    defaultExpanded: boolean;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;
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
    padding: boolean;
    loading: boolean;
    mode: "stack" | "auto" | "split" | "dialog";
    aside: boolean;
    asideWidth: string;
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
    onSelect?: ((...args: any[]) => any) | undefined;
    onFailure?: ((...args: any[]) => any) | undefined;
    "onUpdate:selectedKeys"?: ((...args: any[]) => any) | undefined;
    onLoaded?: ((...args: any[]) => any) | undefined;
}>, {
    selectedKeys: readonly EntityKey[];
    selection: "none" | "multiple" | "single";
    serial: boolean;
    infinite: boolean;
    noPagination: boolean;
    autoLoad: boolean;
    pageSize: number;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;
/** The semantic state shown in a resource view's active aside. */
type UcResourceViewAsideMode = "create" | "detail";
/** Bindings provided to an application-owned `aside-header` slot. */
interface UcResourceViewAsideHeaderContext {
    readonly mode: UcResourceViewAsideMode;
    readonly caption: string;
    close(): void;
}
declare const UcResourceView: vue.DefineComponent<vue.ExtractPropTypes<{
    resource: {
        type: PropType<ResourceLike>;
        required: true;
    };
    collection: PropType<TableCollectionLike>;
    title: StringConstructor;
    modelValue: PropType<EntityKey | undefined>;
    creating: {
        type: PropType<boolean | undefined>;
        default: undefined;
    };
    selectedKeys: {
        type: PropType<readonly EntityKey[]>;
        default: () => never[];
    };
    selection: {
        type: PropType<"none" | "single" | "multiple">;
        default: string;
    };
    columns: PropType<readonly UcResourceColumn[]>;
    display: {
        type: PropType<"table" | "list">;
        default: string;
    };
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
    asideCaption: StringConstructor;
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
    objectActions: {
        type: PropType<boolean | readonly string[]>;
        default: boolean;
    };
    failureMessage: StringConstructor;
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, ("create" | "update:modelValue" | "select" | "failure" | "view" | "update:selectedKeys" | "loaded" | "update:creating" | "object-action" | "object-action-success" | "object-action-failure" | "object-action-cancel")[], "create" | "update:modelValue" | "select" | "failure" | "view" | "update:selectedKeys" | "loaded" | "update:creating" | "object-action" | "object-action-success" | "object-action-failure" | "object-action-cancel", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    resource: {
        type: PropType<ResourceLike>;
        required: true;
    };
    collection: PropType<TableCollectionLike>;
    title: StringConstructor;
    modelValue: PropType<EntityKey | undefined>;
    creating: {
        type: PropType<boolean | undefined>;
        default: undefined;
    };
    selectedKeys: {
        type: PropType<readonly EntityKey[]>;
        default: () => never[];
    };
    selection: {
        type: PropType<"none" | "single" | "multiple">;
        default: string;
    };
    columns: PropType<readonly UcResourceColumn[]>;
    display: {
        type: PropType<"table" | "list">;
        default: string;
    };
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
    asideCaption: StringConstructor;
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
    objectActions: {
        type: PropType<boolean | readonly string[]>;
        default: boolean;
    };
    failureMessage: StringConstructor;
}>> & Readonly<{
    "onUpdate:modelValue"?: ((...args: any[]) => any) | undefined;
    onSelect?: ((...args: any[]) => any) | undefined;
    onFailure?: ((...args: any[]) => any) | undefined;
    "onUpdate:selectedKeys"?: ((...args: any[]) => any) | undefined;
    onLoaded?: ((...args: any[]) => any) | undefined;
    onCreate?: ((...args: any[]) => any) | undefined;
    onView?: ((...args: any[]) => any) | undefined;
    "onUpdate:creating"?: ((...args: any[]) => any) | undefined;
    "onObject-action"?: ((...args: any[]) => any) | undefined;
    "onObject-action-success"?: ((...args: any[]) => any) | undefined;
    "onObject-action-failure"?: ((...args: any[]) => any) | undefined;
    "onObject-action-cancel"?: ((...args: any[]) => any) | undefined;
}>, {
    create: boolean;
    mode: "stack" | "auto" | "split" | "dialog";
    asideWidth: string;
    selectedKeys: readonly EntityKey[];
    selection: "none" | "multiple" | "single";
    autoLoad: boolean;
    creating: boolean | undefined;
    display: "table" | "list";
    emptyLabel: string;
    objectActions: boolean | readonly string[];
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;
declare const UcFormAction: vue.DefineComponent<vue.ExtractPropTypes<{
    label: {
        type: StringConstructor;
        default: string;
    };
    color: {
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
    color: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{}>, {
    label: string;
    color: string;
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
    color: StringConstructor;
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
    color: StringConstructor;
    flat: {
        type: BooleanConstructor;
        default: boolean;
    };
}>> & Readonly<{
    onCancel?: ((...args: any[]) => any) | undefined;
}>, {
    label: string;
    icon: string;
    flat: boolean;
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
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, ("cancel" | "success" | "failure" | "start")[], "cancel" | "success" | "failure" | "start", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
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
    onCancel?: ((...args: any[]) => any) | undefined;
    onSuccess?: ((...args: any[]) => any) | undefined;
    onFailure?: ((...args: any[]) => any) | undefined;
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
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, ("cancel" | "success" | "failure")[], "cancel" | "success" | "failure", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
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
    onCancel?: ((...args: any[]) => any) | undefined;
    onSuccess?: ((...args: any[]) => any) | undefined;
    onFailure?: ((...args: any[]) => any) | undefined;
}>, {
    label: string;
    flat: boolean;
    disable: boolean;
    confirmMessage: string;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

export { type FieldSkin, type FieldSkinContext, type FieldSkinField, type FieldSkinForm, type FieldSkinResolver, type FormSkin, type QuasarPalette, type QuasarRichTextEditorOptions, type QuasarRichTextMode, type QuasarRichTextTool, UcAction, UcActions, type UcActionsProps, UcAlert, UcAlertFailure, UcAlertHost, UcAlertSuccess, type UcAppBrand, UcAppLayout, type UcAppLayoutActionProps, UcButton, type UcButtonProps, UcCancel, UcConfirm, type UcControlSize, UcDelete, UcField, UcFilter, UcForm, UcFormAction, type UcFormActionLayout, type UcNavigationBadge, type UcNavigationBadges, UcNavigationTree, type UcNotification, type UcNotificationAction, type UcNotificationActionEvent, type UcNotificationLevel, UcNotificationList, type UcResourceColumn, UcResourceView, type UcResourceViewAsideHeaderContext, type UcResourceViewAsideMode, UcSubmit, type UcSurfaceLayout, UcTable, UcView, type UiCogsQuasarFormSkin, type UiCogsQuasarLayout, type UiCogsQuasarSkin, defineSkin, injectSkin, quasarEditor, quasarRenderers };

// stylebook.d.ts
import { VueRouteIntegration } from '@uicogs/vue';
import { Component } from 'vue';

/** One optional application-owned page exposed from the fixture-only UiCogs stylebook. */
interface UcStylebookEntry<TFixture = undefined> {
    /** Stable URL segment below the configured stylebook path. */
    readonly id: string;
    /** Accessible label used in the stylebook navigation. */
    readonly label?: string;
    /** A local Vue component rendered only by the opt-in stylebook route. */
    readonly component: Component;
    /**
     * Application-owned fixture input passed to the component as its
     * `fixture` property. It must contain local sample data only.
     */
    readonly fixture?: TFixture;
}
/** Options for the opt-in, fixture-only UiCogs Quasar stylebook route. */
interface UcStylebookOptions {
    /** Disables route registration when false. This makes production omission explicit. */
    readonly enabled?: boolean;
    /** Absolute route prefix. Defaults to `/__stylebook`. */
    readonly path?: string;
    /** Optional application-owned fixture pages placed after the built-in overview. */
    readonly components?: readonly UcStylebookEntry<unknown>[];
}
/**
 * Creates a Vue Router integration for a local, fixture-only Quasar component stylebook.
 * It performs no network, storage, resource, service, notification, or application-runtime work.
 */
declare function stylebook(options?: UcStylebookOptions): VueRouteIntegration;

export { type UcStylebookEntry, type UcStylebookOptions, stylebook };
```
