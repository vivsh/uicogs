import { Store, type ExternalStore } from "./store.js";
import type { Transport } from "./transport.js";

export type LiveStatus =
  "disabled" | "waiting" | "connecting" | "open" | "reconnecting" | "closed" | "error";

export type LiveVersion = string | number;

export interface LiveEvent {
  readonly type: string;
  readonly data: string;
  readonly id?: string;
}

export type LiveFrame =
  | { readonly kind: "event"; readonly event: LiveEvent }
  | { readonly kind: "retry"; readonly milliseconds: number };

export interface LiveMutation {
  readonly action: "upsert" | "delete" | "invalidate";
  readonly resource: string;
  readonly value?: unknown;
  readonly key?: string | number;
}

/** Persistent inbox data shared by live adapters and framework renderers. */
export interface UiNotification {
  readonly id: string | number;
  readonly title: string;
  readonly message?: string;
  readonly level?: "info" | "positive" | "warning" | "negative";
  readonly icon?: string;
  readonly image?: { readonly src: string; readonly alt?: string };
  readonly createdAt?: string;
  readonly read?: boolean;
  readonly actionUrl?: string;
  readonly actions?: readonly UiNotificationAction[];
}

/** A declarative notification action. Applications decide how its intent reaches a backend. */
export interface UiNotificationAction {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly actionUrl?: string;
  readonly priority?: "primary" | "overflow";
}

/** A transient message delivered exactly once by a framework alert host. */
export interface UiAlert {
  readonly id?: string | number;
  readonly message: string;
  readonly caption?: string;
  readonly level?: "info" | "positive" | "warning" | "negative";
  readonly icon?: string;
  readonly timeout?: number;
}

/** An atomic persistent-inbox change emitted by a live adapter. */
export type NotificationMutation =
  | {
      readonly action: "replace";
      readonly items: readonly UiNotification[];
      readonly unreadCount?: number;
    }
  | { readonly action: "upsert"; readonly item: UiNotification }
  | { readonly action: "remove"; readonly id: UiNotification["id"] }
  | { readonly action: "mark-read"; readonly id: UiNotification["id"]; readonly read?: boolean };

/** One normalized consequence of a live event. Plain LiveMutation values remain accepted for compatibility. */
export type LiveEffect =
  | { readonly kind: "mutation"; readonly mutation: LiveMutation }
  | { readonly kind: "notification"; readonly mutation: NotificationMutation }
  | { readonly kind: "alert"; readonly alert: UiAlert };

export type LiveEffectResult =
  LiveMutation | LiveEffect | readonly (LiveMutation | LiveEffect)[] | undefined;

export interface LiveAdapter<TContext> {
  map(options: {
    readonly context: TContext;
    readonly scope: string;
    readonly event: string;
    readonly payload: unknown;
    readonly source: LiveEvent;
  }): LiveEffectResult | Promise<LiveEffectResult>;
}

export interface LiveOptions<TContext> {
  readonly sources: readonly LiveSource<TContext>[];
  readonly adapters?: readonly LiveAdapter<TContext>[];
  readonly notifications?: { readonly maximumItems?: number };
}

export type LiveConfiguration<TContext> = LiveSource<TContext> | LiveOptions<TContext>;

export interface LiveRetryOptions {
  readonly initialMs?: number;
  readonly maximumMs?: number;
  readonly jitter?: number;
}

export interface LiveOpenOptions<TContext> {
  readonly context: TContext;
  readonly scope: string;
  readonly transport: Transport;
  readonly baseUrl: string;
  readonly lastEventId?: string;
  readonly signal: AbortSignal;
}

export interface LiveOpenResult {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly frames: AsyncIterable<LiveFrame>;
}

