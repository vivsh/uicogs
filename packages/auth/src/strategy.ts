import {
  Store,
  normalizeFailure,
  stableSerialize,
  type AuthResult,
  type AuthRuntimeBindings,
  type AuthStrategyDefinition,
  type ExternalStore,
  type NormalizedFailure,
  type OperationInput,
  type OperationOutput,
  type OperationReference,
  type RuntimeAuthController,
  type TransportMiddleware,
  type TransportRequest,
} from "@uicogs/core";
import { memoryAuthStorage, type AuthStorage, type AuthTokens, type JwtClaims } from "./storage.js";

export type RuntimeAuthStatus =
  | "initializing"
  | "anonymous"
  | "authenticating"
  | "authenticated"
  | "refreshing"
  | "expired"
  | "error";

interface ClaimsParser<TClaims> {
  parse(input: unknown): TClaims;
}

type ReferenceOutput<TReference> = OperationOutput<TReference>;
type ReferenceInput<TReference> = OperationInput<TReference>;

export interface JwtAuthSnapshot<TUser, TClaims extends JwtClaims, TState> {
  readonly revision: number;
  readonly status: RuntimeAuthStatus;
  readonly user?: Readonly<TUser>;
  readonly claims?: Readonly<TClaims>;
  readonly state: Readonly<TState>;
  readonly permissions: ReadonlySet<string>;
  readonly sessionGeneration: number;
  readonly error?: NormalizedFailure;
}

export interface CookieAuthSnapshot<TUser, TState> {
  readonly revision: number;
  readonly status: RuntimeAuthStatus;
  readonly user?: Readonly<TUser>;
  readonly state: Readonly<TState>;
  readonly permissions: ReadonlySet<string>;
  readonly sessionGeneration: number;
  readonly error?: NormalizedFailure;
}

export interface JwtAuthController<
  TCredentials,
  TUser,
  TClaims extends JwtClaims,
  TState,
> extends RuntimeAuthController<JwtAuthSnapshot<TUser, TClaims, TState>> {
  readonly status: RuntimeAuthStatus;
  readonly user: Readonly<TUser> | undefined;
  readonly claims: Readonly<TClaims> | undefined;
  readonly state: Readonly<TState>;
  readonly permissions: ReadonlySet<string>;
  readonly error: NormalizedFailure | undefined;
  login(credentials: TCredentials): Promise<AuthResult<Readonly<TUser> | undefined>>;
  logout(): Promise<AuthResult<void>>;
  updateUser(user: TUser): void;
  updateState(patch: Partial<TState>): void;
}

export interface CookieAuthController<TCredentials, TUser, TState> extends RuntimeAuthController<
  CookieAuthSnapshot<TUser, TState>
> {
  readonly status: RuntimeAuthStatus;
  readonly user: Readonly<TUser> | undefined;
  readonly state: Readonly<TState>;
  readonly permissions: ReadonlySet<string>;
  readonly error: NormalizedFailure | undefined;
  login(credentials: TCredentials): Promise<AuthResult<Readonly<TUser>>>;
  logout(): Promise<AuthResult<void>>;
  updateUser(user: TUser): void;
  updateState(patch: Partial<TState>): void;
}

export interface JwtAuthOptions<
  TClaims extends JwtClaims,
  TLogin extends OperationReference,
  TRefresh extends OperationReference,
  TLogout extends OperationReference,
  TCurrentUser extends OperationReference | undefined,
  TState,
> {
  readonly claims: ClaimsParser<TClaims>;
  readonly login: TLogin;
  readonly refresh: TRefresh;
  readonly logout: TLogout;
  readonly currentUser?: TCurrentUser;
  readonly storage?: AuthStorage;
  readonly state?: () => TState;
  readonly permissions?: (input: {
    readonly claims: Readonly<TClaims>;
    readonly user?: Readonly<UserOutput<TCurrentUser>>;
    readonly state: Readonly<TState>;
  }) => Iterable<string>;
  readonly cacheScope?: (input: {
    readonly claims: Readonly<TClaims>;
    readonly user?: Readonly<UserOutput<TCurrentUser>>;
  }) => string | Readonly<Record<string, string | number | undefined>>;
  readonly scheme?: string;
  readonly clockSkewSeconds?: number;
  readonly refreshBeforeExpirySeconds?: number;
  readonly issuer?: string;
  readonly audience?: string;
}

