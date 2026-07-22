import { computed, type ComputedRef } from "vue";

export interface RouteLocationLike {
  readonly name?: unknown;
  readonly params: Readonly<Record<string, unknown>>;
  readonly query: Readonly<Record<string, unknown>>;
}

export interface RouterLike {
  push(location: Readonly<Record<string, unknown>>): Promise<unknown> | unknown;
  replace(location: Readonly<Record<string, unknown>>): Promise<unknown> | unknown;
  back?(): void;
}

export interface ResourceRouteState<TKey extends string | number> {
  readonly mode: "list" | "detail" | "create" | "action";
  readonly key?: TKey;
  readonly action?: string;
  readonly query: Readonly<Record<string, unknown>>;
}

export interface ResourceRouteOptions<TKey extends string | number> {
  readonly router: RouterLike;
  readonly route: RouteLocationLike;
  readonly keyParam?: string;
  readonly actionParam?: string;
  readonly createValue?: string | number;
  readonly parseKey?: (value: unknown) => TKey;
  readonly preserveParams?: readonly string[];
}

export function useUcResourceRoute<TKey extends string | number = number>(
  options: ResourceRouteOptions<TKey>,
) {
  const keyParam = options.keyParam ?? "id";
  const actionParam = options.actionParam ?? "action";
  const createValue = options.createValue ?? "new";
  const state: ComputedRef<ResourceRouteState<TKey>> = computed(() => {
    const rawKey = options.route.params[keyParam];
    const action = stringValue(options.route.params[actionParam]);
    if (rawKey === undefined || rawKey === null || rawKey === "")
      return { mode: "list", query: options.route.query };
    if (String(rawKey) === String(createValue))
      return { mode: "create", query: options.route.query };
    const key = options.parseKey?.(rawKey) ?? (defaultKey(rawKey) as TKey);
    return {
      mode: action ? "action" : "detail",
      key,
      ...(action ? { action } : {}),
      query: options.route.query,
    };
  });

  const navigate = (params: Readonly<Record<string, unknown>>, replace = false) => {
    const location = {
      ...(options.route.name !== undefined ? { name: options.route.name } : {}),
      params: retainedParams(options.route.params, options.preserveParams, params),
      query: options.route.query,
    };
    return replace ? options.router.replace(location) : options.router.push(location);
  };

  return Object.freeze({
    state,
    openList: (replace = false) =>
      navigate({ [keyParam]: undefined, [actionParam]: undefined }, replace),
    openCreate: () => navigate({ [keyParam]: createValue, [actionParam]: undefined }),
    openDetail: (key: TKey) => navigate({ [keyParam]: key, [actionParam]: undefined }),
    openAction: (key: TKey, action: string) => navigate({ [keyParam]: key, [actionParam]: action }),
    setQuery(query: Readonly<Record<string, unknown>>, replace = true) {
      const location = {
        ...(options.route.name !== undefined ? { name: options.route.name } : {}),
        params: options.route.params,
        query,
      };
      return replace ? options.router.replace(location) : options.router.push(location);
    },
    back() {
      options.router.back?.();
    },
  });
}

function retainedParams(
  current: Readonly<Record<string, unknown>>,
  preserve: readonly string[] | undefined,
  patch: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const base = preserve
    ? Object.fromEntries(
        preserve.flatMap((name) => (name in current ? [[name, current[name]]] : [])),
      )
    : { ...current };
  for (const [name, value] of Object.entries(patch)) {
    if (value === undefined) delete base[name];
    else base[name] = value;
  }
  return base;
}

function defaultKey(value: unknown): string | number {
  if (typeof value === "number") return value;
  const text = String(Array.isArray(value) ? value[0] : value);
  const number = Number(text);
  return text !== "" && Number.isFinite(number) ? number : text;
}

function stringValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return String(Array.isArray(value) ? value[0] : value);
}
