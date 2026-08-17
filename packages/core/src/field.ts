import {
  editor,
  format,
  type Choice,
  type Descriptor,
  type EditorDescriptor,
  type FilterDescriptor,
  type FormatterDescriptor,
  type SortDescriptor,
} from "./descriptors.js";
import { clientIssue, parseIssue, type ValidationIssue, type ValidationResult } from "./issues.js";
import type { ErrorAdapter, TransportResponse } from "./transport.js";
import { deepFreeze, isRecord } from "./utils.js";

export type ValidatorResult =
  void | boolean | string | ValidationIssue | readonly ValidationIssue[];

export interface ValidatorInput<TValue, TContext> {
  readonly value: TValue;
  readonly root: Readonly<Record<string, unknown>>;
  readonly context: TContext;
  readonly signal: AbortSignal;
  readonly issue: (message: string, code?: string) => ValidationIssue;
}

type BivariantCallback<TArguments extends readonly unknown[], TResult> = {
  bivarianceHack(...arguments_: TArguments): TResult;
}["bivarianceHack"];

export type Validator<TValue, TContext = unknown> = BivariantCallback<
  [input: ValidatorInput<TValue, TContext>],
  ValidatorResult | Promise<ValidatorResult>
>;

export type EmptyValuePolicy = "undefined" | "preserve" | "null";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** A responsive grid cell understood by framework presentation adapters. */
export type FieldLayoutCell =
  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | "auto" | "grow" | "shrink";

/** Responsive field placement shared by generated form adapters. */
export interface ResponsiveFieldLayout {
  readonly xs?: FieldLayoutCell;
  readonly sm?: FieldLayoutCell;
  readonly md?: FieldLayoutCell;
  readonly lg?: FieldLayoutCell;
  readonly xl?: FieldLayoutCell;
}

/** Responsive filter placement with optional-filter disclosure semantics. */
export interface FilterFieldLayout extends ResponsiveFieldLayout {
  readonly placement?: "static" | "collapsible";
}

/** Field-owned presentation intent for generated form and filter surfaces. */
export interface FieldLayout {
  readonly form?: ResponsiveFieldLayout;
  readonly filter?: FilterFieldLayout;
}

export interface FieldConfig<TValue, TEncoded = TValue, TContext = unknown> {
  readonly required?: boolean;
  readonly nullable?: boolean;
  readonly readonly?: boolean;
  readonly writeonly?: boolean;
  readonly default?: TValue | (() => TValue);
  readonly empty?: EmptyValuePolicy;
  readonly wireName?: string;
  readonly label?: string;
  readonly editor?: EditorDescriptor | Descriptor;
  readonly format?: FormatterDescriptor | Descriptor;
  readonly filter?: FilterDescriptor | Descriptor;
  readonly sort?: string | SortDescriptor | Descriptor;
  readonly help?: string;
  readonly layout?: FieldLayout;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly validate?: readonly Validator<TValue, TContext>[];
  readonly parse?: (input: unknown) => TValue;
  readonly write?: BivariantCallback<[value: TValue, context: TContext], TEncoded>;
  readonly query?: BivariantCallback<[value: TValue, context: TContext], unknown>;
  readonly readableWhen?: BivariantCallback<[context: TContext], boolean>;
  readonly writableWhen?: BivariantCallback<[context: TContext], boolean>;
}

export interface NestedSchema<TInput = unknown, TValue = unknown, TEncoded = unknown> {
  readonly _input: TInput;
  readonly _output: TValue;
  readonly _encoded: TEncoded;
  parse(input: unknown): TValue;
  validate(value: TValue, options?: { readonly signal?: AbortSignal }): Promise<ValidationResult>;
  write(value: TValue): TEncoded;
}

export interface FieldRuntimeOptions<TValue, TEncoded, TContext> extends FieldConfig<
  TValue,
  TEncoded,
  TContext
> {
  readonly kind: string;
  readonly computed?: ComputedConfig<TValue, TContext>;
  readonly relation?: RelationConfig<unknown>;
  readonly nested?: NestedSchema;
  readonly nestedMany?: boolean;
  readonly choices?: readonly Choice[] | (() => readonly Choice[]);
  readonly multiple?: boolean;
}

export type FieldModification<TValue, TEncoded, TContext> = Partial<
  Omit<
    FieldRuntimeOptions<TValue, TEncoded, TContext>,
    "kind" | "required" | "readonly" | "writeonly" | "computed" | "relation" | "nested"
  >
>;

export class Field<
  TInput,
  TValue,
  TEncoded = TValue,
  TContext = unknown,
  TRequired extends boolean = false,
  TComputed extends boolean = false,
  TWritable extends boolean = true,
