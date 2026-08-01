import {
  type ControllerAdapter,
  type Descriptor,
  type EntityKey,
  type ExternalStore,
  type FormCompatibleSchema,
  type FormController,
  type FormSchema,
  type Schema,
  type Shape,
  type RuntimeAuthController,
  isLoggedIn,
} from "@uicogs/core";
import {
  type Breadcrumb,
  type ResolvedNavigationNode,
  type ResolvedRouteEntry,
  type RouteAccess,
  type RouteLocation,
  type RouteNode,
  type RouteRegistry,
} from "@uicogs/routes";
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
  type Plugin,
  type Ref,
  type ShallowRef,
  type InjectionKey,
} from "vue";
import { type RouteRecordRaw, type RouteLocationNormalizedLoaded, type Router } from "vue-router";

export * from "@uicogs/core";

const proxies = new WeakMap<object, object>();

const uiCogsKey: InjectionKey<VueBoundUiCogs<VueRuntimeSource>> = Symbol("UiCogs runtime");

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

export interface WithVueOptions {
  readonly onDenied?: (input: {
    readonly route: ResolvedRouteEntry<unknown, object>;
    readonly location: RouteLocation;
  }) => string | false | void;
}

export interface VueRouteRuntime<TIcon = unknown> {
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

export type VueBoundUiCogs<T extends VueRuntimeSource> = Omit<
  T,
  "routes" | "context" | "live" | "auth"
> & {
  readonly core: T;
  readonly routes: VueRouteRuntime;
  readonly context: T["context"];
  readonly live: T["live"];
  readonly auth: T["auth"];
};

/** A Vue plugin and its application-specific, fully typed component composable. */
export interface VueUiCogsBinding<T extends VueRuntimeSource> {
  readonly uiCogs: Plugin;
  useUiCogs(): VueBoundUiCogs<T>;
}

/** Awaits one core runtime and creates its Vue plugin and typed component composable. */
export async function withVue<T extends VueRuntimeSource>(
  cogs: T,
  options: WithVueOptions = {},
): Promise<VueUiCogsBinding<T>> {
  await cogs.ready;
  const uiCogs: Plugin = {
    install(app: App) {
      const router = cogs.routes.entries.length ? routerFor(app) : undefined;
      bindVueRuntime(app, cogs, router, options.onDenied);
    },
  };
  return Object.freeze({
    uiCogs,
    useUiCogs: () => useUiCogs<T>(),
  });
}

/** Returns the Vue-bound application runtime installed by withVue(). */
export function useUiCogs<T extends VueRuntimeSource = VueRuntimeSource>(): VueBoundUiCogs<T> {
  const injected = inject(uiCogsKey, undefined);
  if (!injected) throw new Error("withVue() has not been called for the current Vue application");
  return injected as VueBoundUiCogs<T>;
}

function bindVueRuntime<T extends VueRuntimeSource>(
  app: App,
  cogs: T,
  router: Router | undefined,
  onDenied: WithVueOptions["onDenied"],
): VueBoundUiCogs<T> {
  cogs.bindControllerAdapter(vueReactive);
  const revision = shallowRef(0);
  const unsubscribe = cogs.auth?.subscribe(() => {
    revision.value += 1;
  });
  app.onUnmount(() => unsubscribe?.());
  const access = (): RouteAccess => {
    void revision.value;
    return accessFor(cogs.auth);
  };
  const location = (): RouteLocation =>
    router ? locationFor(router.currentRoute.value, cogs.routes) : emptyLocation;
  if (router) {
    router.beforeEach((to) => {
      const routeLocation = locationFor(to, cogs.routes);
      const entry = cogs.routes.resolve(routeLocation);
      if (!entry || cogs.routes.hasPermission(entry.path, access())) return true;
      const denied = onDenied?.({
        route: entry as ResolvedRouteEntry<unknown, object>,
        location: routeLocation,
      });
      return typeof denied === "string" ? { path: denied } : false;
    });
  }
  const routeRuntime: VueRouteRuntime = Object.freeze({
    registry: cogs.routes,
    navigationTree: (placement: string) =>
      computed(() => cogs.routes.navigationTree(placement, access(), location())),
    breadcrumbs: () => computed(() => cogs.routes.breadcrumbs(access(), location())),
    hasPermission: (path: string) => computed(() => cogs.routes.hasPermission(path, access())),
  });
  const bound = Object.create(cogs) as VueBoundUiCogs<T>;
  Object.defineProperties(bound, {
    core: { value: cogs },
    routes: { value: routeRuntime },
    context: { value: vueReactive(cogs.context) },
    live: { value: vueReactive(cogs.live) },
    ...(cogs.auth ? { auth: { value: vueReactive(cogs.auth) } } : {}),
  });
  app.provide(uiCogsKey, bound as VueBoundUiCogs<VueRuntimeSource>);
  return bound;
}

const emptyLocation: RouteLocation = Object.freeze({
  path: "",
  params: Object.freeze({}),
  query: Object.freeze({}),
});

function routerFor(app: App): Router {
  const router = app.config.globalProperties.$router as unknown;
  if (!isRouter(router))
    throw new Error(
      "Vue Router must be installed before app.use(uiCogs): app.use(router).use(uiCogs)",
    );
  return router;
}

function isRouter(value: unknown): value is Router {
  return (
    typeof value === "object" &&
    value !== null &&
    "currentRoute" in value &&
    "beforeEach" in value &&
    typeof value.beforeEach === "function"
  );
}

function accessFor(auth: RuntimeAuthController | undefined): RouteAccess {
  if (!auth) return { authenticated: false, permissions: new Set<string>() };
  const candidate = auth as RuntimeAuthController & {
    readonly permissions?: ReadonlySet<string>;
  };
  return {
    authenticated: isLoggedIn(candidate),
    permissions: candidate.permissions ?? new Set<string>(),
  };
}

function locationFor(
  route: RouteLocationNormalizedLoaded,
  registry: RouteRegistry<unknown, unknown, object>,
): RouteLocation {
  const params: Record<string, string | readonly string[] | undefined> = {};
  for (const [name, value] of Object.entries(route.params)) {
    if (typeof value === "string") params[name] = value;
    else if (Array.isArray(value) && value.every((item) => typeof item === "string"))
      params[name] = value;
  }
  const pattern = matchedPattern(route, registry);
  return {
    path: route.path,
    ...(pattern === undefined ? {} : { pattern }),
    params: Object.freeze(params),
    query: route.query,
  };
}

function matchedPattern(
  route: RouteLocationNormalizedLoaded,
  registry: RouteRegistry<unknown, unknown, object>,
): string | undefined {
  for (const record of [...route.matched].reverse()) {
    const entry = registry.entry(record.path);
    if (entry) return entry.path;
  }
  return undefined;
}

/** Compiles the UiCogs route tree into standard nested Vue Router records. */
export function toRoutes(
  registry: RouteRegistry<unknown, unknown, object>,
): readonly RouteRecordRaw[] {
  return Object.freeze(registry.tree.map(toVueRoute));
}

function toVueRoute(node: RouteNode<unknown, object>): RouteRecordRaw {
  if ("children" in node) {
    return Object.freeze({
      path: node.path,
      ...(node.component === undefined
        ? {}
        : { component: node.component as RouteRecordRaw["component"] }),
      ...(node.meta === undefined ? {} : { meta: node.meta }),
      children: Object.freeze(node.children.map(toVueRoute)),
    }) as RouteRecordRaw;
  }
  return Object.freeze({
    path: node.path,
    ...(node.name === undefined ? {} : { name: node.name }),
    ...(node.component === undefined
      ? {}
      : { component: node.component as RouteRecordRaw["component"] }),
    ...(node.redirect === undefined ? {} : { redirect: node.redirect }),
    ...(node.meta === undefined ? {} : { meta: node.meta }),
  }) as RouteRecordRaw;
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
