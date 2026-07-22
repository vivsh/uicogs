import {
  createUiCogs as createCoreUiCogs,
  type AuthStrategyDefinition,
  type CogsOptions,
  type Descriptor,
  type EntityKey,
  type ExternalStore,
  type FormCompatibleSchema,
  type FormController,
  type FormSchema,
  type Schema,
  type Shape,
  type ResourceDefinitionIdentity,
} from "@uicogs/core";
import {
  computed,
  getCurrentScope,
  inject,
  onScopeDispose,
  readonly,
  ref,
  shallowRef,
  type ComputedRef,
  type App,
  type Ref,
  type ShallowRef,
  type InjectionKey,
  type Plugin,
} from "vue";

export * from "@uicogs/core";

const proxies = new WeakMap<object, object>();

export interface BoundUiCogs<T> {
  readonly UiCogsPlugin: Plugin;
  useUiCogs(): T;
}

export function bindUiCogs<T extends object>(runtime: T): BoundUiCogs<T> {
  const key: InjectionKey<T> = Symbol("UiCogs runtime");
  const UiCogsPlugin: Plugin = Object.freeze({
    install(app: App) {
      app.provide(key, runtime);
    },
  });
  return Object.freeze({
    UiCogsPlugin,
    useUiCogs(): T {
      const injected = inject(key, undefined);
      if (!injected)
        throw new Error("UiCogsPlugin is not installed in the current Vue application");
      return injected;
    },
  });
}

export function vueReactive<T extends ExternalStore<object>>(controller: T): T {
  const existing = proxies.get(controller);
  if (existing) return existing as T;
  const revision = shallowRef(0);
  const unsubscribe = controller.subscribe(() => {
    revision.value += 1;
  });
  if (getCurrentScope()) onScopeDispose(unsubscribe);
  const proxy = new Proxy(controller, {
    get(target, property, receiver) {
      void revision.value;
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== "function") return value;
      return (...args: readonly unknown[]) => {
        const result = Reflect.apply(value, target, args) as unknown;
        if (result === target) return receiver;
        return result;
      };
    },
    set() {
      return false;
    },
  });
  proxies.set(controller, proxy);
  return proxy;
}

type VueUiCogsOptions<
  TApplicationContext,
  TAuth extends AuthStrategyDefinition | undefined,
  TResources extends readonly ResourceDefinitionIdentity[],
> = Omit<CogsOptions<TApplicationContext, TAuth, TResources>, "adapter">;

export function createUiCogs<
  TApplicationContext = undefined,
  TEvents extends object = Readonly<Record<never, never>>,
  TAuth extends AuthStrategyDefinition | undefined = undefined,
  const TResources extends readonly ResourceDefinitionIdentity[] =
    readonly ResourceDefinitionIdentity[],
>(options: VueUiCogsOptions<TApplicationContext, TAuth, TResources>) {
  const adapted = { ...options, adapter: vueReactive } as CogsOptions<
    TApplicationContext,
    TAuth,
    TResources
  >;
  return createCoreUiCogs<TApplicationContext, TEvents, TAuth, TResources>(adapted);
}

export function useUcController<T extends ExternalStore<object>>(controller: T): T {
  return vueReactive(controller);
}

export const useUcResource = useUcController;
export const useUcObject = useUcController;
export const useUcCollection = useUcController;
export const useUcForm = useUcController;
export const useUcAction = useUcController;

export function useUcSnapshot<T extends object>(store: ExternalStore<T>): Readonly<ShallowRef<T>> {
  const snapshot = shallowRef(store.getSnapshot()) as ShallowRef<T>;
  const unsubscribe = store.subscribe(() => {
    snapshot.value = store.getSnapshot();
  });
  if (getCurrentScope()) onScopeDispose(unsubscribe);
  return readonly(snapshot) as unknown as Readonly<ShallowRef<T>>;
}

export interface RendererRegistry<TEditor, TFormatter> {
  registerEditor(kind: string, renderer: TEditor): RendererRegistry<TEditor, TFormatter>;
  registerFormatter(kind: string, renderer: TFormatter): RendererRegistry<TEditor, TFormatter>;
  editor(descriptor: Descriptor | undefined): TEditor | undefined;
  formatter(descriptor: Descriptor | undefined): TFormatter | undefined;
}

export function createRendererRegistry<TEditor, TFormatter>(): RendererRegistry<
  TEditor,
  TFormatter
