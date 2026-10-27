import type { FormSchema, FormSchemaOptions } from "./form.js";
import { createFormSchema } from "./form.js";
import {
  Field,
  FieldParseFailure,
  fields,
  type ComputedConfig,
  type ValidatorResult,
} from "./field.js";
import {
  clientIssue,
  parseIssue,
  ParseError,
  type ValidationIssue,
  type ValidationResult,
} from "./issues.js";
import { deepFreeze, isRecord, type Simplify } from "./utils.js";

export type Shape = Readonly<
  Record<string, Field<unknown, unknown, unknown, unknown, boolean, boolean, boolean>>
>;
export type AnyField = Field<unknown, unknown, unknown, unknown, boolean, boolean, boolean>;

export type Input<TSchema> = TSchema extends { readonly _input: infer T } ? T : never;
export type Infer<TSchema> = TSchema extends { readonly _output: infer T } ? T : never;
export type Encoded<TSchema> = TSchema extends { readonly _encoded: infer T } ? T : never;
export type Patch<TSchema> = Partial<Encoded<TSchema>>;

type RequiredInput<S extends Shape> = {
  [
    K in keyof S as S[K] extends Field<unknown, unknown, unknown, unknown, true, infer C, boolean>
      ? C extends true
        ? never
        : K
      : never
  ]: S[K] extends Field<infer T, unknown, unknown, unknown, boolean, boolean, boolean> ? T : never;
};
type OptionalInput<S extends Shape> = {
  [
    K in keyof S as S[K] extends Field<unknown, unknown, unknown, unknown, false, infer C, boolean>
      ? C extends true
        ? never
        : K
      : never
  ]?: S[K] extends Field<infer T, unknown, unknown, unknown, boolean, boolean, boolean> ? T : never;
};
type InputShape<S extends Shape> = Simplify<RequiredInput<S> & OptionalInput<S>>;
type RequiredOutput<S extends Shape> = {
  [
    K in keyof S as S[K] extends Field<unknown, unknown, unknown, unknown, true, boolean, boolean>
      ? K
      : never
  ]: S[K] extends Field<unknown, infer T, unknown, unknown, boolean, boolean, boolean> ? T : never;
};
type OptionalOutput<S extends Shape> = {
  [
    K in keyof S as S[K] extends Field<unknown, unknown, unknown, unknown, false, boolean, boolean>
      ? K
      : never
  ]?: S[K] extends Field<unknown, infer T, unknown, unknown, boolean, boolean, boolean> ? T : never;
};
type OutputShape<S extends Shape> = Simplify<RequiredOutput<S> & OptionalOutput<S>>;
export type OutputOfShape<S extends Shape> = OutputShape<S>;
type RequiredEncoded<S extends Shape> = {
  [
    K in keyof S as S[K] extends Field<unknown, unknown, unknown, unknown, true, infer C, infer W>
      ? C extends true
        ? never
        : W extends false
          ? never
          : K
      : never
  ]: S[K] extends Field<unknown, unknown, infer T, unknown, boolean, boolean, boolean> ? T : never;
};
type OptionalEncoded<S extends Shape> = {
  [
    K in keyof S as S[K] extends Field<
      unknown,
      unknown,
      unknown,
      unknown,
      boolean,
      infer C,
      infer W
    >
      ? C extends true
        ? never
        : W extends false
          ? never
          : K
      : never
  ]?: S[K] extends Field<unknown, unknown, infer T, unknown, boolean, boolean, boolean> ? T : never;
};
type EncodedShape<S extends Shape> = Simplify<RequiredEncoded<S> & OptionalEncoded<S>>;

type OptionalShape<S extends Shape> = {
  [K in keyof S]: S[K] extends Field<infer I, infer V, infer E, infer C, boolean, infer M, infer W>
    ? Field<I, V, E, C, false, M, W>
    : never;
};

type RequiredShape<S extends Shape> = {
  [K in keyof S]: S[K] extends Field<infer I, infer V, infer E, infer C, boolean, infer M, infer W>
    ? Field<I, V, E, C, true, M, W>
    : never;
};

export interface SchemaValidatorInput<TValue, TContext> {
  readonly value: Readonly<TValue>;
  readonly context: TContext;
  readonly signal: AbortSignal;
  readonly issue: (
    path: readonly (string | number)[],
    message: string,
    code?: string,
  ) => ValidationIssue;
}

