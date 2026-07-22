import { defineSchema, registerResource } from "../../core/src/test-utils.js";

// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { Dialog, Notify } from "quasar";
import {
  RequestError,
  Store,
  createFormController,
  createUiCogs,
  editor,
  fields,
  format,
  remoteFile,
  type NormalizedFailure,
  type TransportRequest,
} from "@uicogs/core";
import {
  UcAction,
  UcAlert,
  UcAlertFailure,
  UcAlertSuccess,
  UcCancel,
  UcConfirm,
  UcDelete,
  UcField,
  UcFilter,
  UcForm,
  UcResourceView,
  UcSubmit,
  UcTable,
  UcView,
  quasarRenderers,
} from "./index.js";

let notifyCreate = vi.fn();
let dialogCreate = vi.fn();

beforeEach(() => {
  notifyCreate = vi.fn(() => () => undefined);
  dialogCreate = vi.fn(() => dialogChain());
  Object.defineProperty(Notify, "create", { configurable: true, value: notifyCreate });
  Object.defineProperty(Dialog, "create", { configurable: true, value: dialogCreate });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (Notify as { create?: unknown }).create;
  delete (Dialog as { create?: unknown }).create;
});

describe("Quasar forms and fields", () => {
  it("derives controls from schema descriptors and updates the form draft", async () => {
    const schema = defineSchema({
      title: fields.Text({
        required: true,
        label: "Task title",
        help: "A concise title",
        editor: editor.Textarea({ autogrow: true }),
      }),
      count: fields.Int({ editor: editor.Number() }),
    });
    const form = createFormController(schema.toForm(), { title: "Initial", count: 1 });
    const wrapper = mount(UcForm, {
      props: { form },
      global: { stubs: quasarStubs },
    });
    const controls = wrapper.findAll("input");
    expect(controls).toHaveLength(2);
    expect(controls[0]?.attributes("aria-label")).toBe("Task title");
    await controls[0]?.setValue("Changed");
    await controls[1]?.setValue("3");
    expect(form.values.title).toBe("Changed");
    expect(form.values.count).toBe("3");
    expect(wrapper.text()).toContain("A concise title");
    expect(wrapper.find("button").text()).toBe("Submit");
  });

  it("renders field errors, summaries, progress, submit state, and success", async () => {
    const schema = defineSchema({ title: fields.Str({ required: true }) });
    const form = createFormController(
      schema.toForm(),
      { title: "Task" },
      async (_payload, options) => {
        options.onUploadProgress({ loaded: 1, lengthComputable: false });
        return { id: 1 };
      },
    );
    form.applyFailure({
      kind: "validation",
      issues: [serverIssue(["title"], "Title failed"), serverIssue([], "General failed")],
      retryable: false,
    });
    const wrapper = mount(UcForm, {
      props: { form },
      slots: { default: () => [h(UcField, { name: "title" }), h(UcSubmit)] },
      global: { stubs: quasarStubs },
    });
    expect(wrapper.text()).toContain("General failed");
    expect(wrapper.find("input").attributes("data-error")).toBe("true");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.emitted("success")?.[0]).toEqual([{ id: 1 }]);
    expect(form.progress.active).toBe(false);
  });

  it("emits form failures and reloads collections after successful filters", async () => {
    const schema = defineSchema({ search: fields.Str({ required: true }) });
    const failure: NormalizedFailure = {
      kind: "server",
      message: "Unavailable",
      issues: [],
      retryable: true,
    };
    const failed = createFormController(schema.toForm(), { search: "term" }, async () => {
      throw new RequestError(failure);
    });
    const failedWrapper = mount(UcForm, {
      props: { form: failed },
      global: { stubs: quasarStubs },
    });
    await failedWrapper.find("form").trigger("submit");
    await flushPromises();
    expect(failedWrapper.emitted("failure")?.[0]?.[0]).toMatchObject({ success: false });

    const successful = createFormController(schema.toForm(), { search: "term" }, async () => ({}));
    const collection = externalCollection();
    const filter = mount(UcFilter, {
      props: { form: successful, collection },
      global: { stubs: quasarStubs },
    });
    await filter.find("form").trigger("submit");
    await flushPromises();
    expect(collection.load).toHaveBeenCalledOnce();
  });

  it("handles remote file display, removal, and local file selection", async () => {
    const schema = defineSchema({
      attachment: fields.File({ editor: editor.File() }),
      images: fields.ImageList({ editor: editor.Image() }),
    });
    const form = createFormController(schema.toForm(), {
      attachment: remoteFile("https://example.test/document.pdf", "Document"),
      images: [remoteFile("https://example.test/image.png", "Image")],
    });
    const wrapper = mount(UcForm, {
      props: { form },
      global: { stubs: quasarStubs },
    });
    expect(wrapper.text()).toContain("Document");
    expect(wrapper.text()).toContain("Image");
    const remove = wrapper
      .findAll("button")
      .find((button) => button.attributes("title")?.startsWith("Remove Document"));
    await remove?.trigger("click");
    expect(form.values.attachment).toEqual({ kind: "removed" });

    const file = new File(["content"], "local.txt", { type: "text/plain" });
    const fileControls = wrapper.findAll('input[type="file"]');
    Object.defineProperty(fileControls[0]!.element, "files", { value: [file] });
    await fileControls[0]?.trigger("change");
    expect(form.values.attachment).toMatchObject({ kind: "local", name: "local.txt" });
  });

  it("requires fields and submits to be nested in a form", () => {
    expect(() =>
      mount(UcField, { props: { name: "title" }, global: { stubs: quasarStubs } }),
    ).toThrow("inside UcForm");
    expect(() => mount(UcSubmit, { global: { stubs: quasarStubs } })).toThrow("inside UcForm");
  });

  it("supports editor overrides, choices, input modes, ranges, and unknown renderer fallback", () => {
    const schema = defineSchema({
      email: fields.Email(),
      password: fields.Password(),
      period: fields.DateRange({ editor: editor.DateRange() }),
      status: fields.Enum(["open", "closed"] as const, {
        editor: editor.Select(),
      }),
    });
    const form = createFormController(schema.toForm(), {
      email: "person@example.test",
      password: "secret",
      period: [new Date("2026-07-01"), new Date("2026-07-31")],
      status: "open",
    });
    const wrapper = mount(UcForm, {
      props: { form },
      slots: {
        default: () => [
          h(UcField, { name: "email" }),
          h(UcField, { name: "password" }),
          h(UcField, { name: "period" }),
          h(UcField, {
            name: "status",
            kind: "missing-renderer",
            label: "State",
            options: ["open"],
          }),
        ],
      },
      global: { stubs: quasarStubs },
    });
    const inputs = wrapper.findAll("input");
    expect(inputs[0]?.attributes("type")).toBe("email");
    expect(inputs[1]?.attributes("type")).toBe("password");
    expect(inputs[2]?.attributes("data-range")).toBe("true");
    expect(inputs[3]?.attributes("aria-label")).toBe("State");
    expect(inputs[3]?.attributes("data-options")).toBe("1");
  });

  it("reports fields absent from the form schema", () => {
    const schema = defineSchema({ title: fields.Str() });
    const form = createFormController(schema.toForm(), { title: "Task" });
    expect(() =>
      mount(UcForm, {
        props: { form },
        slots: { default: () => h(UcField, { name: "missing" }) },
        global: { stubs: quasarStubs },
      }),
    ).toThrow("not present in the form schema");
  });
});

