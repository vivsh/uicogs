export interface ExternalStore<TSnapshot> {
  getSnapshot(): TSnapshot;
  subscribe(listener: () => void): () => void;
}

export type ControllerAdapter = <T extends ExternalStore<object>>(controller: T) => T;

export class Store<TSnapshot extends object> implements ExternalStore<TSnapshot> {
  private readonly listeners = new Set<() => void>();

  constructor(private snapshot: TSnapshot) {}

  getSnapshot(): TSnapshot {
    return this.snapshot;
  }

  setSnapshot(snapshot: TSnapshot): void {
    if (Object.is(snapshot, this.snapshot)) return;
    this.snapshot = Object.freeze(snapshot);
    for (const listener of this.listeners) listener();
  }

  update(update: (snapshot: TSnapshot) => TSnapshot): void {
    this.setSnapshot(update(this.snapshot));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export class EventBus<TEvents extends object> {
  private readonly listeners = new Map<
    keyof TEvents,
    Set<(payload: TEvents[keyof TEvents]) => void>
  >();

  on<K extends keyof TEvents>(event: K, listener: (payload: TEvents[K]) => void): () => void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener as (payload: TEvents[keyof TEvents]) => void);
    this.listeners.set(event, listeners);
    return () => this.off(event, listener);
  }

  once<K extends keyof TEvents>(event: K, listener: (payload: TEvents[K]) => void): () => void {
    const unsubscribe = this.on(event, (payload) => {
      unsubscribe();
      listener(payload);
    });
    return unsubscribe;
  }

  off<K extends keyof TEvents>(event: K, listener: (payload: TEvents[K]) => void): void {
    this.listeners.get(event)?.delete(listener as (payload: TEvents[keyof TEvents]) => void);
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }

  clear<K extends keyof TEvents>(event?: K): void {
    if (event === undefined) this.listeners.clear();
    else this.listeners.delete(event);
  }
}
