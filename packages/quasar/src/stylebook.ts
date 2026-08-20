import type { VueRouteIntegration } from "@uicogs/vue";
import { defineComponent, h, type Component } from "vue";
import type { RouteRecordRaw, Router } from "vue-router";
import "./stylebook.css";
import { UcStylebook } from "./stylebook-view.js";

/** One optional application-owned page exposed from the fixture-only UiCogs stylebook. */
export interface UcStylebookEntry<TFixture = undefined> {
  /** Stable URL segment below the configured stylebook path. */
  readonly id: string;
  /** Accessible label used in the stylebook navigation. */
  readonly label?: string;
  /** A local Vue component rendered only by the opt-in stylebook route. */
  readonly component: Component;
  /**
   * Application-owned fixture input passed to the component as its
   * `fixture` property. It must contain local sample data only.
   */
  readonly fixture?: TFixture;
}

/** Options for the opt-in, fixture-only UiCogs Quasar stylebook route. */
export interface UcStylebookOptions {
  /** Disables route registration when false. This makes production omission explicit. */
  readonly enabled?: boolean;
  /** Absolute route prefix. Defaults to `/__stylebook`. */
  readonly path?: string;
  /** Optional application-owned fixture pages placed after the built-in overview. */
  readonly components?: readonly UcStylebookEntry<unknown>[];
}

const installed = new WeakSet<Router>();

/**
 * Creates a Vue Router integration for a local, fixture-only Quasar component stylebook.
 * It performs no network, storage, resource, service, notification, or application-runtime work.
 */
export function stylebook(options: UcStylebookOptions = {}): VueRouteIntegration {
  const enabled = options.enabled ?? true;
  const path = normalizePath(options.path ?? "/__stylebook");
  const entries = normalizeEntries(options.components ?? []);
  return Object.freeze({
    install(router: Router): void {
      if (!enabled || installed.has(router)) return;
      const name = `uicogs-stylebook:${path}`;
      const recordPath = `${path}/:component?`;
      assertAvailable(router, name, recordPath);
      const route: RouteRecordRaw = {
        name,
        path: recordPath,
        component: defineComponent({
          name: "UcStylebookRoute",
          setup: () => () => h(UcStylebook, { entries, routeName: name }),
        }),
      };
      router.addRoute(route);
      installed.add(router);
    },
  });
}

function normalizePath(value: string): string {
  if (!value.startsWith("/") || value.includes("?") || value.includes("#") || value.includes(":"))
    throw new Error("UiCogs stylebook path must be an absolute static Vue Router path");
  const normalized = value.length > 1 ? value.replace(/\/+$/, "") : value;
  if (normalized === "/") throw new Error("UiCogs stylebook path cannot be the application root");
  return normalized;
}

function normalizeEntries(
  entries: readonly UcStylebookEntry<unknown>[],
): readonly UcStylebookEntry<unknown>[] {
  const identifiers = new Set<string>();
  return Object.freeze(
    entries.map((entry) => {
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(entry.id))
        throw new Error(`UiCogs stylebook entry \`${entry.id}\` must be a URL-safe identifier`);
      if (entry.id === "overview")
        throw new Error(
          "UiCogs stylebook entry id `overview` is reserved by the built-in overview",
        );
      if (identifiers.has(entry.id))
        throw new Error(`UiCogs stylebook entry \`${entry.id}\` is declared more than once`);
      identifiers.add(entry.id);
      return Object.freeze({ ...entry, label: entry.label ?? labelFor(entry.id) });
    }),
  );
}

function labelFor(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function assertAvailable(router: Router, name: string, path: string): void {
  if (router.hasRoute(name) || router.getRoutes().some((record) => record.path === path))
    throw new Error(
      `UiCogs stylebook route \`${path}\` conflicts with an existing Vue Router record`,
    );
}