describe("Quasar views and tables", () => {
  it("renders split, stack, and dialog views and closes with Escape", async () => {
    const wrapper = mount(UcView, {
      props: { title: "Tasks", aside: true, mode: "split", loading: true },
      slots: { default: "List", aside: "Detail" },
      global: { stubs: quasarStubs },
    });
    expect(wrapper.text()).toContain("Tasks");
    expect(wrapper.text()).toContain("List");
    expect(wrapper.text()).toContain("Detail");
    expect(wrapper.find(".uc-view__content--split").exists()).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();
    expect(wrapper.emitted("update:aside")?.[0]).toEqual([false]);
    expect(wrapper.emitted("cancel")).toHaveLength(1);

    await wrapper.setProps({ aside: true, mode: "stack" });
    expect(wrapper.find(".uc-view__content--split").exists()).toBe(false);
    await wrapper.setProps({ mode: "dialog" });
    expect(wrapper.find("[data-q-dialog]").exists()).toBe(true);
    wrapper.unmount();
  });

  it("wraps optional pull-to-refresh and always completes the gesture", async () => {
    const refresh = vi.fn(async () => undefined);
    const done = vi.fn();
    const wrapper = mount(UcView, {
      props: { refresh },
      global: { stubs: quasarStubs },
    });
    const pull = wrapper.findComponent({ name: "QPullToRefreshStub" });
    pull.vm.$emit("refresh", done);
    await flushPromises();
    expect(refresh).toHaveBeenCalledOnce();
    expect(done).toHaveBeenCalledOnce();
  });

  it("derives columns, selection, pagination, sorting, aggregation, and loading", async () => {
    const requests: TransportRequest[] = [];
    const { resource } = await resourceFixture(async (request) => {
      requests.push(request);
      return {
        status: 200,
        data: {
          count: 2,
          results: [
            { id: 1, title: "One", secret: "hidden" },
            { id: 2, title: "Two", secret: "hidden" },
          ],
        },
      };
    });
    const wrapper = mount(UcTable, {
      props: {
        resource,
        serial: true,
        selection: "multiple",
        selectedKeys: [1],
        exclude: ["secret"],
        aggregate: (rows) => [{ title: `Count ${rows.length}` }],
      },
      global: { stubs: quasarStubs },
    });
    const table = wrapper.findComponent({ name: "QTableStub" });
    expect(table.props("rows")).toHaveLength(2);
    expect(
      (table.props("columns") as readonly { name: string }[]).map((column) => column.name),
    ).toEqual(["$serial", "id", "title"]);
    expect(table.props("selected")).toEqual([resource.all()[0]]);
    expect(table.props("pagination")).toMatchObject({ page: 1, rowsPerPage: 25, rowsNumber: 2 });
    expect(table.props("rowsPerPageOptions")).toEqual([25]);
    table.vm.$emit("request", {
      pagination: { page: 2, rowsPerPage: 10, sortBy: "title", descending: true },
    });
    await flushPromises();
    expect(requests.at(-1)?.query).toMatchObject({ page: 2, page_size: 10, ordering: "-title" });
    table.vm.$emit("update:selected", [resource.all()[1]]);
    expect(wrapper.emitted("update:selectedKeys")?.[0]).toEqual([[2]]);
    const renderedRow = wrapper.find("tr");
    await renderedRow.trigger("click");
    expect(wrapper.emitted("select")?.[0]?.[0]).toMatchObject({ id: 1 });
    expect(wrapper.text()).toContain("Count 2");
  });

  it("auto-loads empty tables and emits load failures", async () => {
    const successful = externalResource({ rows: [] });
    mount(UcTable, {
      props: { resource: successful, autoLoad: true },
      global: { stubs: quasarStubs },
    });
    await flushPromises();
    expect(successful.load).toHaveBeenCalledOnce();

    const failed = externalResource({ rows: [], failure: new Error("Failed") });
    const wrapper = mount(UcTable, {
      props: { resource: failed, autoLoad: true },
      global: { stubs: quasarStubs },
    });
    await flushPromises();
    expect(wrapper.emitted("failure")?.[0]?.[0]).toBeInstanceOf(Error);
  });

  it("supports included custom columns, custom body slots, and guarded infinite loading", async () => {
    const resource = externalResource({ rows: [{ id: 1, title: "One" }], hasMore: true });
    const wrapper = mount(UcTable, {
      props: {
        resource,
        infinite: true,
        include: ["title"],
        columns: [
          { name: "id", label: "Id", field: "id" },
          { name: "title", label: "Title", field: "title" },
        ],
      },
      slots: { body: () => h("div", { class: "custom-body" }, "Custom") },
      global: { stubs: quasarStubs },
    });
    const table = wrapper.findComponent({ name: "QTableStub" });
    expect(
      (table.props("columns") as readonly { name: string }[]).map((column) => column.name),
    ).toEqual(["title"]);
    expect(wrapper.find(".custom-body").exists()).toBe(true);
    table.vm.$emit("request", {});
    table.vm.$emit("scroll", {
      target: { scrollTop: 100, clientHeight: 100, scrollHeight: 210 },
    });
    await flushPromises();
    expect(resource.nextPage).toHaveBeenCalledOnce();
    expect(resource.load).toHaveBeenCalledOnce();

    await wrapper.setProps({ infinite: false });
    table.vm.$emit("scroll", { target: null });
    expect(resource.nextPage).toHaveBeenCalledOnce();
  });

  it("drives list, detail, create, close, and retry through real resource controllers", async () => {
    const { resource, editForm, createForm } = await resourceFixture();
    const wrapper = mount(UcResourceView, {
      props: {
        resource,
        title: "Tasks",
        autoLoad: false,
        modelValue: undefined,
        editForm,
        createForm,
      },
      slots: {
        list: ({
          rows,
          open,
        }: {
          rows: readonly Readonly<Record<string, unknown>>[];
          open: (row: Readonly<Record<string, unknown>>) => void;
        }) =>
          rows.map((row) =>
            h("button", { type: "button", onClick: () => open(row) }, `row-${String(row.id)}`),
          ),
      },
      global: { stubs: quasarStubs },
    });
    expect(wrapper.text()).toContain("row-1");
    const rowButton = wrapper.findAll("button").find((button) => button.text() === "row-1");
    await rowButton?.trigger("click");
    await nextTick();
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([1]);
    expect(wrapper.emitted("view")?.at(-1)).toEqual(["detail"]);

    await wrapper.setProps({ modelValue: undefined });
    const createButton = wrapper
      .findAll("button")
      .find((button) => button.attributes("data-icon") === "add");
    await createButton?.trigger("click");
    await nextTick();
    expect(wrapper.emitted("create")).toHaveLength(1);
    expect(wrapper.emitted("view")?.at(-1)).toEqual(["create"]);
  });

  it("renders empty, error, retry, and default detail states", async () => {
    const empty = externalResource({ rows: [] });
    const emptyWrapper = mount(UcResourceView, {
      props: { resource: empty, autoLoad: false, create: false, emptyLabel: "Nothing here" },
      global: { stubs: quasarStubs },
    });
    expect(emptyWrapper.text()).toContain("Nothing here");

    const failed = externalResource({ rows: [], error: { message: "Unavailable" } });
    const failedWrapper = mount(UcResourceView, {
      props: { resource: failed, autoLoad: false, create: false },
      global: { stubs: quasarStubs },
    });
    expect(failedWrapper.text()).toContain("Unavailable");
    await failedWrapper
      .findAll("button")
      .find((button) => button.text() === "Retry")
      ?.trigger("click");
    await flushPromises();
    expect(failed.load).toHaveBeenCalledOnce();

    const { resource } = await resourceFixture();
    const detail = mount(UcResourceView, {
      props: { resource, modelValue: 1, autoLoad: false, create: false },
      global: { stubs: quasarStubs },
    });
    expect(detail.text()).toContain("One");
    await detail
      .findAll("button")
      .find((button) => button.text() === "Close")
      ?.trigger("click");
    expect(detail.emitted("update:modelValue")?.at(-1)).toEqual([undefined]);
  });

  it("submits generated create and edit forms then refreshes the resource", async () => {
    const requests: TransportRequest[] = [];
    const { resource, editForm, createForm } = await resourceFixture(async (request) => {
      requests.push(request);
      if (request.method === "GET")
        return { status: 200, data: [{ id: 1, title: "One", secret: "hidden" }] };
      const body = request.body as Readonly<Record<string, unknown>>;
      return { status: 200, data: { id: request.method === "POST" ? 2 : 1, title: body.title } };
    });
    const wrapper = mount(UcResourceView, {
      props: { resource, autoLoad: false, createForm, editForm },
      slots: {
        list: ({
          rows,
          open,
        }: {
          rows: readonly Readonly<Record<string, unknown>>[];
          open: (row: Readonly<Record<string, unknown>>) => void;
        }) =>
          rows.map((row) =>
            h("button", { type: "button", onClick: () => open(row) }, `row-${String(row.id)}`),
          ),
      },
      global: { stubs: quasarStubs },
    });
    await wrapper
      .findAll("button")
      .find((button) => button.attributes("data-icon") === "add")
      ?.trigger("click");
    await nextTick();
    await wrapper.find("input").setValue("Created");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(requests.some((request) => request.method === "POST")).toBe(true);
    expect(wrapper.emitted("view")?.at(-1)).toEqual(["list"]);

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "row-1")
      ?.trigger("click");
    await nextTick();
    await wrapper.find("input").setValue("Edited");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(requests.some((request) => request.method === "PATCH")).toBe(true);
  });
});