export interface LiveSource<TContext> {
  /** Stable diagnostic name. Defaults to its declaration index when omitted. */
  readonly name?: string;
  readonly retry?: LiveRetryOptions;
  enabled?(options: { readonly context: TContext; readonly scope: string }): boolean;
  open(options: LiveOpenOptions<TContext>): Promise<LiveOpenResult>;
  version?(options: {
    readonly event: LiveEvent;
    readonly payload: unknown;
  }): LiveVersion | undefined;
  map?(options: {
    readonly event: string;
    readonly payload: unknown;
    readonly source: LiveEvent;
  }): LiveEffectResult | Promise<LiveEffectResult>;
  onUnhandled?(event: LiveEvent): void;
}

export interface LiveDiagnostic {
  readonly kind: "transport" | "protocol" | "json" | "schema" | "version" | "unhandled";
  readonly message: string;
  readonly retryable: boolean;
  readonly event?: string;
  readonly eventId?: string;
}

export interface LiveSnapshot {
  readonly revision: number;
  readonly status: LiveStatus;
  readonly lastError?: LiveDiagnostic;
  readonly lastEventId?: string;
  readonly connectedAt?: number;
  readonly retryAt?: number;
}

export interface LiveSourceSnapshot extends LiveSnapshot {
  readonly name: string;
}

export interface LiveHubSnapshot extends LiveSnapshot {
  readonly sources: readonly LiveSourceSnapshot[];
}

export interface NotificationSnapshot {
  readonly revision: number;
  readonly status: "disabled" | "ready" | "error";
  readonly items: readonly UiNotification[];
  readonly unreadCount: number;
  readonly error?: string;
}

export interface AlertSnapshot {
  readonly revision: number;
  readonly items: readonly UiAlert[];
}

export class LiveSourceError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "LiveSourceError";
  }
}

/** Framework-neutral, bounded inbox state. It never performs persistence or network mutations. */
export class NotificationController implements ExternalStore<NotificationSnapshot> {
  private readonly store: Store<NotificationSnapshot>;
  private readonly maximumItems: number;

  constructor(enabled = false, maximumItems = 100) {
    this.maximumItems = positiveInteger(maximumItems, "notifications.maximumItems");
    this.store = new Store({
      revision: 0,
      status: enabled ? "ready" : "disabled",
      items: Object.freeze([]),
      unreadCount: 0,
    });
  }

  get status(): NotificationSnapshot["status"] {
    return this.store.getSnapshot().status;
  }
  get items(): readonly UiNotification[] {
    return this.store.getSnapshot().items;
  }
  get unreadCount(): number {
    return this.store.getSnapshot().unreadCount;
  }
  get error(): string | undefined {
    return this.store.getSnapshot().error;
  }
  getSnapshot(): NotificationSnapshot {
    return this.store.getSnapshot();
  }
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  apply(mutation: NotificationMutation): void {
    const snapshot = this.store.getSnapshot();
    if (snapshot.status === "disabled") return;
    try {
      const result = applyNotificationMutation(snapshot, mutation, this.maximumItems);
      this.store.setSnapshot({
        revision: snapshot.revision + 1,
        status: "ready",
        items: result.items,
        unreadCount: result.unreadCount,
      });
    } catch (error) {
      this.store.setSnapshot({
        ...snapshot,
        revision: snapshot.revision + 1,
        status: "error",
        error: errorMessage(error),
      });
    }
  }
}

/** A bounded, exactly-once transient alert queue for framework hosts. */
export class AlertController implements ExternalStore<AlertSnapshot> {
  private readonly store = new Store<AlertSnapshot>({ revision: 0, items: Object.freeze([]) });

  get items(): readonly UiAlert[] {
    return this.store.getSnapshot().items;
  }
  getSnapshot(): AlertSnapshot {
    return this.store.getSnapshot();
  }
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  enqueue(alert: UiAlert): void {
    if (!alert.message.trim()) throw new Error("Live alert requires a message");
    const snapshot = this.store.getSnapshot();
    this.store.setSnapshot({
      revision: snapshot.revision + 1,
      items: Object.freeze([...snapshot.items, Object.freeze({ ...alert })].slice(-100)),
    });
  }

