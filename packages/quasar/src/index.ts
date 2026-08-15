import {
  localFile,
  removedFile,
  type Descriptor,
  type ExternalStore,
  type Field,
  type FieldLayout,
  type FileValue,
  type FormCompatibleSchema,
  type FormController,
  type FormProgress,
  type FormSchema,
  type NormalizedFailure,
  type ResourceActionDescriptor,
  type ResourceActionResolveOptions,
  type ResponsiveFieldLayout,
} from "@uicogs/core";
import { createRendererRegistry, vueReactive } from "@uicogs/vue";
import {
  QBanner,
  QBtn,
  QCheckbox,
  QColor,
  QDate,
  QDialog,
  QEditor,
  QFile,
  QForm,
  QInnerLoading,
  QInput,
  QItem,
  QList,
  QLinearProgress,
  QPage,
  QPageSticky,
  QPullToRefresh,
  QSelect,
  QTable,
  QTd,
  QTime,
  QToggle,
  QTr,
  Dialog,
  Notify,
  type QDialogOptions,
  type QNotifyCreateOptions,
} from "quasar";
import {
  computed,
  defineComponent,
  getCurrentInstance,
  h,
  inject,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  shallowRef,
  watch,
  type App,
  type InjectionKey,
  type PropType,
} from "vue";

export * from "./app-layout.js";
export * from "./alert-host.js";
export * from "./navigation.js";
export * from "./notifications.js";

type UiClass = string | readonly string[];
type UiStyle = string | Readonly<Record<string, string | number>>;

