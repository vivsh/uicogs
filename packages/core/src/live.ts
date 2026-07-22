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
  }):
    | LiveMutation
    | readonly LiveMutation[]
    | undefined
    | Promise<LiveMutation | readonly LiveMutation[] | undefined>;
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

export class LiveSourceError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "LiveSourceError";
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
  dispatchMutation(mutation: LiveMutation, version: LiveVersion | undefined, scope: string): void;
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
      if (this.runtime.dispatchDefault(event, payload, version, scope)) {
        this.retryAttempt = 0;
        return;
      }
      const mapped = await this.source?.map?.({ event: event.type, payload, source: event });
      if (mapped) {
        for (const mutation of Array.isArray(mapped) ? mapped : [mapped])
          this.runtime.dispatchMutation(mutation, version, scope);
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
