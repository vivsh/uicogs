import { editor, filter, format, sort } from "./descriptors.js";
import type {
  ApplicationContext,
  AuthControllerOf,
  AuthStrategyDefinition,
  UiCogsContext,
} from "./auth.js";
import type { RuntimeContextStore } from "./context.js";
import type { CacheStore } from "./cache.js";
import type { PersistenceOptions } from "./persistence.js";
import { fields, relation } from "./field.js";
import {
  http,
  local,
  UiCogs,
  type ResourceDefinitionIdentity,
  type ServiceDefinitionIdentity,
  type UiCogsOptions,
} from "./resource.js";
import { EventBus } from "./store.js";
import { pagination } from "./transport.js";

export class Cogs<
  TApplicationContext,
  TEvents extends object = Readonly<Record<never, never>>,
  TAuth extends AuthStrategyDefinition | undefined = undefined,
  TResources extends readonly ResourceDefinitionIdentity[] = readonly ResourceDefinitionIdentity[],
  TServices extends readonly ServiceDefinitionIdentity[] = readonly ServiceDefinitionIdentity[],
> extends UiCogs<UiCogsContext<TApplicationContext, TAuth>, TResources, TServices> {
  declare readonly auth: AuthControllerOf<TAuth>;
  readonly context: RuntimeContextStore<
    TApplicationContext,
    UiCogsContext<TApplicationContext, TAuth>
  >;
  readonly fields: typeof fields = fields;
  readonly relation: typeof relation = relation;
  readonly editor: typeof editor = editor;
  readonly format: typeof format = format;
  readonly filter: typeof filter = filter;
  readonly sort: typeof sort = sort;
  readonly http: typeof http = http;
  readonly local: typeof local = local;
  readonly pagination: typeof pagination = pagination;
  readonly events = new EventBus<TEvents>();

  constructor(options: CogsOptions<TApplicationContext, TAuth, TResources, TServices>) {
    super(
      options as unknown as UiCogsOptions<
        UiCogsContext<TApplicationContext, TAuth>,
        TAuth,
        TResources,
        TServices
      >,
    );
    this.context = this.contextController as unknown as RuntimeContextStore<
      TApplicationContext,
      UiCogsContext<TApplicationContext, TAuth>
    >;
  }
}

export type CogsOptions<
  TApplicationContext,
  TAuth extends AuthStrategyDefinition | undefined = undefined,
  TResources extends readonly ResourceDefinitionIdentity[] = readonly ResourceDefinitionIdentity[],
  TServices extends readonly ServiceDefinitionIdentity[] = readonly ServiceDefinitionIdentity[],
> =
  UiCogsOptions<
    UiCogsContext<TApplicationContext, TAuth>,
    TAuth,
    TResources,
    TServices
  > extends infer TOptions
    ? TOptions extends UiCogsOptions<
        UiCogsContext<TApplicationContext, TAuth>,
        TAuth,
        TResources,
        TServices
      >
      ? Omit<TOptions, "context" | "persistence" | "adapter"> & {
          readonly context?: ApplicationContext<TApplicationContext>;
          readonly persistence?: TOptions extends { readonly cache: CacheStore }
            ? Omit<PersistenceOptions<NoInfer<TApplicationContext>>, "cache"> & {
                readonly cache: false;
              }
            : PersistenceOptions<NoInfer<TApplicationContext>>;
        }
      : never
    : never;

export function createUiCogs<
  TApplicationContext = undefined,
  TEvents extends object = Readonly<Record<never, never>>,
  TAuth extends AuthStrategyDefinition | undefined = undefined,
  const TResources extends readonly ResourceDefinitionIdentity[] =
    readonly ResourceDefinitionIdentity[],
  const TServices extends readonly ServiceDefinitionIdentity[] =
    readonly ServiceDefinitionIdentity[],
>(
  options: CogsOptions<TApplicationContext, TAuth, TResources, TServices> = {} as CogsOptions<
    TApplicationContext,
    TAuth,
    TResources,
    TServices
  >,
): Cogs<TApplicationContext, TEvents, TAuth, TResources, TServices> {
  return new Cogs<TApplicationContext, TEvents, TAuth, TResources, TServices>(options);
}
