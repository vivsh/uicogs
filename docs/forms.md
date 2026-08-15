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

## Route-Bound Filter Forms

For a shareable list page, let the URL own filter state instead of making `UcFilter`
load a collection directly. `useRouteForm()` creates a normal query-mode form whose
successful submission pushes one canonical route location; browser navigation resets its
draft from that location.

```ts
const route = useRouteState({ route: "tasks", query: TaskFilters });
const filterForm = useRouteForm({ route, schema: TaskFilters });
```

```vue
<UcFilter :form="filterForm" />
```

Do not pass `collection` in this case: `useRouteCollection()` or `useRouteResource()`
watches the URL and performs the matching load. `UcFilter` still accepts `collection`
for the direct, non-route-bound pattern and retains its existing load-on-success behavior.
When that reload fails, `UcFilter` displays its normal failure notification and emits
`load-failure`; use `failure-message` to provide a local fallback. A route-bound
collection retains its error state and can also expose failures through
`useRouteCollection({ onFailure })` (or `useRouteResource({ onCollectionFailure })`).

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

Error-adapter precedence is operation/query, resource/service, runtime, response profile,
then fallback.

The first adapter returning a failure wins.

`@uicogs/http` provides:

```text
responseAdapters.vyuh
responseAdapters.drf
responseAdapters.laravel
responseAdapters.springData
responseAdapters.jsonApi
responseAdapters.graphqlConnection

drfErrors
problemDetailsErrors
jsonApiErrors
graphqlErrors
vyuhErrors
laravelErrors
```

Use a response profile when one backend contract should own success envelopes,
pagination, and errors together. Standalone error adapters remain useful as granular
overrides. See [Response adapters](response-adapters.md).

Adapters emit wire paths. Schema wire aliases map those paths back to form field names.

Mapped issues appear in field state.

Unknown paths remain in `unboundIssues` and should be shown in the form summary.

A safe plain-text `400` or `422` response becomes an unbound issue automatically.
UiCogs normalizes and limits that snippet to 280 characters; HTML response bodies are
never surfaced. Authentication, permission, method, and server failures use safe
status-specific messages instead.

Editing one field clears only issues attached to that field.

## Quasar Forms

`UcForm` renders one controller.

Its controller's form definition determines the field set. `UcField` slots choose
placement and component overrides; they do not add fields to the payload or remove
enabled fields from validation.

`UcField` resolves the field's semantic editor descriptor.

### Markdown, rich text, and temporal editors

`@uicogs/quasar` generates native Quasar field controls for `RichText`, `Markdown`,
`Date`, `Time`, `DateTime`, and `DateRange`. Date and range fields use popup pickers but
retain UiCogs' `Date` and immutable tuple contracts; date-only values use a fixed UTC
calendar representation to avoid timezone day shifts.

Markdown fields provide Edit and Preview controls. Preview rendering uses UiCogs'
sanitized Markdown renderer; raw Markdown remains unchanged in form values and payloads.
Use `UcMarkdown` when an application needs the same safe rendered output outside a form.

```vue
<UcField name="body" />
<UcMarkdown :source="article.body" />
```

Nullable `Bool` fields render as three-state Quasar checkbox or switch controls. They
cycle `null`, `true`, and `false`; use `editor.Checkbox({ toggleIndeterminate: false })`
when null should display but not be selectable by interaction.

Textarea, rich-text, and Markdown editors use the browser's native bottom-right resize
handle by default. The default is vertical-only; choose `resize: "both"` to allow width
changes or `resize: false` for a fixed editor. Use `rows` to set the initial height:
textarea and Markdown pass it directly to Quasar, while rich text converts it to an
approximately equivalent minimum editable height that follows the current font size.
`autogrow: true` takes precedence and intentionally disables manual resizing, since two
competing height controls make the result unpredictable.

```ts
fields.Text({ editor: editor.Textarea({ rows: 6, resize: "both" }) });
fields.RichText({ editor: editor.RichText({ rows: 10, resize: false }) });
fields.Markdown({ editor: editor.Markdown({ rows: 8 }) });
```

`UcSubmit` submits the controller and defaults to Quasar's `primary` color. `UcButton`
is the matching presentation-only button for custom links, toggles, and auxiliary controls.

The components do not own validation rules. Every enabled form field participates even when no component is mounted.

### Responsive form and filter layout

Fields can carry reusable responsive presentation intent. `UcForm` reads `layout.form`;
`UcFilter` reads `layout.filter`, so an ordinary edit form and a horizontal filter row
can give the same field different widths without duplicating its schema.

```ts
const TaskFilters = schema({
  search: fields.Str({
    layout: {
      form: { xs: 12 },
      filter: { xs: 12, md: 5, placement: "static" },
    },
  }),
  createdAfter: fields.Date({
    layout: { filter: { xs: 12, sm: 6, md: 3, placement: "collapsible" } },
  }),
});
```

Responsive values are `1` through `12`, `"auto"`, `"grow"`, or `"shrink"`.
The Quasar adapter maps them to its native `col-*` classes; schemas remain free of
Quasar class names. `placement: "collapsible"` has meaning only in `UcFilter`.

Use app-wide defaults through the existing Quasar skin installation:

```ts
injectSkin(
  app,
  defineSkin({
    layout: {
      form: { mode: "stack", gutter: "md", size: "md", default: { xs: 12 } },
      filter: {
        mode: "grid",
        gutter: "md",
        size: "sm",
        default: { xs: 12, md: 4 },
        kinds: { boolean: { xs: "auto" }, textarea: { xs: 12 } },
      },
    },
  }),
);
```

`UcForm` also accepts a local `layout` override. Generated `UcFilter` fields with
`placement: "static"` render first; optional fields are hidden until expanded. Bind
`v-model:expanded` when that disclosure state belongs to the page.

`gutter` defaults to `"md"` for both surfaces. Stack layouts use Quasar's
`q-gutter-y-*` utility between members; grid layouts use matching `q-col-gutter-*`
and `q-row-gutter-*` utilities. Set `gutter: "none"` when a custom layout owns all
spacing.

### Generated control density and size

`UcForm` and `UcFilter` accept `dense` and `size` directly, and the same defaults can
be declared in `layout.form` and `layout.filter`. `size` is intentionally limited to
`"sm"` and `"md"`: small controls use Quasar's 40px dense field geometry with 12px
text, while medium controls use 56px regular geometry with 14px text. A small size
defaults to dense; an explicit `dense` prop can override that geometry while retaining
the chosen text scale.

```vue
<UcForm :form="editor" size="md" />
<UcFilter :form="filters" size="sm" />
<UcFilter :form="filters" size="md" dense />
```

When a surface has a size or dense setting, generated `UcField` editors and UiCogs
buttons share one resolved density and typography scale. Only actions that share an
inline grid row with fields receive an explicit matching control height. Raw `QBtn`
and application-provided custom editors remain application-owned. `"lg"` is deliberately
unsupported because Quasar has no public per-instance large-field geometry contract.

Field density does not make generated buttons dense: Quasar's `QBtn dense` also removes
most horizontal padding. UiCogs instead preserves normal button padding and uses an
explicit height only for inline action rows. Set `dense` directly on `UcButton` when a
compact application button is genuinely wanted.

```vue
<UcFilter v-model:expanded="moreFilters" :form="filterForm">
  <template #actions="{ expanded, hasCollapsible, toggleExpanded }">
    <UcSubmit label="Apply" />
    <UcButton v-if="hasCollapsible" flat @click="toggleExpanded()">
      {{ expanded ? "Fewer filters" : "More filters" }}
    </UcButton>
  </template>
</UcFilter>
```

`#actions` is shared by `UcForm` and `UcFilter`. Forms render it after their fields;
generated filters render it inline beside static filters. Keep page/list actions in
`UcResourceView #tools` and object actions in `detail-actions`.

### Action rows

`UcActions` is the shared Quasar-native action-row container. `UcForm` and `UcFilter`
create it automatically, so custom action slots normally contain only buttons. Use
`UcButton` rather than a raw `QBtn` when a custom button should share UiCogs' stable
`uc-button` hook; raw `QBtn` remains fully application-owned.

```vue
<UcForm :form="form" action-layout="inline">
  <template #actions>
    <UcSubmit label="Save" />
    <UcButton flat label="Cancel" @click="cancel()" />
  </template>
</UcForm>
```

`action-layout` defaults to `"footer"`. Set it to `"inline"` only when actions share a
horizontal grid row with fields. Those actions receive the same explicit visible-control
height as generated fields and align to the row start; they never stretch to a field's
hint or validation-message area. At `xs`, the action region becomes a full row and its
buttons wrap safely. Stacked forms, form footers, table tools, and detail actions retain
Quasar's natural button height, even when their containing form has a UiCogs size.

### Quasar skin and CSS hooks

`@uicogs/quasar` can apply one typed, application-scoped skin. Install it before the
Vue app mounts. Palette roles map only to Quasar's existing `--q-*` variables at that
application's root; UiCogs does not create a second token system.

```ts
import { defineSkin, injectSkin } from "@uicogs/quasar";

injectSkin(
  app,
  defineSkin({
    palette: { primary: "#5b4bdb", negative: "#c62828" },
    form: { class: "app-form" },
    field: { outlined: true, bgColor: "grey-2", class: "app-form__field" },
  }),
);
```

Use `skin` on a form for local form and field overrides. A field skin may instead be
one callback receiving `{ name, field, form }`, which is useful for state such as
`form.field(name).dirty`. Set `hideBottomSpace: true` when compact fields should not
reserve Quasar's empty hint/error area; errors then expand the field only when shown.
Field appearance merges application skin, form skin,
editor configuration, then UiCogs-required bindings. Model values, validation errors,
choices, and readonly behavior therefore cannot be replaced by a skin.

```vue
<UcForm :form="form" :skin="{ field: { dense: true, bgColor: 'grey-1' } }">
  <UcField name="title" />
</UcForm>
```

The following stable classes are always emitted as applicable: `uc-form`,
`uc-form__grid`, `uc-form__field`, `uc-form__actions`, `uc-filter__static`,
`uc-filter__collapsible`, `uc-filter__actions`; `uc-field`, `uc-field-<editor-kind>`,
and `uc-field-<schema-name>`. For example,
`uc-field-password` and `uc-field-internal_note` are safe CSS hooks for app styling.
They merge with skin and editor classes.
