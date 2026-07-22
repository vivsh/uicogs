import { deepFreeze } from "./utils.js";
import {
  decodePersistenceValue,
  encodePersistenceValue,
  type PersistenceBackend,
} from "./persistence.js";

export type EntityKey = string | number;
export type CachePolicy = "cache-first" | "network-only" | "stale-while-revalidate";
export type CachePersistenceStatus = "memory" | "loading" | "ready" | "error";

export interface EntityEntry {
  readonly key: EntityKey;
  readonly data: Readonly<Record<string, unknown>>;
  readonly snapshot?: Readonly<Record<string, unknown>>;
  readonly knownFields: ReadonlySet<string>;
  readonly version: number;
  readonly updatedAt: number;
  readonly staleAt: number;
  readonly tombstone: boolean;
  readonly sourceVersion?: string | number;
}

export interface CollectionEntry {
  readonly identity: string;
  readonly keys: readonly EntityKey[];
  readonly pageInfo?: unknown;
  readonly updatedAt: number;
  readonly staleAt: number;
}

export interface CacheAddress {
  readonly scope: string;
  readonly resource: string;
}

export interface CacheStore {
  readonly persistenceStatus: CachePersistenceStatus;
  readonly persistenceError: string | undefined;
  readonly persistenceScope: string;
  entity(address: CacheAddress, key: EntityKey): EntityEntry | undefined;
  setEntity(address: CacheAddress, entry: EntityEntry): void;
  invalidateEntity(address: CacheAddress, key: EntityKey): void;
  collection(address: CacheAddress, identity: string): CollectionEntry | undefined;
  setCollection(address: CacheAddress, entry: CollectionEntry): void;
  removeCollection(address: CacheAddress, identity: string): void;
  collectionEntries(address: CacheAddress): readonly CollectionEntry[];
  invalidateResource(address: CacheAddress): void;
  markResourceStale(address: CacheAddress): void;
  removeEntityFromCollections(address: CacheAddress, key: EntityKey): void;
  clearScope(scope: string): void;
  subscribeEntity(address: CacheAddress, key: EntityKey, listener: () => void): () => void;
  subscribeCollection(address: CacheAddress, identity: string, listener: () => void): () => void;
}

export interface CacheDump {
  readonly scope: string;
  readonly entities: readonly (readonly [string, EntityEntry])[];
  readonly collections: readonly (readonly [string, CollectionEntry])[];
}

export class MemoryCache implements CacheStore {
  private readonly entities = new Map<string, EntityEntry>();
  private readonly collections = new Map<string, CollectionEntry>();
  private readonly listeners = new Map<string, Set<() => void>>();
  persistenceScope = "anonymous";
  readonly persistenceStatus: CachePersistenceStatus = "memory";
  readonly persistenceError = undefined;

  activateScope(scope: string): void {
    this.persistenceScope = scope;
  }

  entity(address: CacheAddress, key: EntityKey): EntityEntry | undefined {
    return this.entities.get(entityIdentity(address, key));
  }

  setEntity(address: CacheAddress, entry: EntityEntry): void {
    const identity = entityIdentity(address, entry.key);
    this.entities.set(identity, entry);
    this.emit(identity);
  }

  invalidateEntity(address: CacheAddress, key: EntityKey): void {
    const identity = entityIdentity(address, key);
    const entry = this.entities.get(identity);
    if (!entry) return;
    this.entities.set(identity, Object.freeze({ ...entry, staleAt: 0 }));
    this.emit(identity);
  }

  collection(address: CacheAddress, identity: string): CollectionEntry | undefined {
    return this.collections.get(collectionIdentity(address, identity));
  }

  setCollection(address: CacheAddress, entry: CollectionEntry): void {
    const identity = collectionIdentity(address, entry.identity);
    this.collections.set(identity, entry);
    this.emit(identity);
  }

  removeCollection(address: CacheAddress, identity: string): void {
    const key = collectionIdentity(address, identity);
    this.collections.delete(key);
    this.emit(key);
  }

  collectionEntries(address: CacheAddress): readonly CollectionEntry[] {
    const prefix = `${encode(address.scope)}|${encode(address.resource)}|collection|`;
    return Object.freeze(
      [...this.collections.entries()]
        .filter(([identity]) => identity.startsWith(prefix))
        .map(([, entry]) => entry),
    );
  }

  invalidateResource(address: CacheAddress): void {
    const prefix = `${encode(address.scope)}|${encode(address.resource)}|collection|`;
    for (const identity of this.collections.keys()) {
      if (!identity.startsWith(prefix)) continue;
      this.collections.delete(identity);
      this.emit(identity);
    }
  }