type UserOutput<TReference> = TReference extends OperationReference
  ? ReferenceOutput<TReference>
  : unknown;

export interface CookieAuthOptions<
  TLogin extends OperationReference,
  TLogout extends OperationReference,
  TSession extends OperationReference,
  TState,
> {
  readonly login: TLogin;
  readonly logout: TLogout;
  readonly session: TSession;
  readonly credentials?: "same-origin" | "include";
  readonly csrf?: {
    readonly header: string;
    readonly token: () => string | undefined;
  };
  readonly state?: () => TState;
  readonly permissions?: (input: {
    readonly user: Readonly<ReferenceOutput<TSession>>;
    readonly state: Readonly<TState>;
  }) => Iterable<string>;
  readonly subject: (input: {
    readonly user: Readonly<ReferenceOutput<TSession>>;
  }) => string | number;
  readonly cacheScope?: (input: {
    readonly user: Readonly<ReferenceOutput<TSession>>;
  }) => string | Readonly<Record<string, string | number | undefined>>;
}

export function jwtAuth<
  TClaims extends JwtClaims,
  const TLogin extends OperationReference,
  const TRefresh extends OperationReference,
  const TLogout extends OperationReference,
  const TCurrentUser extends OperationReference | undefined = undefined,
  TState = Readonly<Record<never, never>>,
>(
  options: JwtAuthOptions<TClaims, TLogin, TRefresh, TLogout, TCurrentUser, TState>,
): AuthStrategyDefinition<
  JwtAuthController<ReferenceInput<TLogin>, UserOutput<TCurrentUser>, TClaims, TState>
> {
  const frozen = Object.freeze({ ...options });
  const operations: OperationReference[] = [options.login, options.refresh, options.logout];
  if (options.currentUser) operations.push(options.currentUser);
  return Object.freeze({
    kind: "uicogs-auth-strategy" as const,
    operations: Object.freeze(operations),
    create: () =>
      new JwtRuntimeAuthController<
        ReferenceInput<TLogin>,
        UserOutput<TCurrentUser>,
        TClaims,
        TState,
        TLogin,
        TRefresh,
        TLogout,
        TCurrentUser
      >(frozen),
  });
}

export function cookieAuth<
  const TLogin extends OperationReference,
  const TLogout extends OperationReference,
  const TSession extends OperationReference,
  TState = Readonly<Record<never, never>>,
>(
  options: CookieAuthOptions<TLogin, TLogout, TSession, TState>,
): AuthStrategyDefinition<
  CookieAuthController<ReferenceInput<TLogin>, ReferenceOutput<TSession>, TState>
> {
  const frozen = Object.freeze({ ...options });
  return Object.freeze({
    kind: "uicogs-auth-strategy" as const,
    operations: Object.freeze([options.login, options.logout, options.session]),
    create: () =>
      new CookieRuntimeAuthController<
        ReferenceInput<TLogin>,
        ReferenceOutput<TSession>,
        TState,
        TLogin,
        TLogout,
        TSession
      >(frozen),
  });
}

