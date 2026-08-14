import { expectAssignable, expectError, expectType } from "tsd";
import {
  createUiCogs,
  fields,
  local,
  memoryCache,
  operation,
  responseAdapters,
  resource,
  service,
  schema,
  type Encoded,
  type PersistenceBackend,
  type FormPayload,
  type FormController,
  type FormValues,
  type Infer,
  type Input,
  type LiveSource,
  type LiveEffect,
  type UiNotification,
  type LiveStatus,
  type MultipartAdapter,
  type OperationInput,
  type OperationOutput,
  type ResourceDefinition,
  type ResponseAdapter,
  type ServiceDefinition,
} from "@uicogs/core";
import { responseAdapters as httpResponseAdapters } from "@uicogs/http";

const customResponse = responseAdapters.custom({
  name: "custom",
  decode: (response, context) => (context.kind === "entity" ? response.data : response.data),
});
expectType<ResponseAdapter>(customResponse);
expectType<ResponseAdapter>(httpResponseAdapters.vyuh());
expectType<ResponseAdapter>(httpResponseAdapters.drf());
expectType<ResponseAdapter>(httpResponseAdapters.laravel());
expectType<ResponseAdapter>(httpResponseAdapters.springData());
expectType<ResponseAdapter>(httpResponseAdapters.jsonApi({ countKey: "total" }));
expectType<ResponseAdapter>(httpResponseAdapters.graphqlConnection({ connection: "data.users" }));
expectError(httpResponseAdapters.graphqlConnection({}));

const PureUser = schema({
  id: fields.ID(),
  name: fields.Str({ required: true }),
});
const PureInput = schema({ notify: fields.Bool({ required: true }) });
const PureInputForm = PureInput.toForm();
const PureUsers = resource({
  name: "pure-users",
  url: "users/",
  schema: PureUser,
  key: "id",
  responseAdapter: customResponse,
  queries: { notified: { input: PureInput, responseAdapter: customResponse } },
  operations: {
    publish: operation.action({
      input: PureInput,
      output: PureUser,
      responseAdapter: customResponse,
    }),
  },
});
createUiCogs({ resources: [PureUsers], responseAdapter: customResponse });
const pureApi = createUiCogs({ resources: [PureUsers] });
expectType<number>(pureApi.resource(PureUsers).get(1).key);
expectType<number>(pureApi.resource("pure-users").get(1).key);
expectError(pureApi.resource("missing"));
const publishReference = PureUsers.operation("publish");
expectType<"publish">(publishReference.name);
expectAssignable<OperationInput<typeof publishReference>>({ notify: true });
expectType<Infer<typeof PureUser>>({} as OperationOutput<typeof publishReference>);
expectError(PureUsers.operation("missing"));
expectType<FormController<typeof PureInputForm>>(
  pureApi.resource(PureUsers).actionForm("publish", PureInputForm),
);

const StandardUsers = resource({
  name: "standard-users",
  url: "standard-users/",
  schema: PureUser,
  key: "id",
  operations: operation.all(),
});
expectType<"list">(StandardUsers.operation("list").name);
expectType<"retrieve">(StandardUsers.operation("retrieve").name);
expectError(StandardUsers.operation("publish"));

const PasswordLogin = schema({
  username: fields.Str({ required: true }),
  password: fields.Password({ required: true }),
});
const Session = schema({ token: fields.Str({ required: true }) });
const PasswordLoginForm = PasswordLogin.toForm();
const Authentication = service({
  name: "authentication",
  url: "auth/",
  responseAdapter: customResponse,
  actions: {
    passwordLogin: operation.action({
      input: PasswordLogin,
      output: Session,
      auth: "none",
      responseAdapter: customResponse,
    }),
  },
});
const serviceApi = createUiCogs({ services: [Authentication] });
const loginReference = Authentication.operation("passwordLogin");
void loginReference;
expectAssignable<OperationInput<typeof loginReference>>({ username: "ada", password: "secret" });
expectType<Infer<typeof Session>>({} as OperationOutput<typeof loginReference>);
expectError(Authentication.operation("missing"));
expectType<Promise<Infer<typeof Session>>>(
  serviceApi
    .service(Authentication)
    .action("passwordLogin", { username: "ada", password: "secret" }),
);
expectError(serviceApi.service(Authentication).action("passwordLogin", { username: "ada" }));
expectType<FormController<typeof PasswordLoginForm>>(
  serviceApi.service(Authentication).actionForm("passwordLogin", PasswordLoginForm),
);
expectError(serviceApi.service(Authentication).actionForm("passwordLogin", PureInput.toForm()));
expectError(pureApi.resource(PureUsers).actionForm("publish", PasswordLoginForm));
expectError(serviceApi.service(Authentication).cache);
expectAssignable<ServiceDefinition<typeof Authentication.actions, unknown>>(Authentication);

