import { defineSchema, registerResource } from "./test-utils.js";

import { describe, expect, it } from "vitest";
import { createUiCogs } from "./factory.js";
import { fields } from "./field.js";
import { CacheConflictError } from "./resource.js";
import type { Transport, TransportRequest } from "./transport.js";

class DeferredTransport implements Transport {
  requests: TransportRequest[] = [];
  resolve?: (value: { status: number; data: unknown }) => void;

  request(request: TransportRequest): Promise<{ status: number; data: unknown }> {
    this.requests.push(request);
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }
}

describe("resource instances", () => {
  it("keeps controller state local while sharing data and requests", async () => {
    const transport = new DeferredTransport();
    const cogs = createUiCogs({ context: undefined, transport });
    const comment = defineSchema({
      id: fields.ID(),
      text: fields.Str({ required: true }),
    });
    registerResource(cogs)({
      name: "comments",
      url: "comments/",
      schema: comment,
      key: "id",
    });

    const page = cogs.resource("comments");
    const sidebar = cogs.resource("comments");
    const pageComment = page.get(10);
    const sidebarComment = sidebar.get(10);

    expect(page).not.toBe(sidebar);
    expect(pageComment).not.toBe(sidebarComment);

    const first = pageComment.load();
    const second = sidebarComment.load();
    expect(transport.requests).toHaveLength(1);
    expect(pageComment.loading).toBe(true);
    expect(sidebarComment.loading).toBe(true);

    transport.resolve?.({ status: 200, data: { id: 10, text: "Shared" } });
    await Promise.all([first, second]);
    expect(pageComment.value).toBe(sidebarComment.value);
    expect(pageComment.value).toEqual({ id: 10, text: "Shared" });
  });

  it("keeps filters and collection loading independent", () => {
    const transport: Transport = {
      request: async () => ({ status: 200, data: [] }),
    };
    const cogs = createUiCogs({ context: undefined, transport });
    const comment = defineSchema({
      id: fields.ID(),
      text: fields.Str({ required: true }),
    });
    registerResource(cogs)({
      name: "comments",
      url: "comments/",
      schema: comment,
      key: "id",
    });
    const page = cogs.resource("comments").filter({ project: 1 });
    const sidebar = cogs.resource("comments").filter({ project: 2 });
    expect(page).not.toBe(sidebar);
    expect(page.loading).toBe(false);
    expect(sidebar.loading).toBe(false);
  });

  it("invalidates cached collections after a mutation", async () => {
    const transport: Transport = {
      request: async (request) => ({
        status: 200,
        data: request.method === "GET" ? [{ id: 1, text: "Existing" }] : { id: 2, text: "Created" },
      }),
    };
    const cogs = createUiCogs({ context: undefined, transport });
    const comment = defineSchema({
      id: fields.ID(),
      text: fields.Str({ required: true }),
    });
    const Comments = registerResource(cogs)({
      name: "comments",
      url: "comments/",
      schema: comment,
      key: "id",
    });
    const collection = cogs.resource(Comments);
    await collection.load();
    expect(collection.all()).toHaveLength(1);

    await collection.create({ text: "Created" });
    expect(collection.all()).toEqual([]);
    expect(collection.stale).toBe(true);
  });

  it("runs pagination-independent bulk actions", async () => {
    let body: unknown;
    const transport: Transport = {
      request: async (request) => {
        body = request.body;
        return {
          status: 200,
          data: [
            { id: 1, text: "Archived one" },
            { id: 2, text: "Archived two" },
          ],
        };
      },
    };
    const cogs = createUiCogs({ context: undefined, transport });
    const comment = defineSchema({
      id: fields.ID(),
      text: fields.Str({ required: true }),
    });
    const Comments = registerResource(cogs)({
      name: "comments",
      url: "comments/",
      schema: comment,
      key: "id",
      actions: {
        archive: {
          input: defineSchema({ reason: fields.Str({ required: true }) }),
          invalidate: "collections",
          bulk: { path: "archive/bulk/" },
        },
      },
    });

    const result = await cogs.resource(Comments).bulk.action("archive", [1, 2], {
      reason: "Completed",
    });
    expect(body).toEqual({ keys: [1, 2], input: { reason: "Completed" } });
    expect(result.succeeded).toEqual([1, 2]);
    expect(result.values.map((value) => value.id)).toEqual([1, 2]);
  });

  it("rebinds getter-driven objects when their key changes", async () => {
    const transport: Transport = {
      request: async (request) => {
        const id = Number(request.url.match(/(\d+)\/$/)?.[1]);
        return { status: 200, data: { id, text: `Comment ${id}` } };
      },
    };
    const cogs = createUiCogs({ context: undefined, transport });
    const comment = defineSchema({
      id: fields.ID(),
      text: fields.Str({ required: true }),
    });
    const Comments = registerResource(cogs)({
      name: "comments",
      url: "comments/",
      schema: comment,
      key: "id",
    });
    let key = 1;
    const object = cogs.resource(Comments).get(() => key);
    await object.load();
    expect(object.value?.id).toBe(1);

    key = 2;
    expect(object.key).toBe(2);
    expect(object.value).toBeUndefined();
    await object.load();
    expect(object.value?.id).toBe(2);
  });

  it("can load again after local cancellation", async () => {
    let requests = 0;
    const transport: Transport = {
      request: (request) => {
        requests += 1;
        if (requests > 1)
          return Promise.resolve({
            status: 200,
            data: { id: 1, text: "Recovered" },
          });
        return new Promise((resolve, reject) => {
          request.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
          void resolve;
        });
      },
    };
    const cogs = createUiCogs({ context: undefined, transport });
    const comment = defineSchema({
      id: fields.ID(),
      text: fields.Str({ required: true }),
    });
    const Comments = registerResource(cogs)({
      name: "comments",
      url: "comments/",
      schema: comment,
      key: "id",
    });
    const object = cogs.resource(Comments).get(1);
    const first = object.load();
    object.cancel();
    await expect(first).rejects.toHaveProperty("name", "AbortError");

    await object.load();
    expect(object.value?.text).toBe("Recovered");
  });
});