> {
  declare readonly _input: TInput;
  declare readonly _output: TValue;
  declare readonly _encoded: TEncoded;
  declare readonly _context: TContext;
  declare readonly _required: TRequired;
  declare readonly _computed: TComputed;
  declare readonly _writable: TWritable;

  readonly options: Readonly<FieldRuntimeOptions<TValue, TEncoded, TContext>>;

  constructor(options: FieldRuntimeOptions<TValue, TEncoded, TContext>) {
    this.options = deepFreeze({ ...options }) as Readonly<
      FieldRuntimeOptions<TValue, TEncoded, TContext>
    >;
    Object.freeze(this);
  }

  modify(
    options: FieldModification<TValue, TEncoded, TContext>,
  ): Field<TInput, TValue, TEncoded, TContext, TRequired, TComputed, TWritable> {
    return new Field({ ...this.options, ...options });
  }

  parse(input: unknown, path: readonly (string | number)[]): TValue {
    if (input === undefined || input === "") {
      if (input === "" && this.options.empty === "preserve") return input as TValue;
      if (input === "" && this.options.empty === "null" && this.options.nullable)
        return null as TValue;
      if (this.options.default !== undefined) {
        return typeof this.options.default === "function"
          ? (this.options.default as () => TValue)()
          : this.options.default;
      }
      if (this.options.required)
        throw new FieldParseFailure(parseIssue(path, "Field is required", "required"));
      return undefined as TValue;
    }
    if (input === null) {
      if (this.options.nullable) return null as TValue;
      throw new FieldParseFailure(parseIssue(path, "Null is not allowed", "null"));
    }
    try {
      return this.options.parse ? this.options.parse(input) : (input as TValue);
    } catch (error) {
      throw new FieldParseFailure(
        parseIssue(path, error instanceof Error ? error.message : "Invalid value"),
      );
    }
  }

  async validate(
    value: TValue,
    root: Readonly<Record<string, unknown>>,
    context: TContext,
    signal: AbortSignal,
    path: readonly (string | number)[],
  ): Promise<readonly ValidationIssue[]> {
    if (value === undefined || value === null || signal.aborted) return [];
    const issues = await validateNested(this.options, value, signal, path);
    for (const validator of this.options.validate ?? []) {
      if (signal.aborted) break;
      const result = await validator({
        value,
        root,
        context,
        signal,
        issue: (message, code) => clientIssue(path, message, code),
      });
      appendValidatorResult(issues, result, path);
    }
    return issues;
  }

  write(value: TValue, context: TContext): TEncoded {
    if (this.options.write) return this.options.write(value, context);
    if (this.options.nested) {
      if (this.options.nestedMany)
        return (value as readonly unknown[]).map((item) =>
          this.options.nested!.write(item),
        ) as TEncoded;
      return this.options.nested.write(value) as TEncoded;
    }
    return value as unknown as TEncoded;
  }

  toQuery(value: TValue, context: TContext): unknown {
    return this.options.query ? this.options.query(value, context) : this.write(value, context);
  }

  describe(): Readonly<Record<string, unknown>> {
    const options = Object.fromEntries(
      Object.entries(this.options).filter(
        ([name]) => !["parse", "write", "query", "validate", "computed", "nested"].includes(name),
      ),
    );
    return deepFreeze(options);
  }
}

export class FieldParseFailure extends Error {
  constructor(readonly issue: ValidationIssue) {
    super(issue.message);
  }
}

export interface StringConfig<TContext = unknown> extends FieldConfig<string, string, TContext> {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: RegExp;
  readonly trim?: boolean;
}

export interface NumberConfig<TContext = unknown> extends FieldConfig<number, number, TContext> {
  readonly min?: number;
  readonly max?: number;
}

export type BooleanConfig<TContext = unknown> = FieldConfig<boolean, boolean, TContext>;
export type DateConfig<TContext = unknown> = FieldConfig<Date, string, TContext>;
export type TimeConfig<TContext = unknown> = FieldConfig<string, string, TContext>;
export type DateRangeValue = readonly [Date, Date];

export interface ComputedConfig<TValue, TContext = unknown> {
  readonly dependsOn: readonly string[];
  readonly get: BivariantCallback<
    [value: Readonly<Record<string, unknown>>, context: TContext],
    TValue
  >;
  readonly format?: Descriptor;
}

export interface ResourceTarget<TEntity = unknown> {
  readonly resourceName: string;
  readonly _entity?: TEntity;
}

export interface RelationMutationContext {
  readonly sourceKey: string | number;
  readonly targetKeys: readonly (string | number)[];
}

export type RelationEndpointPath = string | ((context: RelationMutationContext) => string);

export interface RelationEndpointMutation {
  readonly kind: "endpoints";
  readonly add?: RelationEndpointPath;
  readonly remove?: RelationEndpointPath;
  readonly set?: RelationEndpointPath;
  readonly clear?: RelationEndpointPath;
  readonly method?: "POST" | "PUT" | "PATCH" | "DELETE";
  readonly body?: (
    action: "add" | "remove" | "set" | "clear",
    context: RelationMutationContext,
  ) => unknown;
}

export interface RelationParentMutation {
  readonly kind: "parent";
}

export type RelationMutation = RelationParentMutation | RelationEndpointMutation;

export interface ThroughRelationConfig<TThrough = ResourceTarget<unknown>> {
  readonly resource: TThrough;
  readonly source: string;
  readonly target: string;
  readonly orderBy?: string;
  readonly allowDuplicates?: boolean;
}

export type RelationKeyEncoding = "repeat" | "comma" | "brackets";

export interface RelationKeyFetchOptions<TContext = unknown> {
  readonly parameter?: string;
  readonly encoding?: RelationKeyEncoding;
  readonly path?: string;
  readonly encode?: (options: {
    readonly keys: readonly (string | number)[];
    readonly source: Readonly<Record<string, unknown>>;
    readonly context: TContext;
  }) => Readonly<Record<string, unknown>>;
  readonly decode?: (response: TransportResponse<unknown>) => readonly unknown[];
  readonly errorAdapters?: readonly ErrorAdapter[];
}

