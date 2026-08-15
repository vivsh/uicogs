import { computed, createApp, defineComponent, h, ref } from "vue";
import { QBtn, QHeader, QLayout, QPageContainer, QToolbar, QToolbarTitle, Quasar } from "quasar";
import "quasar/dist/quasar.css";
import "@quasar/extras/material-icons/material-icons.css";
import iconSet from "quasar/icon-set/svg-material-icons.js";
import {
  createUiCogs,
  createFormController,
  editor,
  fields,
  format,
  local,
  operation,
  pagination,
  resource,
  schema,
  type Transport,
} from "@uicogs/core";
import { sse } from "@uicogs/http";
import { storage } from "@uicogs/storage";
import { UcAction, UcDelete, UcFilter, UcResourceView, UcSubmit } from "@uicogs/quasar";
import { UcEChart, chart, useUcChart } from "@uicogs/echarts";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import "./workflow.css";

echarts.use([BarChart, GridComponent, CanvasRenderer]);

interface ExampleContext {
  readonly locale: string;
  readonly timeZone: string;
}

interface TaskRecord {
  readonly id: number;
  readonly title: string;
  readonly status: "open" | "done";
  readonly project: Readonly<{ id: number; name: string }>;
  readonly attachment?: unknown;
}

let records: TaskRecord[] = [
  { id: 1, title: "Prepare brief", status: "open", project: { id: 1, name: "Alpha" } },
  { id: 2, title: "Review draft", status: "open", project: { id: 1, name: "Alpha" } },
  { id: 3, title: "Publish notes", status: "done", project: { id: 2, name: "Beta" } },
  { id: 4, title: "Archive files", status: "open", project: { id: 2, name: "Beta" } },
];

const transport: Transport = {
  capabilities: { uploadProgress: "determinate" },
  async request(request) {
    await delay(60);
    if (request.signal.aborted) throw new DOMException("Cancelled", "AbortError");
    request.onUploadProgress?.({ loaded: 1, total: 2, fraction: 0.5, lengthComputable: true });

    const key = resourceKey(request.url);
    if (request.method === "GET" && request.url.endsWith("remote-memberships/"))
      return {
        status: 200,
        data: [
          { id: 1, team: 1, person: 2, position: 2 },
          { id: 2, team: 1, person: 1, position: 1 },
        ],
      };
    if (request.method === "GET" && request.url.endsWith("remote-people/")) {
      const requested = Array.isArray(request.query?.id)
        ? request.query.id.map(Number)
        : [Number(request.query?.id)];
      return {
        status: 200,
        data: [
          { id: 2, name: "Grace" },
          { id: 1, name: "Ada" },
        ].filter((person) => requested.includes(person.id)),
      };
    }
    if (request.method === "GET" && key === undefined) {
      const search = String(request.query?.search ?? "").toLowerCase();
      const page = Number(request.query?.page ?? 1);
      const size = Number(request.query?.page_size ?? 2);
      const filtered = records.filter((record) => record.title.toLowerCase().includes(search));
      const start = Math.max(0, page - 1) * size;
      return {
        status: 200,
        data: {
          count: filtered.length,
          next: start + size < filtered.length ? page + 1 : null,
          previous: page > 1 ? page - 1 : null,
          results: filtered.slice(start, start + size),
        },
      };
    }
    if (request.method === "GET" && key !== undefined)
      return { status: 200, data: records.find((record) => record.id === key) };

    if (request.url.endsWith("complete/bulk/")) {
      const body = recordValue(request.body);
      const keys = Array.isArray(body.keys)
        ? body.keys.filter((value): value is number => typeof value === "number")
        : [];
      records = records.map((record) =>
        keys.includes(record.id) ? { ...record, status: "done" } : record,
      );
      return { status: 200, data: records.filter((record) => keys.includes(record.id)) };
    }

    if (request.method === "POST" && key === undefined) {
      const body = recordValue(request.body);
      const created: TaskRecord = {
        id: Math.max(...records.map((record) => record.id)) + 1,
        title: String(body.title),
        status: body.status === "done" ? "done" : "open",
        project: { id: 1, name: "Alpha" },
        ...(body.attachment !== undefined ? { attachment: body.attachment } : {}),
      };
      records = [...records, created];
      request.onUploadProgress?.({ loaded: 2, total: 2, fraction: 1, lengthComputable: true });
      return { status: 201, data: created };
    }
    if ((request.method === "PATCH" || request.method === "PUT") && key !== undefined) {
      const body = recordValue(request.body);
      records = records.map((record) =>
        record.id === key
          ? {
              ...record,
              ...(typeof body.title === "string" ? { title: body.title } : {}),
              ...(body.status === "open" || body.status === "done" ? { status: body.status } : {}),
              ...(body.attachment !== undefined ? { attachment: body.attachment } : {}),
            }
          : record,
      );
      return { status: 200, data: records.find((record) => record.id === key) };
    }
    if (request.method === "DELETE" && key !== undefined) {
      records = records.filter((record) => record.id !== key);
      return { status: 204, data: undefined };
    }
    return { status: 404, data: { detail: "Not found" } };
  },
  async openStream(request) {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      signal: request.signal,
    });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: response.body ? responseBytes(response.body) : emptyResponseBytes(),
    };
  },
};

