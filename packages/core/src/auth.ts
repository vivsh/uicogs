import type { NormalizedFailure } from "./issues.js";
import type { OperationInput, OperationOutput, OperationReference } from "./resource.js";
import type { ExternalStore } from "./store.js";
import type { TransportMiddleware } from "./transport.js";

export type AuthExecutionRole =
  "required" | "optional" | "none" | "refresh" | "establish" | "logout";

export type AuthResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: NormalizedFailure };

export interface AuthRuntimeBindings {
  execute<TReference extends OperationReference>(
    reference: TReference,
    input: OperationInput<TReference>,
    role: AuthExecutionRole,
    signal: AbortSignal,
  ): Promise<OperationOutput<TReference>>;
}

export interface RuntimeAuthController<
  TSnapshot extends object = object,
> extends ExternalStore<TSnapshot> {
  readonly value: TSnapshot;
  readonly status: string;
  readonly scopes: ReadonlySet<string>;
  readonly sessionGeneration: number;
  middleware(): TransportMiddleware;
  attach(bindings: AuthRuntimeBindings): void;
  initialize(): Promise<void>;
  cacheScope(): string;
  subscribeLogout(listener: () => void): () => void;
  dispose(): void;
}

/** Returns whether an initialized auth controller currently has an authenticated session. */
export function isLoggedIn(auth: RuntimeAuthController | undefined): boolean {
  return auth?.status === "authenticated";
}

export interface AuthStrategyDefinition<
  TController extends RuntimeAuthController = RuntimeAuthController,
> {
  readonly kind: "uicogs-auth-strategy";
  readonly operations: readonly OperationReference[];
  create(): TController;
}

export type AuthControllerOf<TStrategy> =
  TStrategy extends AuthStrategyDefinition<infer TController> ? TController : never;

export type AuthSnapshotOf<TStrategy> =
  AuthControllerOf<TStrategy> extends ExternalStore<infer T> ? T : never;

export type UiCogsContext<
  TApplicationContext,
  TStrategy = undefined,
> = TStrategy extends AuthStrategyDefinition
  ? TApplicationContext extends undefined
    ? { readonly auth: AuthSnapshotOf<TStrategy> }
    : TApplicationContext & { readonly auth: AuthSnapshotOf<TStrategy> }
  : TApplicationContext;

export type ApplicationContext<T> = "auth" extends keyof T ? never : T;
