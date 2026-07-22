import {
  fields as modernFields,
  Schema,
  struct,
  type Field,
  type FormSchema,
  type Shape,
} from "@uicogs/core";

type RuntimeField = Field<unknown, unknown, unknown, unknown, boolean, boolean, boolean>;
type FactoryConfig<TFactory> = TFactory extends (config?: infer TConfig) => unknown
  ? NonNullable<TConfig>
  : never;
type Named<T> = T & { readonly name: string };

export class SchemaField<TValue = unknown> {
  readonly name: string;
  readonly field: RuntimeField;

  constructor(name: string, field: RuntimeField) {
    this.name = name;
    this.field = field;
    Object.freeze(this);
  }

  modify(options: Readonly<Record<string, unknown>>): SchemaField<TValue> {
    return new SchemaField(this.name, this.field.modify(options));
  }
}

abstract class ConfiguredField<TValue> extends SchemaField<TValue> {
  constructor(
    nameOrOptions: string | { readonly name: string },
    options: object | undefined,
    factory: (config: object) => RuntimeField,
  ) {
    const [name, config] = namedOptions(nameOrOptions, options);
    super(name, factory(config));
  }
}

export class CharField extends ConfiguredField<string> {
  constructor(
    nameOrOptions: string | Named<FactoryConfig<typeof modernFields.Str>>,
    options?: FactoryConfig<typeof modernFields.Str>,
  ) {
    super(nameOrOptions, options, configured(modernFields.Str));
  }
}

export class TextField extends ConfiguredField<string> {
  constructor(
    nameOrOptions: string | Named<FactoryConfig<typeof modernFields.Text>>,
    options?: FactoryConfig<typeof modernFields.Text>,
  ) {
    super(nameOrOptions, options, configured(modernFields.Text));
  }
}

export class RichTextField extends ConfiguredField<string> {
  constructor(
    nameOrOptions: string | Named<FactoryConfig<typeof modernFields.RichText>>,
    options?: FactoryConfig<typeof modernFields.RichText>,
  ) {
    super(nameOrOptions, options, configured(modernFields.RichText));
  }
}

export class EmailField extends ConfiguredField<string> {
  constructor(
    nameOrOptions: string | Named<FactoryConfig<typeof modernFields.Email>>,
    options?: FactoryConfig<typeof modernFields.Email>,
  ) {
    super(nameOrOptions, options, configured(modernFields.Email));
  }
}

export class PasswordField extends ConfiguredField<string> {
  constructor(
    nameOrOptions: string | Named<FactoryConfig<typeof modernFields.Password>>,
    options?: FactoryConfig<typeof modernFields.Password>,
  ) {
    super(nameOrOptions, options, configured(modernFields.Password));
  }
}

export class PhoneNumberField extends ConfiguredField<string> {
  constructor(
    nameOrOptions: string | Named<FactoryConfig<typeof modernFields.Phone>>,
    options?: FactoryConfig<typeof modernFields.Phone>,
  ) {
    super(nameOrOptions, options, configured(modernFields.Phone));
  }
}

export class IDField extends ConfiguredField<number> {
  constructor(
    nameOrOptions: string | Named<FactoryConfig<typeof modernFields.ID>> = "id",
    options?: FactoryConfig<typeof modernFields.ID>,
  ) {
    super(nameOrOptions, options, configured(modernFields.ID));
  }
}

export class IntegerField extends ConfiguredField<number> {
  constructor(
    nameOrOptions: string | Named<FactoryConfig<typeof modernFields.Int>>,
    options?: FactoryConfig<typeof modernFields.Int>,
  ) {
    super(nameOrOptions, options, configured(modernFields.Int));
  }
}

export class FloatField extends ConfiguredField<number> {
  constructor(
    nameOrOptions: string | Named<FactoryConfig<typeof modernFields.Float>>,
    options?: FactoryConfig<typeof modernFields.Float>,
  ) {
    super(nameOrOptions, options, configured(modernFields.Float));
  }
}

export class BooleanField extends ConfiguredField<boolean> {
  constructor(
    nameOrOptions: string | Named<FactoryConfig<typeof modernFields.Bool>>,
    options?: FactoryConfig<typeof modernFields.Bool>,
  ) {
    super(nameOrOptions, options, configured(modernFields.Bool));
  }
}