describe("local resources and cache facade", () => {
  it("supports local CRUD, generated keys, filtering, sorting, and pagination", async () => {
    const cogs = createUiCogs({ context: undefined });
    const task = defineSchema({
      id: fields.ID(),
      title: fields.Str({ filter: cogs.filter.Contains(), sort: "title" }),
      priority: fields.Int(),
    });
    const Tasks = registerResource(cogs)({
      name: "local-tasks",
      schema: task,
      key: "id",
      source: cogs.local({
        initial: [
          { id: 1, title: "Write tests", priority: 2 },
          { id: 2, title: "Review code", priority: 1 },
        ],
        generateKey: ({ existing }) => Math.max(0, ...existing.map(Number)) + 1,
      }),
    });
    const tasks = cogs.resource(Tasks);

    await tasks.load();
    expect(tasks.all().map((value) => value.id)).toEqual([1, 2]);
    const created = await tasks.create({ title: "Ship release", priority: 3 });
    expect(created?.id).toBe(3);
    await tasks.update(3, { title: "Ship package" });
    expect(tasks.get(3).value?.title).toBe("Ship package");

    tasks.filter({ title: "write" }).sort("title").page(1, 1);
    expect(tasks.all().map((value) => value.id)).toEqual([1]);
    await tasks.remove(1);
    expect(tasks.all()).toEqual([]);
  });

  it("reacts across resource instances after direct cache writes", () => {
    const cogs = createUiCogs({ context: undefined });
    const task = defineSchema({ id: fields.ID(), title: fields.Str() });
    const Tasks = registerResource(cogs)({
      name: "selected-tasks",
      schema: task,
      key: "id",
      source: cogs.local(),
    });
    const page = cogs.resource(Tasks);
    const sidebar = cogs.resource(Tasks);
    const pageObject = page.get(4);
    const sidebarObject = sidebar.get(4);
    let pageChanges = 0;
    let sidebarChanges = 0;
    page.subscribe(() => pageChanges++);
    sidebar.subscribe(() => sidebarChanges++);

    const inserted = page.cache.add({ id: 4, title: "Shared task" });
    expect(page.all()).toEqual([inserted]);
    expect(sidebar.all()).toEqual([inserted]);
    expect(pageObject.value).toBe(inserted);
    expect(sidebarObject.value).toBe(inserted);
    expect(pageChanges).toBeGreaterThan(0);
    expect(sidebarChanges).toBeGreaterThan(0);

    const updated = sidebar.cache.upsert({ id: 4, title: "Updated task" });
    expect(pageObject.value).toBe(updated);
    expect(sidebarObject.value).toBe(updated);
    expect(() => page.cache.add({ id: 4, title: "Duplicate" })).toThrow(CacheConflictError);

    sidebar.cache.remove(4);
    expect(page.all()).toEqual([]);
    expect(sidebarObject.value).toBeUndefined();
  });

  it("replaces the local master collection and rejects duplicate creates", async () => {
    const cogs = createUiCogs({ context: undefined });
    const task = defineSchema({ id: fields.ID(), title: fields.Str() });
    const Tasks = registerResource(cogs)({
      name: "replacement-tasks",
      schema: task,
      key: "id",
      source: cogs.local({ initial: [{ id: 1, title: "Old" }] }),
    });
    const first = cogs.resource(Tasks);
    const second = cogs.resource(Tasks);

    first.cache.replaceAll([
      { id: 2, title: "First" },
      { id: 3, title: "Second" },
    ]);
    expect(second.all().map((value) => value.id)).toEqual([2, 3]);
    await expect(first.create({ id: 2, title: "Duplicate" })).rejects.toBeInstanceOf(
      CacheConflictError,
    );
  });

  it("evaluates local filter and sorter descriptors", async () => {
    const cogs = createUiCogs({ context: undefined });
    const item = defineSchema({
      id: fields.ID(),
      title: fields.Str({
        filter: cogs.filter.Contains({ caseSensitive: true }),
        sort: cogs.sort.Key("metadata.rank"),
      }),
      category: fields.Str({ filter: cogs.filter.Exact() }),
      score: fields.Int({ filter: cogs.filter.Range(), sort: "score" }),
      parity: fields.Int({
        filter: cogs.filter.Custom({
          predicate: (value, expected) => Number(value) % 2 === Number(expected),
        }),
        sort: cogs.sort.Custom({ compare: (left, right) => Number(left) - Number(right) }),
      }),
      metadata: fields.JSON(),
    });
    const Items = registerResource(cogs)({
      name: "local-query-items",
      schema: item,
      key: "id",
      source: cogs.local({
        initial: [
          {
            id: 1,
            title: "Alpha",
            category: "first",
            score: 5,
            parity: 1,
            metadata: { rank: 2 },
          },
          {
            id: 2,
            title: "alpha lower",
            category: "second",
            score: 10,
            parity: 0,
            metadata: { rank: 1 },
          },
          {
            id: 3,
            title: "Alpine",
            category: "first",
            score: 15,
            parity: 1,
            metadata: { rank: 3 },
          },
        ],
      }),
    });

    const caseSensitive = cogs.resource(Items).filter({ title: "Al" }).sort("title");
    await caseSensitive.load();
    expect(caseSensitive.all().map((value) => value.id)).toEqual([1, 3]);

    const ranged = cogs
      .resource(Items)
      .filter({ category: "first", score: [5, 15], parity: 1 })
      .sort("parity", true);
    await ranged.load();
    expect(ranged.all().map((value) => value.id)).toEqual([1, 3]);

    const ignoredEmpty = cogs.resource(Items).filter({ title: "", score: null });
    await ignoredEmpty.load();
    expect(ignoredEmpty.all()).toHaveLength(3);

    const unknown = cogs.resource(Items).filter({ missing: "value" });
    await unknown.load();
    expect(unknown.all()).toEqual([]);
  });

  it("supports explicit sources, local actions, and cache membership policies", async () => {
    const cogs = createUiCogs({ context: undefined });
    const task = defineSchema({ id: fields.ID(), title: fields.Str() });

    expect(() =>
      registerResource(cogs)({
        name: "invalid-http-source",
        schema: task,
        key: "id",
        source: cogs.http(),
      }),
    ).toThrow("HTTP resource invalid-http-source requires a URL");

    const LocalTasks = registerResource(cogs)({
      name: "local-action-tasks",
      schema: task,
      key: "id",
      source: cogs.local(),
      actions: {
        rename: {
          output: task,
          local: async (input: unknown) => ({ id: 1, title: String(input) }),
        },
        unavailable: {},
      },
    });
    const localTasks = cogs.resource(LocalTasks);
    await expect(localTasks.create({ title: "Missing key" })).rejects.toThrow(
      "does not contain a valid key",
    );
    expect(await localTasks.action("rename", "Renamed")).toEqual({ id: 1, title: "Renamed" });
    await expect(localTasks.action("unavailable", undefined)).rejects.toThrow(
      "requires a local handler",
    );
    await expect(localTasks.remove(99)).rejects.toMatchObject({ failure: { status: 404 } });

    const RemoteTasks = registerResource(cogs)({
      name: "explicit-http-tasks",
      url: "tasks/",
      schema: task,
      key: "id",
      source: cogs.http(),
    });
    const remote = cogs.resource(RemoteTasks);
    remote.cache.add({ id: 1, title: "Detached" }, { membership: "none" });
    expect(remote.get(1).value?.title).toBe("Detached");
    expect(remote.all()).toEqual([]);

    remote.cache.upsert({ id: 1, title: "Attached" }, { membership: "current" });
    expect(remote.all().map((value) => value.id)).toEqual([1]);
    remote.cache.upsert({ id: 1, title: "Matching" }, { membership: "matching" });
    expect(remote.stale).toBe(false);

    const uncertain = cogs.resource(RemoteTasks).filter({ serverOnly: true });
    uncertain.cache.upsert({ id: 1, title: "Uncertain" }, { membership: "current" });
    remote.cache.upsert({ id: 1, title: "Changed" }, { membership: "matching" });
    expect(uncertain.stale).toBe(true);
    remote.cache.remove(1);
    expect(remote.get(1).value).toBeUndefined();
    remote.cache.replaceAll([{ id: 2, title: "Replacement" }]);
    expect(remote.all().map((value) => value.id)).toEqual([2]);

    await expect(cogs.resource(RemoteTasks).load({ policy: "network-only" })).rejects.toThrow(
      "Network request failed",
    );
  });
});