const LiveItem = schema({
  id: fields.ID(),
  title: fields.Str({ required: true }),
});
const LiveItems = resource({
  name: "live-items",
  url: "live-items/",
  schema: LiveItem,
  key: "id",
});
const Project = schema({
  id: fields.ID(),
  name: fields.Str({ required: true }),
});
const Projects = resource({
  name: "projects",
  url: "projects/",
  schema: Project,
  key: "id",
});
const Task = schema({
  id: fields.ID(),
  title: fields.Text({
    required: true,
    label: "Task title",
    editor: editor.Textarea({ autogrow: true }),
    validate: [({ value }) => value.trim().length >= 3 || "Enter at least three characters"],
  }),
  status: fields.Enum(["open", "done"] as const, {
    required: true,
    default: "open",
    editor: editor.Select(),
    format: format.Choice(),
  }),
  project: fields.Ref({ resource: Projects, required: true }),
  attachment: fields.File({ label: "Attachment" }),
});
const BulkStatus = schema({ status: fields.Enum(["open", "done"] as const) });
const TaskFilters = schema({
  search: fields.Str({
    label: "Search tasks",
    layout: { filter: { xs: 12, md: 5 } },
  }),
});
const TaskCreate = Task.drop("id", "project").toForm({ mode: "create", encoding: "auto" });
const TaskEdit = Task.keep("title", "status", "attachment").toForm({
  mode: "patch",
  encoding: "auto",
});
const Tasks = resource({
  name: "tasks",
  url: "tasks/",
  schema: Task,
  key: "id",
  operations: {
    list: operation.list({ pagination: pagination.page() }),
    retrieve: operation.retrieve(),
    create: operation.create({ encoding: "auto" }),
    update: operation.patch({ encoding: "auto" }),
    remove: operation.remove(),
    complete: operation.bulk({
      input: BulkStatus,
      output: Task,
      bulk: { path: "complete/bulk/" },
    }),
  },
});

const LocalTask = schema({
  id: fields.ID(),
  title: fields.Str({ required: true }),
});
const LocalTasks = resource({
  name: "local-workflow-tasks",
  schema: LocalTask,
  key: "id",
  source: local(),
});
const LocalTaskBars = chart.collection(LocalTask, (tasks) => ({
  xAxis: { type: "category", data: tasks.map((task) => task.title) },
  yAxis: { type: "value" },
  series: [{ type: "bar", data: tasks.map((task) => task.title.length) }],
}));
const Person = schema({
  id: fields.ID(),
  name: fields.Str({ required: true }),
});
const People = resource({
  name: "workflow-people",
  schema: Person,
  key: "id",
  source: local({
    initial: [
      { id: 1, name: "Ada" },
      { id: 2, name: "Grace" },
    ],
  }),
});
const Membership = schema({
  id: fields.ID(),
  team: fields.ID(),
  person: fields.ID(),
  position: fields.Int(),
});
const Memberships = resource({
  name: "workflow-memberships",
  schema: Membership,
  key: "id",
  source: local({
    initial: [{ id: 1, team: 1, person: 2, position: 1 }],
    generateKey: ({ existing }) => Math.max(0, ...existing.map(Number)) + 1,
  }),
});
const Team = schema({
  id: fields.ID(),
  members: fields.RefList({
    resource: People,
    through: {
      resource: Memberships,
      source: "team",
      target: "person",
      orderBy: "position",
    },
  }),
});
const Teams = resource({
  name: "workflow-teams",
  schema: Team,
  key: "id",
  source: local({ initial: [{ id: 1, members: [] }] }),
});