export class DateField extends ConfiguredField<Date> {
  constructor(
    nameOrOptions: string | Named<FactoryConfig<typeof modernFields.Date>>,
    options?: FactoryConfig<typeof modernFields.Date>,
  ) {
    super(nameOrOptions, options, configured(modernFields.Date));
  }
}

export class DatetimeField extends ConfiguredField<Date> {
  constructor(
    nameOrOptions: string | Named<FactoryConfig<typeof modernFields.DateTime>>,
    options?: FactoryConfig<typeof modernFields.DateTime>,
  ) {
    super(nameOrOptions, options, configured(modernFields.DateTime));
  }
}

export class TimeField extends ConfiguredField<string> {
  constructor(
    nameOrOptions: string | Named<FactoryConfig<typeof modernFields.Time>>,
    options?: FactoryConfig<typeof modernFields.Time>,
  ) {
    super(nameOrOptions, options, configured(modernFields.Time));
  }
}

export class DateRangeField extends ConfiguredField<readonly [Date, Date]> {
  constructor(
    nameOrOptions: string | Named<FactoryConfig<typeof modernFields.DateRange>>,
    options?: FactoryConfig<typeof modernFields.DateRange>,
  ) {
    super(nameOrOptions, options, configured(modernFields.DateRange));
  }
}

export class StrListField extends ConfiguredField<readonly string[]> {
  constructor(
    nameOrOptions: string | Named<FactoryConfig<typeof modernFields.StrList>>,
    options?: FactoryConfig<typeof modernFields.StrList>,
  ) {
    super(nameOrOptions, options, configured(modernFields.StrList));
  }
}

export class IntegerListField extends ConfiguredField<readonly number[]> {
  constructor(
    nameOrOptions: string | Named<FactoryConfig<typeof modernFields.IntList>>,
    options?: FactoryConfig<typeof modernFields.IntList>,
  ) {
    super(nameOrOptions, options, configured(modernFields.IntList));
  }
}

export class RecordField extends ConfiguredField<Readonly<Record<string, unknown>>> {
  constructor(
    nameOrOptions: string | Named<FactoryConfig<typeof modernFields.Record>>,
    options?: FactoryConfig<typeof modernFields.Record>,
  ) {
    super(nameOrOptions, options, configured(modernFields.Record));
  }
}

export class FileField extends ConfiguredField<unknown> {
  constructor(
    nameOrOptions: string | Named<FactoryConfig<typeof modernFields.File>>,
    options?: FactoryConfig<typeof modernFields.File>,
  ) {
    super(nameOrOptions, options, configured(modernFields.File));
  }
}

export class ImageField extends ConfiguredField<unknown> {
  constructor(
    nameOrOptions: string | Named<FactoryConfig<typeof modernFields.Image>>,
    options?: FactoryConfig<typeof modernFields.Image>,
  ) {
    super(nameOrOptions, options, configured(modernFields.Image));
  }
}

export class EnumField<const TValues extends readonly (string | number)[]> extends SchemaField<
  TValues[number]
> {
  constructor(options: Named<{ readonly choices: TValues }> & Readonly<Record<string, unknown>>);
  constructor(name: string, choices: TValues, options?: Readonly<Record<string, unknown>>);
  constructor(
    nameOrOptions:
      string | (Named<{ readonly choices: TValues }> & Readonly<Record<string, unknown>>),
    choices?: TValues,
    options?: Readonly<Record<string, unknown>>,
  ) {
    const source = typeof nameOrOptions === "string" ? (options ?? {}) : nameOrOptions;
    const name = typeof nameOrOptions === "string" ? nameOrOptions : nameOrOptions.name;
    const values = typeof nameOrOptions === "string" ? choices! : nameOrOptions.choices;
    super(name, modernFields.Enum(values, omit(source, "name", "choices")) as RuntimeField);
  }
}

export interface ModelSchemaOptions<TContext> {
  readonly fields: readonly SchemaField[];
  readonly context?: () => TContext;
}

export class ModelSchema<TValue extends object = object, TContext = unknown> {
  readonly schema: Schema<Shape, TContext>;

