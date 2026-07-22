import { defineSchema, registerResource } from "./test-utils.js";

import { describe, expect, it } from "vitest";
import { createUiCogs } from "./factory.js";
import { fields } from "./field.js";
import type { Transport } from "./transport.js";

describe("relations and views", () => {
  it("normalizes included relations into the target resource cache", async () => {
    const transport: Transport = {
      request: async () => ({
        status: 200,
        data: { id: 1, title: "Issue", comments: [{ id: 7, text: "Included" }] },
      }),
    };
    const cogs = createUiCogs({ context: undefined, transport });
    const commentSchema = defineSchema({ id: fields.ID(), text: fields.Str({ required: true }) });
    const comments = registerResource(cogs)({
      name: "comments",
      url: "comments/",
      schema: commentSchema,
      key: "id",
    });
    const issueSchema = defineSchema({
      id: fields.ID(),
      title: fields.Str({ required: true }),
      comments: fields.RefList({ resource: comments }),
    });
    const issues = registerResource(cogs)({
      name: "issues",
      url: "issues/",
      schema: issueSchema,
      key: "id",
    });

    const issue = cogs.resource(issues).get(1);
    await issue.load();
    const related = issue.value?.comments;
    expect(related).toEqual([{ id: 7, text: "Included" }]);
    expect(cogs.resource(comments).get(7).value).toBe(related?.[0]);
  });

  it("materializes a read-only view before the full entity is known", async () => {
    const transport: Transport = {
      request: async () => ({ status: 200, data: [{ id: 1, name: "Ada" }] }),
    };
    const cogs = createUiCogs({ context: undefined, transport });
    const user = defineSchema({
      id: fields.ID(),
      name: fields.Str({ required: true }),
      biography: fields.Str({ required: true }),
    });
    const summary = user.view({ fields: ["id", "name"] as const });
    const query = defineSchema({ search: fields.Str() });
    registerResource(cogs)({
      name: "users",
      url: "users/",
      schema: user,
      key: "id",
      views: { summary },
      queries: { list: { input: query, view: "summary" } },
    });
    const users = cogs.resource("users");
    const collection = users.query("list", {});
    await collection.load();
    expect(collection.all()).toEqual([{ id: 1, name: "Ada" }]);
    expect(users.get(1).value).toBeUndefined();
  });

  it("writes direct relation values as target keys", () => {
    const cogs = createUiCogs({
      context: undefined,
      transport: { request: async () => ({ status: 200, data: [] }) },
    });
    const project = defineSchema({ id: fields.ID(), title: fields.Str({ required: true }) });
    const projects = registerResource(cogs)({
      name: "projects",
      url: "projects/",
      schema: project,
      key: "id",
    });
    const member = defineSchema({
      id: fields.ID(),
      project: fields.Ref({ resource: projects, required: true }),
      recentProjects: fields.RefList({ resource: projects, required: true }),
    });
    const value = member.parse({
      id: 1,
      project: { id: 2, title: "Primary" },
      recentProjects: [{ id: 3, title: "Recent" }],
    });
    expect(member.write(value)).toEqual({
      project: 2,
      recentProjects: [3],
    });
  });

  it("loads eager direct relations, sorts values, and reacts to target mutations", async () => {
    const transport: Transport = {
      request: async (request) => {
        if (request.url === "issues/1/")
          return {
            status: 200,
            data: { id: 1, title: "Issue", owner: 2, comments: [8, 7] },
          };
        if (request.url === "users/2/") return { status: 200, data: { id: 2, name: "Owner" } };
        if (request.url === "comments/")
          return {
            status: 200,
            data: [
              { id: 7, text: "Alpha" },
              { id: 8, text: "Zulu" },
            ],
          };
        if (request.method === "PATCH") {
          const id = Number(request.url.match(/(\d+)\/$/)?.[1]);
          return { status: 200, data: { id, text: `Updated ${id}` } };
        }
        if (request.method === "DELETE") return { status: 204, data: undefined };
        const id = Number(request.url.match(/(\d+)\/$/)?.[1]);
        return { status: 200, data: { id, text: id === 7 ? "Alpha" : "Zulu" } };
      },
    };
    const cogs = createUiCogs({ context: undefined, transport });
    const userSchema = defineSchema({ id: fields.ID(), name: fields.Str({ required: true }) });
    const users = registerResource(cogs)({
      name: "users",
      url: "users/",
      schema: userSchema,
      key: "id",
    });
    const commentSchema = defineSchema({ id: fields.ID(), text: fields.Str({ required: true }) });
    const comments = registerResource(cogs)({
      name: "comments",
      url: "comments/",
      schema: commentSchema,
      key: "id",
    });
    const issueSchema = defineSchema({
      id: fields.ID(),
      title: fields.Str({ required: true }),
      owner: fields.Ref({ resource: users, required: true, load: "eager" }),
      comments: fields.RefList({
        resource: comments,
        required: true,
        load: "eager",
        sort: "text",
      }),
    });
    const issues = registerResource(cogs)({
      name: "issues",
      url: "issues/",
      schema: issueSchema,
      key: "id",
    });
    const issue = cogs.resource(issues).get(1);
    await issue.load();
    expect(issue.value?.owner).toEqual({ id: 2, name: "Owner" });
    expect(issue.value?.comments.map((comment) => comment.text)).toEqual(["Alpha", "Zulu"]);

    const revision = issue.getSnapshot().revision;
    await cogs.resource(comments).update(7, { text: "Updated 7" });
    expect(issue.value?.comments.map((comment) => comment.text)).toEqual(["Updated 7", "Zulu"]);
    expect(issue.getSnapshot().revision).toBeGreaterThan(revision);

    await cogs.resource(comments).remove(8);
    expect(issue.value?.comments.map((comment) => comment.id)).toEqual([7]);
  });

  it("loads query-driven and source-to-target mapped relations manually", async () => {
    const requests: string[] = [];
    const transport: Transport = {
      request: async (request) => {
        const query = new URLSearchParams(
          Object.entries(request.query ?? {}).map(([name, value]) => [name, String(value)]),
        );
        requests.push(`${request.url}?${query}`);
        if (request.url === "issues/1/")
          return { status: 200, data: { id: 1, title: "Issue", projectCode: "alpha" } };
        if (request.url === "comments/")
          return {
            status: 200,
            data: [{ id: 7, text: "Comment" }],
          };
        return { status: 200, data: [{ id: 3, code: "alpha", title: "Project" }] };
      },
    };
    const cogs = createUiCogs({ context: undefined, transport });
    const commentSchema = defineSchema({ id: fields.ID(), text: fields.Str({ required: true }) });
    const comments = registerResource(cogs)({
      name: "comments",
      url: "comments/",
      schema: commentSchema,
      key: "id",
    });
    const projectSchema = defineSchema({
      id: fields.ID(),
      code: fields.Str({ required: true }),
      title: fields.Str({ required: true }),
    });
    const projects = registerResource(cogs)({
      name: "projects",
      url: "projects/",
      schema: projectSchema,
      key: "id",
    });
    const issueSchema = defineSchema({
      id: fields.ID(),
      title: fields.Str({ required: true }),
      projectCode: fields.Str({ required: true }),
      comments: fields.RefList({
        resource: comments,
        query: (source) => ({
          issue: (source as Readonly<Record<string, unknown>>).id,
        }),
      }),
      project: fields.Ref({ resource: projects, from: "projectCode", to: "code" }),
    });
    const issues = registerResource(cogs)({
      name: "issues",
      url: "issues/",
      schema: issueSchema,
      key: "id",
    });
    const issue = cogs.resource(issues).get(1);
    await issue.load();
    expect(issue.value?.comments).toBeUndefined();
    expect(await issue.loadRelation("comments")).toEqual([{ id: 7, text: "Comment" }]);
    expect(await issue.loadRelation("project")).toEqual({
      id: 3,
      code: "alpha",
      title: "Project",
    });
    expect(requests).toContain("comments/?issue=1&page=1&page_size=25");
    expect(requests).toContain("projects/?code=alpha&page=1&page_size=25");
  });

  it("handles missing owners and reports invalid relation declarations", async () => {
    const cogs = createUiCogs({
      context: undefined,
      transport: {
        request: async () => ({ status: 200, data: { id: 1, title: "Issue" } }),
      },
    });
    const registeredSchema = defineSchema({ id: fields.ID(), name: fields.Str() });
    const registered = registerResource(cogs)({
      name: "registered",
      url: "registered/",
      schema: registeredSchema,
      key: "id",
    });
    const emptyOwnerSchema = defineSchema({
      id: fields.ID(),
      target: fields.Ref({ resource: registered }),
    });
    const emptyOwners = registerResource(cogs)({
      name: "empty-owners",
      url: "empty-owners/",
      schema: emptyOwnerSchema,
      key: "id",
    });
    expect(await cogs.resource(emptyOwners).get(99).loadRelation("target")).toBeUndefined();

    const target = { resourceName: "unregistered" };
    const schema = defineSchema({
      id: fields.ID(),
      title: fields.Str({ required: true }),
      target: fields.Ref({ resource: target }),
    });
    const definition = registerResource(cogs)({
      name: "issues",
      url: "issues/",
      schema,
      key: "id",
    });
    const object = cogs.resource(definition).get(1);
    await object.load();
    await expect(object.loadRelation("target")).rejects.toThrow("unregistered resource");
    await expect(object.loadRelation("title")).rejects.toThrow("is not a relation");
  });
});