export type SchemaValidator<TValue, TContext> = (
  input: SchemaValidatorInput<TValue, TContext>,
) => ValidatorResult | Promise<ValidatorResult>;

export interface SchemaOptions<TValue, TContext> {
  readonly unknownKeys?: "strip" | "strict" | "passthrough";
  readonly validate?: readonly SchemaValidator<TValue, TContext>[];
  readonly format?: (value: Readonly<TValue>, context: TContext) => string;
}

export interface ValidateOptions {
  readonly signal?: AbortSignal;
}

/** The recoverable result of parsing a partial record. Invalid fields are omitted. */
export interface PartialParseResult<TValues extends Readonly<Record<string, unknown>>> {
  readonly values: Readonly<Partial<TValues>>;
  readonly issues: readonly ValidationIssue[];
}

export interface ViewOptions<
  S extends Shape,
  K extends readonly (keyof S & string)[],
  C extends Shape,
> {
  readonly fields: K;
  readonly computed?: C;
}

export class Schema<S extends Shape, TContext = unknown> {
  declare readonly _input: InputShape<S>;
  declare readonly _output: OutputShape<S>;
  declare readonly _encoded: EncodedShape<S>;
  declare readonly _context: TContext;

  readonly shape: S;
  readonly options: Readonly<SchemaOptions<OutputShape<S>, TContext>>;
  readonly classConstructor?: abstract new (...args: never[]) => OutputShape<S>;

  constructor(
    shape: S,
    options: SchemaOptions<OutputShape<S>, TContext> = {},
    protected readonly context?: () => TContext,
    classConstructor?: abstract new (...args: never[]) => OutputShape<S>,
  ) {
    this.shape = Object.freeze({ ...shape });
    this.options = deepFreeze({
      unknownKeys: options.unknownKeys ?? "strip",
      validate: [...(options.validate ?? [])],
      ...(options.format ? { format: options.format } : {}),
    }) as Readonly<SchemaOptions<OutputShape<S>, TContext>>;
    if (classConstructor) this.classConstructor = classConstructor;
    if (new.target === Schema) Object.freeze(this);
  }

  get<K extends keyof S>(name: K): S[K] {
    return this.shape[name];
  }

  parse(input: unknown): OutputShape<S> {
    const result = this.parseRecord(input, false);
    if (result.issues.length) throw new ParseError(result.issues);
    return this.materialize(result.values as Readonly<Partial<OutputShape<S>>>);
  }

  parsePartial(input: unknown): Readonly<Partial<OutputShape<S>>> {
    const result = this.parsePartialResult(input);
    if (result.issues.length) throw new ParseError(result.issues);
    return result.values;
  }

  /** Parses each present field independently, retaining valid values when others fail. */
  parsePartialResult(input: unknown): PartialParseResult<OutputShape<S>> {
    const result = this.parseRecord(input, true);
    return Object.freeze({
      values: deepFreeze(result.values) as Readonly<Partial<OutputShape<S>>>,
      issues: Object.freeze(result.issues),
    });
  }

  materialize(input: Readonly<Partial<OutputShape<S>>>): OutputShape<S> {
    const output = this.createOutput(input as Readonly<Record<string, unknown>>);
    for (const [name, field] of this.entries()) {
      const computed = field.options.computed as ComputedConfig<unknown, TContext> | undefined;
      if (!computed) continue;
      const missing = computed.dependsOn.filter((dependency) => !(dependency in output));
      if (missing.length) continue;
      output[name] = computed.get(output, this.getContext());
    }
    return freezeOutput(output) as OutputShape<S>;
  }

  canMaterialize(input: Readonly<Record<string, unknown>>): boolean {
    return this.entries().every(([name, field]) => {
      if (field.options.computed || !field.options.required) return true;
      return name in input;
    });
  }

  async validate(value: OutputShape<S>, options: ValidateOptions = {}): Promise<ValidationResult> {
    const signal = options.signal ?? new AbortController().signal;
    const issues: ValidationIssue[] = [];
    const root = value as Readonly<Record<string, unknown>>;
    const context = this.getContext();
    for (const [name, field] of this.entries()) {
      if (field.options.computed || signal.aborted) continue;
      issues.push(...(await field.validate(root[name], root, context, signal, [name])));
    }
    for (const validator of this.options.validate ?? []) {
      if (signal.aborted) break;
      const result = await validator({
        value,
        context,
        signal,
        issue: (path, message, code) => clientIssue(path, message, code),
      });
      appendSchemaResult(issues, result);
    }
    return Object.freeze({
      valid: !issues.some((issue) => issue.severity === "error"),
      issues: Object.freeze(issues),
    });
  }