  constructor(
    fieldsOrOptions: readonly SchemaField[] | ModelSchemaOptions<TContext>,
    context: () => TContext = () => undefined as TContext,
  ) {
    const arrayInput = isFieldArray(fieldsOrOptions);
    const items = arrayInput ? fieldsOrOptions : fieldsOrOptions.fields;
    const contextProvider = arrayInput ? context : (fieldsOrOptions.context ?? context);
    this.schema = new Schema(
      Object.fromEntries(items.map((item) => [item.name, item.field])) as Shape,
      {},
      contextProvider,
    );
  }

  get fields(): readonly RuntimeField[] {
    return Object.values(this.schema.shape);
  }
  parse(input: unknown): Readonly<TValue> {
    return this.schema.parse(input) as Readonly<TValue>;
  }
  validate(value: Readonly<TValue>) {
    return this.schema.validate(value as never);
  }
  write(value: Readonly<TValue>): unknown {
    return this.schema.write(value as never);
  }
  get(name: string): RuntimeField | undefined {
    return this.schema.shape[name];
  }
  keep(...names: readonly string[]): ModelSchema<TValue, TContext> {
    return ModelSchema.from(this.schema.keep(...names));
  }
  drop(...names: readonly string[]): ModelSchema<TValue, TContext> {
    return ModelSchema.from(this.schema.drop(...names));
  }
  extend(...items: readonly SchemaField[]): ModelSchema<TValue, TContext> {
    return ModelSchema.from(
      this.schema.extend(Object.fromEntries(items.map((item) => [item.name, item.field])) as Shape),
    );
  }
  modify(
    values: Readonly<Record<string, (field: RuntimeField) => RuntimeField>>,
  ): ModelSchema<TValue, TContext> {
    return ModelSchema.from(this.schema.modify(values));
  }
  reorder(...names: readonly string[]): ModelSchema<TValue, TContext> {
    return ModelSchema.from(this.schema.reorder(...names));
  }
  toForm(
    options: Parameters<Schema<Shape, TContext>["toForm"]>[0] = {},
  ): FormSchema<Schema<Shape, TContext>, unknown> {
    return this.schema.toForm(options);
  }

  private static from<TValue extends object, TContext>(
    schema: Schema<Shape, TContext>,
  ): ModelSchema<TValue, TContext> {
    const model = Object.create(ModelSchema.prototype) as ModelSchema<TValue, TContext>;
    Object.defineProperty(model, "schema", { value: schema, enumerable: true });
    return model;
  }
}

interface LegacyObject<TValue extends object, TKey> {
  readonly key: TKey;
  readonly value?: Readonly<TValue>;
  load(): Promise<Readonly<TValue> | undefined>;
  form(schema: FormSchema<Schema<Shape, unknown>, unknown>): unknown;
}

interface LegacyResource<TValue extends object, TKey> {
  readonly loading: boolean;
  readonly error?: unknown;
  filter(values: object, options?: { readonly merge?: boolean }): this;
  sort(field?: keyof TValue & string, descending?: boolean): this;
  page(index: number, size?: number): this;
  accumulate(enabled?: boolean): this;
  nextPage(): this;
  previousPage(): this;
  hasMore(): boolean;
  load(): Promise<readonly Readonly<TValue>[]>;
  refresh(): Promise<readonly Readonly<TValue>[]>;
  all(): readonly Readonly<TValue>[];
  get(key: TKey): LegacyObject<TValue, TKey>;
  create(input: Partial<TValue>): Promise<Readonly<TValue> | undefined>;
  update(key: TKey, input: Partial<TValue>): Promise<Readonly<TValue> | undefined>;
  replace(key: TKey, input: Partial<TValue>): Promise<Readonly<TValue> | undefined>;
  remove(key: TKey): Promise<void>;
  action(name: string, input: unknown): Promise<unknown>;
  invalidate(): void;
}

export interface DataSourceOptions<TValue extends object, TKey> {
  readonly resource: LegacyResource<TValue, TKey>;
  readonly key?: keyof TValue | ((value: Partial<TValue>) => TKey | undefined);
}

export class DataSource<TValue extends object, TKey = string | number> {
  readonly resource: LegacyResource<TValue, TKey>;
  private readonly keySelector?: DataSourceOptions<TValue, TKey>["key"];

