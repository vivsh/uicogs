import { describe, expect, it } from "vitest";
import type { AuthRuntimeBindings, AuthStrategyDefinition, RuntimeAuthController } from "./auth.js";
import { createUiCogs } from "./factory.js";
import { fields } from "./field.js";
import { local, operation, resource } from "./resource.js";
import { schema } from "./schema.js";
import type { TransportMiddleware } from "./transport.js";

class TestAuthController implements RuntimeAuthController<object> {
  readonly status = "anonymous";
  readonly sessionGeneration = 0;
  bindings?: AuthRuntimeBindings;

  get value(): object {
    return this.getSnapshot();
  }

  middleware(): TransportMiddleware {
    return {
      request: (request, next) => next(request),
    };
  }

  attach(bindings: AuthRuntimeBindings): void {
    this.bindings = bindings;
  }

  async initialize(): Promise<void> {}
  cacheScope(): string {
    return "anonymous";
  }
  dispose(): void {}
  getSnapshot(): object {
    return Object.freeze({});
  }
  subscribe(): () => void {
    return () => undefined;
  }
  subscribeLogout(): () => void {
    return () => undefined;
  }
}

function testAuth(
  operations: AuthStrategyDefinition["operations"],
  controller = new TestAuthController(),
): AuthStrategyDefinition<TestAuthController> {
  return Object.freeze({
    kind: "uicogs-auth-strategy" as const,
    operations,
    create: () => controller,
  });
}