  format(value: OutputShape<S>): string {
    return this.options.format?.(value, this.getContext()) ?? String(value);
  }

  write(value: OutputShape<S>): EncodedShape<S> {
    const output: Record<string, unknown> = {};
    const context = this.getContext();
    for (const [name, field] of this.entries()) {
      if (field.options.computed || field.options.readonly) continue;
      if (field.options.writableWhen && !field.options.writableWhen(context)) continue;
      const fieldValue = (value as Readonly<Record<string, unknown>>)[name];
      if (fieldValue === undefined) continue;
      output[field.options.wireName ?? name] = field.write(fieldValue, context);
    }
    return deepFreeze(output) as EncodedShape<S>;
  }

  writePartial(value: Readonly<Partial<OutputShape<S>>>): Readonly<Partial<EncodedShape<S>>> {
    const output: Record<string, unknown> = {};
    const source = value as Readonly<Record<string, unknown>>;
    const context = this.getContext();
    for (const [name, field] of Object.entries(this.shape)) {
      if (!(name in source) || field.options.computed || field.options.readonly) continue;
      if (field.options.writableWhen && !field.options.writableWhen(context)) continue;
      const fieldValue = source[name];
      if (fieldValue === undefined) continue;
      output[field.options.wireName ?? name] = field.write(fieldValue, context);
    }
    return deepFreeze(output) as Readonly<Partial<EncodedShape<S>>>;
  }

  writeInput(
    input: unknown,
    options: { readonly partial?: boolean } = {},
  ): Readonly<Record<string, unknown>> {
    if (!isRecord(input))
      throw new ParseError([parseIssue([], "Expected an object", "invalid_type")]);
    const parsed: Record<string, unknown> = {};
    const issues: ValidationIssue[] = [];
    for (const [name, field] of this.entries()) {
      if (field.options.computed || field.options.readonly) continue;
      if (options.partial && !(name in input)) continue;
      try {
        const value = field.parse(input[name], [name]);
        if (value !== undefined) parsed[name] = value;
      } catch (error) {
        if (error instanceof FieldParseFailure) issues.push(error.issue);
        else throw error;
      }
    }
    if (issues.length) throw new ParseError(issues);
    return this.writePartial(parsed as Readonly<Partial<OutputShape<S>>>) as Readonly<
      Record<string, unknown>
    >;
  }

  merge<E extends Shape>(
    other: Schema<E, TContext>,
  ): Schema<Simplify<Omit<S, keyof E> & E>, TContext> {
    return this.extend(other.shape);
  }

  partial(): Schema<OptionalShape<S>, TContext> {
    const shape = Object.fromEntries(
      this.entries().map(([name, field]) => [
        name,
        field.options.computed ? field : new Field({ ...field.options, required: false }),
      ]),
    ) as OptionalShape<S>;
    return this.copy(shape);
  }

  required(): Schema<RequiredShape<S>, TContext> {
    const shape = Object.fromEntries(
      this.entries().map(([name, field]) => [
        name,
        field.options.computed ? field : new Field({ ...field.options, required: true }),
      ]),
    ) as RequiredShape<S>;
    return this.copy(shape);
  }

  keep<const K extends readonly (keyof S & string)[]>(
    ...names: K
  ): Schema<Pick<S, K[number]>, TContext> {
    const shape: Record<string, AnyField> = {};
    for (const name of names) shape[name] = this.shape[name]!;
    return this.copy(shape as Pick<S, K[number]>);
  }

  drop<const K extends readonly (keyof S & string)[]>(
    ...names: K
  ): Schema<Omit<S, K[number]>, TContext> {
    const excluded = new Set<string>(names);
    return this.copy(
      Object.fromEntries(this.entries().filter(([name]) => !excluded.has(name))) as Omit<
        S,
        K[number]
      >,
    );
  }

  extend<E extends Shape>(extension: E): Schema<Simplify<Omit<S, keyof E> & E>, TContext> {
    const shape: Record<string, AnyField> = { ...this.shape };
    for (const [name, field] of Object.entries(extension)) shape[name] = field;
    return this.copy(shape as Simplify<Omit<S, keyof E> & E>);
  }

