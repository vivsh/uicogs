import { describe, expect, it } from "vitest";
import { createUiCogs, fields, local, resource, schema } from "@uicogs/core";
import { bindChart, chart } from "./index.js";

const PricePoint = schema({
  id: fields.ID(),
  timestamp: fields.DateTime(),
  open: fields.Float(),
  close: fields.Float(),
  low: fields.Float(),
  high: fields.Float(),
});

const Prices = resource({
  name: "prices",
  schema: PricePoint,
  key: "id",
  source: local({
    initial: [
      {
        id: 1,
        timestamp: new Date("2026-01-01T00:00:00.000Z"),
        open: 10,
        close: 12,
        low: 9,
        high: 13,
      },
    ],
  }),
});

const Candles = chart.collection(PricePoint, (rows) => ({
  dataset: { source: rows },
  series: [
    { type: "candlestick", encode: { x: "timestamp", y: ["open", "close", "low", "high"] } },
  ],
}));

describe("schema-bound chart definitions", () => {
  /** Verifies that a collection chart recomputes its native option from cache-backed rows. */
  it("publishes a new option when its collection source changes", async () => {
    const api = createUiCogs({ resources: [Prices] });
    const prices = api.resource(Prices);
    await prices.load();
    const binding = bindChart(Candles, prices);
    const options = [binding.option];
    const unsubscribe = binding.subscribe(() => options.push(binding.option));

    prices.cache.add({
      id: 2,
      timestamp: new Date("2026-01-02T00:00:00.000Z"),
      open: 12,
      close: 15,
      low: 11,
      high: 16,
    });

    expect(options).toHaveLength(3);
    expect(options.at(-1)).toMatchObject({ dataset: { source: [{ id: 1 }, { id: 2 }] } });
    unsubscribe();
    binding.dispose();
    api.dispose();
  });

  /** Verifies that entity charts follow normalized object updates without owning cache state. */
  it("publishes a new option when its object source changes", async () => {
    const api = createUiCogs({ resources: [Prices] });
    const prices = api.resource(Prices);
    await prices.load();
    const PriceClose = PricePoint.view({ fields: ["id", "close"] });
    const CloseGauge = chart.entity(PriceClose, (price) => ({
      series: [{ type: "gauge", data: [{ value: price?.close ?? 0 }] }],
    }));
    const binding = bindChart(CloseGauge, prices.get(1));

    prices.cache.upsert({ id: 1, close: 18 });

    expect(binding.option).toMatchObject({ series: [{ data: [{ value: 18 }] }] });
    binding.dispose();
    api.dispose();
  });

  /** Verifies that definitions preserve native rendering options and bindings dispose idempotently. */
  it("forwards native setOption options and ignores source changes after disposal", async () => {
    const api = createUiCogs({ resources: [Prices] });
    const prices = api.resource(Prices);
    await prices.load();
    const ReplaceCandles = chart.collection(
      PricePoint,
      (rows) => ({ dataset: { source: rows }, series: [{ type: "candlestick" }] }),
      { setOption: { notMerge: true, replaceMerge: ["series"] } },
    );
    const binding = bindChart(ReplaceCandles, prices);
    const revision = binding.getSnapshot().revision;

    binding.dispose();
    binding.dispose();
    prices.cache.add({
      id: 2,
      timestamp: new Date("2026-01-02T00:00:00.000Z"),
      open: 12,
      close: 15,
      low: 11,
      high: 16,
    });

    expect(binding.renderOptions.setOption).toEqual({ notMerge: true, replaceMerge: ["series"] });
    expect(binding.getSnapshot().revision).toBe(revision);
    api.dispose();
  });
});
