import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import { useUcResourceRoute } from "./index.js";

describe("Vue Router resource state", () => {
  it("derives route state and performs controlled navigation", () => {
    const locations: object[] = [];
    const route = reactive({
      name: "projects",
      params: { workspace: "one", id: "7", action: "publish" } as Record<string, unknown>,
      query: { search: "active" } as Record<string, unknown>,
    });
    const state = useUcResourceRoute({
      route,
      router: {
        push: (location) => void locations.push(location),
        replace: (location) => void locations.push(location),
      },
      preserveParams: ["workspace"],
    });

    expect(state.state.value).toMatchObject({ mode: "action", key: 7, action: "publish" });
    state.openCreate();
    state.openDetail(9);
    state.openList(true);
    expect(locations).toEqual([
      { name: "projects", params: { workspace: "one", id: "new" }, query: { search: "active" } },
      { name: "projects", params: { workspace: "one", id: 9 }, query: { search: "active" } },
      { name: "projects", params: { workspace: "one" }, query: { search: "active" } },
    ]);
  });

  it("derives list, create, detail, string, array, and custom key states", () => {
    const route = reactive({
      params: {} as Record<string, unknown>,
      query: { page: "2" } as Record<string, unknown>,
    });
    const router = { push: vi.fn(), replace: vi.fn() };
    const binding = useUcResourceRoute({ route, router });
    expect(binding.state.value).toEqual({ mode: "list", query: { page: "2" } });
    route.params.id = "new";
    expect(binding.state.value.mode).toBe("create");
    route.params.id = "alpha";
    expect(binding.state.value).toMatchObject({ mode: "detail", key: "alpha" });
    route.params.id = ["12", "ignored"];
    route.params.action = ["edit", "ignored"];
    expect(binding.state.value).toMatchObject({ mode: "action", key: 12, action: "edit" });

    const custom = useUcResourceRoute<string>({
      route,
      router,
      keyParam: "id",
      actionParam: "action",
      createValue: 0,
      parseKey: (value) => `key:${String(value)}`,
    });
    route.params.id = "value";
    delete route.params.action;
    expect(custom.state.value).toMatchObject({ mode: "detail", key: "key:value" });
    route.params.id = 0;
    expect(custom.state.value.mode).toBe("create");
  });

  it("inherits all params by default and supports push or replace query changes", () => {
    const push = vi.fn();
    const replace = vi.fn();
    const back = vi.fn();
    const route = reactive({
      params: { workspace: "one", id: 2, action: "edit" } as Record<string, unknown>,
      query: { page: 1 } as Record<string, unknown>,
    });
    const binding = useUcResourceRoute({ route, router: { push, replace, back } });
    binding.openAction(3, "archive");
    expect(push).toHaveBeenLastCalledWith({
      params: { workspace: "one", id: 3, action: "archive" },
      query: { page: 1 },
    });
    binding.setQuery({ page: 2 });
    expect(replace).toHaveBeenLastCalledWith({
      params: route.params,
      query: { page: 2 },
    });
    binding.setQuery({ page: 3 }, false);
    expect(push).toHaveBeenLastCalledWith({ params: route.params, query: { page: 3 } });
    binding.back();
    expect(back).toHaveBeenCalledOnce();
  });

  it("ignores missing preserved params and tolerates routers without back", () => {
    const route = reactive({
      name: undefined,
      params: { id: null } as Record<string, unknown>,
      query: {} as Record<string, unknown>,
    });
    const push = vi.fn();
    const binding = useUcResourceRoute({
      route,
      router: { push, replace: vi.fn() },
      preserveParams: ["missing"],
    });
    expect(binding.state.value.mode).toBe("list");
    binding.openDetail(4);
    expect(push).toHaveBeenCalledWith({ params: { id: 4 }, query: {} });
    expect(() => binding.back()).not.toThrow();
  });
});