abstract class RuntimeAuthBase<TSnapshot extends { readonly sessionGeneration: number }>
  implements RuntimeAuthController<TSnapshot>, ExternalStore<TSnapshot>
{
  protected bindings?: AuthRuntimeBindings;
  protected disposed = false;
  protected readonly controllers = new Set<AbortController>();
  private readonly logoutListeners = new Set<() => void>();
  protected initialization?: Promise<void>;

  abstract readonly store: Store<TSnapshot>;
  abstract get status(): RuntimeAuthStatus;
  abstract get sessionGeneration(): number;
  abstract cacheScope(): string;
  abstract middleware(): TransportMiddleware;
  abstract initialize(): Promise<void>;

  get value(): TSnapshot {
    return this.getSnapshot();
  }

  attach(bindings: AuthRuntimeBindings): void {
    if (this.bindings) throw new Error("Authentication is already attached to a UiCogs runtime");
    this.bindings = bindings;
  }

  getSnapshot(): TSnapshot {
    return this.store.getSnapshot();
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  subscribeLogout(listener: () => void): () => void {
    this.logoutListeners.add(listener);
    return () => this.logoutListeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.logoutListeners.clear();
  }

  protected controller(): AbortController {
    if (this.disposed) throw new DOMException("Authentication is disposed", "AbortError");
    const controller = new AbortController();
    this.controllers.add(controller);
    return controller;
  }

  protected release(controller: AbortController): void {
    this.controllers.delete(controller);
  }

  protected executor(): AuthRuntimeBindings {
    if (!this.bindings) throw new Error("Authentication is not attached to a UiCogs runtime");
    return this.bindings;
  }

  protected emitLogout(): void {
    for (const listener of [...this.logoutListeners]) listener();
  }
}

class JwtRuntimeAuthController<
  TCredentials,
  TUser,
  TClaims extends JwtClaims,
  TState,
  TLogin extends OperationReference,
  TRefresh extends OperationReference,
  TLogout extends OperationReference,
  TCurrentUser extends OperationReference | undefined,
> extends RuntimeAuthBase<JwtAuthSnapshot<TUser, TClaims, TState>> {
  readonly store: Store<JwtAuthSnapshot<TUser, TClaims, TState>>;
  private readonly storage: AuthStorage;
  private tokens?: AuthTokens;
  private revocationAccess?: string;
  private refreshRequest?: Promise<void>;
  private refreshTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly options: JwtAuthOptions<
      TClaims,
      TLogin,
      TRefresh,
      TLogout,
      TCurrentUser,
      TState
    >,
  ) {
    super();
    this.storage = options.storage ?? memoryAuthStorage();
    this.store = new Store({
      revision: 0,
      status: "initializing",
      state: Object.freeze((options.state?.() ?? {}) as TState),
      permissions: readonlySet(),
      sessionGeneration: 0,
    });
  }

  get status(): RuntimeAuthStatus {
    return this.getSnapshot().status;
  }
  get user(): Readonly<TUser> | undefined {
    return this.getSnapshot().user;
  }
  get claims(): Readonly<TClaims> | undefined {
    return this.getSnapshot().claims;
  }
  get state(): Readonly<TState> {
    return this.getSnapshot().state;
  }
  get permissions(): ReadonlySet<string> {
    return this.getSnapshot().permissions;
  }
  get error(): NormalizedFailure | undefined {
    return this.getSnapshot().error;
  }
  get sessionGeneration(): number {
    return this.getSnapshot().sessionGeneration;
  }

  initialize(): Promise<void> {
    if (this.initialization) return this.initialization;
    this.initialization = this.initializeSession();
    return this.initialization;
  }

  async login(credentials: TCredentials): Promise<AuthResult<Readonly<TUser> | undefined>> {
    const generation = this.beginLifecycle("authenticating");
    const controller = this.controller();
    try {
      const tokens = assertTokens(
        await this.executor().execute(
          this.options.login,
          credentials as ReferenceInput<TLogin>,
          "establish",
          controller.signal,
        ),
      );
      await this.acceptTokens(tokens, generation, false);
      return { ok: true, value: this.user };
    } catch (error) {
      const failure = normalizeFailure(error);
      if (generation === this.sessionGeneration) this.patch({ status: "error", error: failure });
      return { ok: false, failure };
    } finally {
      this.release(controller);
    }
  }

  async logout(): Promise<AuthResult<void>> {
    this.emitLogout();
    const previousTokens = this.tokens;
    const generation = this.sessionGeneration + 1;
    this.abortLifecycle();
    this.clearRefreshTimer();
    this.tokens = undefined;
    this.revocationAccess = previousTokens?.access;
    this.store.setSnapshot(this.anonymousSnapshot(generation));
    await this.storage.clear();
    if (!previousTokens) return { ok: true, value: undefined };
    const controller = this.controller();
    try {
      await this.executor().execute(
        this.options.logout,
        undefined as ReferenceInput<TLogout>,
        "logout",
        controller.signal,
      );
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, failure: normalizeFailure(error) };
    } finally {
      this.revocationAccess = undefined;
      this.release(controller);
    }
  }

  updateUser(user: TUser): void {
    this.patch({ user });
  }

  updateState(patch: Partial<TState>): void {
    this.patch({ state: Object.freeze({ ...this.state, ...patch }) as Readonly<TState> });
  }

  cacheScope(): string {
    const claims = this.claims;
    if (!claims) return "anonymous";
    const projected = this.options.cacheScope?.({
      claims,
      user: this.user as Readonly<UserOutput<TCurrentUser>> | undefined,
    });
    return typeof projected === "string"
      ? projected
      : projected
        ? stableSerialize(projected)
        : `subject:${claims.sub}`;
  }

  middleware(): TransportMiddleware {
    return authMiddleware(
      async (request) => {
        if (request.authentication === "none" || request.authentication === "establish")
          return { ...request, credentials: "omit" };
        if (request.authentication === "refresh") return { ...request, credentials: "omit" };
        await this.initialize();
        if (
          request.authentication !== "logout" &&
          this.status !== "refreshing" &&
          this.shouldRefresh()
        )
          await this.refresh();
        const access =
          request.authentication === "logout" ? this.revocationAccess : this.tokens?.access;
        if (request.authentication === "required" && !this.tokens)
          throw new Error("Authentication is required");
        return {
          ...request,
          credentials: "omit",
          ...(access
            ? {
                headers: mergeHeaders(request.headers, {
                  Authorization: `${this.options.scheme ?? "Bearer"} ${access}`,
                }),
              }
            : {}),
        };
      },
      async (request, response, next) => {
        if (
          response.status !== 401 ||
          request.authentication === "none" ||
          request.authentication === "establish" ||
          request.authentication === "refresh" ||
          request.authentication === "logout"
        )
          return response;
        await this.refresh();
        if (!this.tokens) return response;
        return next(
          await this.prepareReplay({
            ...request,
            authentication: "refresh",
          }),
        );
      },
    );
  }

  override dispose(): void {
    this.clearRefreshTimer();
    super.dispose();
  }

  private async initializeSession(): Promise<void> {
    const generation = this.sessionGeneration;
    try {
      const tokens = await this.storage.read();
      if (!tokens) {
        if (!this.disposed && generation === this.sessionGeneration)
          this.patch({ status: "anonymous" });
        return;
      }
      await this.acceptTokens(tokens, generation, false);
    } catch (error) {
      await this.expire(normalizeFailure(error), generation);
    }
  }

  private async refresh(): Promise<void> {
    if (this.refreshRequest) return this.refreshRequest;
    const current = this.tokens;
    if (!current?.refresh) {
      await this.expire(normalizeFailure(new Error("Session cannot be refreshed")));
      return;
    }
    const generation = this.sessionGeneration;
    const subject = this.claims?.sub;
    const controller = this.controller();
    this.patch({ status: "refreshing" });
    this.refreshRequest = this.executor()
      .execute(
        this.options.refresh,
        { refresh: current.refresh } as ReferenceInput<TRefresh>,
        "refresh",
        controller.signal,
      )
      .then((value) => this.acceptTokens(assertTokens(value), generation, true, subject))
      .catch((error: unknown) => this.expire(normalizeFailure(error), generation))
      .finally(() => {
        this.release(controller);
        this.refreshRequest = undefined;
      });
    return this.refreshRequest;
  }

  private async acceptTokens(
    incoming: AuthTokens,
    generation: number,
    inheritRefresh: boolean,
    expectedSubject?: string,
  ): Promise<void> {
    const claims = this.parseClaims(incoming.access);
    this.assertUsable(claims);
    if (expectedSubject && claims.sub !== expectedSubject)
      throw new Error("Refresh changed the authenticated subject");
    const tokens = Object.freeze({
      access: incoming.access,
      ...(incoming.refresh
        ? { refresh: incoming.refresh }
        : inheritRefresh && this.tokens?.refresh
          ? { refresh: this.tokens.refresh }
          : {}),
    });
    const previousTokens = this.tokens;
    this.tokens = tokens;
    let user: TUser | undefined;
    try {
      user = this.options.currentUser ? await this.loadCurrentUser(generation) : this.user;
    } catch (error) {
      this.tokens = previousTokens;
      throw error;
    }
    if (this.disposed || generation !== this.sessionGeneration) return;
    await this.storage.write(tokens);
    if (this.disposed || generation !== this.sessionGeneration) return;
    this.tokens = tokens;
    this.publishAuthenticated(claims, user, generation);
  }

  private async loadCurrentUser(generation: number): Promise<TUser | undefined> {
    const controller = this.controller();
    try {
      const value = await this.executor().execute(
        this.options.currentUser!,
        undefined as ReferenceInput<Exclude<TCurrentUser, undefined>>,
        "required",
        controller.signal,
      );
      return generation === this.sessionGeneration ? (value as TUser) : undefined;
    } finally {
      this.release(controller);
    }
  }

  private publishAuthenticated(claims: TClaims, user: TUser | undefined, generation: number): void {
    const state = this.state;
    const permissions = readonlySet(
      this.options.permissions?.({
        claims,
        user: user as Readonly<UserOutput<TCurrentUser>> | undefined,
        state,
      }) ?? [],
    );
    this.store.setSnapshot({
      revision: this.getSnapshot().revision + 1,
      status: "authenticated",
      claims: Object.freeze(claims),
      ...(user !== undefined ? { user: Object.freeze(user) as Readonly<TUser> } : {}),
      state,
      permissions,
      sessionGeneration: generation,
    });
    this.scheduleRefresh();
  }

  private parseClaims(token: string): TClaims {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1]) throw new Error("Invalid JWT structure");
    return this.options.claims.parse(JSON.parse(decodeBase64Url(parts[1])) as unknown);
  }

  private assertUsable(claims: TClaims): void {
    const skew = this.options.clockSkewSeconds ?? 30;
    const now = Date.now() / 1000;
    if (claims.exp !== undefined && claims.exp + skew <= now)
      throw new Error("Access token has expired");
    if (claims.nbf !== undefined && claims.nbf - skew > now)
      throw new Error("Access token is not active");
    if (this.options.issuer && claims.iss !== this.options.issuer)
      throw new Error("Unexpected token issuer");
    const audience = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
    if (this.options.audience && !audience.includes(this.options.audience))
      throw new Error("Unexpected token audience");
  }

  private shouldRefresh(): boolean {
    const exp = this.claims?.exp;
    return (
      exp !== undefined &&
      exp - (this.options.refreshBeforeExpirySeconds ?? 60) <= Date.now() / 1000
    );
  }

  private scheduleRefresh(): void {
    this.clearRefreshTimer();
    const exp = this.claims?.exp;
    if (exp === undefined || !this.tokens?.refresh) return;
    const delay =
      (exp - (this.options.refreshBeforeExpirySeconds ?? 60) - Date.now() / 1000) * 1000;
    this.refreshTimer = setTimeout(() => void this.refresh(), Math.max(0, delay));
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  private beginLifecycle(status: RuntimeAuthStatus): number {
    const generation = this.sessionGeneration + 1;
    this.abortLifecycle();
    this.patch({ status, sessionGeneration: generation, error: undefined });
    return generation;
  }

  private abortLifecycle(): void {
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }

  private async expire(
    failure: NormalizedFailure,
    generation = this.sessionGeneration,
  ): Promise<void> {
    if (this.disposed || generation !== this.sessionGeneration) return;
    this.clearRefreshTimer();
    this.tokens = undefined;
    await this.storage.clear();
    this.store.setSnapshot({
      ...this.anonymousSnapshot(generation + 1),
      status: "expired",
      error: failure,
    });
  }

  private anonymousSnapshot(generation: number): JwtAuthSnapshot<TUser, TClaims, TState> {
    return {
      revision: this.getSnapshot().revision + 1,
      status: "anonymous",
      state: Object.freeze((this.options.state?.() ?? {}) as TState),
      permissions: readonlySet(),
      sessionGeneration: generation,
    };
  }

  private patch(patch: Partial<JwtAuthSnapshot<TUser, TClaims, TState>>): void {
    if (this.disposed) return;
    this.store.update((state) => ({ ...state, ...patch, revision: state.revision + 1 }));
  }

  private prepareReplay(request: TransportRequest): TransportRequest {
    if (!this.tokens) return request;
    return {
      ...request,
      credentials: "omit",
      headers: mergeHeaders(request.headers, {
        Authorization: `${this.options.scheme ?? "Bearer"} ${this.tokens.access}`,
      }),
    };
  }
}

