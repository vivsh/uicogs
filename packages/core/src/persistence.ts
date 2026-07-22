import type { ContextParser } from "./context.js";

export interface PersistenceBackend {
  read(key: string): Promise<unknown | undefined>;
  write(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ContextPersistenceOptions<TContext> {
  readonly schema?: ContextParser<TContext>;
}

export interface CachePersistenceOptions {
  readonly eraseOnLogout?: boolean;
}

export interface PersistenceOptions<TContext> {
  readonly backend: PersistenceBackend;
  readonly context?: boolean | ContextPersistenceOptions<TContext>;
  readonly cache?: boolean | CachePersistenceOptions;
}

export function encodePersistenceValue(value: unknown): unknown {
  return encodeValue(value, new WeakSet());
}

export function decodePersistenceValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodePersistenceValue);
  if (!isPlainObject(value)) return value;
  if (value.$uicogs === "undefined" && Object.keys(value).length === 1) return undefined;
  if (
    value.$uicogs === "date" &&
    typeof value.value === "string" &&
    Object.keys(value).length === 2
  ) {
    const date = new Date(value.value);
    if (Number.isNaN(date.valueOf())) throw new TypeError("Persisted date is invalid");
    return date;
  }
  if (value.$uicogs === "record" && Array.isArray(value.value) && Object.keys(value).length === 2) {
    const entries = value.value.map((entry): readonly [string, unknown] => {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string")
        throw new TypeError("Persisted record is invalid");
      return [entry[0], decodePersistenceValue(entry[1])];
    });
    return Object.fromEntries(entries);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, decodePersistenceValue(item)]),
  );
}

function encodeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === undefined) return { $uicogs: "undefined" };
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Persistence does not support non-finite numbers");
    return value;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf()))
      throw new TypeError("Persistence does not support invalid dates");
    return { $uicogs: "date", value: value.toISOString() };
  }
  if (typeof value !== "object")
    throw new TypeError(`Persistence does not support ${typeof value} values`);
  if (seen.has(value)) throw new TypeError("Persistence does not support cyclic values");
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => encodeValue(item, seen));
    if (!isPlainObject(value))
      throw new TypeError("Persistence supports only plain objects, arrays, and dates");
    const encoded = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, encodeValue(item, seen)]),
    );
    return Object.hasOwn(value, "$uicogs")
      ? { $uicogs: "record", value: Object.entries(encoded) }
      : encoded;
  } finally {
    seen.delete(value);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
