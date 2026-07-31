// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { effectScope, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createUiCogs, fields, local, resource, schema } from "@uicogs/core";
import { bindChart, chart, UcEChart, useUcChart } from "./index.js";
import type { EChartsEngine } from "./types.js";

const Value = schema({ id: fields.ID(), value: fields.Float() });
const Values = resource({
  name: "chart-values",
  schema: Value,
  key: "id",
  source: local({ initial: [{ id: 1, value: 5 }] }),
});
const ValueChart = chart.collection(Value, (values) => ({
  series: [{ type: "bar", data: values.map((value) => value.value) }],
}));
const ReplacingValueChart = chart.collection(
  Value,
  (values) => ({ series: [{ type: "bar", data: values.map((value) => value.value) }] }),
  { setOption: { notMerge: true, replaceMerge: ["series"] } },
);

afterEach(() => vi.unstubAllGlobals());

describe("UcEChart", () => {
  /** Verifies that the component mounts, updates, resizes, and disposes an injected engine instance. */
  it("renders each chart binding revision and cleans up its native instance", async () => {
    const resize = vi.fn();
    const setOption = vi.fn();
    const dispose = vi.fn();
    const observer = { observe: vi.fn(), disconnect: vi.fn() };
    let resized: ResizeObserverCallback | undefined;
    const ResizeObserverMock = vi.fn(function ResizeObserverMock(callback: ResizeObserverCallback) {
      resized = callback;
      return observer;
    });
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    const engine: EChartsEngine = {
      init: vi.fn(() => ({ setOption, resize, dispose })) as EChartsEngine["init"],
    };
    const api = createUiCogs({ resources: [Values] });
    const values = api.resource(Values);
    await values.load();
    const binding = bindChart(ReplacingValueChart, values);
    const wrapper = mount(UcEChart, {
      props: { chart: binding, engine, initOptions: { renderer: "svg" } },
      attrs: { "data-testid": "chart" },
    });

    expect(engine.init).toHaveBeenCalledOnce();
    expect(setOption).toHaveBeenCalledWith(binding.option, {
      notMerge: true,
      replaceMerge: ["series"],
    });
    expect(wrapper.get("[data-testid=chart]")).toBeDefined();
    resized?.([], observer as unknown as ResizeObserver);
    expect(resize).toHaveBeenCalledOnce();

    values.cache.add({ id: 2, value: 8 });
    await nextTick();
    expect(setOption).toHaveBeenCalledTimes(3);
    expect(setOption).toHaveBeenLastCalledWith(binding.option, {
      notMerge: true,
      replaceMerge: ["series"],
    });
    await wrapper.setProps({ autoresize: false });
    expect(engine.init).toHaveBeenCalledTimes(2);

    wrapper.unmount();
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledTimes(2);
    binding.dispose();
    api.dispose();
  });

  /** Verifies that chart rendering never starts collection loading on behalf of the application. */
  it("does not load an unrequested collection", () => {
    const engine: EChartsEngine = {
      init: vi.fn(() => ({
        setOption: vi.fn(),
        resize: vi.fn(),
        dispose: vi.fn(),
      })) as EChartsEngine["init"],
    };
    const api = createUiCogs({ resources: [Values] });
    const values = api.resource(Values);
    const load = vi.spyOn(values, "load");
    const binding = bindChart(ValueChart, values);
    const wrapper = mount(UcEChart, { props: { chart: binding, engine } });

    expect(values.loading).toBe(false);
    expect(load).not.toHaveBeenCalled();
    wrapper.unmount();
    binding.dispose();
    api.dispose();
  });

  /** Verifies that the Vue composable releases its chart subscription with its scope. */
  it("disposes its chart binding with the current Vue scope", async () => {
    const api = createUiCogs({ resources: [Values] });
    const values = api.resource(Values);
    await values.load();
    const scope = effectScope();
    let binding: ReturnType<typeof bindChart> | undefined;

    scope.run(() => {
      binding = useUcChart(ValueChart, values);
    });
    const revision = binding?.getSnapshot().revision;
    scope.stop();
    values.cache.add({ id: 2, value: 8 });

    expect(binding?.getSnapshot().revision).toBe(revision);
    api.dispose();
  });

  /** Verifies that the composable remains usable outside a Vue lifecycle scope. */
  it("returns an explicit binding without a Vue scope", async () => {
    const api = createUiCogs({ resources: [Values] });
    const values = api.resource(Values);
    await values.load();

    const binding = useUcChart(ValueChart, values);

    expect(binding.option).toMatchObject({ series: [{ data: [5] }] });
    binding.dispose();
    api.dispose();
  });
});