  /** Removes and returns the next alert, ensuring hosts cannot deliver it twice. */
  consume(): UiAlert | undefined {
    const snapshot = this.store.getSnapshot();
    const [next, ...remaining] = snapshot.items;
    if (!next) return undefined;
    this.store.setSnapshot({ revision: snapshot.revision + 1, items: Object.freeze(remaining) });
    return next;
  }
}

interface LiveRuntime<TContext> {
  readonly context: () => TContext;
  readonly scope: () => string;
  readonly transport: Transport;
  readonly baseUrl: string;
  dispatchDefault(
    event: LiveEvent,
    payload: unknown,
    version: LiveVersion | undefined,
    scope: string,
  ): boolean;
  dispatchEffects(
    effects: readonly (LiveMutation | LiveEffect)[],
    version: LiveVersion | undefined,
    scope: string,
  ): void;
}

export class LiveController<TContext> implements ExternalStore<LiveSnapshot> {
  private readonly store: Store<LiveSnapshot>;
  private controller?: AbortController;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private disposed = false;
  private activeScope?: string;
  private retryAttempt = 0;
  private serverRetryMs?: number;
  private readonly seenIds = new Set<string>();
  private readonly seenOrder: string[] = [];

  constructor(
    private readonly source: LiveSource<TContext> | undefined,
    private readonly runtime: LiveRuntime<TContext>,
    private readonly adapters: readonly LiveAdapter<TContext>[] = [],
  ) {
    this.store = new Store({
      revision: 0,
      status: source ? "waiting" : "disabled",
    });
    if (source) queueMicrotask(() => this.evaluate());
  }

  get status(): LiveStatus {
    return this.store.getSnapshot().status;
  }
  get lastError(): LiveDiagnostic | undefined {
    return this.store.getSnapshot().lastError;
  }
  get lastEventId(): string | undefined {
    return this.store.getSnapshot().lastEventId;
  }
  get connectedAt(): number | undefined {
    return this.store.getSnapshot().connectedAt;
  }
  get retryAt(): number | undefined {
    return this.store.getSnapshot().retryAt;
  }
  getSnapshot(): LiveSnapshot {
    return this.store.getSnapshot();
  }
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  reevaluate(): void {
    if (this.disposed || !this.source) return;
    const scope = this.runtime.scope();
    if (this.activeScope !== undefined && this.activeScope !== scope) this.resetReplayState();
    this.stopCurrent();
    this.setState({ status: "waiting", retryAt: undefined });
    queueMicrotask(() => this.evaluate());
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopCurrent();
    this.setState({ status: "closed", retryAt: undefined });
  }

  private evaluate(): void {
    if (this.disposed || !this.source) return;
    const context = this.runtime.context();
    const scope = this.runtime.scope();
    if (this.source.enabled && !this.source.enabled({ context, scope })) {
      this.activeScope = scope;
      this.setState({ status: "waiting", retryAt: undefined });
      return;
    }
    void this.connect(context, scope);
  }

  private async connect(context: TContext, scope: string): Promise<void> {
    if (!this.source || this.disposed) return;
    const generation = ++this.generation;
    this.controller = new AbortController();
    this.activeScope = scope;
    this.setState({
      status: this.retryAttempt ? "reconnecting" : "connecting",
      retryAt: undefined,
    });
    try {
      const result = await this.source.open({
        context,
        scope,
        transport: this.runtime.transport,
        baseUrl: this.runtime.baseUrl,
        ...(this.lastEventId ? { lastEventId: this.lastEventId } : {}),
        signal: this.controller.signal,
      });
      if (!this.isCurrent(generation, scope)) return;
      if (result.status === 204) {
        this.setState({ status: "closed", retryAt: undefined });
        return;
      }
      if (result.status >= 500) {
        this.scheduleReconnect(
          diagnostic("transport", `Live source returned ${result.status}`, true),
          generation,
          scope,
        );
        return;
      }
      if (result.status >= 400) {
        this.setTerminalError(`Live source returned ${result.status}`);
        return;
      }
      this.setState({ status: "open", connectedAt: Date.now(), retryAt: undefined });
      for await (const frame of result.frames) {
        if (!this.isCurrent(generation, scope)) return;
        if (frame.kind === "retry") {
          this.serverRetryMs = Math.max(0, frame.milliseconds);
          continue;
        }
        await this.handleEvent(frame.event, scope);
      }
      if (this.isCurrent(generation, scope))
        this.scheduleReconnect(
          diagnostic("transport", "Live stream ended", true),
          generation,
          scope,
        );
    } catch (error) {
      if (!this.isCurrent(generation, scope) || isAbort(error)) return;
      if (error instanceof LiveSourceError && !error.retryable) {
        this.setTerminalError(error.message);
        return;
      }
      this.scheduleReconnect(diagnostic("transport", errorMessage(error), true), generation, scope);
    }
  }

