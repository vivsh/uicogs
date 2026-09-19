import { describe, expect, it } from "vitest";
import {
  createUiCogs,
  fields,
  operation,
  resource,
  schema,
  type TransportResponse,
} from "./index.js";
import { createFormController } from "./form.js";
import { RequestError, type NormalizedFailure } from "./issues.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

describe("in-flight form submission results", () => {
  it.each([409, 503])("retains HTTP %i after the submitted input is cleared", async (status) => {
    const Message = schema({ id: fields.ID(), text: fields.Str({ required: true }) });
    const Messages = resource({
      name: "messages",
      url: "messages",
      schema: Message,
      key: "id",
      operations: { create: operation.create() },
    });
    const response = deferred<TransportResponse<unknown>>();
    const started = deferred<unknown>();
    const api = createUiCogs({
      resources: [Messages],
      transport: {
        request: (request) => {
          started.resolve(request.body);
          return response.promise;
        },
      },
    });
    const form = api
      .resource(Messages)
      .form(Message.keep("text").toForm({ mode: "create" }), { text: "Sent message" });
    try {
      const pending = form.submit();
      expect(await started.promise).toEqual({ text: "Sent message" });
      form.set("text", "");
      expect(form.submitting).toBe(true);
      response.resolve({ status, data: { message: "Message could not be sent" } });
      const result = await pending;
      expect(result).toMatchObject({ success: false, failure: { status } });
      if (result.success) throw new Error("Expected submission to fail");
      expect(form.error).toEqual(result.failure);
      expect(form.values.text).toBe("");
      expect(form.initialValues.text).toBe("Sent message");
      expect(form.dirty).toBe(true);
      expect(form.issues).toEqual([]);
      expect(form.unboundIssues).toEqual([]);
      expect(form.submitting).toBe(false);
      expect(form.progress.active).toBe(false);
    } finally {
      form.dispose();
      api.dispose();
    }
  });

  it.each(["cancel", "reset", "dispose"] as const)(
    "ignores late failures after %s",
    async (method) => {
      const response = deferred<unknown>();
      const started = deferred<void>();
      const form = createFormController(
        schema({ text: fields.Str() }).toForm(),
        { text: "Sent" },
        () => {
          started.resolve();
          return response.promise;
        },
      );
      const pending = form.submit();
      await started.promise;
      form[method]();
      const afterCancellation = form.getSnapshot();
      response.reject(
        new RequestError({ kind: "server", status: 503, issues: [], retryable: true }),
      );
      await expect(pending).resolves.toMatchObject({ success: false, failure: { status: 503 } });
      expect(form.getSnapshot()).toBe(afterCancellation);
      expect(form.error).toBeUndefined();
      expect(form.submitting).toBe(false);
      form.dispose();
    },
  );

  it("preserves newer validation issues while retaining the submission failure", async () => {
    const response = deferred<unknown>();
    const started = deferred<void>();
    const form = createFormController(
      schema({ text: fields.Str({ required: true }) }).toForm(),
      { text: "Sent" },
      () => {
        started.resolve();
        return response.promise;
      },
    );
    const pending = form.submit();
    await started.promise;
    form.set("text", "");
    await form.validate();
    const issues = form.issues;
    expect(issues.length).toBeGreaterThan(0);
    const failure: NormalizedFailure = {
      kind: "validation",
      status: 422,
      retryable: false,
      issues: [
        {
          path: ["text"],
          message: "Old field error",
          code: "server",
          source: "server",
          severity: "error",
        },
        { path: [], message: "Old summary", code: "server", source: "server", severity: "error" },
      ],
    };
    response.reject(new RequestError(failure));
    await pending;
    expect(form.error).toEqual(failure);
    expect(form.issues).toBe(issues);
    expect(form.unboundIssues).toEqual([]);
    expect(form.values.text).toBe("");
    form.dispose();
  });

  it("does not replace or commit the newer draft when the older submission succeeds", async () => {
    const response = deferred<unknown>();
    const started = deferred<void>();
    const form = createFormController(
      schema({ text: fields.Str() }).toForm(),
      { text: "Sent" },
      () => {
        started.resolve();
        return response.promise;
      },
    );
    const pending = form.submit();
    await started.promise;
    form.set("text", "Next draft");
    response.resolve({ id: 1 });
    await expect(pending).resolves.toMatchObject({ success: true });
    expect(form.values.text).toBe("Next draft");
    expect(form.initialValues.text).toBe("Sent");
    expect(form.dirty).toBe(true);
    expect(form.error).toBeUndefined();
    expect(form.submitting).toBe(false);
    form.dispose();
  });
});