export interface RelationConfig<TTarget> {
  readonly resource: TTarget;
  readonly many?: boolean;
  readonly load?: "lazy" | "eager" | "included" | "manual";
  readonly from?: string;
  readonly to?: string;
  readonly included?: boolean;
  readonly label?: string | ((value: TargetEntity<TTarget>) => string);
  readonly query?: (source: Readonly<Record<string, unknown>>) => Readonly<Record<string, unknown>>;
  readonly sort?: string | ((value: TargetEntity<TTarget>) => unknown);
  readonly inverse?: string;
  readonly mutation?: RelationMutation;
  readonly through?: ThroughRelationConfig;
  readonly fetch?: RelationKeyFetchOptions;
}

export const relation = Object.freeze({
  parent(): RelationParentMutation {
    return Object.freeze({ kind: "parent" });
  },
  endpoints(options: Omit<RelationEndpointMutation, "kind">): RelationEndpointMutation {
    return Object.freeze({ kind: "endpoints", ...options });
  },
  byKeys<TContext = unknown>(
    options: RelationKeyFetchOptions<TContext> = {},
  ): RelationKeyFetchOptions<TContext> {
    return Object.freeze({ ...options });
  },
});

export type TargetEntity<T> = T extends { readonly _entity?: infer E }
  ? Exclude<E, undefined>
  : T extends { readonly definition: { readonly _entity?: infer E } }
    ? E
    : unknown;

export type RelationFieldConfig<
  TTarget,
  TValue,
  TEncoded,
  TContext = unknown,
> = RelationConfig<TTarget> & Omit<FieldConfig<TValue, TEncoded, TContext>, "label">;

export interface BinaryPart {
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface NamedBinaryPart extends BinaryPart {
  readonly name?: string;
}

export interface LocalFileValue {
  readonly kind: "local";
  readonly file: NamedBinaryPart;
  readonly name: string;
}

export interface RemoteFileValue {
  readonly kind: "remote";
  readonly url: string;
  readonly name: string;
  readonly mediaType?: string;
}

export interface RemovedFileValue {
  readonly kind: "removed";
}

export type FileValue = LocalFileValue | RemoteFileValue | RemovedFileValue;
export type FileInput = FileValue | NamedBinaryPart | string;
export type EncodedFile = NamedBinaryPart | null | undefined;

export function localFile(file: NamedBinaryPart, name = file.name ?? "file"): LocalFileValue {
  return Object.freeze({ kind: "local", file, name });
}

export function remoteFile(url: string, name = fileName(url), mediaType?: string): RemoteFileValue {
  return Object.freeze({
    kind: "remote",
    url,
    name,
    ...(mediaType ? { mediaType } : {}),
  });
}

export function removedFile(): RemovedFileValue {
  return Object.freeze({ kind: "removed" });
}

export function isBinaryPart(value: unknown): value is NamedBinaryPart {
  return (
    isRecord(value) &&
    typeof value.size === "number" &&
    typeof value.type === "string" &&
    typeof value.arrayBuffer === "function"
  );
}

export function isFileValue(value: unknown): value is FileValue {
  return (
    isRecord(value) &&
    (value.kind === "local" || value.kind === "remote" || value.kind === "removed")
  );
}

type RequiredOf<TConfig> = TConfig extends { readonly required: true } ? true : false;
type WritableOf<TConfig> = TConfig extends { readonly readonly: true } ? false : true;
type NullableOf<TConfig, TValue> = TConfig extends { readonly nullable: true }
  ? TValue | null
  : TValue;

type EnumEntry = string | number | Choice<string | number, unknown>;
type EnumValue<TEntries extends readonly EnumEntry[]> = TEntries[number] extends infer TEntry
  ? TEntry extends Choice<infer TValue, unknown>
    ? TValue
    : TEntry extends string | number
      ? TEntry
      : never
  : never;
type NormalizedChoice<TEntry extends EnumEntry> =
  TEntry extends Choice<infer TValue, infer TMeta> ? Choice<TValue, TMeta> : Choice<TEntry, never>;
type EnumChoices<TEntries extends readonly EnumEntry[]> = readonly NormalizedChoice<
  TEntries[number]
>[];
type EnumField<
  TEntries extends readonly EnumEntry[],
  TContext,
  TConfig extends FieldConfig<EnumValue<TEntries>, EnumValue<TEntries>, TContext>,
> = Field<
  EnumValue<TEntries>,
  NullableOf<TConfig, EnumValue<TEntries>>,
  EnumValue<TEntries>,
  TContext,
  RequiredOf<TConfig>,
  false,
  WritableOf<TConfig>
> & {
  readonly options: Readonly<
    FieldRuntimeOptions<EnumValue<TEntries>, EnumValue<TEntries>, TContext> & {
      readonly choices: EnumChoices<TEntries>;
    }
  >;
};
type EnumListField<
  TEntries extends readonly EnumEntry[],
  TContext,
  TConfig extends FieldConfig<
    readonly EnumValue<TEntries>[],
    readonly EnumValue<TEntries>[],
    TContext
  >,
> = Field<
  readonly EnumValue<TEntries>[],
  NullableOf<TConfig, readonly EnumValue<TEntries>[]>,
  readonly EnumValue<TEntries>[],
  TContext,
  RequiredOf<TConfig>,
  false,
  WritableOf<TConfig>
> & {
  readonly options: Readonly<
    FieldRuntimeOptions<
      readonly EnumValue<TEntries>[],
      readonly EnumValue<TEntries>[],
      TContext
    > & { readonly choices: EnumChoices<TEntries> }
  >;
};

function enumChoices<const TEntries extends readonly EnumEntry[]>(
  entries: TEntries,
): EnumChoices<TEntries> {
  const values = new Set<string | number>();
  const choices = entries.map((entry) => {
    if (isChoice(entry) && "metadata" in entry)
      throw new Error("Enum choice metadata was renamed to meta");
    const choice = isChoice(entry)
      ? {
          value: entry.value,
          presentation: entry.presentation,
          ...(entry.meta === undefined ? {} : { meta: entry.meta }),
        }
      : ({ value: entry, presentation: { label: String(entry) } } as Choice<
          string | number,
          never
        >);
    if (typeof choice.presentation.label !== "string")
      throw new Error("Enum choice presentation requires a string label");
    if (values.has(choice.value))
      throw new Error(`Enum choice value ${String(choice.value)} is declared more than once`);
    values.add(choice.value);
    return choice;
  });
  return Object.freeze(choices) as EnumChoices<TEntries>;
}

function isChoice(value: EnumEntry): value is Choice<string | number, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    "presentation" in value &&
    typeof value.presentation === "object" &&
    value.presentation !== null
  );
}

