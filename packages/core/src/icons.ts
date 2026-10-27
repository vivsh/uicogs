import { deepFreeze } from "./utils.js";

/**
 * Semantic icons used by UiCogs-owned controls. Adapters resolve these tokens to their native
 * icon-pack values, while applications may replace any token at runtime creation.
 */
export const uiCogsIconNames = [
  "add",
  "back",
  "cancel",
  "clear",
  "close",
  "collapse",
  "create",
  "date",
  "dateRange",
  "delete",
  "download",
  "edit",
  "error",
  "expand",
  "filter",
  "info",
  "menu",
  "next",
  "notifications",
  "open",
  "previous",
  "refresh",
  "remove",
  "retry",
  "search",
  "success",
  "time",
  "upload",
  "warning",
] as const;

/** One stable semantic icon token recognised by UiCogs. */
export type UiCogsIconName = (typeof uiCogsIconNames)[number];

/**
 * Application icon-pack replacements. Semantic tokens are suggested, and additional application
 * presentation names are supported for resource actions, enum choices, and notifications.
 */
export type UiCogsIconOverrides = Readonly<Partial<Record<UiCogsIconName, string>>> &
  Readonly<Record<string, string | undefined>>;

/** Immutable icon lookup held by one UiCogs runtime. */
export type UiCogsIconRegistry = Readonly<Record<UiCogsIconName, string>> &
  Readonly<Record<string, string | undefined>>;

const defaults = Object.freeze(
  Object.fromEntries(uiCogsIconNames.map((name) => [name, name])) as Record<UiCogsIconName, string>,
);

/** Builds one validated, immutable icon registry without choosing a framework icon pack. */
export function createUiCogsIconRegistry(
  overrides: UiCogsIconOverrides | undefined,
): UiCogsIconRegistry {
  if (!overrides) return defaults;
  const entries: [string, string][] = [];
  for (const [name, value] of Object.entries(overrides)) {
    if (value !== undefined && typeof value !== "string")
      throw new Error(`UiCogs icon ${name} must be a string`);
    if (value !== undefined) entries.push([name, value]);
  }
  return deepFreeze({ ...defaults, ...Object.fromEntries(entries) }) as UiCogsIconRegistry;
}
