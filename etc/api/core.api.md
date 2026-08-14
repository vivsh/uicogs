# @uicogs/core API

Declaration SHA-256: `c6fdeba5264873d7dcb0230ab4cd9f1a29e9ecf9fc4dc0af8b074c73ec723021`

```ts
// index.d.ts
interface ExternalStore<TSnapshot> {
    getSnapshot(): TSnapshot;
    subscribe(listener: () => void): () => void;
}
type ControllerAdapter = <T extends ExternalStore<object>>(controller: T) => T;
declare class Store<TSnapshot extends object> implements ExternalStore<TSnapshot> {
    private snapshot;
    private readonly listeners;
    constructor(snapshot: TSnapshot);
    getSnapshot(): TSnapshot;
    setSnapshot(snapshot: TSnapshot): void;
    update(update: (snapshot: TSnapshot) => TSnapshot): void;
    subscribe(listener: () => void): () => void;
}
declare class EventBus<TEvents extends object> {
    private readonly listeners;
    on<K extends keyof TEvents>(event: K, listener: (payload: TEvents[K]) => void): () => void;
    once<K extends keyof TEvents>(event: K, listener: (payload: TEvents[K]) => void): () => void;
    off<K extends keyof TEvents>(event: K, listener: (payload: TEvents[K]) => void): void;
    emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void;
    clear<K extends keyof TEvents>(event?: K): void;
}

type Simplify<T> = {
    [K in keyof T]: T[K];
} & {};
type DeepReadonly<T> = T extends (...arguments_: never[]) => unknown ? T : T extends readonly (infer TItem)[] ? readonly DeepReadonly<TItem>[] : T extends object ? {
    readonly [K in keyof T]: DeepReadonly<T[K]>;
} : T;
declare function isRecord(value: unknown): value is Readonly<Record<string, unknown>>;
declare function deepFreeze<T>(value: T): Readonly<T>;
declare function stableSerialize(value: unknown): string;
declare function joinUrl(base: string, path: string): string;

interface ContextParser<T> {
    parse(input: unknown): T;
}
type ContextPersistenceStatus = "memory" | "loading" | "ready" | "error";
interface ContextStoreSnapshot<TContext> {
    readonly revision: number;
    readonly value: DeepReadonly<TContext>;
    readonly persistenceStatus: ContextPersistenceStatus;
    readonly persistenceError?: string;
}
type ContextPatch<T> = T extends object ? Partial<T> : never;
interface RuntimeContextStore<TApplicationContext, TContext = TApplicationContext> extends ExternalStore<ContextStoreSnapshot<TContext>> {
    readonly value: DeepReadonly<TContext>;
    readonly persistenceStatus: ContextPersistenceStatus;
    readonly persistenceError: string | undefined;
    set(value: TApplicationContext): void;
    update(patch: ContextPatch<TApplicationContext>): void;
    reset(): Promise<void>;
}
declare class ContextStoreController<TApplicationContext, TContext> implements RuntimeContextStore<TApplicationContext, TContext> {
    private readonly persistence;
    private readonly compose;
    private readonly store;
    private readonly initial;
    private application;
    private authSnapshot?;
    private disposed;
    private initialized;
    private applicationGeneration;
    private pendingWrite;
    private writing;
    private writeCompletion?;
    constructor(initial: TApplicationContext, persistence: {
        readonly backend: PersistenceBackend;
        readonly schema?: ContextParser<TApplicationContext> | ContextParser<unknown>;
    } | undefined, compose: (application: DeepReadonly<TApplicationContext>, auth: object | undefined) => DeepReadonly<TContext>, authSnapshot?: object);
    get value(): DeepReadonly<TContext>;
    get persistenceStatus(): ContextPersistenceStatus;
    get persistenceError(): string | undefined;
    getSnapshot(): ContextStoreSnapshot<TContext>;
    subscribe(listener: () => void): () => void;
    set(value: TApplicationContext): void;
    update(patch: ContextPatch<TApplicationContext>): void;
    reset(): Promise<void>;
    initialize(): Promise<void>;
    setAuthSnapshot(snapshot: object): void;
    dispose(): void;
    private parseStored;
    private publishValue;
    private publishPersistence;
    private queueWrite;
    private drainWrites;
    private assertActive;
}

interface PersistenceBackend {
    read(key: string): Promise<unknown | undefined>;
    write(key: string, value: unknown): Promise<void>;
    remove(key: string): Promise<void>;
}
interface ContextPersistenceOptions<TContext> {
    readonly schema?: ContextParser<TContext>;
}
interface CachePersistenceOptions {
    readonly eraseOnLogout?: boolean;
}
interface PersistenceOptions<TContext> {
    readonly backend: PersistenceBackend;
    readonly context?: boolean | ContextPersistenceOptions<TContext>;
    readonly cache?: boolean | CachePersistenceOptions;
}

type EntityKey = string | number;
type CachePolicy = "cache-first" | "network-only" | "stale-while-revalidate";
type CachePersistenceStatus = "memory" | "loading" | "ready" | "error";
interface EntityEntry {
    readonly key: EntityKey;
    readonly data: Readonly<Record<string, unknown>>;
    readonly snapshot?: Readonly<Record<string, unknown>>;
    readonly knownFields: ReadonlySet<string>;
    readonly version: number;
    readonly updatedAt: number;
    readonly staleAt: number;
    readonly tombstone: boolean;
    readonly sourceVersion?: string | number;
}
interface CollectionEntry {
    readonly identity: string;
    readonly keys: readonly EntityKey[];
    readonly pageInfo?: unknown;
    readonly updatedAt: number;
    readonly staleAt: number;
}
interface CacheAddress {
    readonly scope: string;
    readonly resource: string;
}
interface CacheStore {
    readonly persistenceStatus: CachePersistenceStatus;
    readonly persistenceError: string | undefined;
    readonly persistenceScope: string;
    entity(address: CacheAddress, key: EntityKey): EntityEntry | undefined;
    setEntity(address: CacheAddress, entry: EntityEntry): void;
    invalidateEntity(address: CacheAddress, key: EntityKey): void;
    collection(address: CacheAddress, identity: string): CollectionEntry | undefined;
    setCollection(address: CacheAddress, entry: CollectionEntry): void;
    removeCollection(address: CacheAddress, identity: string): void;
    collectionEntries(address: CacheAddress): readonly CollectionEntry[];
    invalidateResource(address: CacheAddress): void;
    markResourceStale(address: CacheAddress): void;
    removeEntityFromCollections(address: CacheAddress, key: EntityKey): void;
    clearScope(scope: string): void;
    subscribeEntity(address: CacheAddress, key: EntityKey, listener: () => void): () => void;
    subscribeCollection(address: CacheAddress, identity: string, listener: () => void): () => void;
}
interface CacheDump {
    readonly scope: string;
    readonly entities: readonly (readonly [string, EntityEntry])[];
    readonly collections: readonly (readonly [string, CollectionEntry])[];
}
declare class MemoryCache implements CacheStore {
    private readonly entities;
    private readonly collections;
    private readonly listeners;
    persistenceScope: string;
    readonly persistenceStatus: CachePersistenceStatus;
    readonly persistenceError: undefined;
    activateScope(scope: string): void;
    entity(address: CacheAddress, key: EntityKey): EntityEntry | undefined;
    setEntity(address: CacheAddress, entry: EntityEntry): void;
    invalidateEntity(address: CacheAddress, key: EntityKey): void;
    collection(address: CacheAddress, identity: string): CollectionEntry | undefined;
    setCollection(address: CacheAddress, entry: CollectionEntry): void;
    removeCollection(address: CacheAddress, identity: string): void;
    collectionEntries(address: CacheAddress): readonly CollectionEntry[];
    invalidateResource(address: CacheAddress): void;
    markResourceStale(address: CacheAddress): void;
    removeEntityFromCollections(address: CacheAddress, key: EntityKey): void;
    clearScope(scope: string): void;
    dump(scope: string): CacheDump;
    restore(dump: CacheDump, baseline?: CacheDump): void;
    subscribeEntity(address: CacheAddress, key: EntityKey, listener: () => void): () => void;
    subscribeCollection(address: CacheAddress, identity: string, listener: () => void): () => void;
    private subscribe;
    private emit;
}
declare function memoryCache(): MemoryCache;
declare function mergeEntity(current: EntityEntry | undefined, key: EntityKey, patch: Readonly<Record<string, unknown>>, options: {
    readonly ttl: number;
    readonly now?: number;
    readonly requestStartedAt?: number;
    readonly sourceVersion?: string | number;
}): EntityEntry;
declare function tombstoneEntity(current: EntityEntry | undefined, key: EntityKey, sourceVersion?: string | number): EntityEntry;

type IssuePath = readonly (string | number)[];
interface ValidationIssue {
    readonly path: IssuePath;
    readonly message: string;
    readonly code: string;
    readonly source: "parse" | "client" | "server";
    readonly severity: "error" | "warning";
    readonly metadata?: Readonly<Record<string, unknown>>;
}
interface ValidationResult {
    readonly valid: boolean;
    readonly issues: readonly ValidationIssue[];
}
declare class ParseError extends Error {
    readonly issues: readonly ValidationIssue[];
    constructor(issues: readonly ValidationIssue[]);
}
type FailureKind = "validation" | "authentication" | "permission" | "not-found" | "conflict" | "rate-limit" | "network" | "server" | "unknown";
interface NormalizedFailure {
    readonly kind: FailureKind;
    readonly status?: number;
    readonly message?: string;
    readonly issues: readonly ValidationIssue[];
    readonly retryable: boolean;
}
declare class RequestError extends Error {
    readonly failure: NormalizedFailure;
    constructor(failure: NormalizedFailure);
}
declare function parseIssue(path: IssuePath, message: string, code?: string): ValidationIssue;
declare function clientIssue(path: IssuePath, message: string, code?: string, severity?: ValidationIssue["severity"]): ValidationIssue;
declare function normalizeFailure(error: unknown): NormalizedFailure;

type BodyEncoding = "auto" | "json" | "multipart" | "raw";
interface MultipartPart {
    readonly name: string;
    readonly value: unknown;
}
interface MultipartAdapter {
    readonly name: string;
    path(path: readonly (string | number)[]): string;
    parts?(part: MultipartPart & {
        readonly path: readonly (string | number)[];
    }): readonly MultipartPart[];
    removal?(path: readonly (string | number)[]): readonly MultipartPart[];
}
interface UploadProgress {
    readonly loaded: number;
    readonly total?: number;
    readonly fraction?: number;
    readonly lengthComputable: boolean;
}
interface TransportRequest {
    readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    readonly url: string;
    readonly query?: Readonly<Record<string, unknown>>;
    readonly body?: unknown;
    readonly encoding?: BodyEncoding;
    readonly multipart?: MultipartAdapter;
    readonly headers?: Readonly<Record<string, string>>;
    readonly signal: AbortSignal;
    readonly onUploadProgress?: (progress: UploadProgress) => void;
    readonly authentication?: "required" | "optional" | "none" | "refresh" | "establish" | "logout";
    readonly credentials?: RequestCredentials;
}
interface TransportResponse<T = unknown> {
    readonly status: number;
    readonly data: T;
    readonly headers?: Readonly<Record<string, string>>;
}
interface TransportCapabilities {
    readonly uploadProgress?: "determinate" | "indeterminate";
}
interface StreamResponse {
    readonly status: number;
    readonly headers?: Readonly<Record<string, string>>;
    readonly body: AsyncIterable<Uint8Array>;
}
interface Transport {
    readonly capabilities?: TransportCapabilities;
    request(request: TransportRequest): Promise<TransportResponse<unknown>>;
    openStream?(request: TransportRequest): Promise<StreamResponse>;
}
interface TransportMiddleware {
    request(request: TransportRequest, next: (request: TransportRequest) => Promise<TransportResponse<unknown>>): Promise<TransportResponse<unknown>>;
    openStream?(request: TransportRequest, next: (request: TransportRequest) => Promise<StreamResponse>): Promise<StreamResponse>;
}
interface HttpRetryOptions {
    readonly maximumRetries?: number;
    readonly statuses?: readonly number[];
    readonly initialDelayMs?: number;
    readonly maximumDelayMs?: number;
    readonly jitter?: number;
    readonly respectRetryAfter?: boolean;
}
interface DefaultHttpOptions {
    readonly fetch?: typeof globalThis.fetch;
    readonly timeoutMs?: number;
    readonly retry?: false | HttpRetryOptions;
    readonly multipart?: MultipartAdapter;
}
declare class TransportExecutionError extends Error {
    readonly code: "network" | "timeout" | "protocol";
    readonly retryable: boolean;
    constructor(code: "network" | "timeout" | "protocol", message: string, retryable: boolean, options?: {
        readonly status?: number;
        readonly cause?: unknown;
    });
    readonly status?: number;
}
interface ErrorAdapter {
    adapt(response: TransportResponse<unknown>): NormalizedFailure | undefined;
}
/** Identifies how a successful response will be consumed by the runtime. */
type ResponseKind = "entity" | "collection" | "action";
/** Describes the resource or operation receiving a successful response. */
interface ResponseDecodeContext {
    readonly kind: ResponseKind;
    readonly resource?: string;
    readonly operation?: string;
}
/** Decodes successful responses and supplies related pagination and failure behavior. */
interface ResponseAdapter {
    readonly name: string;
    decode?(response: TransportResponse<unknown>, context: ResponseDecodeContext): unknown;
    readonly pagination?: PaginationAdapter;
    readonly errorAdapter?: ErrorAdapter;
}
interface PageInfo {
    readonly index?: number;
    readonly size?: number;
    readonly count?: number;
    readonly totalPages?: number;
    readonly hasNext: boolean;
    readonly hasPrevious: boolean;
    readonly nextToken?: unknown;
    readonly previousToken?: unknown;
}
interface PaginationResult {
    readonly items: readonly unknown[];
    readonly pageInfo?: PageInfo;
    readonly nextPage?: unknown;
    readonly previousPage?: unknown;
}
interface PaginationAdapter {
    readonly name: string;
    request(page: Readonly<PageState>): Readonly<Record<string, unknown>>;
    response(response: TransportResponse<unknown>, page?: Readonly<PageState>): PaginationResult;
}
interface PageState {
    readonly index: number;
    readonly size: number;
    readonly token?: unknown;
}
declare const pagination: {
    page(options?: {
        readonly pageParam?: string;
        readonly sizeParam?: string;
        readonly resultsKey?: string;
        readonly countKey?: string;
        readonly nextKey?: string;
        readonly previousKey?: string;
    }): PaginationAdapter;
    offset(options?: {
        readonly offsetParam?: string;
        readonly limitParam?: string;
    }): PaginationAdapter;
    cursor(options?: {
        readonly cursorParam?: string;
        readonly sizeParam?: string;
    }): PaginationAdapter;
    client(): PaginationAdapter;
    custom(adapter: PaginationAdapter): PaginationAdapter;
};
/** Framework-neutral response adapter builders. */
declare const responseAdapters: {
    custom(adapter: ResponseAdapter): ResponseAdapter;
};

interface RuntimeFormField {
    readonly options?: Readonly<{
        readonly wireName?: string;
    }>;
}
interface FormCompatibleSchema<TInput extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>, TOutput extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>, TEncoded = unknown> {
    readonly _input: TInput;
    readonly _output: TOutput;
    readonly _encoded: TEncoded;
    readonly shape: Readonly<Record<string, RuntimeFormField>>;
    parse(input: unknown): TOutput;
    parsePartial?(input: unknown): Readonly<Partial<TOutput>>;
    materialize?(input: Readonly<Partial<TOutput>>): TOutput;
    validate(value: TOutput, options?: {
        readonly signal?: AbortSignal;
    }): Promise<ValidationResult>;
    write(value: TOutput): TEncoded;
}
type SchemaInput<T> = T extends {
    readonly _input: infer V;
} ? V : never;
type SchemaOutput<T> = T extends {
    readonly _output: infer V;
} ? V : never;
type SchemaEncoded<T> = T extends {
    readonly _encoded: infer V;
} ? V : never;
type FormMode = "create" | "replace" | "patch" | "query" | "custom";
interface FormSchemaOptions<TSchema extends FormCompatibleSchema, TPayload> {
    readonly mode?: FormMode;
    readonly encoding?: BodyEncoding;
    readonly multipart?: MultipartAdapter;
    readonly write?: (value: SchemaOutput<TSchema>) => TPayload;
    readonly validate?: (value: SchemaOutput<TSchema>) => void | string | ValidationIssue | readonly ValidationIssue[] | Promise<void | string | ValidationIssue | readonly ValidationIssue[]>;
}
declare class FormSchema<TSchema extends FormCompatibleSchema, TPayload = SchemaEncoded<TSchema>> {
    readonly fields: TSchema;
    readonly _values?: SchemaInput<TSchema>;
    readonly _payload?: TPayload;
    readonly mode: FormMode;
    readonly encoding: BodyEncoding;
    readonly multipart?: MultipartAdapter;
    readonly validator?: FormSchemaOptions<TSchema, TPayload>["validate"];
    private readonly writer?;
    constructor(fields: TSchema, options?: FormSchemaOptions<TSchema, TPayload>);
    writeValue(value: SchemaOutput<TSchema>, changed?: ReadonlySet<string>): TPayload;
    bindFields<TNextSchema extends FormCompatibleSchema>(fields: TNextSchema): FormSchema<TNextSchema, TPayload>;
}
declare function createFormSchema<TSchema extends FormCompatibleSchema, TPayload = SchemaEncoded<TSchema>>(schema: TSchema, options?: FormSchemaOptions<TSchema, TPayload>): FormSchema<TSchema, TPayload>;
interface FormProgress extends UploadProgress {
    readonly active: boolean;
}
interface FormSnapshot<TValues extends Readonly<Record<string, unknown>>> {
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
interface SubmitSuccess<T> {
    readonly success: true;
    readonly value: T;
}
interface SubmitFailure {
    readonly success: false;
    readonly failure: NormalizedFailure;
}
type SubmitResult<T> = SubmitSuccess<T> | SubmitFailure;
interface FormSubmitOptions {
    readonly signal: AbortSignal;
    readonly encoding: BodyEncoding;
    readonly multipart?: MultipartAdapter;
    readonly onUploadProgress: (progress: UploadProgress) => void;
}
type FormSubmitter<TPayload> = (payload: TPayload, options: FormSubmitOptions) => Promise<unknown>;
declare class FormController<TForm extends FormSchema<FormCompatibleSchema, unknown>> implements ExternalStore<FormSnapshot<FormValues<TForm>>> {
    readonly schema: TForm;
    private readonly submitter?;
    private readonly store;
    private validation?;
    private submission?;
    private unsubscribeBase?;
    private validationGeneration;
    private submissionGeneration;
    private fieldTimer?;
    private fieldValidationWaiters;
    private submitPending;
    constructor(schema: TForm, initial?: Partial<FormValues<TForm>>, submitter?: FormSubmitter<FormPayload<TForm>> | undefined);
    get values(): FormValues<TForm>;
    get initialValues(): FormValues<TForm>;
    get dirty(): boolean;
    get valid(): boolean;
    get validating(): boolean;
    get submitting(): boolean;
    get progress(): FormProgress;
    get issues(): readonly ValidationIssue[];
    get unboundIssues(): readonly ValidationIssue[];
    get error(): NormalizedFailure | undefined;
    get baseStale(): boolean;
    getSnapshot(): FormSnapshot<FormValues<TForm>>;
    subscribe(listener: () => void): () => void;
    set<K extends keyof FormValues<TForm>>(name: K, value: FormValues<TForm>[K]): void;
    enable<K extends keyof FormValues<TForm>>(name: K, enabled?: boolean): void;
    field<K extends keyof FormValues<TForm>>(name: K): Readonly<{
        name: K;
        value: FormValues<TForm>[K];
        initialValue: FormValues<TForm>[K];
        touched: boolean;
        dirty: boolean;
        enabled: boolean;
        pending: boolean;
        issues: ValidationIssue[];
    }>;
    validate(): Promise<ValidationResult>;
    validateField<K extends keyof FormValues<TForm>>(name: K, options?: {
        readonly debounceMs?: number;
    }): Promise<ValidationResult>;
    submit(): Promise<SubmitResult<unknown>>;
    private performSubmit;
    reset(values?: Partial<FormValues<TForm>>): void;
    rebase(values: Partial<FormValues<TForm>>): void;
    markBaseStale(): void;
    cancel(): void;
    observeBase(subscribe: (listener: () => void) => () => void): this;
    dispose(): void;
    applyFailure(failure: NormalizedFailure): NormalizedFailure;
    private runValidation;
    private updateProgress;
}
declare function createFormController<TForm extends FormSchema<FormCompatibleSchema, unknown>>(schema: TForm, initial: Partial<FormValues<TForm>> | undefined, submitter?: FormSubmitter<FormPayload<TForm>>): FormController<TForm>;
type FormValues<TForm> = TForm extends {
    readonly _values?: infer T;
} ? Extract<T, Readonly<Record<string, unknown>>> : never;
type FormPayload<TForm> = TForm extends {
    readonly _payload?: infer T;
} ? T : never;

interface Descriptor<TKind extends string = string, TOptions = unknown> {
    readonly kind: TKind;
    readonly options?: Readonly<TOptions>;
}
interface Choice<TValue = string | number> {
    readonly label: string;
    readonly value: TValue;
    readonly disabled?: boolean;
    readonly description?: string;
}
interface EditorDescriptorMap {
    text: {
        readonly autocomplete?: string;
        readonly inputMode?: string;
    };
    textarea: {
        readonly rows?: number;
        readonly autogrow?: boolean;
    };
    "rich-text": {
        readonly toolbar?: readonly string[];
    };
    email: {
        readonly autocomplete?: string;
    };
    password: {
        readonly autocomplete?: string;
        readonly revealable?: boolean;
    };
    number: {
        readonly step?: number;
        readonly prefix?: string;
        readonly suffix?: string;
    };
    checkbox: {
        readonly labelPosition?: "before" | "after";
    };
    switch: {
        readonly labelPosition?: "before" | "after";
    };
    select: {
        readonly multiple?: boolean;
        readonly clearable?: boolean;
    };
    autocomplete: {
        readonly multiple?: boolean;
        readonly minimumCharacters?: number;
    };
    date: {
        readonly min?: string;
        readonly max?: string;
    };
    time: {
        readonly minuteStep?: number;
    };
    datetime: {
        readonly minuteStep?: number;
        readonly separate?: boolean;
    };
    "date-range": {
        readonly min?: string;
        readonly max?: string;
    };
    reference: {
        readonly clearable?: boolean;
    };
    "reference-list": {
        readonly clearable?: boolean;
    };
    file: {
        readonly accept?: string;
        readonly capture?: string;
    };
    image: {
        readonly accept?: string;
        readonly capture?: string;
    };
    color: {
        readonly format?: "hex" | "rgb" | "hsl";
    };
    "string-list": {
        readonly separator?: string;
        readonly allowDuplicates?: boolean;
    };
    hidden: Readonly<Record<never, never>>;
}
interface FormatterDescriptorMap {
    text: {
        readonly empty?: string;
    };
    boolean: {
        readonly trueLabel?: string;
        readonly falseLabel?: string;
    };
    number: Intl.NumberFormatOptions;
    choice: Readonly<Record<never, never>>;
    choices: {
        readonly separator?: string;
    };
    date: Intl.DateTimeFormatOptions;
    time: Intl.DateTimeFormatOptions;
    datetime: Intl.DateTimeFormatOptions;
    "date-range": Intl.DateTimeFormatOptions & {
        readonly separator?: string;
    };
    reference: Readonly<Record<never, never>>;
    "reference-list": {
        readonly separator?: string;
    };
    image: {
        readonly alt?: string;
        readonly preview?: boolean;
    };
    file: {
        readonly download?: boolean;
    };
    link: {
        readonly target?: "_self" | "_blank";
    };
    concat: {
        readonly separator?: string;
        readonly parts: readonly Descriptor[];
    };
}
interface FilterDescriptorMap {
    contains: {
        readonly caseSensitive?: boolean;
        readonly queryName?: string;
    };
    exact: {
        readonly queryName?: string;
    };
    range: {
        readonly minimumName?: string;
        readonly maximumName?: string;
    };
    custom: {
        readonly predicate?: (fieldValue: unknown, filterValue: unknown) => boolean;
        readonly encode?: (value: unknown) => Readonly<Record<string, unknown>>;
    };
}
interface SortDescriptorMap {
    value: {
        readonly queryName?: string;
    };
    key: {
        readonly path: string;
        readonly queryName?: string;
    };
    custom: {
        readonly compare?: (left: unknown, right: unknown) => number;
        readonly encode?: (descending: boolean) => Readonly<Record<string, unknown>>;
    };
}
type DescriptorFor<TMap, K extends keyof TMap & string> = Descriptor<K, TMap[K]>;
type EditorDescriptor<K extends keyof EditorDescriptorMap & string = keyof EditorDescriptorMap & string> = K extends keyof EditorDescriptorMap & string ? DescriptorFor<EditorDescriptorMap, K> : never;
type FormatterDescriptor<K extends keyof FormatterDescriptorMap & string = keyof FormatterDescriptorMap & string> = K extends keyof FormatterDescriptorMap & string ? DescriptorFor<FormatterDescriptorMap, K> : never;
type FilterDescriptor<K extends keyof FilterDescriptorMap & string = keyof FilterDescriptorMap & string> = K extends keyof FilterDescriptorMap & string ? DescriptorFor<FilterDescriptorMap, K> : never;
type SortDescriptor<K extends keyof SortDescriptorMap & string = keyof SortDescriptorMap & string> = K extends keyof SortDescriptorMap & string ? DescriptorFor<SortDescriptorMap, K> : never;
declare const editor: {
    Text: (options?: EditorDescriptorMap["text"]) => Descriptor<"text", {
        readonly autocomplete?: string;
        readonly inputMode?: string;
    }>;
    Textarea: (options?: EditorDescriptorMap["textarea"]) => Descriptor<"textarea", {
        readonly rows?: number;
        readonly autogrow?: boolean;
    }>;
    RichText: (options?: EditorDescriptorMap["rich-text"]) => Descriptor<"rich-text", {
        readonly toolbar?: readonly string[];
    }>;
    Email: (options?: EditorDescriptorMap["email"]) => Descriptor<"email", {
        readonly autocomplete?: string;
    }>;
    Password: (options?: EditorDescriptorMap["password"]) => Descriptor<"password", {
        readonly autocomplete?: string;
        readonly revealable?: boolean;
    }>;
    Number: (options?: EditorDescriptorMap["number"]) => Descriptor<"number", {
        readonly step?: number;
        readonly prefix?: string;
        readonly suffix?: string;
    }>;
    Checkbox: (options?: EditorDescriptorMap["checkbox"]) => Descriptor<"checkbox", {
        readonly labelPosition?: "before" | "after";
    }>;
    Switch: (options?: EditorDescriptorMap["switch"]) => Descriptor<"switch", {
        readonly labelPosition?: "before" | "after";
    }>;
    Select: (options?: EditorDescriptorMap["select"]) => Descriptor<"select", {
        readonly multiple?: boolean;
        readonly clearable?: boolean;
    }>;
    Autocomplete: (options?: EditorDescriptorMap["autocomplete"]) => Descriptor<"autocomplete", {
        readonly multiple?: boolean;
        readonly minimumCharacters?: number;
    }>;
    Date: (options?: EditorDescriptorMap["date"]) => Descriptor<"date", {
        readonly min?: string;
        readonly max?: string;
    }>;
    Time: (options?: EditorDescriptorMap["time"]) => Descriptor<"time", {
        readonly minuteStep?: number;
    }>;
    DateTime: (options?: EditorDescriptorMap["datetime"]) => Descriptor<"datetime", {
        readonly minuteStep?: number;
        readonly separate?: boolean;
    }>;
    DateRange: (options?: EditorDescriptorMap["date-range"]) => Descriptor<"date-range", {
        readonly min?: string;
        readonly max?: string;
    }>;
    Reference: (options?: EditorDescriptorMap["reference"]) => Descriptor<"reference", {
        readonly clearable?: boolean;
    }>;
    ReferenceList: (options?: EditorDescriptorMap["reference-list"]) => Descriptor<"reference-list", {
        readonly clearable?: boolean;
    }>;
    File: (options?: EditorDescriptorMap["file"]) => Descriptor<"file", {
        readonly accept?: string;
        readonly capture?: string;
    }>;
    Image: (options?: EditorDescriptorMap["image"]) => Descriptor<"image", {
        readonly accept?: string;
        readonly capture?: string;
    }>;
    Color: (options?: EditorDescriptorMap["color"]) => Descriptor<"color", {
        readonly format?: "hex" | "rgb" | "hsl";
    }>;
    StringList: (options?: EditorDescriptorMap["string-list"]) => Descriptor<"string-list", {
        readonly separator?: string;
        readonly allowDuplicates?: boolean;
    }>;
    Hidden: () => Descriptor<"hidden", {}>;
};
declare const format: {
    Text: (options?: FormatterDescriptorMap["text"]) => Descriptor<"text", {
        readonly empty?: string;
    }>;
    Boolean: (options?: FormatterDescriptorMap["boolean"]) => Descriptor<"boolean", {
        readonly trueLabel?: string;
        readonly falseLabel?: string;
    }>;
    Number: (options?: FormatterDescriptorMap["number"]) => Descriptor<"number", Intl.NumberFormatOptions>;
    Choice: () => Descriptor<"choice", {}>;
    Choices: (options?: FormatterDescriptorMap["choices"]) => Descriptor<"choices", {
        readonly separator?: string;
    }>;
    Date: (options?: FormatterDescriptorMap["date"]) => Descriptor<"date", Intl.DateTimeFormatOptions>;
    Time: (options?: FormatterDescriptorMap["time"]) => Descriptor<"time", Intl.DateTimeFormatOptions>;
    DateTime: (options?: FormatterDescriptorMap["datetime"]) => Descriptor<"datetime", Intl.DateTimeFormatOptions>;
    DateRange: (options?: FormatterDescriptorMap["date-range"]) => Descriptor<"date-range", Intl.DateTimeFormatOptions & {
        readonly separator?: string;
    }>;
    Reference: () => Descriptor<"reference", {}>;
    ReferenceList: (options?: FormatterDescriptorMap["reference-list"]) => Descriptor<"reference-list", {
        readonly separator?: string;
    }>;
    Image: (options?: FormatterDescriptorMap["image"]) => Descriptor<"image", {
        readonly alt?: string;
        readonly preview?: boolean;
    }>;
    File: (options?: FormatterDescriptorMap["file"]) => Descriptor<"file", {
        readonly download?: boolean;
    }>;
    Link: (options?: FormatterDescriptorMap["link"]) => Descriptor<"link", {
        readonly target?: "_self" | "_blank";
    }>;
    Concat: (parts: readonly Descriptor[], options?: {
        readonly separator?: string;
    }) => Descriptor<"concat", {
        parts: readonly Descriptor<string, unknown>[];
        separator?: string;
    }>;
};
declare const filter: {
    Contains: (options?: FilterDescriptorMap["contains"]) => Descriptor<"contains", {
        readonly caseSensitive?: boolean;
        readonly queryName?: string;
    }>;
    Exact: (options?: FilterDescriptorMap["exact"]) => Descriptor<"exact", {
        readonly queryName?: string;
    }>;
    Range: (options?: FilterDescriptorMap["range"]) => Descriptor<"range", {
        readonly minimumName?: string;
        readonly maximumName?: string;
    }>;
    Custom: (options: FilterDescriptorMap["custom"]) => Descriptor<"custom", {
        readonly predicate?: (fieldValue: unknown, filterValue: unknown) => boolean;
        readonly encode?: (value: unknown) => Readonly<Record<string, unknown>>;
    }>;
};
declare const sort: {
    Value: (options?: SortDescriptorMap["value"]) => Descriptor<"value", {
        readonly queryName?: string;
    }>;
    Key: (path: string, options?: {
        readonly queryName?: string;
    }) => Descriptor<"key", {
        path: string;
        queryName?: string;
    }>;
    Custom: (options: SortDescriptorMap["custom"]) => Descriptor<"custom", {
        readonly compare?: (left: unknown, right: unknown) => number;
        readonly encode?: (descending: boolean) => Readonly<Record<string, unknown>>;
    }>;
};
interface FormattedValue {
    readonly text: string;
    readonly value?: unknown;
    readonly tone?: string;
    readonly icon?: string;
    readonly accessibleLabel?: string;
    readonly href?: string;
    readonly mediaType?: string;
}

type ValidatorResult = void | boolean | string | ValidationIssue | readonly ValidationIssue[];
interface ValidatorInput<TValue, TContext> {
    readonly value: TValue;
    readonly root: Readonly<Record<string, unknown>>;
    readonly context: TContext;
    readonly signal: AbortSignal;
    readonly issue: (message: string, code?: string) => ValidationIssue;
}
type BivariantCallback<TArguments extends readonly unknown[], TResult> = {
    bivarianceHack(...arguments_: TArguments): TResult;
}["bivarianceHack"];
type Validator<TValue, TContext = unknown> = BivariantCallback<[
    input: ValidatorInput<TValue, TContext>
], ValidatorResult | Promise<ValidatorResult>>;
type EmptyValuePolicy = "undefined" | "preserve" | "null";
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | readonly JsonValue[] | {
    readonly [key: string]: JsonValue;
};
interface FieldConfig<TValue, TEncoded = TValue, TContext = unknown> {
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
    readonly metadata?: Readonly<Record<string, unknown>>;
    readonly validate?: readonly Validator<TValue, TContext>[];
    readonly parse?: (input: unknown) => TValue;
    readonly write?: BivariantCallback<[value: TValue, context: TContext], TEncoded>;
    readonly query?: BivariantCallback<[value: TValue, context: TContext], unknown>;
    readonly readableWhen?: BivariantCallback<[context: TContext], boolean>;
    readonly writableWhen?: BivariantCallback<[context: TContext], boolean>;
}
interface NestedSchema<TInput = unknown, TValue = unknown, TEncoded = unknown> {
    readonly _input: TInput;
    readonly _output: TValue;
    readonly _encoded: TEncoded;
    parse(input: unknown): TValue;
    validate(value: TValue, options?: {
        readonly signal?: AbortSignal;
    }): Promise<ValidationResult>;
    write(value: TValue): TEncoded;
}
interface FieldRuntimeOptions<TValue, TEncoded, TContext> extends FieldConfig<TValue, TEncoded, TContext> {
    readonly kind: string;
    readonly computed?: ComputedConfig<TValue, TContext>;
    readonly relation?: RelationConfig<unknown>;
    readonly nested?: NestedSchema;
    readonly nestedMany?: boolean;
    readonly choices?: readonly Choice[] | (() => readonly Choice[]);
    readonly multiple?: boolean;
}
type FieldModification<TValue, TEncoded, TContext> = Partial<Omit<FieldRuntimeOptions<TValue, TEncoded, TContext>, "kind" | "required" | "readonly" | "writeonly" | "computed" | "relation" | "nested">>;
declare class Field<TInput, TValue, TEncoded = TValue, TContext = unknown, TRequired extends boolean = false, TComputed extends boolean = false, TWritable extends boolean = true> {
    readonly _input: TInput;
    readonly _output: TValue;
    readonly _encoded: TEncoded;
    readonly _context: TContext;
    readonly _required: TRequired;
    readonly _computed: TComputed;
    readonly _writable: TWritable;
    readonly options: Readonly<FieldRuntimeOptions<TValue, TEncoded, TContext>>;
    constructor(options: FieldRuntimeOptions<TValue, TEncoded, TContext>);
    modify(options: FieldModification<TValue, TEncoded, TContext>): Field<TInput, TValue, TEncoded, TContext, TRequired, TComputed, TWritable>;
    parse(input: unknown, path: readonly (string | number)[]): TValue;
    validate(value: TValue, root: Readonly<Record<string, unknown>>, context: TContext, signal: AbortSignal, path: readonly (string | number)[]): Promise<readonly ValidationIssue[]>;
    write(value: TValue, context: TContext): TEncoded;
    toQuery(value: TValue, context: TContext): unknown;
    describe(): Readonly<Record<string, unknown>>;
}
declare class FieldParseFailure extends Error {
    readonly issue: ValidationIssue;
    constructor(issue: ValidationIssue);
}
interface StringConfig<TContext = unknown> extends FieldConfig<string, string, TContext> {
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly pattern?: RegExp;
    readonly trim?: boolean;
}
interface NumberConfig<TContext = unknown> extends FieldConfig<number, number, TContext> {
    readonly min?: number;
    readonly max?: number;
}
type BooleanConfig<TContext = unknown> = FieldConfig<boolean, boolean, TContext>;
type DateConfig<TContext = unknown> = FieldConfig<Date, string, TContext>;
type TimeConfig<TContext = unknown> = FieldConfig<string, string, TContext>;
type DateRangeValue = readonly [Date, Date];
interface ComputedConfig<TValue, TContext = unknown> {
    readonly dependsOn: readonly string[];
    readonly get: BivariantCallback<[
        value: Readonly<Record<string, unknown>>,
        context: TContext
    ], TValue>;
    readonly format?: Descriptor;
}
interface ResourceTarget<TEntity = unknown> {
    readonly resourceName: string;
    readonly _entity?: TEntity;
}
interface RelationMutationContext {
    readonly sourceKey: string | number;
    readonly targetKeys: readonly (string | number)[];
}
type RelationEndpointPath = string | ((context: RelationMutationContext) => string);
interface RelationEndpointMutation {
    readonly kind: "endpoints";
    readonly add?: RelationEndpointPath;
    readonly remove?: RelationEndpointPath;
    readonly set?: RelationEndpointPath;
    readonly clear?: RelationEndpointPath;
    readonly method?: "POST" | "PUT" | "PATCH" | "DELETE";
    readonly body?: (action: "add" | "remove" | "set" | "clear", context: RelationMutationContext) => unknown;
}
interface RelationParentMutation {
    readonly kind: "parent";
}
type RelationMutation = RelationParentMutation | RelationEndpointMutation;
interface ThroughRelationConfig<TThrough = ResourceTarget<unknown>> {
    readonly resource: TThrough;
    readonly source: string;
    readonly target: string;
    readonly orderBy?: string;
    readonly allowDuplicates?: boolean;
}
type RelationKeyEncoding = "repeat" | "comma" | "brackets";
interface RelationKeyFetchOptions<TContext = unknown> {
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
interface RelationConfig<TTarget> {
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
declare const relation: Readonly<{
    parent(): RelationParentMutation;
    endpoints(options: Omit<RelationEndpointMutation, "kind">): RelationEndpointMutation;
    byKeys<TContext = unknown>(options?: RelationKeyFetchOptions<TContext>): RelationKeyFetchOptions<TContext>;
}>;
type TargetEntity<T> = T extends {
    readonly _entity?: infer E;
} ? Exclude<E, undefined> : T extends {
    readonly definition: {
        readonly _entity?: infer E;
    };
} ? E : unknown;
type RelationFieldConfig<TTarget, TValue, TEncoded, TContext = unknown> = RelationConfig<TTarget> & Omit<FieldConfig<TValue, TEncoded, TContext>, "label">;
interface BinaryPart {
    readonly size: number;
    readonly type: string;
    arrayBuffer(): Promise<ArrayBuffer>;
}
interface NamedBinaryPart extends BinaryPart {
    readonly name?: string;
}
interface LocalFileValue {
    readonly kind: "local";
    readonly file: NamedBinaryPart;
    readonly name: string;
}
interface RemoteFileValue {
    readonly kind: "remote";
    readonly url: string;
    readonly name: string;
    readonly mediaType?: string;
}
interface RemovedFileValue {
    readonly kind: "removed";
}
type FileValue = LocalFileValue | RemoteFileValue | RemovedFileValue;
type FileInput = FileValue | NamedBinaryPart | string;
type EncodedFile = NamedBinaryPart | null | undefined;
declare function localFile(file: NamedBinaryPart, name?: string): LocalFileValue;
declare function remoteFile(url: string, name?: string, mediaType?: string): RemoteFileValue;
declare function removedFile(): RemovedFileValue;
declare function isBinaryPart(value: unknown): value is NamedBinaryPart;
declare function isFileValue(value: unknown): value is FileValue;
type RequiredOf<TConfig> = TConfig extends {
    readonly required: true;
} ? true : false;
type WritableOf<TConfig> = TConfig extends {
    readonly readonly: true;
} ? false : true;
type NullableOf<TConfig, TValue> = TConfig extends {
    readonly nullable: true;
} ? TValue | null : TValue;
declare function booleanField<TContext = unknown, const TConfig extends BooleanConfig<TContext> = BooleanConfig<TContext>>(config?: TConfig): Field<boolean | string | number, NullableOf<TConfig, boolean>, boolean, TContext, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
declare const fields: {
    Str: <TContext = unknown, const TConfig extends StringConfig<TContext> = StringConfig<TContext>>(config?: TConfig) => Field<string, NullableOf<TConfig, string>, string, unknown, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    Text: <TContext = unknown, const TConfig extends StringConfig<TContext> = StringConfig<TContext>>(config?: TConfig) => Field<string, NullableOf<TConfig, string>, string, unknown, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    RichText: <TContext = unknown, const TConfig extends StringConfig<TContext> = StringConfig<TContext>>(config?: TConfig) => Field<string, NullableOf<TConfig, string>, string, unknown, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    Email: <TContext = unknown, const TConfig extends StringConfig<TContext> = StringConfig<TContext>>(config?: TConfig) => Field<string, NullableOf<TConfig, string>, string, unknown, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    Password: <TContext = unknown, const TConfig extends StringConfig<TContext> = StringConfig<TContext>>(config?: TConfig) => Field<string, NullableOf<TConfig, string>, string, unknown, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    Phone: <TContext = unknown, const TConfig extends StringConfig<TContext> = StringConfig<TContext>>(config?: TConfig) => Field<string, NullableOf<TConfig, string>, string, unknown, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    ID: <TContext = unknown, const TConfig extends NumberConfig<TContext> = NumberConfig<TContext>>(config?: TConfig) => Field<number | string, number, number, TContext, true, false, false>;
    Int: <TContext = unknown, const TConfig extends NumberConfig<TContext> = NumberConfig<TContext>>(config?: TConfig) => Field<string | number, NullableOf<TConfig, number>, number, unknown, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    Float: <TContext = unknown, const TConfig extends NumberConfig<TContext> = NumberConfig<TContext>>(config?: TConfig) => Field<string | number, NullableOf<TConfig, number>, number, unknown, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    Bool: typeof booleanField;
    Date: <TContext = unknown, const TConfig extends DateConfig<TContext> = DateConfig<TContext>>(config?: TConfig) => Field<string | number | Date, NullableOf<TConfig, Date>, string, unknown, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    DateTime: <TContext = unknown, const TConfig extends DateConfig<TContext> = DateConfig<TContext>>(config?: TConfig) => Field<string | number | Date, NullableOf<TConfig, Date>, string, unknown, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    Time: <TContext = unknown, const TConfig extends TimeConfig<TContext> = TimeConfig<TContext>>(config?: TConfig) => Field<string, NullableOf<TConfig, string>, string, TContext, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    DateRange: <TContext = unknown, const TConfig extends FieldConfig<DateRangeValue, readonly [string, string], TContext> = FieldConfig<DateRangeValue, readonly [string, string], TContext>>(config?: TConfig) => Field<string | readonly unknown[] | Readonly<{
        from: unknown;
        to: unknown;
    }>, NullableOf<TConfig, DateRangeValue>, readonly [string, string], TContext, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    Enum: <const TValues extends readonly (string | number)[], TContext = unknown, const TConfig extends FieldConfig<TValues[number], TValues[number], TContext> = FieldConfig<TValues[number], TValues[number], TContext>>(values: TValues, config?: TConfig) => Field<TValues[number], NullableOf<TConfig, TValues[number]>, TValues[number], TContext, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    EnumList: <const TValues extends readonly (string | number)[], TContext = unknown, const TConfig extends FieldConfig<readonly TValues[number][], readonly TValues[number][], TContext> = FieldConfig<readonly TValues[number][], readonly TValues[number][], TContext>>(values: TValues, config?: TConfig) => Field<readonly unknown[], readonly TValues[number][], readonly TValues[number][], unknown, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    StrList: <TContext = unknown, const TConfig extends FieldConfig<readonly string[], readonly string[], TContext> = FieldConfig<readonly string[], readonly string[], TContext>>(config?: TConfig) => Field<readonly string[], readonly string[], readonly string[], TContext, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    IntList: <TContext = unknown, const TConfig extends FieldConfig<readonly number[], readonly number[], TContext> = FieldConfig<readonly number[], readonly number[], TContext>>(config?: TConfig) => Field<readonly (string | number)[], readonly number[], readonly number[], TContext, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    Record: <TValue extends Readonly<Record<string, unknown>>, TContext = unknown, const TConfig extends FieldConfig<TValue, TValue, TContext> = FieldConfig<TValue, TValue, TContext>>(config?: TConfig) => Field<TValue, NullableOf<TConfig, TValue>, TValue, TContext, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    Unknown: <TContext = unknown, const TConfig extends FieldConfig<unknown, unknown, TContext> = FieldConfig<unknown, unknown, TContext>>(config?: TConfig) => Field<unknown, NullableOf<TConfig, unknown>, unknown, TContext, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    JSON: <TContext = unknown, const TConfig extends FieldConfig<JsonValue, JsonValue, TContext> = FieldConfig<JsonValue, JsonValue, TContext>>(config?: TConfig) => Field<JsonValue, NullableOf<TConfig, JsonValue>, JsonValue, TContext, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    Object: <TInput, TValue, TEncoded, TContext = unknown, const TConfig extends FieldConfig<TValue, TEncoded, TContext> = FieldConfig<TValue, TEncoded, TContext>>(schema: NestedSchema<TInput, TValue, TEncoded>, config?: TConfig) => Field<TInput, NullableOf<TConfig, TValue>, TEncoded, TContext, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    ObjectList: <TInput, TValue, TEncoded, TContext = unknown, const TConfig extends FieldConfig<readonly TValue[], readonly TEncoded[], TContext> = FieldConfig<readonly TValue[], readonly TEncoded[], TContext>>(schema: NestedSchema<TInput, TValue, TEncoded>, config?: TConfig) => Field<readonly TInput[], readonly TValue[], readonly TEncoded[], TContext, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    File: <TContext = unknown, const TConfig extends FieldConfig<FileValue, EncodedFile, TContext> = FieldConfig<FileValue, EncodedFile, TContext>>(config?: TConfig) => Field<FileInput, NullableOf<TConfig, FileValue>, EncodedFile, TContext, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    Image: <TContext = unknown, const TConfig extends FieldConfig<FileValue, EncodedFile, TContext> = FieldConfig<FileValue, EncodedFile, TContext>>(config?: TConfig) => Field<FileInput, NullableOf<TConfig, FileValue>, EncodedFile, TContext, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    FileList: <TContext = unknown, const TConfig extends FieldConfig<readonly FileValue[], readonly EncodedFile[], TContext> = FieldConfig<readonly FileValue[], readonly EncodedFile[], TContext>>(config?: TConfig) => Field<readonly FileInput[], readonly FileValue[], readonly EncodedFile[], TContext, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    ImageList: <TContext = unknown, const TConfig extends FieldConfig<readonly FileValue[], readonly EncodedFile[], TContext> = FieldConfig<readonly FileValue[], readonly EncodedFile[], TContext>>(config?: TConfig) => Field<readonly FileInput[], readonly FileValue[], readonly EncodedFile[], TContext, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    Computed: <TValue, TContext = unknown>(config: ComputedConfig<TValue, TContext>) => Field<never, TValue, never, TContext, true, true, false>;
    Ref: <TContext = unknown, const TConfig extends RelationFieldConfig<ResourceTarget<unknown>, unknown, string | number, TContext> = RelationFieldConfig<ResourceTarget<unknown>, unknown, string | number, TContext>>(config: TConfig) => Field<unknown, NullableOf<TConfig, TargetEntity<TConfig["resource"]>>, string | number, TContext, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
    RefList: <TContext = unknown, const TConfig extends RelationFieldConfig<ResourceTarget<unknown>, readonly unknown[], readonly (string | number)[], TContext> = RelationFieldConfig<ResourceTarget<unknown>, readonly unknown[], readonly (string | number)[], TContext>>(config: TConfig) => Field<unknown, NullableOf<TConfig, readonly TargetEntity<TConfig["resource"]>[]>, readonly (string | number)[], TContext, RequiredOf<TConfig>, false, WritableOf<TConfig>>;
};

type LiveStatus = "disabled" | "waiting" | "connecting" | "open" | "reconnecting" | "closed" | "error";
type LiveVersion = string | number;
interface LiveEvent {
    readonly type: string;
    readonly data: string;
    readonly id?: string;
}
type LiveFrame = {
    readonly kind: "event";
    readonly event: LiveEvent;
} | {
    readonly kind: "retry";
    readonly milliseconds: number;
};
interface LiveMutation {
    readonly action: "upsert" | "delete" | "invalidate";
    readonly resource: string;
    readonly value?: unknown;
    readonly key?: string | number;
}
/** Persistent inbox data shared by live adapters and framework renderers. */
interface UiNotification {
    readonly id: string | number;
    readonly title: string;
    readonly message?: string;
    readonly level?: "info" | "positive" | "warning" | "negative";
    readonly icon?: string;
    readonly image?: {
        readonly src: string;
        readonly alt?: string;
    };
    readonly createdAt?: string;
    readonly read?: boolean;
    readonly actionUrl?: string;
    readonly actions?: readonly UiNotificationAction[];
}
/** A declarative notification action. Applications decide how its intent reaches a backend. */
interface UiNotificationAction {
    readonly id: string;
    readonly label: string;
    readonly icon?: string;
    readonly actionUrl?: string;
    readonly priority?: "primary" | "overflow";
}
/** A transient message delivered exactly once by a framework alert host. */
interface UiAlert {
    readonly id?: string | number;
    readonly message: string;
    readonly caption?: string;
    readonly level?: "info" | "positive" | "warning" | "negative";
    readonly icon?: string;
    readonly timeout?: number;
}
/** An atomic persistent-inbox change emitted by a live adapter. */
type NotificationMutation = {
    readonly action: "replace";
    readonly items: readonly UiNotification[];
    readonly unreadCount?: number;
} | {
    readonly action: "upsert";
    readonly item: UiNotification;
} | {
    readonly action: "remove";
    readonly id: UiNotification["id"];
} | {
    readonly action: "mark-read";
    readonly id: UiNotification["id"];
    readonly read?: boolean;
};
/** One normalized consequence of a live event. Plain LiveMutation values remain accepted for compatibility. */
type LiveEffect = {
    readonly kind: "mutation";
    readonly mutation: LiveMutation;
} | {
    readonly kind: "notification";
    readonly mutation: NotificationMutation;
} | {
    readonly kind: "alert";
    readonly alert: UiAlert;
};
type LiveEffectResult = LiveMutation | LiveEffect | readonly (LiveMutation | LiveEffect)[] | undefined;
interface LiveAdapter<TContext> {
    map(options: {
        readonly context: TContext;
        readonly scope: string;
        readonly event: string;
        readonly payload: unknown;
        readonly source: LiveEvent;
    }): LiveEffectResult | Promise<LiveEffectResult>;
}
interface LiveOptions<TContext> {
    readonly sources: readonly LiveSource<TContext>[];
    readonly adapters?: readonly LiveAdapter<TContext>[];
    readonly notifications?: {
        readonly maximumItems?: number;
    };
}
type LiveConfiguration<TContext> = LiveSource<TContext> | LiveOptions<TContext>;
interface LiveRetryOptions {
    readonly initialMs?: number;
    readonly maximumMs?: number;
    readonly jitter?: number;
}
interface LiveOpenOptions<TContext> {
    readonly context: TContext;
    readonly scope: string;
    readonly transport: Transport;
    readonly baseUrl: string;
    readonly lastEventId?: string;
    readonly signal: AbortSignal;
}
interface LiveOpenResult {
    readonly status: number;
    readonly headers?: Readonly<Record<string, string>>;
    readonly frames: AsyncIterable<LiveFrame>;
}
interface LiveSource<TContext> {
    /** Stable diagnostic name. Defaults to its declaration index when omitted. */
    readonly name?: string;
    readonly retry?: LiveRetryOptions;
    enabled?(options: {
        readonly context: TContext;
        readonly scope: string;
    }): boolean;
    open(options: LiveOpenOptions<TContext>): Promise<LiveOpenResult>;
    version?(options: {
        readonly event: LiveEvent;
        readonly payload: unknown;
    }): LiveVersion | undefined;
    map?(options: {
        readonly event: string;
        readonly payload: unknown;
        readonly source: LiveEvent;
    }): LiveEffectResult | Promise<LiveEffectResult>;
    onUnhandled?(event: LiveEvent): void;
}
interface LiveDiagnostic {
    readonly kind: "transport" | "protocol" | "json" | "schema" | "version" | "unhandled";
    readonly message: string;
    readonly retryable: boolean;
    readonly event?: string;
    readonly eventId?: string;
}
interface LiveSnapshot {
    readonly revision: number;
    readonly status: LiveStatus;
    readonly lastError?: LiveDiagnostic;
    readonly lastEventId?: string;
    readonly connectedAt?: number;
    readonly retryAt?: number;
}
interface LiveSourceSnapshot extends LiveSnapshot {
    readonly name: string;
}
interface LiveHubSnapshot extends LiveSnapshot {
    readonly sources: readonly LiveSourceSnapshot[];
}
interface NotificationSnapshot {
    readonly revision: number;
    readonly status: "disabled" | "ready" | "error";
    readonly items: readonly UiNotification[];
    readonly unreadCount: number;
    readonly error?: string;
}
interface AlertSnapshot {
    readonly revision: number;
    readonly items: readonly UiAlert[];
}
declare class LiveSourceError extends Error {
    readonly retryable: boolean;
    constructor(message: string, retryable?: boolean);
}
/** Framework-neutral, bounded inbox state. It never performs persistence or network mutations. */
declare class NotificationController implements ExternalStore<NotificationSnapshot> {
    private readonly store;
    private readonly maximumItems;
    constructor(enabled?: boolean, maximumItems?: number);
    get status(): NotificationSnapshot["status"];
    get items(): readonly UiNotification[];
    get unreadCount(): number;
    get error(): string | undefined;
    getSnapshot(): NotificationSnapshot;
    subscribe(listener: () => void): () => void;
    apply(mutation: NotificationMutation): void;
}
/** A bounded, exactly-once transient alert queue for framework hosts. */
declare class AlertController implements ExternalStore<AlertSnapshot> {
    private readonly store;
    get items(): readonly UiAlert[];
    getSnapshot(): AlertSnapshot;
    subscribe(listener: () => void): () => void;
    enqueue(alert: UiAlert): void;
    /** Removes and returns the next alert, ensuring hosts cannot deliver it twice. */
    consume(): UiAlert | undefined;
}
interface LiveRuntime<TContext> {
    readonly context: () => TContext;
    readonly scope: () => string;
    readonly transport: Transport;
    readonly baseUrl: string;
    dispatchDefault(event: LiveEvent, payload: unknown, version: LiveVersion | undefined, scope: string): boolean;
    dispatchEffects(effects: readonly (LiveMutation | LiveEffect)[], version: LiveVersion | undefined, scope: string): void;
}
declare class LiveController<TContext> implements ExternalStore<LiveSnapshot> {
    private readonly source;
    private readonly runtime;
    private readonly adapters;
    private readonly store;
    private controller?;
    private retryTimer?;
    private generation;
    private disposed;
    private activeScope?;
    private retryAttempt;
    private serverRetryMs?;
    private readonly seenIds;
    private readonly seenOrder;
    constructor(source: LiveSource<TContext> | undefined, runtime: LiveRuntime<TContext>, adapters?: readonly LiveAdapter<TContext>[]);
    get status(): LiveStatus;
    get lastError(): LiveDiagnostic | undefined;
    get lastEventId(): string | undefined;
    get connectedAt(): number | undefined;
    get retryAt(): number | undefined;
    getSnapshot(): LiveSnapshot;
    subscribe(listener: () => void): () => void;
    reevaluate(): void;
    dispose(): void;
    private evaluate;
    private connect;
    private handleEvent;
    private scheduleReconnect;
    private mapEffects;
    private setTerminalError;
    private recordDiagnostic;
    private rememberId;
    private resetReplayState;
    private stopCurrent;
    private isCurrent;
    private setState;
}
/** Aggregates independently reconnecting live sources without coupling their failure lifecycles. */
declare class LiveHubController<TContext> implements ExternalStore<LiveHubSnapshot> {
    private readonly store;
    private readonly controllers;
    private readonly sourceNames;
    private readonly unsubscribes;
    private disposed;
    constructor(sources: readonly LiveSource<TContext>[], runtime: LiveRuntime<TContext>, adapters?: readonly LiveAdapter<TContext>[]);
    get status(): LiveStatus;
    get lastError(): LiveDiagnostic | undefined;
    get lastEventId(): string | undefined;
    get connectedAt(): number | undefined;
    get retryAt(): number | undefined;
    get sources(): readonly LiveSourceSnapshot[];
    getSnapshot(): LiveHubSnapshot;
    subscribe(listener: () => void): () => void;
    reevaluate(): void;
    dispose(): void;
    private snapshot;
}

declare class RequestCoordinator {
    private readonly requests;
    private disposed;
    get isDisposed(): boolean;
    coordinate<T>(identity: string, load: (signal: AbortSignal) => Promise<T>, observerSignal?: AbortSignal): Promise<T>;
    dispose(): void;
    abortAll(): void;
}

type Shape = Readonly<Record<string, Field<unknown, unknown, unknown, unknown, boolean, boolean, boolean>>>;
type AnyField = Field<unknown, unknown, unknown, unknown, boolean, boolean, boolean>;
type Input<TSchema> = TSchema extends {
    readonly _input: infer T;
} ? T : never;
type Infer<TSchema> = TSchema extends {
    readonly _output: infer T;
} ? T : never;
type Encoded<TSchema> = TSchema extends {
    readonly _encoded: infer T;
} ? T : never;
type Patch<TSchema> = Partial<Encoded<TSchema>>;
type RequiredInput<S extends Shape> = {
    [K in keyof S as S[K] extends Field<unknown, unknown, unknown, unknown, true, infer C, boolean> ? C extends true ? never : K : never]: S[K] extends Field<infer T, unknown, unknown, unknown, boolean, boolean, boolean> ? T : never;
};
type OptionalInput<S extends Shape> = {
    [K in keyof S as S[K] extends Field<unknown, unknown, unknown, unknown, false, infer C, boolean> ? C extends true ? never : K : never]?: S[K] extends Field<infer T, unknown, unknown, unknown, boolean, boolean, boolean> ? T : never;
};
type InputShape<S extends Shape> = Simplify<RequiredInput<S> & OptionalInput<S>>;
type RequiredOutput<S extends Shape> = {
    [K in keyof S as S[K] extends Field<unknown, unknown, unknown, unknown, true, boolean, boolean> ? K : never]: S[K] extends Field<unknown, infer T, unknown, unknown, boolean, boolean, boolean> ? T : never;
};
type OptionalOutput<S extends Shape> = {
    [K in keyof S as S[K] extends Field<unknown, unknown, unknown, unknown, false, boolean, boolean> ? K : never]?: S[K] extends Field<unknown, infer T, unknown, unknown, boolean, boolean, boolean> ? T : never;
};
type OutputShape<S extends Shape> = Simplify<RequiredOutput<S> & OptionalOutput<S>>;
type OutputOfShape<S extends Shape> = OutputShape<S>;
type RequiredEncoded<S extends Shape> = {
    [K in keyof S as S[K] extends Field<unknown, unknown, unknown, unknown, true, infer C, infer W> ? C extends true ? never : W extends false ? never : K : never]: S[K] extends Field<unknown, unknown, infer T, unknown, boolean, boolean, boolean> ? T : never;
};
type OptionalEncoded<S extends Shape> = {
    [K in keyof S as S[K] extends Field<unknown, unknown, unknown, unknown, boolean, infer C, infer W> ? C extends true ? never : W extends false ? never : K : never]?: S[K] extends Field<unknown, unknown, infer T, unknown, boolean, boolean, boolean> ? T : never;
};
type EncodedShape<S extends Shape> = Simplify<RequiredEncoded<S> & OptionalEncoded<S>>;
type OptionalShape<S extends Shape> = {
    [K in keyof S]: S[K] extends Field<infer I, infer V, infer E, infer C, boolean, infer M, infer W> ? Field<I, V, E, C, false, M, W> : never;
};
type RequiredShape<S extends Shape> = {
    [K in keyof S]: S[K] extends Field<infer I, infer V, infer E, infer C, boolean, infer M, infer W> ? Field<I, V, E, C, true, M, W> : never;
};
interface SchemaValidatorInput<TValue, TContext> {
    readonly value: Readonly<TValue>;
    readonly context: TContext;
    readonly signal: AbortSignal;
    readonly issue: (path: readonly (string | number)[], message: string, code?: string) => ValidationIssue;
}
type SchemaValidator<TValue, TContext> = (input: SchemaValidatorInput<TValue, TContext>) => ValidatorResult | Promise<ValidatorResult>;
interface SchemaOptions<TValue, TContext> {
    readonly unknownKeys?: "strip" | "strict" | "passthrough";
    readonly validate?: readonly SchemaValidator<TValue, TContext>[];
    readonly format?: (value: Readonly<TValue>, context: TContext) => string;
}
interface ValidateOptions {
    readonly signal?: AbortSignal;
}
/** The recoverable result of parsing a partial record. Invalid fields are omitted. */
interface PartialParseResult<TValues extends Readonly<Record<string, unknown>>> {
    readonly values: Readonly<Partial<TValues>>;
    readonly issues: readonly ValidationIssue[];
}
interface ViewOptions<S extends Shape, K extends readonly (keyof S & string)[], C extends Shape> {
    readonly fields: K;
    readonly computed?: C;
}
declare class Schema<S extends Shape, TContext = unknown> {
    protected readonly context?: (() => TContext) | undefined;
    readonly _input: InputShape<S>;
    readonly _output: OutputShape<S>;
    readonly _encoded: EncodedShape<S>;
    readonly _context: TContext;
    readonly shape: S;
    readonly options: Readonly<SchemaOptions<OutputShape<S>, TContext>>;
    readonly classConstructor?: abstract new (...args: never[]) => OutputShape<S>;
    constructor(shape: S, options?: SchemaOptions<OutputShape<S>, TContext>, context?: (() => TContext) | undefined, classConstructor?: abstract new (...args: never[]) => OutputShape<S>);
    get<K extends keyof S>(name: K): S[K];
    parse(input: unknown): OutputShape<S>;
    parsePartial(input: unknown): Readonly<Partial<OutputShape<S>>>;
    /** Parses each present field independently, retaining valid values when others fail. */
    parsePartialResult(input: unknown): PartialParseResult<OutputShape<S>>;
    materialize(input: Readonly<Partial<OutputShape<S>>>): OutputShape<S>;
    canMaterialize(input: Readonly<Record<string, unknown>>): boolean;
    validate(value: OutputShape<S>, options?: ValidateOptions): Promise<ValidationResult>;
    format(value: OutputShape<S>): string;
    write(value: OutputShape<S>): EncodedShape<S>;
    writePartial(value: Readonly<Partial<OutputShape<S>>>): Readonly<Partial<EncodedShape<S>>>;
    writeInput(input: unknown, options?: {
        readonly partial?: boolean;
    }): Readonly<Record<string, unknown>>;
    merge<E extends Shape>(other: Schema<E, TContext>): Schema<Simplify<Omit<S, keyof E> & E>, TContext>;
    partial(): Schema<OptionalShape<S>, TContext>;
    required(): Schema<RequiredShape<S>, TContext>;
    keep<const K extends readonly (keyof S & string)[]>(...names: K): Schema<Pick<S, K[number]>, TContext>;
    drop<const K extends readonly (keyof S & string)[]>(...names: K): Schema<Omit<S, K[number]>, TContext>;
    extend<E extends Shape>(extension: E): Schema<Simplify<Omit<S, keyof E> & E>, TContext>;
    modify<M extends Partial<{
        [K in keyof S]: (field: S[K]) => AnyField;
    }>>(modifiers: M): Schema<{
        [K in keyof S]: K extends keyof M ? M[K] extends (field: S[K]) => infer T ? Extract<T, AnyField> : S[K] : S[K];
    }, TContext>;
    reorder<const K extends readonly (keyof S & string)[]>(...names: K): Schema<S, TContext>;
    toQuery(): Schema<OptionalShape<S>, TContext>;
    toQuery(values: Readonly<Partial<OutputShape<S>>>): Readonly<Record<string, unknown>>;
    toForm<TPayload = EncodedShape<S>>(options?: FormSchemaOptions<Schema<S, TContext>, TPayload>): FormSchema<Schema<S, TContext>, TPayload>;
    view<const K extends readonly (keyof S & string)[], C extends Shape = Readonly<Record<never, never>>>(options: ViewOptions<S, K, C>): ViewSchema<S, K[number], C, TContext>;
    describe(): Readonly<Record<keyof S, Readonly<Record<string, unknown>>>>;
    bindContext<TNextContext>(context: () => TNextContext): Schema<S, TNextContext>;
    protected copy<TNext extends Shape>(shape: TNext): Schema<TNext, TContext>;
    protected getContext(): TContext;
    protected entries(): readonly [string, AnyField][];
    private parseRecord;
    private createOutput;
}
declare class ViewSchema<S extends Shape, K extends keyof S & string, C extends Shape, TContext = unknown> extends Schema<Simplify<Pick<S, K> & C>, TContext> {
    readonly _output: Readonly<OutputShape<Simplify<Pick<S, K> & C>>>;
    readonly _encoded: never;
    readonly source: Schema<S, TContext>;
    readonly selected: readonly K[];
    constructor(source: Schema<S, TContext>, selected: readonly K[], computed: C, context?: () => TContext);
    write(value: Readonly<OutputShape<Simplify<Pick<S, K> & C>>>): never;
    writePartial(value: Readonly<Partial<OutputShape<Simplify<Pick<S, K> & C>>>>): never;
    writeInput(value: unknown): never;
}
interface SchemaDefinitionFactory {
    <S extends Shape>(shape: S, options?: SchemaOptions<OutputShape<S>, unknown>): Schema<S, unknown>;
    withContext<TContext>(): <S extends Shape>(shape: S, options?: SchemaOptions<OutputShape<S>, TContext>) => Schema<S, TContext>;
}
/** Creates a pure schema definition without binding it to an application runtime. */
declare const schema: SchemaDefinitionFactory;
declare function computed<TValue, TContext = unknown>(config: ComputedConfig<TValue, TContext>): ReturnType<typeof fields.Computed<TValue, TContext>>;

interface SchemaLike<TContext> {
    readonly _input: Readonly<Record<string, unknown>>;
    readonly _output: Readonly<Record<string, unknown>>;
    readonly _encoded: unknown;
    readonly _context: TContext;
    readonly shape: Shape;
    parse(input: unknown): Readonly<Record<string, unknown>>;
    parsePartial(input: unknown): Readonly<Record<string, unknown>>;
    materialize(input: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
    canMaterialize(input: Readonly<Record<string, unknown>>): boolean;
    validate(value: Readonly<Record<string, unknown>>, options?: {
        readonly signal?: AbortSignal;
    }): Promise<ValidationResult>;
    write(value: Readonly<Record<string, unknown>>): unknown;
    writePartial(input: Readonly<Record<string, unknown>>): unknown;
    writeInput(input: unknown, options?: {
        readonly partial?: boolean;
    }): unknown;
    toQuery?(values: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
    bindContext<TNextContext>(context: () => TNextContext): SchemaLike<TNextContext>;
}
type ViewLike<TContext> = ViewSchema<Shape, string, Shape, TContext>;
declare const preparedMutation: unique symbol;
declare const rawCollectionEntries: unique symbol;
interface RuntimeSchema<TContext> {
    readonly _context?: TContext;
    readonly shape: Shape;
    parse(input: unknown): Readonly<Record<string, unknown>>;
    parsePartial(input: unknown): Readonly<Record<string, unknown>>;
    materialize(input: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
    canMaterialize(input: Readonly<Record<string, unknown>>): boolean;
    toQuery?(values: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
    write(value: Readonly<Record<string, unknown>>): unknown;
    writePartial(value: Readonly<Record<string, unknown>>): unknown;
    writeInput(input: unknown, options?: {
        readonly partial?: boolean;
    }): unknown;
    bindContext?<TNextContext>(context: () => TNextContext): RuntimeSchema<TNextContext>;
}
interface RuntimeQuery<TContext> {
    readonly input?: RuntimeSchema<TContext>;
    readonly view?: string;
    readonly path?: string;
    readonly pagination?: PaginationAdapter;
    readonly responseAdapter?: ResponseAdapter;
    readonly ttl?: number;
    readonly errorAdapters?: readonly ErrorAdapter[];
    readonly sortParam?: string;
    readonly subscribeRelations?: boolean;
    readonly local?: (value: Readonly<Record<string, unknown>>, query: Readonly<Record<string, unknown>>, context: TContext) => boolean;
}
interface RuntimeAction<TContext> {
    readonly kind?: OperationKind;
    readonly input?: RuntimeSchema<TContext>;
    readonly output?: RuntimeSchema<TContext>;
    readonly view?: string;
    readonly method?: TransportRequest["method"];
    readonly path?: string | ((input: unknown) => string);
    readonly request?: (input: unknown) => ActionRequest<unknown>;
    readonly invalidate?: "resource" | "object" | "collections" | "none";
    readonly errorAdapters?: readonly ErrorAdapter[];
    readonly bulk?: BulkActionOptions;
    readonly pagination?: PaginationAdapter;
    readonly responseAdapter?: ResponseAdapter;
    readonly encoding?: BodyEncoding;
    readonly multipart?: MultipartAdapter;
    readonly sortParam?: string;
    readonly local?: (input: unknown, context: TContext) => unknown | Promise<unknown>;
    readonly auth?: OperationAuth;
}
type OperationAuth = "required" | "optional" | "none";
interface HttpResourceSource {
    readonly kind: "http";
}
interface LocalResourceSource<TContext = unknown> {
    readonly kind: "local";
    readonly initial: readonly unknown[];
    readonly generateKey?: (options: {
        readonly value: Readonly<Record<string, unknown>>;
        readonly existing: readonly EntityKey[];
        readonly context: TContext;
    }) => EntityKey;
}
type ResourceSource<TContext = unknown> = HttpResourceSource | LocalResourceSource<TContext>;
declare function http(): HttpResourceSource;
declare function local<TContext = unknown>(options?: Omit<LocalResourceSource<TContext>, "kind" | "initial"> & {
    readonly initial?: readonly unknown[];
}): LocalResourceSource<TContext>;
interface RuntimeDefinition<TContext> {
    readonly name: string;
    readonly resourceName: string;
    readonly url: string;
    readonly source: ResourceSource<TContext>;
    readonly schema: RuntimeSchema<TContext>;
    readonly key: string | ((value: Readonly<Record<string, unknown>>) => EntityKey);
    readonly keyEncoder?: (key: EntityKey) => EntityKey;
    readonly views: Readonly<Record<string, RuntimeSchema<TContext>>>;
    readonly queries: Readonly<Record<string, RuntimeQuery<TContext>>>;
    readonly actions: Readonly<Record<string, RuntimeAction<TContext>>>;
    readonly pagination: PaginationAdapter;
    readonly configuredPagination?: PaginationAdapter;
    readonly responseAdapter?: ResponseAdapter;
    readonly ttl: number;
    readonly errorAdapters: readonly ErrorAdapter[];
}
interface ResourceDefinitionIdentity {
    readonly name: string;
    readonly resourceName: string;
}
/** An immutable, operation-only API definition with no entity or cache semantics. */
interface ServiceDefinitionIdentity {
    readonly name: string;
    readonly serviceName: string;
    readonly operations: ActionMap<unknown>;
}
interface QueryDefinition<TInputSchema extends SchemaLike<TContext>, TView extends string | undefined, TContext> {
    readonly input: TInputSchema;
    readonly view?: TView;
    readonly path?: string;
    readonly pagination?: PaginationAdapter;
    readonly responseAdapter?: ResponseAdapter;
    readonly ttl?: number;
    readonly errorAdapters?: readonly ErrorAdapter[];
    readonly sortParam?: string;
    readonly local?: (value: Readonly<Record<string, unknown>>, query: Readonly<Record<string, unknown>>, context: TContext) => boolean;
}
interface ActionRequest<TInput> {
    readonly method?: TransportRequest["method"];
    readonly path?: string;
    readonly body?: unknown;
    readonly query?: Readonly<Record<string, unknown>>;
    readonly encoding?: BodyEncoding;
    readonly multipart?: MultipartAdapter;
    readonly input: TInput;
}
interface ActionDefinition<TInputSchema extends SchemaLike<TContext> | undefined, TOutputSchema extends SchemaLike<TContext> | undefined, TView extends string | undefined, TContext> {
    readonly kind?: OperationKind;
    readonly input?: TInputSchema;
    readonly output?: TOutputSchema;
    readonly view?: TView;
    readonly method?: TransportRequest["method"];
    readonly path?: string | ((input: TInputSchema extends SchemaLike<TContext> ? Input<TInputSchema> : unknown) => string);
    readonly request?: (input: TInputSchema extends SchemaLike<TContext> ? Input<TInputSchema> : unknown) => ActionRequest<TInputSchema extends SchemaLike<TContext> ? Input<TInputSchema> : unknown>;
    readonly invalidate?: "resource" | "object" | "collections" | "none";
    readonly errorAdapters?: readonly ErrorAdapter[];
    readonly bulk?: BulkActionOptions;
    readonly pagination?: PaginationAdapter;
    readonly responseAdapter?: ResponseAdapter;
    readonly encoding?: BodyEncoding;
    readonly multipart?: MultipartAdapter;
    readonly sortParam?: string;
    readonly local?: (input: TInputSchema extends SchemaLike<TContext> ? Input<TInputSchema> : unknown, context: TContext) => unknown | Promise<unknown>;
    readonly auth?: OperationAuth;
}
type OperationKind = "list" | "retrieve" | "create" | "replace" | "patch" | "remove" | "action";
interface BulkActionOptions {
    readonly path?: string;
    readonly method?: TransportRequest["method"];
    readonly encode?: (keys: readonly EntityKey[], input: unknown) => unknown;
    readonly decode?: (response: unknown, keys: readonly EntityKey[]) => BulkResult<EntityKey, unknown>;
}
declare const operation: {
    all: () => Readonly<{
        list: Readonly<Omit<Readonly<Record<never, never>>, "kind" | "method"> & {
            kind: "list";
            method: "GET";
        }>;
        retrieve: Readonly<Omit<Readonly<Record<never, never>>, "kind" | "method"> & {
            kind: "retrieve";
            method: "GET";
        }>;
        create: Readonly<Omit<Readonly<Record<never, never>>, "kind" | "method"> & {
            kind: "create";
            method: "POST";
        }>;
        replace: Readonly<Omit<Readonly<Record<never, never>>, "kind" | "method"> & {
            kind: "replace";
            method: "PUT";
        }>;
        patch: Readonly<Omit<Readonly<Record<never, never>>, "kind" | "method"> & {
            kind: "patch";
            method: "PATCH";
        }>;
        remove: Readonly<Omit<Readonly<Record<never, never>>, "kind" | "method"> & {
            kind: "remove";
            method: "DELETE";
        }>;
    }>;
    list: <const T extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>>(options?: T) => Readonly<Omit<T, "kind" | "method"> & {
        kind: "list";
        method: T extends {
            readonly method: infer TOverride;
        } ? Extract<TOverride, "GET" | "POST" | "PUT" | "PATCH" | "DELETE"> : "GET";
    }>;
    retrieve: <const T extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>>(options?: T) => Readonly<Omit<T, "kind" | "method"> & {
        kind: "retrieve";
        method: T extends {
            readonly method: infer TOverride;
        } ? Extract<TOverride, "GET" | "POST" | "PUT" | "PATCH" | "DELETE"> : "GET";
    }>;
    create: <const T extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>>(options?: T) => Readonly<Omit<T, "kind" | "method"> & {
        kind: "create";
        method: T extends {
            readonly method: infer TOverride;
        } ? Extract<TOverride, "GET" | "POST" | "PUT" | "PATCH" | "DELETE"> : "POST";
    }>;
    replace: <const T extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>>(options?: T) => Readonly<Omit<T, "kind" | "method"> & {
        kind: "replace";
        method: T extends {
            readonly method: infer TOverride;
        } ? Extract<TOverride, "GET" | "POST" | "PUT" | "PATCH" | "DELETE"> : "PUT";
    }>;
    patch: <const T extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>>(options?: T) => Readonly<Omit<T, "kind" | "method"> & {
        kind: "patch";
        method: T extends {
            readonly method: infer TOverride;
        } ? Extract<TOverride, "GET" | "POST" | "PUT" | "PATCH" | "DELETE"> : "PATCH";
    }>;
    remove: <const T extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>>(options?: T) => Readonly<Omit<T, "kind" | "method"> & {
        kind: "remove";
        method: T extends {
            readonly method: infer TOverride;
        } ? Extract<TOverride, "GET" | "POST" | "PUT" | "PATCH" | "DELETE"> : "DELETE";
    }>;
    action: <const T extends Readonly<Record<string, unknown>>>(options: T) => Readonly<Omit<T, "kind" | "method"> & {
        kind: "action";
        method: T extends {
            readonly method: infer TOverride;
        } ? Extract<TOverride, "GET" | "POST" | "PUT" | "PATCH" | "DELETE"> : "POST";
    }>;
    bulk: <const T extends Readonly<Record<string, unknown>>>(options: T) => Readonly<Omit<T, "kind" | "method"> & {
        kind: "action";
        method: T extends {
            readonly method: infer TOverride;
        } ? Extract<TOverride, "GET" | "POST" | "PUT" | "PATCH" | "DELETE"> : "POST";
    }>;
};
type ViewMap<TContext> = Readonly<Record<string, ViewLike<TContext>>>;
type QueryMap<TContext> = Readonly<Record<string, QueryDefinition<SchemaLike<TContext>, string | undefined, TContext>>>;
type ActionMap<TContext> = Readonly<Record<string, ActionDefinition<SchemaLike<TContext> | undefined, SchemaLike<TContext> | undefined, string | undefined, TContext>>>;
interface ResourceDefinitionOptions<TSchema extends SchemaLike<TContext>, TKey extends EntityKey, TViews extends ViewMap<TContext>, TQueries extends QueryMap<TContext>, TActions extends ActionMap<TContext>, TContext> {
    readonly name: string;
    readonly url?: string;
    readonly source?: ResourceSource<TContext>;
    readonly schema: TSchema;
    readonly key: (keyof Infer<TSchema> & string) | ((value: Readonly<Partial<Infer<TSchema>>>) => TKey);
    readonly keyEncoder?: (key: TKey) => EntityKey;
    readonly views?: TViews;
    readonly queries?: TQueries;
    readonly actions?: TActions;
    readonly operations?: TActions;
    readonly pagination?: PaginationAdapter;
    readonly responseAdapter?: ResponseAdapter;
    readonly ttl?: number;
    readonly errorAdapters?: readonly ErrorAdapter[];
}
declare class ResourceDefinition<TSchema extends SchemaLike<TContext>, TKey extends EntityKey, TViews extends ViewMap<TContext> = Readonly<Record<never, never>>, TQueries extends QueryMap<TContext> = Readonly<Record<never, never>>, TActions extends ActionMap<TContext> = Readonly<Record<never, never>>, TContext = unknown> {
    readonly _entity?: Infer<TSchema>;
    readonly resourceName: string;
    readonly name: string;
    readonly url: string;
    readonly source: ResourceSource<TContext>;
    readonly schema: TSchema;
    readonly key: ResourceDefinitionOptions<TSchema, TKey, TViews, TQueries, TActions, TContext>["key"];
    readonly keyEncoder?: (key: TKey) => EntityKey;
    readonly views: TViews;
    readonly queries: TQueries;
    readonly actions: TActions;
    readonly operations: TActions;
    readonly pagination: PaginationAdapter;
    readonly responseAdapter?: ResponseAdapter;
    readonly ttl: number;
    readonly errorAdapters: readonly ErrorAdapter[];
    constructor(options: ResourceDefinitionOptions<TSchema, TKey, TViews, TQueries, TActions, TContext>);
    operation<K extends keyof TActions & string>(name: K): OperationReference<this, K>;
}
interface ServiceDefinitionOptions<TActions extends ActionMap<TContext>, TContext> {
    readonly name: string;
    readonly url?: string;
    readonly source?: ResourceSource<TContext>;
    readonly actions?: TActions;
    readonly operations?: TActions;
    readonly errorAdapters?: readonly ErrorAdapter[];
    readonly responseAdapter?: ResponseAdapter;
}
declare class ServiceDefinition<TActions extends ActionMap<TContext> = Readonly<Record<never, never>>, TContext = unknown> {
    readonly serviceName: string;
    readonly name: string;
    readonly url: string;
    readonly source: ResourceSource<TContext>;
    readonly actions: TActions;
    readonly operations: TActions;
    readonly errorAdapters: readonly ErrorAdapter[];
    readonly responseAdapter?: ResponseAdapter;
    constructor(options: ServiceDefinitionOptions<TActions, TContext>);
    operation<K extends keyof TActions & string>(name: K): OperationReference<this, K>;
}
interface OperationReference<TResource = ResourceDefinitionIdentity | ServiceDefinitionIdentity, TName extends string = string> {
    readonly resource: TResource;
    readonly name: TName;
    readonly _input?: TResource extends {
        readonly operations: infer TActions;
    } ? TName extends keyof TActions ? ActionInput<TActions[TName]> : never : never;
    readonly _output?: TResource extends {
        readonly schema: infer TSchema;
        readonly views: infer TViews;
        readonly operations: infer TActions;
    } ? TName extends keyof TActions ? TSchema extends SchemaLike<infer TContext> ? TViews extends ViewMap<TContext> ? ActionOutput<TSchema, TViews, TActions[TName]> : never : never : never : TResource extends {
        readonly operations: infer TActions;
    } ? TName extends keyof TActions ? TActions[TName] extends {
        readonly output?: infer TOutput;
    } ? TOutput extends {
        readonly _output: infer T;
    } ? T : unknown : unknown : never : never;
}
type OperationInput<TReference> = TReference extends {
    readonly _input?: infer T;
} ? T : never;
type OperationOutput<TReference> = TReference extends {
    readonly _output?: infer T;
} ? T : never;
type NamedResourceDefinition<TName extends string, TDefinition> = TDefinition & {
    readonly name: TName;
    readonly resourceName: TName;
};
type NamedServiceDefinition<TName extends string, TDefinition> = TDefinition & {
    readonly name: TName;
    readonly serviceName: TName;
};
declare function resource<const TName extends string, TSchema extends SchemaLike<TContext>, TKeyName extends keyof Infer<TSchema> & string, TViews extends ViewMap<TContext> = Readonly<Record<never, never>>, TQueries extends QueryMap<TContext> = Readonly<Record<never, never>>, TActions extends ActionMap<TContext> = Readonly<Record<never, never>>, TContext = TSchema extends SchemaLike<infer TSchemaContext> ? TSchemaContext : unknown>(options: Omit<ResourceDefinitionOptions<TSchema, Extract<Infer<TSchema>[TKeyName], EntityKey>, TViews, TQueries, TActions, TContext>, "key" | "name"> & {
    readonly name: TName;
    readonly key: TKeyName;
}): NamedResourceDefinition<TName, ResourceDefinition<TSchema, Extract<Infer<TSchema>[TKeyName], EntityKey>, TViews, TQueries, TActions, TContext>>;
declare function resource<const TName extends string, TSchema extends SchemaLike<TContext>, TKey extends EntityKey, TViews extends ViewMap<TContext> = Readonly<Record<never, never>>, TQueries extends QueryMap<TContext> = Readonly<Record<never, never>>, TActions extends ActionMap<TContext> = Readonly<Record<never, never>>, TContext = TSchema extends SchemaLike<infer TSchemaContext> ? TSchemaContext : unknown>(options: Omit<ResourceDefinitionOptions<TSchema, TKey, TViews, TQueries, TActions, TContext>, "name"> & {
    readonly name: TName;
}): NamedResourceDefinition<TName, ResourceDefinition<TSchema, TKey, TViews, TQueries, TActions, TContext>>;
declare function service<const TName extends string, TActions extends ActionMap<TContext> = Readonly<Record<never, never>>, TContext = unknown>(options: Omit<ServiceDefinitionOptions<TActions, TContext>, "name"> & {
    readonly name: TName;
}): NamedServiceDefinition<TName, ServiceDefinition<TActions, TContext>>;
interface UiCogsBaseOptions<TContext, TAuth extends AuthStrategyDefinition | undefined = undefined, TResources extends readonly ResourceDefinitionIdentity[] = readonly ResourceDefinitionIdentity[], TServices extends readonly ServiceDefinitionIdentity[] = readonly ServiceDefinitionIdentity[]> {
    readonly context?: TContext;
    readonly resources?: TResources;
    readonly services?: TServices;
    readonly auth?: TAuth;
    readonly baseUrl?: string;
    readonly middleware?: readonly TransportMiddleware[];
    readonly cacheScope?: () => string;
    readonly cachePolicy?: CachePolicy;
    readonly adapter?: ControllerAdapter;
    readonly errorAdapters?: readonly ErrorAdapter[];
    readonly responseAdapter?: ResponseAdapter;
    readonly live?: LiveConfiguration<TContext>;
    readonly relationDefaults?: {
        readonly byKeys?: RelationKeyFetchOptions<TContext>;
    };
}
type UiCogsOptions<TContext, TAuth extends AuthStrategyDefinition | undefined = undefined, TResources extends readonly ResourceDefinitionIdentity[] = readonly ResourceDefinitionIdentity[], TServices extends readonly ServiceDefinitionIdentity[] = readonly ServiceDefinitionIdentity[]> = UiCogsBaseOptions<TContext, TAuth, TResources, TServices> & ({
    readonly persistence?: PersistenceOptions<TContext>;
    readonly cache?: never;
} | {
    readonly cache: CacheStore;
    readonly persistence?: Omit<PersistenceOptions<TContext>, "cache"> & {
        readonly cache: false;
    };
}) & ({
    readonly http?: DefaultHttpOptions;
    readonly transport?: never;
} | {
    readonly transport: Transport;
    readonly http?: never;
});
interface ControllerState {
    readonly revision: number;
    readonly loading: boolean;
    readonly error?: NormalizedFailure;
}
interface ActionSnapshot<T> extends ControllerState {
    readonly progress?: UploadProgress;
    readonly result?: T;
}
declare class ActionController<T> implements ExternalStore<ActionSnapshot<T>> {
    private readonly executeAction;
    private readonly store;
    private controller?;
    private running?;
    constructor(executeAction: (options: MutationRequestOptions) => Promise<T>);
    get loading(): boolean;
    get error(): NormalizedFailure | undefined;
    get progress(): UploadProgress | undefined;
    get result(): T | undefined;
    getSnapshot(): ActionSnapshot<T>;
    subscribe(listener: () => void): () => void;
    execute(): Promise<SubmitResult<T>>;
    cancel(): void;
}
interface Runtime<TContext> {
    readonly context: () => TContext;
    readonly transport: Transport;
    readonly baseUrl: string;
    readonly cache: CacheStore;
    readonly coordinator: RequestCoordinator;
    readonly adapter: ControllerAdapter;
    readonly definitions: Map<string, RuntimeDefinition<TContext>>;
    readonly errorAdapters: readonly ErrorAdapter[];
    readonly responseAdapter?: ResponseAdapter;
    readonly cachePolicy: CachePolicy;
    readonly relationDefaults?: UiCogsOptions<TContext>["relationDefaults"];
    scope(): string;
    timestamp(): number;
    subscribeContext(listener: () => void): () => void;
    registerCollection(address: CacheAddress, identity: string, registration: CollectionLiveRegistration): () => void;
    applyCollectionMembership(address: CacheAddress, key: EntityKey, value: Readonly<Record<string, unknown>>): void;
    address(resource: string): CacheAddress;
    awaitCache(scope: string): Promise<void> | undefined;
    request<T>(identity: string, request: Omit<TransportRequest, "signal">, signal: AbortSignal, adapters?: readonly ErrorAdapter[], response?: ResponseRequestOptions): Promise<TransportResponse<T>>;
}
interface ResponseRequestOptions extends ResponseDecodeContext {
    readonly adapter?: ResponseAdapter;
}
interface CollectionLiveRegistration {
    readonly paginated: () => boolean;
    readonly match: (value: Readonly<Record<string, unknown>>) => boolean | undefined;
    readonly add: (key: EntityKey) => void;
}
type RuntimeResourceOf<TDefinition, TFallbackContext = unknown> = TDefinition extends ResourceDefinition<infer TSchema, infer TKey, infer TViews, infer TQueries, infer TActions, infer TDefinitionContext> ? Resource<TSchema, TKey, TViews, TQueries, TActions, TDefinitionContext> : Resource<SchemaLike<TFallbackContext>, EntityKey, ViewMap<TFallbackContext>, QueryMap<TFallbackContext>, ActionMap<TFallbackContext>, TFallbackContext>;
type RuntimeServiceOf<TDefinition, TFallbackContext = unknown> = TDefinition extends ServiceDefinition<infer TActions, infer TDefinitionContext> ? Service<TActions, TDefinitionContext> : Service<ActionMap<TFallbackContext>, TFallbackContext>;
declare class UiCogs<TContext, TResources extends readonly ResourceDefinitionIdentity[] = readonly ResourceDefinitionIdentity[], TServices extends readonly ServiceDefinitionIdentity[] = readonly ServiceDefinitionIdentity[]> {
    /** Resolves after context, authentication, and the active persistent cache scope initialize. */
    readonly ready: Promise<void>;
    readonly cache: CacheStore;
    readonly requests: RequestCoordinator;
    readonly live: LiveHubController<TContext>;
    /** Framework-neutral, bounded inbox state fed exclusively by live notification effects. */
    readonly notifications: NotificationController;
    /** Framework-neutral, once-delivered alert queue fed exclusively by live alert effects. */
    readonly alerts: AlertController;
    readonly auth?: RuntimeAuthController;
    protected readonly contextController: ContextStoreController<unknown, TContext>;
    private readonly definitions;
    private readonly sourceDefinitions;
    private readonly services;
    private readonly contextListeners;
    private readonly liveCollections;
    private readonly runtime;
    private readonly managedCache;
    private authUnsubscribe?;
    private authLogoutUnsubscribe?;
    private contextUnsubscribe?;
    private controllerAdapter;
    constructor(options: UiCogsOptions<TContext, AuthStrategyDefinition | undefined, TResources, TServices>);
    /** Binds future controllers to one framework-owned reactive adapter. */
    bindControllerAdapter(adapter: ControllerAdapter): void;
    private initializeRuntime;
    private validateAuthOperations;
    private authBindings;
    resource<TDefinition extends TResources[number]>(definition: TDefinition): RuntimeResourceOf<TDefinition, TContext>;
    resource<TName extends TResources[number]["name"] & string>(name: TName): string extends TResources[number]["name"] ? RuntimeResourceOf<ResourceDefinitionIdentity, TContext> : RuntimeResourceOf<Extract<TResources[number], {
        readonly name: TName;
    }>, TContext>;
    service<TDefinition extends TServices[number]>(definition: TDefinition): RuntimeServiceOf<TDefinition, TContext>;
    service<TName extends TServices[number]["name"] & string>(name: TName): string extends TServices[number]["name"] ? RuntimeServiceOf<ServiceDefinitionIdentity, TContext> : RuntimeServiceOf<Extract<TServices[number], {
        readonly name: TName;
    }>, TContext>;
    private registerDefinition;
    private registerService;
    private validateRelations;
    private dispatchDefaultLiveEvent;
    private dispatchLiveMutation;
    private dispatchLiveEffects;
    private updateLiveCollectionMembership;
    private applyRegisteredMembership;
    clearScope(scope?: string): void;
    protected currentContext(): TContext;
    dispose(): void;
}
declare class Resource<TSchema extends SchemaLike<TContext>, TKey extends EntityKey, TViews extends ViewMap<TContext>, TQueries extends QueryMap<TContext>, TActions extends ActionMap<TContext>, TContext> implements ExternalStore<ControllerState> {
    private readonly runtime;
    readonly definition: ResourceDefinition<TSchema, TKey, TViews, TQueries, TActions, TContext>;
    readonly _entity?: Infer<TSchema>;
    readonly resourceName: string;
    readonly cache: ResourceCacheFacade<TSchema, TKey, TContext>;
    private readonly defaultCollection;
    private readonly keyedObjects;
    private readonly dynamicObjects;
    constructor(runtime: Runtime<TContext>, definition: ResourceDefinition<TSchema, TKey, TViews, TQueries, TActions, TContext>);
    get loading(): boolean;
    get error(): NormalizedFailure | undefined;
    get pageInfo(): unknown;
    get stale(): boolean;
    getSnapshot(): ControllerState;
    subscribe(listener: () => void): () => void;
    filter(values: Readonly<Record<string, unknown>>, options?: {
        readonly merge?: boolean;
    }): this;
    sort(field?: keyof Infer<TSchema> & string, descending?: boolean): this;
    page(index: number, size?: number): this;
    accumulate(enabled?: boolean): this;
    nextPage(): this;
    previousPage(): this;
    hasMore(): boolean;
    reset(): this;
    all(): readonly Readonly<Infer<TSchema>>[];
    load(options?: LoadOptions): Promise<readonly Readonly<Infer<TSchema>>[]>;
    refresh(): Promise<readonly Readonly<Infer<TSchema>>[]>;
    invalidate(): void;
    cancel(): void;
    get(key: TKey | (() => TKey)): ResourceObject<Infer<TSchema>, TKey, TContext>;
    query<K extends keyof TQueries & string>(name: K, input: Input<TQueries[K]["input"]> | (() => Input<TQueries[K]["input"]>)): CollectionController<QueryValue<TSchema, TViews, TQueries[K]>, TKey, TContext>;
    create(input: Partial<Input<TSchema>>, options?: MutationRequestOptions): Promise<Readonly<Infer<TSchema>> | undefined>;
    replace(key: TKey, input: Partial<Input<TSchema>>, options?: MutationRequestOptions): Promise<Readonly<Infer<TSchema>> | undefined>;
    update(key: TKey, input: Partial<Input<TSchema>>, options?: MutationRequestOptions): Promise<Readonly<Infer<TSchema>> | undefined>;
    remove(key: TKey): Promise<void>;
    form<TFormSchema extends FormSchema<SchemaLike<TContext>, unknown>>(schema: TFormSchema, initial?: Partial<FormValues<TFormSchema>>): FormController<TFormSchema>;
    actionForm<K extends keyof TActions & string, TFormSchema extends FormSchema<SchemaLike<TContext>, unknown>>(name: K, schema: TFormSchema & ActionFormCompatible<TFormSchema, ActionInput<TActions[K]>>, initial?: Partial<FormValues<TFormSchema>>): FormController<TFormSchema>;
    action<K extends keyof TActions & string>(name: K, input: ActionInput<TActions[K]>): Promise<ActionOutput<TSchema, TViews, TActions[K]>>;
    runOperation<K extends keyof TActions & string>(name: K, input: ActionInput<TActions[K]>, options?: MutationRequestOptions): Promise<ActionOutput<TSchema, TViews, TActions[K]>>;
    operation<K extends keyof TActions & string>(name: K, input: ActionInput<TActions[K]>): ActionController<ActionOutput<TSchema, TViews, TActions[K]>>;
    private executeAction;
    readonly bulk: {
        remove: (keys: readonly TKey[]) => Promise<BulkResult<TKey, Infer<TSchema>>>;
        action: <K extends keyof TActions & string>(name: K, keys: readonly TKey[], input: ActionInput<TActions[K]>) => Promise<BulkResult<TKey, ActionOutput<TSchema, TViews, TActions[K]>>>;
    };
    [preparedMutation](operationName: "create" | "replace" | "update", key: TKey | undefined, payload: unknown, options: MutationRequestOptions): Promise<Readonly<Infer<TSchema>> | undefined>;
    private mutate;
    private mutateLocal;
    private processActionOutput;
    private invalidateAfterAction;
    private encodeKey;
}
/** A runtime controller for an operation-only service definition. */
declare class Service<TActions extends ActionMap<TContext>, TContext> {
    private readonly runtime;
    readonly definition: ServiceDefinition<TActions, TContext>;
    readonly serviceName: string;
    private readonly actions;
    constructor(runtime: Runtime<TContext>, definition: ServiceDefinition<TActions, TContext>);
    action<K extends keyof TActions & string>(name: K, input: ActionInput<TActions[K]>): Promise<ServiceActionOutput<TActions[K]>>;
    runOperation<K extends keyof TActions & string>(name: K, input: ActionInput<TActions[K]>, options?: MutationRequestOptions): Promise<ServiceActionOutput<TActions[K]>>;
    operation<K extends keyof TActions & string>(name: K, input: ActionInput<TActions[K]>): ActionController<ServiceActionOutput<TActions[K]>>;
    actionForm<K extends keyof TActions & string, TFormSchema extends FormSchema<SchemaLike<TContext>, unknown>>(name: K, schema: TFormSchema & ActionFormCompatible<TFormSchema, ActionInput<TActions[K]>>, initial?: Partial<FormValues<TFormSchema>>): FormController<TFormSchema>;
    private executeAction;
}
interface LoadOptions {
    readonly policy?: CachePolicy;
    readonly signal?: AbortSignal;
}
type MutationRequestOptions = Partial<Pick<FormSubmitOptions, "signal" | "encoding" | "multipart" | "onUploadProgress">> & {
    readonly authentication?: AuthExecutionRole;
    readonly credentials?: RequestCredentials;
};
interface ObjectSnapshot<T> extends ControllerState {
    readonly key: EntityKey;
    readonly value?: Readonly<T>;
    readonly stale: boolean;
}
declare class ResourceObject<T, TKey extends EntityKey, TContext> implements ExternalStore<ObjectSnapshot<T>> {
    private readonly runtime;
    private readonly definition;
    private readonly keySource;
    private readonly store;
    private controller;
    private generation;
    private unsubscribeCache;
    private readonly unsubscribeContext;
    private relationSubscriptions;
    private readonly relationControllers;
    private readonly throughCollections;
    private readonly throughUnsubscribers;
    private readonly throughEntrySnapshots;
    private committingRelation;
    private boundKey;
    constructor(runtime: Runtime<TContext>, definition: RuntimeDefinition<TContext>, keySource: TKey | (() => TKey));
    get key(): TKey;
    get value(): Readonly<T> | undefined;
    get loading(): boolean;
    get error(): NormalizedFailure | undefined;
    get stale(): boolean;
    getSnapshot(): ObjectSnapshot<T>;
    subscribe(listener: () => void): () => void;
    load(options?: LoadOptions): Promise<Readonly<T> | undefined>;
    refresh(): Promise<Readonly<T> | undefined>;
    invalidate(): void;
    cancel(): void;
    dispose(): void;
    clearError(): void;
    relation<K extends keyof T & string>(name: K): NonNullable<T[K]> extends readonly (infer TItem)[] ? ToManyRelationController<TItem, TKey, TContext> : ToOneRelationController<NonNullable<T[K]>, TKey, TContext>;
    loadRelation<K extends keyof T & string>(name: K, options?: LoadOptions): Promise<Readonly<T>[K] | undefined>;
    relationValue<K extends keyof T & string>(name: K): Readonly<T>[K] | undefined;
    relationEntries(name: keyof T & string): readonly Readonly<Record<string, unknown>>[];
    relationMissingKeys(name: keyof T & string): readonly EntityKey[];
    setRelation(name: keyof T & string, values: readonly unknown[] | unknown | undefined, action?: "add" | "remove" | "set" | "clear"): Promise<void>;
    addRelationItem(name: keyof T & string, item: unknown, membershipInput?: Readonly<Record<string, unknown>>): Promise<void>;
    removeRelationItems(name: keyof T & string, keys: readonly EntityKey[]): Promise<void>;
    relationTargetKey(name: keyof T & string, value: unknown): EntityKey;
    form<TFormSchema extends FormSchema<SchemaLike<TContext>, unknown>>(schema: TFormSchema): FormController<TFormSchema>;
    private relationConfig;
    private targetDefinition;
    private targetKey;
    private mutateParentRelation;
    private mutateRelationEndpoint;
    private commitRelation;
    private throughDefinition;
    private throughCollection;
    private loadThroughRelation;
    private loadTargetKeys;
    private syncThroughRelation;
    private publishThroughValue;
    private createThroughEntry;
    private removeThroughEntries;
    private setThroughRelation;
    private currentValue;
    private withThroughRelations;
    private snapshot;
    private isStale;
    private address;
    private encodedKey;
    private subscribeKey;
    private rawKey;
    private encodeRawKey;
    private ensureBinding;
    private rebindRelations;
    private loadEagerRelations;
}
interface ToOneRelationSnapshot<T> extends ControllerState {
    readonly value?: Readonly<T>;
    readonly stale: boolean;
}
declare class ToOneRelationController<TItem, TKey extends EntityKey, TContext, TParent = Readonly<Record<string, unknown>>> implements ExternalStore<ToOneRelationSnapshot<TItem>> {
    private readonly owner;
    private readonly name;
    private readonly store;
    private readonly unsubscribeOwner;
    constructor(owner: ResourceObject<TParent, TKey, TContext>, name: keyof TParent & string);
    get value(): Readonly<TItem> | undefined;
    get loading(): boolean;
    get error(): NormalizedFailure | undefined;
    get stale(): boolean;
    getSnapshot(): ToOneRelationSnapshot<TItem>;
    subscribe(listener: () => void): () => void;
    load(): Promise<Readonly<TItem> | undefined>;
    set(value: TItem | EntityKey): Promise<void>;
    clear(): Promise<void>;
    dispose(): void;
    private snapshot;
    private changed;
    private run;
}
interface ToManyRelationSnapshot<T> extends ControllerState {
    readonly values: readonly Readonly<T>[];
    readonly entries: readonly Readonly<Record<string, unknown>>[];
    readonly stale: boolean;
    readonly missingKeys: readonly EntityKey[];
}
declare class ToManyRelationController<TItem, TKey extends EntityKey, TContext, TParent = Readonly<Record<string, unknown>>> implements ExternalStore<ToManyRelationSnapshot<TItem>> {
    private readonly owner;
    private readonly name;
    private readonly store;
    private readonly unsubscribeOwner;
    private controller;
    constructor(owner: ResourceObject<TParent, TKey, TContext>, name: keyof TParent & string);
    get values(): readonly Readonly<TItem>[];
    get entries(): readonly Readonly<Record<string, unknown>>[];
    get loading(): boolean;
    get error(): NormalizedFailure | undefined;
    get stale(): boolean;
    get missingKeys(): readonly EntityKey[];
    getSnapshot(): ToManyRelationSnapshot<TItem>;
    subscribe(listener: () => void): () => void;
    load(options?: LoadOptions): Promise<readonly Readonly<TItem>[]>;
    refresh(): Promise<readonly Readonly<TItem>[]>;
    cancel(): void;
    add(value: TItem | EntityKey, membershipInput?: Readonly<Record<string, unknown>>): Promise<void>;
    addMany(values: readonly (TItem | EntityKey)[]): Promise<void>;
    remove(key: EntityKey): Promise<void>;
    removeMany(keys: readonly EntityKey[]): Promise<void>;
    set(values: readonly (TItem | EntityKey)[]): Promise<void>;
    clear(): Promise<void>;
    dispose(): void;
    private snapshot;
    private changed;
    private run;
}
interface CollectionSnapshot<T> extends ControllerState {
    readonly values: readonly Readonly<T>[];
    readonly pageInfo?: unknown;
    readonly stale: boolean;
}
/** Immutable resource metadata carried by every collection controller. */
interface CollectionResourceMetadata {
    readonly name: string;
    readonly key: string | ((value: Readonly<Record<string, unknown>>) => EntityKey);
    readonly schema: {
        readonly shape: Shape;
    };
}
declare class CollectionController<T, TKey extends EntityKey, TContext> implements ExternalStore<CollectionSnapshot<T>> {
    private readonly runtime;
    private readonly definition;
    private readonly queryName;
    private readonly queryDefinition?;
    private readonly inputSource?;
    readonly _key?: TKey;
    /** The resource schema and key used to materialize this collection's values. */
    readonly resource: CollectionResourceMetadata;
    private filters;
    private sortState?;
    private pageState;
    private accumulating;
    private accumulatedKeys;
    private readonly store;
    private controller;
    private generation;
    private subscriptions;
    private unregisterLiveCollection?;
    constructor(runtime: Runtime<TContext>, definition: RuntimeDefinition<TContext>, queryName: string, queryDefinition?: RuntimeQuery<TContext> | undefined, inputSource?: (Readonly<Record<string, unknown>> | (() => Readonly<Record<string, unknown>>)) | undefined);
    get loading(): boolean;
    get error(): NormalizedFailure | undefined;
    get pageInfo(): unknown;
    get stale(): boolean;
    get values(): readonly Readonly<T>[];
    getSnapshot(): CollectionSnapshot<T>;
    subscribe(listener: () => void): () => void;
    filter(values: Readonly<Record<string, unknown>>, options?: {
        readonly merge?: boolean;
    }): this;
    sort(field?: string, descending?: boolean): this;
    page(index: number, size?: number): this;
    accumulate(enabled?: boolean): this;
    nextPage(): this;
    previousPage(): this;
    hasMore(): boolean;
    reset(): this;
    all(): readonly Readonly<T>[];
    load(options?: LoadOptions): Promise<readonly Readonly<T>[]>;
    refresh(): Promise<readonly Readonly<T>[]>;
    invalidate(): void;
    cancel(): void;
    clearError(): void;
    private currentEntry;
    private address;
    private input;
    private encodedQuery;
    private identity;
    private outputSchema;
    private rebind;
    private matchesLiveValue;
    private cacheChanged;
    private materializedKeys;
    cacheAddKey(key: EntityKey): void;
    cacheRemoveKey(key: EntityKey): void;
    cacheReplaceKeys(keys: readonly EntityKey[]): void;
    [rawCollectionEntries](): readonly Readonly<Record<string, unknown>>[];
    private refreshLocalCollection;
    private writeCollection;
}
type CacheMembership = "none" | "current" | "matching";
interface CacheWriteOptions {
    readonly membership?: CacheMembership;
}
declare class CacheConflictError extends Error {
    readonly key: EntityKey;
    constructor(key: EntityKey);
}
declare class ResourceCacheFacade<TSchema extends SchemaLike<TContext>, TKey extends EntityKey, TContext> {
    private readonly runtime;
    private readonly definition;
    private readonly collection;
    constructor(runtime: Runtime<TContext>, definition: RuntimeDefinition<TContext>, collection: CollectionController<Infer<TSchema>, TKey, TContext>);
    add(input: Input<TSchema>, options?: CacheWriteOptions): Readonly<Infer<TSchema>>;
    upsert(input: Partial<Input<TSchema>>, options?: CacheWriteOptions): Readonly<Partial<Infer<TSchema>>>;
    remove(key: TKey): void;
    replaceAll(inputs: readonly Input<TSchema>[]): readonly Readonly<Infer<TSchema>>[];
    private commitMembership;
}
interface BulkResult<TKey, TValue> {
    readonly succeeded: readonly TKey[];
    readonly failed: readonly {
        readonly key: TKey;
        readonly failure: NormalizedFailure;
    }[];
    readonly values: readonly TValue[];
}
type QueryValue<TSchema, TViews, TQuery> = TQuery extends {
    readonly view?: infer V;
} ? V extends keyof TViews ? TViews[V] extends {
    readonly _output: infer T;
} ? T : Infer<TSchema> : Infer<TSchema> : Infer<TSchema>;
type ActionInput<TAction> = TAction extends {
    readonly input?: infer S;
} ? S extends {
    readonly _input: infer T;
} ? T : unknown : unknown;
type ActionOutput<TSchema, TViews, TAction> = TAction extends {
    readonly output?: infer S;
} ? S extends {
    readonly _output: infer T;
} ? T : TAction extends {
    readonly view?: infer V;
} ? V extends keyof TViews ? TViews[V] extends {
    readonly _output: infer T;
} ? T : Infer<TSchema> : Infer<TSchema> : Infer<TSchema> : Infer<TSchema>;
type ServiceActionOutput<TAction> = TAction extends {
    readonly output?: infer S;
} ? S extends {
    readonly _output: infer T;
} ? T : unknown : unknown;
type ActionFormCompatible<TFormSchema, TInput> = FormPayload<TFormSchema> extends TInput ? unknown : never;

type AuthExecutionRole = "required" | "optional" | "none" | "refresh" | "establish" | "logout";
type AuthResult<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly failure: NormalizedFailure;
};
interface AuthRuntimeBindings {
    execute<TReference extends OperationReference>(reference: TReference, input: OperationInput<TReference>, role: AuthExecutionRole, signal: AbortSignal): Promise<OperationOutput<TReference>>;
}
interface RuntimeAuthController<TSnapshot extends object = object> extends ExternalStore<TSnapshot> {
    readonly value: TSnapshot;
    readonly status: string;
    readonly scopes: ReadonlySet<string>;
    readonly sessionGeneration: number;
    middleware(): TransportMiddleware;
    attach(bindings: AuthRuntimeBindings): void;
    initialize(): Promise<void>;
    cacheScope(): string;
    subscribeLogout(listener: () => void): () => void;
    dispose(): void;
}
/** Returns whether an initialized auth controller currently has an authenticated session. */
declare function isLoggedIn(auth: RuntimeAuthController | undefined): boolean;
interface AuthStrategyDefinition<TController extends RuntimeAuthController = RuntimeAuthController> {
    readonly kind: "uicogs-auth-strategy";
    readonly operations: readonly OperationReference[];
    create(): TController;
}
type AuthControllerOf<TStrategy> = TStrategy extends AuthStrategyDefinition<infer TController> ? TController : never;
type AuthSnapshotOf<TStrategy> = AuthControllerOf<TStrategy> extends ExternalStore<infer T> ? T : never;
type UiCogsContext<TApplicationContext, TStrategy = undefined> = TStrategy extends AuthStrategyDefinition ? TApplicationContext extends undefined ? {
    readonly auth: AuthSnapshotOf<TStrategy>;
} : TApplicationContext & {
    readonly auth: AuthSnapshotOf<TStrategy>;
} : TApplicationContext;
type ApplicationContext<T> = "auth" extends keyof T ? never : T;

interface PreparedBody {
    readonly body?: BodyInit;
    readonly encoding: Exclude<BodyEncoding, "auto">;
    readonly contentType?: string;
    readonly total?: number;
}
declare class MultipartEncodingError extends Error {
    readonly path: readonly (string | number)[];
    constructor(message: string, path?: readonly (string | number)[]);
}
declare const multipartAdapter: Readonly<{
    dotted(): MultipartAdapter;
    brackets(): MultipartAdapter;
    custom(adapter: MultipartAdapter): MultipartAdapter;
}>;
declare function withQuery(url: string, query?: Readonly<Record<string, unknown>>): string;
declare function prepareBody(body: unknown, encoding?: BodyEncoding, adapter?: MultipartAdapter): PreparedBody;
declare function multipart(values: Readonly<Record<string, unknown>>, adapter?: MultipartAdapter): FormData;

declare class Cogs<TApplicationContext, TEvents extends object = Readonly<Record<never, never>>, TAuth extends AuthStrategyDefinition | undefined = undefined, TResources extends readonly ResourceDefinitionIdentity[] = readonly ResourceDefinitionIdentity[], TServices extends readonly ServiceDefinitionIdentity[] = readonly ServiceDefinitionIdentity[]> extends UiCogs<UiCogsContext<TApplicationContext, TAuth>, TResources, TServices> {
    readonly auth: AuthControllerOf<TAuth>;
    readonly context: RuntimeContextStore<TApplicationContext, UiCogsContext<TApplicationContext, TAuth>>;
    readonly fields: typeof fields;
    readonly relation: typeof relation;
    readonly editor: typeof editor;
    readonly format: typeof format;
    readonly filter: typeof filter;
    readonly sort: typeof sort;
    readonly http: typeof http;
    readonly local: typeof local;
    readonly pagination: typeof pagination;
    readonly events: EventBus<TEvents>;
    constructor(options: CogsOptions<TApplicationContext, TAuth, TResources, TServices>);
}
type CogsOptions<TApplicationContext, TAuth extends AuthStrategyDefinition | undefined = undefined, TResources extends readonly ResourceDefinitionIdentity[] = readonly ResourceDefinitionIdentity[], TServices extends readonly ServiceDefinitionIdentity[] = readonly ServiceDefinitionIdentity[]> = UiCogsOptions<UiCogsContext<TApplicationContext, TAuth>, TAuth, TResources, TServices> extends infer TOptions ? TOptions extends UiCogsOptions<UiCogsContext<TApplicationContext, TAuth>, TAuth, TResources, TServices> ? Omit<TOptions, "context" | "persistence" | "adapter"> & {
    readonly context?: ApplicationContext<TApplicationContext>;
    readonly persistence?: TOptions extends {
        readonly cache: CacheStore;
    } ? Omit<PersistenceOptions<NoInfer<TApplicationContext>>, "cache"> & {
        readonly cache: false;
    } : PersistenceOptions<NoInfer<TApplicationContext>>;
} : never : never;
declare function createUiCogs<TApplicationContext = undefined, TEvents extends object = Readonly<Record<never, never>>, TAuth extends AuthStrategyDefinition | undefined = undefined, const TResources extends readonly ResourceDefinitionIdentity[] = readonly ResourceDefinitionIdentity[], const TServices extends readonly ServiceDefinitionIdentity[] = readonly ServiceDefinitionIdentity[]>(options?: CogsOptions<TApplicationContext, TAuth, TResources, TServices>): Cogs<TApplicationContext, TEvents, TAuth, TResources, TServices>;

type Constructor<T = object> = abstract new (...args: never[]) => T;
type ClassSchema<T extends object, TContext = unknown> = {
    readonly _input: Partial<T>;
    readonly _output: T;
    parse(input: unknown): Readonly<T>;
} & Schema<Shape, TContext>;
declare const struct: {
    Struct: () => <T extends Constructor>(constructor: T) => T;
    Str: <TContext = unknown>(config?: StringConfig<TContext>) => (target: object, propertyKey: string | symbol) => void;
    Text: <TContext = unknown>(config?: StringConfig<TContext>) => (target: object, propertyKey: string | symbol) => void;
    RichText: <TContext = unknown>(config?: StringConfig<TContext>) => (target: object, propertyKey: string | symbol) => void;
    Email: <TContext = unknown>(config?: StringConfig<TContext>) => (target: object, propertyKey: string | symbol) => void;
    Password: <TContext = unknown>(config?: StringConfig<TContext>) => (target: object, propertyKey: string | symbol) => void;
    Phone: <TContext = unknown>(config?: StringConfig<TContext>) => (target: object, propertyKey: string | symbol) => void;
    ID: <TContext = unknown>(config?: NumberConfig<TContext>) => (target: object, propertyKey: string | symbol) => void;
    Int: <TContext = unknown>(config?: NumberConfig<TContext>) => (target: object, propertyKey: string | symbol) => void;
    Float: <TContext = unknown>(config?: NumberConfig<TContext>) => (target: object, propertyKey: string | symbol) => void;
    Bool: <TContext = unknown>(config?: FieldConfig<boolean, boolean, TContext>) => (target: object, propertyKey: string | symbol) => void;
    Date: <TContext = unknown>(config?: DateConfig<TContext>) => (target: object, propertyKey: string | symbol) => void;
    DateTime: <TContext = unknown>(config?: DateConfig<TContext>) => (target: object, propertyKey: string | symbol) => void;
    Time: <TContext = unknown>(config?: TimeConfig<TContext>) => (target: object, propertyKey: string | symbol) => void;
    DateRange: <TContext = unknown>(config?: FieldConfig<readonly [Date, Date], readonly [string, string], TContext>) => (target: object, propertyKey: string | symbol) => void;
    Enum: <const TValues extends readonly (string | number)[], TContext = unknown>(values: TValues, config?: FieldConfig<TValues[number], TValues[number], TContext>) => (target: object, propertyKey: string | symbol) => void;
    EnumList: <const TValues extends readonly (string | number)[], TContext = unknown>(values: TValues, config?: FieldConfig<readonly TValues[number][], readonly TValues[number][], TContext>) => (target: object, propertyKey: string | symbol) => void;
    StrList: <TContext = unknown>(config?: FieldConfig<readonly string[], readonly string[], TContext>) => (target: object, propertyKey: string | symbol) => void;
    IntList: <TContext = unknown>(config?: FieldConfig<readonly number[], readonly number[], TContext>) => (target: object, propertyKey: string | symbol) => void;
    Record: <TValue extends Readonly<Record<string, unknown>>, TContext = unknown>(config?: FieldConfig<TValue, TValue, TContext>) => (target: object, propertyKey: string | symbol) => void;
    File: <TContext = unknown>(config?: FieldConfig<FileValue, unknown, TContext>) => (target: object, propertyKey: string | symbol) => void;
    FileList: <TContext = unknown>(config?: FieldConfig<readonly FileValue[], readonly unknown[], TContext>) => (target: object, propertyKey: string | symbol) => void;
    Image: <TContext = unknown>(config?: FieldConfig<FileValue, unknown, TContext>) => (target: object, propertyKey: string | symbol) => void;
    ImageList: <TContext = unknown>(config?: FieldConfig<readonly FileValue[], readonly unknown[], TContext>) => (target: object, propertyKey: string | symbol) => void;
    Object: <TInput, TValue, TEncoded, TContext = unknown>(schema: Parameters<typeof fields.Object<TInput, TValue, TEncoded, TContext>>[0], config?: FieldConfig<TValue, TEncoded, TContext>) => (target: object, propertyKey: string | symbol) => void;
    ObjectList: <TInput, TValue, TEncoded, TContext = unknown>(schema: Parameters<typeof fields.ObjectList<TInput, TValue, TEncoded, TContext>>[0], config?: FieldConfig<readonly TValue[], readonly TEncoded[], TContext>) => (target: object, propertyKey: string | symbol) => void;
    Computed: <TValue, TContext = unknown>(config: ComputedConfig<TValue, TContext>) => (target: object, propertyKey: string | symbol) => void;
    Ref: <TTarget extends ResourceTarget<unknown>>(config: RelationFieldConfig<TTarget, TargetEntity<TTarget>, string | number>) => (target: object, propertyKey: string | symbol) => void;
    RefList: <TTarget extends ResourceTarget<unknown>>(config: RelationFieldConfig<TTarget, readonly TargetEntity<TTarget>[], readonly (string | number)[]>) => (target: object, propertyKey: string | symbol) => void;
    toSchema: <T extends object>(constructor: Constructor<T>) => ClassSchema<T>;
};

export { ActionController, type ActionDefinition, type ActionRequest, type ActionSnapshot, AlertController, type AlertSnapshot, type AnyField, type ApplicationContext, type AuthControllerOf, type AuthExecutionRole, type AuthResult, type AuthRuntimeBindings, type AuthSnapshotOf, type AuthStrategyDefinition, type BinaryPart, type BodyEncoding, type BooleanConfig, type BulkActionOptions, type BulkResult, type CacheAddress, CacheConflictError, type CacheDump, type CacheMembership, type CachePersistenceOptions, type CachePersistenceStatus, type CachePolicy, type CacheStore, type CacheWriteOptions, type Choice, type ClassSchema, Cogs, type CogsOptions, CollectionController, type CollectionEntry, type CollectionResourceMetadata, type CollectionSnapshot, type ComputedConfig, type ContextParser, type ContextPersistenceOptions, type ContextPersistenceStatus, type ContextStoreSnapshot, type ControllerAdapter, type ControllerState, type DateConfig, type DateRangeValue, type DeepReadonly, type DefaultHttpOptions, type Descriptor, type EditorDescriptor, type EditorDescriptorMap, type EmptyValuePolicy, type Encoded, type EncodedFile, type EntityEntry, type EntityKey, type ErrorAdapter, EventBus, type ExternalStore, type FailureKind, Field, type FieldConfig, type FieldModification, FieldParseFailure, type FieldRuntimeOptions, type FileInput, type FileValue, type FilterDescriptor, type FilterDescriptorMap, type FormCompatibleSchema, FormController, type FormMode, type FormPayload, type FormProgress, FormSchema, type FormSchemaOptions, type FormSnapshot, type FormSubmitOptions, type FormValues, type FormattedValue, type FormatterDescriptor, type FormatterDescriptorMap, type HttpResourceSource, type HttpRetryOptions, type Infer, type Input, type IssuePath, type JsonPrimitive, type JsonValue, type LiveAdapter, type LiveConfiguration, LiveController, type LiveDiagnostic, type LiveEffect, type LiveEffectResult, type LiveEvent, type LiveFrame, LiveHubController, type LiveHubSnapshot, type LiveMutation, type LiveOpenOptions, type LiveOpenResult, type LiveOptions, type LiveRetryOptions, type LiveSnapshot, type LiveSource, LiveSourceError, type LiveSourceSnapshot, type LiveStatus, type LiveVersion, type LoadOptions, type LocalFileValue, type LocalResourceSource, MemoryCache, type MultipartAdapter, MultipartEncodingError, type MultipartPart, type MutationRequestOptions, type NamedBinaryPart, type NestedSchema, type NormalizedFailure, NotificationController, type NotificationMutation, type NotificationSnapshot, type NumberConfig, type ObjectSnapshot, type OperationAuth, type OperationInput, type OperationKind, type OperationOutput, type OperationReference, type OutputOfShape, type PageInfo, type PageState, type PaginationAdapter, type PaginationResult, ParseError, type PartialParseResult, type Patch, type PersistenceBackend, type PersistenceOptions, type PreparedBody, type QueryDefinition, type RelationConfig, type RelationEndpointMutation, type RelationEndpointPath, type RelationFieldConfig, type RelationKeyEncoding, type RelationKeyFetchOptions, type RelationMutation, type RelationMutationContext, type RelationParentMutation, type RemoteFileValue, type RemovedFileValue, RequestCoordinator, RequestError, Resource, ResourceCacheFacade, ResourceDefinition, type ResourceDefinitionIdentity, type ResourceDefinitionOptions, ResourceObject, type ResourceSource, type ResourceTarget, type ResponseAdapter, type ResponseDecodeContext, type ResponseKind, type RuntimeAuthController, type RuntimeContextStore, Schema, type SchemaDefinitionFactory, type SchemaOptions, type SchemaValidator, type SchemaValidatorInput, Service, ServiceDefinition, type ServiceDefinitionIdentity, type ServiceDefinitionOptions, type Shape, type Simplify, type SortDescriptor, type SortDescriptorMap, Store, type StreamResponse, type StringConfig, type SubmitFailure, type SubmitResult, type SubmitSuccess, type TargetEntity, type ThroughRelationConfig, type TimeConfig, ToManyRelationController, type ToManyRelationSnapshot, ToOneRelationController, type ToOneRelationSnapshot, type Transport, type TransportCapabilities, TransportExecutionError, type TransportMiddleware, type TransportRequest, type TransportResponse, type UiAlert, UiCogs, type UiCogsContext, type UiCogsOptions, type UiNotification, type UiNotificationAction, type UploadProgress, type ValidateOptions, type ValidationIssue, type ValidationResult, type Validator, type ValidatorInput, type ValidatorResult, type ViewOptions, ViewSchema, clientIssue, computed, createFormController, createFormSchema, createUiCogs, deepFreeze, editor, fields, filter, format, http, isBinaryPart, isFileValue, isLoggedIn, isRecord, joinUrl, local, localFile, memoryCache, mergeEntity, multipart, multipartAdapter, normalizeFailure, operation, pagination, parseIssue, prepareBody, relation, remoteFile, removedFile, resource, responseAdapters, schema, service, sort, stableSerialize, struct, tombstoneEntity, withQuery };
```