  private async handleEvent(event: LiveEvent, scope: string): Promise<void> {
    if (event.id !== undefined) {
      if (event.id && this.seenIds.has(event.id)) return;
      this.setState({ lastEventId: event.id || undefined });
      if (event.id) this.rememberId(event.id);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(event.data) as unknown;
    } catch {
      this.recordDiagnostic(diagnostic("json", "Live event contains malformed JSON", false, event));
      return;
    }
    let version: LiveVersion | undefined;
    try {
      version = this.source?.version?.({ event, payload });
      if (version !== undefined && typeof version !== "string" && typeof version !== "number")
        throw new Error("Live source version must be a string or number");
      const mapped = await this.mapEffects(event, payload, scope);
      if (mapped.effects.length) {
        this.runtime.dispatchEffects(mapped.effects, version, scope);
        this.retryAttempt = 0;
        return;
      }
      if (mapped.failed) return;
      if (this.runtime.dispatchDefault(event, payload, version, scope)) {
        this.retryAttempt = 0;
        return;
      }
      this.source?.onUnhandled?.(event);
      this.recordDiagnostic(
        diagnostic("unhandled", `Unhandled live event ${event.type}`, false, event),
      );
    } catch (error) {
      this.recordDiagnostic(diagnostic("schema", errorMessage(error), false, event));
    }
  }

  private scheduleReconnect(problem: LiveDiagnostic, generation: number, scope: string): void {
    if (!this.isCurrent(generation, scope) || this.disposed) return;
    const retry = this.source?.retry;
    const initial = retry?.initialMs ?? 1_000;
    const maximum = retry?.maximumMs ?? 30_000;
    const base = Math.min(maximum, this.serverRetryMs ?? initial * 2 ** this.retryAttempt++);
    const jitter = Math.max(0, Math.min(1, retry?.jitter ?? 0.2));
    const delay = Math.max(0, Math.round(base * (1 + (Math.random() * 2 - 1) * jitter)));
    this.setState({
      status: "reconnecting",
      lastError: problem,
      retryAt: Date.now() + delay,
    });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      if (this.isCurrent(generation, scope)) this.evaluate();
    }, delay);
  }

  private async mapEffects(
    event: LiveEvent,
    payload: unknown,
    scope: string,
  ): Promise<{
    readonly effects: readonly (LiveMutation | LiveEffect)[];
    readonly failed: boolean;
  }> {
    const effects: (LiveMutation | LiveEffect)[] = [];
    let failed = false;
    for (const adapter of this.adapters) {
      try {
        const mapped = await adapter.map({
          context: this.runtime.context(),
          scope,
          event: event.type,
          payload,
          source: event,
        });
        effects.push(...normalizeEffects(mapped));
      } catch (error) {
        failed = true;
        this.recordDiagnostic(diagnostic("schema", errorMessage(error), false, event));
      }
    }
    try {
      const mapped = await this.source?.map?.({ event: event.type, payload, source: event });
      effects.push(...normalizeEffects(mapped));
    } catch (error) {
      failed = true;
      this.recordDiagnostic(diagnostic("schema", errorMessage(error), false, event));
    }
    return { effects, failed };
  }

  private setTerminalError(message: string): void {
    this.setState({
      status: "error",
      lastError: diagnostic("transport", message, false),
      retryAt: undefined,
    });
  }

  private recordDiagnostic(problem: LiveDiagnostic): void {
    this.setState({ lastError: problem });
  }

  private rememberId(id: string): void {
    this.seenIds.add(id);
    this.seenOrder.push(id);
    if (this.seenOrder.length <= 1_024) return;
    const removed = this.seenOrder.shift();
    if (removed) this.seenIds.delete(removed);
  }

  private resetReplayState(): void {
    this.seenIds.clear();
    this.seenOrder.length = 0;
    this.setState({ lastEventId: undefined });
  }

  private stopCurrent(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = undefined;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  private isCurrent(generation: number, scope: string): boolean {
    return !this.disposed && generation === this.generation && scope === this.runtime.scope();
  }

  private setState(patch: Partial<LiveSnapshot>): void {
    this.store.update((state) => {
      const next = { ...state, ...patch, revision: state.revision + 1 };
      if (patch.lastError === undefined && "lastError" in patch) delete next.lastError;
      if (patch.lastEventId === undefined && "lastEventId" in patch) delete next.lastEventId;
      if (patch.connectedAt === undefined && "connectedAt" in patch) delete next.connectedAt;
      if (patch.retryAt === undefined && "retryAt" in patch) delete next.retryAt;
      return next;
    });
  }
}

