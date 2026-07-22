import {
  type CacheAddress,
  type CachePolicy,
  type CacheStore,
  type CollectionEntry,
  type EntityKey,
  mergeEntity,
  durableCache,
  memoryCache,
  tombstoneEntity,
} from "./cache.js";
import type {
  AuthExecutionRole,
  AuthRuntimeBindings,
  AuthStrategyDefinition,
  RuntimeAuthController,
} from "./auth.js";
import { ContextStoreController } from "./context.js";
import type { PersistenceOptions } from "./persistence.js";
import type { FormController, FormSchema, FormSubmitOptions, SubmitResult } from "./form.js";
import { createFormController } from "./form.js";
import { applyTransportMiddleware, createDefaultTransport } from "./default-http.js";
import type { RelationConfig, RelationEndpointMutation, RelationKeyFetchOptions } from "./field.js";
import type { NormalizedFailure, ValidationResult } from "./issues.js";
import { normalizeFailure, RequestError } from "./issues.js";
import {
  LiveController,
  type LiveEvent,
  type LiveMutation,
  type LiveSource,
  type LiveVersion,
} from "./live.js";
import { RequestCoordinator } from "./request.js";
import type { Infer, Input, Shape, ViewSchema } from "./schema.js";
import { Store, type ControllerAdapter, type ExternalStore } from "./store.js";
import { isRecord, type DeepReadonly } from "./utils.js";
import {
  pagination,
  type BodyEncoding,
  type DefaultHttpOptions,
  type ErrorAdapter,
  type MultipartAdapter,
  type PageInfo,
  type PageState,
  type PaginationAdapter,
  type Transport,
  type TransportMiddleware,
  type TransportRequest,
  type TransportResponse,
  type UploadProgress,
} from "./transport.js";
import { joinUrl, stableSerialize } from "./utils.js";