/** The supported Quasar palette roles that UiCogs can scope to one Vue application. */
export interface QuasarPalette {
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
export interface FormSkin {
  readonly class?: UiClass;
  readonly style?: UiStyle;
}

/** Responsive Quasar layout defaults for generated forms or filters. */
export interface UcSurfaceLayout {
  readonly mode?: "stack" | "grid";
  readonly gutter?: "none" | "xs" | "sm" | "md" | "lg" | "xl";
  readonly default?: ResponsiveFieldLayout;
  readonly kinds?: Readonly<Record<string, ResponsiveFieldLayout>>;
}

/** Application-wide layout defaults for generated forms and filters. */
export interface UiCogsQuasarLayout {
  readonly form?: UcSurfaceLayout;
  readonly filter?: UcSurfaceLayout;
}

/** The deliberately small set of common Quasar field appearance properties. */
export interface FieldSkin {
  readonly outlined?: boolean;
  readonly filled?: boolean;
  readonly standout?: boolean;
  readonly borderless?: boolean;
  readonly dense?: boolean;
  readonly color?: string;
  readonly bgColor?: string;
  readonly labelColor?: string;
  readonly class?: UiClass;
  readonly style?: UiStyle;
}

/** Context passed once to a dynamic field skin resolver. */
export interface FieldSkinContext {
  readonly name: string;
  readonly field: FieldSkinField;
  readonly form: FieldSkinForm;
}

/** Immutable core field definition exposed to a field-skin resolver. */
export type FieldSkinField = Field<unknown, unknown, unknown, unknown, boolean, boolean, boolean>;

/** Core form controller projection exposed to a field-skin resolver. */
export type FieldSkinForm = FormController<FormSchema<FormCompatibleSchema, unknown>>;

/** Resolves a complete field appearance from its immutable schema field and form state. */
export type FieldSkinResolver = (context: FieldSkinContext) => FieldSkin;

/** Reusable application-level presentation defaults for UiCogs Quasar controls. */
export interface UiCogsQuasarSkin {
  readonly palette?: QuasarPalette;
  readonly layout?: UiCogsQuasarLayout;
  readonly form?: FormSkin;
  readonly field?: FieldSkin | FieldSkinResolver;
}

/** Per-form skin overrides. Palette installation is intentionally application-scoped. */
export interface UiCogsQuasarFormSkin {
  readonly form?: FormSkin;
  readonly field?: FieldSkin | FieldSkinResolver;
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
    readonly choices?:
      | readonly Readonly<{ label: string; value: unknown; disabled?: boolean }>[]
      | (() => readonly Readonly<{ label: string; value: unknown; disabled?: boolean }>[]);
    readonly multiple?: boolean;
    readonly readonly?: boolean;
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
  readonly error?: { readonly message?: string };
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
  readonly error?: { readonly message?: string };
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
  actions?(
    options: ResourceActionResolveOptions<EntityKey>,
  ): readonly ResourceActionDescriptor<EntityKey>[];
}

interface TableCollectionLike extends ExternalStore<object> {
  readonly resource: ResourceLike["definition"];
  readonly loading: boolean;
  readonly error?: { readonly message?: string };
  readonly pageInfo?: unknown;
  all(): readonly object[];
  load(): Promise<unknown>;
  refresh(): Promise<unknown>;
  page(index: number, size?: number): TableCollectionLike | Promise<void>;
  sort(field?: string, descending?: boolean): TableCollectionLike | Promise<void>;
  nextPage(): TableCollectionLike | Promise<void>;
  hasMore(): boolean;
}

type TableSource = ResourceLike | TableCollectionLike;

interface ActionLike extends ExternalStore<object> {
  readonly loading: boolean;
  readonly progress: FormProgress;
  execute(): Promise<unknown>;
  cancel?(): void;
}

export interface UcResourceColumn {
  readonly name: string;
  readonly label: string;
  readonly field: string | ((row: Readonly<Record<string, unknown>>) => unknown);
  readonly align?: "left" | "right" | "center";
  readonly sortable?: boolean;
  readonly format?: (value: unknown, row: Readonly<Record<string, unknown>>) => string;
  readonly classes?: UiClass;
  readonly headerClasses?: UiClass;
}

const formKey: InjectionKey<FormLike> = Symbol("uicogs-form");
const skinKey: InjectionKey<UiCogsQuasarSkin> = Symbol("uicogs-quasar-skin");
const formSkinKey: InjectionKey<() => UiCogsQuasarFormSkin | undefined> =
  Symbol("uicogs-quasar-form-skin");
const formLayoutKey: InjectionKey<() => ResolvedSurfaceLayout> = Symbol("uicogs-quasar-layout");
const paletteRoles: Readonly<Record<keyof QuasarPalette, string>> = Object.freeze({
  primary: "--q-primary",
  secondary: "--q-secondary",
  accent: "--q-accent",
  dark: "--q-dark",
  positive: "--q-positive",
  negative: "--q-negative",
  info: "--q-info",
  warning: "--q-warning",
});

/** Creates an immutable, typed Quasar skin definition. */
export function defineSkin(skin: UiCogsQuasarSkin = {}): UiCogsQuasarSkin {
  return Object.freeze({
    ...(skin.palette ? { palette: Object.freeze({ ...skin.palette }) } : {}),
    ...(skin.layout ? { layout: freezeQuasarLayout(skin.layout) } : {}),
    ...(skin.form ? { form: freezeFormSkin(skin.form) } : {}),
    ...(skin.field
      ? { field: typeof skin.field === "function" ? skin.field : freezeFieldSkin(skin.field) }
      : {}),
  });
}

/**
 * Provides one skin to a Vue application and scopes palette variables to its root element.
 * Call before mounting the application. The returned disposer restores the prior palette values.
 */
export function injectSkin(app: App, skin: UiCogsQuasarSkin): () => void {
  const definition = defineSkin(skin);
  app.provide(skinKey, definition);
  let restore: () => void = () => undefined;
  let active = true;
  app.mixin({
    mounted() {
      if (!active || this.$root !== this || !definition.palette) return;
      restore();
      restore = applyPalette(this.$el, definition.palette);
    },
    unmounted() {
      if (this.$root !== this) return;
      restore();
      restore = () => undefined;
    },
  });
  return () => {
    active = false;
    restore();
    restore = () => undefined;
  };
}

export const quasarRenderers = createRendererRegistry<unknown, unknown>();
quasarRenderers
  .registerEditor("text", QInput)
  .registerEditor("textarea", QInput)
  .registerEditor("rich-text", QEditor)
  .registerEditor("email", QInput)
  .registerEditor("password", QInput)
  .registerEditor("number", QInput)
  .registerEditor("checkbox", QCheckbox)
  .registerEditor("switch", QToggle)
  .registerEditor("select", QSelect)
  .registerEditor("autocomplete", QSelect)
  .registerEditor("date", QDate)
  .registerEditor("time", QTime)
  .registerEditor("datetime", QInput)
  .registerEditor("date-range", QDate)
  .registerEditor("reference", QSelect)
  .registerEditor("reference-list", QSelect)
  .registerEditor("file", QFile)
  .registerEditor("image", QFile)
  .registerEditor("color", QColor)
  .registerEditor("string-list", QSelect)
  .registerEditor("hidden", "input")
  .registerFormatter("text", formatText)
  .registerFormatter("boolean", formatBoolean)
  .registerFormatter("number", formatNumber)
  .registerFormatter("choice", formatText)
  .registerFormatter("choices", formatChoices)
  .registerFormatter("date", formatDate)
  .registerFormatter("time", formatDate)
  .registerFormatter("datetime", formatDate)
  .registerFormatter("date-range", formatDateRange)
  .registerFormatter("reference", formatReference)
  .registerFormatter("reference-list", formatChoices)
  .registerFormatter("image", formatImage)
  .registerFormatter("file", formatFile)
  .registerFormatter("link", formatLink);

export const UcForm = defineComponent({
  name: "UcForm",
  props: {
    form: { type: Object as PropType<FormLike>, required: true },
    view: Object as PropType<ViewLike>,
    skin: Object as PropType<UiCogsQuasarFormSkin>,
    layout: Object as PropType<UcSurfaceLayout>,
    surface: {
      type: String as PropType<"form" | "filter">,
      default: "form",
    },
    failureMessage: {
      type: String,
      default: "Form validation failed. Please check the error messages.",
    },
  },
  emits: ["success", "failure"],
  setup(props, { slots, emit }) {
    const form = vueReactive(props.form);
    const applicationSkin = inject(skinKey, undefined);
    provide(formKey, form);
    provide(formSkinKey, () => props.skin);
    const layout = computed(() =>
      resolveSurfaceLayout(
        props.surface === "filter" ? defaultFilterLayout : defaultFormLayout,
        applicationSkin?.layout?.[props.surface],
        props.layout,
      ),
    );
    provide(formLayoutKey, () => layout.value);
    return () => {
      const summary = [...form.unboundIssues, ...form.issues.filter((issue) => !issue.path.length)];
      const fields = slots.default?.() ?? [
        ...Object.keys(formView(form, props.view)).map((name) => h(UcField, { key: name, name })),
      ];
      const actionContext = Object.freeze({
        form,
        submitting: form.submitting,
        validating: form.validating,
      });
      const actions =
        slots.actions?.(actionContext) ??
        (slots.default ? undefined : h(UcSubmit, { key: "$submit" }));
      const children =
        layout.value.mode === "grid"
          ? h("div", { class: gridContainerClasses("uc-form__grid", layout.value) }, [
              ...fields,
              actions ? h("div", { class: "uc-form__actions col-12" }, actions) : undefined,
            ])
          : [...fields, actions];
      return h(
        QForm,
        {
          class: mergeClasses("uc-form", applicationSkin?.form?.class, props.skin?.form?.class),
          style: mergeStyles(applicationSkin?.form?.style, props.skin?.form?.style),
          onSubmit: async () => {
            try {
              const result = await form.submit();
              if (isSuccess(result)) {
                emit("success", result.value);
                return;
              }
              reportFormFailure(result, props.failureMessage, emit);
            } catch (failure) {
              reportFormFailure(failure, props.failureMessage, emit);
            }
          },
        },
        () => [
          summary.length
            ? h(QBanner, { class: "bg-negative text-white" }, () =>
                h(
                  "ul",
                  { class: "q-my-none" },
                  summary.map((issue) => h("li", issue.message)),
                ),
              )
            : undefined,
          children,
          form.progress.active
            ? h(QLinearProgress, {
                indeterminate: !form.progress.lengthComputable,
                value: form.progress.fraction ?? 0,
              })
            : undefined,
        ],
      );
    };
  },
});

export const UcField = defineComponent({
  name: "UcField",
  props: {
    name: { type: String, required: true },
    kind: String,
    options: Array as PropType<readonly unknown[]>,
    label: String,
  },
  setup(props) {
    const form = inject(formKey);
    if (!form) throw new Error("UcField must be rendered inside UcForm");
    const applicationSkin = inject(skinKey, undefined);
    const currentFormSkin = inject(formSkinKey, undefined);
    const currentFormLayout = inject(formLayoutKey, undefined);
    return () => {
      const field = form.schema.fields.shape[props.name];
      if (!field) throw new Error(`Field ${props.name} is not present in the form schema`);
      const descriptor = props.kind ? ({ kind: props.kind } as Descriptor) : field.options?.editor;
      const kind = descriptor?.kind ?? "text";
      const descriptorOptions = optionsFor(descriptor);
      const applicationAppearance = resolveFieldSkin(applicationSkin?.field, {
        name: props.name,
        field: field as FieldSkinField,
        form: form as unknown as FieldSkinForm,
      });
      const formAppearance = resolveFieldSkin(currentFormSkin?.()?.field, {
        name: props.name,
        field: field as FieldSkinField,
        form: form as unknown as FieldSkinForm,
      });
      const appearance = mergeFieldAppearance(
        applicationAppearance,
        formAppearance,
        descriptorOptions,
      );
      const component = quasarRenderers.editor(descriptor) ?? QInput;
      const issues = form.issues.filter((issue) => issue.path[0] === props.name);
      const value = form.values[props.name];
      const choices = props.options ?? fieldChoices(field);
      const fileKind = kind === "file" || kind === "image";
      const multiple = field.options?.multiple === true || field.options?.kind?.endsWith("-list");
      const modelValue = fileKind ? fileModel(value) : value;
      const inputType =
        kind === "email"
          ? "email"
          : kind === "password"
            ? "password"
            : kind === "number"
              ? "number"
              : kind === "textarea"
                ? "textarea"
                : undefined;
      const control = h(component as never, {
        ...appearance,
        modelValue,
        "onUpdate:modelValue": (next: unknown) =>
          form.set(props.name, fileKind ? toFileValue(next, Boolean(multiple)) : next),
        label: props.label ?? field.options?.label ?? labelFor(props.name),
        ...(field.options?.help ? { hint: field.options.help } : {}),
        ...(choices ? { options: choices } : {}),
        ...(choices
          ? { emitValue: true, mapOptions: true, optionLabel: "label", optionValue: "value" }
          : {}),
        multiple,
        ...(field.options?.readonly ? { readonly: true } : {}),
        ...(inputType ? { type: inputType } : {}),
        ...(kind === "textarea" && descriptorOptions.autogrow !== undefined
          ? { autogrow: descriptorOptions.autogrow }
          : {}),
        ...(kind === "date-range" ? { range: true } : {}),
        ...(kind === "image"
          ? { accept: "image/*" }
          : descriptorOptions.accept
            ? { accept: descriptorOptions.accept }
            : {}),
        error: issues.length > 0,
        ...(issues[0] ? { errorMessage: issues[0].message } : {}),
        class: mergeClasses(
          classValue(appearance.class),
          "uc-field",
          `uc-field-${cssPart(kind)}`,
          `uc-field-${cssPart(props.name)}`,
        ),
        style: styleValue(appearance.style),
      });
      const rendered = !fileKind
        ? control
        : h("div", { class: "uc-file-field" }, [
            control,
            ...fileValues(value)
              .filter((item) => item.kind === "remote")
              .map((item) =>
                h("div", { class: "row items-center q-gutter-sm", key: item.url }, [
                  h("a", { href: item.url, target: "_blank" }, item.name),
                  h(QBtn, {
                    flat: true,
                    round: true,
                    dense: true,
                    icon: "close",
                    title: `Remove ${item.name}`,
                    onClick: () =>
                      form.set(
                        props.name,
                        multiple
                          ? fileValues(value).map((current) =>
                              current === item ? removedFile() : current,
                            )
                          : removedFile(),
                      ),
                  }),
                ]),
              ),
          ]);
      const formLayout = currentFormLayout?.();
      if (!formLayout || formLayout.mode !== "grid") return rendered;
      const fieldLayout = resolveFieldLayout(field, kind, formLayout);
      return h("div", { class: mergeClasses("uc-form__field", gridCellClasses(fieldLayout)) }, [
        rendered,
      ]);
    };
  },
});

export const UcSubmit = defineComponent({
  name: "UcSubmit",
  props: { label: { type: String, default: "Submit" } },
  setup(props) {
    const form = inject(formKey);
    if (!form) throw new Error("UcSubmit must be rendered inside UcForm");
    return () =>
      h(QBtn, {
        type: "submit",
        label: props.label,
        loading: form.submitting,
        disable: form.validating,
      });
  },
});

export const UcFilter = defineComponent({
  name: "UcFilter",
  props: {
    form: { type: Object as PropType<FormLike>, required: true },
    collection: Object as PropType<CollectionLike>,
    layout: Object as PropType<UcSurfaceLayout>,
    expanded: { type: Boolean as PropType<boolean | undefined>, default: undefined },
    defaultExpanded: { type: Boolean, default: false },
    failureMessage: String,
  },
  emits: ["failure", "load-failure", "update:expanded"],
  setup(props, { slots, emit }) {
    const applicationSkin = inject(skinKey, undefined);
    const localExpanded = ref(props.defaultExpanded);
    const expanded = computed(() => props.expanded ?? localExpanded.value);
    const layout = computed(() =>
      resolveSurfaceLayout(defaultFilterLayout, applicationSkin?.layout?.filter, props.layout),
    );
    const entries = computed(() => Object.entries(props.form.schema.fields.shape));
    const collapsible = computed(() =>
      entries.value.filter(
        ([, field]) => field.options?.layout?.filter?.placement === "collapsible",
      ),
    );
    const staticFields = computed(() =>
      entries.value.filter(
        ([, field]) => field.options?.layout?.filter?.placement !== "collapsible",
      ),
    );
    const toggleExpanded = (): void => {
      const next = !expanded.value;
      if (props.expanded === undefined) localExpanded.value = next;
      emit("update:expanded", next);
    };
    const reload = async (): Promise<void> => {
      if (!props.collection) return;
      try {
        const result = await props.collection.load();
        if (isFailureResult(result)) reportLoadFailure(result.failure, props.failureMessage, emit);
      } catch (failure) {
        reportLoadFailure(failure, props.failureMessage, emit);
      }
    };
    const actionContext = () =>
      Object.freeze({
        form: props.form,
        submitting: props.form.submitting,
        validating: props.form.validating,
        expanded: expanded.value,
        hasCollapsible: collapsible.value.length > 0,
        toggleExpanded,
      });
    const generated = () => {
      const actions = slots.actions?.(actionContext()) ?? [
        h(UcSubmit, { label: "Apply" }),
        collapsible.value.length
          ? h(QBtn, {
              flat: true,
              label: expanded.value ? "Fewer filters" : "More filters",
              onClick: toggleExpanded,
            })
          : undefined,
      ];
      if (layout.value.mode !== "grid")
        return [
          ...staticFields.value.map(([name]) => h(UcField, { key: name, name })),
          ...(expanded.value
            ? collapsible.value.map(([name]) => h(UcField, { key: name, name }))
            : []),
          h("div", { class: "uc-filter__actions" }, actions),
        ];
      return [
        h("div", { class: mergeClasses("uc-filter__static", "col-12") }, [
          h("div", { class: gridContainerClasses(undefined, layout.value) }, [
            ...staticFields.value.map(([name]) => h(UcField, { key: name, name })),
            h("div", { class: "uc-filter__actions col-auto" }, actions),
          ]),
        ]),
        expanded.value && collapsible.value.length
          ? h("div", { class: mergeClasses("uc-filter__collapsible", "col-12") }, [
              h(
                "div",
                { class: gridContainerClasses(undefined, layout.value) },
                collapsible.value.map(([name]) => h(UcField, { key: name, name })),
              ),
            ])
          : undefined,
      ];
    };
    return () =>
      h(
        UcForm,
        {
          form: props.form,
          surface: "filter",
          layout: props.layout,
          ...(props.collection ? { onSuccess: reload } : {}),
          onFailure: (failure: unknown) => emit("failure", failure),
        },
        slots.default
          ? {
              default: slots.default,
              ...(slots.actions ? { actions: () => slots.actions?.(actionContext()) } : {}),
            }
          : { default: generated },
      );
  },
});

export const UcView = defineComponent({
  name: "UcView",
  inheritAttrs: false,
  props: {
    title: String,
    aside: { type: Boolean, default: false },
    asideWidth: { type: String, default: "24rem" },
    mode: {
      type: String as PropType<"auto" | "split" | "stack" | "dialog">,
      default: "auto",
    },
    loading: { type: Boolean, default: false },
    refresh: Function as PropType<() => Promise<unknown>>,
    padding: { type: Boolean, default: true },
  },
  emits: ["update:aside", "cancel", "aside-hidden"],
  setup(props, { attrs, slots, emit }) {
    const quasar = getCurrentInstance()?.proxy?.$q;
    const close = (): void => {
      emit("update:aside", false);
      emit("aside-hidden");
      emit("cancel");
    };
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && props.aside) close();
    };
    onMounted(() => document.addEventListener("keydown", onKeydown));
    onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));

    return () => {
      const hasAside = props.aside && Boolean(slots.aside);
      const stack = props.mode === "stack";
      const dialog =
        props.mode === "dialog" ||
        (props.mode === "auto" && Boolean(quasar?.screen.lt.md) && !stack);
      const body = h(
        "div",
        {
          class: ["uc-view__body", props.padding && "q-pa-md"],
          style: { flex: "1 1 auto", minWidth: 0 },
        },
        slots.default?.(),
      );
      const aside = hasAside
        ? h(
            "aside",
            {
              class: ["uc-view__aside", props.padding && "q-pa-md", dialog && "bg-white shadow-2"],
              style: dialog
                ? {
                    width: `min(${props.asideWidth}, calc(100vw - 32px))`,
                    maxWidth: "calc(100vw - 32px)",
                    maxHeight: "calc(100vh - 32px)",
                    overflow: "auto",
                  }
                : { flex: `0 0 ${props.asideWidth}`, minWidth: 0 },
            },
            slots.aside?.({ close }),
          )
        : undefined;
      const main = h(
        "div",
        {
          class: ["uc-view__content", hasAside && !dialog && !stack && "uc-view__content--split"],
          style: { display: "flex", alignItems: "stretch" },
        },
        stack && hasAside ? [aside] : [body, !dialog ? aside : undefined],
      );
      const content = h("div", { class: "uc-view" }, [
        props.title || slots.header
          ? h(
              "header",
              { class: "uc-view__header q-pa-md" },
              slots.header?.() ?? h("div", { class: "text-h5" }, props.title),
            )
          : undefined,
        main,
        dialog
          ? h(
              QDialog,
              {
                modelValue: hasAside,
                "onUpdate:modelValue": (open: boolean) => !open && close(),
              },
              () => h("div", { class: "uc-view__dialog" }, [aside]),
            )
          : undefined,
        h(QInnerLoading, { showing: props.loading }),
      ]);
      const refreshable = props.refresh
        ? h(
            QPullToRefresh,
            {
              onRefresh: (done: () => void) => {
                props.refresh?.().finally(done);
              },
            },
            () => content,
          )
        : content;
      return h(QPage, attrs, () => refreshable);
    };
  },
});

