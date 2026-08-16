import { deepFreeze } from "./utils.js";

export interface Descriptor<TKind extends string = string, TOptions = unknown> {
  readonly kind: TKind;
  readonly options?: Readonly<TOptions>;
}

export interface Choice<TValue = string | number> {
  readonly label: string;
  readonly value: TValue;
  readonly disabled?: boolean;
  readonly description?: string;
}

export interface EditorDescriptorMap {
  text: { readonly autocomplete?: string; readonly inputMode?: string };
  textarea: {
    readonly rows?: number;
    readonly autogrow?: boolean;
    /** Native drag direction. Autogrow disables manual resizing to avoid competing height controls. */
    readonly resize?: EditorResize;
  };
  "rich-text": {
    readonly toolbar?: readonly string[];
    /** Approximate minimum number of editable text rows. */
    readonly rows?: number;
    /** Native drag direction for the editable content area. */
    readonly resize?: EditorResize;
  };
  email: { readonly autocomplete?: string };
  password: { readonly autocomplete?: string; readonly revealable?: boolean };
  number: { readonly step?: number; readonly prefix?: string; readonly suffix?: string };
  checkbox: { readonly labelPosition?: "before" | "after"; readonly toggleIndeterminate?: boolean };
  switch: { readonly labelPosition?: "before" | "after"; readonly toggleIndeterminate?: boolean };
  "radio-group": { readonly inline?: boolean };
  select: { readonly multiple?: boolean; readonly clearable?: boolean };
  autocomplete: { readonly multiple?: boolean; readonly minimumCharacters?: number };
  date: { readonly min?: string; readonly max?: string };
  time: { readonly minuteStep?: number };
  datetime: { readonly minuteStep?: number; readonly separate?: boolean };
  "date-range": { readonly min?: string; readonly max?: string };
  reference: { readonly clearable?: boolean };
  "reference-list": { readonly clearable?: boolean };
  file: { readonly accept?: string; readonly capture?: string };
  image: { readonly accept?: string; readonly capture?: string };
  color: { readonly format?: "hex" | "rgb" | "hsl" };
  "string-list": { readonly separator?: string; readonly allowDuplicates?: boolean };
  hidden: Readonly<Record<never, never>>;
}

/** Native resizing choices for generated multiline editors. */
export type EditorResize = "vertical" | "both" | false;

export interface FormatterDescriptorMap {
  text: { readonly empty?: string };
  boolean: { readonly trueLabel?: string; readonly falseLabel?: string };
  number: Intl.NumberFormatOptions;
  choice: Readonly<Record<never, never>>;
  choices: { readonly separator?: string };
  date: Intl.DateTimeFormatOptions;
  time: Intl.DateTimeFormatOptions;
  datetime: Intl.DateTimeFormatOptions;
  "date-range": Intl.DateTimeFormatOptions & { readonly separator?: string };
  reference: Readonly<Record<never, never>>;
  "reference-list": { readonly separator?: string };
  image: { readonly alt?: string; readonly preview?: boolean };
  file: { readonly download?: boolean };
  link: { readonly target?: "_self" | "_blank" };
  concat: { readonly separator?: string; readonly parts: readonly Descriptor[] };
}

export interface FilterDescriptorMap {
  contains: { readonly caseSensitive?: boolean; readonly queryName?: string };
  exact: { readonly queryName?: string };
  range: { readonly minimumName?: string; readonly maximumName?: string };
  custom: {
    readonly predicate?: (fieldValue: unknown, filterValue: unknown) => boolean;
    readonly encode?: (value: unknown) => Readonly<Record<string, unknown>>;
  };
}

export interface SortDescriptorMap {
  value: { readonly queryName?: string };
  key: { readonly path: string; readonly queryName?: string };
  custom: {
    readonly compare?: (left: unknown, right: unknown) => number;
    readonly encode?: (descending: boolean) => Readonly<Record<string, unknown>>;
  };
}

type DescriptorFor<TMap, K extends keyof TMap & string> = Descriptor<K, TMap[K]>;
export type EditorDescriptor<
  K extends keyof EditorDescriptorMap & string = keyof EditorDescriptorMap & string,
> = K extends keyof EditorDescriptorMap & string ? DescriptorFor<EditorDescriptorMap, K> : never;
export type FormatterDescriptor<
  K extends keyof FormatterDescriptorMap & string = keyof FormatterDescriptorMap & string,
> = K extends keyof FormatterDescriptorMap & string
  ? DescriptorFor<FormatterDescriptorMap, K>
  : never;
export type FilterDescriptor<
  K extends keyof FilterDescriptorMap & string = keyof FilterDescriptorMap & string,
> = K extends keyof FilterDescriptorMap & string ? DescriptorFor<FilterDescriptorMap, K> : never;
export type SortDescriptor<
  K extends keyof SortDescriptorMap & string = keyof SortDescriptorMap & string,
> = K extends keyof SortDescriptorMap & string ? DescriptorFor<SortDescriptorMap, K> : never;

