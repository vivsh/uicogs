import type { NormalizedFailure, ValidationIssue, ValidationResult } from "./issues.js";
import { normalizeFailure, ParseError } from "./issues.js";
import { Store, type ExternalStore } from "./store.js";
import type { BodyEncoding, MultipartAdapter, UploadProgress } from "./transport.js";

interface RuntimeFormField {
  readonly options?: Readonly<{ readonly wireName?: string }>;
}

export interface FormCompatibleSchema<
  TInput extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TOutput extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TEncoded = unknown,
> {
  readonly _input: TInput;
  readonly _output: TOutput;
  readonly _encoded: TEncoded;
  readonly shape: Readonly<Record<string, RuntimeFormField>>;
  parse(input: unknown): TOutput;
  parsePartial?(input: unknown): Readonly<Partial<TOutput>>;
  materialize?(input: Readonly<Partial<TOutput>>): TOutput;
  validate(value: TOutput, options?: { readonly signal?: AbortSignal }): Promise<ValidationResult>;
  write(value: TOutput): TEncoded;
}

type SchemaInput<T> = T extends { readonly _input: infer V } ? V : never;
type SchemaOutput<T> = T extends { readonly _output: infer V } ? V : never;
type SchemaEncoded<T> = T extends { readonly _encoded: infer V } ? V : never;

export type FormMode = "create" | "replace" | "patch" | "query" | "custom";

export interface FormSchemaOptions<TSchema extends FormCompatibleSchema, TPayload> {
  readonly mode?: FormMode;
  readonly encoding?: BodyEncoding;
  readonly multipart?: MultipartAdapter;
  readonly write?: (value: SchemaOutput<TSchema>) => TPayload;
  readonly validate?: (
    value: SchemaOutput<TSchema>,
  ) =>
    | void
    | string
    | ValidationIssue
    | readonly ValidationIssue[]
    | Promise<void | string | ValidationIssue | readonly ValidationIssue[]>;
}

export class FormSchema<TSchema extends FormCompatibleSchema, TPayload = SchemaEncoded<TSchema>> {
  declare readonly _values?: SchemaInput<TSchema>;
  declare readonly _payload?: TPayload;
  readonly mode: FormMode;
  readonly encoding: BodyEncoding;
  readonly multipart?: MultipartAdapter;
  readonly validator?: FormSchemaOptions<TSchema, TPayload>["validate"];
  private readonly writer?: FormSchemaOptions<TSchema, TPayload>["write"];

  constructor(
    readonly fields: TSchema,
    options: FormSchemaOptions<TSchema, TPayload> = {},
  ) {
    this.mode = options.mode ?? "patch";
    this.encoding = options.encoding ?? "auto";
    if (options.multipart) this.multipart = options.multipart;
    if (options.write) this.writer = options.write;
    if (options.validate) this.validator = options.validate;
    Object.freeze(this);
  }

  writeValue(value: SchemaOutput<TSchema>, changed?: ReadonlySet<string>): TPayload {
    const payload = this.writer
      ? this.writer(value)
      : (this.fields.write(value) as unknown as TPayload);
    if (this.writer || this.mode !== "patch" || !isRecord(payload) || !changed) return payload;
    const wireNames = new Set(
      [...changed].map((name) => this.fields.shape[name]?.options?.wireName ?? name),
    );
    return Object.freeze(
      Object.fromEntries(Object.entries(payload).filter(([name]) => wireNames.has(name))),
    ) as TPayload;
  }

  bindFields<TNextSchema extends FormCompatibleSchema>(
    fields: TNextSchema,
  ): FormSchema<TNextSchema, TPayload> {
    return new FormSchema(fields, {
      mode: this.mode,
      encoding: this.encoding,
      ...(this.multipart ? { multipart: this.multipart } : {}),
      ...(this.writer
        ? {
            write: this.writer as unknown as (value: SchemaOutput<TNextSchema>) => TPayload,
          }
        : {}),
      ...(this.validator
        ? {
            validate: this.validator as unknown as FormSchemaOptions<
              TNextSchema,
              TPayload
            >["validate"],
          }
        : {}),
    });
  }
}