  markResourceStale(address: CacheAddress): void {
    for (const entry of this.collectionEntries(address))
      this.setCollection(address, Object.freeze({ ...entry, staleAt: 0 }));
  }

  removeEntityFromCollections(address: CacheAddress, key: EntityKey): void {
    for (const entry of this.collectionEntries(address)) {
      if (!entry.keys.some((candidate) => Object.is(candidate, key))) continue;
      this.setCollection(
        address,
        Object.freeze({
          ...entry,
          keys: Object.freeze(entry.keys.filter((candidate) => !Object.is(candidate, key))),
        }),
      );
    }
  }

  clearScope(scope: string): void {
    const prefix = `${encode(scope)}|`;
    for (const identity of this.entities.keys()) {
      if (identity.startsWith(prefix)) {
        this.entities.delete(identity);
        this.emit(identity);
      }
    }
    for (const identity of this.collections.keys()) {
      if (identity.startsWith(prefix)) {
        this.collections.delete(identity);
        this.emit(identity);
      }
    }
  }

  dump(scope: string): CacheDump {
    const prefix = `${encode(scope)}|`;
    return Object.freeze({
      scope,
      entities: Object.freeze(
        [...this.entities.entries()].filter(([identity]) => identity.startsWith(prefix)),
      ),
      collections: Object.freeze(
        [...this.collections.entries()].filter(([identity]) => identity.startsWith(prefix)),
      ),
    });
  }

  restore(dump: CacheDump, baseline?: CacheDump): void {
    const prefix = `${encode(dump.scope)}|`;
    const baselineEntities = new Map(baseline?.entities ?? []);
    const baselineCollections = new Map(baseline?.collections ?? []);
    for (const [identity, entry] of dump.entities) {
      if (!identity.startsWith(prefix)) continue;
      const current = this.entities.get(identity);
      const original = baselineEntities.get(identity);
      if (current && (!original || current.updatedAt !== original.updatedAt)) continue;
      if (!baseline && current && current.updatedAt > entry.updatedAt) continue;
      this.entities.set(
        identity,
        Object.freeze({ ...entry, knownFields: new Set(entry.knownFields) }),
      );
      this.emit(identity);
    }
    for (const [identity, entry] of dump.collections) {
      if (!identity.startsWith(prefix)) continue;
      const current = this.collections.get(identity);
      const original = baselineCollections.get(identity);
      if (current && (!original || current.updatedAt !== original.updatedAt)) continue;
      if (!baseline && current && current.updatedAt > entry.updatedAt) continue;
      this.collections.set(
        identity,
        Object.freeze({ ...entry, keys: Object.freeze([...entry.keys]) }),
      );
      this.emit(identity);
    }
  }

  subscribeEntity(address: CacheAddress, key: EntityKey, listener: () => void): () => void {
    return this.subscribe(entityIdentity(address, key), listener);
  }

  subscribeCollection(address: CacheAddress, identity: string, listener: () => void): () => void {
    return this.subscribe(collectionIdentity(address, identity), listener);
  }

  private subscribe(identity: string, listener: () => void): () => void {
    const listeners = this.listeners.get(identity) ?? new Set();
    listeners.add(listener);
    this.listeners.set(identity, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(identity);
    };
  }

  private emit(identity: string): void {
    for (const listener of [...(this.listeners.get(identity) ?? [])]) listener();
  }
}

interface PersistedCacheEnvelope {
  readonly format: "uicogs-cache";
  readonly version: 1;
  readonly scope: string;
  readonly entities: readonly (readonly [string, PersistedEntityEntry])[];
  readonly collections: readonly (readonly [string, CollectionEntry])[];
}

type PersistedEntityEntry = Omit<EntityEntry, "knownFields" | "snapshot"> & {
  readonly knownFields: readonly string[];
};

export class DurableCache implements CacheStore {
  private readonly memory = new MemoryCache();
  private readonly pending = new Map<string, CacheDump>();
  private readonly writing = new Set<string>();
  private readonly writeCompletion = new Map<string, Promise<void>>();
  private readonly hydration = new Map<string, Promise<void>>();
  private generation = 0;
  private disposed = false;
  persistenceStatus: CachePersistenceStatus = "loading";
  persistenceError: string | undefined;
  persistenceScope = "anonymous";

  constructor(private readonly backend: PersistenceBackend) {}