class CookieRuntimeAuthController<
  TCredentials,
  TUser,
  TState,
  TLogin extends OperationReference,
  TLogout extends OperationReference,
  TSession extends OperationReference,
> extends RuntimeAuthBase<CookieAuthSnapshot<TUser, TState>> {
  readonly store: Store<CookieAuthSnapshot<TUser, TState>>;

  constructor(private readonly options: CookieAuthOptions<TLogin, TLogout, TSession, TState>) {
    super();
    this.store = new Store({
      revision: 0,
      status: "initializing",
      state: Object.freeze((options.state?.() ?? {}) as TState),
      permissions: readonlySet(),
      sessionGeneration: 0,
    });
  }

  get status(): RuntimeAuthStatus {
    return this.getSnapshot().status;
  }
  get user(): Readonly<TUser> | undefined {
    return this.getSnapshot().user;
  }
  get state(): Readonly<TState> {
    return this.getSnapshot().state;
  }
  get permissions(): ReadonlySet<string> {
    return this.getSnapshot().permissions;
  }
  get error(): NormalizedFailure | undefined {
    return this.getSnapshot().error;
  }
  get sessionGeneration(): number {
    return this.getSnapshot().sessionGeneration;
  }

  initialize(): Promise<void> {
    if (this.initialization) return this.initialization;
    this.initialization = this.loadSession(true).then(() => undefined);
    return this.initialization;
  }

  async login(credentials: TCredentials): Promise<AuthResult<Readonly<TUser>>> {
    const generation = this.beginLifecycle("authenticating");
    const controller = this.controller();
    try {
      await this.executor().execute(
        this.options.login,
        credentials as ReferenceInput<TLogin>,
        "establish",
        controller.signal,
      );
      const user = await this.loadSession(false, generation);
      if (!user) throw new Error("Cookie login did not establish a session");
      return { ok: true, value: user };
    } catch (error) {
      const failure = normalizeFailure(error);
      if (generation === this.sessionGeneration) this.patch({ status: "error", error: failure });
      return { ok: false, failure };
    } finally {
      this.release(controller);
    }
  }

  async logout(): Promise<AuthResult<void>> {
    this.emitLogout();
    const generation = this.sessionGeneration + 1;
    this.abortLifecycle();
    this.store.setSnapshot(this.anonymousSnapshot(generation));
    const controller = this.controller();
    try {
      await this.executor().execute(
        this.options.logout,
        undefined as ReferenceInput<TLogout>,
        "establish",
        controller.signal,
      );
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, failure: normalizeFailure(error) };
    } finally {
      this.release(controller);
    }
  }

  updateUser(user: TUser): void {
    this.publishUser(user, this.sessionGeneration);
  }

  updateState(patch: Partial<TState>): void {
    this.patch({ state: Object.freeze({ ...this.state, ...patch }) as Readonly<TState> });
  }

  cacheScope(): string {
    if (!this.user) return "anonymous";
    const projected = this.options.cacheScope?.({
      user: this.user as Readonly<ReferenceOutput<TSession>>,
    });
    if (typeof projected === "string") return projected;
    if (projected) return stableSerialize(projected);
    return `subject:${String(
      this.options.subject({ user: this.user as Readonly<ReferenceOutput<TSession>> }),
    )}`;
  }

  middleware(): TransportMiddleware {
    return authMiddleware(
      async (request) => {
        if (request.authentication === "none") return { ...request, credentials: "omit" };
        if (request.authentication !== "establish" && request.authentication !== "logout")
          await this.initialize();
        if (request.authentication === "required" && !this.user)
          throw new Error("Authentication is required");
        const credentials = this.options.credentials ?? "same-origin";
        const unsafe = request.method !== "GET";
        if (!unsafe || !this.options.csrf) return { ...request, credentials };
        const token = this.options.csrf.token();
        if (!token) throw new Error("CSRF token is required for this request");
        return {
          ...request,
          credentials,
          headers: mergeHeaders(request.headers, { [this.options.csrf.header]: token }),
        };
      },
      async (request, response) => {
        if (
          response.status === 401 &&
          request.authentication !== "none" &&
          request.authentication !== "establish" &&
          request.authentication !== "logout"
        ) {
          const generation = this.sessionGeneration + 1;
          this.store.setSnapshot({
            ...this.anonymousSnapshot(generation),
            status: "expired",
            error: normalizeFailure(new Error("Cookie session expired")),
          });
        }
        return response;
      },
    );
  }

  private async loadSession(
    initial: boolean,
    generation = this.sessionGeneration,
  ): Promise<Readonly<TUser> | undefined> {
    const controller = this.controller();
    try {
      const user = (await this.executor().execute(
        this.options.session,
        undefined as ReferenceInput<TSession>,
        "establish",
        controller.signal,
      )) as TUser;
      if (this.disposed || generation !== this.sessionGeneration) return undefined;
      this.publishUser(user, generation);
      return this.user;
    } catch (error) {
      const failure = normalizeFailure(error);
      if (this.disposed || generation !== this.sessionGeneration) return undefined;
      if (failure.status === 401 || failure.kind === "authentication") {
        this.store.setSnapshot(this.anonymousSnapshot(generation));
        return undefined;
      }
      this.patch({ status: "error", error: failure });
      if (!initial) throw error;
      return undefined;
    } finally {
      this.release(controller);
    }
  }

  private publishUser(user: TUser, generation: number): void {
    const frozenUser = Object.freeze(user) as Readonly<TUser>;
    const permissions = readonlySet(
      this.options.permissions?.({
        user: frozenUser as Readonly<ReferenceOutput<TSession>>,
        state: this.state,
      }) ?? [],
    );
    this.store.setSnapshot({
      revision: this.getSnapshot().revision + 1,
      status: "authenticated",
      user: frozenUser,
      state: this.state,
      permissions,
      sessionGeneration: generation,
    });
  }

  private beginLifecycle(status: RuntimeAuthStatus): number {
    const generation = this.sessionGeneration + 1;
    this.abortLifecycle();
    this.patch({ status, sessionGeneration: generation, error: undefined });
    return generation;
  }

  private abortLifecycle(): void {
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }

  private anonymousSnapshot(generation: number): CookieAuthSnapshot<TUser, TState> {
    return {
      revision: this.getSnapshot().revision + 1,
      status: "anonymous",
      state: Object.freeze((this.options.state?.() ?? {}) as TState),
      permissions: readonlySet(),
      sessionGeneration: generation,
    };
  }

  private patch(patch: Partial<CookieAuthSnapshot<TUser, TState>>): void {
    if (this.disposed) return;
    this.store.update((state) => ({ ...state, ...patch, revision: state.revision + 1 }));
  }
}

