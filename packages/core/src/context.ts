import { Store, type ExternalStore } from "./store.js";
import { deepFreeze, isRecord, type DeepReadonly } from "./utils.js";
import {
  decodePersistenceValue,
  encodePersistenceValue,
  type PersistenceBackend,
} from "./persistence.js";

export interface ContextParser<T> {
  parse(input: unknown): T;
}

export type ContextPersistenceStatus = "memory" | "loading" | "ready" | "error";

export interface ContextStoreSnapshot<TContext> {
  readonly revision: number;
  readonly value: DeepReadonly<TContext>;
  readonly persistenceStatus: ContextPersistenceStatus;
  readonly persistenceError?: string;
}

type ContextPatch<T> = T extends object ? Partial<T> : never;

export interface RuntimeContextStore<
  TApplicationContext,
  TContext = TApplicationContext,
> extends ExternalStore<ContextStoreSnapshot<TContext>> {
  readonly value: DeepReadonly<TContext>;
  readonly persistenceStatus: ContextPersistenceStatus;
  readonly persistenceError: string | undefined;
  set(value: TApplicationContext): void;
  update(patch: ContextPatch<TApplicationContext>): void;
  reset(): Promise<void>;
}

const noPendingWrite = Symbol("no-pending-context-write");

export class ContextStoreController<TApplicationContext, TContext> implements RuntimeContextStore<
  TApplicationContext,
  TContext
> {
  private readonly store: Store<ContextStoreSnapshot<TContext>>;
  private readonly initial: DeepReadonly<TApplicationContext>;
  private application: DeepReadonly<TApplicationContext>;
  private authSnapshot?: object;
  private disposed = false;
  private initialized = false;
  private applicationGeneration = 0;
  private pendingWrite: DeepReadonly<TApplicationContext> | typeof noPendingWrite = noPendingWrite;
  private writing = false;
  private writeCompletion?: Promise<void>;

  constructor(
    initial: TApplicationContext,
    private readonly persistence:
      | {
          readonly backend: PersistenceBackend;
          readonly schema?: ContextParser<TApplicationContext> | ContextParser<unknown>;
        }
      | undefined,
    private readonly compose: (
      application: DeepReadonly<TApplicationContext>,
      auth: object | undefined,
    ) => DeepReadonly<TContext>,
    authSnapshot?: object,
  ) {
    assertNoAuth(initial);
    this.initial = immutableCopy(initial);
    this.application = this.initial;
    this.authSnapshot = authSnapshot;
    this.store = new Store({
      revision: 0,
      value: compose(this.application, this.authSnapshot),
      persistenceStatus: persistence ? "loading" : "memory",
    });
  }

  get value(): DeepReadonly<TContext> {
    return this.store.getSnapshot().value;
  }

  get persistenceStatus(): ContextPersistenceStatus {
    return this.store.getSnapshot().persistenceStatus;
  }

  get persistenceError(): string | undefined {
    return this.store.getSnapshot().persistenceError;
  }

  getSnapshot(): ContextStoreSnapshot<TContext> {
    return this.store.getSnapshot();
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  set(value: TApplicationContext): void {
    this.assertActive();
    assertNoAuth(value);
    this.application = immutableCopy(value);
    this.applicationGeneration += 1;
    this.publishValue();
    this.queueWrite();
  }

  update(patch: ContextPatch<TApplicationContext>): void {
    this.assertActive();
    if (!isRecord(this.application) || !isRecord(patch))
      throw new TypeError("Context update requires an object context and object patch");
    assertNoAuth(patch);
    this.set({ ...this.application, ...patch } as TApplicationContext);
  }

  async reset(): Promise<void> {
    this.assertActive();
    this.application = this.initial;
    this.applicationGeneration += 1;
    this.pendingWrite = noPendingWrite;
    this.publishValue();
    if (!this.persistence) return;
    try {
      await this.writeCompletion;
      await this.persistence.backend.remove("context");
      if (!this.disposed) this.publishPersistence("ready");
    } catch (error) {
      if (!this.disposed) this.publishPersistence("error", errorMessage(error));
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized || this.disposed || !this.persistence) return;
    this.initialized = true;
    const generation = this.applicationGeneration;
    try {
      const stored = await this.persistence.backend.read("context");
      if (this.disposed) return;
      if (generation !== this.applicationGeneration) {
        this.publishPersistence("ready");
        return;
      }
      if (stored !== undefined) {
        const decoded = decodePersistenceValue(stored);
        const parsed = this.persistence.schema
          ? this.persistence.schema.parse(decoded)
          : this.parseStored(decoded);
        assertNoAuth(parsed);
        this.application = immutableCopy(parsed as TApplicationContext);
        this.publishValue("ready");
      } else {
        this.publishPersistence("ready");
      }
    } catch (error) {
      if (!this.disposed) this.publishPersistence("error", errorMessage(error));
    }
  }

  setAuthSnapshot(snapshot: object): void {
    if (this.disposed || Object.is(snapshot, this.authSnapshot)) return;
    this.authSnapshot = snapshot;
    this.publishValue();
  }

  dispose(): void {
    this.disposed = true;
    this.pendingWrite = noPendingWrite;
  }

  private parseStored(stored: unknown): TApplicationContext {
    if (!isRecord(stored)) throw new TypeError("Persisted context must be an object");
    return stored as TApplicationContext;
  }

  private publishValue(persistenceStatus = this.persistenceStatus): void {
    const value = this.compose(this.application, this.authSnapshot);
    this.store.update((snapshot) => ({
      revision: snapshot.revision + 1,
      value,
      persistenceStatus,
      ...(persistenceStatus === "error" && snapshot.persistenceError
        ? { persistenceError: snapshot.persistenceError }
        : {}),
    }));
  }

  private publishPersistence(status: ContextPersistenceStatus, error?: string): void {
    this.store.update((snapshot) => ({
      revision: snapshot.revision + 1,
      value: snapshot.value,
      persistenceStatus: status,
      ...(error ? { persistenceError: error } : {}),
    }));
  }

  private queueWrite(): void {
    if (!this.persistence) return;
    this.pendingWrite = this.application;
    if (!this.writing) this.writeCompletion = this.drainWrites();
  }

  private async drainWrites(): Promise<void> {
    if (!this.persistence || this.writing) return;
    this.writing = true;
    while (!this.disposed && this.pendingWrite !== noPendingWrite) {
      const value = this.pendingWrite;
      this.pendingWrite = noPendingWrite;
      try {
        await this.persistence.backend.write("context", encodePersistenceValue(value));
        if (!this.disposed) this.publishPersistence("ready");
      } catch (error) {
        if (!this.disposed) this.publishPersistence("error", errorMessage(error));
      }
    }
    this.writing = false;
  }

  private assertActive(): void {
    if (this.disposed) throw new DOMException("Context store is disposed", "AbortError");
  }
}

function immutableCopy<T>(value: T): DeepReadonly<T> {
  if (value instanceof Date) return Object.freeze(new Date(value.valueOf())) as DeepReadonly<T>;
  if (Array.isArray(value)) return deepFreeze(value.map((item) => immutableCopy(item))) as never;
  if (isRecord(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      return Object.freeze(value) as DeepReadonly<T>;
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) copy[key] = immutableCopy(item);
    return deepFreeze(copy) as DeepReadonly<T>;
  }
  return value as DeepReadonly<T>;
}

function assertNoAuth(value: unknown): void {
  if (isRecord(value) && "auth" in value)
    throw new TypeError("Application context cannot define the reserved auth property");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Context persistence failed";
}