  activateScope(scope: string): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.persistenceScope = scope;
    this.persistenceStatus = "loading";
    this.persistenceError = undefined;
    const generation = ++this.generation;
    const baseline = this.memory.dump(scope);
    const hydration = this.backend
      .read(cacheKey(scope))
      .then((value) => {
        if (this.disposed || generation !== this.generation || value === undefined) return;
        this.memory.restore(decodeCacheEnvelope(value, scope), baseline);
      })
      .then(() => {
        if (!this.disposed && generation === this.generation) this.persistenceStatus = "ready";
      })
      .catch((error: unknown) => {
        if (this.disposed || generation !== this.generation) return;
        this.persistenceStatus = "error";
        this.persistenceError = persistenceError(error);
      })
      .finally(() => {
        if (this.disposed || generation !== this.generation || !this.pending.has(scope)) return;
        this.pending.set(scope, this.memory.dump(scope));
        this.startWrite(scope);
      });
    this.hydration.set(scope, hydration);
    return hydration;
  }

  awaitHydration(scope: string): Promise<void> {
    return this.hydration.get(scope) ?? this.activateScope(scope);
  }

  entity(address: CacheAddress, key: EntityKey): EntityEntry | undefined {
    return this.memory.entity(address, key);
  }
  setEntity(address: CacheAddress, entry: EntityEntry): void {
    this.memory.setEntity(address, entry);
    this.schedule(address.scope);
  }
  invalidateEntity(address: CacheAddress, key: EntityKey): void {
    this.memory.invalidateEntity(address, key);
    this.schedule(address.scope);
  }
  collection(address: CacheAddress, identity: string): CollectionEntry | undefined {
    return this.memory.collection(address, identity);
  }
  setCollection(address: CacheAddress, entry: CollectionEntry): void {
    this.memory.setCollection(address, entry);
    this.schedule(address.scope);
  }
  removeCollection(address: CacheAddress, identity: string): void {
    this.memory.removeCollection(address, identity);
    this.schedule(address.scope);
  }
  collectionEntries(address: CacheAddress): readonly CollectionEntry[] {
    return this.memory.collectionEntries(address);
  }
  invalidateResource(address: CacheAddress): void {
    this.memory.invalidateResource(address);
    this.schedule(address.scope);
  }
  markResourceStale(address: CacheAddress): void {
    this.memory.markResourceStale(address);
    this.schedule(address.scope);
  }
  removeEntityFromCollections(address: CacheAddress, key: EntityKey): void {
    this.memory.removeEntityFromCollections(address, key);
    this.schedule(address.scope);
  }
  clearScope(scope: string): void {
    this.memory.clearScope(scope);
  }
  subscribeEntity(address: CacheAddress, key: EntityKey, listener: () => void): () => void {
    return this.memory.subscribeEntity(address, key, listener);
  }
  subscribeCollection(address: CacheAddress, identity: string, listener: () => void): () => void {
    return this.memory.subscribeCollection(address, identity, listener);
  }

  async removePersistentScope(scope: string): Promise<void> {
    this.pending.delete(scope);
    try {
      await this.writeCompletion.get(scope);
      await this.backend.remove(cacheKey(scope));
    } catch (error) {
      if (!this.disposed && scope === this.persistenceScope) {
        this.persistenceStatus = "error";
        this.persistenceError = persistenceError(error);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.pending.clear();
  }

  private schedule(scope: string): void {
    if (this.disposed) return;
    this.pending.set(scope, this.memory.dump(scope));
    if (scope === this.persistenceScope && this.persistenceStatus === "loading") return;
    this.startWrite(scope);
  }

  private startWrite(scope: string): void {
    if (this.writing.has(scope)) return;
    this.writing.add(scope);
    const completion = Promise.resolve().then(() => this.drain(scope));
    this.writeCompletion.set(scope, completion);
  }

  private async drain(scope: string): Promise<void> {
    while (!this.disposed && this.pending.has(scope)) {
      const dump = this.pending.get(scope)!;
      this.pending.delete(scope);
      try {
        await this.backend.write(cacheKey(scope), encodeCacheEnvelope(dump));
        if (!this.disposed && scope === this.persistenceScope) {
          this.persistenceStatus = "ready";
          this.persistenceError = undefined;
        }
      } catch (error) {
        if (!this.disposed && scope === this.persistenceScope) {
          this.persistenceStatus = "error";
          this.persistenceError = persistenceError(error);
        }
      }
    }
    this.writing.delete(scope);
    this.writeCompletion.delete(scope);
    if (!this.disposed && this.pending.has(scope)) {
      this.startWrite(scope);
    }
  }
}

export function memoryCache(): MemoryCache {
  return new MemoryCache();
}

export function durableCache(backend: PersistenceBackend): DurableCache {
  return new DurableCache(backend);
}

function cacheKey(scope: string): string {
  return `cache/${encodeURIComponent(scope)}`;
}

function encodeCacheEnvelope(dump: CacheDump): unknown {
  const envelope: PersistedCacheEnvelope = {
    format: "uicogs-cache",
    version: 1,
    scope: dump.scope,
    entities: dump.entities.map(([identity, entry]) => [
      identity,
      {
        key: entry.key,
        data: entry.data,
        knownFields: [...entry.knownFields],
        version: entry.version,
        updatedAt: entry.updatedAt,
        staleAt: entry.staleAt,
        tombstone: entry.tombstone,
        ...(entry.sourceVersion !== undefined ? { sourceVersion: entry.sourceVersion } : {}),
      },
    ]),
    collections: dump.collections,
  };
  return encodePersistenceValue(envelope);
}

function decodeCacheEnvelope(value: unknown, scope: string): CacheDump {
  const decoded = decodePersistenceValue(value);
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    Reflect.get(decoded, "format") !== "uicogs-cache" ||
    Reflect.get(decoded, "version") !== 1 ||
    Reflect.get(decoded, "scope") !== scope ||
    !Array.isArray(Reflect.get(decoded, "entities")) ||
    !Array.isArray(Reflect.get(decoded, "collections"))
  )
    throw new TypeError("Persisted cache envelope is invalid or unsupported");
  const envelope = decoded as PersistedCacheEnvelope;
  const entities = envelope.entities.map(([identity, entry]): readonly [string, EntityEntry] => [
    identity,
    Object.freeze({ ...entry, knownFields: new Set(entry.knownFields) }),
  ]);
  const entityIdentities = new Set(entities.map(([identity]) => identity));
  const collections = envelope.collections.map(
    ([identity, entry]): readonly [string, CollectionEntry] => {
      const marker = "|collection|";
      const markerIndex = identity.indexOf(marker);
      if (markerIndex < 0) throw new TypeError("Persisted collection identity is invalid");
      const prefix = identity.slice(0, markerIndex);
      const keys = entry.keys.filter((key) =>
        entityIdentities.has(`${prefix}|entity|${encode(String(key))}`),
      );
      return [
        identity,
        Object.freeze({
          ...entry,
          keys: Object.freeze(keys),
          staleAt: keys.length === entry.keys.length ? entry.staleAt : 0,
        }),
      ];
    },
  );
  return Object.freeze({
    scope,
    entities: Object.freeze(entities),
    collections: Object.freeze(collections),
  });
}