function authMiddleware(
  prepare: (request: TransportRequest) => Promise<TransportRequest>,
  recover?: (
    request: TransportRequest,
    response: Awaited<ReturnType<Parameters<TransportMiddleware["request"]>[1]>>,
    next: Parameters<TransportMiddleware["request"]>[1],
  ) => Promise<Awaited<ReturnType<Parameters<TransportMiddleware["request"]>[1]>>>,
): TransportMiddleware {
  return {
    request: async (request, next) => {
      const prepared = await prepare(request);
      const response = await next(prepared);
      return recover ? recover(prepared, response, next) : response;
    },
    openStream: async (request, next) => {
      const prepared = await prepare(request);
      const response = await next(prepared);
      if (!recover || response.status !== 401) return response;
      await closeStream(response.body);
      const recovered = await recover(prepared, response as never, next as never);
      return recovered as never;
    },
  };
}

function assertTokens(value: unknown): AuthTokens {
  if (typeof value !== "object" || value === null || !("access" in value))
    throw new Error("Authentication operation did not return an access token");
  const access = Reflect.get(value, "access");
  const refresh = Reflect.get(value, "refresh");
  if (typeof access !== "string") throw new Error("Access token must be a string");
  if (refresh !== undefined && typeof refresh !== "string")
    throw new Error("Refresh token must be a string");
  return Object.freeze({ access, ...(refresh ? { refresh } : {}) });
}