describe("Quasar actions and messages", () => {
  it("runs function and controller actions with success and failure results", async () => {
    const success = vi.fn(async () => ({ success: true as const, value: 42 }));
    const wrapper = mount(UcAction, {
      props: { action: success, label: "Run" },
      global: { stubs: quasarStubs },
    });
    await wrapper.find("button").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("start")).toHaveLength(1);
    expect(wrapper.emitted("success")?.[0]).toEqual([42]);

    const controller = actionController({
      success: false,
      failure: { kind: "conflict", message: "Conflict", issues: [], retryable: false },
    });
    const failed = mount(UcAction, {
      props: { action: controller, label: "Run" },
      global: { stubs: quasarStubs },
    });
    await failed.find("button").trigger("click");
    await flushPromises();
    expect(failed.emitted("failure")?.[0]?.[0]).toMatchObject({ kind: "conflict" });
  });

  it("ignores disabled or pending actions and reports thrown errors", async () => {
    let release: (() => void) | undefined;
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const wrapper = mount(UcAction, {
      props: { action, label: "Run" },
      global: { stubs: quasarStubs },
    });
    await wrapper.find("button").trigger("click");
    await wrapper.find("button").trigger("click");
    expect(action).toHaveBeenCalledOnce();
    release?.();
    await flushPromises();
    await wrapper.setProps({ disable: true });
    await wrapper.find("button").trigger("click");
    expect(action).toHaveBeenCalledOnce();

    const thrown = mount(UcAction, {
      props: { action: async () => Promise.reject(new Error("Broken")), label: "Run" },
      global: { stubs: quasarStubs },
    });
    await thrown.find("button").trigger("click");
    await flushPromises();
    expect(thrown.emitted("failure")?.[0]?.[0]).toBeInstanceOf(Error);

    notifyCreate.mockClear();
    const primitive = mount(UcAction, {
      props: { action: async () => Promise.reject("untyped failure"), label: "Run" },
      global: { stubs: quasarStubs },
    });
    await primitive.find("button").trigger("click");
    await flushPromises();
    expect(primitive.emitted("failure")?.[0]).toEqual(["untyped failure"]);
    expect(notifyCreate).not.toHaveBeenCalled();
  });

  it("runs cancel and delete wrappers", async () => {
    const cancel = vi.fn();
    const cancelled = mount(UcCancel, {
      props: { action: cancel },
      global: { stubs: quasarStubs },
    });
    await cancelled.find("button").trigger("click");
    expect(cancel).toHaveBeenCalledOnce();
    expect(cancelled.emitted("cancel")).toHaveLength(1);

    const deleted = mount(UcDelete, {
      props: { action: async () => ({ success: true, value: 1 }) },
      global: { stubs: quasarStubs },
    });
    expect(deleted.findComponent(UcAction).props()).toMatchObject({
      label: "Delete",
      color: "negative",
      icon: "delete",
    });
  });

  it("handles confirmation cancellation, plain results, and notification overrides", async () => {
    dialogCreate.mockImplementation(() => {
      const chain = dialogChain();
      chain.onCancel = (callback: () => void) => {
        callback();
        return chain;
      };
      return chain;
    });
    const action = vi.fn(async () => 7);
    const cancelled = mount(UcAction, {
      props: { action, label: "Run", confirmMessage: "Continue?" },
      global: { stubs: quasarStubs },
    });
    await cancelled.find("button").trigger("click");
    await flushPromises();
    expect(action).not.toHaveBeenCalled();
    expect(cancelled.emitted("cancel")).toHaveLength(1);

    dialogCreate.mockImplementation(() => {
      const chain = dialogChain();
      chain.onOk = (callback: () => void) => {
        callback();
        return chain;
      };
      return chain;
    });
    const confirmed = mount(UcAction, {
      props: {
        action,
        label: "Run",
        confirmMessage: "Continue?",
        successMessage: "Completed",
      },
      global: { stubs: quasarStubs },
    });
    await confirmed.find("button").trigger("click");
    await flushPromises();
    expect(confirmed.emitted("success")?.[0]).toEqual([7]);
    expect(notifyCreate).toHaveBeenCalledWith(expect.objectContaining({ message: "Completed" }));

    const fallback = mount(UcAction, {
      props: {
        action: async () => ({
          success: false as const,
          failure: { kind: "unknown" as const, issues: [], retryable: false },
        }),
        label: "Run",
        failureMessage: "Fallback failure",
      },
      global: { stubs: quasarStubs },
    });
    await fallback.find("button").trigger("click");
    await flushPromises();
    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Fallback failure" }),
    );
  });

  it("settles alerts, confirmations, and notifications exactly once", async () => {
    let ok: (() => void) | undefined;
    let cancel: (() => void) | undefined;
    let dismiss: (() => void) | undefined;
    dialogCreate.mockReturnValue({
      onOk(callback: () => void) {
        ok = callback;
        return this;
      },
      onCancel(callback: () => void) {
        cancel = callback;
        return this;
      },
      onDismiss(callback: () => void) {
        dismiss = callback;
        return this;
      },
    });
    const alert = UcAlert("Message", { title: "Alert" });
    ok?.();
    dismiss?.();
    await expect(alert).resolves.toBe(true);
    const confirm = UcConfirm("Continue?");
    cancel?.();
    await expect(confirm).resolves.toBe(false);
    expect(dialogCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cancel: true, persistent: true }),
    );

    UcAlertSuccess("Saved");
    UcAlertFailure("Failed");
    expect(notifyCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: "positive" }));
    expect(notifyCreate).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: "negative" }));
  });
});

