import {
  Store,
  deepFreeze,
  type EntityKey,
  type ExternalStore,
  type Infer,
  type ResourceObject,
  type Schema,
  type Shape,
} from "@uicogs/core";
import type { EChartsOption, SetOptionOpts } from "echarts";

export type ChartKind = "collection" | "entity";

export interface ChartRenderOptions {
  readonly setOption?: SetOptionOpts;
}

export type CollectionOption<TValue> = (values: readonly Readonly<TValue>[]) => EChartsOption;

export type EntityOption<TValue> = (value: Readonly<TValue> | undefined) => EChartsOption;

/** The shared read-only collection surface provided by UiCogs resources and collection controllers. */
export interface ChartCollection<TValue> extends ExternalStore<object> {
  all(): readonly Readonly<TValue>[];
}

/** An immutable ECharts option definition bound to one UiCogs schema projection. */
export class ChartDefinition<TKind extends ChartKind, TSchema extends Schema<Shape, unknown>> {
  readonly renderOptions: Readonly<ChartRenderOptions>;

  constructor(
    readonly kind: TKind,
    readonly schema: TSchema,
    readonly option: TKind extends "collection"
      ? CollectionOption<Infer<TSchema>>
      : EntityOption<Infer<TSchema>>,
    renderOptions: ChartRenderOptions = {},
  ) {
    this.renderOptions = deepFreeze({ ...renderOptions });
    Object.freeze(this);
  }
}

export type CollectionChartDefinition<TSchema extends Schema<Shape, unknown>> = ChartDefinition<
  "collection",
  TSchema
>;

export type EntityChartDefinition<TSchema extends Schema<Shape, unknown>> = ChartDefinition<
  "entity",
  TSchema
>;

/** Builds an immutable chart definition that receives collection rows. */
function collection<TSchema extends Schema<Shape, unknown>>(
  schema: TSchema,
  option: CollectionOption<Infer<TSchema>>,
  renderOptions?: ChartRenderOptions,
): CollectionChartDefinition<TSchema> {
  return new ChartDefinition("collection", schema, option, renderOptions);
}

/** Builds an immutable chart definition that receives one resource entity. */
function entity<TSchema extends Schema<Shape, unknown>>(
  schema: TSchema,
  option: EntityOption<Infer<TSchema>>,
  renderOptions?: ChartRenderOptions,
): EntityChartDefinition<TSchema> {
  return new ChartDefinition("entity", schema, option, renderOptions);
}

export const chart = Object.freeze({ collection, entity });

export interface ChartSnapshot {
  readonly revision: number;
  readonly option: EChartsOption;
}

/** A local reactive binding between a UiCogs controller and one ECharts option factory. */
export interface ChartBinding extends ExternalStore<ChartSnapshot> {
  readonly option: EChartsOption;
  readonly renderOptions: Readonly<ChartRenderOptions>;
  dispose(): void;
}

class ChartBindingController<TValue> implements ChartBinding {
  private readonly store: Store<ChartSnapshot>;
  private unsubscribe?: () => void;
  private disposed = false;

  constructor(
    private readonly source: ExternalStore<object>,
    private readonly read: () => TValue,
    private readonly optionFactory: (value: TValue) => EChartsOption,
    readonly renderOptions: Readonly<ChartRenderOptions>,
  ) {
    this.store = new Store({ revision: 0, option: this.optionFactory(this.read()) });
    this.unsubscribe = source.subscribe(() => this.changed());
  }

  get option(): EChartsOption {
    return this.store.getSnapshot().option;
  }

  getSnapshot(): ChartSnapshot {
    return this.store.getSnapshot();
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private changed(): void {
    const previous = this.store.getSnapshot();
    this.store.setSnapshot({
      revision: previous.revision + 1,
      option: this.optionFactory(this.read()),
    });
  }
}

/** Binds a collection chart to a compatible UiCogs collection controller. */
export function bindChart<
  TSchema extends Schema<Shape, unknown>,
  TValue extends Infer<TSchema>,
  TSource extends ChartCollection<TValue>,
>(definition: CollectionChartDefinition<TSchema>, source: TSource): ChartBinding;

/** Binds an entity chart to a compatible UiCogs object controller. */
export function bindChart<
  TSchema extends Schema<Shape, unknown>,
  TValue extends Infer<TSchema>,
  TKey extends EntityKey,
  TContext,
>(
  definition: EntityChartDefinition<TSchema>,
  source: ResourceObject<TValue, TKey, TContext>,
): ChartBinding;

export function bindChart(
  definition: ChartDefinition<ChartKind, Schema<Shape, unknown>>,
  source:
    | ChartCollection<Readonly<Record<string, unknown>>>
    | ResourceObject<Readonly<Record<string, unknown>>, EntityKey, unknown>,
): ChartBinding {
  if (definition.kind === "collection") {
    const collection = source as ChartCollection<Readonly<Record<string, unknown>>>;
    return new ChartBindingController(
      collection,
      () => collection.all(),
      definition.option as CollectionOption<Readonly<Record<string, unknown>>>,
      definition.renderOptions,
    );
  }
  const entity = source as ResourceObject<Readonly<Record<string, unknown>>, EntityKey, unknown>;
  return new ChartBindingController(
    entity,
    () => entity.value,
    definition.option as EntityOption<Readonly<Record<string, unknown>>>,
    definition.renderOptions,
  );
}
