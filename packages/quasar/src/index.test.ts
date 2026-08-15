import { defineSchema, registerResource } from "../../core/src/test-utils.js";

// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, type App } from "vue";
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
  defineSkin,
  injectSkin,
  quasarRenderers,
  type FieldSkin,
  type UiCogsQuasarSkin,
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

  /** Verifies that a form view limits only its generated controls. */
  it("uses an optional view for generated controls", () => {
    const schema = defineSchema({ title: fields.Str(), complete: fields.Bool() });
    const form = createFormController(schema.toForm(), { title: "One", complete: false });
    const wrapper = mount(UcForm, {
      props: { form, view: schema.view({ fields: ["title"] as const }) },
      global: { stubs: quasarStubs },
    });
    expect(wrapper.findAll("input")).toHaveLength(1);
  });

  it("maps field-owned form layout and form actions to native Quasar grid cells", () => {
    const schema = defineSchema({
      title: fields.Str({ layout: { form: { xs: 12, md: 6 } } }),
      notes: fields.Text(),
    });
    const form = createFormController(schema.toForm(), { title: "One", notes: "Two" });
    const wrapper = mount(UcForm, {
      props: {
        form,
        layout: { mode: "grid", gutter: "sm", default: { xs: 12, md: 4 } },
      },
      slots: {
        actions: ({ submitting }: { submitting: boolean }) =>
          h("span", { class: "custom-actions" }, String(submitting)),
      },
      global: { stubs: quasarStubs },
    });

    expect(wrapper.find(".uc-form__grid").classes()).toEqual(
      expect.arrayContaining(["row", "q-col-gutter-sm"]),
    );
    const cells = wrapper.findAll(".uc-form__field");
    expect(cells[0]?.classes()).toEqual(expect.arrayContaining(["col-xs-12", "col-md-6"]));
    expect(cells[1]?.classes()).toEqual(expect.arrayContaining(["col-xs-12", "col-md-4"]));
    expect(wrapper.find(".uc-form__actions").classes()).toContain("col-12");
    expect(wrapper.find(".custom-actions").text()).toBe("false");
  });

  it("applies installed layout defaults before field-specific overrides", () => {
    const schema = defineSchema({
      title: fields.Str(),
      notes: fields.Text({ layout: { form: { md: 8 } } }),
    });
    const form = createFormController(schema.toForm(), { title: "One", notes: "Two" });
    const layoutPlugin = {
      install(app: App) {
        injectSkin(
          app,
          defineSkin({
            layout: {
              form: {
                mode: "grid",
                default: { xs: 12, md: 4 },
                kinds: { text: { md: 5 } },
              },
            },
          }),
        );
      },
    };
    const wrapper = mount(UcForm, {
      props: { form },
      global: { plugins: [layoutPlugin], stubs: quasarStubs },
    });

    const cells = wrapper.findAll(".uc-form__field");
    expect(cells[0]?.classes()).toEqual(expect.arrayContaining(["col-xs-12", "col-md-5"]));
    expect(cells[1]?.classes()).toEqual(expect.arrayContaining(["col-xs-12", "col-md-8"]));
  });

  it("lays out generated filters horizontally and controls optional filter disclosure", async () => {
    const schema = defineSchema({
      search: fields.Str({ layout: { filter: { xs: 12, md: 5 } } }),
      after: fields.Date({ layout: { filter: { xs: 12, md: 3, placement: "collapsible" } } }),
    });
    const form = createFormController(schema.toForm(), {
      search: "",
      after: new Date("2026-01-01"),
    });
    let actionProps:
      | { readonly expanded: boolean; readonly hasCollapsible: boolean; toggleExpanded(): void }
      | undefined;
    const wrapper = mount(UcFilter, {
      props: { form },
      slots: {
        actions: (props: {
          readonly expanded: boolean;
          readonly hasCollapsible: boolean;
          toggleExpanded(): void;
        }) => {
          actionProps = props;
          return h("button", { class: "filter-toggle", onClick: props.toggleExpanded }, "Toggle");
        },
      },
      global: { stubs: quasarStubs },
    });

    expect(wrapper.find(".uc-filter__static").exists()).toBe(true);
    expect(wrapper.find(".uc-filter__collapsible").exists()).toBe(false);
    expect(wrapper.find(".uc-filter__actions").classes()).toContain("col-auto");
    expect(actionProps).toMatchObject({ expanded: false, hasCollapsible: true });
    await wrapper.find(".filter-toggle").trigger("click");
    expect(wrapper.emitted("update:expanded")?.at(-1)).toEqual([true]);
    expect(wrapper.find(".uc-filter__collapsible").exists()).toBe(true);
    expect(wrapper.findAll(".uc-form__field")).toHaveLength(2);
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

    const routeBound = mount(UcFilter, {
      props: { form: successful },
      global: { stubs: quasarStubs },
    });
    await routeBound.find("form").trigger("submit");
    await flushPromises();
    expect(collection.load).toHaveBeenCalledOnce();
  });

  it("notifies when submission validation fails", async () => {
    const schema = defineSchema({ title: fields.Str({ required: true }) });
    const form = createFormController(schema.toForm(), { title: "" }, async () => ({}));
    const wrapper = mount(UcForm, {
      props: { form, failureMessage: "Enter a title before submitting." },
      global: { stubs: quasarStubs },
    });

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.emitted("failure")?.[0]?.[0]).toMatchObject({ success: false });
    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: "negative", message: "Enter a title before submitting." }),
    );
  });

  it("reports unexpected form and collection rejections instead of leaving them unhandled", async () => {
    const schema = defineSchema({ title: fields.Str({ required: true }) });
    const form = createFormController(schema.toForm(), { title: "Task" }, async () => ({}));
    vi.spyOn(form, "submit").mockRejectedValue(new Error("Network request failed"));
    const rejected = mount(UcForm, {
      props: { form },
      global: { stubs: quasarStubs },
    });

    await rejected.find("form").trigger("submit");
    await flushPromises();

    expect(rejected.emitted("failure")?.[0]?.[0]).toBeInstanceOf(Error);
    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: "negative", message: "Network request failed" }),
    );

    notifyCreate.mockClear();
    const collection = externalCollection();
    collection.load.mockRejectedValue(new Error("Network request failed"));
    const filterForm = createFormController(schema.toForm(), { title: "Task" }, async () => ({}));
    const filter = mount(UcFilter, {
      props: { form: filterForm, collection },
      global: { stubs: quasarStubs },
    });

    await filter.find("form").trigger("submit");
    await flushPromises();

    expect(filter.emitted("load-failure")?.[0]?.[0]).toBeInstanceOf(Error);
    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: "negative", message: "Network request failed" }),
    );
  });

  it("uses a status-specific message when a submission failure has no message", async () => {
    const schema = defineSchema({ title: fields.Str({ required: true }) });
    const failure: NormalizedFailure = {
      kind: "permission",
      status: 403,
      message: "",
      issues: [],
      retryable: false,
    };
    const form = createFormController(schema.toForm(), { title: "Task" }, async () => {
      throw new RequestError(failure);
    });
    const wrapper = mount(UcForm, {
      props: { form },
      global: { stubs: quasarStubs },
    });

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.emitted("failure")?.[0]?.[0]).toMatchObject({ success: false });
    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "negative",
        message: "You do not have permission to perform this action.",
      }),
    );
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

    const removeImage = wrapper
      .findAll("button")
      .find((button) => button.attributes("title")?.startsWith("Remove Image"));
    await removeImage?.trigger("click");
    expect(form.values.images).toEqual([{ kind: "removed" }]);

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

  it("adds stable form and field classes without a skin", () => {
    const schema = defineSchema({ internal_note: fields.Str() });
    const form = createFormController(schema.toForm(), { internal_note: "Private" });
    const wrapper = mount(UcForm, {
      props: { form },
      global: { stubs: quasarStubs },
    });

    expect(wrapper.find("form").classes()).toContain("uc-form");
    expect(wrapper.find("input").classes()).toEqual(
      expect.arrayContaining(["uc-field", "uc-field-text", "uc-field-internal_note"]),
    );
  });

  it("merges application, form, and schema field appearances in order", () => {
    const schema = defineSchema({
      title: fields.Str({
        editor: {
          kind: "text",
          options: { outlined: false, bgColor: "blue-1", class: "schema-title" },
        },
      }),
    });
    const form = createFormController(schema.toForm(), { title: "Task" });
    const wrapper = mount(UcForm, {
      props: {
        form,
        skin: { form: { class: "compact-form" }, field: { dense: true, bgColor: "grey-1" } },
      },
      global: {
        plugins: [
          skinPlugin({
            form: { class: "application-form" },
            field: { outlined: true, bgColor: "grey-2", class: "application-field" },
          }),
        ],
        stubs: quasarStubs,
      },
    });
    const control = wrapper.findComponent(controlStub);

    expect(wrapper.find("form").classes()).toEqual(
      expect.arrayContaining(["uc-form", "application-form", "compact-form"]),
    );
    expect(control.props("outlined")).toBe(false);
    expect(control.props("dense")).toBe(true);
    expect(control.props("bgColor")).toBe("blue-1");
    expect(control.find("input").classes()).toEqual(
      expect.arrayContaining(["application-field", "schema-title", "uc-field-title"]),
    );
  });

  it("keeps UiCogs model, validation, and readonly bindings ahead of skins", () => {
    const schema = defineSchema({ title: fields.Str({ readonly: true }) });
    const form = createFormController(schema.toForm(), { title: "Authoritative" });
    form.applyFailure({
      kind: "validation",
      issues: [serverIssue(["title"], "Title is invalid")],
      retryable: false,
    });
    const conflicting = {
      modelValue: "Incorrect",
      error: false,
      readonly: false,
    } as unknown as FieldSkin;
    const wrapper = mount(UcForm, {
      props: { form },
      global: { plugins: [skinPlugin({ field: conflicting })], stubs: quasarStubs },
    });
    const control = wrapper.findComponent(controlStub);

    expect(control.props("modelValue")).toBe("Authoritative");
    expect(control.props("error")).toBe(true);
    expect(control.props("readonly")).toBe(true);
  });

  it("reacts to callback field skins in automatic and custom form layouts", async () => {
    const schema = defineSchema({ title: fields.Str() });
    const form = createFormController(schema.toForm(), { title: "Initial" });
    const skin = defineSkin({
      field: ({ name, field, form: currentForm }) => ({
        bgColor: currentForm.field(name).dirty ? "amber-1" : "grey-2",
        class: field.options?.label ? "labeled" : "plain",
      }),
    });
    const automatic = mount(UcForm, {
      props: { form },
      global: { plugins: [skinPlugin(skin)], stubs: quasarStubs },
    });
    const custom = mount(UcForm, {
      props: { form },
      slots: { default: () => h(UcField, { name: "title" }) },
      global: { plugins: [skinPlugin(skin)], stubs: quasarStubs },
    });

    expect(automatic.findComponent(controlStub).props("bgColor")).toBe("grey-2");
    expect(custom.findComponent(controlStub).find("input").classes()).toContain("uc-field-title");
    await automatic.find("input").setValue("Changed");
    expect(automatic.findComponent(controlStub).props("bgColor")).toBe("amber-1");
  });

  it("scopes recognised palette roles to the application root and restores them on disposal", () => {
    let dispose: () => void = () => undefined;
    const plugin = {
      install(app: App) {
        dispose = injectSkin(
          app,
          defineSkin({ palette: { primary: "#5b4bdb", negative: "#c62828" } }),
        );
      },
    };
    const schema = defineSchema({ title: fields.Str() });
    const form = createFormController(schema.toForm(), { title: "Task" });
    const wrapper = mount(UcForm, {
      props: { form },
      global: { plugins: [plugin], stubs: quasarStubs },
    });
    const root = wrapper.find("form").element as HTMLElement;

    expect(root.style.getPropertyValue("--q-primary")).toBe("#5b4bdb");
    expect(root.style.getPropertyValue("--q-negative")).toBe("#c62828");
    expect(root.style.getPropertyValue("--uc-primary")).toBe("");
    dispose();
    expect(root.style.getPropertyValue("--q-primary")).toBe("");
  });
});

