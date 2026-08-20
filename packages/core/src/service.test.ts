import { describe, expect, it } from "vitest";
import { createUiCogs } from "./factory.js";
import { fields } from "./field.js";
import { operation, resource, service } from "./resource.js";
import { schema } from "./schema.js";
import type { TransportRequest } from "./transport.js";

describe("services", () => {
  it("executes stateless actions and binds action forms", async () => {
    const requests: TransportRequest[] = [];
    const PasswordLogin = schema({
      username: fields.Str({ required: true }),
      password: fields.Password({ required: true }),
    });
    const Session = schema({ token: fields.Str({ required: true }) });
    const Authentication = service({
      name: "authentication",
      url: "auth/",
      actions: {
        passwordLogin: operation.action({
          path: "login/",
          input: PasswordLogin,
          output: Session,
          auth: "none",
        }),
      },
    });
    const cogs = createUiCogs({
      services: [Authentication],
      transport: {
        request: async (request) => {
          requests.push(request);
          return { status: 200, data: { token: "session-token" } };
        },
      },
    });

    const authentication = cogs.service(Authentication);
    await expect(
      authentication.action("passwordLogin", { username: "ada", password: "secret" }),
    ).resolves.toEqual({
      token: "session-token",
    });
    expect(requests[0]).toMatchObject({
      method: "POST",
      url: "auth/login/",
      body: { username: "ada", password: "secret" },
      authentication: "none",
    });

    const form = authentication.actionForm("passwordLogin", PasswordLogin.toForm());
    form.set("username", "grace");
    form.set("password", "secret");
    await expect(form.submit()).resolves.toMatchObject({
      success: true,
      value: { token: "session-token" },
    });
    expect(requests[1]?.body).toEqual({ username: "grace", password: "secret" });
  });

  it("keeps services out of the resource cache and rejects duplicate names", () => {
    const Payload = schema({ value: fields.Str({ required: true }) });
    const First = service({
      name: "commands",
      url: "commands/",
      actions: { run: operation.action({ input: Payload }) },
    });
    const Second = service({
      name: "commands",
      url: "other/",
      actions: { run: operation.action({ input: Payload }) },
    });
    expect(() => createUiCogs({ services: [First, Second] })).toThrow("already registered");
    const cogs = createUiCogs({ services: [First] });
    expect("cache" in cogs.service(First)).toBe(false);
    expect(() => cogs.resource("commands" as never)).toThrow("not registered");
  });

  it("does not add a trailing slash when an action targets its service URL", async () => {
    const requests: TransportRequest[] = [];
    const Session = service({
      name: "session",
      url: "session",
      actions: { current: operation.action({ path: "" }) },
    });
    const cogs = createUiCogs({
      baseUrl: "https://api.example.test/v1",
      services: [Session],
      transport: {
        request: async (request) => {
          requests.push(request);
          return { status: 200, data: undefined };
        },
      },
    });

    await cogs.service(Session).action("current", undefined);

    expect(requests[0]?.url).toBe("https://api.example.test/v1/session");
  });

  it("binds a resource action form without changing its create form shortcut", async () => {
    const User = schema({ id: fields.ID(), email: fields.Email({ required: true }) });
    const Invite = schema({ email: fields.Email({ required: true }) });
    const Users = resource({
      name: "users",
      url: "users/",
      schema: User,
      key: "id",
      actions: { invite: operation.action({ input: Invite }) },
    });
    const cogs = createUiCogs({
      resources: [Users],
      transport: { request: async () => ({ status: 200, data: undefined }) },
    });
    const form = cogs.resource(Users).actionForm("invite", Invite.toForm());
    form.set("email", "invitee@example.test");
    await expect(form.submit()).resolves.toMatchObject({ success: true });
    expect(cogs.resource(Users).form(User.toForm())).toBeDefined();
  });
});