export const UcTable = defineComponent({
  name: "UcTable",
  inheritAttrs: false,
  props: {
    resource: Object as PropType<ResourceLike>,
    collection: Object as PropType<TableCollectionLike>,
    view: Object as PropType<ViewLike>,
    columns: Array as PropType<readonly UcResourceColumn[]>,
    selectedKeys: { type: Array as PropType<readonly EntityKey[]>, default: () => [] },
    selection: { type: String as PropType<"none" | "single" | "multiple">, default: "none" },
    serial: { type: Boolean, default: false },
    infinite: { type: Boolean, default: false },
    noPagination: { type: Boolean, default: false },
    autoLoad: { type: Boolean, default: false },
    pageSize: { type: Number, default: 25 },
    rowClass: Function as PropType<
      (row: Readonly<Record<string, unknown>>) => string | readonly string[] | undefined
    >,
    aggregate: Function as PropType<
      (
        rows: readonly Readonly<Record<string, unknown>>[],
      ) => readonly Readonly<Record<string, unknown>>[]
    >,
  },
  emits: ["update:selectedKeys", "select", "loaded", "failure"],
  setup(props, { attrs, slots, emit }) {
    useControlledSelectionWarning(() => props.selection);
    const source = tableSource(props.resource, props.collection);
    const collection = vueReactive(source);
    const definition = collectionDefinition(source, props.view);
    const rows = computed(() => collection.all().map(entityRecord));
    const selectedRows = computed(() => {
      const selected = new Set(props.selectedKeys);
      return rows.value.filter((row) => selected.has(keyFor(definition, row)));
    });
    const columns = computed(() => {
      const sourceColumns = (props.columns ?? columnsFor(definition)).map((column) => ({
        ...column,
        align: column.align ?? "left",
        classes: mergeClasses(column.classes, `uc-table-column-${cssPart(column.name)}`),
        headerClasses: mergeClasses(
          column.headerClasses,
          `uc-table-column-${cssPart(column.name)}`,
        ),
      }));
      return props.serial
        ? [
            {
              name: "$serial",
              label: "#",
              field: "$serial",
              align: "right" as const,
              classes: "uc-table-column-serial",
              headerClasses: "uc-table-column-serial",
            },
            ...sourceColumns,
          ]
        : sourceColumns;
    });
    const run = async (load: () => Promise<unknown>): Promise<void> => {
      try {
        const value = await load();
        emit("loaded", value);
      } catch (error) {
        emit("failure", error);
      }
    };
    const request = (details: {
      readonly pagination?: {
        readonly page?: number;
        readonly rowsPerPage?: number;
        readonly sortBy?: string;
        readonly descending?: boolean;
      };
    }): void => {
      const page = details.pagination;
      if (!page) return;
      void run(async () => {
        await collection.sort(page.sortBy, page.descending);
        if (page.page) await collection.page(page.page, page.rowsPerPage || props.pageSize);
        return collection.load();
      });
    };
    const scroll = (event: Event): void => {
      if (!props.infinite || collection.loading || !collection.hasMore()) return;
      const target = event.target as HTMLElement | null;
      if (!target || target.scrollTop + target.clientHeight + 24 < target.scrollHeight) return;
      void run(async () => {
        await collection.nextPage();
        return collection.load();
      });
    };
    onMounted(() => {
      if (props.autoLoad && !rows.value.length) void run(() => collection.load());
    });
    return () => {
      const page = pageInfo(collection.pageInfo, props.pageSize);
      const tableSlots = { ...slots } as Record<
        string,
        ((...args: unknown[]) => unknown) | undefined
      >;
      if (!slots.body) {
        tableSlots.body = (rowProps: unknown) => {
          const item = rowProps as {
            readonly row: Readonly<Record<string, unknown>>;
            readonly cols: readonly {
              readonly name: string;
              readonly value: unknown;
              readonly align?: string;
              readonly classes?: UiClass;
            }[];
            selected: boolean;
          };
          return h(
            QTr,
            {
              props: rowProps,
              class: mergeClasses("uc-table-row", props.rowClass?.(item.row)),
              onClick: () => emit("select", item.row),
            },
            () => [
              props.selection !== "none"
                ? h(QTd, { autoWidth: true }, () =>
                    h(QCheckbox, {
                      modelValue: item.selected,
                      "onUpdate:modelValue": (selected: boolean) => {
                        item.selected = selected;
                      },
                    }),
                  )
                : undefined,
              ...item.cols.map((column) =>
                h(
                  QTd,
                  {
                    props: rowProps,
                    key: column.name,
                    class: mergeClasses(column.classes, `uc-table-column-${cssPart(column.name)}`),
                  },
                  () =>
                    column.name === "$serial"
                      ? rows.value.indexOf(item.row) + 1
                      : renderField(definition, column.name, column.value, item.row),
                ),
              ),
            ],
          );
        };
      }
      if (props.aggregate && !slots["bottom-row"]) {
        tableSlots["bottom-row"] = () =>
          props.aggregate!(rows.value).map((aggregate, index) =>
            h(QTr, { key: index, class: "uc-table__aggregate" }, () =>
              columns.value.map((column) =>
                h(QTd, { key: column.name }, () => aggregate[column.name] as string | number),
              ),
            ),
          );
      }
      return h(
        QTable,
        {
          ...attrs,
          class: mergeClasses(
            classValue(attrs.class),
            "uc-table",
            `uc-table-${cssPart(definition.name)}`,
          ),
          rows: rows.value,
          columns: columns.value,
          rowKey: (row: Readonly<Record<string, unknown>>) => keyFor(definition, row),
          loading: collection.loading,
          selection: props.selection,
          selected: selectedRows.value,
          "onUpdate:selected": (selected: readonly Readonly<Record<string, unknown>>[]) =>
            emit(
              "update:selectedKeys",
              selected.map((row) => keyFor(definition, row)),
            ),
          pagination: page,
          "onUpdate:pagination": () => undefined,
          rowsPerPageOptions: Array.isArray(attrs.rowsPerPageOptions)
            ? attrs.rowsPerPageOptions
            : [page.rowsPerPage],
          hidePagination: props.noPagination || props.infinite,
          onRequest: request,
          onScroll: props.infinite ? scroll : undefined,
          style: props.infinite ? { maxHeight: "75vh", overflow: "auto" } : undefined,
        },
        tableSlots,
      );
    };
  },
});