export function createFormSchema<
  TSchema extends FormCompatibleSchema,
  TPayload = SchemaEncoded<TSchema>,
>(
  schema: TSchema,
  options: FormSchemaOptions<TSchema, TPayload> = {},
): FormSchema<TSchema, TPayload> {
  return new FormSchema(schema, options);
}

export interface FormProgress extends UploadProgress {
  readonly active: boolean;
}

export interface FormSnapshot<TValues extends Readonly<Record<string, unknown>>> {
  readonly revision: number;
  readonly values: TValues;
  readonly initialValues: TValues;
  readonly touched: ReadonlySet<keyof TValues>;
  readonly enabled: ReadonlySet<keyof TValues>;
  readonly pending: ReadonlySet<keyof TValues>;
  readonly dirty: boolean;
  readonly valid: boolean;
  readonly validating: boolean;
  readonly submitting: boolean;
  readonly progress: FormProgress;
  readonly issues: readonly ValidationIssue[];
  readonly unboundIssues: readonly ValidationIssue[];
  readonly error?: NormalizedFailure;
  readonly baseStale: boolean;
}

export interface SubmitSuccess<T> {
  readonly success: true;
  readonly value: T;
}
export interface SubmitFailure {
  readonly success: false;
  readonly failure: NormalizedFailure;
}
export type SubmitResult<T> = SubmitSuccess<T> | SubmitFailure;

export interface FormSubmitOptions {
  readonly signal: AbortSignal;
  readonly encoding: BodyEncoding;
  readonly multipart?: MultipartAdapter;
  readonly onUploadProgress: (progress: UploadProgress) => void;
}

type FormSubmitter<TPayload> = (payload: TPayload, options: FormSubmitOptions) => Promise<unknown>;

const idleProgress: FormProgress = Object.freeze({
  active: false,
  loaded: 0,
  lengthComputable: false,
});

export class FormController<
  TForm extends FormSchema<FormCompatibleSchema, unknown>,
