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
import {
  createRouteRegistry,
  type NavigationPlacements,
  type RouteNode,
  type RouteRegistry,
} from "@uicogs/routes";

export class Cogs<
  TApplicationContext,
  TEvents extends object = Readonly<Record<never, never>>,
  TAuth extends AuthStrategyDefinition | undefined = undefined,
  TResources extends readonly ResourceDefinitionIdentity[] = readonly ResourceDefinitionIdentity[],
  TServices extends readonly ServiceDefinitionIdentity[] = readonly ServiceDefinitionIdentity[],
  TComponent = unknown,
  TIcon = unknown,
  TMeta extends object = Readonly<Record<never, never>>,
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
  readonly routes: RouteRegistry<TComponent, TIcon, TMeta>;

  constructor(
    options: CogsOptions<
      TApplicationContext,
      TAuth,
      TResources,
      TServices,
      TComponent,
      TIcon,
      TMeta
    >,
  ) {
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
    this.routes = createRouteRegistry<TComponent, TIcon, TMeta>({
      routes: options.routes as readonly RouteNode<TComponent, TMeta>[] | undefined,
      navigation: options.navigation as NavigationPlacements<TIcon> | undefined,
      breadcrumbsFrom: options.breadcrumbsFrom,
    });
  }
}

export type CogsOptions<
  TApplicationContext,
  TAuth extends AuthStrategyDefinition | undefined = undefined,
  TResources extends readonly ResourceDefinitionIdentity[] = readonly ResourceDefinitionIdentity[],
  TServices extends readonly ServiceDefinitionIdentity[] = readonly ServiceDefinitionIdentity[],
  TComponent = unknown,
  TIcon = unknown,
  TMeta extends object = Readonly<Record<never, never>>,
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
          readonly routes?: readonly RouteNode<TComponent, TMeta>[];
          readonly navigation?: NavigationPlacements<TIcon>;
          readonly breadcrumbsFrom?: string;
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
  TComponent = unknown,
  TIcon = unknown,
  TMeta extends object = Readonly<Record<never, never>>,
>(
  options: CogsOptions<
    TApplicationContext,
    TAuth,
    TResources,
    TServices,
    TComponent,
    TIcon,
    TMeta
  > = {} as CogsOptions<
    TApplicationContext,
    TAuth,
    TResources,
    TServices,
    TComponent,
    TIcon,
    TMeta
  >,
): Cogs<TApplicationContext, TEvents, TAuth, TResources, TServices, TComponent, TIcon, TMeta> {
  return new Cogs<
    TApplicationContext,
    TEvents,
    TAuth,
    TResources,
    TServices,
    TComponent,
    TIcon,
    TMeta
  >(options);
}