function enumField<
  const TEntries extends readonly EnumEntry[],
  TContext = unknown,
  const TConfig extends FieldConfig<EnumValue<TEntries>, EnumValue<TEntries>, TContext> =
    FieldConfig<EnumValue<TEntries>, EnumValue<TEntries>, TContext>,
>(entries: TEntries, config?: TConfig): EnumField<TEntries, TContext, TConfig> {
  const options = config ?? ({} as TConfig);
  const choices = enumChoices(entries);
  const values = choices.map((choice) => choice.value) as unknown as readonly EnumValue<TEntries>[];
  return new Field({
    ...options,
    kind: "enum",
    choices,
    editor: options.editor ?? editor.Select(),
    format: options.format ?? format.Choice(),
    parse:
      options.parse ??
      ((input) => {
        if (!values.includes(input as EnumValue<TEntries>))
          throw new Error("Expected an allowed value");
        return input as EnumValue<TEntries>;
      }),
  }) as EnumField<TEntries, TContext, TConfig>;
}

function enumListField<
  const TEntries extends readonly EnumEntry[],
  TContext = unknown,
  const TConfig extends FieldConfig<
    readonly EnumValue<TEntries>[],
    readonly EnumValue<TEntries>[],
    TContext
  > = FieldConfig<readonly EnumValue<TEntries>[], readonly EnumValue<TEntries>[], TContext>,
>(entries: TEntries, config?: TConfig): EnumListField<TEntries, TContext, TConfig> {
  const choices = enumChoices(entries);
  const values = choices.map((choice) => choice.value) as unknown as readonly EnumValue<TEntries>[];
  return listField<
    EnumValue<TEntries>,
    EnumValue<TEntries>,
    EnumValue<TEntries>,
    TContext,
    TConfig
  >(
    "enum-list",
    {
      ...config,
      choices,
      format: config?.format ?? format.Choices(),
    } as unknown as TConfig,
    (input) => {
      if (!values.includes(input as EnumValue<TEntries>))
        throw new Error("Expected an allowed value");
      return input as EnumValue<TEntries>;
    },
    (value) => value,
    editor.Select({ multiple: true }),
  ) as EnumListField<TEntries, TContext, TConfig>;
}

function stringField<
  TContext = unknown,
  const TConfig extends StringConfig<TContext> = StringConfig<TContext>,
>(
  kind: string,
  config?: TConfig,
  defaultEditor: Descriptor = editor.Text(),
  defaultFormat: Descriptor = format.Text(),
): Field<
  string,
  NullableOf<TConfig, string>,
  string,
  TContext,
  RequiredOf<TConfig>,
  false,
  WritableOf<TConfig>
> {
  const options = config ?? ({} as TConfig);
  const validators: Validator<string, TContext>[] = [...(options.validate ?? [])];
  if (options.minLength !== undefined)
    validators.push(
      ({ value }) =>
        value.length >= options.minLength! ||
        `Must contain at least ${options.minLength} characters`,
    );
  if (options.maxLength !== undefined)
    validators.push(
      ({ value }) =>
        value.length <= options.maxLength! ||
        `Must contain at most ${options.maxLength} characters`,
    );
  if (options.pattern)
    validators.push(({ value }) => options.pattern!.test(value) || "Invalid format");
  return new Field({
    ...options,
    kind,
    editor: options.editor ?? defaultEditor,
    format: options.format ?? defaultFormat,
    validate: validators,
    parse:
      options.parse ??
      ((input) => {
        if (typeof input !== "string") throw new Error("Expected a string");
        return options.trim ? input.trim() : input;
      }),
  }) as never;
}

function numberField<
  TContext = unknown,
  const TConfig extends NumberConfig<TContext> = NumberConfig<TContext>,