describe("relation controllers", () => {
  it("bulk loads missing RefList targets and preserves relation order", async () => {
    const requests: TransportRequest[] = [];
    const transport: Transport = {
      request: async (request) => {
        requests.push(request);
        return {
          status: 200,
          data: [
            { id: 12, name: "Twelve" },
            { id: 3, name: "Three" },
          ],
        };
      },
    };
    const cogs = createUiCogs({
      context: undefined,
      transport,
      relationDefaults: { byKeys: { parameter: "id", encoding: "repeat" } },
    });
    const user = defineSchema({ id: fields.ID(), name: fields.Str() });
    const Users = registerResource(cogs)({
      name: "bulk-users",
      url: "users/",
      schema: user,
      key: "id",
    });
    const group = defineSchema({
      id: fields.ID(),
      members: fields.RefList({ resource: Users }),
    });
    const Groups = registerResource(cogs)({
      name: "bulk-groups",
      schema: group,
      key: "id",
      source: cogs.local({ initial: [{ id: 1, members: [3, 7, 12] }] }),
    });
    cogs.resource(Users).cache.add({ id: 7, name: "Seven" }, { membership: "none" });
    const members = cogs.resource(Groups).get(1).relation("members");

    await members.load();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("users/");
    expect(requests[0]?.query).toEqual({ id: [12, 3] });
    expect(members.values.map((value) => value.id)).toEqual([3, 7, 12]);
    expect(members.missingKeys).toEqual([]);
  });

  it("supports per-relation bulk query overrides and reports missing targets", async () => {
    const requests: TransportRequest[] = [];
    const transport: Transport = {
      request: async (request) => {
        requests.push(request);
        return { status: 200, data: [{ id: 2, name: "Two" }] };
      },
    };
    const cogs = createUiCogs({ context: { tenant: "a" }, transport });
    const user = defineSchema({ id: fields.ID(), name: fields.Str() });
    const Users = registerResource(cogs)({
      name: "override-users",
      url: "users/",
      schema: user,
      key: "id",
    });
    const group = defineSchema({
      id: fields.ID(),
      members: fields.RefList({
        resource: Users,
        fetch: cogs.relation.byKeys({
          path: "bulk/",
          encode: ({ keys }) => ({ user_ids: keys.join(",") }),
        }),
      }),
    });
    const Groups = registerResource(cogs)({
      name: "override-groups",
      schema: group,
      key: "id",
      source: cogs.local({ initial: [{ id: 1, members: [2, 4] }] }),
    });
    const members = cogs.resource(Groups).get(1).relation("members");

    await members.load();
    expect(requests[0]).toMatchObject({ url: "users/bulk/", query: { user_ids: "2,4" } });
    expect(members.values.map((value) => value.id)).toEqual([2]);
    expect(members.missingKeys).toEqual([4]);
    members.cancel();
  });

  it("deduplicates equivalent bulk loads while keeping relation cancellation local", async () => {
    const transport = new DeferredTransport();
    const cogs = createUiCogs({ context: undefined, transport });
    const user = defineSchema({ id: fields.ID(), name: fields.Str() });
    const Users = registerResource(cogs)({
      name: "shared-users",
      url: "users/",
      schema: user,
      key: "id",
    });
    const group = defineSchema({
      id: fields.ID(),
      members: fields.RefList({ resource: Users }),
    });
    const Groups = registerResource(cogs)({
      name: "shared-groups",
      schema: group,
      key: "id",
      source: cogs.local({ initial: [{ id: 1, members: [3, 7] }] }),
    });
    const first = cogs.resource(Groups).get(1).relation("members");
    const second = cogs.resource(Groups).get(1).relation("members");

    const firstLoad = first.load();
    const secondLoad = second.load();
    expect(transport.requests).toHaveLength(1);
    first.cancel();
    await expect(firstLoad).rejects.toHaveProperty("name", "AbortError");
    expect(second.loading).toBe(true);
    transport.resolve?.({
      status: 200,
      data: [
        { id: 7, name: "Seven" },
        { id: 3, name: "Three" },
      ],
    });
    await expect(secondLoad).resolves.toEqual([
      { id: 3, name: "Three" },
      { id: 7, name: "Seven" },
    ]);
    expect(second.error).toBeUndefined();
  });

  it("bulk loads remote targets referenced by through-resource rows", async () => {
    const requests: TransportRequest[] = [];
    const transport: Transport = {
      request: async (request) => {
        requests.push(request);
        if (request.url === "memberships/")
          return {
            status: 200,
            data: [
              { id: 1, group: 10, user: 2, position: 2 },
              { id: 2, group: 10, user: 1, position: 1 },
            ],
          };
        return {
          status: 200,
          data: [
            { id: 2, name: "Grace" },
            { id: 1, name: "Ada" },
          ],
        };
      },
    };
    const cogs = createUiCogs({ context: undefined, transport });
    const user = defineSchema({ id: fields.ID(), name: fields.Str() });
    const Users = registerResource(cogs)({
      name: "remote-users",
      url: "users/",
      schema: user,
      key: "id",
    });
    const group = defineSchema({
      id: fields.ID(),
      members: fields.RefList({
        resource: Users,
        through: {
          resource: { resourceName: "remote-memberships" },
          source: "group",
          target: "user",
          orderBy: "position",
        },
      }),
    });
    const Groups = registerResource(cogs)({
      name: "remote-groups",
      schema: group,
      key: "id",
      source: cogs.local({ initial: [{ id: 10, members: [] }] }),
    });
    const membership = defineSchema({
      id: fields.ID(),
      group: fields.Ref({ resource: Groups }),
      user: fields.Ref({ resource: Users }),
      position: fields.Int(),
    });
    registerResource(cogs)({
      name: "remote-memberships",
      url: "memberships/",
      schema: membership,
      key: "id",
    });
    const members = cogs.resource(Groups).get(10).relation("members");

    await members.load();
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ url: "memberships/", query: { group: 10 } });
    expect(requests[1]).toMatchObject({ url: "users/", query: { id: [1, 2] } });
    expect(members.values.map((value) => value.name)).toEqual(["Ada", "Grace"]);
    expect(members.entries.map((entry) => entry.position)).toEqual([1, 2]);
  });

  it("mutates plain to-one and to-many relations through the parent resource", async () => {
    const cogs = createUiCogs({ context: undefined });
    const user = defineSchema({ id: fields.ID(), name: fields.Str() });
    const Users = registerResource(cogs)({
      name: "relation-users",
      schema: user,
      key: "id",
      source: cogs.local({
        initial: [
          { id: 1, name: "Ada" },
          { id: 2, name: "Grace" },
          { id: 3, name: "Lin" },
        ],
      }),
    });
    const group = defineSchema({
      id: fields.ID(),
      owner: fields.Ref({ resource: Users, nullable: true }),
      members: fields.RefList({ resource: Users }),
    });
    const Groups = registerResource(cogs)({
      name: "plain-groups",
      schema: group,
      key: "id",
      source: cogs.local({ initial: [{ id: 10, owner: 1, members: [1] }] }),
    });
    const object = cogs.resource(Groups).get(10);
    const members = object.relation("members");
    const owner = object.relation("owner");

    expect(object.relation("members")).toBe(members);
    expect(members.values.map((value) => value.id)).toEqual([1]);
    await members.add(2);
    expect(members.values.map((value) => value.id)).toEqual([1, 2]);
    await members.remove(1);
    expect(members.values.map((value) => value.id)).toEqual([2]);
    await members.set([1, 3]);
    expect(members.values.map((value) => value.id)).toEqual([1, 3]);
    await members.clear();
    expect(members.values).toEqual([]);

    expect(owner.value?.id).toBe(1);
    await owner.set(2);
    expect(owner.value?.id).toBe(2);
    await owner.clear();
    expect(owner.value).toBeUndefined();
  });

  it("commits endpoint relation mutations after empty successful responses", async () => {
    const requests: TransportRequest[] = [];
    const transport: Transport = {
      request: async (request) => {
        requests.push(request);
        return { status: 204, data: undefined };
      },
    };
    const cogs = createUiCogs({ context: undefined, transport });
    const user = defineSchema({ id: fields.ID(), name: fields.Str() });
    const Users = registerResource(cogs)({
      name: "endpoint-users",
      schema: user,
      key: "id",
      source: cogs.local({ initial: [{ id: 1, name: "Ada" }] }),
    });
    const group = defineSchema({
      id: fields.ID(),
      members: fields.RefList({
        resource: Users,
        mutation: cogs.relation.endpoints({
          add: ({ sourceKey }) => `${sourceKey}/members/add/`,
          remove: ({ sourceKey }) => `${sourceKey}/members/remove/`,
          set: ({ sourceKey }) => `${sourceKey}/members/set/`,
        }),
      }),
    });
    const Groups = registerResource(cogs)({
      name: "endpoint-groups",
      url: "groups/",
      schema: group,
      key: "id",
    });
    const groups = cogs.resource(Groups);
    groups.cache.add({ id: 8, members: [] });
    const members = groups.get(8).relation("members");

    await members.add(1);
    expect(requests[0]?.url).toBe("groups/8/members/add/");
    expect(requests[0]?.body).toEqual({ keys: [1] });
    expect(members.values.map((value) => value.id)).toEqual([1]);
  });

  it("supports endpoint fallbacks, custom bodies, and relation guard failures", async () => {
    const requests: TransportRequest[] = [];
    const transport: Transport = {
      request: async (request) => {
        requests.push(request);
        return { status: 200, data: { accepted: true } };
      },
    };
    const cogs = createUiCogs({ context: undefined, transport });
    const user = defineSchema({ id: fields.ID(), name: fields.Str() });
    const Users = registerResource(cogs)({
      name: "custom-endpoint-users",
      schema: user,
      key: "id",
      source: cogs.local({ initial: [{ id: 1, name: "Ada" }] }),
    });
    const group = defineSchema({
      id: fields.ID(),
      owner: fields.Ref({
        resource: Users,
        nullable: true,
        mutation: cogs.relation.endpoints({
          set: "owner/",
          method: "PUT",
          body: (action, context) => ({ action, owner: context.targetKeys[0] ?? null }),
        }),
      }),
      members: fields.RefList({
        resource: Users,
        mutation: cogs.relation.endpoints({ add: "members/add/" }),
      }),
    });
    const Groups = registerResource(cogs)({
      name: "custom-endpoint-groups",
      url: "groups/",
      schema: group,
      key: "id",
    });
    const groups = cogs.resource(Groups);
    groups.cache.add({ id: 5, owner: 1, members: [] });
    const object = groups.get(5);

    await object.relation("owner").clear();
    expect(requests[0]).toMatchObject({
      method: "PUT",
      url: "groups/owner/",
      body: { action: "clear", owner: null },
    });
    await expect(object.relation("members").clear()).rejects.toThrow(
      "does not define a clear endpoint",
    );
    await expect(object.addRelationItem("owner", 1)).rejects.toThrow("is not a list");
    await expect(object.removeRelationItems("owner", [1])).rejects.toThrow("is not a list");
    await expect(object.setRelation("unknown" as "owner", 1)).rejects.toThrow("is not a relation");
  });

  it("materializes and mutates attributed many-to-many joins", async () => {
    const cogs = createUiCogs({ context: undefined });
    const user = defineSchema({ id: fields.ID(), name: fields.Str() });
    const Users = registerResource(cogs)({
      name: "through-users",
      schema: user,
      key: "id",
      source: cogs.local({
        initial: [
          { id: 1, name: "Ada" },
          { id: 2, name: "Grace" },
          { id: 3, name: "Lin" },
        ],
      }),
    });
    const group = defineSchema({
      id: fields.ID(),
      name: fields.Str(),
      members: fields.RefList({
        resource: Users,
        through: {
          resource: { resourceName: "memberships" },
          source: "group",
          target: "user",
          orderBy: "position",
        },
      }),
    });
    const Groups = registerResource(cogs)({
      name: "through-groups",
      schema: group,
      key: "id",
      source: cogs.local({
        initial: [{ id: 10, name: "Core team", members: [] }],
      }),
    });
    const membership = defineSchema({
      id: fields.ID(),
      group: fields.Ref({ resource: Groups }),
      user: fields.Ref({ resource: Users }),
      position: fields.Int(),
    });
    registerResource(cogs)({
      name: "memberships",
      schema: membership,
      key: "id",
      source: cogs.local({
        initial: [
          { id: 1, group: 10, user: 2, position: 2 },
          { id: 2, group: 10, user: 1, position: 1 },
        ],
        generateKey: ({ existing }) => Math.max(0, ...existing.map(Number)) + 1,
      }),
    });
    const members = cogs.resource(Groups).get(10).relation("members");

    await members.load();
    expect(members.values.map((value) => value.id)).toEqual([1, 2]);
    expect(members.entries.map((entry) => entry.position)).toEqual([1, 2]);
    await members.add(3, { position: 3 });
    expect(members.values.map((value) => value.id)).toEqual([1, 2, 3]);
    expect(members.entries).toHaveLength(3);
    await expect(members.add(3, { position: 4 })).rejects.toBeInstanceOf(CacheConflictError);
    await members.remove(2);
    expect(members.values.map((value) => value.id)).toEqual([1, 3]);
    await members.set([2]);
    expect(members.values.map((value) => value.id)).toEqual([2]);
  });
});
