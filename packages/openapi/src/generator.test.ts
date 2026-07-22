import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { generateOpenApi, readOpenApi, type OpenApiDocument } from "./index.js";

describe("OpenAPI generation", () => {
  it("reads JSON documents and rejects unsupported document versions", async () => {
    const document = await readOpenApi("tests/openapi-fixtures/neutral.json");
    expect(document.openapi).toBe("3.1.0");
    expect(await readOpenApi(document)).toBe(document);
    await expect(readOpenApi({ openapi: "2.0", paths: {} })).resolves.toMatchObject({
      openapi: "2.0",
    });
    expect(() => generateOpenApi({ openapi: "2.0" })).toThrow("OpenAPI 3.0 and 3.1");
  });

  it("generates deterministic schema registration", () => {
    const document: OpenApiDocument = {
      openapi: "3.1.0",
      components: {
        schemas: {
          Project: {
            type: "object",
            required: ["id", "name"],
            properties: { name: { type: "string" }, id: { type: "integer", readOnly: true } },
          },
        },
      },
    };
    const first = generateOpenApi(document);
    const second = generateOpenApi(document);
    expect(first.code).toBe(second.code);
    expect(first.code).toContain("fields.Int({ required: true, readonly: true })");
  });

  it("generates references, nested arrays, formats, operations, and resource hints", () => {
    const document: OpenApiDocument = {
      openapi: "3.0.3",
      components: {
        schemas: {
          Address: {
            type: "object",
            required: ["city"],
            properties: { city: { type: "string" } },
          },
          Project: {
            type: "object",
            required: ["id", "ownerEmail"],
            properties: {
              id: { type: "integer", readOnly: true },
              ownerEmail: { type: "string", format: "email" },
              address: { $ref: "#/components/schemas/Address" },
              tags: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
      paths: {
        "/projects/": {
          get: {
            operationId: "listProjects",
            tags: ["projects"],
            parameters: [{ name: "search", in: "query", schema: { type: "string" } }],
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { type: "array", items: { $ref: "#/components/schemas/Project" } },
                  },
                },
              },
            },
          },
          post: {
            operationId: "createProject",
            tags: ["projects"],
            requestBody: {
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Project" } },
              },
            },
            responses: {
              "201": {
                content: {
                  "application/json": { schema: { $ref: "#/components/schemas/Project" } },
                },
              },
            },
          },
        },
      },
    };

    const result = generateOpenApi(document, { strict: true });
    expect(result.code.indexOf("const Address")).toBeLessThan(result.code.indexOf("const Project"));
    expect(result.code).toContain("fields.Object(Address");
    expect(result.code).toContain("fields.StrList");
    expect(result.code).toContain("fields.Email");
    expect(result.code).toContain("const listProjectsQuery = schema");
    expect(result.code).toContain('encoding: "json"');
    expect(result.code).toContain('"url": "/projects/"');
  });

  it("reports unsupported unions and fails deterministic strict generation", () => {
    const document: OpenApiDocument = {
      openapi: "3.1.0",
      components: {
        schemas: {
          Payload: {
            type: "object",
            properties: { value: { oneOf: [{ type: "string" }, { type: "number" }] } },
          },
        },
      },
    };
    expect(generateOpenApi(document).warnings[0]).toContain("oneOf");
    expect(() => generateOpenApi(document, { strict: true })).toThrow("oneOf");
  });

  it("maps scalar formats, constraints, nullability, constants, and arrays", () => {
    const result = generateOpenApi({
      openapi: "3.1.0",
      components: {
        schemas: {
          Values: {
            type: "object",
            required: ["password", "score", "enabled"],
            properties: {
              password: {
                type: "string",
                format: "password",
                minLength: 8,
                maxLength: 80,
                pattern: "^[A-Z]",
              },
              birthday: { type: ["string", "null"], format: "date", default: null },
              occurredAt: { type: "string", format: "date-time" },
              startsAt: { type: "string", format: "time" },
              upload: { type: "string", format: "binary", writeOnly: true },
              score: { type: "number", minimum: 0, maximum: 100 },
              enabled: { type: "boolean" },
              state: { enum: ["draft", "ready"] },
              fixed: { const: "value" },
              states: { type: "array", items: { enum: ["draft", "ready"] } },
              counts: { type: "array", items: { type: "integer" } },
              children: {
                type: "array",
                items: {
                  type: "object",
                  required: ["name"],
                  properties: { name: { type: "string" } },
                },
              },
            },
          },
        },
      },
    });

    expect(result.warnings).toEqual([]);
    expect(result.code).toContain("fields.Password");
    expect(result.code).toContain("nullable: true");
    expect(result.code).toContain("fields.Date(");
    expect(result.code).toContain("fields.DateTime(");
    expect(result.code).toContain("fields.Time(");
    expect(result.code).toContain("fields.File({ writeonly: true })");
    expect(result.code).toContain("fields.Float({ required: true, min: 0, max: 100 })");
    expect(result.code).toContain("fields.Bool({ required: true })");
    expect(result.code).toContain('fields.Enum(["value"] as const');
    expect(result.code).toContain("fields.EnumList");
    expect(result.code).toContain("fields.IntList");
    expect(result.code).toContain("fields.ObjectList(schema");
  });

  it("maps inheritance, discriminated references, typed maps, and nullable 3.0 fields", () => {
    const result = generateOpenApi({
      openapi: "3.0.3",
      components: {
        schemas: {
          Base: {
            type: "object",
            required: ["id"],
            properties: { id: { type: "integer" } },
          },
          TextEvent: {
            allOf: [
              { $ref: "#/components/schemas/Base" },
              {
                type: "object",
                required: ["text"],
                properties: { text: { type: "string" } },
              },
            ],
          },
          NumberEvent: {
            allOf: [{ $ref: "#/components/schemas/Base" }],
            properties: { amount: { type: "number" } },
          },
          Envelope: {
            type: "object",
            properties: {
              event: {
                oneOf: [
                  { $ref: "#/components/schemas/TextEvent" },
                  { $ref: "#/components/schemas/NumberEvent" },
                ],
                discriminator: { propertyName: "kind" },
              },
              labels: { type: "object", additionalProperties: { type: "string" } },
              note: { type: "string", nullable: true },
            },
          },
        },
      },
    });

    expect(result.warnings).toEqual([]);
    expect(result.code).toContain("Base.merge(");
    expect(result.code).toContain('"discriminator":"kind"');
    expect(result.code).toContain("fields.Record(");
    expect(result.code).toContain("nullable: true");
  });

  it("generates stable operation names, inherited query fields, multipart hints, and responses", () => {
    const result = generateOpenApi({
      openapi: "3.1.0",
      paths: {
        "/projects/{project_id}/attachments/": {
          parameters: [
            { name: "project_id", in: "path", required: true, schema: { type: "integer" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          ],
          post: {
            parameters: [
              { name: "search-term", in: "query", required: true, schema: { type: "string" } },
            ],
            requestBody: {
              required: true,
              content: {
                "multipart/form-data": {
                  schema: {
                    type: "object",
                    required: ["file"],
                    properties: { file: { type: "string", format: "binary" } },
                  },
                },
              },
            },
            responses: {
              "204": { description: "Accepted" },
              "400": { description: "Invalid" },
            },
          },
        },
      },
    });

    expect(result.code).toContain("const post_projects_project_id_attachmentsQuery");
    expect(result.code).toContain('"search-term": fields.Str({ required: true })');
    expect(result.code).toContain("page: fields.Int({ default: 1 })");
    expect(result.code).toContain('encoding: "multipart"');
    expect(result.code).toContain("const post_projects_project_id_attachmentsInput = schema");
    expect(result.code).toContain("input: post_projects_project_id_attachmentsInput");
    expect(result.code).toContain('responses: Object.freeze(["204","400"])');
    expect(result.code).toContain('"url": "/projects/"');
  });

  it("warns for arrays without items, unknown types, scalar arrays, and cyclic references", () => {
    const document: OpenApiDocument = {
      openapi: "3.1.0",
      components: {
        schemas: {
          A: {
            type: "object",
            properties: {
              b: { $ref: "#/components/schemas/B" },
              values: { type: "array" },
              ratios: { type: "array", items: { type: "number" } },
              opaque: { type: "not-a-type" },
            },
          },
          B: {
            type: "object",
            properties: { a: { $ref: "#/components/schemas/A" } },
          },
        },
      },
    };
    const result = generateOpenApi(document);
    expect(result.warnings.some((warning) => warning.includes("cyclic"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("no items"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("array item type"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("unsupported schema type"))).toBe(
      true,
    );
    expect(result.code).toContain('metadata: { openapi: {"reference":"#/components/schemas/A"} }');
    expect(() => generateOpenApi(document, { strict: true })).toThrow("cyclic");
  });

  it("normalizes generated identifiers and supports a custom runtime import", () => {
    const result = generateOpenApi(
      {
        openapi: "3.1.0",
        components: {
          schemas: {
            "123-value": {
              type: "object",
              properties: { "display-name": { type: "string" } },
            },
          },
        },
        paths: {
          "/": { delete: { responses: { default: { description: "Done" } } } },
        },
      },
      { runtimeImport: "./runtime.js" },
    );
    expect(result.code).toContain('from "./runtime.js"');
    expect(result.code).toContain("const _123_value");
    expect(result.code).toContain('"display-name": fields.Str');
    expect(result.code).toContain("const delete_root");
  });

  it("keeps the checked-in fixture byte-for-byte deterministic", async () => {
    const document = await readOpenApi("tests/openapi-fixtures/neutral.yaml");
    const generated = await readFile("tests/openapi-generated/api.ts", "utf8");
    expect(generateOpenApi(document, { strict: true }).code).toBe(generated);
  });
});
