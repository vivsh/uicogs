import { defineSchema } from "./test-utils.js";

import { afterEach, describe, expect, it, vi } from "vitest";
import { fields } from "./field.js";
import { createFormController } from "./form.js";
import { RequestError, clientIssue, type NormalizedFailure } from "./issues.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("form schemas", () => {
  it("uses defaults and writes only changed patch fields by wire name", () => {
    const schema = defineSchema({
      title: fields.Str({ required: true, wireName: "task_title" }),
      note: fields.Str(),
    });
    const patch = schema.toForm();
    expect(patch).toMatchObject({ mode: "patch", encoding: "auto" });
    expect(Object.isFrozen(patch)).toBe(true);
    const value = schema.parse({ title: "Task", note: "Keep" });
    expect(patch.writeValue(value, new Set(["title"]))).toEqual({ task_title: "Task" });
    expect(schema.toForm({ mode: "create" }).writeValue(value, new Set(["title"]))).toEqual({
      task_title: "Task",
      note: "Keep",
    });
  });

  it("supports custom object and scalar form writers", () => {
    const schema = defineSchema({ title: fields.Str({ required: true }) });
    const value = schema.parse({ title: "Task" });
    const object = schema.toForm({ write: (input) => ({ label: input.title }) });
    const scalar = schema.toForm({ mode: "custom", write: (input) => input.title });
    expect(object.writeValue(value, new Set())).toEqual({ label: "Task" });
    expect(scalar.writeValue(value, new Set())).toBe("Task");
  });
});