  modify<M extends Partial<{ [K in keyof S]: (field: S[K]) => AnyField }>>(
    modifiers: M,
  ): Schema<
    {
      [K in keyof S]: K extends keyof M
        ? M[K] extends (field: S[K]) => infer T
          ? Extract<T, AnyField>
          : S[K]
        : S[K];
    },
    TContext
  > {
    const shape: Record<string, AnyField> = { ...this.shape };
    for (const [name, modifier] of Object.entries(modifiers)) {
      if (modifier && name in shape) shape[name] = modifier(shape[name] as never);
    }
    return this.copy(shape as never) as unknown as Schema<
      {
        [K in keyof S]: K extends keyof M
          ? M[K] extends (field: S[K]) => infer T
            ? Extract<T, AnyField>
            : S[K]
          : S[K];
      },
      TContext
    >;
  }

  reorder<const K extends readonly (keyof S & string)[]>(...names: K): Schema<S, TContext> {
    const selected = new Set<string>(names);
    const entries = [
      ...names.map((name) => [name, this.shape[name]] as const),
      ...this.entries().filter(([name]) => !selected.has(name)),
    ];
    return this.copy(Object.fromEntries(entries) as S);
  }

  toQuery(): Schema<OptionalShape<S>, TContext>;
  toQuery(values: Readonly<Partial<OutputShape<S>>>): Readonly<Record<string, unknown>>;
  toQuery(
    values?: Readonly<Partial<OutputShape<S>>>,
  ): Schema<OptionalShape<S>, TContext> | Readonly<Record<string, unknown>> {
    if (values) {
      const output: Record<string, unknown> = {};
      const context = this.getContext();
      for (const [name, field] of this.entries()) {
        if (field.options.computed || field.options.writeonly) continue;
        const value = (values as Readonly<Record<string, unknown>>)[name];
        if (value === undefined || value === null || value === "") continue;
        output[field.options.wireName ?? name] = field.toQuery(value, context);
      }
      return deepFreeze(output);
    }
    const shape = Object.fromEntries(
      this.entries().map(([name, field]) => [
        name,
        new Field({ ...field.options, required: false }) as AnyField,
      ]),
    ) as OptionalShape<S>;
    return this.copy(shape);
  }

  toForm<TPayload = EncodedShape<S>>(
    options: FormSchemaOptions<Schema<S, TContext>, TPayload> = {},
  ): FormSchema<Schema<S, TContext>, TPayload> {
    return createFormSchema(this, options);
  }

  view<
    const K extends readonly (keyof S & string)[],
    C extends Shape = Readonly<Record<never, never>>,
  >(options: ViewOptions<S, K, C>): ViewSchema<S, K[number], C, TContext> {
    return new ViewSchema(this, options.fields, options.computed ?? ({} as C), this.context);
  }

  describe(): Readonly<Record<keyof S, Readonly<Record<string, unknown>>>> {
    return Object.freeze(
      Object.fromEntries(this.entries().map(([name, field]) => [name, field.describe()])),
    ) as Readonly<Record<keyof S, Readonly<Record<string, unknown>>>>;
  }

  bindContext<TNextContext>(context: () => TNextContext): Schema<S, TNextContext> {
    return new Schema(this.shape, this.options as never, context, this.classConstructor as never);
  }

  protected copy<TNext extends Shape>(shape: TNext): Schema<TNext, TContext> {
    return new Schema(shape, this.options as never, this.context, this.classConstructor as never);
  }

  protected getContext(): TContext {
    return this.context?.() as TContext;
  }

  protected entries(): readonly [string, AnyField][] {
    return Object.entries(this.shape) as readonly [string, AnyField][];
  }