/** Aggregates independently reconnecting live sources without coupling their failure lifecycles. */
export class LiveHubController<TContext> implements ExternalStore<LiveHubSnapshot> {
  private readonly store: Store<LiveHubSnapshot>;
  private readonly controllers: readonly LiveController<TContext>[];
  private readonly sourceNames: readonly string[];
  private readonly unsubscribes: readonly (() => void)[];
  private disposed = false;

  constructor(
    sources: readonly LiveSource<TContext>[],
    runtime: LiveRuntime<TContext>,
    adapters: readonly LiveAdapter<TContext>[] = [],
  ) {
    validateSourceNames(sources);
    this.sourceNames = Object.freeze(
      sources.map((source, index) => source.name ?? `source-${index + 1}`),
    );
    this.controllers = sources.map((source) => new LiveController(source, runtime, adapters));
    this.store = new Store(this.snapshot());
    this.unsubscribes = this.controllers.map((controller) =>
      controller.subscribe(() => this.store.setSnapshot(this.snapshot())),
    );
  }

  get status(): LiveStatus {
    return this.store.getSnapshot().status;
  }
  get lastError(): LiveDiagnostic | undefined {
    return this.store.getSnapshot().lastError;
  }
  get lastEventId(): string | undefined {
    return this.store.getSnapshot().lastEventId;
  }
  get connectedAt(): number | undefined {
    return this.store.getSnapshot().connectedAt;
  }
  get retryAt(): number | undefined {
    return this.store.getSnapshot().retryAt;
  }
  get sources(): readonly LiveSourceSnapshot[] {
    return this.store.getSnapshot().sources;
  }
  getSnapshot(): LiveHubSnapshot {
    return this.store.getSnapshot();
  }
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  reevaluate(): void {
    for (const controller of this.controllers) controller.reevaluate();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    for (const controller of this.controllers) controller.dispose();
    this.store.setSnapshot(this.snapshot());
  }

  private snapshot(): LiveHubSnapshot {
    const sources = Object.freeze(
      this.controllers.map((controller, index) =>
        Object.freeze({ name: this.sourceNames[index]!, ...controller.getSnapshot() }),
      ),
    );
    const current = this.disposed
      ? Object.freeze({ revision: 0, status: "closed" as const })
      : aggregateLiveSnapshot(sources);
    return Object.freeze({ ...current, sources });
  }
}

