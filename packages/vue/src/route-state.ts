import {
  createFormController,
  type EntityKey,
  type FormController,
  type FormSchema,
  type Infer,
  type Schema,
  type Shape,
  type ValidationIssue,
} from "@uicogs/core";
import { computed, onScopeDispose, ref, watch, type ComputedRef } from "vue";
import {
  useRoute,
  useRouter,
  type LocationQuery,
  type LocationQueryRaw,
  type RouteLocationNormalizedLoaded,
  type RouteParamsRaw,
} from "vue-router";

type EmptyShape = Readonly<Record<never, never>>;
type RouteUrlValue =
  string | number | boolean | null | readonly (string | number | boolean | null)[];
type RouteQueryValues = Readonly<Record<string, RouteUrlValue | undefined>>;
type RouteParamValues = Readonly<Record<string, RouteUrlValue | undefined>>;

type RouteQueryValue<S extends Shape, TContext> = Readonly<Partial<Infer<Schema<S, TContext>>>>;

/** Typed schemas and the named route owned by a route-state controller. */
export interface RouteStateOptions<
  TQuery extends Shape = EmptyShape,
  TQueryContext = unknown,
  TParams extends Shape = EmptyShape,
  TParamsContext = unknown,
> {
  readonly route: string;
  readonly query?: Schema<TQuery, TQueryContext>;
  readonly params?: Schema<TParams, TParamsContext>;
}

/** A typed update which changes only declared URL state and preserves all other state. */
export interface RouteStateUpdate<
  TQuery extends Shape,
  TQueryContext,
  TParams extends Shape,
  TParamsContext,
> {
  readonly query?: RouteQueryValue<TQuery, TQueryContext>;
  readonly params?: Readonly<Partial<Infer<Schema<TParams, TParamsContext>>>>;
  /** Additional owned query values for a higher-level URL codec, such as pagination. */
  readonly extraQuery?: RouteQueryValues;
}

/** Reactive, schema-decoded URL state for one named Vue Router route. */
export interface RouteState<
  TQuery extends Shape,
  TQueryContext,
  TParams extends Shape,
  TParamsContext,
