import { defineSchema, registerResource } from "./test-utils.js";

import { describe, expect, it } from "vitest";
import { createUiCogs } from "./factory.js";
import { fields } from "./field.js";
import { localFile } from "./field.js";
import { createFormController } from "./form.js";
import { RequestError, type NormalizedFailure } from "./issues.js";
import { operation } from "./resource.js";
import type { Transport } from "./transport.js";

describe("forms", () => {
  it("maps wire aliases and retains unknown paths in the summary", () => {
    const schema = defineSchema({
      title: fields.Str({ required: true, wireName: "task_title" }),
    });
    const form = createFormController(schema.toForm(), { title: "Draft" });
    const failure: NormalizedFailure = {
      kind: "validation",
      retryable: false,
      issues: [
        serverIssue(["task_title"], "Already used"),
        serverIssue(["unknown"], "Unknown field"),
      ],
    };

    form.applyFailure(failure);
    expect(form.field("title").issues[0]?.path).toEqual(["title"]);
    expect(form.getSnapshot().unboundIssues[0]?.path).toEqual(["unknown"]);
  });

  it("keeps safe plain-text validation failures as unbound form issues", async () => {
    const detail = `A task with this title already exists. ${"More detail ".repeat(40)}`;
    const transport: Transport = {
      request: async () => ({
        status: 422,
        data: detail,
        headers: { "content-type": "text/plain" },
      }),
    };
    const cogs = createUiCogs({ context: undefined, transport });
    const Task = defineSchema({ id: fields.ID(), title: fields.Str({ required: true }) });
    const Tasks = registerResource(cogs)({
      name: "tasks",
      url: "tasks/",
      schema: Task,
      key: "id",
      operations: { create: operation.create() },
    });
    const form = cogs.resource(Tasks).form(Task.keep("title").toForm({ mode: "create" }), {
      title: "Duplicate",
    });

    await expect(form.submit()).resolves.toMatchObject({
      success: false,
      failure: {
        kind: "validation",
        message: `${detail.trim().replace(/\s+/g, " ").slice(0, 277)}…`,
      },
    });
    expect(form.unboundIssues).toMatchObject([
      {
        path: [],
        message: `${detail.trim().replace(/\s+/g, " ").slice(0, 277)}…`,
        source: "server",
      },
    ]);
    cogs.dispose();
  });

  it("uses safe status messages instead of plain-text or HTML error bodies", async () => {
    let status = 401;
    const transport: Transport = {
      request: async () => ({
        status,
        data: status === 405 ? "<html><body>Method Not Allowed</body></html>" : "Internal detail",
        headers: { "content-type": status === 405 ? "text/html" : "text/plain" },
      }),
    };
    const cogs = createUiCogs({ context: undefined, transport });
    const Task = defineSchema({ id: fields.ID(), title: fields.Str({ required: true }) });
    const Tasks = registerResource(cogs)({
      name: "tasks",
      url: "tasks/",
      schema: Task,
      key: "id",
      operations: { create: operation.create() },
    });
    const expected = new Map([
      [401, "Your session has expired. Please sign in again."],
      [403, "You do not have permission to perform this action."],
      [405, "This action is not available."],
      [503, "The server encountered an error. Please try again."],
    ]);

    for (const [nextStatus, message] of expected) {
      status = nextStatus;
      const form = cogs.resource(Tasks).form(Task.keep("title").toForm({ mode: "create" }), {
        title: "Draft",
      });
      await expect(form.submit()).resolves.toMatchObject({ success: false, failure: { message } });
      expect(form.unboundIssues).toEqual([]);
      form.dispose();
    }
    cogs.dispose();
  });

  it("marks a dirty object-bound draft stale when shared data changes", async () => {
    const transport: Transport = {
      request: async (request) => ({
        status: 200,
        data:
          request.method === "GET"
            ? { id: 1, title: "Initial" }
            : { id: 1, title: String((request.body as { title: string }).title) },
      }),
    };
    const cogs = createUiCogs({ context: undefined, transport });
    const task = defineSchema({
      id: fields.ID({ readonly: true }),
      title: fields.Str({ required: true }),
    });
    const Tasks = registerResource(cogs)({ name: "tasks", url: "tasks/", schema: task, key: "id" });
    const first = cogs.resource(Tasks);
    const second = cogs.resource(Tasks);
    const object = first.get(1);
    await object.load();
    const form = object.form(task.keep("title").toForm({ mode: "patch" }));

    form.set("title", "Local draft");
    await second.update(1, { title: "Remote update" });
    expect(form.baseStale).toBe(true);
    expect(form.values.title).toBe("Local draft");
    form.dispose();
  });

  it("writes typed file values and forwards upload progress", async () => {
    const attachment = new Blob(["content"], { type: "text/plain" });
    const schema = defineSchema({
      title: fields.Str({ required: true }),
      attachment: fields.File({ required: true }),
    });
    let submitted: unknown;
    let encoding: string | undefined;
    const form = createFormController(
      schema.toForm({ mode: "create", encoding: "auto" }),
      { title: "Document", attachment: localFile(attachment, "document.txt") },
      async (payload, options) => {
        submitted = payload;
        encoding = options.encoding;
        options.onUploadProgress({
          loaded: attachment.size,
          total: attachment.size,
          fraction: 1,
          lengthComputable: true,
        });
        return { id: 1 };
      },
    );

    const result = await form.submit();
    expect(result.success).toBe(true);
    expect(encoding).toBe("auto");
    expect(submitted).toEqual({ title: "Document", attachment });
    expect(form.progress.active).toBe(false);
  });

  it("submits narrowed form writers without reparsing them as full entities", async () => {
    const requests: unknown[] = [];
    const transport: Transport = {
      request: async (request) => {
        requests.push(request.body);
        const body = request.body as Readonly<Record<string, unknown>> | undefined;
        return {
          status: request.method === "POST" ? 201 : 200,
          data: {
            id: 1,
            task_title: String(body?.task_title ?? "Initial"),
            project: "server-owned",
          },
        };
      },
    };
    const cogs = createUiCogs({ context: undefined, transport });
    const task = defineSchema({
      id: fields.ID(),
      title: fields.Str({ required: true, wireName: "task_title" }),
      project: fields.Str({ required: true }),
    });
    const Tasks = registerResource(cogs)({ name: "tasks", url: "tasks/", schema: task, key: "id" });
    const resource = cogs.resource(Tasks);
    const createSchema = task
      .keep("title")
      .extend({ confirmation: fields.Bool({ required: true }) })
      .toForm({
        mode: "create",
        write: (value) => ({ task_title: value.title }),
      });
    const createForm = resource.form(createSchema, {
      title: "Created",
      confirmation: true,
    });

    await expect(createForm.submit()).resolves.toMatchObject({ success: true });
    expect(requests[0]).toEqual({ task_title: "Created" });

    const object = resource.get(1);
    await object.load();
    const editForm = object.form(task.keep("title").toForm({ mode: "patch" }));
    editForm.set("title", "Updated");
    await expect(editForm.submit()).resolves.toMatchObject({ success: true });
    expect(requests.filter((body) => body !== undefined)).toEqual([
      { task_title: "Created" },
      { task_title: "Updated" },
    ]);
  });

  it("discards late server issues without leaving a newer draft submitting", async () => {
    const schema = defineSchema({ title: fields.Str({ required: true }) });
    let rejectSubmission: ((reason: unknown) => void) | undefined;
    const form = createFormController(
      schema.toForm({ mode: "patch" }),
      { title: "Initial" },
      () =>
        new Promise((_resolve, reject) => {
          rejectSubmission = reject;
        }),
    );

    const submission = form.submit();
    while (!rejectSubmission) await Promise.resolve();
    form.set("title", "Newer draft");
    rejectSubmission?.(
      new RequestError({
        kind: "validation",
        issues: [serverIssue(["title"], "Old response")],
        retryable: false,
      }),
    );
    await submission;
    expect(form.values.title).toBe("Newer draft");
    expect(form.issues).toEqual([]);
    expect(form.submitting).toBe(false);
  });
});

function serverIssue(path: readonly string[], message: string) {
  return {
    path,
    message,
    code: "server",
    source: "server" as const,
    severity: "error" as const,
  };
}