describe("Quasar formatter registry", () => {
  it("formats semantic scalar, choice, date, and reference values", () => {
    expect(render("text", null)).toBe("");
    expect(render("boolean", true, { trueLabel: "On" })).toBe("On");
    expect(render("boolean", false, { falseLabel: "Off" })).toBe("Off");
    expect(render("number", 1200)).toContain("1");
    expect(render("number", "unknown")).toBe("unknown");
    expect(render("choices", ["one", "two"], { separator: " / " })).toBe("one / two");
    expect(render("choices", "one")).toBe("one");
    expect(render("date", 0)).not.toBe("");
    expect(render("date", "invalid")).toBe("");
    expect(render("date", new Date("2026-07-21T00:00:00Z"))).not.toBe("");
    expect(render("date-range", ["2026-07-01", "2026-07-31"])).toContain("-");
    expect(render("date-range", "invalid")).toBe("");
    expect(render("reference", { title: "Task" })).toBe("Task");
    expect(render("reference", { label: "Label" })).toBe("Label");
    expect(render("reference", { name: "Name" })).toBe("Name");
    expect(render("reference", { id: 4 })).toBe("4");
    expect(render("reference", {})).toBe("");
    expect(render("reference", 4)).toBe("4");
  });

  it("renders semantic image, file, and link nodes", () => {
    expect(render("image", "https://example.test/image.png", { alt: "Preview" })).toMatchObject({
      type: "img",
    });
    expect(render("image", 1)).toBeUndefined();
    expect(render("file", "https://example.test/file.pdf", { download: true })).toMatchObject({
      type: "a",
    });
    expect(render("file", null)).toBeUndefined();
    expect(render("link", "https://example.test", { target: "_blank" })).toMatchObject({
      type: "a",
    });
    expect(render("link", null)).toBeUndefined();
  });
});

