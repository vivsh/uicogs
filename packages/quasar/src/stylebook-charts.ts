import {
  UcEChart,
  type ChartBinding,
  type ChartSnapshot,
  type EChartsOption,
} from "@uicogs/echarts";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { QCard, QCardSection, QResponsive } from "quasar";
import { defineComponent, h } from "vue";

echarts.use([
  BarChart,
  GridComponent,
  LegendComponent,
  LineChart,
  PieChart,
  SVGRenderer,
  TooltipComponent,
]);

/** Fixture-only pie, bar, and line samples rendered with the public UiCogs ECharts binding. */
export const UcStylebookCharts = defineComponent({
  name: "UcStylebookCharts",
  setup: () => () =>
    h("section", { id: "charts", class: "uc-stylebook__section uc-stylebook__charts" }, [
      h("h2", { class: "uc-stylebook__section-title" }, "Charts"),
      h(
        "p",
        { class: "uc-stylebook__section-description" },
        "Fixture-only data rendered through UcEChart.",
      ),
      chartCard("Pie", pieBinding),
      chartCard("Bar", barBinding),
      chartCard("Line", lineBinding),
    ]),
});

const pieBinding = fixtureChart({
  tooltip: { trigger: "item" },
  legend: { bottom: 0 },
  series: [
    {
      type: "pie",
      radius: "60%",
      data: [
        { value: 12, name: "Open" },
        { value: 7, name: "Review" },
        { value: 4, name: "Done" },
      ],
    },
  ],
});

const barBinding = fixtureChart({
  tooltip: { trigger: "axis" },
  xAxis: { type: "category", data: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
  yAxis: { type: "value" },
  series: [{ type: "bar", data: [8, 13, 9, 16, 11] }],
});

const lineBinding = fixtureChart({
  tooltip: { trigger: "axis" },
  xAxis: { type: "category", data: ["Jan", "Feb", "Mar", "Apr", "May"] },
  yAxis: { type: "value" },
  series: [{ type: "line", smooth: true, data: [4, 7, 6, 12, 10] }],
});

function chartCard(label: string, chart: ChartBinding): ReturnType<typeof h> {
  return h(QCard, { class: "uc-stylebook__chart-card" }, () =>
    h(QCardSection, {}, () => [
      h("h3", {}, label),
      h(QResponsive, { ratio: 2 }, () =>
        h(UcEChart, {
          chart,
          engine: echarts,
          initOptions: { renderer: "svg" },
        }),
      ),
    ]),
  );
}

function fixtureChart(option: EChartsOption): ChartBinding {
  const snapshot: ChartSnapshot = Object.freeze({ revision: 0, option: Object.freeze(option) });
  return Object.freeze({
    option: snapshot.option,
    renderOptions: Object.freeze({}),
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    dispose: () => undefined,
  });
}