> {
  const editors = new Map<string, TEditor>();
  const formatters = new Map<string, TFormatter>();
  const registry: RendererRegistry<TEditor, TFormatter> = {
    registerEditor(kind, renderer) {
      editors.set(kind, renderer);
      return registry;
    },
    registerFormatter(kind, renderer) {
      formatters.set(kind, renderer);
      return registry;
    },
    editor(descriptor) {
      return descriptor ? editors.get(descriptor.kind) : undefined;
    },
    formatter(descriptor) {
      return descriptor ? formatters.get(descriptor.kind) : undefined;
    },
  };
  return registry;
}

export interface UcFieldModel {
  readonly name: string;
  readonly descriptor?: Descriptor;
  readonly label: string;
  readonly help?: string;
  readonly state: ComputedRef<Readonly<Record<string, unknown>>>;
}

export function useUcFormModel<
  TForm extends FormSchema<FormCompatibleSchema, unknown>,
  TController extends FormController<TForm>,
>(controller: TController) {
  const form = vueReactive(controller);
  const fields = computed<readonly UcFieldModel[]>(() =>
    Object.entries(form.schema.fields.shape).map(([name, field]) => {
      const options = presentationOptions(field);
      return Object.freeze({
        name,
        ...(options?.editor ? { descriptor: options.editor as Descriptor } : {}),
        label: typeof options?.label === "string" ? options.label : labelFor(name),
        ...(typeof options?.help === "string" ? { help: options.help } : {}),
        state: computed(() => form.field(name as never) as Readonly<Record<string, unknown>>),
      });
    }),
  );
  const summary = computed(() => [
    ...form.unboundIssues,
    ...form.issues.filter((issue) => !issue.path.length),
  ]);
  return Object.freeze({ form, fields, summary });
}

export interface UcTableColumnModel {
  readonly name: string;
  readonly label: string;
  readonly descriptor?: Descriptor;
  readonly sortable: boolean;
  readonly hidden: boolean;
}

export function useUcTableModel<
  TContext,
  TSchema extends Schema<Shape, TContext>,
  TCollection extends {
    readonly values: readonly Readonly<Record<string, unknown>>[];
    readonly loading: boolean;
    readonly pageInfo?: unknown;
    sort(field?: string, descending?: boolean): unknown;
    page(index: number, size?: number): unknown;
    load(): Promise<unknown>;
  },
>(collection: TCollection, schema: TSchema) {
  const columns = computed<readonly UcTableColumnModel[]>(() =>
    Object.entries(schema.shape).map(([name, field]) =>
      Object.freeze({
        name,
        label: typeof field.options.label === "string" ? field.options.label : labelFor(name),
        ...(field.options.format ? { descriptor: field.options.format as Descriptor } : {}),
        sortable: Boolean(field.options.sort),
        hidden: field.options.writeonly === true || field.options.format?.kind === "hidden",
      }),
    ),
  );
  return Object.freeze({ collection, columns, rows: computed(() => collection.values) });
}

export interface UcResourceModel<TKey extends EntityKey, TEntity> extends ExternalStore<object> {
  readonly loading: boolean;
  all(): readonly Readonly<TEntity>[];
  get(key: TKey): ExternalStore<object>;
}

export function useUcResourceView<
  TKey extends EntityKey,
  TEntity,
  TResource extends UcResourceModel<TKey, TEntity>,
>(
  resource: TResource,
  options: {
    readonly activeKey?: Ref<TKey | undefined>;
    readonly selectedKeys?: Ref<readonly TKey[]>;
  } = {},
) {
  const reactiveResource = vueReactive(resource);
  const activeKey = options.activeKey ?? ref<TKey>();
  const selectedKeys = options.selectedKeys ?? ref<readonly TKey[]>([]);
  const creating = ref(false);
  const activeObject = computed(() =>
    activeKey.value === undefined ? undefined : reactiveResource.get(activeKey.value as never),
  );
  const mode = computed<"list" | "detail" | "create">(() =>
    creating.value ? "create" : activeKey.value === undefined ? "list" : "detail",
  );
  return Object.freeze({
    resource: reactiveResource,
    activeKey,
    selectedKeys,
    creating: readonly(creating),
    activeObject,
    mode,
    open(key: TKey) {
      creating.value = false;
      activeKey.value = key;
    },
    create() {
      activeKey.value = undefined;
      creating.value = true;
    },
    close() {
      activeKey.value = undefined;
      creating.value = false;
    },
  });
}

function labelFor(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (value) => value.toUpperCase());
}

function presentationOptions(value: unknown):
  | Readonly<{
      label?: string;
      help?: string;
      editor?: Descriptor;
    }>
  | undefined {
  if (typeof value !== "object" || value === null || !("options" in value)) return undefined;
  return value.options as Readonly<{
    label?: string;
    help?: string;
    editor?: Descriptor;
  }>;
}