>(
  kind: "integer" | "number",
  config?: TConfig,
): Field<
  number | string,
  NullableOf<TConfig, number>,
  number,
  TContext,
  RequiredOf<TConfig>,
  false,
  WritableOf<TConfig>
> {
  const options = config ?? ({} as TConfig);
  const validators: Validator<number, TContext>[] = [...(options.validate ?? [])];
  if (options.min !== undefined)
    validators.push(({ value }) => value >= options.min! || `Must be at least ${options.min}`);
  if (options.max !== undefined)
    validators.push(({ value }) => value <= options.max! || `Must be at most ${options.max}`);
  return new Field({
    ...options,
    kind,
    editor: options.editor ?? editor.Number(),
    format: options.format ?? format.Number(),
    validate: validators,
    parse:
      options.parse ??
      ((input) => {
        const value = typeof input === "number" ? input : Number(input);
        if (!Number.isFinite(value) || (kind === "integer" && !Number.isInteger(value)))
          throw new Error(kind === "integer" ? "Expected an integer" : "Expected a number");
        return value;
      }),
  }) as never;
}

function booleanField<
  TContext = unknown,
  const TConfig extends BooleanConfig<TContext> = BooleanConfig<TContext>,
>(
  config?: TConfig,
): Field<
  boolean | string | number,
  NullableOf<TConfig, boolean>,
  boolean,
  TContext,
  RequiredOf<TConfig>,
  false,
  WritableOf<TConfig>
> {
  const options = config ?? ({} as TConfig);
  return new Field({
    ...options,
    kind: "boolean",
    editor: options.editor ?? editor.Checkbox(),
    format: options.format ?? format.Boolean(),
    parse:
      options.parse ??
      ((input) => {
        if (input === true || input === false) return input;
        if (input === "true" || input === "yes" || input === "on" || input === 1 || input === "1")
          return true;
        if (input === "false" || input === "no" || input === "off" || input === 0 || input === "0")
          return false;
        throw new Error("Expected a boolean");
      }),
  }) as never;
}

function dateField<
  TContext = unknown,
  const TConfig extends DateConfig<TContext> = DateConfig<TContext>,
>(
  kind: "date" | "datetime",
  config?: TConfig,
): Field<
  string | number | Date,
  NullableOf<TConfig, Date>,
  string,
  TContext,
  RequiredOf<TConfig>,
  false,
  WritableOf<TConfig>
> {
  const options = config ?? ({} as TConfig);
  return new Field({
    ...options,
    kind,
    editor: options.editor ?? (kind === "date" ? editor.Date() : editor.DateTime()),
    format: options.format ?? (kind === "date" ? format.Date() : format.DateTime()),
    parse: options.parse ?? parseDate,
    write:
      options.write ??
      ((value) => (kind === "date" ? value.toISOString().slice(0, 10) : value.toISOString())),
    query:
      options.query ??
      ((value) => (kind === "date" ? value.toISOString().slice(0, 10) : value.toISOString())),
  }) as never;
}

function listField<
  TInput,
  TValue,
  TEncoded,
  TContext,
  TConfig extends FieldConfig<readonly TValue[], readonly TEncoded[], TContext>,
>(
  kind: string,
  config: TConfig | undefined,
  parseItem: (value: unknown) => TValue,
  writeItem: (value: TValue, context: TContext) => TEncoded,
  defaultEditor: Descriptor,
): Field<
  readonly TInput[],
  readonly TValue[],
  readonly TEncoded[],
  TContext,
  RequiredOf<TConfig>,
  false,
  WritableOf<TConfig>
> {
  const options = config ?? ({} as TConfig);
  return new Field({
    ...options,
    kind,
    multiple: true,
    default: options.default ?? (() => []),
    editor: options.editor ?? defaultEditor,
    parse:
      options.parse ??
      ((input) => {
        if (!Array.isArray(input)) throw new Error("Expected an array");
        return Object.freeze(input.map(parseItem));
      }),
    write: options.write ?? ((value, context) => value.map((item) => writeItem(item, context))),
  }) as never;
}

function fileField<
  TContext = unknown,
  const TConfig extends FieldConfig<FileValue, EncodedFile, TContext> = FieldConfig<
    FileValue,
    EncodedFile,
    TContext
  >,
>(
  kind: "file" | "image",
  config?: TConfig,
): Field<
  FileInput,
  NullableOf<TConfig, FileValue>,
  EncodedFile,
  TContext,
  RequiredOf<TConfig>,
  false,
  WritableOf<TConfig>
> {
  const options = config ?? ({} as TConfig);
  return new Field({
    ...options,
    kind,
    editor: options.editor ?? (kind === "image" ? editor.Image() : editor.File()),
    format: options.format ?? (kind === "image" ? format.Image() : format.File()),
    parse: options.parse ?? parseFile,
    write:
      options.write ??
      ((value) =>
        value.kind === "local" ? value.file : value.kind === "removed" ? null : undefined),
  }) as never;
}