describe("pure definitions and runtime instances", () => {
  it("reuses immutable definitions while keeping runtime state isolated", () => {
    const Task = schema({
      id: fields.ID(),
      title: fields.Str({ required: true }),
    });
    const Tasks = resource({
      name: "definition-tasks",
      schema: Task,
      key: "id",
      source: local(),
    });
    const first = createUiCogs({ resources: [Tasks] });
    const second = createUiCogs({ resources: [Tasks] });
    const firstTasks = first.resource(Tasks);
    const firstSidebar = first.resource("definition-tasks");
    const secondTasks = second.resource(Tasks);

    expect(firstTasks).not.toBe(firstSidebar);
    firstTasks.cache.add({ id: 1, title: "One" });
    expect(firstSidebar.get(1).value).toBe(firstTasks.get(1).value);
    expect(secondTasks.get(1).value).toBeUndefined();
    expect(Object.isFrozen(Task)).toBe(true);
    expect(Object.isFrozen(Tasks)).toBe(true);
  });

  it("binds application context without changing the schema definition", async () => {
    const Item = schema.withContext<{ readonly locale: string }>()(
      { id: fields.ID(), name: fields.Str({ required: true }) },
      {
        validate: [
          ({ context, issue }) => (context.locale === "en" ? undefined : issue([], "Wrong locale")),
        ],
      },
    );
    const Items = resource({
      name: "context-items",
      schema: Item,
      key: "id",
      source: local(),
    });
    const runtime = createUiCogs({
      resources: [Items],
      context: { locale: "fr" },
    });
    const bound = runtime.resource(Items).definition.schema;
    const value = bound.parse({ id: 1, name: "One" });

    expect((await bound.validate(value)).issues[0]?.message).toBe("Wrong locale");
    expect(Item).not.toBe(bound);
  });

  it("creates typed immutable operation references", () => {
    const Input = schema({ value: fields.Str({ required: true }) });
    const Entity = schema({ id: fields.ID(), value: fields.Str() });
    const Entities = resource({
      name: "operation-entities",
      url: "entities/",
      schema: Entity,
      key: "id",
      operations: {
        publish: operation.action({ input: Input, output: Entity }),
      },
    });

    expect(Entities.operation("publish")).toEqual({ resource: Entities, name: "publish" });
    expect(Object.isFrozen(Entities.operation("publish"))).toBe(true);
  });

  it("rejects duplicate, conflicting, and unregistered definitions", () => {
    const Entity = schema({ id: fields.ID() });
    const First = resource({
      name: "registry-entity",
      schema: Entity,
      key: "id",
      source: local(),
    });
    const Conflict = resource({
      name: "registry-entity",
      schema: Entity,
      key: "id",
      source: local(),
    });
    const Unregistered = resource({
      name: "unregistered-entity",
      schema: Entity,
      key: "id",
      source: local(),
    });
    expect(() => createUiCogs({ resources: [First, First] })).toThrow("more than once");
    expect(() => createUiCogs({ resources: [First, Conflict] })).toThrow("conflicting");
    const runtime = createUiCogs({ resources: [First] });
    expect(() => runtime.resource(Conflict)).toThrow("conflicts");
    expect(() => (runtime.resource as (value: unknown) => unknown)(Unregistered)).toThrow(
      "is not registered in this UiCogs runtime",
    );
    expect(() => runtime.resource("missing" as "registry-entity")).toThrow("not registered");
    expect(() => (runtime.resource as (value: unknown) => unknown)({})).toThrow(
      "Expected a registered resource name or definition",
    );
    expect(() => resource(undefined as never)).toThrow("Invalid resource definition");
  });

  it("validates relation targets against the complete runtime registry", () => {
    const TargetEntity = schema({ id: fields.ID() });
    const Target = resource({
      name: "relation-target",
      schema: TargetEntity,
      key: "id",
      source: local(),
    });
    const ConflictingTarget = resource({
      name: "relation-target",
      schema: TargetEntity,
      key: "id",
      source: local(),
    });
    const MissingOwner = resource({
      name: "missing-relation-owner",
      schema: schema({ id: fields.ID(), target: fields.Ref({ resource: Target }) }),
      key: "id",
      source: local(),
    });
    const ConflictingOwner = resource({
      name: "conflicting-relation-owner",
      schema: schema({ id: fields.ID(), target: fields.Ref({ resource: ConflictingTarget }) }),
      key: "id",
      source: local(),
    });

    expect(() => createUiCogs({ resources: [MissingOwner] })).toThrow(
      "targets an unregistered resource",
    );
    expect(() => createUiCogs({ resources: [Target, ConflictingOwner] })).toThrow(
      "conflicts with resource relation-target",
    );
  });

  it("validates auth operation references before attaching a controller", () => {
    const Entity = schema({ id: fields.ID() });
    const Registered = resource({
      name: "auth-registered",
      schema: Entity,
      key: "id",
      source: local(),
      operations: { login: operation.action({}) },
    });
    const Conflict = resource({
      name: "auth-registered",
      schema: Entity,
      key: "id",
      source: local(),
      operations: { login: operation.action({}) },
    });
    const Unregistered = resource({
      name: "auth-unregistered",
      schema: Entity,
      key: "id",
      source: local(),
      operations: { login: operation.action({}) },
    });

    expect(() =>
      createUiCogs({
        resources: [Registered],
        auth: testAuth([Unregistered.operation("login")]),
      }),
    ).toThrow("uses an unregistered resource");
    expect(() =>
      createUiCogs({
        resources: [Registered],
        auth: testAuth([Conflict.operation("login")]),
      }),
    ).toThrow("conflicts with the registered resource");
    expect(() =>
      createUiCogs({
        resources: [Registered],
        auth: testAuth([Registered.operation("login"), Registered.operation("login")]),
      }),
    ).toThrow("is bound more than once");
  });

  it("restricts auth execution to operation references in the runtime registry", async () => {
    const Entity = schema({ id: fields.ID() });
    const Registered = resource({
      name: "auth-execution-registered",
      schema: Entity,
      key: "id",
      source: local(),
      operations: { login: operation.action({ local: () => undefined }) },
    });
    const Unregistered = resource({
      name: "auth-execution-unregistered",
      schema: Entity,
      key: "id",
      source: local(),
      operations: { login: operation.action({ local: () => undefined }) },
    });
    const controller = new TestAuthController();
    const runtime = createUiCogs({
      resources: [Registered],
      auth: testAuth([Registered.operation("login")], controller),
    });

    await expect(
      controller.bindings?.execute(
        Unregistered.operation("login"),
        undefined,
        "establish",
        new AbortController().signal,
      ),
    ).rejects.toThrow("is not registered");
    runtime.dispose();
    runtime.dispose();
  });
});