function descriptor<TKind extends string, TOptions>(
  kind: TKind,
  options?: TOptions,
): Descriptor<TKind, TOptions> {
  return deepFreeze(options === undefined ? { kind } : { kind, options }) as Descriptor<
    TKind,
    TOptions
  >;
}

export const editor = {
  Text: (options: EditorDescriptorMap["text"] = {}) => descriptor("text", options),
  Textarea: (options: EditorDescriptorMap["textarea"] = {}) => descriptor("textarea", options),
  RichText: (options: EditorDescriptorMap["rich-text"] = {}) => descriptor("rich-text", options),
  Email: (options: EditorDescriptorMap["email"] = {}) => descriptor("email", options),
  Password: (options: EditorDescriptorMap["password"] = {}) => descriptor("password", options),
  Number: (options: EditorDescriptorMap["number"] = {}) => descriptor("number", options),
  Checkbox: (options: EditorDescriptorMap["checkbox"] = {}) => descriptor("checkbox", options),
  Switch: (options: EditorDescriptorMap["switch"] = {}) => descriptor("switch", options),
  RadioGroup: (options: EditorDescriptorMap["radio-group"] = {}) =>
    descriptor("radio-group", options),
  Select: (options: EditorDescriptorMap["select"] = {}) => descriptor("select", options),
  Autocomplete: (options: EditorDescriptorMap["autocomplete"] = {}) =>
    descriptor("autocomplete", options),
  Date: (options: EditorDescriptorMap["date"] = {}) => descriptor("date", options),
  Time: (options: EditorDescriptorMap["time"] = {}) => descriptor("time", options),
  DateTime: (options: EditorDescriptorMap["datetime"] = {}) => descriptor("datetime", options),
  DateRange: (options: EditorDescriptorMap["date-range"] = {}) => descriptor("date-range", options),
  Reference: (options: EditorDescriptorMap["reference"] = {}) => descriptor("reference", options),
  ReferenceList: (options: EditorDescriptorMap["reference-list"] = {}) =>
    descriptor("reference-list", options),
  File: (options: EditorDescriptorMap["file"] = {}) => descriptor("file", options),
  Image: (options: EditorDescriptorMap["image"] = {}) => descriptor("image", options),
  Color: (options: EditorDescriptorMap["color"] = {}) => descriptor("color", options),
  StringList: (options: EditorDescriptorMap["string-list"] = {}) =>
    descriptor("string-list", options),
  Hidden: () => descriptor("hidden", {}),
};

export const format = {
  Text: (options: FormatterDescriptorMap["text"] = {}) => descriptor("text", options),
  Boolean: (options: FormatterDescriptorMap["boolean"] = {}) => descriptor("boolean", options),
  Number: (options: FormatterDescriptorMap["number"] = {}) => descriptor("number", options),
  Choice: () => descriptor("choice", {}),
  Choices: (options: FormatterDescriptorMap["choices"] = {}) => descriptor("choices", options),
  Date: (options: FormatterDescriptorMap["date"] = {}) => descriptor("date", options),
  Time: (options: FormatterDescriptorMap["time"] = {}) => descriptor("time", options),
  DateTime: (options: FormatterDescriptorMap["datetime"] = {}) => descriptor("datetime", options),
  DateRange: (options: FormatterDescriptorMap["date-range"] = {}) =>
    descriptor("date-range", options),
  Reference: () => descriptor("reference", {}),
  ReferenceList: (options: FormatterDescriptorMap["reference-list"] = {}) =>
    descriptor("reference-list", options),
  Image: (options: FormatterDescriptorMap["image"] = {}) => descriptor("image", options),
  File: (options: FormatterDescriptorMap["file"] = {}) => descriptor("file", options),
  Link: (options: FormatterDescriptorMap["link"] = {}) => descriptor("link", options),
  Concat: (parts: readonly Descriptor[], options: { readonly separator?: string } = {}) =>
    descriptor("concat", { ...options, parts }),
};

export const filter = {
  Contains: (options: FilterDescriptorMap["contains"] = {}) => descriptor("contains", options),
  Exact: (options: FilterDescriptorMap["exact"] = {}) => descriptor("exact", options),
  Range: (options: FilterDescriptorMap["range"] = {}) => descriptor("range", options),
  Custom: (options: FilterDescriptorMap["custom"]) => descriptor("custom", options),
};

export const sort = {
  Value: (options: SortDescriptorMap["value"] = {}) => descriptor("value", options),
  Key: (path: string, options: { readonly queryName?: string } = {}) =>
    descriptor("key", { ...options, path }),
  Custom: (options: SortDescriptorMap["custom"]) => descriptor("custom", options),
};

export interface FormattedValue {
  readonly text: string;
  readonly value?: unknown;
  readonly tone?: string;
  readonly icon?: string;
  readonly accessibleLabel?: string;
  readonly href?: string;
  readonly mediaType?: string;
}