export const UcResourceView = defineComponent({
  name: "UcResourceView",
  props: {
    resource: { type: Object as PropType<ResourceLike>, required: true },
    collection: Object as PropType<TableCollectionLike>,
    title: String,
    modelValue: [String, Number] as PropType<EntityKey | undefined>,
    selectedKeys: {
      type: Array as PropType<readonly EntityKey[]>,
      default: () => [],
    },
    selection: {
      type: String as PropType<"none" | "single" | "multiple">,
      default: "none",
    },
    columns: Array as PropType<readonly UcResourceColumn[]>,
    display: { type: String as PropType<"table" | "list">, default: "table" },
    autoLoad: { type: Boolean, default: true },
    create: { type: Boolean, default: true },
    asideWidth: { type: String, default: "32rem" },
    mode: {
      type: String as PropType<"auto" | "split" | "stack" | "dialog">,
      default: "auto",
    },
    emptyLabel: { type: String, default: "No records" },
    createForm: Object,
    editForm: Object,
    objectActions: {
      type: [Boolean, Array] as PropType<boolean | readonly string[]>,
      default: true,
    },
    failureMessage: String,
  },
  emits: [
    "update:modelValue",
    "update:selectedKeys",
    "select",
    "view",
    "create",
    "loaded",
    "failure",
    "object-action",
    "object-action-success",
    "object-action-failure",
    "object-action-cancel",
  ],
  setup(props, { slots, emit }) {
    useControlledSelectionWarning(() => props.selection);
    warnLegacyResourceViewSlots(slots);
    const resource = vueReactive(props.resource);
    const listCollection = vueReactive(props.collection ?? resource);
    const listDefinition = props.collection ? props.collection.resource : resource.definition;
    const active = shallowRef<ResourceObjectLike>();
    const createController = shallowRef<FormLike>();
    const editController = shallowRef<FormLike>();
    const creating = shallowRef(false);
    const rows = computed(() => listCollection.all().map(entityRecord));
    const columns = computed(() => props.columns ?? columnsFor(listDefinition));
    const selectedRows = computed(() => {
      const keys = new Set(props.selectedKeys);
      return rows.value.filter((row) => keys.has(keyFor(listDefinition, row)));
    });

    const run = async (operation: () => Promise<unknown>): Promise<void> => {
      try {
        const result = await operation();
        if (isFailureResult(result)) {
          reportFailure(result.failure, props.failureMessage, emit);
          return;
        }
        emit("loaded", result);
      } catch (failure) {
        reportFailure(failure, props.failureMessage, emit);
      }
    };
    const bind = (key: EntityKey | undefined): void => {
      if (key !== undefined && !creating.value && Object.is(active.value?.key, key)) return;
      creating.value = false;
      createController.value = undefined;
      active.value = key === undefined ? undefined : vueReactive(resourceObject(resource, key));
      editController.value =
        props.editForm && active.value?.form ? active.value.form(props.editForm) : undefined;
      if (props.autoLoad && active.value && !active.value.value)
        void run(() => active.value!.load());
      emit("view", key === undefined ? "list" : "detail");
    };
    const close = (): void => {
      creating.value = false;
      active.value = undefined;
      createController.value = undefined;
      editController.value = undefined;
      emit("update:modelValue", undefined);
      emit("view", "list");
    };
    const open = (row: Readonly<Record<string, unknown>>): void => {
      const key = keyFor(resource.definition, row);
      emit("select", row);
      emit("update:modelValue", key);
      bind(key);
    };
    const toggleSelected = (key: EntityKey): void => {
      if (props.selection === "none") return;
      const selected = new Set(props.selectedKeys);
      if (props.selection === "single") {
        emit("update:selectedKeys", selected.has(key) ? [] : [key]);
        return;
      }
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      emit("update:selectedKeys", Object.freeze([...selected]));
    };
    const startCreate = (): void => {
      emit("create");
      if (!slots.create && (!props.createForm || !resource.form)) return;
      creating.value = true;
      active.value = undefined;
      editController.value = undefined;
      createController.value =
        props.createForm && resource.form ? resource.form(props.createForm) : undefined;
      emit("view", "create");
    };

    watch(() => props.modelValue, bind, { immediate: true });
    onMounted(() => {
      if (props.autoLoad && !rows.value.length) void run(() => listCollection.load());
    });

    const listSlotProps = () =>
      Object.freeze({
        resource,
        collection: listCollection,
        rows: rows.value,
        open,
        create: startCreate,
        refresh: () => run(() => listCollection.refresh()),
        selectedKeys: props.selectedKeys,
        selectedRows: selectedRows.value,
      });

    const defaultListBody = () => {
      if (listCollection.error)
        return h(
          QBanner,
          { class: "bg-negative text-white" },
          {
            default: () => listCollection.error?.message ?? "Unable to load records",
            action: () =>
              h(QBtn, {
                flat: true,
                label: "Retry",
                onClick: () => run(() => listCollection.load()),
              }),
          },
        );
      if (!rows.value.length && !listCollection.loading)
        return h("div", { class: "uc-resource-view__empty q-pa-lg text-center" }, props.emptyLabel);
      if (props.display === "list")
        return h(QList, { class: "uc-resource-view__list" }, () =>
          rows.value.map((row) => {
            const key = keyFor(listDefinition, row);
            const selected = props.selectedKeys.includes(key);
            const item = slots["card-item"]?.({
              row,
              key,
              selected,
              open: () => open(row),
              toggleSelected: () => toggleSelected(key),
            });
            return (
              item ??
              h(QItem, { key, clickable: true, active: selected, onClick: () => open(row) }, () =>
                listLabel(row, key),
              )
            );
          }),
        );
      const tableProps = {
        columns: columns.value,
        selection: props.selection,
        selectedKeys: props.selectedKeys,
        "onUpdate:selectedKeys": (keys: readonly EntityKey[]) => emit("update:selectedKeys", keys),
        onSelect: open,
        onFailure: (failure: unknown) => reportFailure(failure, props.failureMessage, emit),
      };
      const tableSlots = slots["row-item"]
        ? {
            body: (rowProps: unknown) => {
              const item = rowProps as {
                readonly row: Readonly<Record<string, unknown>>;
                readonly selected: boolean;
              };
              const key = keyFor(listDefinition, item.row);
              return slots["row-item"]?.({
                row: item.row,
                key,
                columns: columns.value,
                selected: item.selected,
                open: () => open(item.row),
                toggleSelected: () => toggleSelected(key),
              });
            },
          }
        : undefined;
      return props.collection
        ? h(
            UcTable,
            { ...tableProps, collection: listCollection as TableCollectionLike },
            tableSlots,
          )
        : h(UcTable, { ...tableProps, resource }, tableSlots);
    };

    const resolvedObjectActions = (): readonly ResourceActionDescriptor<EntityKey>[] => {
      if (!active.value || props.objectActions === false || !resource.actions) return [];
      const actions = resource.actions({
        placement: editController.value ? "edit" : "aside",
        object: {
          key: active.value.key,
          ...(active.value.value ? { value: active.value.value } : {}),
        },
      });
      if (!Array.isArray(props.objectActions)) return actions;
      const selected = new Map(actions.map((action) => [action.name, action]));
      return props.objectActions.flatMap((name) => {
        const action = selected.get(name);
        return action ? [action] : [];
      });
    };

    const defaultObjectActions = (
      actions: readonly ResourceActionDescriptor<EntityKey>[],
    ): ReturnType<typeof h> | undefined => {
      if (!actions.length) return undefined;
      return h(
        "div",
        { class: "uc-resource-view__object-actions" },
        actions.map((action) =>
          action.requiresInput
            ? h(QBtn, {
                label: action.label,
                ...(action.icon === undefined ? {} : { icon: action.icon }),
                disable: action.disabled,
                onClick: () => emit("object-action", action),
              })
            : h(UcAction, {
                action: () => action.execute(undefined),
                label: action.label,
                ...(action.icon === undefined ? {} : { icon: action.icon }),
                disable: action.disabled,
                ...(action.confirmation === undefined
                  ? {}
                  : { confirmMessage: action.confirmation }),
                onSuccess: (value: unknown) => emit("object-action-success", { action, value }),
                onFailure: (failure: unknown) => emit("object-action-failure", { action, failure }),
                onCancel: () => emit("object-action-cancel", action),
              }),
        ),
      );
    };

    return () => {
      const aside = creating.value || Boolean(active.value);
      const list = slots.list?.(listSlotProps()) ?? [
        slots["before-list"]?.(listSlotProps()),
        slots["list-body"]?.(listSlotProps()) ?? defaultListBody(),
        slots["after-list"]?.(listSlotProps()),
      ];
      const hasListHeader =
        props.title ||
        slots.caption ||
        slots.tools ||
        slots.filters ||
        slots.header ||
        slots.actions;
      const listHeader = hasListHeader
        ? h("header", { class: "uc-resource-view__header" }, [
            slots.caption?.({ resource, rows: rows.value }) ??
              slots.header?.({ resource, rows: rows.value }) ??
              (props.title ? h("div", { class: "text-h5" }, props.title) : undefined),
            slots.tools?.(listSlotProps()) ??
              slots.actions?.({
                resource,
                rows: rows.value,
                selectedKeys: props.selectedKeys,
                selectedRows: selectedRows.value,
                create: startCreate,
                refresh: () => run(() => listCollection.refresh()),
              }),
            slots.filters?.({ resource, rows: rows.value }),
          ])
        : undefined;
      const actions = active.value ? resolvedObjectActions() : [];
      const detailActionSlot = active.value
        ? slots["detail-actions"]?.({
            resource,
            object: active.value,
            value: active.value.value,
            actions,
            close,
            refresh: () => run(() => active.value!.refresh()),
          })
        : undefined;
      const detail = creating.value
        ? (slots.create?.({
            resource,
            close,
            refresh: () => run(() => listCollection.refresh()),
          }) ??
          (createController.value
            ? h(UcForm, {
                form: createController.value,
                onSuccess: () => {
                  close();
                  void run(() => listCollection.refresh());
                },
                onFailure: (failure: unknown) => emit("failure", failure),
              })
            : undefined))
        : active.value
          ? [
              slots.detail?.({
                resource,
                object: active.value,
                value: active.value.value,
                close,
                refresh: () => run(() => active.value!.refresh()),
              }) ??
                (editController.value
                  ? h(UcForm, {
                      form: editController.value,
                      onSuccess: () => {
                        close();
                        void run(() => listCollection.refresh());
                      },
                      onFailure: (failure: unknown) => emit("failure", failure),
                    })
                  : defaultDetail(resource, active.value, columns.value, close)),
              detailActionSlot ?? defaultObjectActions(actions),
            ]
          : undefined;
      return h(
        UcView,
        {
          aside,
          asideWidth: props.asideWidth,
          mode: props.mode,
          loading: listCollection.loading,
          refresh: () => listCollection.refresh(),
          "onUpdate:aside": (open: boolean) => !open && close(),
        },
        {
          default: () => [
            listHeader,
            list,
            props.create
              ? h(QPageSticky, { position: "bottom-right", offset: [18, 18] }, () =>
                  h(QBtn, {
                    fab: true,
                    icon: "add",
                    color: "primary",
                    onClick: startCreate,
                  }),
                )
              : undefined,
          ],
          aside: () => detail,
        },
      );
    };
  },
});

