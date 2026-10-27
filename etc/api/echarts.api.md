# @uicogs/echarts API

Declaration SHA-256: `3f2ed4cb14299539d064885173356d953f5c74cb7f2a0e8d43e0785a4cbdeebb`

```ts
// index.d.ts
import { ExternalStore, Infer, EntityKey, ResourceObject } from '@uicogs/core';
import * as EChartsModule from 'echarts';
import { EChartsOption, SetOptionOpts } from 'echarts';
export { EChartsOption, SetOptionOpts } from 'echarts';
import * as vue from 'vue';
import { PropType } from 'vue';

type ChartKind = "collection" | "entity";
/** Structural schema projection required to infer values passed to a chart option factory. */
interface ChartSchema {
    readonly _output: unknown;
}
interface ChartRenderOptions {
    readonly setOption?: SetOptionOpts;
}
type CollectionOption<TValue> = (values: readonly Readonly<TValue>[]) => EChartsOption;
type EntityOption<TValue> = (value: Readonly<TValue> | undefined) => EChartsOption;
/** The shared read-only collection surface provided by UiCogs resources and collection controllers. */
interface ChartCollection<TValue> extends ExternalStore<object> {
    all(): readonly Readonly<TValue>[];
}
/** An immutable ECharts option definition bound to one UiCogs schema projection. */
declare class ChartDefinition<TKind extends ChartKind, TSchema extends ChartSchema> {
    readonly kind: TKind;
    readonly schema: TSchema;
    readonly option: TKind extends "collection" ? CollectionOption<Infer<TSchema>> : EntityOption<Infer<TSchema>>;
    readonly renderOptions: Readonly<ChartRenderOptions>;
    constructor(kind: TKind, schema: TSchema, option: TKind extends "collection" ? CollectionOption<Infer<TSchema>> : EntityOption<Infer<TSchema>>, renderOptions?: ChartRenderOptions);
}
type CollectionChartDefinition<TSchema extends ChartSchema> = ChartDefinition<"collection", TSchema>;
type EntityChartDefinition<TSchema extends ChartSchema> = ChartDefinition<"entity", TSchema>;
/** Builds an immutable chart definition that receives collection rows. */
declare function collection<TSchema extends ChartSchema>(schema: TSchema, option: CollectionOption<Infer<TSchema>>, renderOptions?: ChartRenderOptions): CollectionChartDefinition<TSchema>;
/** Builds an immutable chart definition that receives one resource entity. */
declare function entity<TSchema extends ChartSchema>(schema: TSchema, option: EntityOption<Infer<TSchema>>, renderOptions?: ChartRenderOptions): EntityChartDefinition<TSchema>;
declare const chart: Readonly<{
    collection: typeof collection;
    entity: typeof entity;
}>;
interface ChartSnapshot {
    readonly revision: number;
    readonly option: EChartsOption;
}
/** A local reactive binding between a UiCogs controller and one ECharts option factory. */
interface ChartBinding extends ExternalStore<ChartSnapshot> {
    readonly option: EChartsOption;
    readonly renderOptions: Readonly<ChartRenderOptions>;
    dispose(): void;
}
/** Binds a collection chart to a compatible UiCogs collection controller. */
declare function bindChart<TSchema extends ChartSchema, TValue extends Infer<TSchema>, TSource extends ChartCollection<TValue>>(definition: CollectionChartDefinition<TSchema>, source: TSource): ChartBinding;
/** Binds an entity chart to a compatible UiCogs object controller. */
declare function bindChart<TSchema extends ChartSchema, TValue extends Infer<TSchema>, TKey extends EntityKey, TContext>(definition: EntityChartDefinition<TSchema>, source: ResourceObject<TValue, TKey, TContext>): ChartBinding;

/** The caller-provided ECharts module or configured `echarts/core` instance. */
interface EChartsEngine {
    init(element: HTMLElement | null | undefined, theme?: Parameters<typeof EChartsModule.init>[1], options?: Parameters<typeof EChartsModule.init>[2]): EChartsInstance;
}
/** The native ECharts instance operations required by UiCogs rendering. */
interface EChartsInstance {
    setOption(option: EChartsOption, options?: SetOptionOpts): void;
    resize(): void;
    dispose(): void;
}
type EChartsTheme = Parameters<typeof EChartsModule.init>[1];
type EChartsInitOptions = Parameters<typeof EChartsModule.init>[2];

/** Binds a chart to a UiCogs controller and disposes the binding with the current Vue scope. */
declare function useUcChart<TSchema extends ChartSchema, TValue extends Infer<TSchema>, TSource extends ChartCollection<TValue>>(definition: CollectionChartDefinition<TSchema>, source: TSource): ChartBinding;
/** Binds an entity chart to a Vue scope. */
declare function useUcChart<TSchema extends ChartSchema, TValue extends Infer<TSchema>, TKey extends EntityKey, TContext>(definition: EntityChartDefinition<TSchema>, source: ResourceObject<TValue, TKey, TContext>): ChartBinding;
/** Renders one reactive chart binding through an injected ECharts engine. */
declare const UcEChart: vue.DefineComponent<vue.ExtractPropTypes<{
    chart: {
        type: PropType<ChartBinding>;
        required: true;
    };
    engine: {
        type: PropType<EChartsEngine>;
        required: true;
    };
    theme: {
        type: PropType<EChartsTheme>;
    };
    initOptions: {
        type: PropType<EChartsInitOptions>;
    };
    autoresize: {
        type: BooleanConstructor;
        default: boolean;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, {}, string, vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    chart: {
        type: PropType<ChartBinding>;
        required: true;
    };
    engine: {
        type: PropType<EChartsEngine>;
        required: true;
    };
    theme: {
        type: PropType<EChartsTheme>;
    };
    initOptions: {
        type: PropType<EChartsInitOptions>;
    };
    autoresize: {
        type: BooleanConstructor;
        default: boolean;
    };
}>> & Readonly<{}>, {
    autoresize: boolean;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

export { type ChartBinding, type ChartCollection, ChartDefinition, type ChartKind, type ChartRenderOptions, type ChartSchema, type ChartSnapshot, type CollectionChartDefinition, type CollectionOption, type EChartsEngine, type EChartsInitOptions, type EChartsInstance, type EChartsTheme, type EntityChartDefinition, type EntityOption, UcEChart, bindChart, chart, useUcChart };
```
