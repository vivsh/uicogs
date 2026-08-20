// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import { defineComponent, h } from "vue";
import { stylebook } from "./stylebook.js";
import { UcStylebook } from "./stylebook-view.js";

describe("UiCogs Quasar stylebook", () => {
  it("adds one opt-in route with the overview and configured entry segments", async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    stylebook({ components: [{ id: "controls", component: fixture("Controls") }] }).install(router);
    expect(router.resolve("/__stylebook").name).toBe("uicogs-stylebook:/__stylebook");
    expect(router.resolve("/__stylebook/controls").params.component).toBe("controls");
    expect(
      router.getRoutes().find((record) => record.name === "uicogs-stylebook:/__stylebook"),
    ).toMatchObject({ path: "/__stylebook/:component?" });
  });

  it("does not register a production-disabled route", () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    stylebook({ enabled: false }).install(router);
    expect(router.getRoutes()).toHaveLength(0);
  });

  it("passes local fixture input to a custom entry as its fixture property", async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const Fixture = defineComponent({
      props: { fixture: Object },
      setup: (props) => () => h("div", String((props.fixture as { readonly name: string }).name)),
    });
    const entry = { id: "custom", component: Fixture, fixture: { name: "Fixture value" } };
    stylebook({ components: [entry] }).install(router);
    await router.push("/__stylebook/custom");
    const wrapper = mount(UcStylebook, {
      props: { entries: [entry], routeName: "uicogs-stylebook:/__stylebook" },
      global: {
        plugins: [router],
        stubs: quasarStubs,
        config: { globalProperties: { $q: quasarGlobal } as never },
      },
    });
    expect(wrapper.text()).toContain("Fixture value");
  });

  it("rejects invalid paths, duplicate entry names, and route conflicts", () => {
    expect(() => stylebook({ path: "fixtures" })).toThrow("absolute static");
    expect(() =>
      stylebook({ components: [{ id: "overview", component: fixture("Reserved") }] }),
    ).toThrow("reserved");
    expect(() =>
      stylebook({
        components: [
          { id: "same", component: fixture("One") },
          { id: "same", component: fixture("Two") },
        ],
      }),
    ).toThrow("more than once");
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/fixtures/:component?", component: fixture("Existing") }],
    });
    expect(() => stylebook({ path: "/fixtures" }).install(router)).toThrow("conflicts");
  });
});

function fixture(label: string) {
  return defineComponent({ name: `${label}Fixture`, setup: () => () => h("div", label) });
}

const quasarStubs = {
  QPage: defineComponent({
    name: "QPage",
    setup:
      (_props, { slots }) =>
      () =>
        h("main", slots.default?.()),
  }),
  QList: defineComponent({
    name: "QList",
    setup:
      (_props, { slots }) =>
      () =>
        h("div", slots.default?.()),
  }),
  QItem: defineComponent({
    name: "QItem",
    setup:
      (_props, { slots }) =>
      () =>
        h("div", slots.default?.()),
  }),
  QItemSection: defineComponent({
    name: "QItemSection",
    setup:
      (_props, { slots }) =>
      () =>
        h("div", slots.default?.()),
  }),
  QItemLabel: defineComponent({
    name: "QItemLabel",
    setup:
      (_props, { slots }) =>
      () =>
        h("span", slots.default?.()),
  }),
  QBanner: defineComponent({
    name: "QBanner",
    setup:
      (_props, { slots }) =>
      () =>
        h("div", slots.default?.()),
  }),
  QBtn: defineComponent({
    name: "QBtn",
    setup:
      (_props, { slots }) =>
      () =>
        h("button", slots.default?.()),
  }),
};

const quasarGlobal = {
  dark: {
    isActive: false,
    set: () => undefined,
  },
};
