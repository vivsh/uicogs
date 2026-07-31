# ECharts

`@uicogs/echarts` turns an existing UiCogs collection or object controller into a
reactive ECharts option. It does not create a second data cache, load data, or
interpret loading and error states.

The package takes an injected ECharts engine. This keeps chart module selection
and bundle size under application control.

```ts
import * as echarts from "echarts/core";
import { CandlestickChart, GaugeChart } from "echarts/charts";
import { DatasetComponent, GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  CandlestickChart,
  GaugeChart,
  DatasetComponent,
  GridComponent,
  TooltipComponent,
  CanvasRenderer,
]);
```

Pass this configured `echarts` module to `<UcEChart>`. The package does not call
`echarts.use()` or import ECharts implementation modules.

## Collection charts

Chart definitions reuse an existing schema or view. The option factory returns
an ordinary ECharts option, so chart types and all nested options use the
upstream ECharts API unchanged.

```ts
import { fields, schema } from "@uicogs/core";
import { chart } from "@uicogs/echarts";

const Candle = schema({
  timestamp: fields.DateTime(),
  open: fields.Float(),
  close: fields.Float(),
  low: fields.Float(),
  high: fields.Float(),
});

export const Candlestick = chart.collection(Candle, (rows) => ({
  dataset: {
    dimensions: ["timestamp", "open", "close", "low", "high"],
    // UiCogs values are immutable; ECharts declares object-row datasets mutable.
    source: rows.map((row) => ({ ...row })),
  },
  tooltip: { trigger: "axis" },
  xAxis: { type: "category" },
  yAxis: { scale: true },
  series: [
    {
      type: "candlestick",
      encode: { x: "timestamp", y: ["open", "close", "low", "high"] },
    },
  ],
}));
```

In a Vue component, bind the definition to a loaded resource or query
collection. The composable disposes its binding with the component scope.

```vue
<script setup lang="ts">
import { UcEChart, useUcChart } from "@uicogs/echarts";
import { Candlestick } from "./charts";
import { prices } from "./resources";
import { echarts } from "./echarts";

const priceChart = useUcChart(Candlestick, prices);
</script>

<template>
  <UcEChart :chart="priceChart" :engine="echarts" class="price-chart" />
</template>

<style scoped>
.price-chart {
  height: 24rem;
}
</style>
```

The component never calls `prices.load()`. The page owns loading and can render
its own pending or error state beside the chart.

## Entity charts

Use `chart.entity()` for a single object controller, such as a gauge or a
summary chart.

```ts
const CreditSummary = Account.view({ fields: ["creditUsed", "creditLimit"] });

export const CreditGauge = chart.entity(CreditSummary, (account) => ({
  series: [
    {
      type: "gauge",
      max: account?.creditLimit ?? 0,
      data: [{ value: account?.creditUsed ?? 0 }],
    },
  ],
}));

const accountChart = useUcChart(CreditGauge, accounts.get(accountId));
```

## Local application data

For data that does not come from an API, use a normal local UiCogs resource.
This keeps parsing, normalized updates, and chart reactivity on the same path
as remote data.

```ts
const DraftMetrics = resource({
  name: "draft-metrics",
  schema: Metric,
  key: "id",
  source: local({ initial: [{ id: 1, label: "Drafts", value: 4 }] }),
});

const metrics = api.resource(DraftMetrics);
const metricsChart = useUcChart(MetricBars, metrics);

metrics.cache.upsert({ id: 1, label: "Drafts", value: 5 });
```

## Rendering behavior

`UcEChart` initializes ECharts after mounting, sends each resolved option to
`setOption()`, observes host-size changes by default, and disposes the native
instance on unmount. Pass native `SetOptionOpts` when defining a chart when a
specific ECharts merge policy is required:

```ts
const ReplacingCandles = chart.collection(Candle, option, {
  setOption: { notMerge: true, replaceMerge: ["series"] },
});
```