> implements ExternalStore<FormSnapshot<FormValues<TForm>>> {
  private readonly store: Store<FormSnapshot<FormValues<TForm>>>;
  private validation?: AbortController;
  private submission?: AbortController;
  private unsubscribeBase?: () => void;
  private validationGeneration = 0;
  private submissionGeneration = 0;
  private fieldTimer?: ReturnType<typeof setTimeout>;
  private fieldValidationWaiters: ((result: ValidationResult) => void)[] = [];
  private submitPending = false;

  constructor(
    readonly schema: TForm,
    initial: Partial<FormValues<TForm>> = {},
    private readonly submitter?: FormSubmitter<FormPayload<TForm>>,
  ) {
    const values = Object.freeze({ ...initial }) as FormValues<TForm>;
    this.store = new Store({
      revision: 0,
      values,
      initialValues: values,
      touched: new Set(),
      enabled: new Set(Object.keys(schema.fields.shape) as (keyof FormValues<TForm>)[]),
      pending: new Set(),
      dirty: false,
      valid: false,
      validating: false,
      submitting: false,
      progress: idleProgress,
      issues: [],
      unboundIssues: [],
      baseStale: false,
    });
  }

  get values(): FormValues<TForm> {
    return this.store.getSnapshot().values;
  }
  get initialValues(): FormValues<TForm> {
    return this.store.getSnapshot().initialValues;
  }
  get dirty(): boolean {
    return this.store.getSnapshot().dirty;
  }
  get valid(): boolean {
    return this.store.getSnapshot().valid;
  }
  get validating(): boolean {
    return this.store.getSnapshot().validating;
  }
  get submitting(): boolean {
    return this.store.getSnapshot().submitting;
  }
  get progress(): FormProgress {
    return this.store.getSnapshot().progress;
  }
  get issues(): readonly ValidationIssue[] {
    return this.store.getSnapshot().issues;
  }
  get unboundIssues(): readonly ValidationIssue[] {
    return this.store.getSnapshot().unboundIssues;
  }
  get error(): NormalizedFailure | undefined {
    return this.store.getSnapshot().error;
  }
  get baseStale(): boolean {
    return this.store.getSnapshot().baseStale;
  }

  getSnapshot(): FormSnapshot<FormValues<TForm>> {
    return this.store.getSnapshot();
  }
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  set<K extends keyof FormValues<TForm>>(name: K, value: FormValues<TForm>[K]): void {
    this.validation?.abort();
    this.validationGeneration += 1;
    this.store.update((state) => {
      const values = Object.freeze({
        ...state.values,
        [name]: value,
      }) as FormValues<TForm>;
      return {
        ...state,
        revision: state.revision + 1,
        values,
        touched: new Set([...state.touched, name]),
        dirty: !shallowEqual(values, state.initialValues),
        valid: false,
        validating: false,
        pending: without(state.pending, name),
        issues: state.issues.filter((issue) => issue.path[0] !== name),
      };
    });
  }

  enable<K extends keyof FormValues<TForm>>(name: K, enabled = true): void {
    this.store.update((state) => ({
      ...state,
      revision: state.revision + 1,
      enabled: enabled ? new Set([...state.enabled, name]) : without(state.enabled, name),
      issues: enabled ? state.issues : state.issues.filter((issue) => issue.path[0] !== name),
    }));
  }

  field<K extends keyof FormValues<TForm>>(name: K) {
    const state = this.store.getSnapshot();
    return Object.freeze({
      name,
      value: state.values[name],
      initialValue: state.initialValues[name],
      touched: state.touched.has(name),
      dirty: !Object.is(state.values[name], state.initialValues[name]),
      enabled: state.enabled.has(name),
      pending: state.pending.has(name),
      issues: state.issues.filter((issue) => issue.path[0] === name),
    });
  }

  async validate(): Promise<ValidationResult> {
    return this.runValidation();
  }

  validateField<K extends keyof FormValues<TForm>>(
    name: K,
    options: { readonly debounceMs?: number } = {},
  ): Promise<ValidationResult> {
    if (!options.debounceMs) return this.runValidation(new Set([String(name)]));
    if (this.fieldTimer) clearTimeout(this.fieldTimer);
    return new Promise((resolve) => {
      this.fieldValidationWaiters.push(resolve);
      this.fieldTimer = setTimeout(() => {
        this.fieldTimer = undefined;
        void this.runValidation(new Set([String(name)])).then((result) => {
          const waiters = this.fieldValidationWaiters.splice(0);
          for (const waiter of waiters) waiter(result);
        });
      }, options.debounceMs);
    });
  }

  submit(): Promise<SubmitResult<unknown>> {
    if (this.submitPending)
      return Promise.resolve({
        success: false,
        failure: operationFailure("Form submission is already running"),
      });
    this.submitPending = true;
    return this.performSubmit().finally(() => {
      this.submitPending = false;
    });
  }

  private async performSubmit(): Promise<SubmitResult<unknown>> {
    const validation = await this.validate();
    if (!validation.valid) {
      const failure: NormalizedFailure = {
        kind: "validation",
        issues: validation.issues,
        retryable: false,
      };
      return { success: false, failure };
    }
    if (!this.submitter) throw new Error("This form has no submit operation");
    const generation = ++this.submissionGeneration;
    const revision = this.store.getSnapshot().revision;
    this.submission?.abort();
    this.submission = new AbortController();
    this.store.update((state) => ({
      ...state,
      submitting: true,
      progress: { ...idleProgress, active: true },
    }));
    try {
      const value = this.schema.fields.parse(this.values);
      const changed = changedNames(this.values, this.initialValues);
      const result = await this.submitter(
        this.schema.writeValue(value, changed) as FormPayload<TForm>,
        {
          signal: this.submission.signal,
          encoding: this.schema.encoding,
          ...(this.schema.multipart ? { multipart: this.schema.multipart } : {}),
          onUploadProgress: (progress) => this.updateProgress(generation, progress),
        },
      );
      if (generation === this.submissionGeneration)
        this.store.update((state) =>
          revision === state.revision
            ? {
                ...state,
                revision: state.revision + 1,
                submitting: false,
                progress: idleProgress,
                initialValues: state.values,
                touched: new Set(),
                dirty: false,
                baseStale: false,
                issues: [],
                unboundIssues: [],
                error: undefined,
              }
            : {
                ...state,
                revision: state.revision + 1,
                submitting: false,
                progress: idleProgress,
              },
        );
      return { success: true, value: result };
    } catch (error) {
      const failure = normalizeFailure(error);
      if (generation === this.submissionGeneration) {
        if (revision === this.store.getSnapshot().revision) this.applyFailure(failure);
        this.store.update((state) => ({
          ...state,
          revision: state.revision + 1,
          submitting: false,
          progress: idleProgress,
        }));
      }
      return { success: false, failure };
    }
  }

  reset(values: Partial<FormValues<TForm>> = this.initialValues): void {
    this.cancel();
    const next = Object.freeze({ ...values }) as FormValues<TForm>;
    this.store.setSnapshot({
      ...this.store.getSnapshot(),
      revision: this.store.getSnapshot().revision + 1,
      values: next,
      initialValues: next,
      touched: new Set(),
      pending: new Set(),
      dirty: false,
      valid: false,
      validating: false,
      submitting: false,
      progress: idleProgress,
      issues: [],
      unboundIssues: [],
      error: undefined,
      baseStale: false,
    });
  }

  rebase(values: Partial<FormValues<TForm>>): void {
    const state = this.store.getSnapshot();
    const initialValues = Object.freeze({
      ...state.initialValues,
      ...values,
    }) as FormValues<TForm>;
    this.store.setSnapshot({
      ...state,
      revision: state.revision + 1,
      initialValues,
      dirty: !shallowEqual(state.values, initialValues),
      baseStale: false,
    });
  }

  markBaseStale(): void {
    if (this.dirty)
      this.store.update((state) => ({
        ...state,
        revision: state.revision + 1,
        baseStale: true,
      }));
  }

  cancel(): void {
    this.validation?.abort();
    this.submission?.abort();
    this.validationGeneration += 1;
    this.submissionGeneration += 1;
    if (this.fieldTimer) clearTimeout(this.fieldTimer);
    this.fieldTimer = undefined;
    const cancelledResult = Object.freeze({
      valid: this.valid,
      issues: Object.freeze([...this.issues]),
    });
    for (const waiter of this.fieldValidationWaiters.splice(0)) waiter(cancelledResult);
    this.store.update((state) => ({
      ...state,
      revision: state.revision + 1,
      validating: false,
      submitting: false,
      pending: new Set(),
      progress: idleProgress,
    }));
  }

  observeBase(subscribe: (listener: () => void) => () => void): this {
    this.unsubscribeBase?.();
    this.unsubscribeBase = subscribe(() => this.markBaseStale());
    return this;
  }

  dispose(): void {
    this.cancel();
    this.unsubscribeBase?.();
    this.unsubscribeBase = undefined;
  }

  applyFailure(failure: NormalizedFailure): NormalizedFailure {
    const issues = failure.issues.map((issue) => ({
      ...issue,
      path: mapWirePath(this.schema.fields.shape, issue.path),
    }));
    const mappedFailure = Object.freeze({
      ...failure,
      issues: Object.freeze(issues),
    });
    const names = new Set(Object.keys(this.schema.fields.shape));
    const bound = mappedFailure.issues.filter(
      (issue) => typeof issue.path[0] === "string" && names.has(issue.path[0]),
    );
    const unbound = mappedFailure.issues.filter((issue) => !bound.includes(issue));
    this.store.update((state) => ({
      ...state,
      revision: state.revision + 1,
      issues: bound,
      unboundIssues: unbound,
      error: mappedFailure,
    }));
    return mappedFailure;
  }

  private async runValidation(names?: ReadonlySet<string>): Promise<ValidationResult> {
    this.validation?.abort();
    this.validation = new AbortController();
    const generation = ++this.validationGeneration;
    const enabled = new Set([...this.store.getSnapshot().enabled].map(String));
    const selected = names ?? enabled;
    this.store.update((state) => ({
      ...state,
      validating: true,
      pending: new Set([...state.pending, ...([...selected] as (keyof FormValues<TForm>)[])]),
    }));
    const issues: ValidationIssue[] = [];
    let value: Readonly<Record<string, unknown>> | undefined;
    try {
      value = this.schema.fields.parse(this.values);
    } catch (error) {
      if (!(error instanceof ParseError)) throw error;
      issues.push(...error.issues);
      if (this.schema.fields.parsePartial && this.schema.fields.materialize) {
        const rejected = new Set(
          error.issues.flatMap((issue) =>
            typeof issue.path[0] === "string" ? [issue.path[0]] : [],
          ),
        );
        const parseable = Object.fromEntries(
          Object.entries(this.values).filter(([name]) => !rejected.has(name)),
        );
        try {
          value = this.schema.fields.materialize(this.schema.fields.parsePartial(parseable));
        } catch (fallbackError) {
          if (fallbackError instanceof ParseError) issues.push(...fallbackError.issues);
          else throw fallbackError;
        }
      }
    }
    if (value) {
      const result = await this.schema.fields.validate(value, {
        signal: this.validation.signal,
      });
      issues.push(...result.issues);
      const formResult = await this.schema.validator?.(value);
      appendFormResult(issues, formResult);
    }
    const filtered = issues.filter((issue) => {
      const name = issue.path[0];
      return (
        name === undefined || (typeof name === "string" && enabled.has(name) && selected.has(name))
      );
    });
    const result = Object.freeze({
      valid: !filtered.some((issue) => issue.severity === "error"),
      issues: Object.freeze(filtered),
    });
    if (generation === this.validationGeneration) {
      this.store.update((state) => ({
        ...state,
        revision: state.revision + 1,
        validating: false,
        pending: new Set(),
        valid: names ? state.valid && result.valid : result.valid,
        issues: names
          ? Object.freeze([
              ...state.issues.filter((issue) => !names.has(String(issue.path[0]))),
              ...filtered,
            ])
          : result.issues,
      }));
    }
    return result;
  }

  private updateProgress(generation: number, progress: UploadProgress): void {
    if (generation !== this.submissionGeneration) return;
    this.store.update((state) => ({
      ...state,
      progress: Object.freeze({ ...progress, active: true }),
    }));
  }
}