export const UcFormAction = UcSubmit;

export function UcAlert(message: string, options: QDialogOptions = {}): Promise<boolean> {
  return dialogResult({ ...options, message });
}

export function UcConfirm(message: string, options: QDialogOptions = {}): Promise<boolean> {
  return dialogResult({
    title: "Confirmation",
    ...options,
    message,
    cancel: true,
    persistent: true,
  });
}

export function UcAlertSuccess(message: string, options: QNotifyCreateOptions = {}): void {
  Notify.create({ type: "positive", icon: "check_circle", closeBtn: true, ...options, message });
}

export function UcAlertFailure(message: string, options: QNotifyCreateOptions = {}): void {
  Notify.create({ type: "negative", closeBtn: true, ...options, message });
}

function freezeFormSkin(skin: FormSkin): FormSkin {
  return Object.freeze({
    ...(skin.class === undefined ? {} : { class: freezeClass(skin.class) }),
    ...(skin.style === undefined ? {} : { style: freezeStyle(skin.style) }),
  });
}

interface ResolvedSurfaceLayout {
  readonly surface: "form" | "filter";
  readonly mode: "stack" | "grid";
  readonly gutter: "none" | "xs" | "sm" | "md" | "lg" | "xl";
  readonly default: ResponsiveFieldLayout;
  readonly kinds: Readonly<Record<string, ResponsiveFieldLayout>>;
}

