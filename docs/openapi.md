# OpenAPI

`@uicogs/openapi` reads OpenAPI 3.0 and 3.1 documents.

Build-time generation is the primary workflow. Runtime reading is available for tooling.

## Command

```sh
pnpm exec uicogs-openapi generate \
  ./openapi.yaml \
  --output ./src/generated/api.ts \
  --strict
```

The input may be JSON or YAML.

`--strict` fails when generation produces a warning. Use strict mode in continuous integration.

## Generated Module

The generated module exports `createGeneratedDefinitions()`.

```ts
import { createGeneratedDefinitions } from "./generated/api";

const generated = createGeneratedDefinitions();

generated.schemas;
generated.operations;
generated.queries;
generated.resources;
```

Generated definitions are pure. They do not require a UiCogs runtime.

The generated file imports `fields` and `schema` from `@uicogs/core`. The file does not construct a cache, transport, or controller.

## Schema Mapping

The generator maps these OpenAPI properties:

- required properties
- nullable properties
- `readOnly` and `writeOnly`
- enums and constants
- arrays and objects
- typed additional properties
- local and component references
- `allOf`
- discriminated `oneOf`
- common string and numeric formats
- length, range, and pattern constraints

Unsupported unions become typed JSON and produce a warning. Unsafe cyclic references also produce a warning. Strict mode rejects both cases.

## Operation Mapping

Generated operation metadata contains:

- the HTTP method
- the path
- query schemas
- request-body schemas
- request encoding
- response schemas
- response and resource hints

The generator does not invent application behavior. Presentation descriptors, local validators, relations, cache policies, and custom actions remain explicit application definitions.

## Composition

Do not edit generated files.

Compose generated schemas in another module.

```ts
import { editor, format } from "@uicogs/core";
import { createGeneratedDefinitions } from "./generated/api";

const generated = createGeneratedDefinitions();

export const Task = generated.schemas.Task.modify({
  title: (field) =>
    field.modify({
      editor: editor.Text(),
      format: format.Text(),
    }),
});
```

Composition returns a new immutable schema. The generated schema remains unchanged.

## Determinism

The same document and options produce the same TypeScript output.

The repository verifies the neutral fixture against [the committed generated output](../tests/openapi-generated/api.ts). The generator tests are in [generator.test.ts](../packages/openapi/src/generator.test.ts).