export function createFormController<TForm extends FormSchema<FormCompatibleSchema, unknown>>(
  schema: TForm,
  initial: Partial<FormValues<TForm>> | undefined,
  submitter?: FormSubmitter<FormPayload<TForm>>,
): FormController<TForm> {
  return new FormController(schema, initial, submitter);
}

export type FormValues<TForm> = TForm extends { readonly _values?: infer T }
  ? Extract<T, Readonly<Record<string, unknown>>>
  : never;
export type FormPayload<TForm> = TForm extends { readonly _payload?: infer T } ? T : never;

function shallowEqual(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => Object.is(left[key], right[key]));
}

function changedNames(
  values: Readonly<Record<string, unknown>>,
  initial: Readonly<Record<string, unknown>>,
): ReadonlySet<string> {
  return new Set(
    [...new Set([...Object.keys(values), ...Object.keys(initial)])].filter(
      (name) => !Object.is(values[name], initial[name]),
    ),
  );
}

function appendFormResult(
  issues: ValidationIssue[],
  result: void | string | ValidationIssue | readonly ValidationIssue[],
): void {
  if (result === undefined) return;
  if (typeof result === "string")
    issues.push({
      path: [],
      message: result,
      code: "invalid",
      source: "client",
      severity: "error",
    });
  else if (Array.isArray(result)) issues.push(...result);
  else issues.push(result as ValidationIssue);
}

function mapWirePath(
  shape: Readonly<Record<string, RuntimeFormField>>,
  path: readonly (string | number)[],
): readonly (string | number)[] {
  const [first, ...rest] = path;
  if (typeof first !== "string") return path;
  for (const [name, field] of Object.entries(shape)) {
    if ((field.options?.wireName ?? name) === first) return [name, ...rest];
  }
  return path;
}

function without<T>(values: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(values);
  next.delete(value);
  return next;
}

function operationFailure(message: string): NormalizedFailure {
  return {
    kind: "conflict",
    message,
    issues: [],
    retryable: false,
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