const defaultFormLayout: UcSurfaceLayout = Object.freeze({ mode: "stack" });
const defaultFilterLayout: UcSurfaceLayout = Object.freeze({
  mode: "grid",
  gutter: "sm",
  default: Object.freeze({ xs: 12, md: 4 }),
  kinds: Object.freeze({
    boolean: Object.freeze({ xs: "auto" }),
    textarea: Object.freeze({ xs: 12 }),
  }),
});

function freezeQuasarLayout(layout: UiCogsQuasarLayout): UiCogsQuasarLayout {
  return Object.freeze({
    ...(layout.form ? { form: freezeSurfaceLayout(layout.form) } : {}),
    ...(layout.filter ? { filter: freezeSurfaceLayout(layout.filter) } : {}),
  });
}

function freezeSurfaceLayout(layout: UcSurfaceLayout): UcSurfaceLayout {
  return Object.freeze({
    ...(layout.mode === undefined ? {} : { mode: layout.mode }),
    ...(layout.gutter === undefined ? {} : { gutter: layout.gutter }),
    ...(layout.default ? { default: Object.freeze({ ...layout.default }) } : {}),
    ...(layout.kinds
      ? {
          kinds: Object.freeze(
            Object.fromEntries(
              Object.entries(layout.kinds).map(([kind, value]) => [
                kind,
                Object.freeze({ ...value }),
              ]),
            ),
          ),
        }
      : {}),
  });
}

function resolveSurfaceLayout(
  fallback: UcSurfaceLayout,
  application: UcSurfaceLayout | undefined,
  local: UcSurfaceLayout | undefined,
  surface: "form" | "filter" = fallback === defaultFilterLayout ? "filter" : "form",
): ResolvedSurfaceLayout {
  const definitions = [fallback, application, local];
  const kinds = definitions.reduce<Readonly<Record<string, ResponsiveFieldLayout>>>(
    (current, definition) => ({ ...current, ...definition?.kinds }),
    {},
  );
  return Object.freeze({
    surface,
    mode: lastDefined(definitions.map((definition) => definition?.mode)) ?? "stack",
    gutter: lastDefined(definitions.map((definition) => definition?.gutter)) ?? "none",
    default: mergeResponsiveLayouts(...definitions.map((definition) => definition?.default)),
    kinds: Object.freeze(
      Object.fromEntries(
        Object.entries(kinds).map(([kind]) => [
          kind,
          mergeResponsiveLayouts(...definitions.map((definition) => definition?.kinds?.[kind])),
        ]),
      ),
    ),
  });
}

function lastDefined<T>(values: readonly (T | undefined)[]): T | undefined {
  return [...values].reverse().find((value) => value !== undefined);
}

function mergeResponsiveLayouts(
  ...layouts: readonly (ResponsiveFieldLayout | undefined)[]
): ResponsiveFieldLayout {
  return Object.freeze(Object.assign({}, ...layouts.filter((layout) => layout !== undefined)));
}

function resolveFieldLayout(
  field: FieldLike,
  kind: string,
  layout: ResolvedSurfaceLayout,
): ResponsiveFieldLayout {
  const fieldLayout = field.options?.layout?.[layout.surface];
  return mergeResponsiveLayouts({ xs: 12 }, layout.default, layout.kinds[kind], fieldLayout);
}

function gridContainerClasses(
  hook: string | undefined,
  layout: ResolvedSurfaceLayout,
): string | undefined {
  return mergeClasses(
    hook,
    "row",
    layout.gutter === "none" ? undefined : `q-col-gutter-${layout.gutter}`,
  );
}

function gridCellClasses(layout: ResponsiveFieldLayout): string | undefined {
  const columns = (["xs", "sm", "md", "lg", "xl"] as const).flatMap((breakpoint) => {
    const value = layout[breakpoint];
    return value === undefined ? [] : [`col-${breakpoint}-${value}`];
  });
  return mergeClasses(...columns);
}

function freezeFieldSkin(skin: FieldSkin): FieldSkin {
  return Object.freeze({
    ...(skin.outlined === undefined ? {} : { outlined: skin.outlined }),
    ...(skin.filled === undefined ? {} : { filled: skin.filled }),
    ...(skin.standout === undefined ? {} : { standout: skin.standout }),
    ...(skin.borderless === undefined ? {} : { borderless: skin.borderless }),
    ...(skin.dense === undefined ? {} : { dense: skin.dense }),
    ...(skin.color === undefined ? {} : { color: skin.color }),
    ...(skin.bgColor === undefined ? {} : { bgColor: skin.bgColor }),
    ...(skin.labelColor === undefined ? {} : { labelColor: skin.labelColor }),
    ...(skin.class === undefined ? {} : { class: freezeClass(skin.class) }),
    ...(skin.style === undefined ? {} : { style: freezeStyle(skin.style) }),
  });
}

function freezeClass(value: UiClass): UiClass {
  return Array.isArray(value) ? Object.freeze([...value]) : value;
}

function freezeStyle(value: UiStyle): UiStyle {
  return typeof value === "string" ? value : Object.freeze({ ...value });
}

function resolveFieldSkin(
  skin: FieldSkin | FieldSkinResolver | undefined,
  context: FieldSkinContext,
): FieldSkin | undefined {
  return typeof skin === "function" ? skin(context) : skin;
}

function mergeFieldAppearance(
  application: FieldSkin | undefined,
  form: FieldSkin | undefined,
  descriptor: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const output = { ...application, ...form, ...descriptor };
  return Object.freeze({
    ...output,
    class: mergeClasses(application?.class, form?.class, classValue(descriptor.class)),
    style: mergeStyles(application?.style, form?.style, styleValue(descriptor.style)),
  });
}

function mergeClasses(...values: readonly (UiClass | undefined)[]): string | undefined {
  const classes = values.flatMap((value) => {
    if (value === undefined) return [];
    return typeof value === "string" ? value.split(/\s+/) : value;
  });
  const unique = [...new Set(classes.filter(Boolean))];
  return unique.length ? unique.join(" ") : undefined;
}

function mergeStyles(...values: readonly (UiStyle | undefined)[]): UiStyle | undefined {
  const defined = values.filter((value): value is UiStyle => value !== undefined);
  if (!defined.length) return undefined;
  if (defined.some((value) => typeof value === "string")) return defined.join(";");
  return Object.freeze(Object.assign({}, ...defined));
}

function classValue(value: unknown): UiClass | undefined {
  const classes = classNames(value);
  return classes.length ? classes : undefined;
}

function classNames(value: unknown): readonly string[] {
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(classNames);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([name]) => name);
}

function styleValue(value: unknown): UiStyle | undefined {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return Object.entries(value).every(
    ([, item]) => typeof item === "string" || typeof item === "number",
  )
    ? (value as Readonly<Record<string, string | number>>)
    : undefined;
}

function applyPalette(root: unknown, palette: QuasarPalette): () => void {
  const host = paletteHost(root);
  if (!host) return () => undefined;
  const previous = Object.entries(paletteRoles).flatMap(([role, variable]) => {
    const value = palette[role as keyof QuasarPalette];
    if (value === undefined) return [];
    const style = host.style;
    const current = style.getPropertyValue(variable);
    const priority = style.getPropertyPriority(variable);
    style.setProperty(variable, value);
    return [[variable, current, priority] as const];
  });
  return () => {
    for (const [variable, value, priority] of previous) {
      if (value) host.style.setProperty(variable, value, priority);
      else host.style.removeProperty(variable);
    }
  };
}