const ContextSchema = schema.withContext<{ readonly locale: string }>()({
  value: fields.Str({ required: true }),
});
expectType<string>(ContextSchema.parse({ value: "test" }).value);

const transport = { request: async () => ({ status: 200, data: undefined }) };
createUiCogs({ context: { locale: "en" }, baseUrl: "/api/" });
createUiCogs({ context: { locale: "en" }, http: { timeoutMs: 1_000 } });
expectError(createUiCogs({ context: { locale: "en" }, transport, http: { timeoutMs: 1_000 } }));
const User = schema({
  id: fields.ID({ readonly: true }),
  name: fields.Str({ required: true }),
  nickname: fields.Str(),
  label: fields.Computed({
    dependsOn: ["name"],
    get: ({ name }) => String(name),
  }),
});

expectType<number>(User.parse({ id: 1, name: "Ada" }).id);
expectType<string>(User.parse({ id: 1, name: "Ada" }).name);
expectType<string | undefined>(User.parse({ id: 1, name: "Ada" }).nickname);
expectAssignable<Input<typeof User>>({ id: 1, name: "Ada" });
expectType<Infer<typeof User>>(User.parse({ id: 1, name: "Ada" }));
expectType<Encoded<typeof User>>(User.write(User.parse({ id: 1, name: "Ada" })));
expectError(User.keep("missing"));

const Users = resource({
  name: "users",
  url: "users/",
  schema: User,
  key: "id",
});
const cogs = createUiCogs({
  resources: [Users],
  context: { locale: "en" },
  transport,
});
expectType<string>(cogs.context.value.locale);
expectType<"memory" | "loading" | "ready" | "error">(cogs.context.persistenceStatus);
cogs.context.update({ locale: "fr" });
cogs.context.set({ locale: "de" });
expectError(cogs.context.update({ auth: {} }));
expectError((cogs.context.value.locale = "fr"));
expectAssignable<
  ResourceDefinition<
    typeof User,
    number,
    Readonly<Record<never, never>>,
    Readonly<Record<never, never>>,
    Readonly<Record<never, never>>,
    unknown
  >
>(Users);
expectType<number>(cogs.resource(Users).get(1).key);

const persistenceBackend: PersistenceBackend = {
  read: async () => ({ locale: "fr" }),
  write: async () => undefined,
  remove: async () => undefined,
};
createUiCogs({ context: { locale: "en" }, persistence: { backend: persistenceBackend } });
expectError(
  createUiCogs({
    context: { locale: "en" },
    cache: memoryCache(),
    persistence: { backend: persistenceBackend },
  }),
);
createUiCogs({
  context: { locale: "en" },
  cache: memoryCache(),
  persistence: { backend: persistenceBackend, cache: false },
});

const Project = schema({
  id: fields.ID({ readonly: true }),
  title: fields.Str({ required: true }),
  metadata: fields.JSON(),
});
const Projects = resource({
  name: "projects",
  url: "projects/",
  schema: Project,
  key: "id",
});
const Member = schema({
  id: fields.ID(),
  project: fields.Ref({ resource: Projects, required: true }),
  projects: fields.RefList({ resource: Projects, required: true }),
});
expectType<Infer<typeof Project>>(
  Member.parse({ id: 1, project: { id: 2, title: "Example" }, projects: [] }).project,
);
expectType<readonly Infer<typeof Project>[]>(
  Member.parse({ id: 1, project: 2, projects: [] }).projects,
);