const controlStub = defineComponent({
  name: "ControlStub",
  inheritAttrs: false,
  props: {
    modelValue: null,
    label: String,
    hint: String,
    type: String,
    error: Boolean,
    range: Boolean,
    options: Array,
    multiple: Boolean,
    readonly: Boolean,
    accept: String,
  },
  emits: ["update:modelValue"],
  setup(props, { attrs, emit }) {
    return () =>
      h("label", [
        props.label,
        h("input", {
          ...attrs,
          type: props.type ?? "text",
          "aria-label": props.label,
          "data-error": String(props.error),
          "data-range": String(props.range),
          "data-options": String(props.options?.length ?? 0),
          "data-multiple": String(props.multiple),
          accept: props.accept,
          value: props.modelValue as string | number | undefined,
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
          onChange: (event: Event) => {
            const input = event.target as HTMLInputElement;
            emit("update:modelValue", input.files ?? input.value);
          },
        }),
        props.hint ? h("small", props.hint) : undefined,
      ]);
  },
});

const buttonStub = defineComponent({
  name: "QBtnStub",
  inheritAttrs: false,
  props: { label: String, icon: String, title: String, type: String, disable: Boolean },
  emits: ["click"],
  setup(props, { attrs, emit, slots }) {
    return () =>
      h(
        "button",
        {
          ...attrs,
          type: props.type === "submit" ? "submit" : "button",
          disabled: props.disable,
          title: props.title,
          "data-icon": props.icon,
          onClick: () => emit("click"),
        },
        slots.default?.() ?? props.label ?? props.icon,
      );
  },
});

