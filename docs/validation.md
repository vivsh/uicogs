# Parsing And Validation

This guide defines the trust boundary and validation order.

## Parsing

Parsing is synchronous and structural.

```ts
const value = Task.parse(externalInput);
```

Parsing handles:

- object shape checks;
- wire aliases;
- missing required values;
- defaults;
- empty-value policy;
- nullability;
- scalar conversion;
- nested object parsing;
- relation input parsing;
- unknown-key policy;
- computed-field materialization.

Parsing does not run remote checks. Parsing does not read runtime context.

Invalid input throws `ParseError`.

```ts
try {
  Task.parse(input);
} catch (error) {
  if (error instanceof ParseError) {
    console.log(error.issues);
  }
}
```

UiCogs does not provide `safeParse`, `parseAsync`, or `safeParseAsync`.

## Validation

Validation has one API.

```ts
const result = await Task.validate(value);
```

`validate()` always returns a promise. A validator may return immediately or await work.

```ts
const Title = fields.Str<AppContext>({
  validate: [
    ({ value }) => (value.trim() ? undefined : "Title is required"),
    async ({ value, context, signal }) => {
      const available = await context.names.isAvailable(value, signal);
      return available ? undefined : "Title is already used";
    },
  ],
});
```

Field validators receive:

```ts
{
  value;
  root;
  context;
  signal;
  issue(message, code?);
}
```

Schema validators receive:

```ts
{
  value;
  context;
  signal;
  issue(path, message, code?);
}
```

## Validation Order

The order is deterministic.

1. The form parses its current values.
2. Nested field validation runs.
3. Field validators run in schema field order.
4. Schema validators run in declaration order.
5. The form validator runs.
6. The writer runs only after successful validation.

Validation failures are values. A validator should not throw for expected invalid input.

## Validator Results

A validator may return:

```text
undefined or true       -> no issue
false                   -> generic invalid issue
string                  -> one client issue
ValidationIssue         -> one issue
ValidationIssue[]       -> several issues
Promise of any above    -> asynchronous result
```

Thrown exceptions are programming or dependency failures. They are not converted into an ordinary validation issue by the schema.

## Issue Shape

```ts
interface ValidationIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
  readonly code: string;
  readonly source: "parse" | "client" | "server";
  readonly severity: "error" | "warning";
  readonly metadata?: Readonly<Record<string, unknown>>;
}
```

Paths are structured.

```ts
["address", "city"][("items", 0, "title")];
```

Do not flatten paths into dotted strings inside application logic.

## Cancellation

Pass an `AbortSignal` when validation belongs to a cancellable workflow.

```ts
const controller = new AbortController();
const pending = Task.validate(value, { signal: controller.signal });

controller.abort();
await pending;
```

Validators must pass the signal to cancellable dependencies.

Form controllers create validation generations. A new generation aborts the old generation. Results from stale generations are ignored.

Submission validation runs immediately. It is not delayed by interactive debounce policy.

## Forms

Forms convert `ParseError` issues into ordinary form issues.

Field-level validation uses the same definitions as full-form validation. Mounted UI fields do not control validation participation.

Editing a field clears server issues for that field. It does not clear unrelated server issues.

See [Forms](forms.md).