  private parseRecord(
    input: unknown,
    partial: boolean,
  ): { readonly values: Record<string, unknown>; readonly issues: ValidationIssue[] } {
    if (!isRecord(input))
      return {
        values: {},
        issues: [
          {
            path: [],
            message: "Expected an object",
            code: "invalid_type",
            source: "parse",
            severity: "error",
          },
        ],
      };
    const output: Record<string, unknown> =
      this.options.unknownKeys === "passthrough" ? { ...input } : {};
    const issues: ValidationIssue[] = [];
    const knownInputNames = new Set(
      this.entries().flatMap(([name, field]) => [name, field.options.wireName ?? name]),
    );
    if (this.options.unknownKeys === "strict") {
      for (const name of Object.keys(input)) {
        if (!knownInputNames.has(name))
          issues.push({
            path: [name],
            message: "Unknown field",
            code: "unknown_key",
            source: "parse",
            severity: "error",
          });
      }
    }
    for (const [name, field] of this.entries()) {
      if (field.options.computed) continue;
      const wireName = field.options.wireName ?? name;
      const sourceName: string = wireName in input ? wireName : name;
      if (partial && !(sourceName in input)) continue;
      try {
        const value = field.parse(input[sourceName], [name]);
        if (value !== undefined) output[name] = value;
      } catch (error) {
        if (error instanceof FieldParseFailure) issues.push(error.issue);
        else throw error;
      }
    }
    return { values: output, issues };
  }

  private createOutput(input: Readonly<Record<string, unknown>>): Record<string, unknown> {
    const values =
      this.options.unknownKeys === "passthrough"
        ? { ...input }
        : Object.fromEntries(
            this.entries().flatMap(([name]) =>
              name in input ? ([[name, input[name]]] as const) : [],
            ),
          );
    if (!this.classConstructor) return values;
    const output = Object.create(this.classConstructor.prototype) as Record<string, unknown>;
    return Object.assign(output, values);
  }
}

export class ViewSchema<
  S extends Shape,
  K extends keyof S & string,
  C extends Shape,
  TContext = unknown,
> extends Schema<Simplify<Pick<S, K> & C>, TContext> {
  declare readonly _output: Readonly<OutputShape<Simplify<Pick<S, K> & C>>>;
  declare readonly _encoded: never;
  readonly source: Schema<S, TContext>;
  readonly selected: readonly K[];

  constructor(
    source: Schema<S, TContext>,
    selected: readonly K[],
    computed: C,
    context?: () => TContext,
  ) {
    super(
      { ...source.keep(...selected).shape, ...computed } as Simplify<Pick<S, K> & C>,
      {},
      context,
    );
    this.source = source;
    this.selected = Object.freeze([...selected]);
    Object.freeze(this);
  }

  override write(value: Readonly<OutputShape<Simplify<Pick<S, K> & C>>>): never {
    void value;
    throw new Error("Resource views are read-only");
  }

  override writePartial(value: Readonly<Partial<OutputShape<Simplify<Pick<S, K> & C>>>>): never {
    void value;
    throw new Error("Resource views are read-only");
  }

  override writeInput(value: unknown): never {
    void value;
    throw new Error("Resource views are read-only");
  }
}

export interface SchemaDefinitionFactory {
  <S extends Shape>(shape: S, options?: SchemaOptions<OutputShape<S>, unknown>): Schema<S, unknown>;
  withContext<TContext>(): <S extends Shape>(
    shape: S,
    options?: SchemaOptions<OutputShape<S>, TContext>,
  ) => Schema<S, TContext>;
}

/** Creates a pure schema definition without binding it to an application runtime. */
export const schema: SchemaDefinitionFactory = Object.assign(
  <S extends Shape>(
    shape: S,
    options: SchemaOptions<OutputShape<S>, unknown> = {},
  ): Schema<S, unknown> => new Schema(shape, options),
  {
    withContext:
      <TContext>() =>
      <S extends Shape>(
        shape: S,
        options: SchemaOptions<OutputShape<S>, TContext> = {},
      ): Schema<S, TContext> =>
        new Schema(shape, options),
  },
);

export function computed<TValue, TContext = unknown>(
  config: ComputedConfig<TValue, TContext>,
): ReturnType<typeof fields.Computed<TValue, TContext>> {
  return fields.Computed(config);
}

function freezeOutput<T extends Record<string, unknown>>(output: T): Readonly<T> {
  for (const value of Object.values(output)) deepFreeze(value);
  return Object.freeze(output);
}

function appendSchemaResult(issues: ValidationIssue[], result: ValidatorResult): void {
  if (result === undefined || result === true) return;
  if (result === false) issues.push(clientIssue([], "Invalid value"));
  else if (typeof result === "string") issues.push(clientIssue([], result));
  else if (Array.isArray(result)) issues.push(...result);
  else issues.push(result as ValidationIssue);
}