> {
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
export function useRouteState<
  TQuery extends Shape = EmptyShape,
  TQueryContext = unknown,
  TParams extends Shape = EmptyShape,
  TParamsContext = unknown,
>(
  options: RouteStateOptions<TQuery, TQueryContext, TParams, TParamsContext>,
): RouteState<TQuery, TQueryContext, TParams, TParamsContext> {
  const router = useRouter();
  const location = useRoute();
  const queryResult = computed(() => parseLocation(options.query, location.query));
  const paramResult = computed(() => parseLocation(options.params, location.params));
  const issues = computed(() =>
    Object.freeze([...queryResult.value.issues, ...paramResult.value.issues]),
  );
  const replacePending = ref(false);

  watch(
    () => location.fullPath,
    () => {
      if (!queryResult.value.issues.length && !paramResult.value.issues.length) return;
      if (replacePending.value) return;
      replacePending.value = true;
      void router
        .replace(
          locationFor(
            options,
            location,
            queryResult.value.values,
            paramResult.value.values,
            undefined,
          ),
        )
        .finally(() => {
          replacePending.value = false;
        });
    },
    { immediate: true },
  );

  const navigate = async (
    method: "push" | "replace",
    update: RouteStateUpdate<TQuery, TQueryContext, TParams, TParamsContext> = {},
  ): Promise<void> => {
    const query = update.query ?? queryResult.value.values;
    const params = update.params ?? paramResult.value.values;
    await router[method](locationFor(options, location, query, params, update.extraQuery));
  };

  return Object.freeze({
    route: options.route,
    query: computed(() => queryResult.value.values),
    params: computed(() => paramResult.value.values),
    issues,
    push: (update: RouteStateUpdate<TQuery, TQueryContext, TParams, TParamsContext> = {}) =>
      navigate("push", update),
    replace: (update: RouteStateUpdate<TQuery, TQueryContext, TParams, TParamsContext> = {}) =>
      navigate("replace", update),
  });
}

/** A form whose successful submissions write one canonical route location. */
export function useRouteForm<
  TSchema extends Shape,
  TContext,
  TParams extends Shape,
  TParamsContext,
>(options: {
  readonly route: RouteState<TSchema, TContext, TParams, TParamsContext>;
  readonly schema: Schema<TSchema, TContext>;
  readonly history?: "push" | "replace";
}): FormController<FormSchema<Schema<TSchema, TContext>, Infer<Schema<TSchema, TContext>>>> {
  const form = createFormController(
    options.schema.toForm<Infer<Schema<TSchema, TContext>>>({
      mode: "query",
      write: (value) => value,
    }),
    options.route.query.value as never,
    async (payload) => {
      const result = options.schema.parsePartialResult(payload);
      if (result.issues.length) throw new Error("Route form produced invalid query values");
      await options.route[options.history ?? "push"]({ query: result.values });
      return result.values;
    },
  );
  const stop = watch(
    () => options.route.query.value,
    (values) => form.reset(values as never),
    { deep: true },
  );
  onScopeDispose(stop);
  return form;
}

/** The route keys read and written by a page/sort codec. */
export interface RoutePaginationCodec {
  readonly keys: readonly string[];
  read(query: RouteQueryValues): Readonly<{ index: number; size: number; ordering?: string }>;
  write(state: Readonly<{ index: number; size: number; ordering?: string }>): RouteQueryValues;
}

/** The standard `page`, `page_size`, and `ordering` query convention. */
export const standardRoutePagination: RoutePaginationCodec = Object.freeze({
  keys: Object.freeze(["page", "page_size", "ordering"]),
  read(query: RouteQueryValues) {
    const page = positiveInteger(query.page) ?? 1;
    const size = positiveInteger(query.page_size) ?? 25;
    const ordering = firstText(query.ordering);
    return Object.freeze({ index: page, size, ...(ordering ? { ordering } : {}) });
  },
  write(state: Readonly<{ index: number; size: number; ordering?: string }>) {
    return Object.freeze({
      page: state.index === 1 ? undefined : String(state.index),
      page_size: state.size === 25 ? undefined : String(state.size),
      ordering: state.ordering,
    });
  },
});

/** A collection facade whose filter, sorting, and page changes first update the URL. */
export type RouteCollection<TCollection extends RouteCollectionSource> = Omit<
  TCollection,
  "resource" | "sort" | "page" | "nextPage"
> & {
  readonly resource: RouteCollectionMetadata;
  sort(field?: string, descending?: boolean): Promise<void>;
  page(index: number, size?: number): Promise<void>;
  nextPage(): Promise<void>;
};

/** Immutable metadata shared by resources and named query collections. */
export interface RouteCollectionMetadata {
  readonly key: string | ((value: Readonly<Record<string, unknown>>) => EntityKey);
  readonly schema: {
    readonly shape: Readonly<
      Record<
        string,
        {
          readonly options: Readonly<{ readonly wireName?: string }>;
          parse(value: unknown, path?: readonly (string | number)[]): unknown;
        }
      >
    >;
  };
}

/** The collection contract shared by a resource and named resource query controllers. */
export interface RouteCollectionSource {
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
export function useRouteCollection<
  TCollection extends RouteCollectionSource,
  TFilters extends Shape = EmptyShape,
  TContext = unknown,
  TParams extends Shape = EmptyShape,
  TParamsContext = unknown,
>(options: {
  readonly route: RouteState<TFilters, TContext, TParams, TParamsContext>;
  readonly collection: TCollection;
  readonly filters?: Schema<TFilters, TContext>;
  readonly pagination?: RoutePaginationCodec;
  /** Observes a failed URL-driven load after the collection has updated its own error state. */
  readonly onFailure?: (failure: unknown) => void;
}): RouteCollection<TCollection> {
  const codec = options.pagination ?? standardRoutePagination;
  const collection = options.collection;
  const metadata = collection.resource ?? collection.definition;
  if (!metadata) throw new Error("Route collections must expose resource or definition metadata");
  const location = useRoute();
  let loadedLocation = "";
  let applying: Promise<void> | undefined;

  const apply = (): Promise<void> => {
    const query = routeQuery(location);
    const state = codec.read(query);
    const canonical = codec.write(state);
    if (!codecIsCanonical(query, canonical, codec.keys)) {
      return options.route.replace({ extraQuery: canonical });
    }
    const filters = options.route.query.value as Readonly<Record<string, unknown>>;
    const locationId = `${location.fullPath}|${JSON.stringify(state)}|${JSON.stringify(filters)}`;
    if (locationId === loadedLocation) return applying ?? Promise.resolve();
    loadedLocation = locationId;
    applying = (async () => {
      collection.filter(filters);
      const sort = decodeOrdering(state.ordering);
      collection.sort(sort?.field, sort?.descending);
      collection.page(state.index, state.size);
      await collection.load();
    })();
    return applying.finally(() => {
      applying = undefined;
    });
  };
  const stop = watch(
    () => location.fullPath,
    () => {
      void apply().catch((failure: unknown) => {
        options.onFailure?.(failure);
      });
    },
    { immediate: true },
  );
  onScopeDispose(stop);

  const update = async (next: Readonly<{ index: number; size: number; ordering?: string }>) => {
    await options.route.push({ extraQuery: codec.write(next) });
  };
  const facade = new Proxy(collection, {
    get(target, property, receiver) {
      if (property === "resource") return metadata;
      if (property === "sort")
        return async (field?: string, descending = false): Promise<void> => {
          const current = codec.read(routeQuery(location));
          await update({ ...current, index: 1, ordering: encodeOrdering(field, descending) });
        };
      if (property === "page")
        return async (index: number, size?: number): Promise<void> => {
          const current = codec.read(routeQuery(location));
          await update({ ...current, index, size: size ?? current.size });
        };
      if (property === "nextPage")
        return async (): Promise<void> => {
          if (!target.hasMore()) return;
          const current = codec.read(routeQuery(location));
          await update({ ...current, index: current.index + 1 });
        };
      if (property === "load") return (): Promise<unknown> => applying ?? collection.load();
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return facade as RouteCollection<TCollection>;
}

/** Key codecs are needed only when a resource key is calculated rather than a schema field. */
export interface RouteKeyOptions<TKey extends EntityKey> {
  readonly parseKey?: (value: string) => TKey;
  readonly formatKey?: (key: TKey) => string;
}

/** A resource page composed from route state, route filters, a route list, and active detail state. */
export interface RouteResourceSource extends RouteCollectionSource {
  readonly definition: RouteCollectionMetadata;
  get(...args: never[]): {
    readonly value?: Readonly<Record<string, unknown>>;
    readonly loading: boolean;
    load(): Promise<unknown>;
  };
}

type RouteResourceKey<TResource> = TResource extends { get(key: infer TKey): unknown }
  ? Extract<TKey, EntityKey>
  : EntityKey;

export function useRouteResource<
  TResource extends RouteResourceSource,
  TFilters extends Shape,
  TFilterContext = unknown,
>(options: {
  readonly route: string;
  readonly resource: TResource;
  readonly filters: Schema<TFilters, TFilterContext>;
  readonly key?: RouteKeyOptions<RouteResourceKey<TResource>>;
  readonly pagination?: RoutePaginationCodec;
  /** Observes a failed URL-driven list load after the resource has updated its error state. */
  readonly onCollectionFailure?: (failure: unknown) => void;
}) {
  const route = useRouteState({ route: options.route, query: options.filters });
  const filterForm = useRouteForm({ route, schema: options.filters });
  const collection = useRouteCollection({
    route,
    collection: options.resource,
    filters: options.filters,
    ...(options.pagination ? { pagination: options.pagination } : {}),
    ...(options.onCollectionFailure ? { onFailure: options.onCollectionFailure } : {}),
  });
  const location = useRoute();
  const router = useRouter();
  const activeKeyValue = ref<RouteResourceKey<TResource>>();
  const parseKey = detailParser(options.resource, options.key);
  const formatKey = detailFormatter(options.resource, options.key);
  const syncActive = () => {
    const raw = location.params.id;
    const value = Array.isArray(raw) ? raw[0] : raw;
    activeKeyValue.value =
      typeof value === "string" && value !== "new" ? parseKey(value) : undefined;
  };
  watch(() => location.params.id, syncActive, { immediate: true });
  const navigateDetail = async (key: RouteResourceKey<TResource> | undefined): Promise<void> => {
    await router.push({
      name: options.route,
      params: {
        ...location.params,
        id: key === undefined ? undefined : formatKey(key),
      },
      query: location.query,
    });
  };
  const activeKey = computed({
    get: () => activeKeyValue.value,
    set: (key: RouteResourceKey<TResource> | undefined) => {
      void navigateDetail(key);
    },
  });
  const navigateCreate = async (): Promise<void> => {
    await router.push({
      name: options.route,
      params: { ...location.params, id: "new" },
      query: location.query,
    });
  };
  const creating = computed({
    get: () => location.params.id === "new",
    set: (next: boolean) => {
      void (next ? navigateCreate() : navigateDetail(undefined));
    },
  });
  const activeObject = computed(() =>
    activeKey.value === undefined ? undefined : options.resource.get(activeKey.value as never),
  );
  watch(
    activeObject,
    (object) => {
      if (object && !object.value && !object.loading) void object.load();
    },
    { immediate: true },
  );
  return Object.freeze({
    resource: options.resource,
    collection,
    filterForm,
    route,
    activeKey,
    activeObject,
    creating,
    open: navigateDetail,
    create: navigateCreate,
    close: () => navigateDetail(undefined),
  });
}

function parseLocation<S extends Shape, TContext>(
  schema: Schema<S, TContext> | undefined,
  values: LocationQuery | RouteLocationNormalizedLoaded["params"],
): {
  readonly values: Readonly<Partial<Infer<Schema<S, TContext>>>>;
  readonly issues: readonly ValidationIssue[];
} {
  if (!schema) return Object.freeze({ values: Object.freeze({}), issues: Object.freeze([]) });
  return schema.parsePartialResult(values);
}

function locationFor<TQuery extends Shape, TQueryContext, TParams extends Shape, TParamsContext>(
  options: RouteStateOptions<TQuery, TQueryContext, TParams, TParamsContext>,
  current: RouteLocationNormalizedLoaded,
  query: RouteQueryValue<TQuery, TQueryContext>,
  params: Readonly<Partial<Infer<Schema<TParams, TParamsContext>>>>,
  extraQuery: RouteQueryValues | undefined,
): { readonly name: string; readonly query: LocationQueryRaw; readonly params: RouteParamsRaw } {
  return {
    name: options.route,
    query: encodeQuery(options.query, current.query, query, extraQuery),
    params: encodeParams(options.params, current.params, params),
  };
}

function encodeQuery<S extends Shape, TContext>(
  schema: Schema<S, TContext> | undefined,
  current: LocationQuery,
  values: Readonly<Record<string, unknown>>,
  extra: RouteQueryValues | undefined,
): LocationQueryRaw {
  const output: Record<string, RouteUrlValue | undefined> = { ...current };
  if (schema) {
    for (const name of ownedNames(schema)) delete output[name];
    Object.assign(output, schema.toQuery(values as never) as RouteQueryValues);
  }
  Object.assign(output, extra);
  return output as LocationQueryRaw;
}

function encodeParams<S extends Shape, TContext>(
  schema: Schema<S, TContext> | undefined,
  current: RouteLocationNormalizedLoaded["params"],
  values: Readonly<Record<string, unknown>>,
): RouteParamsRaw {
  if (!schema) return { ...current };
  const output: Record<string, RouteUrlValue | undefined> = { ...current };
  for (const name of ownedNames(schema)) delete output[name];
  Object.assign(output, schema.toQuery(values as never) as RouteParamValues);
  return output as RouteParamsRaw;
}

function ownedNames(schema: Schema<Shape, unknown>): readonly string[] {
  return Object.freeze(
    Object.entries(schema.shape).flatMap(([name, field]) => [name, field.options.wireName ?? name]),
  );
}

function routeQuery(route: RouteLocationNormalizedLoaded): RouteQueryValues {
  return route.query as RouteQueryValues;
}

function firstText(value: RouteUrlValue | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" || typeof candidate === "number"
    ? String(candidate)
    : undefined;
}

function positiveInteger(value: RouteUrlValue | undefined): number | undefined {
  const text = firstText(value);
  if (!text || !/^\d+$/.test(text)) return undefined;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function decodeOrdering(
  value: string | undefined,
): { readonly field: string; readonly descending: boolean } | undefined {
  if (!value) return undefined;
  return value.startsWith("-")
    ? { field: value.slice(1), descending: true }
    : { field: value, descending: false };
}

function encodeOrdering(field: string | undefined, descending: boolean): string | undefined {
  return field ? `${descending ? "-" : ""}${field}` : undefined;
}

function codecIsCanonical(
  current: RouteQueryValues,
  canonical: RouteQueryValues,
  keys: readonly string[],
): boolean {
  return keys.every((key) => {
    const currentValue = current[key];
    const nextValue = canonical[key];
    if (Array.isArray(currentValue) || Array.isArray(nextValue)) return false;
    return currentValue === nextValue;
  });
}

function detailParser<
  TResource extends {
    readonly definition: RouteCollectionMetadata;
  },
  TKey extends EntityKey,
>(resource: TResource, options: RouteKeyOptions<TKey> | undefined): (value: string) => TKey {
  if (options?.parseKey) return options.parseKey;
  const resourceKey = resource.definition.key;
  if (typeof resourceKey !== "string")
    throw new Error("Route resources with a functional key require key.parseKey");
  const field = resource.definition.schema.shape[resourceKey];
  if (!field)
    throw new Error(`Route detail key field ${resourceKey} is not present in the resource schema`);
  return (value) => field.parse(value, [resourceKey]) as TKey;
}

function detailFormatter<
  TResource extends { readonly definition: RouteCollectionMetadata },
  TKey extends EntityKey,
>(resource: TResource, options: RouteKeyOptions<TKey> | undefined): (key: TKey) => string {
  if (options?.formatKey) return options.formatKey;
  if (typeof resource.definition.key !== "string")
    throw new Error("Route resources with a functional key require key.formatKey");
  return (key) => String(key);
}
