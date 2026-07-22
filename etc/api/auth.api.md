# @uicogs/auth API

Declaration SHA-256: `2b2a8a46471542b260b49280814492f78cfe8d52b6fb8c94162af1641cbf0180`

```ts
// index.d.ts
import { RuntimeAuthController, NormalizedFailure, AuthResult, OperationReference, OperationOutput, AuthStrategyDefinition, OperationInput } from '@uicogs/core';

interface JwtClaims {
    readonly sub: string;
    readonly exp?: number;
    readonly nbf?: number;
    readonly iss?: string;
    readonly aud?: string | readonly string[];
    readonly [claim: string]: unknown;
}
interface AuthTokens {
    readonly access: string;
    readonly refresh?: string;
}
interface AuthStorage {
    read(): Promise<AuthTokens | undefined>;
    write(tokens: AuthTokens): Promise<void>;
    clear(): Promise<void>;
}
declare function memoryAuthStorage(initial?: AuthTokens): AuthStorage;
declare function browserAuthStorage(storage: Storage, key?: string): AuthStorage;

type RuntimeAuthStatus = "initializing" | "anonymous" | "authenticating" | "authenticated" | "refreshing" | "expired" | "error";
interface ClaimsParser<TClaims> {
    parse(input: unknown): TClaims;
}
type ReferenceOutput<TReference> = OperationOutput<TReference>;
type ReferenceInput<TReference> = OperationInput<TReference>;
interface JwtAuthSnapshot<TUser, TClaims extends JwtClaims, TState> {
    readonly revision: number;
    readonly status: RuntimeAuthStatus;
    readonly user?: Readonly<TUser>;
    readonly claims?: Readonly<TClaims>;
    readonly state: Readonly<TState>;
    readonly permissions: ReadonlySet<string>;
    readonly sessionGeneration: number;
    readonly error?: NormalizedFailure;
}
interface CookieAuthSnapshot<TUser, TState> {
    readonly revision: number;
    readonly status: RuntimeAuthStatus;
    readonly user?: Readonly<TUser>;
    readonly state: Readonly<TState>;
    readonly permissions: ReadonlySet<string>;
    readonly sessionGeneration: number;
    readonly error?: NormalizedFailure;
}
interface JwtAuthController<TCredentials, TUser, TClaims extends JwtClaims, TState> extends RuntimeAuthController<JwtAuthSnapshot<TUser, TClaims, TState>> {
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
interface CookieAuthController<TCredentials, TUser, TState> extends RuntimeAuthController<CookieAuthSnapshot<TUser, TState>> {
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
interface JwtAuthOptions<TClaims extends JwtClaims, TLogin extends OperationReference, TRefresh extends OperationReference, TLogout extends OperationReference, TCurrentUser extends OperationReference | undefined, TState> {
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
type UserOutput<TReference> = TReference extends OperationReference ? ReferenceOutput<TReference> : unknown;
interface CookieAuthOptions<TLogin extends OperationReference, TLogout extends OperationReference, TSession extends OperationReference, TState> {
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
declare function jwtAuth<TClaims extends JwtClaims, const TLogin extends OperationReference, const TRefresh extends OperationReference, const TLogout extends OperationReference, const TCurrentUser extends OperationReference | undefined = undefined, TState = Readonly<Record<never, never>>>(options: JwtAuthOptions<TClaims, TLogin, TRefresh, TLogout, TCurrentUser, TState>): AuthStrategyDefinition<JwtAuthController<ReferenceInput<TLogin>, UserOutput<TCurrentUser>, TClaims, TState>>;
declare function cookieAuth<const TLogin extends OperationReference, const TLogout extends OperationReference, const TSession extends OperationReference, TState = Readonly<Record<never, never>>>(options: CookieAuthOptions<TLogin, TLogout, TSession, TState>): AuthStrategyDefinition<CookieAuthController<ReferenceInput<TLogin>, ReferenceOutput<TSession>, TState>>;

export { type AuthStorage, type AuthTokens, type CookieAuthController, type CookieAuthOptions, type CookieAuthSnapshot, type JwtAuthController, type JwtAuthOptions, type JwtAuthSnapshot, type JwtClaims, type RuntimeAuthStatus, browserAuthStorage, cookieAuth, jwtAuth, memoryAuthStorage };
```
