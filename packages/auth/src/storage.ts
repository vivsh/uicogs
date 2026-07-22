export interface JwtClaims {
  readonly sub: string;
  readonly exp?: number;
  readonly nbf?: number;
  readonly iss?: string;
  readonly aud?: string | readonly string[];
  readonly [claim: string]: unknown;
}

export interface AuthTokens {
  readonly access: string;
  readonly refresh?: string;
}

export interface AuthStorage {
  read(): Promise<AuthTokens | undefined>;
  write(tokens: AuthTokens): Promise<void>;
  clear(): Promise<void>;
}

export function memoryAuthStorage(initial?: AuthTokens): AuthStorage {
  let tokens = initial ? Object.freeze({ ...initial }) : undefined;
  return Object.freeze({
    async read() {
      return tokens;
    },
    async write(value: AuthTokens) {
      tokens = Object.freeze({ ...value });
    },
    async clear() {
      tokens = undefined;
    },
  });
}

export function browserAuthStorage(storage: Storage, key = "uicogs.auth"): AuthStorage {
  return Object.freeze({
    async read() {
      const value = storage.getItem(key);
      if (!value) return undefined;
      return parseTokens(JSON.parse(value) as unknown);
    },
    async write(tokens: AuthTokens) {
      storage.setItem(key, JSON.stringify(tokens));
    },
    async clear() {
      storage.removeItem(key);
    },
  });
}

function parseTokens(value: unknown): AuthTokens {
  if (typeof value !== "object" || value === null || !("access" in value))
    throw new Error("Stored authentication data is invalid");
  const access = Reflect.get(value, "access");
  const refresh = Reflect.get(value, "refresh");
  if (typeof access !== "string") throw new Error("Stored access token is invalid");
  if (refresh !== undefined && typeof refresh !== "string")
    throw new Error("Stored refresh token is invalid");
  return Object.freeze({ access, ...(refresh ? { refresh } : {}) });
}
