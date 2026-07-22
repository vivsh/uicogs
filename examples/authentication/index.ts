import { cookieAuth, jwtAuth, memoryAuthStorage } from "@uicogs/auth";
import { createUiCogs, fields, operation, resource, schema } from "@uicogs/core";

export const User = schema({
  id: fields.ID(),
  name: fields.Str({ required: true }),
});

export const Credentials = schema({
  email: fields.Email({ required: true }),
  password: fields.Password({ required: true }),
});

export const Tokens = schema({
  access: fields.Str({ required: true }),
  refresh: fields.Str(),
});

export const Claims = schema({
  sub: fields.Str({ required: true }),
  tenant: fields.Str({ required: true }),
  permissions: fields.StrList({ required: true }),
  exp: fields.Int(),
});

export const Users = resource({
  name: "users",
  url: "users/",
  schema: User,
  key: "id",
  operations: {
    current: operation.retrieve({ path: "current/", output: User }),
  },
});

export const Sessions = resource({
  name: "sessions",
  url: "sessions/",
  schema: User,
  key: "id",
  operations: {
    login: operation.action({ path: "login/", input: Credentials, output: Tokens }),
    refresh: operation.action({
      path: "refresh/",
      input: schema({ refresh: fields.Str({ required: true }) }),
      output: Tokens,
    }),
    logout: operation.action({ path: "logout/" }),
  },
});

export const CookieSessions = resource({
  name: "cookie-sessions",
  url: "sessions/",
  schema: User,
  key: "id",
  operations: {
    login: operation.action({ path: "login/", input: Credentials }),
    logout: operation.action({ path: "logout/" }),
  },
});

export const jwt = jwtAuth({
  claims: Claims,
  login: Sessions.operation("login"),
  refresh: Sessions.operation("refresh"),
  logout: Sessions.operation("logout"),
  currentUser: Users.operation("current"),
  storage: memoryAuthStorage(),
  state: () => ({ selectedProject: undefined as number | undefined }),
  permissions: ({ claims }) => claims.permissions,
  cacheScope: ({ claims }) => ({ subject: claims.sub, tenant: claims.tenant }),
});

export const jwtApi = createUiCogs({
  baseUrl: "/api/",
  resources: [Users, Sessions],
  auth: jwt,
  context: { locale: "en" },
});

export const cookie = cookieAuth({
  login: CookieSessions.operation("login"),
  logout: CookieSessions.operation("logout"),
  session: Users.operation("current"),
  credentials: "same-origin",
  csrf: {
    header: "X-CSRF-Token",
    token: () => undefined,
  },
  state: () => ({ selectedProject: undefined as number | undefined }),
  subject: ({ user }) => user.id,
  cacheScope: ({ user }) => ({ subject: user.id }),
});

export const cookieApi = createUiCogs({
  baseUrl: "/api/",
  resources: [Users, CookieSessions],
  auth: cookie,
  context: { locale: "en" },
});
