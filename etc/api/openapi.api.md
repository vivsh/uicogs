# @uicogs/openapi API

Declaration SHA-256: `2d49785f8d394e84fd1b0e8a3b5073c232587110c01f108ae974fd90f595a29d`

```ts
// cli.d.ts
#!/usr/bin/env node

// index.d.ts
interface OpenApiDocument {
    readonly openapi: string;
    readonly components?: {
        readonly schemas?: Readonly<Record<string, OpenApiSchema>>;
    };
    readonly paths?: Readonly<Record<string, OpenApiPathItem>>;
}
interface OpenApiSchema {
    readonly type?: string | readonly string[];
    readonly format?: string;
    readonly nullable?: boolean;
    readonly readOnly?: boolean;
    readonly writeOnly?: boolean;
    readonly enum?: readonly (string | number | boolean)[];
    readonly const?: string | number | boolean | null;
    readonly default?: unknown;
    readonly required?: readonly string[];
    readonly properties?: Readonly<Record<string, OpenApiSchema>>;
    readonly additionalProperties?: boolean | OpenApiSchema;
    readonly items?: OpenApiSchema;
    readonly $ref?: string;
    readonly allOf?: readonly OpenApiSchema[];
    readonly oneOf?: readonly OpenApiSchema[];
    readonly discriminator?: {
        readonly propertyName: string;
        readonly mapping?: Readonly<Record<string, string>>;
    };
    readonly minimum?: number;
    readonly maximum?: number;
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly pattern?: string;
    readonly minItems?: number;
    readonly maxItems?: number;
}
type OpenApiPathItem = Readonly<Record<string, OpenApiOperation | readonly OpenApiParameter[] | undefined>> & {
    readonly parameters?: readonly OpenApiParameter[];
};
interface OpenApiParameter {
    readonly name: string;
    readonly in: "query" | "path" | "header" | "cookie";
    readonly required?: boolean;
    readonly schema?: OpenApiSchema;
}
interface OpenApiMediaType {
    readonly schema?: OpenApiSchema;
}
interface OpenApiRequestBody {
    readonly required?: boolean;
    readonly content?: Readonly<Record<string, OpenApiMediaType>>;
}
interface OpenApiResponse {
    readonly description?: string;
    readonly headers?: Readonly<Record<string, unknown>>;
    readonly content?: Readonly<Record<string, OpenApiMediaType>>;
}
interface OpenApiOperation {
    readonly operationId?: string;
    readonly tags?: readonly string[];
    readonly parameters?: readonly OpenApiParameter[];
    readonly requestBody?: OpenApiRequestBody;
    readonly responses?: Readonly<Record<string, OpenApiResponse>>;
}
interface GenerateOptions {
    readonly strict?: boolean;
    readonly runtimeImport?: string;
}
interface GenerateResult {
    readonly code: string;
    readonly warnings: readonly string[];
}
declare function readOpenApi(input: string | OpenApiDocument): Promise<OpenApiDocument>;
declare function generateOpenApi(document: OpenApiDocument, options?: GenerateOptions): GenerateResult;

export { type GenerateOptions, type GenerateResult, type OpenApiDocument, type OpenApiMediaType, type OpenApiOperation, type OpenApiParameter, type OpenApiPathItem, type OpenApiRequestBody, type OpenApiResponse, type OpenApiSchema, generateOpenApi, readOpenApi };
```
