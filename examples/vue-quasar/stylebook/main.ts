import { createApp, defineComponent, h } from "vue";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
import { QLayout, QPageContainer, Quasar } from "quasar";
import "quasar/dist/quasar.css";
import "@quasar/extras/material-icons/material-icons.css";
import iconSet from "quasar/icon-set/svg-material-icons.js";
import { createUiCogs } from "@uicogs/core";
import { stylebook } from "@uicogs/quasar/stylebook";
import { withVue } from "@uicogs/vue";

const api = createUiCogs({ context: undefined });
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: "/", component: defineComponent({ setup: () => () => null }) }],
});
const { uiCogs } = await withVue(api, { stylebook: stylebook() });

const app = defineComponent({
  name: "StylebookExample",
  setup: () => () => h(QLayout, {}, () => h(QPageContainer, {}, () => h(RouterView))),
});

const application = createApp(app).use(Quasar, { iconSet, plugins: {} }).use(router).use(uiCogs);
await router.replace("/__stylebook");
application.mount("#app");
