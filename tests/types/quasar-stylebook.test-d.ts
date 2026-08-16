import { expectAssignable, expectError, expectType } from "tsd";
import { defineComponent } from "vue";
import {
  stylebook,
  type UcStylebookEntry,
  type UcStylebookOptions,
} from "@uicogs/quasar/stylebook";
import type { VueRouteIntegration } from "@uicogs/vue";

const component = defineComponent({ setup: () => () => null });
expectAssignable<UcStylebookEntry<{ readonly title: string }>>({
  id: "controls",
  label: "Controls",
  component,
  fixture: { title: "Sample controls" },
});
expectAssignable<UcStylebookOptions>({
  enabled: true,
  path: "/__stylebook",
  components: [{ id: "controls", component }],
});
expectType<VueRouteIntegration>(stylebook());
expectError<UcStylebookOptions>({ components: [{ id: "controls" }] });
expectError<UcStylebookOptions>({ enabled: "development" });
