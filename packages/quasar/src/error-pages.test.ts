// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it } from "vitest";
import { RouterView, createMemoryHistory, createRouter } from "vue-router";
import {
  UcErrorPage,
  UcForbiddenPage,
  UcNotFoundPage,
  UcServerErrorPage,
  UcUnauthorizedPage,
} from "./error-pages.js";

const stubs = {
  QPage: passthrough("QPageStub", "main"),
  QCard: passthrough("QCardStub", "section"),
  QCardSection: passthrough("QCardSectionStub", "div"),
  QBtn: defineComponent({
    name: "QBtnStub",
    inheritAttrs: false,
    props: { label: String, loading: Boolean, disable: Boolean },
    emits: ["click"],
    setup(props, { attrs, emit }) {
      return () =>
        h(
          "button",
          { ...attrs, disabled: props.disable, onClick: () => emit("click") },
          props.label,
        );
    },
  }),
};

describe("Quasar error pages", () => {
  it("uses safe status-aware defaults and stable page hooks", () => {
    const wrapper = mount(UcErrorPage, { props: { status: 404 }, global: { stubs } });

    expect(wrapper.text()).toContain("Page not found");
    expect(wrapper.text()).toContain("does not exist");
    expect(wrapper.find(".uc-error-page").exists()).toBe(true);
    expect(wrapper.find(".uc-error-page__card").exists()).toBe(true);
    expect(wrapper.find(".uc-error-page__status").text()).toBe("404");
    expect(wrapper.find(".uc-error-page__title").text()).toBe("Page not found");
    expect(wrapper.find(".uc-error-page__message").text()).toContain("does not exist");
  });

  it("renders application messages as text rather than server HTML", () => {
    const wrapper = mount(UcErrorPage, {
      props: { status: 500, message: "<strong>Unsafe server body</strong>" },
      global: { stubs },
    });

    expect(wrapper.find(".uc-error-page__message").text()).toBe(
      "<strong>Unsafe server body</strong>",
    );
    expect(wrapper.html()).not.toContain("<strong>Unsafe server body</strong>");
  });

  it("emits only controlled retry intent and respects retrying state", async () => {
    const wrapper = mount(UcServerErrorPage, {
      props: { retryable: true, retryLabel: "Retry request" },
      global: { stubs },
    });

    const button = wrapper.find(".uc-error-page__retry");
    expect(button.text()).toBe("Retry request");
    await button.trigger("click");
    expect(wrapper.emitted("retry")).toHaveLength(1);

    await wrapper.setProps({ retrying: true });
    expect(wrapper.find(".uc-error-page__retry").attributes("disabled")).toBeDefined();
    await wrapper.find(".uc-error-page__retry").trigger("click");
    expect(wrapper.emitted("retry")).toHaveLength(1);
  });

  it("replaces default actions while preserving retry bindings", async () => {
    const wrapper = mount(UcUnauthorizedPage, {
      props: { retryable: true },
      slots: {
        actions: ({
          retry,
          retrying,
        }: {
          readonly retry: () => void;
          readonly retrying: boolean;
        }) =>
          h(
            "button",
            { class: "application-action", onClick: retry, disabled: retrying },
            "Sign in",
          ),
      },
      global: { stubs },
    });

    expect(wrapper.find(".uc-error-page__retry").exists()).toBe(false);
    await wrapper.find(".application-action").trigger("click");
    expect(wrapper.emitted("retry")).toHaveLength(1);
  });

  it("provides dedicated 401, 403, 404, and 5xx defaults", () => {
    expect(mount(UcUnauthorizedPage, { global: { stubs } }).text()).toContain("Sign in required");
    expect(mount(UcForbiddenPage, { global: { stubs } }).text()).toContain("Access denied");
    expect(mount(UcNotFoundPage, { global: { stubs } }).text()).toContain("Page not found");
    expect(mount(UcServerErrorPage, { global: { stubs } }).text()).toContain(
      "Something went wrong",
    );
  });

  it("works as a normal native Vue Router record", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/:pathMatch(.*)*", component: UcNotFoundPage }],
    });
    await router.push("/missing");
    await router.isReady();

    const wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), {
      global: { plugins: [router], stubs },
    });
    expect(wrapper.text()).toContain("Page not found");
  });
});

function passthrough(name: string, tag: string) {
  return defineComponent({
    name,
    inheritAttrs: false,
    setup(_props, { attrs, slots }) {
      return () => h(tag, attrs, slots.default?.());
    },
  });
}