function paletteHost(root: unknown): { readonly style: CSSStyleDeclaration } | undefined {
  if (isStyleHost(root)) return root;
  if (typeof root !== "object" || root === null || !("parentElement" in root)) return undefined;
  return isStyleHost(root.parentElement) ? root.parentElement : undefined;
}

function isStyleHost(value: unknown): value is { readonly style: CSSStyleDeclaration } {
  return (
    typeof value === "object" &&
    value !== null &&
    "style" in value &&
    typeof (value as { readonly style?: unknown }).style === "object"
  );
}

function cssPart(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "value";
}

function listLabel(row: Readonly<Record<string, unknown>>, key: EntityKey): string {
  const label = row.label ?? row.title ?? row.name ?? row.key ?? key;
  return typeof label === "string" || typeof label === "number" ? String(label) : String(key);
}

function warnLegacyResourceViewSlots(slots: Readonly<Record<string, unknown>>): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") return;
  const legacy = ["header", "actions", "list"].filter((name) => typeof slots[name] === "function");
  if (!legacy.length) return;
  console.warn(
    `UcResourceView slots ${legacy.map((name) => `#${name}`).join(", ")} are deprecated; use #caption, #tools, and #list-body instead.`,
  );
}

export const UcCancel = defineComponent({
  name: "UcCancel",
  inheritAttrs: false,
  props: {
    action: Function as PropType<() => unknown>,
    label: { type: String, default: "Cancel" },
    icon: { type: String, default: "close" },
    color: { type: String, default: "warning" },
    flat: { type: Boolean, default: true },
  },
  emits: ["cancel"],
  setup(props, { attrs, emit }) {
    const cancel = (): void => {
      props.action?.();
      emit("cancel");
    };
    return () =>
      h(QBtn, {
        ...attrs,
        label: props.label,
        icon: props.icon,
        color: props.color,
        flat: props.flat,
        onClick: cancel,
      });
  },
});

export const UcAction = defineComponent({
  name: "UcAction",
  inheritAttrs: false,
  props: {
    action: {
      type: [Function, Object] as PropType<(() => unknown | Promise<unknown>) | ActionLike>,
      required: true,
    },
    label: { type: String, required: true },
    icon: String,
    color: { type: String, default: "primary" },
    textColor: String,
    flat: { type: Boolean, default: false },
    disable: { type: Boolean, default: false },
    confirmMessage: String,
    confirmOptions: Object as PropType<QDialogOptions>,
    successMessage: String,
    failureMessage: String,
  },
  emits: ["start", "success", "failure", "cancel"],
  setup(props, { attrs, emit }) {
    const pending = ref(false);
    const controller = computed(() =>
      typeof props.action === "function" ? undefined : vueReactive(props.action),
    );
    const run = async (): Promise<void> => {
      if (pending.value || props.disable) return;
      if (props.confirmMessage && !(await UcConfirm(props.confirmMessage, props.confirmOptions))) {
        emit("cancel");
        return;
      }
      pending.value = true;
      emit("start");
      try {
        const result =
          typeof props.action === "function" ? await props.action() : await props.action.execute();
        if (isFailureResult(result)) {
          reportFailure(result.failure, props.failureMessage, emit);
          return;
        }
        if (props.successMessage) UcAlertSuccess(props.successMessage);
        emit("success", isSuccess(result) ? result.value : result);
      } catch (error) {
        reportFailure(error, props.failureMessage, emit);
      } finally {
        pending.value = false;
      }
    };
    return () =>
      h(QBtn, {
        ...attrs,
        label: props.label,
        icon: props.icon,
        color: props.color,
        textColor: props.textColor,
        flat: props.flat,
        disable: props.disable,
        loading: pending.value || controller.value?.loading,
        onClick: run,
      });
  },
});

export const UcDelete = defineComponent({
  name: "UcDelete",
  inheritAttrs: false,
  props: {
    action: {
      type: [Function, Object] as PropType<(() => unknown | Promise<unknown>) | ActionLike>,
      required: true,
    },
    label: { type: String, default: "Delete" },
    confirmMessage: { type: String, default: "Delete this item?" },
    successMessage: String,
    failureMessage: String,
    flat: { type: Boolean, default: false },
    disable: { type: Boolean, default: false },
  },
  emits: ["success", "failure", "cancel"],
  setup(props, { attrs, emit }) {
    return () =>
      h(UcAction, {
        ...attrs,
        action: props.action,
        label: props.label,
        icon: "delete",
        color: "negative",
        flat: props.flat,
        disable: props.disable,
        confirmMessage: props.confirmMessage,
        successMessage: props.successMessage,
        failureMessage: props.failureMessage,
        onSuccess: (value: unknown) => emit("success", value),
        onFailure: (failure: unknown) => emit("failure", failure),
        onCancel: () => emit("cancel"),
      });
  },
});

function isSuccess(value: unknown): value is { readonly success: true; readonly value: unknown } {
  return (
    typeof value === "object" && value !== null && "success" in value && value.success === true
  );
}

function isFailureResult(
  value: unknown,
): value is { readonly success: false; readonly failure: NormalizedFailure } {
  return (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    value.success === false &&
    "failure" in value
  );
}

function reportFailure(
  failure: unknown,
  fallback: string | undefined,
  emit: (event: "failure", value: unknown) => void,
): void {
  const message = failureMessage(failure) ?? fallback;
  if (message) UcAlertFailure(message);
  emit("failure", failure);
}

function reportFormFailure(
  failure: unknown,
  fallback: string,
  emit: (event: "failure", value: unknown) => void,
): void {
  const message =
    isFailureResult(failure) && failure.failure.kind === "validation"
      ? fallback
      : (failureMessage(failure) ?? fallback);
  if (message) UcAlertFailure(message);
  emit("failure", failure);
}

function reportLoadFailure(
  failure: unknown,
  fallback: string | undefined,
  emit: (event: "load-failure", value: unknown) => void,
): void {
  const message = failureMessage(failure) ?? fallback;
  if (message) UcAlertFailure(message);
  emit("load-failure", failure);
}

function failureMessage(failure: unknown): string | undefined {
  if (typeof failure === "object" && failure !== null && "failure" in failure)
    return failureMessage(failure.failure);
  if (failure instanceof Error) return nonEmptyMessage(failure.message);
  if (typeof failure !== "object" || failure === null) return undefined;
  if ("message" in failure && typeof failure.message === "string") {
    const message = nonEmptyMessage(failure.message);
    if (message) return message;
  }
  if ("status" in failure && typeof failure.status === "number")
    return statusFailureMessage(failure.status);
  return undefined;
}

function nonEmptyMessage(message: string): string | undefined {
  const trimmed = message.trim();
  return trimmed || undefined;
}

function statusFailureMessage(status: number): string | undefined {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You do not have permission to perform this action.";
  if (status === 404) return "The requested record could not be found.";
  if (status === 405) return "This action is not available.";
  if (status === 409) return "This record has changed. Refresh and try again.";
  if (status === 422) return "The submitted data could not be processed. Please check the errors.";
  if (status === 429) return "Too many requests. Please try again shortly.";
  if (status >= 500) return "The server encountered an error. Please try again.";
  return undefined;
}

function dialogResult(options: QDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    Dialog.create(options)
      .onOk(() => finish(true))
      .onCancel(() => finish(false))
      .onDismiss(() => finish(false));
  });
}

function tableSource(
  resource: ResourceLike | undefined,
  collection: TableCollectionLike | undefined,
): TableSource {
  if (resource && collection)
    throw new Error("UcTable accepts either resource or collection, not both");
  if (resource) return resource;
  if (collection) return collection;
  throw new Error("UcTable requires a resource or collection");
}

type SelectionMode = "none" | "single" | "multiple";

function useControlledSelectionWarning(selection: () => SelectionMode): void {
  const instance = getCurrentInstance();
  let warned = false;
  watch(
    selection,
    (mode) => {
      if (warned || mode === "none" || selectionIsBound(instance?.vnode.props)) return;
      warned = true;
      if (!isDevelopment()) return;
      console.warn(
        "[UiCogs] Enabled table selection is controlled. Bind v-model:selected-keys " +
          "(or provide selectedKeys with an update:selectedKeys listener).",
      );
    },
    { immediate: true },
  );
}

function selectionIsBound(props: Readonly<Record<string, unknown>> | null | undefined): boolean {
  return Boolean(props && ("selectedKeys" in props || "onUpdate:selectedKeys" in props));
}

function isDevelopment(): boolean {
  return typeof process !== "undefined" && process.env.NODE_ENV !== "production";
}

