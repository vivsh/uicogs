import { defineSchema, registerResource } from "../../core/src/test-utils.js";

import { describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, effectScope, nextTick, ref, watchEffect } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import {
  createUiCogs as createCoreUiCogs,
  Store,
  createFormController,
  editor,
  fields,
  type LiveSource,
} from "@uicogs/core";
import {
  createRendererRegistry,
  useUcAction,
  useUcCollection,
  useUcController,
  useUcForm,
  useUcFormModel,
  useUcObject,
  useUcResource,
  useUcResourceView,
  useUcSnapshot,
  useUcTableModel,
  vueReactive,
  withVue,
} from "./index.js";

async function createUiCogs(options: Parameters<typeof createCoreUiCogs>[0]) {
  const core = createCoreUiCogs(options);
  const app = createApp(defineComponent({ setup: () => () => null }));
  const binding = await withVue(core);
  app.use(createRouter({ history: createMemoryHistory(), routes: [] })).use(binding.uiCogs);
  return app.runWithContext(() => binding.useUiCogs()) as unknown as typeof core;
}

describe("Vue controller integration", () => {
  it("reacts to runtime context updates", async () => {
    const core = createCoreUiCogs({ context: { locale: "en" } });
    const app = createApp(defineComponent({ setup: () => () => null }));
    const binding = await withVue(core);
    app.use(createRouter({ history: createMemoryHistory(), routes: [] })).use(binding.uiCogs);
    const api = app.runWithContext(() => binding.useUiCogs());
    const values: string[] = [];
    const stop = watchEffect(() => {
      values.push(api.context.value.locale);
    });

    api.context.update({ locale: "fr" });
    await nextTick();
    stop();
    expect(values).toEqual(["en", "fr"]);
    api.dispose();
  });

  it("invalidates direct property reads from external-store notifications", async () => {
    const store = new Store({ value: 1 });
    const controller = {
      get value() {
        return store.getSnapshot().value;
      },
      getSnapshot: () => store.getSnapshot(),
      subscribe: (listener: () => void) => store.subscribe(listener),
    };
    const reactive = vueReactive(controller);
    const values: number[] = [];
    const stop = watchEffect(() => {
      values.push(reactive.value);
    });
    store.setSnapshot({ value: 2 });
    await nextTick();
    stop();
    expect(values).toEqual([1, 2]);
  });

  it("resolves extensible semantic editor and formatter kinds", () => {
    const registry = createRendererRegistry<string, string>()
      .registerEditor("custom-editor", "Editor")
      .registerFormatter("custom-format", "Formatter");
    expect(registry.editor({ kind: "custom-editor" })).toBe("Editor");
    expect(registry.formatter({ kind: "custom-format" })).toBe("Formatter");
    expect(registry.editor({ kind: "missing" })).toBeUndefined();
    expect(registry.editor(undefined)).toBeUndefined();
    expect(registry.formatter(undefined)).toBeUndefined();
  });

  it("memoizes proxies, binds controller methods, preserves chaining, and rejects writes", () => {
    const store = new Store({ value: 1 });
    const controller = {
      get value() {
        return store.getSnapshot().value;
      },
      increment() {
        store.setSnapshot({ value: store.getSnapshot().value + 1 });
        return this;
      },
      getSnapshot: () => store.getSnapshot(),
      subscribe: (listener: () => void) => store.subscribe(listener),
    };
    const reactive = vueReactive(controller);
    expect(vueReactive(controller)).toBe(reactive);
    expect(reactive.increment()).toBe(reactive);
    expect(reactive.value).toBe(2);
    expect(Reflect.set(reactive, "value", 3)).toBe(false);
    expect(useUcController(controller)).toBe(reactive);
    expect(useUcResource(controller)).toBe(reactive);
    expect(useUcObject(controller)).toBe(reactive);
    expect(useUcCollection(controller)).toBe(reactive);
    expect(useUcForm(controller)).toBe(reactive);
    expect(useUcAction(controller)).toBe(reactive);
  });

  it("unsubscribes proxies and snapshots with their Vue effect scope", async () => {
    const store = new Store({ value: 1 });
    let subscriptions = 0;
    let unsubscriptions = 0;
    const controller = {
      get value() {
        return store.getSnapshot().value;
      },
      getSnapshot: () => store.getSnapshot(),
      subscribe(listener: () => void) {
        subscriptions += 1;
        const unsubscribe = store.subscribe(listener);
        return () => {
          unsubscriptions += 1;
          unsubscribe();
        };
      },
    };
    const scope = effectScope();
    let snapshot: ReturnType<typeof useUcSnapshot<{ value: number }>> | undefined;
    scope.run(() => {
      vueReactive(controller);
      snapshot = useUcSnapshot(controller);
    });
    expect(subscriptions).toBe(2);
    store.setSnapshot({ value: 2 });
    await nextTick();
    expect(snapshot?.value).toEqual({ value: 2 });
    scope.stop();
    expect(unsubscriptions).toBe(2);
  });

  it("creates Vue-adapted UiCogs resources", async () => {
    const cogs = await createUiCogs({
      context: undefined,
      transport: { request: async () => ({ status: 200, data: [{ id: 1, name: "One" }] }) },
    });
    const schema = defineSchema({ id: fields.ID(), name: fields.Str({ required: true }) });
    const definition = registerResource(cogs)({ name: "items", url: "items/", schema, key: "id" });
    const resource = cogs.resource(definition);
    await resource.load();
    expect(resource.all()[0]?.name).toBe("One");
    expect(resource.filter({ active: true })).toBe(resource);
  });

  it("rerenders local resources after synchronous cache facade writes", async () => {
    const cogs = await createUiCogs({ context: undefined });
    const schema = defineSchema({ id: fields.ID(), name: fields.Str({ required: true }) });
    const definition = registerResource(cogs)({
      name: "local-vue-items",
      schema,
      key: "id",
      source: cogs.local(),
    });
    const resource = cogs.resource(definition);
    const rendered: string[] = [];
    const stop = watchEffect(() => {
      rendered.push(
        resource
          .all()
          .map((item) => item.name)
          .join(","),
      );
    });

    resource.cache.add({ id: 1, name: "First" });
    await nextTick();
    resource.cache.upsert({ id: 1, name: "Updated" });
    await nextTick();
    stop();

    expect(rendered).toEqual(["", "First", "Updated"]);
    expect(resource.get(1).value?.name).toBe("Updated");
  });

  it("rerenders resources after live cache mutations", async () => {
    const live: LiveSource<void> = {
      open: async ({ signal }) => ({
        status: 200,
        frames: {
          async *[Symbol.asyncIterator]() {
            await new Promise((resolve) => setTimeout(resolve, 0));
            yield {
              kind: "event" as const,
              event: { type: "live-vue-items", data: '{"id":1,"name":"Live"}' },
            };
            await new Promise<void>((resolve) =>
              signal.addEventListener("abort", () => resolve(), { once: true }),
            );
          },
        },
      }),
    };
    const cogs = await createUiCogs({ context: undefined, live });
    const schema = defineSchema({ id: fields.ID(), name: fields.Str() });
    const Items = registerResource(cogs)({
      name: "live-vue-items",
      url: "items/",
      schema,
      key: "id",
    });
    const resource = cogs.resource(Items);
    const rendered: string[] = [];
    const stop = watchEffect(() =>
      rendered.push(
        resource
          .all()
          .map((item) => item.name)
          .join(),
      ),
    );
    await vi.waitFor(() => expect(rendered).toContain("Live"));
    stop();
    cogs.dispose();
  });

  it("derives form field models and unbound summaries", () => {
    const schema = defineSchema({
      displayName: fields.Str({
        label: "Display name",
        help: "Shown publicly",
        editor: editor.Textarea(),
      }),
      internal_note: fields.Str(),
    });
    const form = createFormController(schema.toForm(), {
      displayName: "Ada",
      internal_note: "Note",
    });
    form.applyFailure({
      kind: "validation",
      issues: [serverIssue([], "General"), serverIssue(["unknown"], "Unknown")],
      retryable: false,
    });
    const model = useUcFormModel(form);
    expect(model.form).toBe(vueReactive(form));
    expect(model.fields.value.map((field) => field.label)).toEqual([
      "Display name",
      "Internal note",
    ]);
    expect(model.fields.value[0]).toMatchObject({
      name: "displayName",
      descriptor: { kind: "textarea" },
      help: "Shown publicly",
    });
    expect(model.fields.value[0]?.state.value.value).toBe("Ada");
    expect(model.summary.value.map((issue) => issue.message)).toEqual(["General", "Unknown"]);
  });

  it("derives table columns, rows, descriptors, sorting, and hidden fields", async () => {
    const schema = defineSchema({
      id: fields.ID(),
      displayName: fields.Str({ label: "Name", format: { kind: "text" }, sort: "name" }),
      secret: fields.Str({ writeonly: true }),
      hidden: fields.Str({ format: { kind: "hidden" } }),
    });
    const collection = {
      values: [{ id: 1, displayName: "Ada" }],
      loading: false,
      sort: () => collection,
      page: () => collection,
      load: async () => collection.values,
    };
    const model = useUcTableModel(collection, schema);
    expect(model.rows.value).toEqual(collection.values);
    expect(model.columns.value).toEqual([
      expect.objectContaining({ name: "id", label: "Id", sortable: false, hidden: false }),
      expect.objectContaining({
        name: "displayName",
        label: "Name",
        descriptor: { kind: "text" },
        sortable: true,
        hidden: false,
      }),
      expect.objectContaining({ name: "secret", hidden: true }),
      expect.objectContaining({ name: "hidden", hidden: true }),
    ]);
    await collection.load();
  });

  it("coordinates list, detail, and create state in the headless resource view", () => {
    const store = new Store({ revision: 0 });
    const resource = {
      loading: false,
      all: () => [{ id: 1, name: "One" }],
      get: (key: number) => ({
        key,
        getSnapshot: () => ({ key }),
        subscribe: () => () => undefined,
      }),
      getSnapshot: () => store.getSnapshot(),
      subscribe: (listener: () => void) => store.subscribe(listener),
    };
    const activeKey = ref<number>();
    const selectedKeys = ref<readonly number[]>([1]);
    const model = useUcResourceView(resource, { activeKey, selectedKeys });
    expect(model.mode.value).toBe("list");
    expect(model.selectedKeys).toBe(selectedKeys);
    model.open(1);
    expect(model.mode.value).toBe("detail");
    expect(model.activeObject.value?.getSnapshot()).toEqual({ key: 1 });
    model.create();
    expect(model.mode.value).toBe("create");
    expect(model.creating.value).toBe(true);
    model.close();
    expect(model.mode.value).toBe("list");
  });
});

function serverIssue(path: readonly (string | number)[], message: string) {
  return {
    path,
    message,
    code: "server",
    source: "server" as const,
    severity: "error" as const,
  };
}