const UserQuery = schema({ search: fields.Str(), active: fields.Bool() });
const PublishInput = schema({ notify: fields.Bool({ required: true }) });
const ManagedUsers = resource({
  name: "managed-users",
  url: "managed-users/",
  schema: User,
  key: "id",
  queries: { search: { input: UserQuery } },
  operations: {
    publish: operation.action({
      input: PublishInput,
      output: User,
      path: "publish/",
    }),
  },
});
const managedCogs = createUiCogs({ resources: [ManagedUsers], transport });
const managed = managedCogs.resource(ManagedUsers);
expectType<Promise<readonly Readonly<Infer<typeof User>>[]>>(
  managed.query("search", { search: "Ada" }).load(),
);
expectType<Promise<Infer<typeof User>>>(managed.action("publish", { notify: true }));
expectError(managed.query("missing", {}));
expectError(managed.action("missing", {}));
expectError(managed.sort("missing"));

const UserEdit = User.keep("name", "nickname").toForm({ mode: "patch" });
expectAssignable<object>(UserEdit);
type UserEditValues = FormValues<typeof UserEdit>;
type UserEditPayload = FormPayload<typeof UserEdit>;
expectAssignable<UserEditValues>({ name: "Ada" });
expectAssignable<UserEditPayload>({ name: "Ada" });
expectError<UserEditValues>({ missing: true });

const changed = User.extend({ note: fields.Text() }).drop("nickname").partial().required();
expectType<string>(changed.parse({ id: 1, name: "Ada" }).note);
expectError(changed.keep("nickname"));

const Task = schema({
  id: fields.ID(),
  title: fields.Str({ required: true }),
});
const LocalTasks = resource({
  name: "local-tasks",
  schema: Task,
  key: "id",
  source: local({ initial: [{ id: 1, title: "Initial" }] }),
});
const localCogs = createUiCogs({ resources: [LocalTasks] });
const localTasks = localCogs.resource(LocalTasks);
expectType<Readonly<Infer<typeof Task>>>(localTasks.cache.add({ id: 2, title: "Added" }));
expectType<Readonly<Partial<Infer<typeof Task>>>>(
  localTasks.cache.upsert({ id: 2, title: "Updated" }),
);
localTasks.cache.remove(2);
expectError(localTasks.cache.remove("2"));
expectError(localTasks.cache.add({ id: 3 }));

const Members = resource({
  name: "members",
  schema: Member,
  key: "id",
  source: local(),
});
const relationCogs = createUiCogs({ resources: [Projects, Members] });
const member = relationCogs.resource(Members).get(1);
const project = member.relation("project");
expectType<Promise<void>>(project.set(1));
expectType<Promise<Readonly<Infer<typeof Project>> | undefined>>(project.load());
expectError(project.add(1));
const projects = member.relation("projects");
expectType<Promise<readonly Readonly<Infer<typeof Project>>[]>>(projects.load());
expectType<Promise<readonly Readonly<Infer<typeof Project>>[]>>(
  projects.load({ policy: "network-only" }),
);
expectType<Promise<void>>(projects.add(1));
expectType<Promise<void>>(projects.remove(1));
expectType<readonly Readonly<Infer<typeof Project>>[]>(projects.values);
expectType<readonly (string | number)[]>(projects.missingKeys);
expectError(projects.value);
expectError(member.relation("missing"));

expectType<LiveStatus>(cogs.live.status);
expectAssignable<LiveSource<{ locale: string }>>({
  open: async () => ({
    status: 204,
    frames: {
      async *[Symbol.asyncIterator]() {
        yield { kind: "retry" as const, milliseconds: 1 };
      },
    },
  }),
});
const liveEffect: LiveEffect = {
  kind: "notification",
  mutation: { action: "upsert", item: { id: "release", title: "Release ready" } },
};
void liveEffect;
expectAssignable<UiNotification>({ id: "release", title: "Release ready" });
createUiCogs({
  live: {
    sources: [],
    adapters: [{ map: () => ({ kind: "alert", alert: { message: "Saved" } }) }],
    notifications: { maximumItems: 100 },
  },
});

expectAssignable<MultipartAdapter>({
  name: "custom",
  path: (path) => path.join("."),
  parts: (part) => [{ name: part.name, value: part.value }],
});

expectError(
  createUiCogs({
    routes: [{ path: "/invalid", component: "Invalid" }],
  }),
);