function collectionDefinition(source: TableSource, view?: ViewLike): ResourceLike["definition"] {
  const definition = "definition" in source ? source.definition : source.resource;
  if (!view) return definition;
  return Object.freeze({ ...definition, schema: Object.freeze({ shape: view.shape }) });
}

function formView(form: FormLike, view?: ViewLike): Readonly<Record<string, unknown>> {
  if (!view) return form.schema.fields.shape;
  for (const name of Object.keys(view.shape)) {
    if (!(name in form.schema.fields.shape))
      throw new Error(`UcForm view field ${name} is not present in the form definition`);
  }
  return view.shape;
}

function columnsFor(definition: ResourceLike["definition"]): readonly UcResourceColumn[] {
  return Object.entries(definition.schema.shape).flatMap(([name, field]) => {
    const options = fieldOptions(field);
    if (options?.writeonly === true) return [];
    return [
      Object.freeze({
        name,
        label: labelFor(name),
        field: name,
        align: "left" as const,
        sortable: Boolean(options?.sort),
        classes: `uc-table-column-${cssPart(name)}`,
        headerClasses: `uc-table-column-${cssPart(name)}`,
      }),
    ];
  });
}

function keyFor(
  definition: ResourceLike["definition"],
  row: Readonly<Record<string, unknown>>,
): EntityKey {
  const key = definition.key;
  const value =
    typeof key === "function"
      ? (key as (value: Readonly<Record<string, unknown>>) => unknown)(row)
      : typeof key === "string"
        ? row[key]
        : undefined;
  if (typeof value !== "string" && typeof value !== "number")
    throw new Error("Resource row does not contain a string or number key");
  return value;
}

function resourceObject(resource: ResourceLike, key: EntityKey): ResourceObjectLike {
  return (resource.get as unknown as (value: EntityKey) => ResourceObjectLike)(key);
}

function entityRecord(value: object): Readonly<Record<string, unknown>> {
  return value as Readonly<Record<string, unknown>>;
}

function fieldOptions(field: unknown): Readonly<Record<string, unknown>> | undefined {
  if (typeof field !== "object" || field === null || !("options" in field)) return undefined;
  const options = field.options;
  return typeof options === "object" && options !== null
    ? (options as Readonly<Record<string, unknown>>)
    : undefined;
}

function optionsFor(descriptor: Descriptor | undefined): Readonly<Record<string, unknown>> {
  const value = descriptor?.options;
  return typeof value === "object" && value !== null
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function fieldChoices(field: FieldLike): readonly unknown[] | undefined {
  const choices = field.options?.choices;
  if (!choices) return undefined;
  return typeof choices === "function" ? choices() : choices;
}

function fileValues(value: unknown): readonly FileValue[] {
  if (Array.isArray(value)) return value.filter(isFileValueLike);
  return isFileValueLike(value) ? [value] : [];
}

function fileModel(value: unknown): File | readonly File[] | null {
  const files = fileValues(value).flatMap((item) =>
    item.kind === "local" && typeof File !== "undefined" && item.file instanceof File
      ? [item.file]
      : [],
  );
  if (Array.isArray(value)) return files;
  return files[0] ?? null;
}

function toFileValue(
  value: unknown,
  multiple: boolean,
): FileValue | readonly FileValue[] | undefined {
  const values = Array.isArray(value)
    ? value
    : typeof FileList !== "undefined" && value instanceof FileList
      ? [...value]
      : [value];
  const files = values.flatMap((item) =>
    typeof File !== "undefined" && item instanceof File ? [localFile(item)] : [],
  );
  return multiple ? files : files[0];
}

function isFileValueLike(value: unknown): value is FileValue {
  if (typeof value !== "object" || value === null || !("kind" in value)) return false;
  return value.kind === "local" || value.kind === "remote" || value.kind === "removed";
}

function pageInfo(value: unknown, fallbackSize: number): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null) return { page: 1, rowsPerPage: fallbackSize };
  const source = value as Readonly<Record<string, unknown>>;
  return {
    page:
      typeof source.index === "number"
        ? source.index
        : typeof source.page === "number"
          ? source.page
          : 1,
    rowsPerPage:
      typeof source.size === "number"
        ? source.size
        : typeof source.pageSize === "number"
          ? source.pageSize
          : fallbackSize,
    rowsNumber:
      typeof source.count === "number"
        ? source.count
        : typeof source.total === "number"
          ? source.total
          : undefined,
  };
}

function renderField(
  definition: ResourceLike["definition"],
  name: string,
  value: unknown,
  row: Readonly<Record<string, unknown>>,
): RenderedField {
  const field = definition.schema.shape[name];
  const descriptor = fieldOptions(field)?.format as Descriptor | undefined;
  if (!descriptor) return String(value ?? "");
  const options = optionsFor(descriptor);
  const formatter = quasarRenderers.formatter(descriptor);
  if (typeof formatter === "function")
    return (formatter as FormatterRenderer)(value, options, name, row) as RenderedField;
  const column = columnsFor(definition).find((candidate) => candidate.name === name);
  return column?.format?.(value, row) ?? String(value ?? "");
}

type RenderedField = string | number | ReturnType<typeof h> | undefined;

type FormatterRenderer = (
  value: unknown,
  options: Readonly<Record<string, unknown>>,
  name: string,
  row: Readonly<Record<string, unknown>>,
) => unknown;

function formatText(value: unknown): string {
  return String(value ?? "");
}

function formatBoolean(value: unknown, options: Readonly<Record<string, unknown>>): string {
  return value ? String(options.trueLabel ?? "Yes") : String(options.falseLabel ?? "No");
}

function formatNumber(value: unknown, options: Readonly<Record<string, unknown>>): string {
  return typeof value === "number"
    ? new Intl.NumberFormat(undefined, options).format(value)
    : String(value ?? "");
}

function formatChoices(value: unknown, options: Readonly<Record<string, unknown>>): string {
  return Array.isArray(value)
    ? value.map(String).join(String(options.separator ?? ", "))
    : String(value ?? "");
}

function formatDate(value: unknown, options: Readonly<Record<string, unknown>>): string {
  if (!(value instanceof Date || typeof value === "string" || typeof value === "number")) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf())
    ? ""
    : new Intl.DateTimeFormat(undefined, options).format(date);
}

function formatDateRange(value: unknown, options: Readonly<Record<string, unknown>>): string {
  return Array.isArray(value)
    ? value.map((item) => formatDate(item, options)).join(String(options.separator ?? " - "))
    : "";
}

function formatReference(value: unknown): string {
  if (typeof value !== "object" || value === null) return String(value ?? "");
  const source = value as Readonly<Record<string, unknown>>;
  return String(source.label ?? source.name ?? source.title ?? source.id ?? "");
}

function formatImage(value: unknown, options: Readonly<Record<string, unknown>>, name: string) {
  return typeof value === "string"
    ? h("img", { src: value, alt: String(options.alt ?? name), class: "uc-field-image" })
    : undefined;
}

function formatFile(value: unknown, options: Readonly<Record<string, unknown>>) {
  return typeof value === "string"
    ? h("a", { href: value, download: options.download === true ? "" : undefined }, value)
    : undefined;
}

function formatLink(value: unknown, options: Readonly<Record<string, unknown>>) {
  return typeof value === "string"
    ? h("a", { href: value, target: options.target ?? "_self" }, value)
    : undefined;
}

function labelFor(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function defaultDetail(
  resource: ResourceLike,
  object: ResourceObjectLike,
  columns: readonly UcResourceColumn[],
  close: () => void,
) {
  if (object.loading) return h(QInnerLoading, { showing: true });
  if (object.error)
    return h(
      QBanner,
      { class: "bg-negative text-white" },
      object.error.message ?? "Unable to load",
    );
  const value = object.value;
  if (!value) return undefined;
  return h("div", { class: "uc-resource-view__detail" }, [
    h(
      "dl",
      columns.map((column) => {
        const raw = typeof column.field === "function" ? column.field(value) : value[column.field];
        const formatted =
          column.format?.(raw, value) ?? renderField(resource.definition, column.name, raw, value);
        return h("div", { class: "q-mb-md" }, [
          h("dt", { class: "text-caption text-grey-7" }, column.label),
          h("dd", { class: "q-ma-none" }, formatted),
        ]);
      }),
    ),
    h(QBtn, { flat: true, label: "Close", onClick: close }),
  ]);
}
