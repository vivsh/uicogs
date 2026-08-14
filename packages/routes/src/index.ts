/** Framework-neutral scope normalization and additive access resolution. */

/** Effective capabilities supplied by an application's authentication strategy. */
export interface ScopeAccess {
  readonly authenticated: boolean;
  readonly scopes: ReadonlySet<string>;
}

/** Immutable scopes declared by one route record in a matched route chain. */
export type RouteScopes = readonly string[] | undefined;

/** A framework-neutral non-link group in one named navigation placement. */
export interface NavigationGroup<TLabel, TIcon> {
  readonly id: string;
  readonly parent?: string;
  readonly label: TLabel;
  readonly icon?: TIcon;
  readonly order?: number;
}

/** Group declarations shared by one or more framework bindings. */
export type NavigationDefinition<TLabel, TIcon> = Readonly<
  Record<string, Readonly<{ readonly groups?: readonly NavigationGroup<TLabel, TIcon>[] }>>
>;

/** Validates and freezes framework-neutral navigation group declarations. */
export function createNavigation<TLabel, TIcon>(
  definition: NavigationDefinition<TLabel, TIcon>,
): NavigationDefinition<TLabel, TIcon> {
  for (const [placement, options] of Object.entries(definition)) {
    validateGroups(placement, options.groups ?? []);
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(definition).map(([placement, options]) => [
        placement,
        Object.freeze({
          ...(options.groups
            ? { groups: Object.freeze(options.groups.map((group) => Object.freeze({ ...group }))) }
            : {}),
        }),
      ]),
    ),
  ) as NavigationDefinition<TLabel, TIcon>;
}

/** Returns the deduplicated scopes declared by a matched route chain. */
export function collectScopes(chain: readonly RouteScopes[]): readonly string[] {
  return Object.freeze([...new Set(chain.flatMap((scopes) => scopes ?? []))]);
}

/**
 * Applies UiCogs' route policy to a matched route chain.
 *
 * A chain with no declaration is guest-only. An empty declaration requires an
 * authenticated user, and non-empty declarations require every listed scope.
 */
export function canAccessScopes(chain: readonly RouteScopes[], access: ScopeAccess): boolean {
  if (!chain.some((scopes) => scopes !== undefined)) return !access.authenticated;
  return access.authenticated && collectScopes(chain).every((scope) => access.scopes.has(scope));
}

function validateGroups<TLabel, TIcon>(
  placement: string,
  groups: readonly NavigationGroup<TLabel, TIcon>[],
): void {
  const byId = new Map<string, NavigationGroup<TLabel, TIcon>>();
  for (const group of groups) {
    if (!group.id) throw new Error(`UiCogs navigation group in ${placement} requires an id`);
    if (byId.has(group.id)) throw new Error(`Duplicate UiCogs navigation group: ${group.id}`);
    byId.set(group.id, group);
  }
  for (const group of groups) {
    if (group.parent && !byId.has(group.parent))
      throw new Error(`Unknown UiCogs navigation group parent: ${group.parent}`);
    const visited = new Set<string>();
    let current: NavigationGroup<TLabel, TIcon> | undefined = group;
    while (current) {
      if (visited.has(current.id))
        throw new Error(`UiCogs navigation group cycle in ${placement}: ${current.id}`);
      visited.add(current.id);
      current = current.parent ? byId.get(current.parent) : undefined;
    }
  }
}
