import {
  Field,
  fields,
  type ComputedConfig,
  type DateConfig,
  type FieldConfig,
  type FileValue,
  type NumberConfig,
  type RelationFieldConfig,
  type ResourceTarget,
  type StringConfig,
  type TimeConfig,
  type TargetEntity,
} from "./field.js";
import { Schema, type Shape } from "./schema.js";

type Constructor<T = object> = abstract new (...args: never[]) => T;
type DecoratedField = Field<unknown, unknown, unknown, unknown, boolean, boolean, boolean>;

export type ClassSchema<T extends object, TContext = unknown> = {
  readonly _input: Partial<T>;
  readonly _output: T;
  parse(input: unknown): Readonly<T>;
} & Schema<Shape, TContext>;

interface FieldMetadata {
  readonly name: string;
  readonly field: DecoratedField;
}

const metadata = new WeakMap<object, FieldMetadata[]>();

function fieldDecorator(field: DecoratedField) {
  return (target: object, propertyKey: string | symbol): void => {
    const constructor = target.constructor as object;
    const inherited = collectMetadata(Object.getPrototypeOf(constructor) as object | null);
    const current = metadata.get(constructor) ?? inherited;
    metadata.set(constructor, [
      ...current.filter((item) => item.name !== propertyKey),
      { name: String(propertyKey), field },
    ]);
  };
}

function decorate(field: Field<unknown, unknown, unknown, unknown, boolean, boolean, boolean>) {
  return fieldDecorator(field);
}

function collectMetadata(constructor: object | null): FieldMetadata[] {
  if (!constructor || constructor === Function.prototype) return [];
  const parent = collectMetadata(Object.getPrototypeOf(constructor) as object | null);
  const own = metadata.get(constructor) ?? [];
  const names = new Set(own.map((item) => item.name));
  return [...parent.filter((item) => !names.has(item.name)), ...own];
}

export const struct = {
  Struct:
    () =>
    <T extends Constructor>(constructor: T): T =>
      constructor,
  Str: <TContext = unknown>(config: StringConfig<TContext> = {}) =>
    decorate(fields.Str(config) as never),
  Text: <TContext = unknown>(config: StringConfig<TContext> = {}) =>
    decorate(fields.Text(config) as never),
  RichText: <TContext = unknown>(config: StringConfig<TContext> = {}) =>
    decorate(fields.RichText(config) as never),
  Markdown: <TContext = unknown>(config: StringConfig<TContext> = {}) =>
    decorate(fields.Markdown(config) as never),
  Email: <TContext = unknown>(config: StringConfig<TContext> = {}) =>
    decorate(fields.Email(config) as never),
  Password: <TContext = unknown>(config: StringConfig<TContext> = {}) =>
    decorate(fields.Password(config) as never),
  Phone: <TContext = unknown>(config: StringConfig<TContext> = {}) =>
    decorate(fields.Phone(config) as never),
  ID: <TContext = unknown>(config: NumberConfig<TContext> = {}) =>
    decorate(fields.ID(config) as never),
  Int: <TContext = unknown>(config: NumberConfig<TContext> = {}) =>
    decorate(fields.Int(config) as never),
  Float: <TContext = unknown>(config: NumberConfig<TContext> = {}) =>
    decorate(fields.Float(config) as never),
  Bool: <TContext = unknown>(config: FieldConfig<boolean, boolean, TContext> = {}) =>
    decorate(fields.Bool(config) as never),
  Date: <TContext = unknown>(config: DateConfig<TContext> = {}) =>
    decorate(fields.Date(config) as never),
  DateTime: <TContext = unknown>(config: DateConfig<TContext> = {}) =>
    decorate(fields.DateTime(config) as never),
  Time: <TContext = unknown>(config: TimeConfig<TContext> = {}) =>
    decorate(fields.Time(config) as never),
  DateRange: <TContext = unknown>(
    config: FieldConfig<readonly [Date, Date], readonly [string, string], TContext> = {},
  ) => decorate(fields.DateRange(config) as never),
  Enum: <const TValues extends readonly (string | number)[], TContext = unknown>(
    values: TValues,
    config: FieldConfig<TValues[number], TValues[number], TContext> = {},
  ) => decorate(fields.Enum(values, config) as never),
  EnumList: <const TValues extends readonly (string | number)[], TContext = unknown>(
    values: TValues,
    config: FieldConfig<readonly TValues[number][], readonly TValues[number][], TContext> = {},
  ) => decorate(fields.EnumList(values, config) as never),
  StrList: <TContext = unknown>(
    config: FieldConfig<readonly string[], readonly string[], TContext> = {},
  ) => decorate(fields.StrList(config) as never),
  IntList: <TContext = unknown>(
    config: FieldConfig<readonly number[], readonly number[], TContext> = {},
  ) => decorate(fields.IntList(config) as never),
  Record: <TValue extends Readonly<Record<string, unknown>>, TContext = unknown>(
    config: FieldConfig<TValue, TValue, TContext> = {},
  ) => decorate(fields.Record(config) as never),
  File: <TContext = unknown>(config: FieldConfig<FileValue, unknown, TContext> = {}) =>
    decorate(fields.File(config as never) as never),
  FileList: <TContext = unknown>(
    config: FieldConfig<readonly FileValue[], readonly unknown[], TContext> = {},
  ) => decorate(fields.FileList(config as never) as never),
  Image: <TContext = unknown>(config: FieldConfig<FileValue, unknown, TContext> = {}) =>
    decorate(fields.Image(config as never) as never),
  ImageList: <TContext = unknown>(
    config: FieldConfig<readonly FileValue[], readonly unknown[], TContext> = {},
  ) => decorate(fields.ImageList(config as never) as never),
  Object: <TInput, TValue, TEncoded, TContext = unknown>(
    schema: Parameters<typeof fields.Object<TInput, TValue, TEncoded, TContext>>[0],
    config: FieldConfig<TValue, TEncoded, TContext> = {},
  ) => decorate(fields.Object(schema, config) as never),
  ObjectList: <TInput, TValue, TEncoded, TContext = unknown>(
    schema: Parameters<typeof fields.ObjectList<TInput, TValue, TEncoded, TContext>>[0],
    config: FieldConfig<readonly TValue[], readonly TEncoded[], TContext> = {},
  ) => decorate(fields.ObjectList(schema, config) as never),
  Computed: <TValue, TContext = unknown>(config: ComputedConfig<TValue, TContext>) =>
    decorate(fields.Computed(config) as never),
  Ref: <TTarget extends ResourceTarget<unknown>>(
    config: RelationFieldConfig<TTarget, TargetEntity<TTarget>, string | number>,
  ) => decorate(fields.Ref(config) as never),
  RefList: <TTarget extends ResourceTarget<unknown>>(
    config: RelationFieldConfig<
      TTarget,
      readonly TargetEntity<TTarget>[],
      readonly (string | number)[]
    >,
  ) => decorate(fields.RefList(config) as never),
  toSchema: <T extends object>(constructor: Constructor<T>): ClassSchema<T> => {
    const entries = collectMetadata(constructor);
    const shape = Object.fromEntries(entries.map(({ name, field }) => [name, field])) as Shape;
    return new Schema(shape, {}, undefined, constructor as never) as ClassSchema<T>;
  },
};
