import type * as EChartsModule from "echarts";
import type { EChartsOption, SetOptionOpts } from "echarts";

export type { EChartsOption, SetOptionOpts } from "echarts";

/** The caller-provided ECharts module or configured `echarts/core` instance. */
export interface EChartsEngine {
  init(
    element: HTMLElement | null | undefined,
    theme?: Parameters<typeof EChartsModule.init>[1],
    options?: Parameters<typeof EChartsModule.init>[2],
  ): EChartsInstance;
}

/** The native ECharts instance operations required by UiCogs rendering. */
export interface EChartsInstance {
  setOption(option: EChartsOption, options?: SetOptionOpts): void;
  resize(): void;
  dispose(): void;
}

export type EChartsTheme = Parameters<typeof EChartsModule.init>[1];
export type EChartsInitOptions = Parameters<typeof EChartsModule.init>[2];
