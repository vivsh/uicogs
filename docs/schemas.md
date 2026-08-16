# Schemas

This guide describes schema definitions. Schemas do not own runtime state.

## Create A Schema

Use the pure `schema()` factory.

```ts
import { editor, fields, filter, format, schema, sort } from "@uicogs/core";

const Task = schema({
  id: fields.ID(),
  title: fields.Str({
    required: true,
    minLength: 2,
    label: "Title",
    editor: editor.Text(),
    format: format.Text(),
    filter: filter.Contains(),
    sort: sort.Value(),
  }),
  complete: fields.Bool({ default: false }),
  label: fields.Computed({
    dependsOn: ["title"],
    get: ({ title }) => title.trim(),
  }),
});
```

`schema()` returns an immutable `Schema`. The shape map and all fields are immutable.

## Type Helpers

```ts
type TaskInput = Input<typeof Task>;
type TaskValue = Infer<typeof Task>;
type TaskPayload = Encoded<typeof Task>;
type TaskPatch = Patch<typeof Task>;
```

`Input` is accepted external input.

`Infer` is the parsed value.

`Encoded` is the output of `write()`.

`Patch` is a partial encoded payload.

Computed and non-writable fields are absent from `Encoded`.

## Field Options

Common field options are:

| Option                               | Meaning                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `required`                           | Missing input is a parse error                                               |
| `nullable`                           | `null` is accepted                                                           |
| `readonly`                           | The field is omitted from writes                                             |
| `writeonly`                          | The field is omitted from query and display-oriented workflows               |
| `default`                            | A value or factory used for missing input                                    |
| `empty`                              | Convert an empty string to `undefined`, preserve it, or convert it to `null` |
| `wireName`                           | Input and output alias                                                       |
| `label`, `help`, `metadata`          | Framework-neutral descriptive metadata                                       |
| `editor`, `format`, `filter`, `sort` | Semantic presentation descriptors                                            |
| `validate`                           | Synchronous or asynchronous validators                                       |
| `parse`                              | Custom structural parser                                                     |
| `write`                              | Custom payload writer                                                        |
| `query`                              | Custom query encoder                                                         |
| `readableWhen`, `writableWhen`       | Context-sensitive client access rules                                        |

Client access rules do not replace server authorization.

## Built-In Fields

Text fields:

```text
Str, Text, RichText, Email, Password, Phone
```

Numeric and boolean fields:

```text
ID, Int, Float, Bool
```

Temporal fields:

```text
Date, DateTime, Time, DateRange
```

Choice and list fields:

```text
Enum, EnumList, StrList, IntList
```

Structured fields:

```text
Record, JSON, Unknown, Object, ObjectList
```

Binary fields:

```text
File, Image, FileList, ImageList
```

## Nullable Booleans

`nullable: true` makes the parsed Boolean value `boolean | null`. A form writes an
explicit null, while `schema.toQuery()` omits null so a nullable Boolean filter naturally
means “any value”.

Relation and derived fields:

```text
Ref, RefList, Computed
```

`Unknown` is an explicit trust-boundary field. Prefer `JSON` or a typed field when the structure is known.

`ID` is required, read-only, and numeric. Use another field plus a custom resource key encoder when the key has a different representation.

## Parsing And Writing

```ts
const value = Task.parse({ id: "4", title: "Review" });
const payload = Task.write(value);
```

`parse()` is synchronous. It returns a deeply frozen value. It throws `ParseError` when input is invalid.

`write()` applies field writers and wire aliases. It omits read-only and computed fields.

`parsePartial()` and `writePartial()` are public low-level methods used by resource merge and patch workflows. Normal entity creation should use `parse()`.

## Unknown Keys

Unknown keys are stripped by default.

Set schema options at construction.

```ts
const StrictTask = schema({ id: fields.ID(), title: fields.Str() }, { unknownKeys: "strict" });

const OpenTask = schema({ id: fields.ID() }, { unknownKeys: "passthrough" });
```

`strict` reports an `unknown_key` parse issue.

`passthrough` retains unknown keys in the runtime value.

## Composition

Every composition method returns a new schema.

```ts
const Summary = Task.keep("id", "title");
const Editable = Task.drop("id", "label");
const Extended = Task.extend({ note: fields.Text() });
const Modified = Task.modify({
  title: (field) => field.modify({ editor: editor.Textarea() }),
});
const Combined = Task.merge(AnotherSchema);
const Ordered = Task.reorder("title", "complete", "id");
const Optional = Task.partial();
const Required = Optional.required();
```

Supported composition methods are:

```text
get, keep, drop, extend, modify, merge, reorder, partial, required
```

Replacing a field keeps its position. New fields append. The source schema remains unchanged.

## Query Schemas

`toQuery()` returns a schema with optional fields.

```ts
const TaskQuery = schema({
  search: fields.Str(),
  complete: fields.Bool(),
}).toQuery();
```

Filter-only fields belong in query schemas. They do not belong in the entity schema.

Calling `toQuery(values)` on a schema encodes defined, non-empty values with field query writers and wire aliases.

## Form Schemas

`toForm()` returns an immutable form definition.

```ts
const TaskEdit = Task.keep("title", "complete").toForm({ mode: "patch" });
```

A form schema is not a controller. Bind it to a runtime resource or object to create a form controller.

A form definition owns the editable field set and writer. Create another immutable form
definition when a screen needs different validation or payload fields. `UcForm` can use
an optional view as a generated-control subset, but that read-only view cannot replace a
form definition because it has no writer.

See [Forms](forms.md).

## Views

A view is a read-only projection.

```ts
const TaskSummary = Task.view({
  fields: ["id", "title"],
  computed: {
    shortTitle: fields.Computed({
      dependsOn: ["title"],
      get: ({ title }) => title.slice(0, 20),
    }),
  },
});
```

Views can be operation and query outputs. Views cannot write payloads. Calling a view writer throws.

Views do not create separate cache entities.

Use a view to declare the read-side projection for a table, detail panel, export, or
query output. The projection must include the resource key when it represents remote
resource entities.

## Class And Decorator Syntax

Decorator syntax is first-class.

```ts
import { struct } from "@uicogs/core";

@struct.Struct()
class TaskModel {
  @struct.ID()
  readonly id!: number;

  @struct.Str({ required: true })
  title!: string;

  display(): string {
    return this.title.trim();
  }
}

const TaskClass = struct.toSchema(TaskModel);
const value = TaskClass.parse({ id: 1, title: "Review" });

value.display();
```

Parsed class values retain their prototype. The final instance is frozen. Methods must not mutate entity fields.

Object and decorator syntax use the same `Schema` runtime.

## Context-Sensitive Schemas

Declare the context type explicitly only when a definition reads context.

```ts
interface AppContext {
  readonly locale: string;
}

const Label = schema.withContext<AppContext>()({
  value: fields.Str({
    required: true,
    writableWhen: (context) => context.locale === "en",
  }),
});
```

The runtime binds its immutable context store to registered definitions without mutating them.

Application calls do not pass context to `parse()`, `validate()`, or `write()`.

Parsing never reads context. Validation, writers, computed fields, and access policies may read context.

## Runtime Metadata

`schema.describe()` returns frozen field descriptors without parser, writer, validator, computed function, or nested schema functions.

Use `field.options` when a framework adapter needs the complete runtime field declaration.

Descriptor factories are exported as `editor`, `format`, `filter`, and `sort`. They contain semantic options. They do not contain Vue or Quasar components.
