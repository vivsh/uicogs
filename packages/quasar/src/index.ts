import {
  localFile,
  removedFile,
  type Descriptor,
  type ExternalStore,
  type FileValue,
  type FormProgress,
  type NormalizedFailure,
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
  type InjectionKey,
  type PropType,
} from "vue";

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
}

interface TableCollectionLike extends ExternalStore<object> {
  readonly resource: ResourceLike["definition"];
  readonly loading: boolean;
  readonly pageInfo?: unknown;
  all(): readonly object[];
  load(): Promise<unknown>;
  page(index: number, size?: number): TableCollectionLike;
  sort(field?: string, descending?: boolean): TableCollectionLike;
  nextPage(): TableCollectionLike;
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
}

const formKey: InjectionKey<FormLike> = Symbol("uicogs-form");

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
    failureMessage: {
      type: String,
      default: "Form validation failed. Please check the error messages.",
    },
  },
  emits: ["success", "failure"],
  setup(props, { slots, emit }) {
    const form = vueReactive(props.form);
    provide(formKey, form);
    return () => {
      const summary = [...form.unboundIssues, ...form.issues.filter((issue) => !issue.path.length)];
      const children = slots.default?.() ?? [
        ...Object.keys(formView(form, props.view)).map((name) => h(UcField, { key: name, name })),
        h(UcSubmit, { key: "$submit" }),
      ];
      return h(
        QForm,
        {
          onSubmit: async () => {
            const result = await form.submit();
            if (isSuccess(result)) emit("success", result.value);
            else {
              if (isFailureResult(result)) {
                const message =
                  result.failure.kind === "validation"
                    ? props.failureMessage
                    : failureMessage(result.failure);
                if (message) UcAlertFailure(message);
              }
              emit("failure", result);
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
          ...children,
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
    return () => {
      const field = form.schema.fields.shape[props.name];
      if (!field) throw new Error(`Field ${props.name} is not present in the form schema`);
      const descriptor = props.kind ? ({ kind: props.kind } as Descriptor) : field.options?.editor;
      const kind = descriptor?.kind ?? "text";
      const descriptorOptions = optionsFor(descriptor);
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
      });
      if (!fileKind) return control;
      const remote = fileValues(value).filter((item) => item.kind === "remote");
      return h("div", { class: "uc-file-field" }, [
        control,
        ...remote.map((item) =>
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
    collection: { type: Object as PropType<CollectionLike>, required: true },
  },
  setup(props, { slots }) {
    return () =>
      h(
        UcForm,
        {
          form: props.form,
          onSuccess: () => props.collection.load(),
        },
        slots,
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
      const sourceColumns = props.columns ?? columnsFor(definition);
      return props.serial
        ? [
            { name: "$serial", label: "#", field: "$serial", align: "right" as const },
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
      collection.sort(page.sortBy, page.descending);
      if (page.page) collection.page(page.page, page.rowsPerPage || props.pageSize);
      void run(() => collection.load());
    };
    const scroll = (event: Event): void => {
      if (!props.infinite || collection.loading || !collection.hasMore()) return;
      const target = event.target as HTMLElement | null;
      if (!target || target.scrollTop + target.clientHeight + 24 < target.scrollHeight) return;
      collection.nextPage();
      void run(() => collection.load());
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
            }[];
            selected: boolean;
          };
          return h(
            QTr,
            {
              props: rowProps,
              class: props.rowClass?.(item.row),
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
                h(QTd, { props: rowProps, key: column.name }, () =>
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
  },
  emits: [
    "update:modelValue",
    "update:selectedKeys",
    "select",
    "view",
    "create",
    "loaded",
    "failure",
  ],
  setup(props, { slots, emit }) {
    useControlledSelectionWarning(() => props.selection);
    const resource = vueReactive(props.resource);
    const active = shallowRef<ResourceObjectLike>();
    const createController = shallowRef<FormLike>();
    const editController = shallowRef<FormLike>();
    const creating = shallowRef(false);
    const rows = computed(() => resource.all().map(entityRecord));
    const columns = computed(() => props.columns ?? columnsFor(resource.definition));
    const selectedRows = computed(() => {
      const keys = new Set(props.selectedKeys);
      return rows.value.filter((row) => keys.has(keyFor(resource.definition, row)));
    });

    const run = async (operation: () => Promise<unknown>): Promise<void> => {
      try {
        const result = await operation();
        emit("loaded", result);
      } catch (error) {
        emit("failure", error);
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
      if (props.autoLoad && !rows.value.length) void run(() => resource.load());
    });

    const defaultList = () => {
      if (resource.error)
        return h(
          QBanner,
          { class: "bg-negative text-white" },
          {
            default: () => resource.error?.message ?? "Unable to load records",
            action: () =>
              h(QBtn, {
                flat: true,
                label: "Retry",
                onClick: () => run(() => resource.load()),
              }),
          },
        );
      if (!rows.value.length && !resource.loading)
        return h("div", { class: "uc-resource-view__empty q-pa-lg text-center" }, props.emptyLabel);
      return h(UcTable, {
        resource,
        columns: columns.value,
        selection: props.selection,
        selectedKeys: props.selectedKeys,
        "onUpdate:selectedKeys": (keys: readonly EntityKey[]) => emit("update:selectedKeys", keys),
        onSelect: open,
      });
    };

    return () => {
      const aside = creating.value || Boolean(active.value);
      const list = slots.list?.({
        resource,
        rows: rows.value,
        open,
        create: startCreate,
        refresh: () => run(() => resource.refresh()),
      }) ?? [slots["before-list"]?.(), defaultList(), slots["after-list"]?.()];
      const detail = creating.value
        ? (slots.create?.({
            resource,
            close,
            refresh: () => run(() => resource.refresh()),
          }) ??
          (createController.value
            ? h(UcForm, {
                form: createController.value,
                onSuccess: () => {
                  close();
                  void run(() => resource.refresh());
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
                        void run(() => resource.refresh());
                      },
                      onFailure: (failure: unknown) => emit("failure", failure),
                    })
                  : defaultDetail(resource, active.value, columns.value, close)),
              slots["detail-actions"]?.({
                resource,
                object: active.value,
                value: active.value.value,
                close,
                refresh: () => run(() => active.value!.refresh()),
              }),
            ]
          : undefined;
      return h(
        UcView,
        {
          title: props.title,
          aside,
          asideWidth: props.asideWidth,
          mode: props.mode,
          loading: resource.loading,
          refresh: () => resource.refresh(),
          "onUpdate:aside": (open: boolean) => !open && close(),
        },
        {
          default: () => [
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
          header:
            slots.header || slots.filters || slots.actions
              ? () => [
                  slots.header?.({ resource, rows: rows.value }) ??
                    (props.title ? h("div", { class: "text-h5" }, props.title) : undefined),
                  slots.filters?.({ resource, rows: rows.value }),
                  slots.actions?.({
                    resource,
                    rows: rows.value,
                    selectedKeys: props.selectedKeys,
                    selectedRows: selectedRows.value,
                    create: startCreate,
                    refresh: () => run(() => resource.refresh()),
                  }),
                ]
              : undefined,
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
