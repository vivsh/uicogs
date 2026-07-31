import {
  bindChart,
  type ChartCollection,
  type ChartBinding,
  type CollectionChartDefinition,
  type EntityChartDefinition,
} from "./chart.js";
import type { EChartsEngine, EChartsInitOptions, EChartsTheme } from "./types.js";
import type { EntityKey, Infer, ResourceObject, Schema, Shape } from "@uicogs/core";
import {
  defineComponent,
  getCurrentScope,
  h,
  onBeforeUnmount,
  onMounted,
  onScopeDispose,
  ref,
  watch,
  type PropType,
} from "vue";

/** Binds a chart to a UiCogs controller and disposes the binding with the current Vue scope. */
export function useUcChart<
  TSchema extends Schema<Shape, unknown>,
  TValue extends Infer<TSchema>,
  TSource extends ChartCollection<TValue>,
>(definition: CollectionChartDefinition<TSchema>, source: TSource): ChartBinding;

/** Binds an entity chart to a Vue scope. */
export function useUcChart<
  TSchema extends Schema<Shape, unknown>,
  TValue extends Infer<TSchema>,
  TKey extends EntityKey,
  TContext,
>(
  definition: EntityChartDefinition<TSchema>,
  source: ResourceObject<TValue, TKey, TContext>,
): ChartBinding;

export function useUcChart(
  definition:
    | CollectionChartDefinition<Schema<Shape, unknown>>
    | EntityChartDefinition<Schema<Shape, unknown>>,
  source:
    | ChartCollection<Readonly<Record<string, unknown>>>
    | ResourceObject<Readonly<Record<string, unknown>>, EntityKey, unknown>,
): ChartBinding {
  const binding = bindChart(definition as never, source as never);
  if (getCurrentScope()) onScopeDispose(() => binding.dispose());
  return binding as ChartBinding;
}

/** Renders one reactive chart binding through an injected ECharts engine. */
export const UcEChart = defineComponent({
  name: "UcEChart",
  inheritAttrs: false,
  props: {
    chart: { type: Object as PropType<ChartBinding>, required: true },
    engine: { type: Object as PropType<EChartsEngine>, required: true },
    theme: { type: [String, Object] as PropType<EChartsTheme> },
    initOptions: { type: Object as PropType<EChartsInitOptions> },
    autoresize: { type: Boolean, default: true },
  },
  setup(properties, { attrs }) {
    const element = ref<HTMLElement>();
    let dispose: (() => void) | undefined;

    const restart = (): void => {
      dispose?.();
      const host = element.value;
      if (!host) return;
      const instance = properties.engine.init(host, properties.theme, properties.initOptions);
      const apply = (): void => {
        instance.setOption(properties.chart.option, properties.chart.renderOptions.setOption);
      };
      apply();
      const unsubscribe = properties.chart.subscribe(apply);
      const observer = createResizeObserver(host, instance.resize, properties.autoresize);
      dispose = (): void => {
        unsubscribe();
        observer?.disconnect();
        instance.dispose();
      };
    };

    onMounted(restart);
    watch(
      () => [
        properties.chart,
        properties.engine,
        properties.theme,
        properties.initOptions,
        properties.autoresize,
      ],
      restart,
    );
    onBeforeUnmount(() => dispose?.());
    return () => h("div", { ...attrs, ref: element });
  },
});

function createResizeObserver(
  element: HTMLElement,
  resize: () => void,
  enabled: boolean,
): ResizeObserver | undefined {
  if (!enabled || typeof ResizeObserver === "undefined") return undefined;
  const observer = new ResizeObserver(() => resize());
  observer.observe(element);
  return observer;
}
