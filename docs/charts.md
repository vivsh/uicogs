# Charts

UiCogs charts are projections of existing typed data controllers. A chart does
not fetch, cache, duplicate, filter, or mutate data: the resource, collection,
or object controller remains the owner of all of that behavior.

## Choose the source shape

Use a collection chart when every collection row contributes to a series. This
works with a resource's default collection or a named query collection.

```ts
const sales = api.resource(Sales).query("monthly", { year: 2026 });
const salesChart = useUcChart(MonthlySales, sales);
```

Use an entity chart when one object supplies the complete chart state, such as
a gauge, a KPI, or a small breakdown.

```ts
const account = api.resource(Accounts).get(accountId);
const creditChart = useUcChart(CreditGauge, account);
```

For application-owned data, define a normal `local()` resource. Its schema
parses values and its cache writes publish the same updates as a remote source.
There is no separate chart-local data store.

## Define from a schema or view

Definitions are immutable and reuse the same schema/view that describes the
data source. The option factory receives typed, read-only parsed values.

```ts
const MonthlySales = chart.collection(SalePoint, (rows) => ({
  xAxis: { type: "category", data: rows.map((row) => row.month) },
  yAxis: { type: "value" },
  series: [{ type: "bar", data: rows.map((row) => row.total) }],
}));
```

The returned object is renderer-native configuration. UiCogs does not introduce
a chart-type or series DSL, rename fields, or transform the result before it is
given to the renderer.

## Reactivity and lifecycle

Each `useUcChart()` binding subscribes to its source controller. A cache write,
resource reload, object update, or live update recomputes the native option and
republishes it. The binding is disposed with the Vue component scope.

The application still owns loading and error UI. Charts never call `load()`.

## ECharts

The first chart renderer is `@uicogs/echarts`, which provides `chart.collection`,
`chart.entity`, `useUcChart`, and `<UcEChart>`. See [ECharts](echarts.md) for
engine setup, candlestick and gauge examples, native option merge settings, and
the immutable-row requirement for `dataset.source`.