describe("form field state and validation", () => {
  it("tracks values, touch, dirtiness, enablement, and subscriptions", () => {
    const schema = defineSchema({ title: fields.Str({ required: true }), note: fields.Str() });
    const form = createFormController(schema.toForm(), { title: "Initial", note: "Note" });
    const listener = vi.fn();
    const unsubscribe = form.subscribe(listener);
    expect(form.values).toEqual(form.initialValues);
    expect(form.field("title")).toMatchObject({
      value: "Initial",
      initialValue: "Initial",
      touched: false,
      dirty: false,
      enabled: true,
      pending: false,
      issues: [],
    });
    form.set("title", "Changed");
    expect(form.dirty).toBe(true);
    expect(form.valid).toBe(false);
    expect(form.field("title")).toMatchObject({ touched: true, dirty: true });
    form.enable("note", false);
    expect(form.field("note").enabled).toBe(false);
    form.enable("note");
    expect(form.field("note").enabled).toBe(true);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("converts parse failures and filters disabled or unselected field issues", async () => {
    const schema = defineSchema({
      title: fields.Str({ required: true, validate: [() => "Title issue"] }),
      note: fields.Str({ required: true, validate: [() => "Note issue"] }),
    });
    const form = createFormController(schema.toForm(), { title: "Task" });
    form.enable("note", false);
    const all = await form.validate();
    expect(all.issues.map((issue) => issue.message)).toEqual(["Title issue"]);
    expect(form.valid).toBe(false);
    const title = await form.validateField("title");
    expect(title.issues.map((issue) => issue.path)).toEqual([["title"]]);

    const choices = createFormController(
      defineSchema({ state: fields.Enum(["open", "done"] as const, { required: true }) }).toForm(),
      { state: { label: "Open", value: "open" } as never },
    );
    const malformed = await choices.validate();
    expect(malformed.valid).toBe(false);
    expect(malformed.issues).toContainEqual(
      expect.objectContaining({ path: ["state"], source: "parse" }),
    );
  });

  it("accepts string, issue, and issue-list form validators", async () => {
    const schema = defineSchema({ title: fields.Str({ required: true }) });
    const stringForm = createFormController(schema.toForm({ validate: async () => "Form issue" }), {
      title: "Task",
    });
    expect((await stringForm.validate()).issues[0]?.message).toBe("Form issue");

    const warning = clientIssue([], "Warning", "warning", "warning");
    const issueForm = createFormController(schema.toForm({ validate: () => warning }), {
      title: "Task",
    });
    expect(await issueForm.validate()).toMatchObject({ valid: true, issues: [warning] });

    const listForm = createFormController(schema.toForm({ validate: () => [warning] }), {
      title: "Task",
    });
    expect((await listForm.validate()).issues).toEqual([warning]);
  });

  it("shares the eventual result across replaced debounced field validations", async () => {
    vi.useFakeTimers();
    const validator = vi.fn(() => "Invalid");
    const schema = defineSchema({ title: fields.Str({ validate: [validator] }) });
    const form = createFormController(schema.toForm(), { title: "Task" });
    const first = form.validateField("title", { debounceMs: 100 });
    const second = form.validateField("title", { debounceMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    await expect(first).resolves.toMatchObject({ valid: false });
    await expect(second).resolves.toMatchObject({ valid: false });
    expect(validator).toHaveBeenCalledOnce();
  });

  it("settles pending debounced validation when cancelled", async () => {
    vi.useFakeTimers();
    const schema = defineSchema({ title: fields.Str() });
    const form = createFormController(schema.toForm(), { title: "Task" });
    const pending = form.validateField("title", { debounceMs: 100 });
    form.cancel();
    await expect(pending).resolves.toMatchObject({ valid: false, issues: [] });
    expect(form.validating).toBe(false);
    expect(form.submitting).toBe(false);
  });

  it("discards state from stale async validation generations", async () => {
    let release: (() => void) | undefined;
    const schema = defineSchema({
      title: fields.Str({
        validate: [
          async () => {
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            return "Old issue";
          },
        ],
      }),
    });
    const form = createFormController(schema.toForm(), { title: "First" });
    const first = form.validate();
    while (!release) await Promise.resolve();
    form.set("title", "Second");
    release();
    await first;
    expect(form.issues).toEqual([]);
    expect(form.validating).toBe(false);
  });
});

describe("form submission and base state", () => {
  it("returns validation failures without calling its submitter", async () => {
    const schema = defineSchema({ title: fields.Str({ required: true }) });
    const submitter = vi.fn(async () => ({ id: 1 }));
    const form = createFormController(schema.toForm(), {}, submitter);
    await expect(form.submit()).resolves.toMatchObject({
      success: false,
      failure: { kind: "validation" },
    });
    expect(submitter).not.toHaveBeenCalled();
  });

  it("reports a missing submit operation after successful validation", async () => {
    const schema = defineSchema({ title: fields.Str({ required: true }) });
    const form = createFormController(schema.toForm(), { title: "Task" });
    await expect(form.submit()).rejects.toThrow("no submit operation");
  });

  it("locks duplicate submissions before asynchronous validation completes", async () => {
    let releaseValidation: (() => void) | undefined;
    const schema = defineSchema({
      title: fields.Str({
        required: true,
        validate: [
          async () =>
            new Promise<void>((resolve) => {
              releaseValidation = resolve;
            }),
        ],
      }),
    });
    const submitter = vi.fn(async () => ({ id: 1 }));
    const form = createFormController(schema.toForm(), { title: "Task" }, submitter);
    const first = form.submit();
    const duplicate = await form.submit();
    expect(duplicate).toMatchObject({ success: false, failure: { kind: "conflict" } });
    while (!releaseValidation) await Promise.resolve();
    releaseValidation?.();
    await expect(first).resolves.toMatchObject({ success: true });
    expect(submitter).toHaveBeenCalledOnce();
  });

  it("tracks progress, commits successful drafts, and resets field state", async () => {
    const schema = defineSchema({ title: fields.Str({ required: true }) });
    const form = createFormController(
      schema.toForm({ mode: "create", encoding: "json" }),
      { title: "Initial" },
      async (_payload, options) => {
        options.onUploadProgress({
          loaded: 4,
          total: 8,
          fraction: 0.5,
          lengthComputable: true,
        });
        expect(form.progress).toMatchObject({ active: true, fraction: 0.5 });
        return { id: 1 };
      },
    );
    form.set("title", "Changed");
    const result = await form.submit();
    expect(result).toEqual({ success: true, value: { id: 1 } });
    expect(form.initialValues.title).toBe("Changed");
    expect(form.dirty).toBe(false);
    expect(form.progress.active).toBe(false);
    expect(form.field("title").touched).toBe(false);
  });

  it("maps current server failures and clears only the edited field", async () => {
    const schema = defineSchema({
      title: fields.Str({ required: true, wireName: "task_title" }),
      note: fields.Str(),
    });
    const failure: NormalizedFailure = {
      kind: "validation",
      issues: [
        serverIssue(["task_title"], "Title failed"),
        serverIssue(["note"], "Note failed"),
        serverIssue([], "General failed"),
        serverIssue([0], "Indexed failure"),
      ],
      retryable: false,
    };
    const form = createFormController(
      schema.toForm(),
      { title: "Task", note: "Note" },
      async () => {
        throw new RequestError(failure);
      },
    );
    await expect(form.submit()).resolves.toMatchObject({ success: false });
    expect(form.field("title").issues[0]?.path).toEqual(["title"]);
    expect(form.field("note").issues[0]?.path).toEqual(["note"]);
    expect(form.unboundIssues).toHaveLength(2);
    expect(form.error?.kind).toBe("validation");
    form.set("title", "Retry");
    expect(form.field("title").issues).toEqual([]);
    expect(form.field("note").issues).toHaveLength(1);
    expect(form.unboundIssues).toHaveLength(2);
  });

  it("rebases, resets, observes stale bases, and disposes subscriptions", () => {
    const schema = defineSchema({ title: fields.Str(), note: fields.Str() });
    const form = createFormController(schema.toForm(), { title: "Initial", note: "One" });
    let baseListener: (() => void) | undefined;
    let unsubscribed = 0;
    form.observeBase((listener) => {
      baseListener = listener;
      return () => {
        unsubscribed += 1;
      };
    });
    baseListener?.();
    expect(form.baseStale).toBe(false);
    form.set("title", "Draft");
    baseListener?.();
    expect(form.baseStale).toBe(true);
    form.rebase({ title: "Remote" });
    expect(form.initialValues.title).toBe("Remote");
    expect(form.dirty).toBe(true);
    expect(form.baseStale).toBe(false);
    form.reset({ title: "Reset", note: "Two" });
    expect(form.values).toEqual({ title: "Reset", note: "Two" });
    expect(form.dirty).toBe(false);
    form.observeBase(() => () => void (unsubscribed += 1));
    expect(unsubscribed).toBe(1);
    form.dispose();
    expect(unsubscribed).toBe(2);
  });
});

function serverIssue(path: readonly (string | number)[], message: string) {
  return {
    path,
    message,
    code: "server",
    source: "server" as const,
    severity: "error" as const,
  };
}
