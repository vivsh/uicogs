# @uicogs/routes API

Declaration SHA-256: `7d1332d16a44ccfe6e72e5d51a3e5a286d5050369ffbc5ef097530849b0a5dc1`

```ts
// index.d.ts
/** Framework-neutral scope normalization and additive access resolution. */
/** Effective capabilities supplied by an application's authentication strategy. */
interface ScopeAccess {
    readonly authenticated: boolean;
    readonly scopes: ReadonlySet<string>;
}
/** Immutable scopes declared by one route record in a matched route chain. */
type RouteScopes = readonly string[] | undefined;
/** A framework-neutral non-link group in one named navigation placement. */
interface NavigationGroup<TLabel, TIcon> {
    readonly id: string;
    readonly parent?: string;
    readonly label: TLabel;
    readonly icon?: TIcon;
    readonly order?: number;
}
/** Group declarations shared by one or more framework bindings. */
type NavigationDefinition<TLabel, TIcon> = Readonly<Record<string, Readonly<{
    readonly groups?: readonly NavigationGroup<TLabel, TIcon>[];
}>>>;
/** Validates and freezes framework-neutral navigation group declarations. */
declare function createNavigation<TLabel, TIcon>(definition: NavigationDefinition<TLabel, TIcon>): NavigationDefinition<TLabel, TIcon>;
/** Returns the deduplicated scopes declared by a matched route chain. */
declare function collectScopes(chain: readonly RouteScopes[]): readonly string[];
/**
 * Applies UiCogs' route policy to a matched route chain.
 *
 * A chain with no declaration is guest-only. An empty declaration requires an
 * authenticated user, and non-empty declarations require every listed scope.
 */
declare function canAccessScopes(chain: readonly RouteScopes[], access: ScopeAccess): boolean;

export { type NavigationDefinition, type NavigationGroup, type RouteScopes, type ScopeAccess, canAccessScopes, collectScopes, createNavigation };
```
