# @uicogs/legacy API

Declaration SHA-256: `a43aa87a259f40045e50467b9a8c306483557718a09be688ce018814b11d0a77`

```ts
// index.d.ts
import * as _uicogs_core from '@uicogs/core';
import { Field, fields as fields$1, FormSchema, Schema, Shape } from '@uicogs/core';
export { struct } from '@uicogs/core';

type RuntimeField = Field<unknown, unknown, unknown, unknown, boolean, boolean, boolean>;
type FactoryConfig<TFactory> = TFactory extends (config?: infer TConfig) => unknown ? NonNullable<TConfig> : never;
type Named<T> = T & {
    readonly name: string;
};
declare class SchemaField<TValue = unknown> {
    readonly name: string;
    readonly field: RuntimeField;
    constructor(name: string, field: RuntimeField);
    modify(options: Readonly<Record<string, unknown>>): SchemaField<TValue>;
}
declare abstract class ConfiguredField<TValue> extends SchemaField<TValue> {
    constructor(nameOrOptions: string | {
        readonly name: string;
    }, options: object | undefined, factory: (config: object) => RuntimeField);
}
declare class CharField extends ConfiguredField<string> {
    constructor(nameOrOptions: string | Named<FactoryConfig<typeof fields$1.Str>>, options?: FactoryConfig<typeof fields$1.Str>);
}
declare class TextField extends ConfiguredField<string> {
    constructor(nameOrOptions: string | Named<FactoryConfig<typeof fields$1.Text>>, options?: FactoryConfig<typeof fields$1.Text>);
}
declare class RichTextField extends ConfiguredField<string> {
    constructor(nameOrOptions: string | Named<FactoryConfig<typeof fields$1.RichText>>, options?: FactoryConfig<typeof fields$1.RichText>);
}
declare class EmailField extends ConfiguredField<string> {
    constructor(nameOrOptions: string | Named<FactoryConfig<typeof fields$1.Email>>, options?: FactoryConfig<typeof fields$1.Email>);
}
declare class PasswordField extends ConfiguredField<string> {
    constructor(nameOrOptions: string | Named<FactoryConfig<typeof fields$1.Password>>, options?: FactoryConfig<typeof fields$1.Password>);
}
declare class PhoneNumberField extends ConfiguredField<string> {
    constructor(nameOrOptions: string | Named<FactoryConfig<typeof fields$1.Phone>>, options?: FactoryConfig<typeof fields$1.Phone>);
}
declare class IDField extends ConfiguredField<number> {
    constructor(nameOrOptions?: string | Named<FactoryConfig<typeof fields$1.ID>>, options?: FactoryConfig<typeof fields$1.ID>);
}
declare class IntegerField extends ConfiguredField<number> {
    constructor(nameOrOptions: string | Named<FactoryConfig<typeof fields$1.Int>>, options?: FactoryConfig<typeof fields$1.Int>);
}
declare class FloatField extends ConfiguredField<number> {
    constructor(nameOrOptions: string | Named<FactoryConfig<typeof fields$1.Float>>, options?: FactoryConfig<typeof fields$1.Float>);
}
declare class BooleanField extends ConfiguredField<boolean> {
    constructor(nameOrOptions: string | Named<FactoryConfig<typeof fields$1.Bool>>, options?: FactoryConfig<typeof fields$1.Bool>);
}
declare class DateField extends ConfiguredField<Date> {
    constructor(nameOrOptions: string | Named<FactoryConfig<typeof fields$1.Date>>, options?: FactoryConfig<typeof fields$1.Date>);
}
declare class DatetimeField extends ConfiguredField<Date> {
    constructor(nameOrOptions: string | Named<FactoryConfig<typeof fields$1.DateTime>>, options?: FactoryConfig<typeof fields$1.DateTime>);
}
declare class TimeField extends ConfiguredField<string> {
    constructor(nameOrOptions: string | Named<FactoryConfig<typeof fields$1.Time>>, options?: FactoryConfig<typeof fields$1.Time>);
}
declare class DateRangeField extends ConfiguredField<readonly [Date, Date]> {
    constructor(nameOrOptions: string | Named<FactoryConfig<typeof fields$1.DateRange>>, options?: FactoryConfig<typeof fields$1.DateRange>);
}
declare class StrListField extends ConfiguredField<readonly string[]> {
    constructor(nameOrOptions: string | Named<FactoryConfig<typeof fields$1.StrList>>, options?: FactoryConfig<typeof fields$1.StrList>);
}
declare class IntegerListField extends ConfiguredField<readonly number[]> {
    constructor(nameOrOptions: string | Named<FactoryConfig<typeof fields$1.IntList>>, options?: FactoryConfig<typeof fields$1.IntList>);
}
declare class RecordField extends ConfiguredField<Readonly<Record<string, unknown>>> {
    constructor(nameOrOptions: string | Named<FactoryConfig<typeof fields$1.Record>>, options?: FactoryConfig<typeof fields$1.Record>);
}
declare class FileField extends ConfiguredField<unknown> {
    constructor(nameOrOptions: string | Named<FactoryConfig<typeof fields$1.File>>, options?: FactoryConfig<typeof fields$1.File>);
}
declare class ImageField extends ConfiguredField<unknown> {
    constructor(nameOrOptions: string | Named<FactoryConfig<typeof fields$1.Image>>, options?: FactoryConfig<typeof fields$1.Image>);
}
declare class EnumField<const TValues extends readonly (string | number)[]> extends SchemaField<TValues[number]> {
    constructor(options: Named<{
        readonly choices: TValues;
    }> & Readonly<Record<string, unknown>>);
    constructor(name: string, choices: TValues, options?: Readonly<Record<string, unknown>>);
}
interface ModelSchemaOptions<TContext> {
    readonly fields: readonly SchemaField[];
    readonly context?: () => TContext;
}
declare class ModelSchema<TValue extends object = object, TContext = unknown> {
    readonly schema: Schema<Shape, TContext>;
    constructor(fieldsOrOptions: readonly SchemaField[] | ModelSchemaOptions<TContext>, context?: () => TContext);
    get fields(): readonly RuntimeField[];
    parse(input: unknown): Readonly<TValue>;
    validate(value: Readonly<TValue>): Promise<_uicogs_core.ValidationResult>;
    write(value: Readonly<TValue>): unknown;
    get(name: string): RuntimeField | undefined;
    keep(...names: readonly string[]): ModelSchema<TValue, TContext>;
    drop(...names: readonly string[]): ModelSchema<TValue, TContext>;
    extend(...items: readonly SchemaField[]): ModelSchema<TValue, TContext>;
    modify(values: Readonly<Record<string, (field: RuntimeField) => RuntimeField>>): ModelSchema<TValue, TContext>;
    reorder(...names: readonly string[]): ModelSchema<TValue, TContext>;
    toForm(options?: Parameters<Schema<Shape, TContext>["toForm"]>[0]): FormSchema<Schema<Shape, TContext>, unknown>;
    private static from;
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
    filter(values: object, options?: {
        readonly merge?: boolean;
    }): this;
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
interface DataSourceOptions<TValue extends object, TKey> {
    readonly resource: LegacyResource<TValue, TKey>;
    readonly key?: keyof TValue | ((value: Partial<TValue>) => TKey | undefined);
}
declare class DataSource<TValue extends object, TKey = string | number> {
    readonly resource: LegacyResource<TValue, TKey>;
    private readonly keySelector?;
    constructor(resourceOrOptions: LegacyResource<TValue, TKey> | DataSourceOptions<TValue, TKey>);
    get loading(): boolean;
    get error(): unknown;
    filter(values: object, options?: {
        readonly merge?: boolean;
    }): this;
    sort(field?: keyof TValue & string, descending?: boolean): this;
    page(index: number, size?: number): this;
    accumulate(enabled?: boolean): this;
    nextPage(): this;
    previousPage(): this;
    hasMorePages(): boolean;
    load(key?: TKey): Promise<readonly Readonly<TValue>[] | Readonly<TValue> | undefined>;
    refresh(): Promise<readonly Readonly<TValue>[]>;
    all(): readonly Readonly<TValue>[];
    get(key: TKey): Readonly<TValue> | undefined;
    object(key: TKey): LegacyObject<TValue, TKey>;
    create(input: Partial<TValue>): Promise<Readonly<TValue> | undefined>;
    update(key: TKey, input: Partial<TValue>): Promise<Readonly<TValue> | undefined>;
    remove(key: TKey): Promise<void>;
    save(input: Partial<TValue>): Promise<Readonly<TValue> | undefined>;
    request(name: string, input: unknown): Promise<unknown>;
    invalidate(): void;
    private keyOf;
}
declare const fields: Readonly<{
    CharField: typeof CharField;
    TextField: typeof TextField;
    RichTextField: typeof RichTextField;
    EmailField: typeof EmailField;
    PasswordField: typeof PasswordField;
    PhoneNumberField: typeof PhoneNumberField;
    IDField: typeof IDField;
    IntegerField: typeof IntegerField;
    FloatField: typeof FloatField;
    BooleanField: typeof BooleanField;
    DateField: typeof DateField;
    DatetimeField: typeof DatetimeField;
    TimeField: typeof TimeField;
    DateRangeField: typeof DateRangeField;
    StrListField: typeof StrListField;
    IntegerListField: typeof IntegerListField;
    RecordField: typeof RecordField;
    FileField: typeof FileField;
    ImageField: typeof ImageField;
    EnumField: typeof EnumField;
}>;

export { BooleanField, CharField, DataSource, type DataSourceOptions, DateField, DateRangeField, DatetimeField, EmailField, EnumField, FileField, FloatField, IDField, ImageField, IntegerField, IntegerListField, ModelSchema, type ModelSchemaOptions, PasswordField, PhoneNumberField, RecordField, RichTextField, SchemaField, StrListField, TextField, TimeField, fields };
```