interface SchemaLike<TContext> {
  readonly _input: Readonly<Record<string, unknown>>;
  readonly _output: Readonly<Record<string, unknown>>;
  readonly _encoded: unknown;
  readonly _context: TContext;
  readonly shape: Shape;
  parse(input: unknown): Readonly<Record<string, unknown>>;
  parsePartial(input: unknown): Readonly<Record<string, unknown>>;
  materialize(input: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
  canMaterialize(input: Readonly<Record<string, unknown>>): boolean;
  validate(
    value: Readonly<Record<string, unknown>>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<ValidationResult>;
  write(value: Readonly<Record<string, unknown>>): unknown;
  writePartial(input: Readonly<Record<string, unknown>>): unknown;
  writeInput(input: unknown, options?: { readonly partial?: boolean }): unknown;
  toQuery?(values: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
  bindContext<TNextContext>(context: () => TNextContext): SchemaLike<TNextContext>;
}
type ViewLike<TContext> = ViewSchema<Shape, string, Shape, TContext>;
const preparedMutation = Symbol("preparedMutation");
const rawCollectionEntries = Symbol("rawCollectionEntries");
const localMasterIdentity = "__local_master__";

interface RuntimeSchema<TContext> {
  readonly _context?: TContext;
  readonly shape: Shape;
  parse(input: unknown): Readonly<Record<string, unknown>>;
  parsePartial(input: unknown): Readonly<Record<string, unknown>>;
  materialize(input: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
  canMaterialize(input: Readonly<Record<string, unknown>>): boolean;
  toQuery?(values: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
  write(value: Readonly<Record<string, unknown>>): unknown;
  writePartial(value: Readonly<Record<string, unknown>>): unknown;
  writeInput(input: unknown, options?: { readonly partial?: boolean }): unknown;
  bindContext?<TNextContext>(context: () => TNextContext): RuntimeSchema<TNextContext>;
}

interface RuntimeQuery<TContext> {
  readonly input?: RuntimeSchema<TContext>;
  readonly view?: string;
  readonly path?: string;
  readonly pagination?: PaginationAdapter;
  readonly ttl?: number;
  readonly errorAdapters?: readonly ErrorAdapter[];
  readonly sortParam?: string;
  readonly subscribeRelations?: boolean;
  readonly local?: (
    value: Readonly<Record<string, unknown>>,
    query: Readonly<Record<string, unknown>>,
    context: TContext,
  ) => boolean;
}

interface RuntimeAction<TContext> {
  readonly kind?: OperationKind;
  readonly input?: RuntimeSchema<TContext>;
  readonly output?: RuntimeSchema<TContext>;
  readonly view?: string;
  readonly method?: TransportRequest["method"];
  readonly path?: string | ((input: unknown) => string);
  readonly request?: (input: unknown) => ActionRequest<unknown>;
  readonly invalidate?: "resource" | "object" | "collections" | "none";
  readonly errorAdapters?: readonly ErrorAdapter[];
  readonly bulk?: BulkActionOptions;
  readonly pagination?: PaginationAdapter;
  readonly encoding?: BodyEncoding;
  readonly multipart?: MultipartAdapter;
  readonly sortParam?: string;
  readonly local?: (input: unknown, context: TContext) => unknown | Promise<unknown>;
  readonly auth?: OperationAuth;
}

export type OperationAuth = "required" | "optional" | "none";

export interface HttpResourceSource {
  readonly kind: "http";
}

export interface LocalResourceSource<TContext = unknown> {
  readonly kind: "local";
  readonly initial: readonly unknown[];
  readonly generateKey?: (options: {
    readonly value: Readonly<Record<string, unknown>>;
    readonly existing: readonly EntityKey[];
    readonly context: TContext;
  }) => EntityKey;
}

export type ResourceSource<TContext = unknown> = HttpResourceSource | LocalResourceSource<TContext>;

export function http(): HttpResourceSource {
  return Object.freeze({ kind: "http" });
}

export function local<TContext = unknown>(
  options: Omit<LocalResourceSource<TContext>, "kind" | "initial"> & {
    readonly initial?: readonly unknown[];
  } = {},
): LocalResourceSource<TContext> {
  return Object.freeze({
    ...options,
    kind: "local",
    initial: Object.freeze([...(options.initial ?? [])]),
  });
}

interface RuntimeDefinition<TContext> {
  readonly name: string;
  readonly resourceName: string;
  readonly url: string;
  readonly source: ResourceSource<TContext>;
  readonly schema: RuntimeSchema<TContext>;
  readonly key: string | ((value: Readonly<Record<string, unknown>>) => EntityKey);
  readonly keyEncoder?: (key: EntityKey) => EntityKey;
  readonly views: Readonly<Record<string, RuntimeSchema<TContext>>>;
  readonly queries: Readonly<Record<string, RuntimeQuery<TContext>>>;
  readonly actions: Readonly<Record<string, RuntimeAction<TContext>>>;
  readonly pagination: PaginationAdapter;
  readonly ttl: number;
  readonly errorAdapters: readonly ErrorAdapter[];
}

export interface ResourceDefinitionIdentity {
  readonly name: string;
  readonly resourceName: string;
}

export interface QueryDefinition<
  TInputSchema extends SchemaLike<TContext>,
  TView extends string | undefined,
  TContext,
> {
  readonly input: TInputSchema;
  readonly view?: TView;
  readonly path?: string;
  readonly pagination?: PaginationAdapter;
  readonly ttl?: number;
  readonly errorAdapters?: readonly ErrorAdapter[];
  readonly sortParam?: string;
  readonly local?: (
    value: Readonly<Record<string, unknown>>,
    query: Readonly<Record<string, unknown>>,
    context: TContext,
  ) => boolean;
}

export interface ActionRequest<TInput> {
  readonly method?: TransportRequest["method"];
  readonly path?: string;
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, unknown>>;
  readonly encoding?: BodyEncoding;
  readonly multipart?: MultipartAdapter;
  readonly input: TInput;
}

export interface ActionDefinition<
  TInputSchema extends SchemaLike<TContext> | undefined,
  TOutputSchema extends SchemaLike<TContext> | undefined,
  TView extends string | undefined,
  TContext,
> {
  readonly kind?: OperationKind;
  readonly input?: TInputSchema;
  readonly output?: TOutputSchema;
  readonly view?: TView;
  readonly method?: TransportRequest["method"];
  readonly path?:
    | string
    | ((
        input: TInputSchema extends SchemaLike<TContext> ? Input<TInputSchema> : unknown,
      ) => string);
  readonly request?: (
    input: TInputSchema extends SchemaLike<TContext> ? Input<TInputSchema> : unknown,
  ) => ActionRequest<TInputSchema extends SchemaLike<TContext> ? Input<TInputSchema> : unknown>;
  readonly invalidate?: "resource" | "object" | "collections" | "none";
  readonly errorAdapters?: readonly ErrorAdapter[];
  readonly bulk?: BulkActionOptions;
  readonly pagination?: PaginationAdapter;
  readonly encoding?: BodyEncoding;
  readonly multipart?: MultipartAdapter;
  readonly sortParam?: string;
  readonly local?: (
    input: TInputSchema extends SchemaLike<TContext> ? Input<TInputSchema> : unknown,
    context: TContext,
  ) => unknown | Promise<unknown>;
  readonly auth?: OperationAuth;
}

export type OperationKind =
  "list" | "retrieve" | "create" | "replace" | "patch" | "remove" | "action";

export interface BulkActionOptions {
  readonly path?: string;
  readonly method?: TransportRequest["method"];
  readonly encode?: (keys: readonly EntityKey[], input: unknown) => unknown;
  readonly decode?: (
    response: unknown,
    keys: readonly EntityKey[],
  ) => BulkResult<EntityKey, unknown>;
}

function defineOperation<
  TKind extends OperationKind,
  TMethod extends TransportRequest["method"],
  const TOptions extends Readonly<Record<string, unknown>>,
>(
  kind: TKind,
  method: TMethod,
  options: TOptions,
): Readonly<
  Omit<TOptions, "kind" | "method"> & {
    kind: TKind;
    method: TOptions extends { readonly method: infer TOverride }
      ? Extract<TOverride, TransportRequest["method"]>
      : TMethod;
  }
> {
  return Object.freeze({ kind, method, ...options }) as never;
}

export const operation = {
  list: <const T extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>>(
    options: T = {} as T,
  ) => defineOperation("list", "GET", options),
  retrieve: <const T extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>>(
    options: T = {} as T,
  ) => defineOperation("retrieve", "GET", options),
  create: <const T extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>>(
    options: T = {} as T,
  ) => defineOperation("create", "POST", options),
  replace: <const T extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>>(
    options: T = {} as T,
  ) => defineOperation("replace", "PUT", options),
  patch: <const T extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>>(
    options: T = {} as T,
  ) => defineOperation("patch", "PATCH", options),
  remove: <const T extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>>(
    options: T = {} as T,
  ) => defineOperation("remove", "DELETE", options),
  action: <const T extends Readonly<Record<string, unknown>>>(options: T) =>
    defineOperation("action", "POST", options),
  bulk: <const T extends Readonly<Record<string, unknown>>>(options: T) =>
    defineOperation("action", "POST", options),
};

type ViewMap<TContext> = Readonly<Record<string, ViewLike<TContext>>>;
type QueryMap<TContext> = Readonly<
  Record<string, QueryDefinition<SchemaLike<TContext>, string | undefined, TContext>>
>;
type ActionMap<TContext> = Readonly<
  Record<
    string,
    ActionDefinition<
      SchemaLike<TContext> | undefined,
      SchemaLike<TContext> | undefined,
      string | undefined,
      TContext
    >
  >
>;

export interface ResourceDefinitionOptions<
  TSchema extends SchemaLike<TContext>,
  TKey extends EntityKey,
  TViews extends ViewMap<TContext>,
  TQueries extends QueryMap<TContext>,
  TActions extends ActionMap<TContext>,
  TContext,
> {
  readonly name: string;
  readonly url?: string;
  readonly source?: ResourceSource<TContext>;
  readonly schema: TSchema;
  readonly key:
    (keyof Infer<TSchema> & string) | ((value: Readonly<Partial<Infer<TSchema>>>) => TKey);
  readonly keyEncoder?: (key: TKey) => EntityKey;
  readonly views?: TViews;
  readonly queries?: TQueries;
  readonly actions?: TActions;
  readonly operations?: TActions;
  readonly pagination?: PaginationAdapter;
  readonly ttl?: number;
  readonly errorAdapters?: readonly ErrorAdapter[];
}

export class ResourceDefinition<
  TSchema extends SchemaLike<TContext>,
  TKey extends EntityKey,
  TViews extends ViewMap<TContext> = Readonly<Record<never, never>>,
  TQueries extends QueryMap<TContext> = Readonly<Record<never, never>>,
  TActions extends ActionMap<TContext> = Readonly<Record<never, never>>,
  TContext = unknown,
> {
  declare readonly _entity?: Infer<TSchema>;
  readonly resourceName: string;
  readonly name: string;
  readonly url: string;
  readonly source: ResourceSource<TContext>;
  readonly schema: TSchema;
  readonly key: ResourceDefinitionOptions<
    TSchema,
    TKey,
    TViews,
    TQueries,
    TActions,
    TContext
  >["key"];
  readonly keyEncoder?: (key: TKey) => EntityKey;
  readonly views: TViews;
  readonly queries: TQueries;
  readonly actions: TActions;
  readonly operations: TActions;
  readonly pagination: PaginationAdapter;
  readonly ttl: number;
  readonly errorAdapters: readonly ErrorAdapter[];

  constructor(
    options: ResourceDefinitionOptions<TSchema, TKey, TViews, TQueries, TActions, TContext>,
  ) {
    this.resourceName = options.name;
    this.name = options.name;
    this.source = options.source ?? http();
    this.url = options.url ?? "";
    if (this.source.kind === "http" && !this.url)
      throw new Error(`HTTP resource ${options.name} requires a URL`);
    this.schema = options.schema;
    this.key = options.key;
    if (options.keyEncoder) this.keyEncoder = options.keyEncoder;
    this.views = Object.freeze({ ...(options.views ?? {}) }) as TViews;
    this.queries = Object.freeze({ ...(options.queries ?? {}) }) as TQueries;
    this.operations = Object.freeze({
      ...(options.actions ?? {}),
      ...(options.operations ?? {}),
    }) as TActions;
    this.actions = this.operations;
    this.pagination = options.pagination ?? pagination.page();
    this.ttl = options.ttl ?? 60_000;
    this.errorAdapters = Object.freeze([...(options.errorAdapters ?? [])]);
    validateViews(toRuntimeDefinition(this));
    Object.freeze(this);
  }

  operation<K extends keyof TActions & string>(name: K): OperationReference<this, K> {
    if (!(name in this.operations))
      throw new Error(`Operation ${name} is not defined on resource ${this.name}`);
    return Object.freeze({ resource: this, name }) as OperationReference<this, K>;
  }
}

export interface OperationReference<
  TResource = ResourceDefinitionIdentity,
  TName extends string = string,
> {
  readonly resource: TResource;
  readonly name: TName;
  readonly _input?: TResource extends { readonly operations: infer TActions }
    ? TName extends keyof TActions
      ? ActionInput<TActions[TName]>
      : never
    : never;
  readonly _output?: TResource extends {
    readonly schema: infer TSchema;
    readonly views: infer TViews;
    readonly operations: infer TActions;
  }
    ? TName extends keyof TActions
      ? TSchema extends SchemaLike<infer TContext>
        ? TViews extends ViewMap<TContext>
          ? ActionOutput<TSchema, TViews, TActions[TName]>
          : never
        : never
      : never
    : never;
}

export type OperationInput<TReference> = TReference extends { readonly _input?: infer T }
  ? T
  : never;
export type OperationOutput<TReference> = TReference extends { readonly _output?: infer T }
  ? T
  : never;

type NamedResourceDefinition<TName extends string, TDefinition> = TDefinition & {
  readonly name: TName;
  readonly resourceName: TName;
};

export function resource<
  const TName extends string,
  TSchema extends SchemaLike<TContext>,
  TKeyName extends keyof Infer<TSchema> & string,
  TViews extends ViewMap<TContext> = Readonly<Record<never, never>>,
  TQueries extends QueryMap<TContext> = Readonly<Record<never, never>>,
  TActions extends ActionMap<TContext> = Readonly<Record<never, never>>,
  TContext = TSchema extends SchemaLike<infer TSchemaContext> ? TSchemaContext : unknown,
>(
  options: Omit<
    ResourceDefinitionOptions<
      TSchema,
      Extract<Infer<TSchema>[TKeyName], EntityKey>,
      TViews,
      TQueries,
      TActions,
      TContext
    >,
    "key" | "name"
  > & { readonly name: TName; readonly key: TKeyName },
): NamedResourceDefinition<
  TName,
  ResourceDefinition<
    TSchema,
    Extract<Infer<TSchema>[TKeyName], EntityKey>,
    TViews,
    TQueries,
    TActions,
    TContext
  >
>;
export function resource<
  const TName extends string,
  TSchema extends SchemaLike<TContext>,
  TKey extends EntityKey,
  TViews extends ViewMap<TContext> = Readonly<Record<never, never>>,
  TQueries extends QueryMap<TContext> = Readonly<Record<never, never>>,
  TActions extends ActionMap<TContext> = Readonly<Record<never, never>>,
  TContext = TSchema extends SchemaLike<infer TSchemaContext> ? TSchemaContext : unknown,
>(
  options: Omit<
    ResourceDefinitionOptions<TSchema, TKey, TViews, TQueries, TActions, TContext>,
    "name"
  > & { readonly name: TName },
): NamedResourceDefinition<
  TName,
  ResourceDefinition<TSchema, TKey, TViews, TQueries, TActions, TContext>
>;
export function resource(options: unknown): unknown {
  if (!isResourceOptions(options)) throw new Error("Invalid resource definition");
  return new ResourceDefinition(options as never);
}

interface UiCogsBaseOptions<
  TContext,
  TAuth extends AuthStrategyDefinition | undefined = undefined,
  TResources extends readonly ResourceDefinitionIdentity[] = readonly ResourceDefinitionIdentity[],
> {
  readonly context?: TContext;
  readonly resources?: TResources;
  readonly auth?: TAuth;
  readonly baseUrl?: string;
  readonly middleware?: readonly TransportMiddleware[];
  readonly cacheScope?: () => string;
  readonly cachePolicy?: CachePolicy;
  readonly adapter?: ControllerAdapter;
  readonly errorAdapters?: readonly ErrorAdapter[];
  readonly live?: LiveSource<TContext>;
  readonly relationDefaults?: {
    readonly byKeys?: RelationKeyFetchOptions<TContext>;
  };
}

export type UiCogsOptions<
  TContext,
  TAuth extends AuthStrategyDefinition | undefined = undefined,
  TResources extends readonly ResourceDefinitionIdentity[] = readonly ResourceDefinitionIdentity[],
> = UiCogsBaseOptions<TContext, TAuth, TResources> &
  (
    | {
        readonly persistence?: PersistenceOptions<TContext>;
        readonly cache?: never;
      }
    | {
        readonly cache: CacheStore;
        readonly persistence?: Omit<PersistenceOptions<TContext>, "cache"> & {
          readonly cache: false;
        };
      }
  ) &
  (
    | {
        readonly http?: DefaultHttpOptions;
        readonly transport?: never;
      }
    | {
        readonly transport: Transport;
        readonly http?: never;
      }
  );

export interface ControllerState {
  readonly revision: number;
  readonly loading: boolean;
  readonly error?: NormalizedFailure;
}

export interface ActionSnapshot<T> extends ControllerState {
  readonly progress?: UploadProgress;
  readonly result?: T;
}

export class ActionController<T> implements ExternalStore<ActionSnapshot<T>> {
  private readonly store = new Store<ActionSnapshot<T>>({
    revision: 0,
    loading: false,
  });
  private controller?: AbortController;
  private running?: Promise<SubmitResult<T>>;

  constructor(private readonly executeAction: (options: MutationRequestOptions) => Promise<T>) {}

  get loading(): boolean {
    return this.store.getSnapshot().loading;
  }
  get error(): NormalizedFailure | undefined {
    return this.store.getSnapshot().error;
  }
  get progress(): UploadProgress | undefined {
    return this.store.getSnapshot().progress;
  }
  get result(): T | undefined {
    return this.store.getSnapshot().result;
  }
  getSnapshot(): ActionSnapshot<T> {
    return this.store.getSnapshot();
  }
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  execute(): Promise<SubmitResult<T>> {
    if (this.running) return this.running;
    this.controller = new AbortController();
    this.store.update((state) => ({
      ...state,
      revision: state.revision + 1,
      loading: true,
      error: undefined,
      progress: undefined,
    }));
    this.running = this.executeAction({
      signal: this.controller.signal,
      onUploadProgress: (progress) =>
        this.store.update((state) => ({
          ...state,
          revision: state.revision + 1,
          progress,
        })),
    })
      .then((result) => {
        this.store.update((state) => ({
          ...state,
          revision: state.revision + 1,
          loading: false,
          result,
        }));
        return { success: true as const, value: result };
      })
      .catch((error: unknown) => {
        const failure = normalizeFailure(error);
        this.store.update((state) => ({
          ...state,
          revision: state.revision + 1,
          loading: false,
          error: failure,
        }));
        return { success: false as const, failure };
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  cancel(): void {
    this.controller?.abort();
  }
}

interface Runtime<TContext> {
  readonly context: () => TContext;
  readonly transport: Transport;
  readonly baseUrl: string;
  readonly cache: CacheStore;
  readonly coordinator: RequestCoordinator;
  readonly adapter: ControllerAdapter;
  readonly definitions: Map<string, RuntimeDefinition<TContext>>;
  readonly errorAdapters: readonly ErrorAdapter[];
  readonly cachePolicy: CachePolicy;
  readonly relationDefaults?: UiCogsOptions<TContext>["relationDefaults"];
  scope(): string;
  timestamp(): number;
  subscribeContext(listener: () => void): () => void;
  registerCollection(
    address: CacheAddress,
    identity: string,
    registration: CollectionLiveRegistration,
  ): () => void;
  applyCollectionMembership(
    address: CacheAddress,
    key: EntityKey,
    value: Readonly<Record<string, unknown>>,
  ): void;
  address(resource: string): CacheAddress;
  awaitCache(scope: string): Promise<void> | undefined;
  request<T>(
    identity: string,
    request: Omit<TransportRequest, "signal">,
    signal: AbortSignal,
    adapters?: readonly ErrorAdapter[],
  ): Promise<TransportResponse<T>>;
}

interface ManagedCache extends CacheStore {
  activateScope?(scope: string): void | Promise<void>;
  awaitHydration?(scope: string): Promise<void>;
  removePersistentScope?(scope: string): Promise<void>;
  dispose?(): void;
}

interface CollectionLiveRegistration {
  readonly paginated: () => boolean;
  readonly match: (value: Readonly<Record<string, unknown>>) => boolean | undefined;
  readonly add: (key: EntityKey) => void;
}

interface CollectionLiveBucket {
  readonly address: CacheAddress;
  readonly identity: string;
  readonly registrations: Set<CollectionLiveRegistration>;
}

type RuntimeResourceOf<TDefinition, TFallbackContext = unknown> =
  TDefinition extends ResourceDefinition<
    infer TSchema,
    infer TKey,
    infer TViews,
    infer TQueries,
    infer TActions,
    infer TDefinitionContext
  >
    ? Resource<TSchema, TKey, TViews, TQueries, TActions, TDefinitionContext>
    : Resource<
        SchemaLike<TFallbackContext>,
        EntityKey,
        ViewMap<TFallbackContext>,
        QueryMap<TFallbackContext>,
        ActionMap<TFallbackContext>,
        TFallbackContext
      >;

export class UiCogs<
  TContext,
  TResources extends readonly ResourceDefinitionIdentity[] = readonly ResourceDefinitionIdentity[],
> {
  readonly cache: CacheStore;
  readonly requests = new RequestCoordinator();
  readonly live: LiveController<TContext>;
  readonly auth?: RuntimeAuthController;
  protected readonly contextController: ContextStoreController<unknown, TContext>;
  private readonly definitions = new Map<string, RuntimeDefinition<TContext>>();
  private readonly sourceDefinitions = new Map<string, ResourceDefinitionIdentity>();
  private readonly contextListeners = new Set<() => void>();
  private readonly liveCollections = new Map<string, CollectionLiveBucket>();
  private readonly runtime: Runtime<TContext>;
  private readonly managedCache: ManagedCache;
  private authUnsubscribe?: () => void;
  private authLogoutUnsubscribe?: () => void;
  private contextUnsubscribe?: () => void;

  constructor(options: UiCogsOptions<TContext, AuthStrategyDefinition | undefined, TResources>) {
    this.auth = options.auth?.create();
    const cachePersistence = options.persistence?.cache !== false;
    if (options.cache && options.persistence && cachePersistence)
      throw new Error("A custom cache requires persistence.cache to be false");
    this.cache =
      options.cache ??
      (options.persistence && cachePersistence
        ? durableCache(options.persistence.backend)
        : memoryCache());
    this.managedCache = this.cache as ManagedCache;
    if (options.transport && options.http)
      throw new Error("http and transport are mutually exclusive");
    const transport = applyTransportMiddleware(
      options.transport ?? createDefaultTransport(options.http),
      [...(options.middleware ?? []), ...(this.auth ? [this.auth.middleware()] : [])],
    );
    let lastTimestamp = 0;
    this.contextController = (options.adapter ?? identityAdapter)(
      new ContextStoreController(
        options.context,
        options.persistence && options.persistence.context !== false
          ? {
              backend: options.persistence.backend,
              ...(typeof options.persistence.context === "object" &&
              options.persistence.context.schema
                ? { schema: options.persistence.context.schema }
                : {}),
            }
          : undefined,
        (application, auth) => composeRuntimeContext<TContext>(application, auth),
        this.auth?.value,
      ),
    ) as ContextStoreController<unknown, TContext>;
    const context = () => this.contextController.value as TContext;
    const runtime: Runtime<TContext> = {
      context,
      transport,
      baseUrl: options.baseUrl ?? "",
      cache: this.cache,
      coordinator: this.requests,
      adapter: options.adapter ?? identityAdapter,
      definitions: this.definitions,
      errorAdapters: options.errorAdapters ?? [],
      cachePolicy: options.cachePolicy ?? "cache-first",
      relationDefaults: options.relationDefaults,
      scope: () => this.auth?.cacheScope() ?? options.cacheScope?.() ?? "anonymous",
      timestamp: () => (lastTimestamp = Math.max(Date.now(), lastTimestamp + 1)),
      subscribeContext: (listener) => {
        this.contextListeners.add(listener);
        return () => this.contextListeners.delete(listener);
      },
      registerCollection: (address, identity, registration) => {
        const key = liveCollectionIdentity(address, identity);
        const bucket = this.liveCollections.get(key) ?? {
          address,
          identity,
          registrations: new Set<CollectionLiveRegistration>(),
        };
        bucket.registrations.add(registration);
        this.liveCollections.set(key, bucket);
        return () => {
          bucket.registrations.delete(registration);
          if (!bucket.registrations.size) this.liveCollections.delete(key);
        };
      },
      applyCollectionMembership: (address, key, value) =>
        this.updateLiveCollectionMembership(address, key, value),
      address: (resource) => ({ scope: runtime.scope(), resource }),
      awaitCache: (scope) => this.managedCache.awaitHydration?.(scope),
      request: async <T>(
        identity: string,
        request: Omit<TransportRequest, "signal">,
        signal: AbortSignal,
        adapters: readonly ErrorAdapter[] = [],
      ) =>
        this.requests.coordinate(
          identity,
          async (sharedSignal) => {
            const response = await transport.request({
              ...request,
              authentication: request.authentication ?? (this.auth ? "required" : "none"),
              signal: sharedSignal,
            });
            if (response.status >= 400)
              throw new RequestError(
                adaptFailure(response, [...adapters, ...(options.errorAdapters ?? [])]),
              );
            return response as TransportResponse<T>;
          },
          signal,
        ),
    };
    this.runtime = runtime;
    for (const definition of options.resources ?? []) {
      if (!(definition instanceof ResourceDefinition))
        throw new Error(`Resource ${definition.name} is not a UiCogs resource definition`);
      this.registerDefinition(definition);
    }
    this.validateRelations();
    void this.managedCache.activateScope?.(runtime.scope());
    this.live = runtime.adapter(
      new LiveController(options.live, {
        context: runtime.context,
        scope: runtime.scope,
        transport: runtime.transport,
        baseUrl: runtime.baseUrl,
        dispatchDefault: (event, payload, version, scope) =>
          this.dispatchDefaultLiveEvent(event, payload, version, scope),
        dispatchMutation: (mutation, version, scope) =>
          this.dispatchLiveMutation(mutation, version, scope),
      }),
    );
    let contextValue = this.contextController.value;
    this.contextUnsubscribe = this.contextController.subscribe(() => {
      const nextValue = this.contextController.value;
      if (Object.is(nextValue, contextValue)) return;
      contextValue = nextValue;
      this.live.reevaluate();
      for (const listener of this.contextListeners) listener();
    });
    if (this.auth) {
      this.validateAuthOperations(options.auth!);
      this.auth.attach(this.authBindings());
      let scope = this.auth.cacheScope();
      this.authLogoutUnsubscribe = this.auth.subscribeLogout(() => {
        const logoutScope = this.auth!.cacheScope();
        if (
          logoutScope !== "anonymous" &&
          options.persistence &&
          options.persistence.cache !== false &&
          (typeof options.persistence.cache !== "object" ||
            options.persistence.cache.eraseOnLogout !== false)
        )
          void this.managedCache.removePersistentScope?.(logoutScope);
      });
      this.authUnsubscribe = this.auth.subscribe(() => {
        const nextScope = this.auth!.cacheScope();
        if (scope !== nextScope) {
          this.requests.abortAll();
          if (scope !== "anonymous") this.cache.clearScope(scope);
          void this.managedCache.activateScope?.(nextScope);
        }
        scope = nextScope;
        this.contextController.setAuthSnapshot(this.auth!.value);
      });
      queueMicrotask(() => {
        if (!this.requests.isDisposed) void this.auth?.initialize();
      });
    }
    queueMicrotask(() => {
      if (!this.requests.isDisposed) void this.contextController.initialize();
    });
  }

  private validateAuthOperations(strategy: AuthStrategyDefinition): void {
    const roles = new Map<string, string>();
    for (const reference of strategy.operations) {
      const registered = this.sourceDefinitions.get(reference.resource.name);
      if (!registered)
        throw new Error(
          `Authentication operation ${reference.resource.name}.${reference.name} uses an unregistered resource`,
        );
      if (registered !== reference.resource)
        throw new Error(
          `Authentication operation ${reference.resource.name}.${reference.name} conflicts with the registered resource`,
        );
      const identity = `${reference.resource.name}.${reference.name}`;
      if (roles.has(identity))
        throw new Error(`Authentication operation ${identity} is bound more than once`);
      roles.set(identity, identity);
    }
  }

  private authBindings(): AuthRuntimeBindings {
    return {
      execute: async (reference, input, role, signal) => {
        const source = this.sourceDefinitions.get(reference.resource.name);
        if (source !== reference.resource)
          throw new Error(
            `Authentication operation ${reference.resource.name}.${reference.name} is not registered`,
          );
        const definition = this.definitions.get(reference.resource.name);
        if (!definition) throw new Error(`Resource ${reference.resource.name} is not registered`);
        const controller = new Resource(this.runtime, definition as never) as unknown as {
          runOperation(
            name: string,
            value: unknown,
            options: MutationRequestOptions,
          ): Promise<unknown>;
        };
        return controller.runOperation(reference.name, input, {
          authentication: role,
          signal,
        }) as never;
      },
    };
  }

  resource<TDefinition extends TResources[number]>(
    definition: TDefinition,
  ): RuntimeResourceOf<TDefinition, TContext>;
  resource<TName extends TResources[number]["name"] & string>(
    name: TName,
  ): string extends TResources[number]["name"]
    ? RuntimeResourceOf<ResourceDefinitionIdentity, TContext>
    : RuntimeResourceOf<Extract<TResources[number], { readonly name: TName }>, TContext>;
  resource(value: unknown): unknown {
    if (typeof value === "string") {
      const definition = this.definitions.get(value);
      if (!definition) throw new Error(`Resource ${value} is not registered`);
      return this.runtime.adapter(new Resource(this.runtime, definition as never));
    }
    if (value instanceof ResourceDefinition) {
      const registered = this.sourceDefinitions.get(value.name);
      if (!registered)
        throw new Error(`Resource ${value.name} is not registered in this UiCogs runtime`);
      if (registered !== value)
        throw new Error(`Resource ${value.name} conflicts with the registered definition`);
      return this.runtime.adapter(
        new Resource(this.runtime, this.definitions.get(value.name) as never),
      );
    }
    throw new Error("Expected a registered resource name or definition");
  }

  private registerDefinition(definition: ResourceDefinitionIdentity): void {
    if (!(definition instanceof ResourceDefinition))
      throw new Error(`Resource ${definition.name} is not a UiCogs resource definition`);
    const existing = this.sourceDefinitions.get(definition.name);
    if (existing) {
      if (existing === definition)
        throw new Error(`Resource ${definition.name} is registered more than once`);
      throw new Error(
        `Resource ${definition.name} is already registered with a conflicting definition`,
      );
    }
    const bound = bindRuntimeDefinition(
      definition as unknown as RuntimeDefinition<unknown>,
      this.runtime.context,
    );
    this.sourceDefinitions.set(definition.name, definition);
    this.definitions.set(definition.name, bound);
    if (bound.source.kind === "local") initializeLocalSource(this.runtime, bound);
  }

  private validateRelations(): void {
    for (const definition of this.sourceDefinitions.values()) {
      const runtimeDefinition = definition as unknown as RuntimeDefinition<unknown>;
      for (const [fieldName, field] of Object.entries(runtimeDefinition.schema.shape)) {
        const relation = field.options.relation;
        if (!relation) continue;
        for (const target of [relation.resource, relation.through?.resource]) {
          if (!target) continue;
          const name = resourceNameOf(target);
          if (!name || !this.sourceDefinitions.has(name))
            throw new Error(
              `Relation ${definition.name}.${fieldName} targets an unregistered resource`,
            );
          if (this.sourceDefinitions.get(name) !== target)
            throw new Error(
              `Relation ${definition.name}.${fieldName} conflicts with resource ${name}`,
            );
        }
      }
    }
  }

  private dispatchDefaultLiveEvent(
    event: LiveEvent,
    payload: unknown,
    version: LiveVersion | undefined,
    scope: string,
  ): boolean {
    if (this.definitions.has(event.type)) {
      this.dispatchLiveMutation(
        { action: "upsert", resource: event.type, value: payload },
        version,
        scope,
      );
      return true;
    }
    for (const [suffix, action] of [
      [":delete", "delete"],
      [":invalidate", "invalidate"],
    ] as const) {
      if (!event.type.endsWith(suffix)) continue;
      const resource = event.type.slice(0, -suffix.length);
      if (!this.definitions.has(resource)) return false;
      this.dispatchLiveMutation(
        action === "delete" ? { action, resource, value: payload } : { action, resource },
        version,
        scope,
      );
      return true;
    }
    return false;
  }

  private dispatchLiveMutation(
    mutation: LiveMutation,
    version: LiveVersion | undefined,
    scope: string,
  ): void {
    const definition = this.definitions.get(mutation.resource);
    if (!definition) throw new Error(`Live event targets unknown resource ${mutation.resource}`);
    const address = { scope, resource: definition.name };
    if (mutation.action === "invalidate") {
      this.cache.markResourceStale(address);
      return;
    }
    if (mutation.action === "delete") {
      const key = liveMutationKey(definition, mutation);
      const current = this.cache.entity(address, definition.keyEncoder?.(key) ?? key);
      const tombstone = tombstoneEntity(current, definition.keyEncoder?.(key) ?? key, version);
      if (tombstone !== current) this.cache.setEntity(address, tombstone);
      this.cache.removeEntityFromCollections(address, definition.keyEncoder?.(key) ?? key);
      return;
    }
    const parsed = definition.schema.parsePartial(mutation.value);
    const key = keyFromPartial(definition, parsed);
    const encoded = definition.keyEncoder?.(key) ?? key;
    const existed = Boolean(this.cache.entity(address, encoded));
    normalizeEntity(this.runtime, definition, parsed, key, undefined, scope, version);
    if (!existed) this.runtime.applyCollectionMembership(address, encoded, parsed);
  }

  private updateLiveCollectionMembership(
    address: CacheAddress,
    key: EntityKey,
    value: Readonly<Record<string, unknown>>,
  ): void {
    const visited = new Set<string>();
    for (const entry of this.cache.collectionEntries(address)) {
      visited.add(entry.identity);
      const bucket = this.liveCollections.get(liveCollectionIdentity(address, entry.identity));
      if (!bucket?.registrations.size) {
        this.cache.setCollection(address, Object.freeze({ ...entry, staleAt: 0 }));
        continue;
      }
      this.applyRegisteredMembership(bucket, key, value, entry);
    }
    for (const bucket of [...this.liveCollections.values()]) {
      if (
        bucket.address.scope !== address.scope ||
        bucket.address.resource !== address.resource ||
        visited.has(bucket.identity)
      )
        continue;
      this.applyRegisteredMembership(bucket, key, value);
    }
  }

  private applyRegisteredMembership(
    bucket: CollectionLiveBucket,
    key: EntityKey,
    value: Readonly<Record<string, unknown>>,
    entry?: CollectionEntry,
  ): void {
    const results = [...bucket.registrations].map((registration) => ({
      registration,
      match: registration.match(value),
    }));
    const matching = results.find(
      ({ registration, match }) => match === true && !registration.paginated(),
    );
    if (matching) {
      matching.registration.add(key);
      return;
    }
    if (results.every(({ match }) => match === false) || !entry) return;
    this.cache.setCollection(bucket.address, Object.freeze({ ...entry, staleAt: 0 }));
  }

  clearScope(scope = this.runtime.scope()): void {
    this.cache.clearScope(scope);
  }

  protected currentContext(): TContext {
    return this.runtime.context();
  }

  dispose(): void {
    this.contextUnsubscribe?.();
    this.contextUnsubscribe = undefined;
    this.authUnsubscribe?.();
    this.authUnsubscribe = undefined;
    this.authLogoutUnsubscribe?.();
    this.authLogoutUnsubscribe = undefined;
    this.auth?.dispose();
    this.contextController.dispose();
    this.live.dispose();
    this.requests.dispose();
    this.managedCache.dispose?.();
    this.contextListeners.clear();
    this.liveCollections.clear();
  }
}

export class Resource<
  TSchema extends SchemaLike<TContext>,
  TKey extends EntityKey,
  TViews extends ViewMap<TContext>,
  TQueries extends QueryMap<TContext>,
  TActions extends ActionMap<TContext>,
  TContext,
> implements ExternalStore<ControllerState> {
  declare readonly _entity?: Infer<TSchema>;
  readonly resourceName: string;
  readonly cache: ResourceCacheFacade<TSchema, TKey, TContext>;
  private readonly defaultCollection: CollectionController<Infer<TSchema>, TKey, TContext>;
  private readonly keyedObjects = new Map<
    EntityKey,
    ResourceObject<Infer<TSchema>, TKey, TContext>
  >();
  private readonly dynamicObjects = new WeakMap<
    () => TKey,
    ResourceObject<Infer<TSchema>, TKey, TContext>
  >();

  constructor(
    private readonly runtime: Runtime<TContext>,
    readonly definition: ResourceDefinition<TSchema, TKey, TViews, TQueries, TActions, TContext>,
  ) {
    this.resourceName = definition.name;
    const runtimeDefinition = toRuntimeDefinition(definition);
    const listOperation = runtimeDefinition.actions.list;
    this.defaultCollection = new CollectionController(
      runtime,
      runtimeDefinition,
      "default",
      listOperation?.kind === "list"
        ? {
            ...(listOperation.input ? { input: listOperation.input } : {}),
            ...(listOperation.view ? { view: listOperation.view } : {}),
            ...(typeof listOperation.path === "string" ? { path: listOperation.path } : {}),
            ...(listOperation.pagination ? { pagination: listOperation.pagination } : {}),
            ...(listOperation.errorAdapters ? { errorAdapters: listOperation.errorAdapters } : {}),
            ...(listOperation.sortParam ? { sortParam: listOperation.sortParam } : {}),
          }
        : undefined,
      undefined,
    );
    this.cache = new ResourceCacheFacade(runtime, runtimeDefinition, this.defaultCollection);
  }

  get loading(): boolean {
    return this.defaultCollection.loading;
  }
  get error(): NormalizedFailure | undefined {
    return this.defaultCollection.error;
  }
  get pageInfo(): unknown {
    return this.defaultCollection.pageInfo;
  }
  get stale(): boolean {
    return this.defaultCollection.stale;
  }

  getSnapshot(): ControllerState {
    return this.defaultCollection.getSnapshot();
  }
  subscribe(listener: () => void): () => void {
    return this.defaultCollection.subscribe(listener);
  }

  filter(
    values: Readonly<Record<string, unknown>>,
    options: { readonly merge?: boolean } = {},
  ): this {
    this.defaultCollection.filter(values, options);
    return this;
  }

  sort(field?: keyof Infer<TSchema> & string, descending = false): this {
    this.defaultCollection.sort(field, descending);
    return this;
  }

  page(index: number, size = 25): this {
    this.defaultCollection.page(index, size);
    return this;
  }

  accumulate(enabled = true): this {
    this.defaultCollection.accumulate(enabled);
    return this;
  }

  nextPage(): this {
    this.defaultCollection.nextPage();
    return this;
  }

  previousPage(): this {
    this.defaultCollection.previousPage();
    return this;
  }

  hasMore(): boolean {
    return this.defaultCollection.hasMore();
  }

  reset(): this {
    this.defaultCollection.reset();
    return this;
  }

  all(): readonly Readonly<Infer<TSchema>>[] {
    return this.defaultCollection.all();
  }
  load(options: LoadOptions = {}): Promise<readonly Readonly<Infer<TSchema>>[]> {
    return this.defaultCollection.load(options);
  }
  refresh(): Promise<readonly Readonly<Infer<TSchema>>[]> {
    return this.defaultCollection.load({ policy: "network-only" });
  }
  invalidate(): void {
    this.defaultCollection.invalidate();
  }
  cancel(): void {
    this.defaultCollection.cancel();
  }

  get(key: TKey | (() => TKey)): ResourceObject<Infer<TSchema>, TKey, TContext> {
    if (typeof key === "function") {
      const source = key as () => TKey;
      const existing = this.dynamicObjects.get(source);
      if (existing) return existing;
      const controller = this.runtime.adapter(
        new ResourceObject(this.runtime, toRuntimeDefinition(this.definition), source),
      ) as ResourceObject<Infer<TSchema>, TKey, TContext>;
      this.dynamicObjects.set(source, controller);
      return controller;
    }
    const encoded = this.encodeKey(key);
    const existing = this.keyedObjects.get(encoded);
    if (existing) return existing;
    const controller = this.runtime.adapter(
      new ResourceObject(this.runtime, toRuntimeDefinition(this.definition), key),
    ) as ResourceObject<Infer<TSchema>, TKey, TContext>;
    this.keyedObjects.set(encoded, controller);
    return controller;
  }

  query<K extends keyof TQueries & string>(
    name: K,
    input: Input<TQueries[K]["input"]> | (() => Input<TQueries[K]["input"]>),
  ): CollectionController<QueryValue<TSchema, TViews, TQueries[K]>, TKey, TContext> {
    const definition = this.definition.queries[name];
    if (!definition)
      throw new Error(`Query ${name} is not defined on resource ${this.definition.name}`);
    return this.runtime.adapter(
      new CollectionController(
        this.runtime,
        toRuntimeDefinition(this.definition),
        name,
        definition as never,
        input,
      ),
    ) as CollectionController<QueryValue<TSchema, TViews, TQueries[K]>, TKey, TContext>;
  }

  async create(
    input: Partial<Input<TSchema>>,
    options: MutationRequestOptions = {},
  ): Promise<Readonly<Infer<TSchema>> | undefined> {
    return this.mutate("create", "POST", this.definition.url, input, undefined, options);
  }

  async replace(
    key: TKey,
    input: Partial<Input<TSchema>>,
    options: MutationRequestOptions = {},
  ): Promise<Readonly<Infer<TSchema>> | undefined> {
    return this.mutate(
      "replace",
      "PUT",
      `${this.definition.url}${this.encodeKey(key)}/`,
      input,
      key,
      options,
    );
  }

  async update(
    key: TKey,
    input: Partial<Input<TSchema>>,
    options: MutationRequestOptions = {},
  ): Promise<Readonly<Infer<TSchema>> | undefined> {
    return this.mutate(
      "update",
      "PATCH",
      `${this.definition.url}${this.encodeKey(key)}/`,
      input,
      key,
      options,
    );
  }

  async remove(key: TKey): Promise<void> {
    if (this.definition.source.kind === "local") {
      const encoded = this.encodeKey(key);
      if (!this.runtime.cache.entity(this.runtime.address(this.definition.name), encoded))
        throw new RequestError({
          kind: "not-found",
          status: 404,
          message: `Entity ${String(key)} was not found`,
          issues: [],
          retryable: false,
        });
      this.cache.remove(key);
      return;
    }
    const controller = new AbortController();
    const encoded = this.encodeKey(key);
    const operation = this.definition.actions.remove;
    const path = operationPath(operation, `${encoded}/`, { key });
    await this.runtime.request(
      `${this.runtime.scope()}|${this.definition.name}|remove|${encoded}`,
      {
        method: operation?.method ?? "DELETE",
        url: joinUrl(this.runtime.baseUrl, joinUrl(this.definition.url, path)),
        authentication: operation?.auth,
      },
      controller.signal,
      this.definition.errorAdapters,
    );
    const address = this.runtime.address(this.definition.name);
    this.runtime.cache.setEntity(
      address,
      tombstoneEntity(this.runtime.cache.entity(address, encoded), encoded),
    );
    this.runtime.cache.invalidateResource(address);
  }

  form<TFormSchema extends FormSchema<SchemaLike<TContext>, unknown>>(
    schema: TFormSchema,
    initial: Partial<import("./form.js").FormValues<TFormSchema>> = {},
  ): FormController<TFormSchema> {
    const bound = bindFormContext(schema, this.runtime.context);
    return this.runtime.adapter(
      createFormController(bound, initial, async (payload, options) =>
        this[preparedMutation]("create", undefined, payload, options),
      ),
    ) as FormController<TFormSchema>;
  }

  async action<K extends keyof TActions & string>(
    name: K,
    input: ActionInput<TActions[K]>,
  ): Promise<ActionOutput<TSchema, TViews, TActions[K]>> {
    return this.executeAction(name, input);
  }

  runOperation<K extends keyof TActions & string>(
    name: K,
    input: ActionInput<TActions[K]>,
    options: MutationRequestOptions = {},
  ): Promise<ActionOutput<TSchema, TViews, TActions[K]>> {
    return this.executeAction(name, input, options);
  }

  operation<K extends keyof TActions & string>(
    name: K,
    input: ActionInput<TActions[K]>,
  ): ActionController<ActionOutput<TSchema, TViews, TActions[K]>> {
    return this.runtime.adapter(
      new ActionController((options) => this.executeAction(name, input, options)),
    ) as ActionController<ActionOutput<TSchema, TViews, TActions[K]>>;
  }

  private async executeAction<K extends keyof TActions & string>(
    name: K,
    input: ActionInput<TActions[K]>,
    options: MutationRequestOptions = {},
  ): Promise<ActionOutput<TSchema, TViews, TActions[K]>> {
    const action = this.definition.actions[name];
    if (!action)
      throw new Error(`Action ${name} is not defined on resource ${this.definition.name}`);
    if (this.definition.source.kind === "local") {
      if (!action.local) throw new Error(`Local action ${name} requires a local handler`);
      const localOutput = await action.local(input, this.runtime.context());
      if (localOutput === undefined)
        return localOutput as ActionOutput<TSchema, TViews, TActions[K]>;
      const output = this.processActionOutput(action, localOutput);
      this.invalidateAfterAction(action);
      return output as ActionOutput<TSchema, TViews, TActions[K]>;
    }
    const encodedInput = action.input ? action.input.writeInput(input) : input;
    const request = action.request?.(input as never);
    const path =
      request?.path ??
      (typeof action.path === "function"
        ? action.path(input as never)
        : (action.path ?? `${name}/`));
    const method = request?.method ?? action.method ?? "POST";
    const controller = new AbortController();
    const response = await this.runtime.request<unknown>(
      `${this.runtime.scope()}|${this.definition.name}|action|${name}|${stableSerialize(input)}`,
      {
        method,
        url: joinUrl(this.runtime.baseUrl, joinUrl(this.definition.url, path)),
        ...(request?.query ? { query: request.query } : {}),
        ...(method !== "GET" ? { body: request?.body ?? encodedInput } : {}),
        ...((request?.encoding ?? action.encoding)
          ? { encoding: request?.encoding ?? action.encoding }
          : {}),
        ...((request?.multipart ?? action.multipart)
          ? { multipart: request?.multipart ?? action.multipart }
          : {}),
        ...(options.onUploadProgress ? { onUploadProgress: options.onUploadProgress } : {}),
        authentication: options.authentication ?? action.auth,
        ...(options.credentials ? { credentials: options.credentials } : {}),
      },
      combineSignals(controller.signal, options.signal),
      [...(action.errorAdapters ?? []), ...this.definition.errorAdapters],
    );
    const output = this.processActionOutput(action, response.data);
    this.invalidateAfterAction(action);
    return output as ActionOutput<TSchema, TViews, TActions[K]>;
  }

  readonly bulk = {
    remove: async (keys: readonly TKey[]): Promise<BulkResult<TKey, Infer<TSchema>>> => {
      const succeeded: TKey[] = [];
      const failed: { key: TKey; failure: NormalizedFailure }[] = [];
      for (const key of keys) {
        try {
          await this.remove(key);
          succeeded.push(key);
        } catch (error) {
          failed.push({ key, failure: normalizeFailure(error) });
        }
      }
      return Object.freeze({ succeeded, failed, values: [] });
    },
    action: async <K extends keyof TActions & string>(
      name: K,
      keys: readonly TKey[],
      input: ActionInput<TActions[K]>,
    ): Promise<BulkResult<TKey, ActionOutput<TSchema, TViews, TActions[K]>>> => {
      const action = this.definition.actions[name];
      if (!action?.bulk)
        throw new Error(`Action ${name} does not define bulk behavior on ${this.definition.name}`);
      const method = action.bulk.method ?? action.method ?? "POST";
      const path = action.bulk.path ?? `${name}/bulk/`;
      const controller = new AbortController();
      const response = await this.runtime.request<unknown>(
        `${this.runtime.scope()}|${this.definition.name}|bulk|${name}|${stableSerialize({ keys, input })}`,
        {
          method,
          url: joinUrl(this.runtime.baseUrl, joinUrl(this.definition.url, path)),
          ...(method !== "GET"
            ? { body: action.bulk.encode?.(keys, input) ?? { keys, input } }
            : { query: { keys, input } }),
          authentication: action.auth,
        },
        controller.signal,
        [...(action.errorAdapters ?? []), ...this.definition.errorAdapters],
      );
      const decoded = action.bulk.decode?.(response.data, keys) ?? {
        succeeded: keys,
        failed: [],
        values: Array.isArray(response.data)
          ? response.data
          : response.data === undefined
            ? []
            : [response.data],
      };
      const values = decoded.values.map((value) => this.processActionOutput(action, value));
      this.invalidateAfterAction(action);
      return Object.freeze({
        succeeded: decoded.succeeded as readonly TKey[],
        failed: decoded.failed as readonly {
          readonly key: TKey;
          readonly failure: NormalizedFailure;
        }[],
        values: Object.freeze(values) as readonly ActionOutput<TSchema, TViews, TActions[K]>[],
      });
    },
  };

  [preparedMutation](
    operationName: "create" | "replace" | "update",
    key: TKey | undefined,
    payload: unknown,
    options: MutationRequestOptions,
  ): Promise<Readonly<Infer<TSchema>> | undefined> {
    const method =
      operationName === "create" ? "POST" : operationName === "replace" ? "PUT" : "PATCH";
    const path =
      key === undefined ? this.definition.url : `${this.definition.url}${this.encodeKey(key)}/`;
    return this.mutate(operationName, method, path, payload, key, options, true);
  }

  private async mutate(
    operationName: "create" | "replace" | "update",
    method: "POST" | "PUT" | "PATCH",
    path: string,
    input: unknown,
    key?: TKey,
    options: MutationRequestOptions = {},
    prepared = false,
  ): Promise<Readonly<Infer<TSchema>> | undefined> {
    const startedAt = this.runtime.timestamp();
    const controller = new AbortController();
    const operation = this.definition.actions[operationName];
    if (this.definition.source.kind === "local") return this.mutateLocal(operationName, input, key);
    const relativeDefault = path.startsWith(this.definition.url)
      ? path.slice(this.definition.url.length)
      : path;
    const inputSchema = operation?.input ?? this.definition.schema;
    const encodedInput = prepared
      ? input
      : inputSchema.writeInput(input, { partial: operationName === "update" });
    const operationRelative = operationPath(operation, relativeDefault, {
      key,
      input,
    });
    const request = operation?.request?.(input);
    const response = await this.runtime.request<unknown>(
      `${this.runtime.scope()}|${this.definition.name}|${method}|${key ?? "new"}`,
      {
        method: request?.method ?? operation?.method ?? method,
        url: joinUrl(
          this.runtime.baseUrl,
          joinUrl(this.definition.url, request?.path ?? operationRelative),
        ),
        body: request?.body ?? encodedInput,
        ...(request?.query ? { query: request.query } : {}),
        ...((request?.encoding ?? operation?.encoding ?? options.encoding)
          ? {
              encoding: request?.encoding ?? operation?.encoding ?? options.encoding,
            }
          : {}),
        ...((request?.multipart ?? operation?.multipart ?? options.multipart)
          ? {
              multipart: request?.multipart ?? operation?.multipart ?? options.multipart,
            }
          : {}),
        ...(options.onUploadProgress ? { onUploadProgress: options.onUploadProgress } : {}),
        authentication: options.authentication ?? operation?.auth,
        ...(options.credentials ? { credentials: options.credentials } : {}),
      },
      combineSignals(controller.signal, options.signal),
      [...(operation?.errorAdapters ?? []), ...this.definition.errorAdapters],
    );
    const address = this.runtime.address(this.definition.name);
    if (response.data === undefined) {
      if (key !== undefined) this.runtime.cache.invalidateEntity(address, this.encodeKey(key));
      this.runtime.cache.invalidateResource(address);
      return undefined;
    }
    const value = normalizeEntity(
      this.runtime,
      toRuntimeDefinition(this.definition),
      response.data,
      key,
      startedAt,
    ) as Readonly<Infer<TSchema>>;
    this.runtime.cache.invalidateResource(address);
    return value;
  }

  private async mutateLocal(
    operationName: "create" | "replace" | "update",
    input: unknown,
    key?: TKey,
  ): Promise<Readonly<Infer<TSchema>>> {
    const address = this.runtime.address(this.definition.name);
    const encodedKey = key === undefined ? undefined : this.encodeKey(key);
    const current =
      encodedKey === undefined ? undefined : this.runtime.cache.entity(address, encodedKey);
    let candidate: Readonly<Record<string, unknown>>;
    if (operationName === "update") {
      if (!current || current.tombstone)
        throw new RequestError({
          kind: "not-found",
          status: 404,
          message: `Entity ${String(key)} was not found`,
          issues: [],
          retryable: false,
        });
      candidate = {
        ...current.data,
        ...this.definition.schema.parsePartial(input),
      };
    } else {
      candidate = this.definition.schema.parsePartial(input);
    }
    let resolvedKey = encodedKey;
    if (resolvedKey === undefined) {
      try {
        resolvedKey = keyFromPartial(this.definition, candidate);
      } catch (error) {
        const source = this.definition.source;
        if (source.kind !== "local" || !source.generateKey) throw error;
        resolvedKey = source.generateKey({
          value: candidate,
          existing: localMasterKeys(this.runtime, this.definition),
          context: this.runtime.context(),
        });
        if (typeof this.definition.key === "string")
          candidate = { ...candidate, [this.definition.key]: resolvedKey };
      }
    }
    if (operationName === "create") {
      const existing = this.runtime.cache.entity(address, resolvedKey);
      if (existing && !existing.tombstone) throw new CacheConflictError(resolvedKey);
    }
    const parsed = this.definition.schema.parse(candidate);
    const value = normalizeEntity(this.runtime, this.definition, parsed, resolvedKey) as Readonly<
      Infer<TSchema>
    >;
    addLocalMasterKey(this.runtime, this.definition, resolvedKey);
    this.defaultCollection.cacheAddKey(resolvedKey);
    return value;
  }

  private processActionOutput(action: ActionMap<TContext>[string], data: unknown): unknown {
    if (data === undefined) return undefined;
    if (action.output) return action.output.parse(data);
    if (action.view) {
      const view = this.definition.views[action.view];
      if (!view) throw new Error(`View ${action.view} is not defined`);
      const partial = this.definition.schema.parsePartial(data);
      const key = keyFromPartial(this.definition, partial);
      normalizeEntity(this.runtime, toRuntimeDefinition(this.definition), data, key as TKey);
      return view.materialize(partial as never);
    }
    return normalizeEntity(this.runtime, toRuntimeDefinition(this.definition), data);
  }

  private invalidateAfterAction(action: ActionMap<TContext>[string]): void {
    if (action.invalidate === "resource" || action.invalidate === "collections")
      this.runtime.cache.invalidateResource(this.runtime.address(this.definition.name));
  }

  private encodeKey(key: TKey): EntityKey {
    return this.definition.keyEncoder?.(key) ?? key;
  }
}

export interface LoadOptions {
  readonly policy?: CachePolicy;
  readonly signal?: AbortSignal;
}

export type MutationRequestOptions = Partial<
  Pick<FormSubmitOptions, "signal" | "encoding" | "multipart" | "onUploadProgress">
> & {
  readonly authentication?: AuthExecutionRole;
  readonly credentials?: RequestCredentials;
};

export interface ObjectSnapshot<T> extends ControllerState {
  readonly key: EntityKey;
  readonly value?: Readonly<T>;
  readonly stale: boolean;
}

export class ResourceObject<T, TKey extends EntityKey, TContext> implements ExternalStore<
  ObjectSnapshot<T>
> {
  private readonly store: Store<ObjectSnapshot<T>>;
  private controller = new AbortController();
  private generation = 0;
  private unsubscribeCache: () => void;
  private readonly unsubscribeContext: () => void;
  private relationSubscriptions: (() => void)[] = [];
  private readonly relationControllers = new Map<string, ExternalStore<object>>();
  private readonly throughCollections = new Map<
    string,
    CollectionController<Readonly<Record<string, unknown>>, EntityKey, TContext>
  >();
  private readonly throughUnsubscribers = new Map<string, () => void>();
  private readonly throughEntrySnapshots = new Map<
    string,
    readonly Readonly<Record<string, unknown>>[]
  >();
  private committingRelation = false;
  private boundKey: EntityKey;

  constructor(
    private readonly runtime: Runtime<TContext>,
    private readonly definition: RuntimeDefinition<TContext>,
    private readonly keySource: TKey | (() => TKey),
  ) {
    this.boundKey = this.encodeRawKey(this.rawKey());
    this.store = new Store(this.snapshot(false, this.boundKey));
    this.unsubscribeCache = this.subscribeKey(this.boundKey);
    this.rebindRelations(this.boundKey);
    this.unsubscribeContext = this.runtime.subscribeContext(() => {
      this.store.update((state) => ({
        ...state,
        revision: state.revision + 1,
        value: this.currentValue() as Readonly<T> | undefined,
      }));
    });
  }

  get key(): TKey {
    const key = this.rawKey();
    this.ensureBinding(this.encodeRawKey(key));
    return key;
  }
  get value(): Readonly<T> | undefined {
    return this.currentValue() as Readonly<T> | undefined;
  }
  get loading(): boolean {
    return this.store.getSnapshot().loading;
  }
  get error(): NormalizedFailure | undefined {
    return this.store.getSnapshot().error;
  }
  get stale(): boolean {
    return this.isStale();
  }

  getSnapshot(): ObjectSnapshot<T> {
    return this.store.getSnapshot();
  }
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  async load(options: LoadOptions = {}): Promise<Readonly<T> | undefined> {
    const cacheKey = this.encodedKey();
    if (this.definition.source.kind === "local") return this.value;
    const policy = options.policy ?? this.runtime.cachePolicy;
    const hydration =
      policy === "cache-first" ? this.runtime.awaitCache(this.runtime.scope()) : undefined;
    if (hydration) await hydration;
    const entry = this.runtime.cache.entity(this.address(), cacheKey);
    if (entry && !entry.tombstone && policy === "stale-while-revalidate") {
      void this.load({ ...options, policy: "network-only" }).catch(() => undefined);
      return this.value;
    }
    if (entry && !entry.tombstone && policy === "cache-first" && entry.staleAt > Date.now())
      return this.value;
    this.controller.abort();
    this.controller = new AbortController();
    const generation = ++this.generation;
    this.store.update((state) => ({
      ...state,
      revision: state.revision + 1,
      loading: true,
    }));
    const startedAt = this.runtime.timestamp();
    try {
      const retrieve = this.definition.actions.retrieve;
      const path = operationPath(retrieve, `${cacheKey}/`, { key: this.key });
      const response = await this.runtime.request<unknown>(
        `${this.runtime.scope()}|${this.definition.name}|get|${cacheKey}`,
        {
          method: retrieve?.method ?? "GET",
          url: joinUrl(this.runtime.baseUrl, joinUrl(this.definition.url, path)),
          authentication: retrieve?.auth,
        },
        combineSignals(this.controller.signal, options.signal),
        [...(retrieve?.errorAdapters ?? []), ...this.definition.errorAdapters],
      );
      normalizeEntity(this.runtime, this.definition, response.data, this.key, startedAt);
      await this.loadEagerRelations();
      if (generation === this.generation)
        this.store.update((state) => ({
          ...this.snapshot(false),
          revision: state.revision + 1,
          loading: false,
        }));
      return this.value;
    } catch (error) {
      if (generation === this.generation)
        this.store.update((state) => ({
          ...state,
          revision: state.revision + 1,
          loading: false,
          error: normalizeFailure(error),
        }));
      throw error;
    }
  }

  refresh(): Promise<Readonly<T> | undefined> {
    return this.load({ policy: "network-only" });
  }
  invalidate(): void {
    this.runtime.cache.invalidateEntity(this.address(), this.encodedKey());
  }
  cancel(): void {
    this.generation += 1;
    this.controller.abort();
    this.store.update((state) => ({
      ...state,
      revision: state.revision + 1,
      loading: false,
    }));
  }
  dispose(): void {
    this.cancel();
    this.unsubscribeCache();
    this.unsubscribeContext();
    for (const unsubscribe of this.relationSubscriptions) unsubscribe();
    this.relationSubscriptions = [];
    for (const unsubscribe of this.throughUnsubscribers.values()) unsubscribe();
    this.throughUnsubscribers.clear();
    for (const controller of this.relationControllers.values())
      if ("dispose" in controller && typeof controller.dispose === "function") controller.dispose();
    this.relationControllers.clear();
  }
  clearError(): void {
    this.store.update(clearObjectError);
  }

  relation<K extends keyof T & string>(
    name: K,
  ): NonNullable<T[K]> extends readonly (infer TItem)[]
    ? ToManyRelationController<TItem, TKey, TContext>
    : ToOneRelationController<NonNullable<T[K]>, TKey, TContext> {
    const existing = this.relationControllers.get(name);
    if (existing) return existing as never;
    const relation = this.relationConfig(name);
    const controller = relation.many
      ? new ToManyRelationController(this, name)
      : new ToOneRelationController(this, name);
    const adapted = this.runtime.adapter(controller);
    this.relationControllers.set(name, adapted);
    return adapted as never;
  }

  async loadRelation<K extends keyof T & string>(
    name: K,
    options: LoadOptions = {},
  ): Promise<Readonly<T>[K] | undefined> {
    const field = this.definition.schema.shape[name];
    const relation = field?.options.relation;
    if (!relation) throw new Error(`Field ${name} is not a relation on ${this.definition.name}`);
    const targetName = resourceNameOf(relation.resource);
    const target = targetName ? this.runtime.definitions.get(targetName) : undefined;
    if (!target) throw new Error(`Relation ${name} targets an unregistered resource`);
    if (relation.through) {
      await this.loadThroughRelation(name, relation, options);
      return this.value?.[name];
    }
    const key = this.encodedKey();
    const entry = this.runtime.cache.entity(this.address(), key);
    if (!entry) return undefined;
    const source = this.definition.schema.materialize(entry.data);
    const relationQuery = relation.query
      ? relation.query(source)
      : relation.to
        ? {
            [relation.to]: relation.from ? source[relation.from] : source[name],
          }
        : undefined;
    if (relationQuery) {
      const collection = new CollectionController<
        Readonly<Record<string, unknown>>,
        EntityKey,
        TContext
      >(this.runtime, target, `relation:${this.definition.name}:${name}`, undefined, relationQuery);
      collection.filter(relationQuery);
      const values = await collection.load({
        ...options,
        policy: options.policy ?? "network-only",
      });
      const keys = values.map((value) => keyFromPartial(target, value));
      const patch = relation.many ? { [name]: keys } : { [name]: keys[0] };
      this.runtime.cache.setEntity(
        this.address(),
        mergeEntity(entry, key, patch, { ttl: this.definition.ttl }),
      );
    } else {
      const relationValue = entry.data[name];
      const keys = Array.isArray(relationValue) ? relationValue : [relationValue];
      const entityKeys = keys.filter(
        (relationKey): relationKey is EntityKey =>
          typeof relationKey === "string" || typeof relationKey === "number",
      );
      if (relation.many) await this.loadTargetKeys(target, relation, entityKeys, source, options);
      else
        await Promise.all(
          entityKeys.map((relationKey) =>
            new ResourceObject(this.runtime, target, relationKey).load({
              ...options,
              policy: options.policy ?? "cache-first",
            }),
          ),
        );
    }
    return this.value?.[name];
  }

  relationValue<K extends keyof T & string>(name: K): Readonly<T>[K] | undefined {
    return this.value?.[name];
  }

  relationEntries(name: keyof T & string): readonly Readonly<Record<string, unknown>>[] {
    return this.throughEntrySnapshots.get(name) ?? [];
  }

  relationMissingKeys(name: keyof T & string): readonly EntityKey[] {
    const relation = this.relationConfig(name);
    const target = this.targetDefinition(relation);
    const entry = this.runtime.cache.entity(this.address(), this.encodedKey());
    if (!entry) return [];
    const data = this.withThroughRelations(entry.data);
    const raw = data[name];
    const keys = (Array.isArray(raw) ? raw : [raw]).filter(
      (value): value is EntityKey => typeof value === "string" || typeof value === "number",
    );
    return Object.freeze(
      keys.filter((key) => {
        const targetEntry = this.runtime.cache.entity(
          this.runtime.address(target.name),
          target.keyEncoder?.(key) ?? key,
        );
        return (
          !targetEntry || targetEntry.tombstone || !target.schema.canMaterialize(targetEntry.data)
        );
      }),
    );
  }

  async setRelation(
    name: keyof T & string,
    values: readonly unknown[] | unknown | undefined,
    action: "add" | "remove" | "set" | "clear" = "set",
  ): Promise<void> {
    const relation = this.relationConfig(name);
    const desired = relation.many
      ? Array.isArray(values)
        ? values
        : values === undefined
          ? []
          : [values]
      : values;
    if (relation.through && relation.many) {
      await this.setThroughRelation(name, relation, desired as readonly unknown[]);
      return;
    }
    if (relation.mutation?.kind === "endpoints")
      await this.mutateRelationEndpoint(name, relation.mutation, desired, action);
    else await this.mutateParentRelation(name, desired);
    this.commitRelation(name, desired);
  }

  async addRelationItem(
    name: keyof T & string,
    item: unknown,
    membershipInput: Readonly<Record<string, unknown>> = {},
  ): Promise<void> {
    const relation = this.relationConfig(name);
    if (!relation.many) throw new Error(`Relation ${name} is not a list`);
    if (relation.through) {
      await this.createThroughEntry(name, relation, item, membershipInput);
      return;
    }
    const current = (this.relationValue(name) as readonly unknown[] | undefined) ?? [];
    const key = this.targetKey(relation, item);
    if (current.some((value) => Object.is(this.targetKey(relation, value), key)))
      throw new CacheConflictError(key);
    await this.setRelation(name, [...current, item], "add");
  }

  async removeRelationItems(name: keyof T & string, keys: readonly EntityKey[]): Promise<void> {
    const relation = this.relationConfig(name);
    if (!relation.many) throw new Error(`Relation ${name} is not a list`);
    if (relation.through) {
      await this.removeThroughEntries(name, relation, keys);
      return;
    }
    const current = (this.relationValue(name) as readonly unknown[] | undefined) ?? [];
    const desired = current.filter(
      (value) => !keys.some((key) => Object.is(this.targetKey(relation, value), key)),
    );
    await this.setRelation(name, desired, "remove");
  }

  relationTargetKey(name: keyof T & string, value: unknown): EntityKey {
    return this.targetKey(this.relationConfig(name), value);
  }

  form<TFormSchema extends FormSchema<SchemaLike<TContext>, unknown>>(
    schema: TFormSchema,
  ): FormController<TFormSchema> {
    const bound = bindFormContext(schema, this.runtime.context);
    const controller = createFormController(
      bound,
      selectFormValues(bound, this.value) as never,
      async (payload, options) => {
        const resource = new Resource(this.runtime, this.definition as never);
        return resource[preparedMutation](
          bound.mode === "replace" ? "replace" : "update",
          this.key,
          payload,
          options,
        );
      },
    );
    controller.observeBase((listener) =>
      this.runtime.cache.subscribeEntity(this.address(), this.encodedKey(), listener),
    );
    return this.runtime.adapter(controller) as FormController<TFormSchema>;
  }

  private relationConfig(name: keyof T & string): RelationConfig<unknown> {
    const relation = this.definition.schema.shape[name]?.options.relation;
    if (!relation) throw new Error(`Field ${name} is not a relation on ${this.definition.name}`);
    return relation;
  }

  private targetDefinition(relation: RelationConfig<unknown>): RuntimeDefinition<TContext> {
    const targetName = resourceNameOf(relation.resource);
    const target = targetName ? this.runtime.definitions.get(targetName) : undefined;
    if (!target) throw new Error("Relation targets an unregistered resource");
    return target;
  }

  private targetKey(relation: RelationConfig<unknown>, value: unknown): EntityKey {
    if (typeof value === "string" || typeof value === "number") return value;
    if (typeof value !== "object" || value === null)
      throw new Error("Expected a relation key or entity");
    return keyFromPartial(
      this.targetDefinition(relation),
      value as Readonly<Record<string, unknown>>,
    );
  }

  private async mutateParentRelation(name: keyof T & string, desired: unknown): Promise<void> {
    const resource = new Resource(this.runtime, this.definition as never);
    await resource.update(this.key, { [name]: desired } as never);
  }

  private async mutateRelationEndpoint(
    name: keyof T & string,
    mutation: RelationEndpointMutation,
    desired: unknown,
    action: "add" | "remove" | "set" | "clear",
  ): Promise<void> {
    const relation = this.relationConfig(name);
    const values = Array.isArray(desired) ? desired : desired === undefined ? [] : [desired];
    const context = Object.freeze({
      sourceKey: this.key,
      targetKeys: Object.freeze(values.map((value) => this.targetKey(relation, value))),
    });
    const configured = mutation[action] ?? (action === "clear" ? mutation.set : undefined);
    if (!configured) throw new Error(`Relation ${name} does not define a ${action} endpoint`);
    const path = typeof configured === "function" ? configured(context) : configured;
    const response = await this.runtime.request<unknown>(
      `${this.runtime.scope()}|${this.definition.name}|relation|${name}|${action}|${stableSerialize(context.targetKeys)}`,
      {
        method: mutation.method ?? "POST",
        url: joinUrl(this.runtime.baseUrl, joinUrl(this.definition.url, path)),
        body:
          mutation.body?.(action, context) ??
          (relation.many ? { keys: context.targetKeys } : { key: context.targetKeys[0] ?? null }),
      },
      new AbortController().signal,
      this.definition.errorAdapters,
    );
    if (response.data !== undefined && typeof response.data === "object" && response.data !== null)
      try {
        normalizeEntity(this.runtime, this.definition, response.data, this.key);
      } catch {
        // Relation endpoints may return acknowledgements rather than parent objects.
      }
  }

  private commitRelation(name: keyof T & string, desired: unknown): void {
    const entry = this.runtime.cache.entity(this.address(), this.encodedKey());
    if (!entry) return;
    const relation = this.relationConfig(name);
    const value = relation.many
      ? (Array.isArray(desired) ? desired : []).map((item) => this.targetKey(relation, item))
      : desired === undefined || desired === null
        ? null
        : this.targetKey(relation, desired);
    const current = entry.data[name];
    if (
      Array.isArray(current) &&
      Array.isArray(value) &&
      current.length === value.length &&
      current.every((item, index) => Object.is(item, value[index]))
    )
      return;
    if (!Array.isArray(current) && !Array.isArray(value) && Object.is(current, value)) return;
    this.committingRelation = true;
    try {
      this.runtime.cache.setEntity(
        this.address(),
        mergeEntity(entry, this.encodedKey(), { [name]: value }, { ttl: this.definition.ttl }),
      );
    } finally {
      this.committingRelation = false;
    }
    this.rebindRelations(this.encodedKey());
    this.store.update((state) => ({
      ...state,
      revision: state.revision + 1,
      value: this.currentValue() as Readonly<T> | undefined,
      stale: this.isStale(),
    }));
  }

  private throughDefinition(relation: RelationConfig<unknown>): RuntimeDefinition<TContext> {
    const name = resourceNameOf(relation.through?.resource);
    const definition = name ? this.runtime.definitions.get(name) : undefined;
    if (!definition) throw new Error("Through relation targets an unregistered join resource");
    return definition;
  }

  private throughCollection(
    name: keyof T & string,
    relation: RelationConfig<unknown>,
  ): CollectionController<Readonly<Record<string, unknown>>, EntityKey, TContext> {
    const existing = this.throughCollections.get(name);
    if (existing) return existing;
    const through = relation.through!;
    const definition = this.throughDefinition(relation);
    const input = Object.freeze({ [through.source]: this.key });
    const collection = new CollectionController<
      Readonly<Record<string, unknown>>,
      EntityKey,
      TContext
    >(
      this.runtime,
      definition,
      `through:${this.definition.name}:${name}:${String(this.key)}`,
      {
        subscribeRelations: false,
        local: (value) => {
          const sourceField = definition.schema.shape[through.source]?.options.relation;
          const source = value[through.source];
          return sourceField
            ? Object.is(this.targetKey(sourceField, source), this.key)
            : Object.is(source, this.key);
        },
      },
      input,
    );
    collection.filter(input);
    this.throughCollections.set(name, collection);
    this.throughUnsubscribers.set(
      name,
      collection.subscribe(() => {
        this.syncThroughRelation(name, relation);
        this.publishThroughValue();
      }),
    );
    return collection;
  }

  private async loadThroughRelation(
    name: keyof T & string,
    relation: RelationConfig<unknown>,
    options: LoadOptions = {},
  ): Promise<void> {
    const collection = this.throughCollection(name, relation);
    await collection.load({
      ...options,
      policy:
        options.policy ??
        (this.throughDefinition(relation).source.kind === "local" ? "cache-first" : "network-only"),
    });
    this.syncThroughRelation(name, relation);
    const sourceEntry = this.runtime.cache.entity(this.address(), this.encodedKey());
    if (sourceEntry) {
      const target = this.targetDefinition(relation);
      const through = relation.through!;
      const join = this.throughDefinition(relation);
      const targetRelation = join.schema.shape[through.target]?.options.relation;
      const keys = collection[rawCollectionEntries]().flatMap((entry) => {
        const value = entry[through.target];
        try {
          return [targetRelation ? this.targetKey(targetRelation, value) : (value as EntityKey)];
        } catch {
          return [];
        }
      });
      await this.loadTargetKeys(
        target,
        relation,
        keys,
        this.definition.schema.materialize(sourceEntry.data),
        options,
      );
    }
    this.syncThroughRelation(name, relation);
    this.publishThroughValue();
  }

  private async loadTargetKeys(
    target: RuntimeDefinition<TContext>,
    relation: RelationConfig<unknown>,
    keys: readonly EntityKey[],
    source: Readonly<Record<string, unknown>>,
    options: LoadOptions,
  ): Promise<void> {
    if (target.source.kind === "local" || !keys.length) return;
    const policy = options.policy ?? "cache-first";
    const candidates = [...new Set(keys)].filter((key) => {
      if (policy === "network-only") return true;
      const entry = this.runtime.cache.entity(
        this.runtime.address(target.name),
        target.keyEncoder?.(key) ?? key,
      );
      return !entry || entry.tombstone || entry.staleAt <= Date.now();
    });
    if (!candidates.length) return;
    const canonical = [...candidates].sort((left, right) =>
      String(left).localeCompare(String(right)),
    );
    const fetch = (relation.fetch ??
      this.runtime.relationDefaults?.byKeys ??
      {}) as RelationKeyFetchOptions<TContext>;
    const query = encodeRelationKeys(fetch, canonical, source, this.runtime.context());
    const response = await this.runtime.request<unknown>(
      `${this.runtime.scope()}|${target.name}|relation-keys|${stableSerialize({ path: fetch.path, query })}`,
      {
        method: "GET",
        url: joinUrl(this.runtime.baseUrl, joinUrl(target.url, fetch.path ?? "")),
        query,
      },
      combineSignals(new AbortController().signal, options.signal),
      [...(fetch.errorAdapters ?? []), ...target.errorAdapters],
    );
    const items = fetch.decode
      ? fetch.decode(response)
      : Array.isArray(response.data)
        ? response.data
        : target.pagination.response(response).items;
    const startedAt = this.runtime.timestamp();
    for (const item of items) normalizeEntity(this.runtime, target, item, undefined, startedAt);
  }

  private syncThroughRelation(name: keyof T & string, relation: RelationConfig<unknown>): void {
    const through = relation.through!;
    const entries = this.throughCollections.get(name)?.all() ?? [];
    const ordered = through.orderBy
      ? [...entries].sort((left, right) =>
          compareRelationValues(left[through.orderBy!], right[through.orderBy!]),
        )
      : entries;
    this.throughEntrySnapshots.set(name, Object.freeze([...ordered]));
  }

  private publishThroughValue(): void {
    this.store.update((state) => ({
      ...state,
      revision: state.revision + 1,
      value: this.currentValue() as Readonly<T> | undefined,
    }));
  }

  private async createThroughEntry(
    name: keyof T & string,
    relation: RelationConfig<unknown>,
    target: unknown,
    membershipInput: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    if (!this.throughCollections.has(name)) await this.loadThroughRelation(name, relation);
    const targetKey = this.targetKey(relation, target);
    const currentKeys = ((this.relationValue(name) as readonly unknown[] | undefined) ?? []).map(
      (value) => this.targetKey(relation, value),
    );
    if (!relation.through?.allowDuplicates && currentKeys.some((key) => Object.is(key, targetKey)))
      throw new CacheConflictError(targetKey);
    const through = relation.through!;
    const definition = this.throughDefinition(relation);
    const resource = new Resource(this.runtime, definition as never);
    await resource.create({
      ...membershipInput,
      [through.source]: this.key,
      [through.target]: target,
    } as never);
    if (definition.source.kind === "http") await this.loadThroughRelation(name, relation);
    else {
      this.syncThroughRelation(name, relation);
      this.publishThroughValue();
    }
  }

  private async removeThroughEntries(
    name: keyof T & string,
    relation: RelationConfig<unknown>,
    targetKeys: readonly EntityKey[],
  ): Promise<void> {
    if (!this.throughCollections.has(name)) await this.loadThroughRelation(name, relation);
    const through = relation.through!;
    const definition = this.throughDefinition(relation);
    const targetRelation = definition.schema.shape[through.target]?.options.relation;
    const entries = this.relationEntries(name).filter((entry) => {
      const value = entry[through.target];
      const key = targetRelation ? this.targetKey(targetRelation, value) : (value as EntityKey);
      return targetKeys.some((targetKey) => Object.is(targetKey, key));
    });
    const resource = new Resource(this.runtime, definition as never);
    for (const entry of entries) await resource.remove(keyFromPartial(definition, entry) as never);
    if (definition.source.kind === "http") await this.loadThroughRelation(name, relation);
    else {
      this.syncThroughRelation(name, relation);
      this.publishThroughValue();
    }
  }

  private async setThroughRelation(
    name: keyof T & string,
    relation: RelationConfig<unknown>,
    desired: readonly unknown[],
  ): Promise<void> {
    if (!this.throughCollections.has(name)) await this.loadThroughRelation(name, relation);
    const current = (this.relationValue(name) as readonly unknown[] | undefined) ?? [];
    const currentKeys = current.map((value) => this.targetKey(relation, value));
    const desiredKeys = desired.map((value) => this.targetKey(relation, value));
    await this.removeThroughEntries(
      name,
      relation,
      currentKeys.filter((key) => !desiredKeys.some((desiredKey) => Object.is(key, desiredKey))),
    );
    for (const value of desired)
      if (!currentKeys.some((key) => Object.is(key, this.targetKey(relation, value))))
        await this.createThroughEntry(name, relation, value, {});
  }

  private currentValue(key = this.encodedKey()): unknown {
    const entry = this.runtime.cache.entity(this.address(), key);
    if (!entry || entry.tombstone || !this.definition.schema.canMaterialize(entry.data))
      return undefined;
    const data = this.withThroughRelations(entry.data);
    return !canShareSnapshot(this.definition)
      ? this.definition.schema.materialize(
          resolveRelationValues(this.runtime, this.definition, data),
        )
      : (entry.snapshot ?? this.definition.schema.materialize(data));
  }

  private withThroughRelations(
    data: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>> {
    let output: Record<string, unknown> | undefined;
    for (const [name, entries] of this.throughEntrySnapshots) {
      const relation = this.definition.schema.shape[name]?.options.relation;
      const through = relation?.through;
      if (!relation || !through) continue;
      const join = this.throughDefinition(relation);
      const targetRelation = join.schema.shape[through.target]?.options.relation;
      const keys = entries.flatMap((entry) => {
        const target = entry[through.target];
        try {
          return [targetRelation ? this.targetKey(targetRelation, target) : (target as EntityKey)];
        } catch {
          return [];
        }
      });
      output ??= { ...data };
      output[name] = keys;
    }
    return output ? Object.freeze(output) : data;
  }

  private snapshot(loading: boolean, key = this.encodedKey()): ObjectSnapshot<T> {
    return Object.freeze({
      key,
      value: this.currentValue(key) as Readonly<T> | undefined,
      stale: this.isStale(key),
      loading,
      revision: 0,
    });
  }

  private isStale(key = this.encodedKey()): boolean {
    const entry = this.runtime.cache.entity(this.address(), key);
    return !entry || entry.staleAt <= Date.now();
  }

  private address(): CacheAddress {
    return this.runtime.address(this.definition.name);
  }
  private encodedKey(): EntityKey {
    const key = this.rawKey();
    const encoded = this.encodeRawKey(key);
    this.ensureBinding(encoded);
    return encoded;
  }
  private subscribeKey(key: EntityKey): () => void {
    return this.runtime.cache.subscribeEntity(this.address(), key, () => {
      if (this.committingRelation) return;
      this.rebindRelations(key);
      const value = this.currentValue() as Readonly<T> | undefined;
      this.store.update((state) => ({
        ...state,
        revision: state.revision + 1,
        value,
        stale: this.isStale(),
      }));
    });
  }

  private rawKey(): TKey {
    return typeof this.keySource === "function" ? (this.keySource as () => TKey)() : this.keySource;
  }
  private encodeRawKey(key: TKey): EntityKey {
    return this.definition.keyEncoder?.(key) ?? key;
  }
  private ensureBinding(key: EntityKey): void {
    if (Object.is(key, this.boundKey)) return;
    this.unsubscribeCache();
    for (const unsubscribe of this.relationSubscriptions) unsubscribe();
    this.boundKey = key;
    this.unsubscribeCache = this.subscribeKey(key);
    this.rebindRelations(key);
    this.store.update((state) => ({
      ...this.snapshot(state.loading, key),
      revision: state.revision + 1,
    }));
  }

  private rebindRelations(key: EntityKey): void {
    for (const unsubscribe of this.relationSubscriptions) unsubscribe();
    const entry = this.runtime.cache.entity(this.address(), key);
    this.relationSubscriptions = entry
      ? subscribeRelationEntries(this.runtime, this.definition, entry.data, () => {
          this.store.update((state) => ({
            ...state,
            revision: state.revision + 1,
            value: this.currentValue(key) as Readonly<T> | undefined,
          }));
        })
      : [];
  }

  private async loadEagerRelations(): Promise<void> {
    const names = Object.entries(this.definition.schema.shape).flatMap(([name, field]) =>
      field.options.relation?.load === "eager" ? [name] : [],
    );
    for (const name of names) await this.loadRelation(name as keyof T & string);
  }
}

export interface ToOneRelationSnapshot<T> extends ControllerState {
  readonly value?: Readonly<T>;
  readonly stale: boolean;
}

export class ToOneRelationController<
  TItem,
  TKey extends EntityKey,
  TContext,
  TParent = Readonly<Record<string, unknown>>,
> implements ExternalStore<ToOneRelationSnapshot<TItem>> {
  private readonly store: Store<ToOneRelationSnapshot<TItem>>;
  private readonly unsubscribeOwner: () => void;

  constructor(
    private readonly owner: ResourceObject<TParent, TKey, TContext>,
    private readonly name: keyof TParent & string,
  ) {
    this.store = new Store(this.snapshot());
    this.unsubscribeOwner = owner.subscribe(() => this.changed());
  }

  get value(): Readonly<TItem> | undefined {
    const value = this.owner.relationValue(this.name);
    return value === null ? undefined : (value as Readonly<TItem> | undefined);
  }
  get loading(): boolean {
    return this.store.getSnapshot().loading;
  }
  get error(): NormalizedFailure | undefined {
    return this.store.getSnapshot().error;
  }
  get stale(): boolean {
    return this.owner.stale;
  }
  getSnapshot(): ToOneRelationSnapshot<TItem> {
    return this.store.getSnapshot();
  }
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  async load(): Promise<Readonly<TItem> | undefined> {
    return this.run(async () => {
      await this.owner.loadRelation(this.name);
      return this.value;
    });
  }

  async set(value: TItem | EntityKey): Promise<void> {
    await this.run(() => this.owner.setRelation(this.name, value));
  }

  async clear(): Promise<void> {
    await this.run(() => this.owner.setRelation(this.name, undefined, "clear"));
  }

  dispose(): void {
    this.unsubscribeOwner();
  }

  private snapshot(): ToOneRelationSnapshot<TItem> {
    return Object.freeze({
      revision: 0,
      loading: false,
      value: this.value,
      stale: this.stale,
    });
  }

  private changed(): void {
    this.store.update((state) => ({
      ...state,
      revision: state.revision + 1,
      value: this.value,
      stale: this.stale,
    }));
  }

  private async run<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    this.store.update((state) => ({
      ...state,
      revision: state.revision + 1,
      loading: true,
      error: undefined,
    }));
    try {
      const result = await operation();
      this.store.update((state) => ({
        ...state,
        revision: state.revision + 1,
        loading: false,
        value: this.value,
        stale: this.stale,
      }));
      return result;
    } catch (error) {
      this.store.update((state) => ({
        ...state,
        revision: state.revision + 1,
        loading: false,
        error: normalizeFailure(error),
      }));
      throw error;
    }
  }
}

export interface ToManyRelationSnapshot<T> extends ControllerState {
  readonly values: readonly Readonly<T>[];
  readonly entries: readonly Readonly<Record<string, unknown>>[];
  readonly stale: boolean;
  readonly missingKeys: readonly EntityKey[];
}

export class ToManyRelationController<
  TItem,
  TKey extends EntityKey,
  TContext,
  TParent = Readonly<Record<string, unknown>>,
> implements ExternalStore<ToManyRelationSnapshot<TItem>> {
  private readonly store: Store<ToManyRelationSnapshot<TItem>>;
  private readonly unsubscribeOwner: () => void;
  private controller = new AbortController();

  constructor(
    private readonly owner: ResourceObject<TParent, TKey, TContext>,
    private readonly name: keyof TParent & string,
  ) {
    this.store = new Store(this.snapshot());
    this.unsubscribeOwner = owner.subscribe(() => this.changed());
  }

  get values(): readonly Readonly<TItem>[] {
    const value = this.owner.relationValue(this.name);
    return (Array.isArray(value) ? value : []) as readonly Readonly<TItem>[];
  }
  get entries(): readonly Readonly<Record<string, unknown>>[] {
    return this.owner.relationEntries(this.name);
  }
  get loading(): boolean {
    return this.store.getSnapshot().loading;
  }
  get error(): NormalizedFailure | undefined {
    return this.store.getSnapshot().error;
  }
  get stale(): boolean {
    return this.owner.stale;
  }
  get missingKeys(): readonly EntityKey[] {
    return this.owner.relationMissingKeys(this.name);
  }
  getSnapshot(): ToManyRelationSnapshot<TItem> {
    return this.store.getSnapshot();
  }
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  async load(options: LoadOptions = {}): Promise<readonly Readonly<TItem>[]> {
    this.controller.abort();
    this.controller = new AbortController();
    return this.run(async () => {
      await this.owner.loadRelation(this.name, {
        ...options,
        signal: combineSignals(this.controller.signal, options.signal),
      });
      return this.values;
    });
  }

  refresh(): Promise<readonly Readonly<TItem>[]> {
    return this.load({ policy: "network-only" });
  }

  cancel(): void {
    this.controller.abort();
    this.store.update((state) => ({
      ...state,
      revision: state.revision + 1,
      loading: false,
    }));
  }

  async add(
    value: TItem | EntityKey,
    membershipInput: Readonly<Record<string, unknown>> = {},
  ): Promise<void> {
    await this.run(() => this.owner.addRelationItem(this.name, value, membershipInput));
  }

  async addMany(values: readonly (TItem | EntityKey)[]): Promise<void> {
    for (const value of values) await this.add(value);
  }

  async remove(key: EntityKey): Promise<void> {
    await this.run(() => this.owner.removeRelationItems(this.name, [key]));
  }

  async removeMany(keys: readonly EntityKey[]): Promise<void> {
    await this.run(() => this.owner.removeRelationItems(this.name, keys));
  }

  async set(values: readonly (TItem | EntityKey)[]): Promise<void> {
    await this.run(() => this.owner.setRelation(this.name, values, "set"));
  }

  async clear(): Promise<void> {
    await this.run(() => this.owner.setRelation(this.name, [], "clear"));
  }

  dispose(): void {
    this.cancel();
    this.unsubscribeOwner();
  }

  private snapshot(): ToManyRelationSnapshot<TItem> {
    return Object.freeze({
      revision: 0,
      loading: false,
      values: this.values,
      entries: this.entries,
      stale: this.stale,
      missingKeys: this.missingKeys,
    });
  }

  private changed(): void {
    this.store.update((state) => ({
      ...state,
      revision: state.revision + 1,
      values: this.values,
      entries: this.entries,
      stale: this.stale,
      missingKeys: this.missingKeys,
    }));
  }

  private async run<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    this.store.update((state) => ({
      ...state,
      revision: state.revision + 1,
      loading: true,
      error: undefined,
    }));
    try {
      const result = await operation();
      this.store.update((state) => ({
        ...state,
        revision: state.revision + 1,
        loading: false,
        values: this.values,
        entries: this.entries,
        stale: this.stale,
        missingKeys: this.missingKeys,
      }));
      return result;
    } catch (error) {
      this.store.update((state) => ({
        ...state,
        revision: state.revision + 1,
        loading: false,
        error: normalizeFailure(error),
      }));
      throw error;
    }
  }
}

export interface CollectionSnapshot<T> extends ControllerState {
  readonly values: readonly Readonly<T>[];
  readonly pageInfo?: unknown;
  readonly stale: boolean;
}

export class CollectionController<T, TKey extends EntityKey, TContext> implements ExternalStore<
  CollectionSnapshot<T>
> {
  declare readonly _key?: TKey;
  private filters: Readonly<Record<string, unknown>> = {};
  private sortState?: { readonly field: string; readonly descending: boolean };
  private pageState: PageState = { index: 1, size: 25 };
  private accumulating = false;
  private accumulatedKeys: EntityKey[] = [];
  private readonly store = new Store<CollectionSnapshot<T>>({
    revision: 0,
    loading: false,
    values: [],
    stale: true,
  });
  private controller = new AbortController();
  private generation = 0;
  private subscriptions: (() => void)[] = [];
  private unregisterLiveCollection?: () => void;

  constructor(
    private readonly runtime: Runtime<TContext>,
    private readonly definition: RuntimeDefinition<TContext>,
    private readonly queryName: string,
    private readonly queryDefinition?: RuntimeQuery<TContext>,
    private readonly inputSource?:
      Readonly<Record<string, unknown>> | (() => Readonly<Record<string, unknown>>),
  ) {
    this.rebind();
  }

  get loading(): boolean {
    return this.store.getSnapshot().loading;
  }
  get error(): NormalizedFailure | undefined {
    return this.store.getSnapshot().error;
  }
  get pageInfo(): unknown {
    return this.currentEntry()?.pageInfo;
  }
  get stale(): boolean {
    return !this.currentEntry() || this.currentEntry()!.staleAt <= Date.now();
  }
  get values(): readonly Readonly<T>[] {
    return this.all();
  }

  getSnapshot(): CollectionSnapshot<T> {
    return this.store.getSnapshot();
  }
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  filter(
    values: Readonly<Record<string, unknown>>,
    options: { readonly merge?: boolean } = {},
  ): this {
    this.filters = Object.freeze(options.merge ? { ...this.filters, ...values } : { ...values });
    this.pageState = { ...this.pageState, index: 1 };
    this.accumulatedKeys = [];
    this.rebind();
    return this;
  }

  sort(field?: string, descending = false): this {
    this.sortState = field ? { field, descending } : undefined;
    this.pageState = { ...this.pageState, index: 1, token: undefined };
    this.accumulatedKeys = [];
    this.rebind();
    return this;
  }

  page(index: number, size = this.pageState.size): this {
    this.pageState = {
      index,
      size,
      ...(index === this.pageState.index ? { token: this.pageState.token } : {}),
    };
    this.rebind();
    return this;
  }

  accumulate(enabled = true): this {
    this.accumulating = enabled;
    if (!enabled) this.accumulatedKeys = [];
    return this;
  }

  nextPage(): this {
    const info = this.pageInfo as PageInfo | undefined;
    if (info && !info.hasNext) return this;
    this.pageState = {
      index: this.pageState.index + 1,
      size: this.pageState.size,
      ...(info?.nextToken !== undefined ? { token: info.nextToken } : {}),
    };
    this.rebind();
    return this;
  }

  previousPage(): this {
    const info = this.pageInfo as PageInfo | undefined;
    if (this.pageState.index <= 1 || (info && !info.hasPrevious)) return this;
    this.pageState = {
      index: Math.max(1, this.pageState.index - 1),
      size: this.pageState.size,
      ...(info?.previousToken !== undefined ? { token: info.previousToken } : {}),
    };
    this.rebind();
    return this;
  }

  hasMore(): boolean {
    return (this.pageInfo as PageInfo | undefined)?.hasNext ?? false;
  }

  reset(): this {
    this.filters = {};
    this.sortState = undefined;
    this.pageState = { index: 1, size: this.pageState.size };
    this.accumulatedKeys = [];
    this.rebind();
    return this;
  }

  all(): readonly Readonly<T>[] {
    const entry = this.currentEntry();
    if (!entry) return [];
    return this.materializedKeys(entry).flatMap((key) => {
      const entity = this.runtime.cache.entity(this.address(), key);
      if (!entity || entity.tombstone) return [];
      const schema = this.outputSchema();
      if (!schema.canMaterialize(entity.data)) return [];
      const value =
        schema === this.definition.schema && canShareSnapshot(this.definition) && entity.snapshot
          ? entity.snapshot
          : schema.materialize(resolveRelationValues(this.runtime, this.definition, entity.data));
      return [value as Readonly<T>];
    });
  }

  async load(options: LoadOptions = {}): Promise<readonly Readonly<T>[]> {
    if (this.definition.source.kind === "local") {
      this.rebind();
      return this.all();
    }
    const policy = options.policy ?? this.runtime.cachePolicy;
    const hydration =
      policy === "cache-first" ? this.runtime.awaitCache(this.runtime.scope()) : undefined;
    if (hydration) await hydration;
    const entry = this.currentEntry();
    if (entry && policy === "stale-while-revalidate") {
      void this.load({ ...options, policy: "network-only" }).catch(() => undefined);
      return this.all();
    }
    if (entry && policy === "cache-first" && entry.staleAt > Date.now()) return this.all();
    this.controller = new AbortController();
    const generation = ++this.generation;
    this.store.update((state) => ({
      ...state,
      revision: state.revision + 1,
      loading: true,
    }));
    const startedAt = this.runtime.timestamp();
    try {
      const query = this.encodedQuery();
      const adapter = this.queryDefinition?.pagination ?? this.definition.pagination;
      const response = await this.runtime.request<unknown>(
        `${this.runtime.scope()}|${this.definition.name}|query|${this.identity()}`,
        {
          method: "GET",
          url: joinUrl(
            this.runtime.baseUrl,
            joinUrl(this.definition.url, this.queryDefinition?.path ?? ""),
          ),
          query: { ...query, ...adapter.request(this.pageState) },
          authentication: this.definition.actions.list?.auth,
        },
        combineSignals(this.controller.signal, options.signal),
        [...(this.queryDefinition?.errorAdapters ?? []), ...this.definition.errorAdapters],
      );
      const result = adapter.response(response, this.pageState);
      const keys = result.items
        .map((item) => normalizeEntity(this.runtime, this.definition, item, undefined, startedAt))
        .map((item) => keyFromPartial(this.definition, item));
      this.accumulatedKeys = this.accumulating
        ? [...new Set([...this.accumulatedKeys, ...keys])]
        : [];
      const now = this.runtime.timestamp();
      this.runtime.cache.setCollection(
        this.address(),
        Object.freeze({
          identity: this.identity(),
          keys: Object.freeze([...new Set(keys)]),
          ...(result.pageInfo !== undefined ? { pageInfo: result.pageInfo } : {}),
          updatedAt: now,
          staleAt: now + (this.queryDefinition?.ttl ?? this.definition.ttl),
        }),
      );
      this.rebind();
      if (generation === this.generation)
        this.store.update((state) => ({
          ...state,
          revision: state.revision + 1,
          loading: false,
          error: undefined,
          values: this.all(),
          stale: this.stale,
          ...(result.pageInfo !== undefined ? { pageInfo: result.pageInfo } : {}),
        }));
      return this.all();
    } catch (error) {
      if (generation === this.generation)
        this.store.update((state) => ({
          ...state,
          revision: state.revision + 1,
          loading: false,
          error: normalizeFailure(error),
        }));
      throw error;
    }
  }

  refresh(): Promise<readonly Readonly<T>[]> {
    return this.load({ policy: "network-only" });
  }
  invalidate(): void {
    this.runtime.cache.removeCollection(this.address(), this.identity());
  }
  cancel(): void {
    this.generation += 1;
    this.controller.abort();
    this.store.update((state) => ({
      ...state,
      revision: state.revision + 1,
      loading: false,
    }));
  }
  clearError(): void {
    this.store.update(clearCollectionError);
  }

  private currentEntry(): CollectionEntry | undefined {
    return this.runtime.cache.collection(this.address(), this.identity());
  }
  private address(): CacheAddress {
    return this.runtime.address(this.definition.name);
  }
  private input(): Readonly<Record<string, unknown>> {
    return typeof this.inputSource === "function" ? this.inputSource() : (this.inputSource ?? {});
  }
  private encodedQuery(): Readonly<Record<string, unknown>> {
    const input = { ...this.input(), ...this.filters };
    const parsed = this.queryDefinition?.input
      ? this.queryDefinition.input.parsePartial(input)
      : input;
    const encoded = this.queryDefinition?.input?.toQuery
      ? this.queryDefinition.input.toQuery(parsed)
      : parsed;
    return {
      ...encoded,
      ...(this.sortState
        ? {
            [this.queryDefinition?.sortParam ?? "ordering"]:
              `${this.sortState.descending ? "-" : ""}${this.sortState.field}`,
          }
        : {}),
    };
  }
  private identity(): string {
    return stableSerialize({
      query: this.queryName,
      input: this.encodedQuery(),
      page: this.pageState,
    });
  }
  private outputSchema(): RuntimeSchema<TContext> {
    const viewName = this.queryDefinition?.view;
    return viewName
      ? (this.definition.views[viewName] ?? this.definition.schema)
      : this.definition.schema;
  }

  private rebind(): void {
    this.unregisterLiveCollection?.();
    for (const unsubscribe of this.subscriptions) unsubscribe();
    if (this.definition.source.kind === "local") this.refreshLocalCollection();
    this.subscriptions = [
      this.runtime.cache.subscribeCollection(this.address(), this.identity(), () => this.rebind()),
      this.runtime.subscribeContext(() => this.cacheChanged()),
    ];
    this.unregisterLiveCollection = this.runtime.registerCollection(
      this.address(),
      this.identity(),
      {
        paginated: () => this.currentEntry()?.pageInfo !== undefined,
        match: (value) => this.matchesLiveValue(value),
        add: (key) => this.cacheAddKey(key),
      },
    );
    if (this.definition.source.kind === "local" && this.identity() !== localMasterIdentity)
      this.subscriptions.push(
        this.runtime.cache.subscribeCollection(this.address(), localMasterIdentity, () =>
          this.rebind(),
        ),
      );
    for (const key of this.materializedKeys(this.currentEntry()))
      this.subscriptions.push(
        this.runtime.cache.subscribeEntity(this.address(), key, () => this.cacheChanged()),
      );
    if (this.queryDefinition?.subscribeRelations !== false)
      for (const key of this.materializedKeys(this.currentEntry())) {
        const entity = this.runtime.cache.entity(this.address(), key);
        if (entity)
          this.subscriptions.push(
            ...subscribeRelationEntries(this.runtime, this.definition, entity.data, () =>
              this.cacheChanged(),
            ),
          );
      }
    this.cacheChanged();
  }

  private matchesLiveValue(value: Readonly<Record<string, unknown>>): boolean | undefined {
    const encoded = this.encodedQuery();
    const sortParam = this.queryDefinition?.sortParam ?? "ordering";
    const query = Object.freeze(
      Object.fromEntries(Object.entries(encoded).filter(([name]) => name !== sortParam)),
    );
    if (this.queryDefinition?.local)
      return this.queryDefinition.local(value, query, this.runtime.context());
    if (Object.keys(query).some((name) => !this.definition.schema.shape[name])) return undefined;
    return matchesLocalQuery(this.definition, value, query);
  }

  private cacheChanged(): void {
    this.store.update((state) => ({
      ...state,
      revision: state.revision + 1,
      values: this.all(),
      stale: this.stale,
      ...(this.pageInfo !== undefined ? { pageInfo: this.pageInfo } : {}),
    }));
  }

  private materializedKeys(entry = this.currentEntry()): readonly EntityKey[] {
    if (this.accumulating && this.accumulatedKeys.length) return this.accumulatedKeys;
    return entry?.keys ?? [];
  }

  cacheAddKey(key: EntityKey): void {
    const current = this.currentEntry();
    const keys = [...(current?.keys ?? [])];
    if (!keys.includes(key)) keys.push(key);
    this.writeCollection(keys, current?.pageInfo);
  }

  cacheRemoveKey(key: EntityKey): void {
    const current = this.currentEntry();
    if (!current) return;
    this.writeCollection(
      current.keys.filter((candidate) => !Object.is(candidate, key)),
      current.pageInfo,
    );
  }

  cacheReplaceKeys(keys: readonly EntityKey[]): void {
    this.writeCollection([...new Set(keys)]);
  }

  [rawCollectionEntries](): readonly Readonly<Record<string, unknown>>[] {
    return Object.freeze(
      this.materializedKeys(this.currentEntry()).flatMap((key) => {
        const entry = this.runtime.cache.entity(this.address(), key);
        return entry && !entry.tombstone ? [entry.data] : [];
      }),
    );
  }

  private refreshLocalCollection(): void {
    const master = this.runtime.cache.collection(this.address(), localMasterIdentity);
    const encodedQuery = this.encodedQuery();
    const sortParam = this.queryDefinition?.sortParam ?? "ordering";
    const query = Object.freeze(
      Object.fromEntries(Object.entries(encodedQuery).filter(([name]) => name !== sortParam)),
    );
    const values = (master?.keys ?? []).flatMap((key) => {
      const entry = this.runtime.cache.entity(this.address(), key);
      if (!entry || entry.tombstone || !this.definition.schema.canMaterialize(entry.data))
        return [];
      return [
        {
          key,
          value: this.definition.schema.materialize(
            resolveRelationValues(this.runtime, this.definition, entry.data),
          ),
        },
      ];
    });
    const filtered = values.filter(({ value }) =>
      this.queryDefinition?.local
        ? this.queryDefinition.local(value, query, this.runtime.context())
        : matchesLocalQuery(this.definition, value, query),
    );
    const sorted = this.sortState
      ? [...filtered].sort((left, right) =>
          compareLocalValues(
            this.definition,
            this.sortState!.field,
            left.value,
            right.value,
            this.sortState!.descending,
          ),
        )
      : filtered;
    const start = Math.max(0, this.pageState.index - 1) * this.pageState.size;
    const page = sorted.slice(start, start + this.pageState.size);
    this.writeCollection(
      page.map(({ key }) => key),
      Object.freeze({
        index: this.pageState.index,
        size: this.pageState.size,
        count: sorted.length,
        totalPages: this.pageState.size ? Math.ceil(sorted.length / this.pageState.size) : 1,
        hasNext: start + this.pageState.size < sorted.length,
        hasPrevious: this.pageState.index > 1,
      }),
    );
  }

  private writeCollection(keys: readonly EntityKey[], pageInfo?: unknown): void {
    const now = this.runtime.timestamp();
    this.runtime.cache.setCollection(
      this.address(),
      Object.freeze({
        identity: this.identity(),
        keys: Object.freeze([...keys]),
        ...(pageInfo !== undefined ? { pageInfo } : {}),
        updatedAt: now,
        staleAt: now + this.definition.ttl,
      }),
    );
  }
}

export type CacheMembership = "none" | "current" | "matching";

export interface CacheWriteOptions {
  readonly membership?: CacheMembership;
}

export class CacheConflictError extends Error {
  constructor(readonly key: EntityKey) {
    super(`Entity ${String(key)} already exists`);
  }
}

export class ResourceCacheFacade<
  TSchema extends SchemaLike<TContext>,
  TKey extends EntityKey,
  TContext,
> {
  constructor(
    private readonly runtime: Runtime<TContext>,
    private readonly definition: RuntimeDefinition<TContext>,
    private readonly collection: CollectionController<Infer<TSchema>, TKey, TContext>,
  ) {}

  add(input: Input<TSchema>, options: CacheWriteOptions = {}): Readonly<Infer<TSchema>> {
    const parsed = this.definition.schema.parse(input);
    const key = keyFromPartial(this.definition, parsed);
    const address = this.runtime.address(this.definition.name);
    const current = this.runtime.cache.entity(address, key);
    if (current && !current.tombstone) throw new CacheConflictError(key);
    normalizeEntity(this.runtime, this.definition, parsed, key);
    this.commitMembership(key, options.membership ?? "current", parsed);
    return materializeEntity(this.runtime, this.definition, key) as Readonly<Infer<TSchema>>;
  }

  upsert(
    input: Partial<Input<TSchema>>,
    options: CacheWriteOptions = {},
  ): Readonly<Partial<Infer<TSchema>>> {
    const parsed = this.definition.schema.parsePartial(input);
    const key = keyFromPartial(this.definition, parsed);
    const address = this.runtime.address(this.definition.name);
    const existed = Boolean(this.runtime.cache.entity(address, key));
    normalizeEntity(this.runtime, this.definition, parsed, key);
    if (!existed) this.commitMembership(key, options.membership ?? "current", parsed);
    else if (options.membership && options.membership !== "none")
      this.commitMembership(key, options.membership, parsed);
    return materializeEntity(this.runtime, this.definition, key) as Readonly<
      Partial<Infer<TSchema>>
    >;
  }

  remove(key: TKey): void {
    const encoded = this.definition.keyEncoder?.(key) ?? key;
    const address = this.runtime.address(this.definition.name);
    this.runtime.cache.setEntity(
      address,
      tombstoneEntity(this.runtime.cache.entity(address, encoded), encoded),
    );
    this.collection.cacheRemoveKey(encoded);
    removeLocalMasterKey(this.runtime, this.definition, encoded);
  }

  replaceAll(inputs: readonly Input<TSchema>[]): readonly Readonly<Infer<TSchema>>[] {
    const values = inputs.map((input) => this.definition.schema.parse(input));
    const keys = values.map((value) => keyFromPartial(this.definition, value));
    const normalized = values.map(
      (value, index) =>
        normalizeEntity(this.runtime, this.definition, value, keys[index]!) as Readonly<
          Infer<TSchema>
        >,
    );
    this.collection.cacheReplaceKeys(keys);
    if (this.definition.source.kind === "local")
      setLocalMasterKeys(this.runtime, this.definition, keys);
    return Object.freeze(normalized);
  }

  private commitMembership(
    key: EntityKey,
    membership: CacheMembership,
    value: Readonly<Record<string, unknown>>,
  ): void {
    if (this.definition.source.kind === "local")
      addLocalMasterKey(this.runtime, this.definition, key);
    if (membership === "none") return;
    if (membership === "matching" && this.definition.source.kind !== "local") {
      this.runtime.applyCollectionMembership(
        this.runtime.address(this.definition.name),
        key,
        value,
      );
      return;
    }
    this.collection.cacheAddKey(key);
  }
}

export interface BulkResult<TKey, TValue> {
  readonly succeeded: readonly TKey[];
  readonly failed: readonly {
    readonly key: TKey;
    readonly failure: NormalizedFailure;
  }[];
  readonly values: readonly TValue[];
}

type QueryValue<TSchema, TViews, TQuery> = TQuery extends {
  readonly view?: infer V;
}
  ? V extends keyof TViews
    ? TViews[V] extends { readonly _output: infer T }
      ? T
      : Infer<TSchema>
    : Infer<TSchema>
  : Infer<TSchema>;
type ActionInput<TAction> = TAction extends { readonly input?: infer S }
  ? S extends { readonly _input: infer T }
    ? T
    : unknown
  : unknown;
type ActionOutput<TSchema, TViews, TAction> = TAction extends {
  readonly output?: infer S;
}
  ? S extends { readonly _output: infer T }
    ? T
    : TAction extends { readonly view?: infer V }
      ? V extends keyof TViews
        ? TViews[V] extends { readonly _output: infer T }
          ? T
          : Infer<TSchema>
        : Infer<TSchema>
      : Infer<TSchema>
  : Infer<TSchema>;

function normalizeEntity<TContext>(
  runtime: Runtime<TContext>,
  definition: RuntimeDefinition<TContext>,
  input: unknown,
  fallbackKey?: EntityKey,
  requestStartedAt?: number,
  scope?: string,
  sourceVersion?: LiveVersion,
): Readonly<Record<string, unknown>> {
  const parsed = definition.schema.parsePartial(input);
  const partial = normalizeRelationValues(runtime, definition, parsed, scope);
  const key = fallbackKey ?? keyFromPartial(definition, partial);
  const cacheKey = definition.keyEncoder?.(key) ?? key;
  const address = scope ? { scope, resource: definition.name } : runtime.address(definition.name);
  const current = runtime.cache.entity(address, cacheKey);
  const merged = mergeEntity(current, cacheKey, partial as Readonly<Record<string, unknown>>, {
    ttl: definition.source.kind === "local" ? Number.MAX_VALUE : definition.ttl,
    now: runtime.timestamp(),
    ...(requestStartedAt !== undefined ? { requestStartedAt } : {}),
    ...(sourceVersion !== undefined ? { sourceVersion } : {}),
  });
  const entry =
    merged === current
      ? current
      : Object.freeze({
          ...merged,
          ...(canShareSnapshot(definition) && definition.schema.canMaterialize(merged.data)
            ? {
                snapshot: definition.schema.materialize(
                  resolveRelationValues(runtime, definition, merged.data),
                ),
              }
            : {}),
        });
  if (entry !== current) runtime.cache.setEntity(address, entry);
  return partial as Readonly<Record<string, unknown>>;
}

function materializeEntity<TContext>(
  runtime: Runtime<TContext>,
  definition: RuntimeDefinition<TContext>,
  key: EntityKey,
): Readonly<Record<string, unknown>> {
  const encoded = definition.keyEncoder?.(key) ?? key;
  const entry = runtime.cache.entity(runtime.address(definition.name), encoded);
  if (!entry || entry.tombstone)
    throw new Error(`Entity ${String(key)} is not available in ${definition.name}`);
  if (canShareSnapshot(definition) && entry.snapshot) return entry.snapshot;
  return definition.schema.materialize(resolveRelationValues(runtime, definition, entry.data));
}

function initializeLocalSource<TContext>(
  runtime: Runtime<TContext>,
  definition: RuntimeDefinition<TContext>,
): void {
  if (definition.source.kind !== "local") return;
  const keys = definition.source.initial.map((input) => {
    const value = definition.schema.parse(input);
    normalizeEntity(runtime, definition, value);
    return keyFromPartial(definition, value);
  });
  setLocalMasterKeys(runtime, definition, keys);
}

function localMasterKeys<TContext>(
  runtime: Runtime<TContext>,
  definition: RuntimeDefinition<TContext>,
): readonly EntityKey[] {
  return (
    runtime.cache.collection(runtime.address(definition.name), localMasterIdentity)?.keys ?? []
  );
}

function setLocalMasterKeys<TContext>(
  runtime: Runtime<TContext>,
  definition: RuntimeDefinition<TContext>,
  keys: readonly EntityKey[],
): void {
  const now = runtime.timestamp();
  runtime.cache.setCollection(
    runtime.address(definition.name),
    Object.freeze({
      identity: localMasterIdentity,
      keys: Object.freeze([...new Set(keys)]),
      updatedAt: now,
      staleAt: Number.MAX_VALUE,
    }),
  );
}

function addLocalMasterKey<TContext>(
  runtime: Runtime<TContext>,
  definition: RuntimeDefinition<TContext>,
  key: EntityKey,
): void {
  setLocalMasterKeys(runtime, definition, [...localMasterKeys(runtime, definition), key]);
}

function removeLocalMasterKey<TContext>(
  runtime: Runtime<TContext>,
  definition: RuntimeDefinition<TContext>,
  key: EntityKey,
): void {
  if (definition.source.kind !== "local") return;
  setLocalMasterKeys(
    runtime,
    definition,
    localMasterKeys(runtime, definition).filter((candidate) => !Object.is(candidate, key)),
  );
}

function matchesLocalQuery<TContext>(
  definition: RuntimeDefinition<TContext>,
  value: Readonly<Record<string, unknown>>,
  query: Readonly<Record<string, unknown>>,
): boolean {
  return Object.entries(query).every(([name, expected]) => {
    if (expected === undefined || expected === null || expected === "") return true;
    const field = definition.schema.shape[name];
    if (!field) return false;
    const actual = value[name];
    const descriptor = field.options.filter;
    if (descriptor?.kind === "contains") {
      const caseSensitive = Boolean(
        (descriptor.options as Readonly<Record<string, unknown>> | undefined)?.caseSensitive,
      );
      const left = String(actual ?? "");
      const right = String(expected);
      return caseSensitive
        ? left.includes(right)
        : left.toLocaleLowerCase().includes(right.toLocaleLowerCase());
    }
    if (descriptor?.kind === "range" && Array.isArray(expected)) {
      const [minimum, maximum] = expected;
      return (
        (minimum === undefined || compareRelationValues(actual, minimum) >= 0) &&
        (maximum === undefined || compareRelationValues(actual, maximum) <= 0)
      );
    }
    if (descriptor?.kind === "custom") {
      const predicate = (
        descriptor.options as
          | {
              readonly predicate?: (fieldValue: unknown, filterValue: unknown) => boolean;
            }
          | undefined
      )?.predicate;
      return predicate ? predicate(actual, expected) : Object.is(actual, expected);
    }
    return Object.is(actual, expected);
  });
}

function compareLocalValues<TContext>(
  definition: RuntimeDefinition<TContext>,
  fieldName: string,
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
  descending: boolean,
): number {
  const field = definition.schema.shape[fieldName];
  const descriptor = field?.options.sort;
  const options =
    typeof descriptor === "object"
      ? (descriptor.options as Readonly<Record<string, unknown>> | undefined)
      : undefined;
  const path =
    typeof descriptor === "string"
      ? descriptor
      : descriptor?.kind === "key" && typeof options?.path === "string"
        ? options.path
        : fieldName;
  const read = (value: Readonly<Record<string, unknown>>) =>
    path
      .split(".")
      .reduce<unknown>(
        (current, part) =>
          typeof current === "object" && current !== null
            ? (current as Readonly<Record<string, unknown>>)[part]
            : undefined,
        value,
      );
  const custom =
    typeof descriptor === "object" && descriptor.kind === "custom"
      ? (options?.compare as ((first: unknown, second: unknown) => number) | undefined)
      : undefined;
  const result = custom
    ? custom(read(left), read(right))
    : compareRelationValues(read(left), read(right));
  return descending ? -result : result;
}

function keyFromPartial<TContext>(
  definition: RuntimeDefinition<TContext>,
  value: Readonly<Record<string, unknown>>,
): EntityKey {
  const key = typeof definition.key === "function" ? definition.key(value) : value[definition.key];
  if (typeof key !== "string" && typeof key !== "number")
    throw new Error(`Resource ${definition.name} response does not contain a valid key`);
  return key;
}

function liveMutationKey<TContext>(
  definition: RuntimeDefinition<TContext>,
  mutation: LiveMutation,
): EntityKey {
  if (mutation.key !== undefined) return mutation.key;
  if (typeof mutation.value === "string" || typeof mutation.value === "number")
    return mutation.value;
  if (typeof mutation.value !== "object" || mutation.value === null)
    throw new Error(`Delete event for ${definition.name} does not contain a key`);
  const value = mutation.value as Readonly<Record<string, unknown>>;
  if (typeof value.key === "string" || typeof value.key === "number") return value.key;
  return keyFromPartial(definition, value);
}

function normalizeRelationValues<TContext>(
  runtime: Runtime<TContext>,
  definition: RuntimeDefinition<TContext>,
  value: Readonly<Record<string, unknown>>,
  scope?: string,
): Readonly<Record<string, unknown>> {
  const output: Record<string, unknown> = { ...value };
  for (const [name, field] of Object.entries(definition.schema.shape)) {
    const relation = field.options.relation;
    if (!relation || !(name in output)) continue;
    const targetName = resourceNameOf(relation.resource);
    const target = targetName ? runtime.definitions.get(targetName) : undefined;
    if (!target) continue;
    const relationValue = output[name];
    if (relation.many && Array.isArray(relationValue)) {
      output[name] = relationValue.map((item) =>
        normalizeRelationItem(runtime, target, item, scope),
      );
    } else if (!relation.many) {
      output[name] = normalizeRelationItem(runtime, target, relationValue, scope);
    }
  }
  return Object.freeze(output);
}

function canShareSnapshot<TContext>(definition: RuntimeDefinition<TContext>): boolean {
  return Object.values(definition.schema.shape).every(
    (field) => !field.options.relation && !field.options.computed,
  );
}

function normalizeRelationItem<TContext>(
  runtime: Runtime<TContext>,
  target: RuntimeDefinition<TContext>,
  value: unknown,
  scope?: string,
): unknown {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const normalized = normalizeEntity(runtime, target, value, undefined, undefined, scope);
    return keyFromPartial(target, normalized);
  }
  return value;
}

function resolveRelationValues<TContext>(
  runtime: Runtime<TContext>,
  definition: RuntimeDefinition<TContext>,
  value: Readonly<Record<string, unknown>>,
  seen = new Set<string>(),
): Readonly<Record<string, unknown>> {
  const output: Record<string, unknown> = { ...value };
  for (const [name, field] of Object.entries(definition.schema.shape)) {
    const relation = field.options.relation;
    if (!relation || !(name in output)) continue;
    const targetName = resourceNameOf(relation.resource);
    const target = targetName ? runtime.definitions.get(targetName) : undefined;
    if (!target) continue;
    const relationValue = output[name];
    if (relation.many && Array.isArray(relationValue)) {
      const values = relationValue.flatMap((key) => {
        if (typeof key !== "string" && typeof key !== "number") return [];
        const entry = runtime.cache.entity(
          runtime.address(target.name),
          target.keyEncoder?.(key) ?? key,
        );
        if (!entry || entry.tombstone) return [];
        return [materializeCachedEntry(runtime, target, entry.key, seen)];
      });
      output[name] = relation.sort ? sortRelationValues(values, relation.sort) : values;
    } else if (typeof relationValue === "string" || typeof relationValue === "number") {
      const entry = runtime.cache.entity(
        runtime.address(target.name),
        target.keyEncoder?.(relationValue) ?? relationValue,
      );
      output[name] =
        entry && !entry.tombstone
          ? materializeCachedEntry(runtime, target, entry.key, seen)
          : undefined;
    }
  }
  return Object.freeze(output);
}

function materializeCachedEntry<TContext>(
  runtime: Runtime<TContext>,
  definition: RuntimeDefinition<TContext>,
  key: EntityKey,
  seen: Set<string>,
): Readonly<Record<string, unknown>> {
  const identity = `${definition.name}:${String(key)}`;
  const entry = runtime.cache.entity(runtime.address(definition.name), key);
  if (!entry || entry.tombstone) return Object.freeze({});
  if (seen.has(identity)) return entry.snapshot ?? entry.data;
  if (canShareSnapshot(definition) && entry.snapshot) return entry.snapshot;
  const next = new Set(seen);
  next.add(identity);
  return definition.schema.materialize(
    resolveRelationValues(runtime, definition, entry.data, next),
  );
}

function subscribeRelationEntries<TContext>(
  runtime: Runtime<TContext>,
  definition: RuntimeDefinition<TContext>,
  value: Readonly<Record<string, unknown>>,
  listener: () => void,
): (() => void)[] {
  const subscriptions: (() => void)[] = [];
  for (const [name, field] of Object.entries(definition.schema.shape)) {
    const relation = field.options.relation;
    if (!relation || !(name in value)) continue;
    const targetName = resourceNameOf(relation.resource);
    const target = targetName ? runtime.definitions.get(targetName) : undefined;
    if (!target) continue;
    const relationValue = value[name];
    const keys = Array.isArray(relationValue) ? relationValue : [relationValue];
    for (const key of keys) {
      if (typeof key !== "string" && typeof key !== "number") continue;
      subscriptions.push(
        runtime.cache.subscribeEntity(
          runtime.address(target.name),
          target.keyEncoder?.(key) ?? key,
          listener,
        ),
      );
    }
  }
  return subscriptions;
}

function sortRelationValues(
  values: readonly Readonly<Record<string, unknown>>[],
  sort: string | ((value: unknown) => unknown),
): readonly Readonly<Record<string, unknown>>[] {
  const read =
    typeof sort === "function"
      ? sort
      : (value: unknown) =>
          typeof value === "object" && value !== null
            ? (value as Readonly<Record<string, unknown>>)[sort]
            : undefined;
  return [...values].sort((left, right) => compareRelationValues(read(left), read(right)));
}

function compareRelationValues(left: unknown, right: unknown): number {
  if (Object.is(left, right)) return 0;
  if (left === undefined || left === null) return 1;
  if (right === undefined || right === null) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

function resourceNameOf(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  if ("resourceName" in value && typeof value.resourceName === "string") return value.resourceName;
  if (
    "definition" in value &&
    typeof value.definition === "object" &&
    value.definition !== null &&
    "resourceName" in value.definition &&
    typeof value.definition.resourceName === "string"
  )
    return value.definition.resourceName;
  return undefined;
}

function operationPath<TContext>(
  operation: RuntimeAction<TContext> | undefined,
  fallback: string,
  input: unknown,
): string {
  if (!operation?.path) return fallback;
  return typeof operation.path === "function" ? operation.path(input) : operation.path;
}

function encodeRelationKeys<TContext>(
  options: RelationKeyFetchOptions<TContext>,
  keys: readonly EntityKey[],
  source: Readonly<Record<string, unknown>>,
  context: TContext,
): Readonly<Record<string, unknown>> {
  if (options.encode) return options.encode({ keys, source, context });
  const parameter = options.parameter ?? "id";
  if (options.encoding === "comma") return { [parameter]: keys.join(",") };
  if (options.encoding === "brackets") return { [`${parameter}[]`]: keys };
  return { [parameter]: keys };
}

function adaptFailure(
  response: TransportResponse<unknown>,
  adapters: readonly ErrorAdapter[],
): NormalizedFailure {
  for (const adapter of adapters) {
    const failure = adapter.adapt(response);
    if (failure) return failure;
  }
  const kind =
    response.status === 401
      ? "authentication"
      : response.status === 403
        ? "permission"
        : response.status === 404
          ? "not-found"
          : response.status === 409
            ? "conflict"
            : response.status === 429
              ? "rate-limit"
              : response.status >= 500
                ? "server"
                : "unknown";
  return {
    kind,
    status: response.status,
    issues: [],
    retryable: response.status === 429 || response.status >= 500,
  };
}

function validateViews<TContext>(definition: RuntimeDefinition<TContext>): void {
  if (typeof definition.key !== "string") return;
  for (const [name, view] of Object.entries(definition.views)) {
    if (!(definition.key in view.shape))
      throw new Error(
        `View ${name} on resource ${definition.name} must include key ${definition.key}`,
      );
  }
}

function identityAdapter<T extends ExternalStore<object>>(controller: T): T {
  return controller;
}

function liveCollectionIdentity(address: CacheAddress, identity: string): string {
  return stableSerialize({ scope: address.scope, resource: address.resource, identity });
}

function combineSignals(owned: AbortSignal, external?: AbortSignal): AbortSignal {
  return external ? AbortSignal.any([owned, external]) : owned;
}

function selectFormValues<TContext>(
  schema: FormSchema<SchemaLike<TContext>, unknown>,
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null) return {};
  const source = value as Readonly<Record<string, unknown>>;
  return Object.freeze(
    Object.fromEntries(
      Object.keys(schema.fields.shape).flatMap((name) =>
        name in source ? ([[name, source[name]]] as const) : [],
      ),
    ),
  );
}

function bindFormContext<TContext, TForm extends FormSchema<SchemaLike<TContext>, unknown>>(
  schema: TForm,
  context: () => TContext,
): TForm {
  const fields = schema.fields.bindContext(context) as SchemaLike<TContext>;
  return schema.bindFields(fields) as unknown as TForm;
}

function clearObjectError<T>(state: ObjectSnapshot<T>): ObjectSnapshot<T> {
  const next: {
    error?: NormalizedFailure;
    key: EntityKey;
    value?: Readonly<T>;
    stale: boolean;
    loading: boolean;
    revision: number;
  } = { ...state };
  delete next.error;
  return Object.freeze({ ...next, revision: state.revision + 1 });
}

function clearCollectionError<T>(state: CollectionSnapshot<T>): CollectionSnapshot<T> {
  const next: {
    error?: NormalizedFailure;
    values: readonly Readonly<T>[];
    pageInfo?: unknown;
    stale: boolean;
    loading: boolean;
    revision: number;
  } = { ...state };
  delete next.error;
  return Object.freeze({ ...next, revision: state.revision + 1 });
}

function toRuntimeDefinition<TContext>(definition: {
  readonly schema: { readonly _context: TContext };
}): RuntimeDefinition<TContext> {
  return definition as unknown as RuntimeDefinition<TContext>;
}

function bindRuntimeDefinition<TContext>(
  definition: RuntimeDefinition<unknown>,
  context: () => TContext,
): RuntimeDefinition<TContext> {
  const bind = (value: RuntimeSchema<unknown>): RuntimeSchema<TContext> =>
    value.bindContext?.(context) ?? (value as unknown as RuntimeSchema<TContext>);
  const views = Object.fromEntries(
    Object.entries(definition.views).map(([name, value]) => [name, bind(value)]),
  );
  const queries = Object.fromEntries(
    Object.entries(definition.queries).map(([name, value]) => [
      name,
      Object.freeze({ ...value, ...(value.input ? { input: bind(value.input) } : {}) }),
    ]),
  );
  const actions = Object.fromEntries(
    Object.entries(definition.actions).map(([name, value]) => [
      name,
      Object.freeze({
        ...value,
        ...(value.input ? { input: bind(value.input) } : {}),
        ...(value.output ? { output: bind(value.output) } : {}),
      }),
    ]),
  );
  return Object.freeze({
    ...definition,
    schema: bind(definition.schema),
    views: Object.freeze(views),
    queries: Object.freeze(queries),
    actions: Object.freeze(actions),
  }) as RuntimeDefinition<TContext>;
}

function composeRuntimeContext<TContext>(
  application: DeepReadonly<unknown>,
  auth: object | undefined,
): DeepReadonly<TContext> {
  if (!auth) return application as DeepReadonly<TContext>;
  if (application === undefined)
    return Object.freeze({ auth }) as unknown as DeepReadonly<TContext>;
  if (!isRecord(application))
    throw new TypeError("Authenticated application context must be an object");
  return Object.freeze({ ...application, auth }) as DeepReadonly<TContext>;
}

function isResourceOptions(value: unknown): value is {
  readonly name: string;
  readonly url?: string;
  readonly source?: ResourceSource<unknown>;
  readonly schema: RuntimeSchema<unknown>;
  readonly key: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    ("url" in value || "source" in value) &&
    "schema" in value &&
    "key" in value
  );
}