const RemotePerson = schema({
  id: fields.ID(),
  name: fields.Str({ required: true }),
});
const RemotePeople = resource({
  name: "remote-people",
  url: "remote-people/",
  schema: RemotePerson,
  key: "id",
});
const RemoteMembership = schema({
  id: fields.ID(),
  team: fields.ID(),
  person: fields.ID(),
  position: fields.Int(),
});
const RemoteMemberships = resource({
  name: "remote-memberships",
  url: "remote-memberships/",
  schema: RemoteMembership,
  key: "id",
});
const RemoteTeam = schema({
  id: fields.ID(),
  members: fields.RefList({
    resource: RemotePeople,
    through: {
      resource: RemoteMemberships,
      source: "team",
      target: "person",
      orderBy: "position",
    },
  }),
});
const RemoteTeams = resource({
  name: "remote-teams",
  schema: RemoteTeam,
  key: "id",
  source: local({ initial: [{ id: 1, members: [] }] }),
});

const cogs = createUiCogs<ExampleContext>({
  resources: [
    LiveItems,
    Projects,
    Tasks,
    LocalTasks,
    People,
    Teams,
    Memberships,
    RemotePeople,
    RemoteTeams,
    RemoteMemberships,
  ],
  context: { locale: "en", timeZone: "UTC" },
  persistence: {
    backend: storage.session({ namespace: "uicogs.workflow" }),
  },
  transport,
  baseUrl: "/api/",
  relationDefaults: {
    byKeys: { parameter: "id", encoding: "repeat" },
  },
  live: sse({
    url: "events/",
    retry: { initialMs: 20, maximumMs: 100, jitter: 0 },
  }),
});

const liveItems = cogs.resource(LiveItems);
liveItems.cache.add({ id: 2, title: "To delete" });

