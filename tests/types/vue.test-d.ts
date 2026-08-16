import { expectAssignable, expectError, expectType } from "tsd";
import { createUiCogs, fields, resource, schema } from "@uicogs/core";
import { UcResourceView } from "@uicogs/quasar";
import { createNavigation } from "@uicogs/routes";
import {
  standardRoutePagination,
  useRouteCollection,
  useRouteForm,
  useRouteResource,
  useRouteState,
  type RoutePaginationCodec,
  type UiCogsNavigationGroup,
  type UiCogsRouteMeta,
} from "@uicogs/vue";
import type { RouteRecordRaw } from "vue-router";

expectAssignable<RouteRecordRaw>({
  path: "/users",
  component: {},
  meta: {
    uicogs: {
      scopes: ["users.read"],
      navigation: { side: { parent: "administration", label: "Users", order: 10 } },
    },
  },
});
expectAssignable<UiCogsNavigationGroup>({ id: "administration", label: "Administration" });
const sharedNavigation = createNavigation({
  side: { groups: [{ id: "administration", label: "Administration" }] },
});
expectAssignable<import("@uicogs/vue").UiCogsNavigationOptions>(sharedNavigation);
expectError<UiCogsRouteMeta>({ auth: { all: ["users.read"] } });
expectError<UiCogsRouteMeta>({ scopes: ["users.read"], permissions: ["users.read"] });

const TaskFilters = schema({
  status: fields.Str({ wireName: "state" }),
  owner: fields.ID({ wireName: "owner_id" }),
});
const TaskParams = schema({ id: fields.ID() });
const Task = schema({ id: fields.ID(), title: fields.Str({ required: true }) });
const Tasks = resource({ name: "tasks", schema: Task, key: "id" });

const route = useRouteState({ route: "tasks", query: TaskFilters, params: TaskParams });
expectAssignable<Readonly<Partial<{ readonly status?: string; readonly owner?: number }>>>(
  route.query.value,
);
expectAssignable<Readonly<Partial<{ readonly id: number }>>>(route.params.value);
expectType<Promise<void>>(route.push({ query: { status: "open" }, params: { id: 2 } }));

const form = useRouteForm({ route, schema: TaskFilters });
expectType<string | undefined>(form.values.status);

declare const collection: {
  readonly resource: { readonly name: "tasks"; readonly key: "id"; readonly schema: typeof Task };
  readonly loading: boolean;
  getSnapshot(): object;
  subscribe(listener: () => void): () => void;
  all(): readonly Readonly<Record<string, unknown>>[];
  load(): Promise<unknown>;
  refresh(): Promise<unknown>;
  filter(values: Readonly<Record<string, unknown>>): unknown;
  sort(field?: string, descending?: boolean): unknown;
  page(index: number, size?: number): unknown;
  nextPage(): unknown;
  hasMore(): boolean;
};
const routeCollection = useRouteCollection({ route, collection, filters: TaskFilters });
expectType<Promise<void>>(routeCollection.sort("title", true));
expectType<Promise<void>>(routeCollection.page(2, 50));
expectType<Promise<void>>(routeCollection.nextPage());
type ResourceViewCollection = NonNullable<
  InstanceType<typeof UcResourceView>["$props"]["collection"]
>;
expectAssignable<ResourceViewCollection>(routeCollection);

const customPagination: RoutePaginationCodec = {
  keys: ["offset", "limit"],
  read: () => ({ index: 1, size: 25 }),
  write: () => ({ offset: undefined, limit: undefined }),
};
expectType<RoutePaginationCodec>(standardRoutePagination);
useRouteCollection({ route, collection, filters: TaskFilters, pagination: customPagination });

declare const taskResource: {
  readonly definition: { readonly name: "tasks"; readonly key: "id"; readonly schema: typeof Task };
  readonly resource: { readonly name: "tasks"; readonly key: "id"; readonly schema: typeof Task };
  readonly loading: boolean;
  getSnapshot(): object;
  subscribe(listener: () => void): () => void;
  all(): readonly Readonly<Record<string, unknown>>[];
  load(): Promise<unknown>;
  refresh(): Promise<unknown>;
  filter(values: Readonly<Record<string, unknown>>): unknown;
  sort(field?: string, descending?: boolean): unknown;
  page(index: number, size?: number): unknown;
  nextPage(): unknown;
  hasMore(): boolean;
  get(key: number): {
    readonly loading: boolean;
    readonly value?: Readonly<Record<string, unknown>>;
    load(): Promise<unknown>;
  };
};
const page = useRouteResource({
  route: "tasks",
  resource: taskResource,
  filters: TaskFilters,
});
expectType<Promise<void>>(page.open(2));
expectType<Promise<void>>(page.close());
expectAssignable<boolean>(page.creating.value);
expectError(
  useRouteResource({
    route: "tasks",
    resource: taskResource,
    filters: TaskFilters,
    detail: { param: "id" },
  }),
);

const createRoutePage = useRouteResource({
  route: "tasks",
  resource: taskResource,
  filters: TaskFilters,
});
expectType<Promise<void>>(createRoutePage.create());

const api = createUiCogs({ resources: [Tasks] });
const directResourcePage = useRouteResource({
  route: "tasks",
  resource: api.resource(Tasks),
  filters: TaskFilters,
});
expectType<Promise<void>>(directResourcePage.open(2));
expectType<"list" | "detail" | "create">(directResourcePage.mode.value);
type RouteResourceViewController = NonNullable<
  InstanceType<typeof UcResourceView>["$props"]["routeResource"]
>;
expectAssignable<RouteResourceViewController>(directResourcePage);

const FunctionalTasks = resource({
  name: "functional-tasks",
  schema: Task,
  key: (task) => task.id ?? 0,
});
const functionalApi = createUiCogs({ resources: [FunctionalTasks] });
const functionalResourcePage = useRouteResource({
  route: "functional-tasks",
  resource: functionalApi.resource(FunctionalTasks),
  filters: TaskFilters,
  key: {
    parseKey: (value) => Number(value),
    formatKey: (key) => String(key),
  },
});
expectType<Promise<void>>(functionalResourcePage.open(2));