function mergeHeaders(
  current: Readonly<Record<string, string>> | undefined,
  added: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const values = new Map<string, { readonly name: string; readonly value: string }>();
  for (const [name, value] of Object.entries(current ?? {}))
    values.set(name.toLowerCase(), { name, value });
  for (const [name, value] of Object.entries(added))
    values.set(name.toLowerCase(), { name, value });
  return Object.freeze(
    Object.fromEntries([...values.values()].map(({ name, value }) => [name, value])),
  );
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof atob === "function")
    return decodeURIComponent(
      [...atob(normalized)]
        .map((character) => `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join(""),
    );
  /* v8 ignore next -- Node 20 without the browser-compatible atob global. */
  return Buffer.from(normalized, "base64").toString("utf8");
}

function readonlySet<T>(values: Iterable<T> = []): ReadonlySet<T> {
  const source = new Set(values);
  const view: ReadonlySet<T> = {
    get size() {
      return source.size;
    },
    has: (value: T) => source.has(value),
    entries: () => source.entries(),
    keys: () => source.keys(),
    values: () => source.values(),
    forEach: (callback: (value: T, valueAgain: T, set: ReadonlySet<T>) => void) =>
      source.forEach((value) => callback(value, value, view)),
    [Symbol.iterator]: () => source[Symbol.iterator](),
  };
  return Object.freeze(view);
}

async function closeStream(body: AsyncIterable<Uint8Array>): Promise<void> {
  await body[Symbol.asyncIterator]().return?.();
}