const app = defineComponent({
  name: "WorkflowExample",
  setup() {
    const tasks = cogs.resource(Tasks).page(1, 2);
    const activeKey = ref<number>();
    const selectedKeys = ref<readonly number[]>([]);
    const lastEvent = ref("Ready");
    const localTasks = cogs.resource(LocalTasks);
    const localTaskChart = useUcChart(LocalTaskBars, localTasks);
    const teamMembers = cogs.resource(Teams).get(1).relation("members");
    void teamMembers.load();
    const remoteTeamMembers = cogs.resource(RemoteTeams).get(1).relation("members");
    void remoteTeamMembers.load();
    const activeProject = computed(() => {
      if (activeKey.value === undefined) return "No active relation";
      const value = tasks.get(activeKey.value).value;
      return value ? `Project: ${value.project.name}` : "Loading relation";
    });
    const filterForm = createFormController(
      TaskFilters.toForm(),
      { search: "" },
      async (values) => {
        const search = typeof values.search === "string" ? values.search : "";
        tasks.filter({ search }, { merge: false }).page(1, 2);
        await tasks.load({ policy: "network-only" });
        lastEvent.value = `Filtered: ${search || "all"}`;
        return {};
      },
    );
    const completeSelected = async (): Promise<void> => {
      await tasks.bulk.action("complete", selectedKeys.value, { status: "done" });
      await tasks.refresh();
      lastEvent.value = `Completed ${selectedKeys.value.length} task(s)`;
    };
    const removeActive = async (): Promise<void> => {
      if (activeKey.value === undefined) return;
      await tasks.remove(activeKey.value);
      activeKey.value = undefined;
      await tasks.refresh();
      lastEvent.value = "Task deleted";
    };
    const addLocalTask = (): void => {
      localTasks.cache.add({ id: 1, title: "Cached locally" });
    };
    const updateLocalTask = (): void => {
      localTasks.cache.upsert({ id: 1, title: "Updated locally" });
    };
    const addRelationMember = async (): Promise<void> => {
      await teamMembers.add(1, { position: 2 });
    };
    const setRelationMembers = async (): Promise<void> => {
      await teamMembers.set([1]);
    };
    const clearRelationMembers = async (): Promise<void> => {
      await teamMembers.clear();
    };

    return () =>
      h(QLayout, { view: "hHh lpR fFf" }, () => [
        h(QHeader, { elevated: true }, () =>
          h(QToolbar, () => [h(QToolbarTitle, () => "UiCogs Workflow")]),
        ),
        h(QPageContainer, () =>
          h(
            UcResourceView,
            {
              resource: tasks,
              title: "Tasks",
              modelValue: activeKey.value,
              selectedKeys: selectedKeys.value,
              selection: "multiple",
              createForm: TaskCreate,
              editForm: TaskEdit,
              create: false,
              mode: "auto",
              "onUpdate:modelValue": (key: string | number | undefined) => {
                activeKey.value = typeof key === "number" ? key : undefined;
              },
              "onUpdate:selectedKeys": (keys: readonly (string | number)[]) => {
                selectedKeys.value = keys.filter((key): key is number => typeof key === "number");
              },
              onLoaded: () => {
                lastEvent.value = "Loaded";
              },
            },
            {
              filters: () =>
                h("section", { "data-testid": "generated-filter" }, [
                  h(
                    UcFilter,
                    { form: filterForm },
                    { actions: () => h(UcSubmit, { label: "Apply filter" }) },
                  ),
                ]),
              actions: ({ create }: { readonly create: () => void }) =>
                h("div", { class: "workflow-actions" }, [
                  h(QBtn, { label: "Create task", icon: "add", color: "primary", onClick: create }),
                  h(UcAction, {
                    label: "Complete selected",
                    action: completeSelected,
                    disable: selectedKeys.value.length === 0,
                  }),
                ]),
              "detail-actions": () =>
                h(UcDelete, {
                  action: removeActive,
                  confirmMessage: "",
                  onSuccess: () => undefined,
                }),
              "after-list": () =>
                h("div", { class: "workflow-status", "data-testid": "workflow-status" }, [
                  h("span", activeProject.value),
                  h("span", lastEvent.value),
                  h("span", `Rows: ${tasks.all().length}`),
                  h("section", { "aria-label": "Local resource workflow" }, [
                    h(QBtn, { label: "Add local task", onClick: addLocalTask }),
                    h(QBtn, { label: "Update local task", onClick: updateLocalTask }),
                    h(
                      "span",
                      { "data-testid": "local-values" },
                      localTasks
                        .all()
                        .map((task) => task.title)
                        .join(","),
                    ),
                    h(UcEChart, {
                      chart: localTaskChart,
                      engine: echarts,
                      autoresize: false,
                      "data-testid": "local-task-chart",
                      style: "height: 220px; width: 360px",
                    }),
                  ]),
                  h("section", { "aria-label": "Context workflow" }, [
                    h(QBtn, {
                      label: "Change locale",
                      onClick: () => cogs.context.update({ locale: "fr" }),
                    }),
                    h("span", { "data-testid": "context-locale" }, cogs.context.value.locale),
                  ]),
                  h("section", { "aria-label": "Relation workflow" }, [
                    h(QBtn, { label: "Add relation member", onClick: addRelationMember }),
                    h(QBtn, { label: "Set relation members", onClick: setRelationMembers }),
                    h(QBtn, { label: "Clear relation members", onClick: clearRelationMembers }),
                    h(
                      "span",
                      { "data-testid": "relation-values" },
                      teamMembers.values.map((person) => person.name).join(","),
                    ),
                    h(
                      "span",
                      { "data-testid": "relation-entries" },
                      teamMembers.entries.map((entry) => String(entry.position)).join(","),
                    ),
                  ]),
                  h("section", { "aria-label": "Live workflow" }, [
                    h("span", { "data-testid": "live-status" }, cogs.live.status),
                    h("span", { "data-testid": "live-event-id" }, cogs.live.lastEventId ?? ""),
                    h(
                      "span",
                      { "data-testid": "live-values" },
                      liveItems
                        .all()
                        .map((item) => item.title)
                        .join(","),
                    ),
                    h(QBtn, { label: "Dispose live", onClick: () => cogs.dispose() }),
                  ]),
                  h("section", { "aria-label": "Bulk relation workflow" }, [
                    h(
                      "span",
                      { "data-testid": "bulk-relation-values" },
                      remoteTeamMembers.values.map((person) => person.name).join(","),
                    ),
                  ]),
                ]),
            },
          ),
        ),
      ]);
  },
});

createApp(app).use(Quasar, { iconSet, plugins: {} }).mount("#app");

function resourceKey(url: string): number | undefined {
  const match = /\/tasks\/(\d+)\/$/.exec(url);
  return match ? Number(match[1]) : undefined;
}

async function* responseBytes(stream: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      yield result.value;
    }
  } finally {
    reader.releaseLock();
  }
}

function emptyResponseBytes(): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]: () => ({
      next: async () => ({ done: true, value: undefined }),
    }),
  };
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