const formStub = defineComponent({
  name: "QFormStub",
  emits: ["submit"],
  setup(_props, { emit, slots }) {
    return () =>
      h(
        "form",
        {
          onSubmit: (event: Event) => {
            event.preventDefault();
            emit("submit");
          },
        },
        slots.default?.(),
      );
  },
});

const tableStub = defineComponent({
  name: "QTableStub",
  inheritAttrs: false,
  props: {
    rows: Array,
    columns: Array,
    selected: Array,
    pagination: Object,
    rowsPerPageOptions: Array,
  },
  emits: ["request", "update:selected", "scroll"],
  setup(props, { slots }) {
    return () =>
      h("div", { "data-q-table": true }, [
        ...(props.rows ?? []).map((row, index) =>
          slots.body
            ? slots.body({
                row,
                cols: (props.columns ?? []).map((column) => {
                  const value = column as {
                    name: string;
                    field: string | ((item: unknown) => unknown);
                  };
                  return {
                    name: value.name,
                    value:
                      typeof value.field === "function"
                        ? value.field(row)
                        : (row as Readonly<Record<string, unknown>>)[value.field],
                  };
                }),
                selected: false,
              })
            : h(
                "button",
                { type: "button", key: index },
                `row-${String((row as { id?: unknown }).id)}`,
              ),
        ),
        slots["bottom-row"]?.(),
      ]);
  },
});