  constructor(resourceOrOptions: LegacyResource<TValue, TKey> | DataSourceOptions<TValue, TKey>) {
    if ("resource" in resourceOrOptions) {
      this.resource = resourceOrOptions.resource;
      this.keySelector = resourceOrOptions.key;
    } else {
      this.resource = resourceOrOptions;
    }
  }

  get loading(): boolean {
    return this.resource.loading;
  }
  get error(): unknown {
    return this.resource.error;
  }
  filter(values: object, options?: { readonly merge?: boolean }): this {
    this.resource.filter(values, options);
    return this;
  }
  sort(field?: keyof TValue & string, descending = false): this {
    this.resource.sort(field, descending);
    return this;
  }
  page(index: number, size = 25): this {
    this.resource.page(index, size);
    return this;
  }
  accumulate(enabled = true): this {
    this.resource.accumulate(enabled);
    return this;
  }
  nextPage(): this {
    this.resource.nextPage();
    return this;
  }
  previousPage(): this {
    this.resource.previousPage();
    return this;
  }
  hasMorePages(): boolean {
    return this.resource.hasMore();
  }
  load(key?: TKey): Promise<readonly Readonly<TValue>[] | Readonly<TValue> | undefined> {
    return key === undefined ? this.resource.load() : this.resource.get(key).load();
  }
  refresh(): Promise<readonly Readonly<TValue>[]> {
    return this.resource.refresh();
  }
  all(): readonly Readonly<TValue>[] {
    return this.resource.all();
  }
  get(key: TKey): Readonly<TValue> | undefined {
    return this.resource.get(key).value;
  }
  object(key: TKey): LegacyObject<TValue, TKey> {
    return this.resource.get(key);
  }
  create(input: Partial<TValue>): Promise<Readonly<TValue> | undefined> {
    return this.resource.create(input);
  }
  update(key: TKey, input: Partial<TValue>): Promise<Readonly<TValue> | undefined> {
    return this.resource.update(key, input);
  }
  remove(key: TKey): Promise<void> {
    return this.resource.remove(key);
  }
  async save(input: Partial<TValue>): Promise<Readonly<TValue> | undefined> {
    const key = this.keyOf(input);
    return key === undefined ? this.resource.create(input) : this.resource.update(key, input);
  }
  request(name: string, input: unknown): Promise<unknown> {
    return this.resource.action(name, input);
  }
  invalidate(): void {
    this.resource.invalidate();
  }

  private keyOf(value: Partial<TValue>): TKey | undefined {
    if (typeof this.keySelector === "function") return this.keySelector(value);
    if (this.keySelector) return value[this.keySelector] as TKey | undefined;
    const fallback = (value as { readonly id?: unknown }).id;
    return (typeof fallback === "string" || typeof fallback === "number" ? fallback : undefined) as
      TKey | undefined;
  }
}

function namedOptions(
  nameOrOptions: string | { readonly name: string },
  options: object | undefined,
): readonly [string, object] {
  return typeof nameOrOptions === "string"
    ? [nameOrOptions, options ?? {}]
    : [nameOrOptions.name, omit(nameOrOptions, "name")];
}

function omit(source: object, ...names: readonly string[]): Readonly<Record<string, unknown>> {
  const excluded = new Set(names);
  return Object.fromEntries(Object.entries(source).filter(([name]) => !excluded.has(name)));
}

function configured(factory: (config?: never) => RuntimeField): (config: object) => RuntimeField {
  return (config) => factory(config as never);
}

function isFieldArray<TContext>(
  value: readonly SchemaField[] | ModelSchemaOptions<TContext>,
): value is readonly SchemaField[] {
  return Array.isArray(value);
}

export const fields = Object.freeze({
  CharField,
  TextField,
  RichTextField,
  EmailField,
  PasswordField,
  PhoneNumberField,
  IDField,
  IntegerField,
  FloatField,
  BooleanField,
  DateField,
  DatetimeField,
  TimeField,
  DateRangeField,
  StrListField,
  IntegerListField,
  RecordField,
  FileField,
  ImageField,
  EnumField,
});

export { struct };
