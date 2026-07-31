import { expectError, expectType } from "tsd";
import { bindChart, chart, type ChartBinding, type EChartsOption } from "@uicogs/echarts";
import { createUiCogs, fields, local, resource, schema, type Infer } from "@uicogs/core";

const Candle = schema({
  id: fields.ID(),
  timestamp: fields.DateTime(),
  open: fields.Float(),
  close: fields.Float(),
  low: fields.Float(),
  high: fields.Float(),
});
const CandleView = Candle.view({ fields: ["timestamp", "open", "close", "low", "high"] });
const Candles = resource({
  name: "candles",
  schema: Candle,
  key: "id",
  source: local(),
});
const Other = resource({
  name: "other-candles",
  schema: schema({ id: fields.ID(), label: fields.Str({ required: true }) }),
  key: "id",
  source: local(),
});
const api = createUiCogs({ resources: [Candles, Other] });

const CandlestickChart = chart.collection(CandleView, (rows) => {
  expectType<readonly Readonly<Infer<typeof CandleView>>[]>(rows);
  return {
    dataset: { source: rows.map((row) => ({ ...row })) },
    series: [
      {
        type: "candlestick",
        encode: { x: "timestamp", y: ["open", "close", "low", "high"] },
      },
    ],
  } satisfies EChartsOption;
});

const collectionBinding = bindChart(CandlestickChart, api.resource(Candles));
expectType<ChartBinding>(collectionBinding);
expectType<EChartsOption>(collectionBinding.option);
expectError(bindChart(CandlestickChart, api.resource(Other)));

const CloseGauge = chart.entity(CandleView, (candle) => ({
  series: [{ type: "gauge", data: [{ value: candle?.close ?? 0 }] }],
}));
const entityBinding = bindChart(CloseGauge, api.resource(Candles).get(1));
expectType<ChartBinding>(entityBinding);
expectError(bindChart(CloseGauge, api.resource(Other).get(1)));

const ContextualMetric = schema.withContext<{ readonly locale: string }>()({
  id: fields.ID(),
  value: fields.Float(),
});
chart.collection(ContextualMetric, (rows) => ({
  series: [{ type: "bar", data: rows.map((row) => row.value) }],
}));