const quasarStubs = {
  QForm: formStub,
  QInput: controlStub,
  QEditor: controlStub,
  QCheckbox: controlStub,
  QToggle: controlStub,
  QSelect: controlStub,
  QDate: controlStub,
  QTime: controlStub,
  QColor: controlStub,
  QFile: defineComponent({
    name: "QFileStub",
    props: { modelValue: null, label: String },
    emits: ["update:modelValue"],
    setup(props, { emit }) {
      return () =>
        h("label", [
          props.label,
          h("input", {
            type: "file",
            "aria-label": props.label,
            onChange: (event: Event) =>
              emit("update:modelValue", (event.target as HTMLInputElement).files),
          }),
        ]);
    },
  }),
  QBtn: buttonStub,
  QBanner: defineComponent({
    name: "QBannerStub",
    setup(_props, { slots }) {
      return () => h("div", { "data-q-banner": true }, [slots.default?.(), slots.action?.()]);
    },
  }),
  QLinearProgress: defineComponent({
    name: "QLinearProgressStub",
    setup: () => () => h("progress"),
  }),
  QInnerLoading: defineComponent({ name: "QInnerLoadingStub", setup: () => () => h("div") }),
  QPage: defineComponent({
    name: "QPageStub",
    setup(_props, { slots }) {
      return () => h("main", slots.default?.());
    },
  }),
  QPageSticky: defineComponent({
    name: "QPageStickyStub",
    setup(_props, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  QPullToRefresh: defineComponent({
    name: "QPullToRefreshStub",
    emits: ["refresh"],
    setup(_props, { slots }) {
      return () => h("div", { "data-pull": true }, slots.default?.());
    },
  }),
  QDialog: defineComponent({
    name: "QDialogStub",
    setup(_props, { slots }) {
      return () => h("div", { "data-q-dialog": true }, slots.default?.());
    },
  }),
  QTable: tableStub,
  QTr: defineComponent({
    name: "QTrStub",
    setup:
      (_props, { slots }) =>
      () =>
        h("tr", slots.default?.()),
  }),
  QTd: defineComponent({
    name: "QTdStub",
    setup:
      (_props, { slots }) =>
      () =>
        h("td", slots.default?.()),
  }),
};

function externalCollection() {
  const store = new Store({ revision: 0 });
  return {
    values: [],
    loading: false,
    load: vi.fn(async () => []),
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener: () => void) => store.subscribe(listener),
  };
}

function externalResource(options: {
  readonly rows: readonly object[];
  readonly failure?: Error;
  readonly hasMore?: boolean;
  readonly loading?: boolean;
  readonly error?: { readonly message?: string };
}) {
  const store = new Store({ revision: 0 });
  const load = vi.fn(async () => {
    if (options.failure) throw options.failure;
    return options.rows;
  });
  const page = vi.fn();
  const sort = vi.fn();
  const nextPage = vi.fn();
  const resource = {
    definition: { key: "id", schema: { shape: {} } },
    loading: options.loading ?? false,
    error: options.error,
    pageInfo: undefined,
    all: () => options.rows,
    load,
    refresh: load,
    page,
    sort,
    nextPage,
    hasMore: vi.fn(() => options.hasMore ?? false),
    get: () => objectController(),
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener: () => void) => store.subscribe(listener),
  };
  page.mockReturnValue(resource);
  sort.mockReturnValue(resource);
  nextPage.mockReturnValue(resource);
  return resource;
}

async function resourceFixture(
  responder: (
    request: TransportRequest,
  ) => Promise<{ status: number; data: unknown }> = async () => ({
    status: 200,
    data: [{ id: 1, title: "One", secret: "hidden" }],
  }),
) {
  const cogs = createUiCogs({ context: undefined, transport: { request: responder } });
  const schema = defineSchema({
    id: fields.ID(),
    title: fields.Str({ required: true, format: format.Text(), sort: "title" }),
    secret: fields.Str({ writeonly: true }),
  });
  const definition = registerResource(cogs)({ name: "tasks", url: "tasks/", schema, key: "id" });
  const resource = cogs.resource(definition);
  await resource.load();
  return {
    resource,
    editForm: schema.keep("title").toForm({ mode: "patch" }),
    createForm: schema.keep("title").toForm({ mode: "create" }),
  };
}

function actionController(result: unknown) {
  const store = new Store({ revision: 0 });
  return {
    loading: false,
    progress: { active: false, loaded: 0, lengthComputable: false },
    execute: vi.fn(async () => result),
    cancel: vi.fn(),
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener: () => void) => store.subscribe(listener),
  };
}

function objectController() {
  const store = new Store({ revision: 0 });
  return {
    key: 1,
    loading: false,
    load: async () => undefined,
    refresh: async () => undefined,
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener: () => void) => store.subscribe(listener),
  };
}

function serverIssue(path: readonly (string | number)[], message: string) {
  return {
    path,
    message,
    code: "server",
    source: "server" as const,
    severity: "error" as const,
  };
}

function render(
  kind: string,
  value: unknown,
  options: Readonly<Record<string, unknown>> = {},
): unknown {
  const formatter = quasarRenderers.formatter({ kind });
  if (typeof formatter !== "function") throw new Error(`Formatter ${kind} is not registered`);
  return Reflect.apply(formatter, undefined, [value, options, kind, {}]);
}

function dialogChain() {
  const chain = {
    onOk: (callback: () => void) => {
      void callback;
      return chain;
    },
    onCancel: (callback: () => void) => {
      void callback;
      return chain;
    },
    onDismiss: (callback: () => void) => {
      void callback;
      return chain;
    },
  };
  return chain;
}