export const fields = {
  Str: <TContext = unknown, const TConfig extends StringConfig<TContext> = StringConfig<TContext>>(
    config?: TConfig,
  ) => stringField("string", config),
  Text: <TContext = unknown, const TConfig extends StringConfig<TContext> = StringConfig<TContext>>(
    config?: TConfig,
  ) => stringField("text", config, editor.Textarea()),
  RichText: <
    TContext = unknown,
    const TConfig extends StringConfig<TContext> = StringConfig<TContext>,
  >(
    config?: TConfig,
  ) => stringField("rich-text", config, editor.RichText()),
  Email: <
    TContext = unknown,
    const TConfig extends StringConfig<TContext> = StringConfig<TContext>,
  >(
    config?: TConfig,
  ) =>
    stringField(
      "email",
      { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, ...config } as TConfig,
      editor.Email(),
    ),
  Password: <
    TContext = unknown,
    const TConfig extends StringConfig<TContext> = StringConfig<TContext>,
  >(
    config?: TConfig,
  ) => stringField("password", config, editor.Password()),
  Phone: <
    TContext = unknown,
    const TConfig extends StringConfig<TContext> = StringConfig<TContext>,
  >(
    config?: TConfig,
  ) => stringField("phone", config, editor.Text({ inputMode: "tel" })),
  ID: <TContext = unknown, const TConfig extends NumberConfig<TContext> = NumberConfig<TContext>>(
    config?: TConfig,
  ) =>
    numberField("integer", {
      ...config,
      required: true,
      readonly: true,
    } as TConfig) as Field<number | string, number, number, TContext, true, false, false>,
  Int: <TContext = unknown, const TConfig extends NumberConfig<TContext> = NumberConfig<TContext>>(
    config?: TConfig,
  ) => numberField("integer", config),
  Float: <
    TContext = unknown,
    const TConfig extends NumberConfig<TContext> = NumberConfig<TContext>,
  >(
    config?: TConfig,
  ) => numberField("number", config),
  Bool: booleanField,
  Date: <TContext = unknown, const TConfig extends DateConfig<TContext> = DateConfig<TContext>>(
    config?: TConfig,
  ) => dateField("date", config),
  DateTime: <TContext = unknown, const TConfig extends DateConfig<TContext> = DateConfig<TContext>>(
    config?: TConfig,
  ) => dateField("datetime", config),
  Time: <TContext = unknown, const TConfig extends TimeConfig<TContext> = TimeConfig<TContext>>(
    config?: TConfig,
  ) => {
    const options = config ?? ({} as TConfig);
    return new Field({
      ...options,
      kind: "time",
      editor: options.editor ?? editor.Time(),
      format: options.format ?? format.Time(),
      parse: options.parse ?? parseTime,
    }) as Field<
      string,
      NullableOf<TConfig, string>,
      string,
      TContext,
      RequiredOf<TConfig>,
      false,
      WritableOf<TConfig>
    >;
  },
  DateRange: <
    TContext = unknown,
    const TConfig extends FieldConfig<DateRangeValue, readonly [string, string], TContext> =
      FieldConfig<DateRangeValue, readonly [string, string], TContext>,
  >(
    config?: TConfig,
  ) => {
    const options = config ?? ({} as TConfig);
    return new Field({
      ...options,
      kind: "date-range",
      editor: options.editor ?? editor.DateRange(),
      format: options.format ?? format.DateRange(),
      parse: options.parse ?? parseDateRange,
      write:
        options.write ??
        ((value) =>
          [value[0].toISOString().slice(0, 10), value[1].toISOString().slice(0, 10)] as const),
    }) as Field<
      string | readonly unknown[] | Readonly<{ from: unknown; to: unknown }>,
      NullableOf<TConfig, DateRangeValue>,
      readonly [string, string],
      TContext,
      RequiredOf<TConfig>,
      false,
      WritableOf<TConfig>
    >;
  },
  Enum: enumField,
  EnumList: enumListField,
  StrList: <
    TContext = unknown,
    const TConfig extends FieldConfig<readonly string[], readonly string[], TContext> = FieldConfig<
      readonly string[],
      readonly string[],
      TContext
    >,
  >(
    config?: TConfig,
  ) =>
    listField<string, string, string, TContext, TConfig>(
      "string-list",
      config,
      (value) => {
        if (typeof value !== "string") throw new Error("Expected a string");
        return value;
      },
      (value) => value,
      editor.StringList(),
    ),
  IntList: <
    TContext = unknown,
    const TConfig extends FieldConfig<readonly number[], readonly number[], TContext> = FieldConfig<
      readonly number[],
      readonly number[],
      TContext
    >,
  >(
    config?: TConfig,
  ) =>
    listField<number | string, number, number, TContext, TConfig>(
      "integer-list",
      config,
      (value) => {
        const number = Number(value);
        if (!Number.isInteger(number)) throw new Error("Expected an integer");
        return number;
      },
      (value) => value,
      editor.Select({ multiple: true }),
    ),
  Record: <
    TValue extends Readonly<Record<string, unknown>>,
    TContext = unknown,
    const TConfig extends FieldConfig<TValue, TValue, TContext> = FieldConfig<
      TValue,
      TValue,
      TContext
    >,
  >(
    config?: TConfig,
  ) => {
    const options = config ?? ({} as TConfig);
    return new Field({
      ...options,
      kind: "record",
      parse:
        options.parse ??
        ((input) => {
          if (!isRecord(input)) throw new Error("Expected an object");
          return deepFreeze({ ...input }) as TValue;
        }),
    }) as Field<
      TValue,
      NullableOf<TConfig, TValue>,
      TValue,
      TContext,
      RequiredOf<TConfig>,
      false,
      WritableOf<TConfig>
    >;
  },
  Unknown: <
    TContext = unknown,
    const TConfig extends FieldConfig<unknown, unknown, TContext> = FieldConfig<
      unknown,
      unknown,
      TContext
    >,
  >(
    config?: TConfig,
  ) =>
    new Field({ ...(config ?? {}), kind: "unknown" }) as Field<
      unknown,
      NullableOf<TConfig, unknown>,
      unknown,
      TContext,
      RequiredOf<TConfig>,
      false,
      WritableOf<TConfig>
    >,
  JSON: <
    TContext = unknown,
    const TConfig extends FieldConfig<JsonValue, JsonValue, TContext> = FieldConfig<
      JsonValue,
      JsonValue,
      TContext
    >,
  >(
    config?: TConfig,
  ) => {
    const options = config ?? ({} as TConfig);
    return new Field({
      ...options,
      kind: "json",
      parse: options.parse ?? ((input) => deepFreeze(parseJson(input))),
    }) as Field<
      JsonValue,
      NullableOf<TConfig, JsonValue>,
      JsonValue,
      TContext,
      RequiredOf<TConfig>,
      false,
      WritableOf<TConfig>
    >;
  },
  Object: <
    TInput,
    TValue,
    TEncoded,
    TContext = unknown,
    const TConfig extends FieldConfig<TValue, TEncoded, TContext> = FieldConfig<
      TValue,
      TEncoded,
      TContext
    >,
  >(
    schema: NestedSchema<TInput, TValue, TEncoded>,
    config?: TConfig,
  ) => {
    const options = config ?? ({} as TConfig);
    return new Field({
      ...options,
      kind: "object",
      nested: schema,
      parse: options.parse ?? ((input) => schema.parse(input)),
      write: options.write ?? ((value) => schema.write(value)),
    }) as Field<
      TInput,
      NullableOf<TConfig, TValue>,
      TEncoded,
      TContext,
      RequiredOf<TConfig>,
      false,
      WritableOf<TConfig>
    >;
  },
  ObjectList: <
    TInput,
    TValue,
    TEncoded,
    TContext = unknown,
    const TConfig extends FieldConfig<readonly TValue[], readonly TEncoded[], TContext> =
      FieldConfig<readonly TValue[], readonly TEncoded[], TContext>,
  >(
    schema: NestedSchema<TInput, TValue, TEncoded>,
    config?: TConfig,
  ) =>
    listField<TInput, TValue, TEncoded, TContext, TConfig>(
      "object-list",
      { ...config, nested: schema, nestedMany: true } as unknown as TConfig,
      (input) => schema.parse(input),
      (value) => schema.write(value),
      editor.Hidden(),
    ),
  File: fileField.bind(undefined, "file") as <
    TContext = unknown,
    const TConfig extends FieldConfig<FileValue, EncodedFile, TContext> = FieldConfig<
      FileValue,
      EncodedFile,
      TContext
    >,
  >(
    config?: TConfig,
  ) => Field<
    FileInput,
    NullableOf<TConfig, FileValue>,
    EncodedFile,
    TContext,
    RequiredOf<TConfig>,
    false,
    WritableOf<TConfig>
  >,
  Image: fileField.bind(undefined, "image") as <
    TContext = unknown,
    const TConfig extends FieldConfig<FileValue, EncodedFile, TContext> = FieldConfig<
      FileValue,
      EncodedFile,
      TContext
    >,
  >(
    config?: TConfig,
  ) => Field<
    FileInput,
    NullableOf<TConfig, FileValue>,
    EncodedFile,
    TContext,
    RequiredOf<TConfig>,
    false,
    WritableOf<TConfig>
  >,
  FileList: <
    TContext = unknown,
    const TConfig extends FieldConfig<readonly FileValue[], readonly EncodedFile[], TContext> =
      FieldConfig<readonly FileValue[], readonly EncodedFile[], TContext>,
  >(
    config?: TConfig,
  ) =>
    listField<FileInput, FileValue, EncodedFile, TContext, TConfig>(
      "file-list",
      config,
      parseFile,
      (value) =>
        value.kind === "local" ? value.file : value.kind === "removed" ? null : undefined,
      editor.File(),
    ),
  ImageList: <
    TContext = unknown,
    const TConfig extends FieldConfig<readonly FileValue[], readonly EncodedFile[], TContext> =
      FieldConfig<readonly FileValue[], readonly EncodedFile[], TContext>,
  >(
    config?: TConfig,
  ) =>
    listField<FileInput, FileValue, EncodedFile, TContext, TConfig>(
      "image-list",
      config,
      parseFile,
      (value) =>
        value.kind === "local" ? value.file : value.kind === "removed" ? null : undefined,
      editor.Image(),
    ),
  Computed: <TValue, TContext = unknown>(config: ComputedConfig<TValue, TContext>) =>
    new Field<never, TValue, never, TContext, true, true, false>({
      kind: "computed",
      required: true,
      readonly: true,
      computed: config,
      ...(config.format ? { format: config.format } : {}),
    }),
  Ref: <
    TContext = unknown,
    const TConfig extends RelationFieldConfig<
      ResourceTarget<unknown>,
      unknown,
      string | number,
      TContext
    > = RelationFieldConfig<ResourceTarget<unknown>, unknown, string | number, TContext>,
  >(
    config: TConfig,
  ) =>
    new Field({
      ...(config as Omit<TConfig, "label">),
      ...(typeof config.label === "string" ? { label: config.label } : {}),
      kind: "ref",
      relation: { ...config, many: false } as RelationConfig<unknown>,
      editor: config.editor ?? editor.Reference(),
      format: config.format ?? format.Reference(),
      parse: config.parse ?? ((input) => input as TargetEntity<TConfig["resource"]>),
      write: config.write ?? ((value) => relationKey(config.resource, value)),
    }) as Field<
      unknown,
      NullableOf<TConfig, TargetEntity<TConfig["resource"]>>,
      string | number,
      TContext,
      RequiredOf<TConfig>,
      false,
      WritableOf<TConfig>
    >,
  RefList: <
    TContext = unknown,
    const TConfig extends RelationFieldConfig<
      ResourceTarget<unknown>,
      readonly unknown[],
      readonly (string | number)[],
      TContext
    > = RelationFieldConfig<
      ResourceTarget<unknown>,
      readonly unknown[],
      readonly (string | number)[],
      TContext
    >,
  >(
    config: TConfig,
  ) =>
    new Field({
      ...(config as Omit<TConfig, "label">),
      ...(typeof config.label === "string" ? { label: config.label } : {}),
      kind: "ref-list",
      relation: { ...config, many: true } as RelationConfig<unknown>,
      editor: config.editor ?? editor.ReferenceList(),
      format: config.format ?? format.ReferenceList(),
      parse:
        config.parse ??
        ((input) => {
          if (!Array.isArray(input)) throw new Error("Expected an array");
          return input as readonly TargetEntity<TConfig["resource"]>[];
        }),
      write: config.write ?? ((value) => value.map((item) => relationKey(config.resource, item))),
    }) as Field<
      unknown,
      NullableOf<TConfig, readonly TargetEntity<TConfig["resource"]>[]>,
      readonly (string | number)[],
      TContext,
      RequiredOf<TConfig>,
      false,
      WritableOf<TConfig>
    >,
};