describe("Quasar views and tables", () => {
  it("adds stable table hooks and preserves custom column classes", () => {
    const resource = externalResource({ rows: [{ id: 1, title: "One" }] });
    const wrapper = mount(UcTable, {
      props: {
        resource,
        class: { "caller-table": true },
        rowClass: () => "application-row",
        columns: [
          {
            name: "title",
            label: "Title",
            field: "title",
            classes: "application-cell",
            headerClasses: "application-header",
          },
          {
            name: "priority",
            label: "Priority",
            field: "priority",
            align: "right",
          },
        ],
      },
      global: { stubs: quasarStubs },
    });
    const table = wrapper.findComponent({ name: "QTableStub" });
    const columns = table.props("columns") as readonly {
      classes?: string;
      headerClasses?: string;
    }[];
    const column = columns[0];

    expect(table.classes()).toEqual(
      expect.arrayContaining(["caller-table", "uc-table", "uc-table-tasks"]),
    );
    expect(column?.classes).toContain("application-cell");
    expect(column?.classes).toContain("uc-table-column-title");
    expect(column?.headerClasses).toContain("application-header");
    expect(column?.headerClasses).toContain("uc-table-column-title");
    expect(columns[0]).toMatchObject({ align: "left" });
    expect(columns[1]).toMatchObject({ align: "right" });
    expect(wrapper.find(".uc-table-row").classes()).toContain("application-row");
    expect(wrapper.find("th").classes()).toContain("uc-table-column-title");
    expect(wrapper.find("td").classes()).toEqual(
      expect.arrayContaining(["application-cell", "uc-table-column-title"]),
    );
  });

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
    expect(wrapper.find(".uc-view__dialog > aside").exists()).toBe(true);
    wrapper.findComponent({ name: "QDialogStub" }).vm.$emit("update:modelValue", false);
    expect(wrapper.emitted("aside-hidden")).toHaveLength(2);
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
    const { resource, schema } = await resourceFixture(async (request) => {
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
        view: schema.view({ fields: ["id", "title"] as const }),
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

  /** Verifies that a table can render and control a named query collection. */
  it("accepts a named query collection", async () => {
    const requests: TransportRequest[] = [];
    const { resource } = await resourceFixture(async (request) => {
      requests.push(request);
      return { status: 200, data: [{ id: 1, title: "One", secret: "hidden" }] };
    });
    const collection = resource.query("search", { text: "one" });
    await collection.load();

    const wrapper = mount(UcTable, {
      props: { collection },
      global: { stubs: quasarStubs },
    });
    const table = wrapper.findComponent({ name: "QTableStub" });
    expect(table.props("rows")).toEqual(collection.all());

    table.vm.$emit("request", {
      pagination: { page: 2, rowsPerPage: 10, sortBy: "title", descending: true },
    });
    await flushPromises();
    expect(requests.at(-1)?.url).toContain("tasks/search/");
    expect(requests.at(-1)?.query).toMatchObject({ text: "one", page: 2, page_size: 10 });
  });

  it("waits for route-aware table state changes before loading", async () => {
    const resource = externalResource({ rows: [{ id: 1, title: "One" }] });
    let release: (() => void) | undefined;
    const sorted = new Promise<void>((resolve) => {
      release = resolve;
    });
    resource.sort.mockImplementation(async () => sorted);
    const wrapper = mount(UcTable, {
      props: { resource },
      global: { stubs: quasarStubs },
    });

    wrapper.findComponent({ name: "QTableStub" }).vm.$emit("request", {
      pagination: { page: 2, rowsPerPage: 25, sortBy: "title", descending: false },
    });
    await nextTick();
    expect(resource.load).not.toHaveBeenCalled();
    release?.();
    await flushPromises();
    expect(resource.load).toHaveBeenCalledOnce();
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

  /** Verifies a view replaces component-level column filtering. */
  it("uses a view with custom body slots and guarded infinite loading", async () => {
    const resource = externalResource({ rows: [{ id: 1, title: "One" }], hasMore: true });
    const wrapper = mount(UcTable, {
      props: {
        resource,
        infinite: true,
        view: { shape: { title: {} } },
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

  it("exercises table selection, row formatting, and guarded request branches", async () => {
    const resource = externalResource({
      rows: [{ id: 1, title: "One" }],
      hasMore: false,
      loading: true,
      schemaShape: {
        id: { options: {} },
        title: { options: { choices: () => ["One"], format: { kind: "unknown" } } },
      },
    });
    const wrapper = mount(UcTable, {
      props: {
        resource,
        selection: "multiple",
        selectedKeys: [1],
        rowClass: () => "selected-row",
        columns: [
          { name: "id", label: "Id", field: "id" },
          { name: "title", label: "Title", field: "title", format: () => "Formatted" },
        ],
      },
      attrs: { rowsPerPageOptions: [10, 25] },
      global: { stubs: quasarStubs },
    });
    const table = wrapper.findComponent({ name: "QTableStub" });
    expect(wrapper.find("tr").classes()).toContain("selected-row");
    expect(wrapper.text()).toContain("One");
    expect(table.props("rowsPerPageOptions")).toEqual([10, 25]);

    wrapper.findComponent({ name: "ControlStub" }).vm.$emit("update:modelValue", true);
    table.vm.$emit("request", { pagination: {} });
    table.vm.$emit("update:pagination", {});
    table.vm.$emit("scroll", { target: { scrollTop: 1, clientHeight: 1, scrollHeight: 1 } });
    await flushPromises();
    expect(resource.load).toHaveBeenCalledOnce();
    expect(resource.nextPage).not.toHaveBeenCalled();

    const rowKey = table.vm.$attrs.rowKey as (row: Readonly<Record<string, unknown>>) => unknown;
    expect(rowKey({ id: 4 })).toBe(4);
  });

  it("defaults selection off and warns once when enabled without controlled state", async () => {
    const resource = externalResource({ rows: [{ id: 1, title: "One" }] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const table = mount(UcTable, {
      props: { resource },
      global: { stubs: quasarStubs },
    });
    const resourceView = mount(UcResourceView, {
      props: { resource, autoLoad: false },
      global: { stubs: quasarStubs },
    });

    expect(table.findAllComponents({ name: "ControlStub" })).toHaveLength(0);
    expect(resourceView.findComponent(UcTable).props("selection")).toBe("none");
    expect(warn).not.toHaveBeenCalled();

    await table.setProps({ selection: "single" });
    await table.setProps({ selection: "none" });
    await table.setProps({ selection: "multiple" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("v-model:selected-keys"));
  });

  it("renders a supplied collection while retaining the resource for detail state", () => {
    const resource = externalResource({ rows: [{ id: 1, title: "Resource row" }] });
    const list = externalResource({ rows: [{ id: 2, title: "Route row" }] });
    const collection = { ...list, resource: list.definition };
    const wrapper = mount(UcResourceView, {
      props: { resource, collection, autoLoad: false, create: false },
      global: { stubs: quasarStubs },
    });

    expect(wrapper.findComponent({ name: "QTableStub" }).props("rows")).toEqual([
      { id: 2, title: "Route row" },
    ]);
  });

  it("keeps the resource header in the list pane beside a split detail aside", () => {
    const resource = externalResource({ rows: [{ id: 1, title: "One" }] });
    const wrapper = mount(UcResourceView, {
      props: {
        resource,
        title: "Tasks",
        modelValue: 1,
        mode: "split",
        autoLoad: false,
        create: false,
      },
      global: { stubs: quasarStubs },
    });

    const listPane = wrapper.find(".uc-view__body");
    const aside = wrapper.find(".uc-view__aside");
    const header = listPane.find(".uc-resource-view__header");
    expect(header.text()).toContain("Tasks");
    expect(wrapper.find(".uc-view > .uc-view__header").exists()).toBe(false);
    expect(header.element.parentElement).toBe(listPane.element);
    expect(aside.element.parentElement).toBe(listPane.element.parentElement);
  });

  it("composes explicit caption, tools, filters, and list regions in order", () => {
    const resource = externalResource({ rows: [{ id: 1, title: "One" }] });
    let toolProps: Readonly<Record<string, unknown>> | undefined;
    let filterProps: Readonly<Record<string, unknown>> | undefined;
    const wrapper = mount(UcResourceView, {
      props: { resource, title: "Fallback", autoLoad: false, create: false },
      slots: {
        caption: () => h("span", "Caption"),
        tools: (props: Readonly<Record<string, unknown>>) => {
          toolProps = props;
          return h("span", "Tools");
        },
        filters: (props: Readonly<Record<string, unknown>>) => {
          filterProps = props;
          return h("span", "Filters");
        },
        "before-list": () => h("span", "Before"),
        "list-body": () => h("span", "Body"),
        "after-list": () => h("span", "After"),
      },
      global: { stubs: quasarStubs },
    });
    const content = wrapper.text();
    expect(content.indexOf("Caption")).toBeLessThan(content.indexOf("Tools"));
    expect(content.indexOf("Tools")).toBeLessThan(content.indexOf("Filters"));
    expect(content.indexOf("Before")).toBeLessThan(content.indexOf("Body"));
    expect(content.indexOf("Body")).toBeLessThan(content.indexOf("After"));
    expect(content).not.toContain("Fallback");
    expect(toolProps?.resource).toBeDefined();
    expect(toolProps?.rows).toEqual([{ id: 1, title: "One" }]);
    expect(toolProps?.selectedKeys).toEqual([]);
    expect(toolProps?.create).toBeTypeOf("function");
    expect(toolProps?.refresh).toBeTypeOf("function");
    expect(filterProps?.resource).toBeDefined();
    expect(filterProps?.rows).toEqual([{ id: 1, title: "One" }]);

    const fallback = mount(UcResourceView, {
      props: { resource, title: "Fallback", autoLoad: false, create: false },
      global: { stubs: quasarStubs },
    });
    expect(fallback.text()).toContain("Fallback");
  });

  it("supports controlled compact list cards and custom table rows", async () => {
    const resource = externalResource({ rows: [{ id: 1, title: "One" }] });
    const list = mount(UcResourceView, {
      props: {
        resource,
        display: "list",
        autoLoad: false,
        create: false,
        selection: "multiple",
        selectedKeys: [],
      },
      slots: {
        "card-item": ({
          row,
          open,
          toggleSelected,
        }: {
          row: Readonly<Record<string, unknown>>;
          open: () => void;
          toggleSelected: () => void;
        }) => [
          h("button", { class: "card-open", onClick: open }, String(row.title)),
          h("button", { class: "card-select", onClick: toggleSelected }, "Select"),
        ],
      },
      global: { stubs: quasarStubs },
    });
    expect(list.find("[data-q-list]").exists()).toBe(true);
    await list.find(".card-select").trigger("click");
    expect(list.emitted("update:selectedKeys")?.at(-1)).toEqual([[1]]);
    await list.setProps({ selection: "single", selectedKeys: [1] });
    await list.find(".card-select").trigger("click");
    expect(list.emitted("update:selectedKeys")?.at(-1)).toEqual([[]]);
    await list.find(".card-open").trigger("click");
    expect(list.emitted("update:modelValue")?.at(-1)).toEqual([1]);

    const table = mount(UcResourceView, {
      props: { resource, autoLoad: false, create: false },
      slots: {
        "row-item": ({ row, open }: { row: Readonly<Record<string, unknown>>; open: () => void }) =>
          h("button", { class: "table-open", onClick: open }, String(row.title)),
      },
      global: { stubs: quasarStubs },
    });
    expect(table.find(".table-open").exists()).toBe(true);
    await table.find(".table-open").trigger("click");
    expect(table.emitted("update:modelValue")?.at(-1)).toEqual([1]);
  });

  it("keeps legacy list slots authoritative and warns about their replacement", () => {
    const resource = externalResource({ rows: [{ id: 1, title: "One" }] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const wrapper = mount(UcResourceView, {
      props: { resource, autoLoad: false, create: false },
      slots: {
        header: () => h("span", "Legacy caption"),
        actions: () => h("span", "Legacy tools"),
        list: () => h("span", "Legacy list"),
        "before-list": () => h("span", "Ignored before"),
      },
      global: { stubs: quasarStubs },
    });
    expect(wrapper.text()).toContain("Legacy list");
    expect(wrapper.text()).not.toContain("Ignored before");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("deprecated"));
  });

  it("accepts explicit selected-key prop and event bindings without a warning", () => {
    const resource = externalResource({ rows: [{ id: 1, title: "One" }] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const update = vi.fn();
    const table = mount(UcTable, {
      props: {
        resource,
        selection: "multiple",
        selectedKeys: [1],
        "onUpdate:selectedKeys": update,
      },
      global: { stubs: quasarStubs },
    });
    const resourceView = mount(UcResourceView, {
      props: {
        resource,
        autoLoad: false,
        selection: "single",
        selectedKeys: [1],
        "onUpdate:selectedKeys": update,
      },
      global: { stubs: quasarStubs },
    });
    table
      .findComponent({ name: "QTableStub" })
      .vm.$emit("update:selected", [{ id: 1, title: "One" }]);
    resourceView.findComponent(UcTable).vm.$emit("update:selectedKeys", [1]);
    expect(warn).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith([1]);
  });

  it("rejects table rows without a valid resource key", () => {
    const resource = externalResource({ rows: [{ title: "No key" }] });
    expect(() =>
      mount(UcTable, {
        props: { resource, selectedKeys: [1] },
        global: { stubs: quasarStubs },
      }),
    ).toThrow("does not contain a string or number key");
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

  it("renders resolved object actions and emits input-action intent without executing it", async () => {
    const resource = externalResource({ rows: [{ id: 1, title: "One" }] });
    const object = objectController({ value: { id: 1, title: "One" } });
    const executeArchive = vi.fn(async () => undefined);
    Object.assign(resource, {
      get: () => object,
      actions: () => [
        {
          name: "archive",
          target: "object",
          placement: ["aside"],
          label: "Archive",
          icon: "archive",
          disabled: false,
          requiresInput: false,
          selectedKeys: [],
          execute: executeArchive,
          operation: () => actionController(undefined),
          form: () => undefined,
        },
        {
          name: "assign",
          target: "object",
          placement: ["aside"],
          label: "Assign",
          disabled: false,
          requiresInput: true,
          selectedKeys: [],
          execute: vi.fn(),
          operation: () => actionController(undefined),
          form: () => undefined,
        },
      ],
    });
    const wrapper = mount(UcResourceView, {
      props: { resource, modelValue: 1, autoLoad: false, create: false },
      global: { stubs: quasarStubs },
    });

    expect(wrapper.text()).toContain("Archive");
    expect(wrapper.text()).toContain("Assign");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Archive")
      ?.trigger("click");
    await flushPromises();
    expect(executeArchive).toHaveBeenCalledWith(undefined);
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Assign")
      ?.trigger("click");
    expect(wrapper.emitted("object-action")?.[0]?.[0]).toMatchObject({ name: "assign" });
  });

  it("forwards resource-view table and slot workflows", async () => {
    const resource = externalResource({ rows: [{ id: 1, title: "One" }] });
    const wrapper = mount(UcResourceView, {
      props: {
        resource,
        title: "Tasks",
        autoLoad: false,
        selectedKeys: [1],
      },
      slots: {
        header: ({ rows }: { rows: readonly object[] }) => h("strong", `Rows ${rows.length}`),
        filters: () => h("span", "Filters"),
        actions: ({ selectedRows, refresh, create }: ResourceViewActionsSlot) => [
          h("span", `Selected ${selectedRows.length}`),
          h("button", { class: "slot-refresh", onClick: refresh }, "Refresh"),
          h("button", { class: "slot-create", onClick: create }, "Create"),
        ],
        "detail-actions": () => h("button", { class: "detail-action" }, "Detail action"),
      },
      global: { stubs: quasarStubs },
    });
    expect(wrapper.text()).toContain("Rows 1");
    expect(wrapper.text()).toContain("Selected 1");
    await wrapper.find(".slot-refresh").trigger("click");
    await flushPromises();
    expect(resource.load).toHaveBeenCalledOnce();

    await wrapper.find(".slot-create").trigger("click");
    expect(wrapper.emitted("create")).toHaveLength(1);

    const table = wrapper.findComponent(UcTable);
    table.vm.$emit("update:selectedKeys", [1]);
    table.vm.$emit("select", { id: 1, title: "One" });
    await nextTick();
    expect(wrapper.emitted("update:selectedKeys")?.at(-1)).toEqual([[1]]);
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([1]);
    expect(wrapper.find(".detail-action").exists()).toBe(true);
  });

  it("reports resource-view autoload and slot refresh failures", async () => {
    const failed = externalResource({ rows: [], failure: new Error("Unavailable") });
    const wrapper = mount(UcResourceView, {
      props: { resource: failed, create: false },
      slots: {
        list: ({ refresh }: { refresh: () => Promise<void> }) =>
          h("button", { class: "refresh", onClick: refresh }, "Refresh"),
      },
      global: { stubs: quasarStubs },
    });
    await flushPromises();
    expect(wrapper.emitted("failure")?.[0]?.[0]).toBeInstanceOf(Error);
    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: "negative", message: "Unavailable" }),
    );
    await wrapper.find(".refresh").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("failure")).toHaveLength(2);
  });

  it("renders resource detail loading, failure, and missing states", async () => {
    for (const state of [{ loading: true }, { error: { message: "Object unavailable" } }, {}]) {
      const resource = externalResource({ rows: [{ id: 1 }] });
      resource.get = () => objectController(state);
      const wrapper = mount(UcResourceView, {
        props: { resource, modelValue: 1, autoLoad: false, create: false },
        global: { stubs: quasarStubs },
      });
      await nextTick();
      if ("error" in state) expect(wrapper.text()).toContain("Object unavailable");
      wrapper.unmount();
    }
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
    const action = deleted.findComponent(UcAction);
    action.vm.$emit("success", 1);
    action.vm.$emit("failure", new Error("Delete failed"));
    action.vm.$emit("cancel");
    expect(deleted.emitted("success")?.[0]).toEqual([1]);
    expect(deleted.emitted("failure")?.[0]?.[0]).toBeInstanceOf(Error);
    expect(deleted.emitted("cancel")).toHaveLength(1);
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
    expect(render("date", {})).toBe("");
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
    outlined: Boolean,
    filled: Boolean,
    standout: Boolean,
    borderless: Boolean,
    dense: Boolean,
    color: String,
    bgColor: String,
    labelColor: String,
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
  setup(_props, { attrs, emit, slots }) {
    return () =>
      h(
        "form",
        {
          ...attrs,
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
    selection: String,
    pagination: Object,
    rowsPerPageOptions: Array,
  },
  emits: ["request", "update:selected", "scroll"],
  setup(props, { attrs, slots }) {
    return () =>
      h("div", { ...attrs, "data-q-table": true }, [
        ...(props.rows ?? []).map((row, index) =>
          slots.body
            ? slots.body({
                row,
                cols: (props.columns ?? []).map((column) => {
                  const value = column as {
                    name: string;
                    field: string | ((item: unknown) => unknown);
                    classes?: string;
                  };
                  return {
                    name: value.name,
                    value:
                      typeof value.field === "function"
                        ? value.field(row)
                        : (row as Readonly<Record<string, unknown>>)[value.field],
                    classes: value.classes,
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
        h(
          "table",
          h(
            "thead",
            (props.columns ?? []).map((column) => {
              const value = column as { name: string; headerClasses?: string };
              return h("th", { class: value.headerClasses }, value.name);
            }),
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
  QList: defineComponent({
    name: "QListStub",
    setup(_props, { slots }) {
      return () => h("div", { "data-q-list": true }, slots.default?.());
    },
  }),
  QItem: defineComponent({
    name: "QItemStub",
    props: { active: Boolean, clickable: Boolean },
    emits: ["click"],
    setup(props, { emit, slots }) {
      return () =>
        h(
          "button",
          { type: "button", "data-active": props.active, onClick: () => emit("click") },
          slots.default?.(),
        );
    },
  }),
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
      (_props, { attrs, slots }) =>
      () =>
        h("tr", attrs, slots.default?.()),
  }),
  QTd: defineComponent({
    name: "QTdStub",
    setup:
      (_props, { attrs, slots }) =>
      () =>
        h("td", attrs, slots.default?.()),
  }),
};

function skinPlugin(skin: UiCogsQuasarSkin) {
  return {
    install(app: App) {
      injectSkin(app, skin);
    },
  };
}

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
  readonly schemaShape?: Readonly<Record<string, unknown>>;
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
    definition: { name: "tasks", key: "id", schema: { shape: options.schemaShape ?? {} } },
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
  const Search = defineSchema({ text: fields.Str() });
  const definition = registerResource(cogs)({
    name: "tasks",
    url: "tasks/",
    schema,
    key: "id",
    queries: { search: { input: Search, path: "search/" } },
  });
  const resource = cogs.resource(definition);
  await resource.load();
  return {
    resource,
    schema,
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

function objectController(
  state: {
    readonly loading?: boolean;
    readonly error?: { readonly message?: string };
    readonly value?: Readonly<Record<string, unknown>>;
  } = {},
) {
  const store = new Store({ revision: 0 });
  return {
    key: 1,
    loading: state.loading ?? false,
    error: state.error,
    value: state.value,
    load: async () => undefined,
    refresh: async () => undefined,
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener: () => void) => store.subscribe(listener),
  };
}

interface ResourceViewActionsSlot {
  readonly selectedRows: readonly Readonly<Record<string, unknown>>[];
  readonly refresh: () => Promise<void>;
  readonly create: () => void;
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
