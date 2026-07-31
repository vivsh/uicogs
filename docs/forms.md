# Forms, Files, And Server Failures

This guide describes form definitions and form controllers.

## Form Definition

A form definition is immutable.

```ts
const TaskEdit = Task.keep("title", "complete")
  .extend({
    confirmation: fields.Bool({ required: true }),
    attachment: fields.File(),
  })
  .toForm({
    mode: "patch",
    encoding: "auto",
    validate: ({ confirmation }) => (confirmation ? undefined : "Confirmation is required"),
    write: ({ title, complete, attachment }) => ({
      title,
      complete,
      attachment,
    }),
  });
```

Form-only fields do not alter the entity schema.

Supported modes are:

```text
create | replace | patch | query | custom
```

The form writer returns the exact operation payload. A narrow edit form does not need server-owned required entity fields.

The form definition is the authoritative editable-field and payload boundary. Define a
different `keep`, `drop`, `extend`, or `toForm()` definition when validation or writing
changes. `UcForm` may receive an optional read-only view only to choose its generated
controls; every view field must already exist in the form definition. It cannot add
fields, change validation, or become form input.

## Create A Controller

Bind a create form to a resource.

```ts
const form = api.resource(Tasks).form(TaskCreate);
```

Bind an edit form to an object.

```ts
const form = api.resource(Tasks).get(42).form(TaskEdit);
```

The controller owns an isolated draft. Editing the draft never mutates cached entity data.

## Render A Form View

Pass a schema view when the default `UcForm` controls should render a display subset of
an otherwise unchanged form. Slots remain fully explicit and are unaffected by `view`.

```vue
<UcForm :form="form" :view="TaskEditor">
  <!-- omit this slot to generate TaskEditor's fields -->
</UcForm>
```

```ts
const TaskEditor = Task.keep("title", "complete").view({
  fields: ["title", "complete"],
});
```

The view must be a subset of `form.schema.fields`. A form must still include every
value required for its validation and writer; make a narrower form definition instead
when those semantics change.

## State

```ts
form.values;
form.initialValues;
form.dirty;
form.valid;
form.validating;
form.submitting;
form.progress;
form.issues;
form.unboundIssues;
form.error;
form.baseStale;
```

`values` and `initialValues` are immutable snapshots.

`baseStale` means the cached base changed while the form had local edits. UiCogs preserves the draft.

## Commands

```ts
form.set("title", "Updated");
form.enable("attachment", false);
form.field("title");

await form.validate();
await form.validateField("title", { debounceMs: 200 });

form.reset();
form.rebase(newBaseValues);
form.cancel();
form.dispose();
```

`set()` marks the field touched, recalculates dirty state, invalidates prior validation, and clears issues for that field.

`enable()` controls validation participation explicitly. Mounting or unmounting a UI field does not change validation participation.

`reset()` replaces the draft and base.

`rebase()` changes the comparison base without overwriting the draft.

`cancel()` aborts validation and submission.

`dispose()` also removes the base subscription.

## Submission

```ts
const result = await form.submit();

if (result.success) {
  console.log(result.value);
} else {
  console.log(result.failure);
}
```

Expected validation and request failures are discriminated values.

```ts
type SubmitResult<T> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly failure: NormalizedFailure };
```

A missing submit operation is a programming error and throws.

A second submission while one is active returns an operation failure. It does not start another request.

Submission order is:

1. Parse the draft.
2. Run field validation.
3. Run schema validation.
4. Run the form validator.
5. Run the form writer once.
6. Select body encoding.
7. Execute the bound operation.

Late responses from an old submission generation cannot overwrite a newer draft.

## Automatic Body Encoding

Form and operation encoding may be:

```text
auto | json | multipart
```

`auto` is the normal choice.

The writer runs before encoding selection.

`auto` selects JSON when no binary value remains.

`auto` selects `FormData` when a `File`, `Blob`, or local file wrapper remains.

Forcing JSON while binary data remains throws `MultipartEncodingError` instead of serializing the binary value as an empty object.

Direct `FormData` is accepted.

## File Values

UiCogs distinguishes remote, local, and removed files.

```ts
const existing = remoteFile("/files/brief.pdf", "brief.pdf");
const replacement = localFile(selectedFile);
const removed = removedFile();
```

An unchanged remote file is omitted from a patch payload.

A local file becomes a real `File` or `Blob` part.

A removed file uses the multipart adapter's removal convention.

UiCogs does not create zero-byte placeholder files.

## Multipart Paths

The default adapter uses dotted paths.

```text
profile.avatar
items.0.file
items.1.file
```

Top-level scalar and file arrays use repeated names.

Binary-containing nested objects are expanded recursively.

Pure non-binary nested objects remain JSON parts.

`multipartAdapter.brackets()` uses bracket paths.

`multipartAdapter.custom()` controls path and part generation.

Adapter precedence is:

1. Custom operation request.
2. Operation configuration.
3. Form configuration.
4. Runtime HTTP default.
5. Dotted-path default.

Cycles and unsupported binary values produce a structured encoding error with a path.

Do not set multipart `Content-Type`. Fetch must add the boundary.

## Upload Progress

The default Fetch transport reports indeterminate upload progress.

It emits a start state and a successful completion state. It does not invent a percentage.

Cancellation or failure does not emit completion.

## Server Failures

The normalized failure shape is:

```ts
interface NormalizedFailure {
  readonly kind:
    | "validation"
    | "authentication"
    | "permission"
    | "not-found"
    | "conflict"
    | "rate-limit"
    | "network"
    | "server"
    | "unknown";
  readonly status?: number;
  readonly message?: string;
  readonly issues: readonly ValidationIssue[];
  readonly retryable: boolean;
}
```

Error-adapter precedence is operation, resource, runtime, then fallback.

The first adapter returning a failure wins.

`@uicogs/http` provides:

```text
drfErrors
problemDetailsErrors
jsonApiErrors
graphqlErrors
```

Adapters emit wire paths. Schema wire aliases map those paths back to form field names.

Mapped issues appear in field state.

Unknown paths remain in `unboundIssues` and should be shown in the form summary.

Editing one field clears only issues attached to that field.

## Quasar Forms

`UcForm` renders one controller.

Its controller's form definition determines the field set. `UcField` slots choose
placement and component overrides; they do not add fields to the payload or remove
enabled fields from validation.

`UcField` resolves the field's semantic editor descriptor.

`UcSubmit` submits the controller.

The components do not own validation rules. Every enabled form field participates even when no component is mounted.