async function validateNested<TValue, TEncoded, TContext>(
  options: Readonly<FieldRuntimeOptions<TValue, TEncoded, TContext>>,
  value: TValue,
  signal: AbortSignal,
  path: readonly (string | number)[],
): Promise<ValidationIssue[]> {
  if (!options.nested) return [];
  const values = options.nestedMany ? (value as readonly unknown[]) : [value];
  const issues: ValidationIssue[] = [];
  for (let index = 0; index < values.length; index += 1) {
    if (signal.aborted) break;
    const result = await options.nested.validate(values[index], { signal });
    const prefix = options.nestedMany ? [...path, index] : path;
    issues.push(
      ...result.issues.map((issue) => ({
        ...issue,
        path: [...prefix, ...issue.path],
      })),
    );
  }
  return issues;
}

function parseDate(input: unknown): Date {
  const value =
    input instanceof Date
      ? new Date(input)
      : new Date(typeof input === "number" ? input : String(input));
  if (Number.isNaN(value.getTime())) throw new Error("Expected a date");
  return value;
}

function parseTime(input: unknown): string {
  if (typeof input !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(input))
    throw new Error("Expected a time");
  return input;
}

function parseDateRange(input: unknown): DateRangeValue {
  const values =
    typeof input === "string"
      ? [input, input]
      : Array.isArray(input)
        ? input
        : isRecord(input)
          ? [input.from, input.to]
          : undefined;
  if (!values || values.length !== 2) throw new Error("Expected a date range");
  return Object.freeze([parseDate(values[0]), parseDate(values[1])]);
}