function persistenceError(error: unknown): string {
  return error instanceof Error ? error.message : "Cache persistence failed";
}

export function mergeEntity(
  current: EntityEntry | undefined,
  key: EntityKey,
  patch: Readonly<Record<string, unknown>>,
  options: {
    readonly ttl: number;
    readonly now?: number;
    readonly requestStartedAt?: number;
    readonly sourceVersion?: string | number;
  },
): EntityEntry {
  if (
    options.requestStartedAt !== undefined &&
    current !== undefined &&
    current.updatedAt > options.requestStartedAt
  ) {
    return current;
  }
  if (options.sourceVersion !== undefined && current?.sourceVersion !== undefined) {
    if (typeof options.sourceVersion !== typeof current.sourceVersion)
      throw new Error("Live source version type changed for an existing entity");
    if (options.sourceVersion <= current.sourceVersion) return current;
  }
  const now = options.now ?? Date.now();
  return Object.freeze({
    key,
    data: deepFreeze({ ...(current?.data ?? {}), ...patch }),
    ...(current?.snapshot ? { snapshot: current.snapshot } : {}),
    knownFields: new Set([...(current?.knownFields ?? []), ...Object.keys(patch)]),
    version: (current?.version ?? 0) + 1,
    updatedAt: now,
    staleAt: now + options.ttl,
    tombstone: false,
    ...(options.sourceVersion !== undefined ? { sourceVersion: options.sourceVersion } : {}),
  });
}

export function tombstoneEntity(
  current: EntityEntry | undefined,
  key: EntityKey,
  sourceVersion?: string | number,
): EntityEntry {
  if (sourceVersion !== undefined && current?.sourceVersion !== undefined) {
    if (typeof sourceVersion !== typeof current.sourceVersion)
      throw new Error("Live source version type changed for an existing entity");
    if (sourceVersion <= current.sourceVersion) return current;
  }
  const now = Date.now();
  return Object.freeze({
    key,
    data: current?.data ?? {},
    knownFields: current?.knownFields ?? new Set(),
    version: (current?.version ?? 0) + 1,
    updatedAt: now,
    staleAt: now,
    tombstone: true,
    ...(sourceVersion !== undefined ? { sourceVersion } : {}),
  });
}

function entityIdentity(address: CacheAddress, key: EntityKey): string {
  return `${encode(address.scope)}|${encode(address.resource)}|entity|${encode(String(key))}`;
}

function collectionIdentity(address: CacheAddress, identity: string): string {
  return `${encode(address.scope)}|${encode(address.resource)}|collection|${encode(identity)}`;
}

function encode(value: string): string {
  return `${value.length}:${value}`;
}