function diagnostic(
  kind: LiveDiagnostic["kind"],
  message: string,
  retryable: boolean,
  event?: LiveEvent,
): LiveDiagnostic {
  return Object.freeze({
    kind,
    message,
    retryable,
    ...(event ? { event: event.type, ...(event.id ? { eventId: event.id } : {}) } : {}),
  });
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeEffects(value: LiveEffectResult): readonly (LiveMutation | LiveEffect)[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value as LiveMutation | LiveEffect];
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer`);
  return value;
}

function applyNotificationMutation(
  snapshot: NotificationSnapshot,
  mutation: NotificationMutation,
  maximumItems: number,
): { readonly items: readonly UiNotification[]; readonly unreadCount: number } {
  if (mutation.action === "replace") {
    const items = notificationItems(mutation.items, maximumItems);
    return {
      items,
      unreadCount: mutation.unreadCount ?? unreadItems(items),
    };
  }
  if (mutation.action === "upsert") {
    const item = notificationItem(mutation.item);
    const items = notificationItems(
      [item, ...snapshot.items.filter((current) => current.id !== item.id)],
      maximumItems,
    );
    return { items, unreadCount: unreadItems(items) };
  }
  if (mutation.action === "remove") {
    const items = Object.freeze(snapshot.items.filter((item) => item.id !== mutation.id));
    return { items, unreadCount: unreadItems(items) };
  }
  const items = Object.freeze(
    snapshot.items.map((item) =>
      item.id === mutation.id ? Object.freeze({ ...item, read: mutation.read ?? true }) : item,
    ),
  );
  return { items, unreadCount: unreadItems(items) };
}

function notificationItems(
  items: readonly UiNotification[],
  maximumItems: number,
): readonly UiNotification[] {
  const unique = new Map<UiNotification["id"], UiNotification>();
  for (const item of items) {
    const validated = notificationItem(item);
    if (!unique.has(validated.id)) unique.set(validated.id, validated);
  }
  return Object.freeze([...unique.values()].slice(0, maximumItems));
}

function notificationItem(item: UiNotification): UiNotification {
  if ((typeof item.id !== "string" && typeof item.id !== "number") || !item.title.trim())
    throw new Error("Live notification requires an id and title");
  return Object.freeze({
    ...item,
    ...(item.image ? { image: Object.freeze({ ...item.image }) } : {}),
    ...(item.actions
      ? { actions: Object.freeze(item.actions.map((action) => Object.freeze({ ...action }))) }
      : {}),
  });
}

function unreadItems(items: readonly UiNotification[]): number {
  return items.reduce((count, item) => count + (item.read ? 0 : 1), 0);
}

function validateSourceNames<TContext>(sources: readonly LiveSource<TContext>[]): void {
  const names = new Set<string>();
  for (const [index, source] of sources.entries()) {
    const name = source.name ?? `source-${index + 1}`;
    if (names.has(name)) throw new Error(`Live source name ${name} is duplicated`);
    names.add(name);
  }
}

function aggregateLiveSnapshot(sources: readonly LiveSourceSnapshot[]): LiveSnapshot {
  if (!sources.length) return Object.freeze({ revision: 0, status: "disabled" });
  const revision = sources.reduce((total, source) => total + source.revision, 0);
  const statuses = new Set(sources.map((source) => source.status));
  const status = statuses.has("open")
    ? "open"
    : statuses.has("connecting")
      ? "connecting"
      : statuses.has("reconnecting")
        ? "reconnecting"
        : statuses.has("waiting")
          ? "waiting"
          : statuses.has("error")
            ? "error"
            : "closed";
  const latest = [...sources].reverse().find((source) => source.lastError || source.lastEventId);
  const connectedAt = Math.max(...sources.map((source) => source.connectedAt ?? 0)) || undefined;
  const retryAt = Math.min(...sources.map((source) => source.retryAt ?? Infinity));
  return Object.freeze({
    revision,
    status,
    ...(latest?.lastError ? { lastError: latest.lastError } : {}),
    ...(latest?.lastEventId ? { lastEventId: latest.lastEventId } : {}),
    ...(connectedAt ? { connectedAt } : {}),
    ...(Number.isFinite(retryAt) ? { retryAt } : {}),
  });
}