function parseFile(input: unknown): FileValue {
  if (isFileValue(input)) return input;
  if (typeof input === "string") return remoteFile(input);
  if (isBinaryPart(input)) return localFile(input);
  throw new Error("Expected a file");
}

function relationKey(target: ResourceTarget<unknown>, value: unknown): string | number {
  if (typeof value === "string" || typeof value === "number") return value;
  if (!isRecord(value)) throw new Error("Expected a relation key or entity");
  const definition: Readonly<Record<string, unknown>> =
    "definition" in target && isRecord(target.definition)
      ? target.definition
      : (target as unknown as Readonly<Record<string, unknown>>);
  const key = definition.key;
  const result =
    typeof key === "function" ? key(value) : typeof key === "string" ? value[key] : value.id;
  if (typeof result !== "string" && typeof result !== "number")
    throw new Error("Related entity does not contain a string or number key");
  return result;
}

function parseJson(input: unknown): JsonValue {
  if (input === null || typeof input === "string" || typeof input === "boolean") return input;
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (Array.isArray(input)) return input.map(parseJson);
  if (isRecord(input))
    return Object.fromEntries(
      Object.entries(input).map(([name, value]) => [name, parseJson(value)]),
    );
  throw new Error("Expected a JSON value");
}

function fileName(url: string): string {
  const path = url.split("?")[0] ?? url;
  return decodeURIComponent(path.split("/").pop() || "file");
}

function appendValidatorResult(
  issues: ValidationIssue[],
  result: ValidatorResult,
  path: readonly (string | number)[],
): void {
  if (result === undefined || result === true) return;
  if (result === false) issues.push(clientIssue(path, "Invalid value"));
  else if (typeof result === "string") issues.push(clientIssue(path, result));
  else if (Array.isArray(result)) issues.push(...result);
  else issues.push(result as ValidationIssue);
}
