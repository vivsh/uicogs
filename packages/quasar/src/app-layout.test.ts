// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { computed, defineComponent, h, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlertController, NotificationController } from "@uicogs/core";
import { Notify } from "quasar";
import { UcAlertHost } from "./alert-host.js";
import { UcAppLayout } from "./app-layout.js";
import { UcNavigationTree } from "./navigation.js";
import { UcNotificationList, type UcNotification } from "./notifications.js";

const navigation = ref<Record<string, readonly object[]>>({});
const cogs = {
  navigation: vi.fn((placement: string) => computed(() => navigation.value[placement] ?? [])),
  notifications: new NotificationController(false),
  alerts: new AlertController(),
};

vi.mock("@uicogs/vue", async () => {
  const actual = await vi.importActual<typeof import("@uicogs/vue")>("@uicogs/vue");
  return { ...actual, useUiCogs: () => cogs };
});

describe("Quasar application shell", () => {
  afterEach(() => {
    cogs.notifications = new NotificationController(false);
  });
  it("renders nested navigation nodes, active state, and application-provided badges", () => {
    const wrapper = mount(UcNavigationTree, {
      props: {
        nodes: [
          {
            kind: "group",
            id: "admin",
            label: "Administration",
            children: [
              {
                icon: { component: "not-a-quasar-icon" },
                kind: "route",
                id: "notifications",
                label: "Notifications",
                to: "/notifications",
                current: true,
              },
            ],
          },
        ],
        badges: { notifications: { value: 3, label: "3 unread notifications" } },
      },
      global: { stubs: quasarStubs },
    });

    expect(wrapper.find(".uc-navigation-tree").exists()).toBe(true);
    expect(wrapper.text()).toContain("Administration");
    expect(wrapper.find(".uc-navigation-tree__item--active").text()).toContain("Notifications");
    expect(wrapper.find(".uc-navigation-tree__badge").text()).toBe("3");
    expect(wrapper.find("[data-q-icon]").exists()).toBe(false);
  });

  it("renders controlled notifications and emits user intent without mutating items", async () => {
    const item: UcNotification = {
      id: "launch",
      title: "Launch ready",
      message: "Review the release checklist.",
      level: "info",
      icon: "campaign",
      actions: [{ id: "review", label: "Review", to: "/release" }],
    };
    const wrapper = mount(UcNotificationList, {
      props: { items: [item] },
      global: { stubs: quasarStubs },
    });

    expect(wrapper.find(".uc-notification-list__item--unread").exists()).toBe(true);
    await wrapper.find("[data-q-item]").trigger("click");
    expect(wrapper.emitted("notification-mark-read")?.[0]).toEqual([item]);
    expect(wrapper.emitted("notification-open")?.[0]).toEqual([item]);

    await wrapper.find("button").trigger("click");
    expect(wrapper.emitted("notification-action")?.[0]).toEqual([
      { notification: item, action: item.actions?.[0] },
    ]);
    expect(item.read).toBeUndefined();
  });

  it("uses the injected live inbox by default and delivers each queued alert once", () => {
    const inbox = new NotificationController(true);
    inbox.apply({ action: "upsert", item: { id: "release", title: "Release ready" } });
    cogs.notifications = inbox;
    const list = mount(UcNotificationList, { global: { stubs: quasarStubs } });
    expect(list.text()).toContain("Release ready");

    const alerts = new AlertController();
    alerts.enqueue({ message: "Saved", level: "positive" });
    const original = Object.getOwnPropertyDescriptor(Notify, "create");
    const notify = vi.fn();
    Object.defineProperty(Notify, "create", { configurable: true, value: notify });
    try {
      mount(UcAlertHost, { props: { source: alerts }, global: { stubs: quasarStubs } });
      expect(notify).toHaveBeenCalledOnce();
      expect(alerts.items).toHaveLength(0);
    } finally {
      if (original) Object.defineProperty(Notify, "create", original);
      else delete (Notify as { create?: unknown }).create;
    }
  });

  it("renders notification image, empty, loading, error, and retry states", async () => {
    const image = mount(UcNotificationList, {
      props: {
        items: [
          { id: 1, title: "Avatar", image: { src: "/avatar.png", alt: "Avatar" }, icon: "person" },
        ],
      },
      global: { stubs: quasarStubs },
    });
    expect(image.find("img").attributes("src")).toBe("/avatar.png");
    expect(image.find("[data-q-icon]").exists()).toBe(false);

    const empty = mount(UcNotificationList, {
      props: { items: [], emptyLabel: "Nothing new" },
      global: { stubs: quasarStubs },
    });
    expect(empty.find(".uc-notification-list__empty").text()).toBe("Nothing new");

    const failed = mount(UcNotificationList, {
      props: { items: [], error: "Unavailable" },
      global: { stubs: quasarStubs },
    });
    await failed.find("button").trigger("click");
    expect(failed.emitted("notifications-retry")).toHaveLength(1);

    const loading = mount(UcNotificationList, {
      props: { items: [], loading: true },
      global: { stubs: quasarStubs },
    });
    expect(loading.find("[data-q-loading]").exists()).toBe(true);
  });

  it("composes a slot-driven shell and omits optional regions without content", async () => {
    navigation.value = {
      sidebar: [
        {
          kind: "route",
          id: "notifications",
          label: "Notifications",
          to: "/notifications",
          current: false,
        },
      ],
      topbar: [{ kind: "route", id: "tasks", label: "Tasks", to: "/tasks", current: false }],
      session: [{ kind: "route", id: "logout", label: "Sign out", to: "/logout", current: false }],
    };
    const wrapper = mount(UcAppLayout, {
      props: {
        brand: { label: "Example" },
        drawerFooterPlacement: "session",
        notifications: [],
        navigationBadges: { notifications: { value: 2, label: "2 unread notifications" } },
      },
      slots: {
        default: () => h("main", "Page content"),
        "topbar-actions": () => h("span", "Theme"),
        "drawer-footer": ({ nodes }: { readonly nodes: readonly object[] }) =>
          h("span", `Footer ${nodes.length}`),
      },
      global: { stubs: quasarStubs },
    });

    expect(wrapper.find(".uc-app-layout__header").exists()).toBe(true);
    expect(wrapper.find(".uc-app-layout__navigation").text()).toContain("Notifications");
    expect(wrapper.text()).toContain("Footer 1");
    await wrapper.findAll("button")[0]?.trigger("click");
    await wrapper.findAll("button").at(-1)?.trigger("click");
    await flushPromises();
    expect(wrapper.emitted("update:navigationOpen")?.[0]).toEqual([true]);
    expect(wrapper.emitted("update:notificationsOpen")?.[0]).toEqual([true]);

    const empty = mount(UcAppLayout, {
      props: { sidebarPlacement: false, topbarPlacement: false },
      global: { stubs: quasarStubs },
    });
    expect(empty.find(".uc-app-layout__header").exists()).toBe(false);
    expect(empty.find(".uc-app-layout__drawer").exists()).toBe(false);
    expect(empty.find(".uc-app-layout__notifications-drawer").exists()).toBe(false);
  });

  it("forwards compact drawer and header-control props without changing defaults", () => {
    navigation.value = {
      sidebar: [{ kind: "route", id: "tasks", label: "Tasks", to: "/tasks", current: false }],
    };
    const compact = mount(UcAppLayout, {
      props: {
        navigationWidth: 216,
        notificationsWidth: 320,
        notifications: [],
        navigationToggleProps: {
          flat: true,
          round: true,
          dense: true,
          size: "sm",
          color: "primary",
          icon: "menu_open",
          "aria-label": "Open app navigation",
        },
        notificationsToggleProps: {
          flat: true,
          round: true,
          dense: true,
          icon: "inbox",
          "aria-label": "Open inbox",
        },
      },
      slots: { "topbar-actions": () => h("button", { id: "theme" }, "Theme") },
      global: { stubs: quasarStubs },
    });
    const drawers = compact.findAll("[data-q-drawer]");
    expect(drawers[0]?.attributes("width")).toBe("216");
    expect(drawers[1]?.attributes("width")).toBe("320");
    const controls = compact.findAll(
      ".uc-app-layout__navigation-toggle, .uc-app-layout__notifications-toggle",
    );
    expect(controls[0]?.attributes()).toMatchObject({
      flat: "true",
      round: "true",
      dense: "true",
      size: "sm",
      color: "primary",
      icon: "menu_open",
      "aria-label": "Open app navigation",
    });
    expect(controls[1]?.attributes()).toMatchObject({ icon: "inbox", "aria-label": "Open inbox" });
    expect(compact.find("#theme").element.compareDocumentPosition(controls[1]!.element)).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    );

    const defaults = mount(UcAppLayout, {
      props: { notifications: [] },
      global: { stubs: quasarStubs },
    });
    expect(defaults.findAll("[data-q-drawer]").every((drawer) => !drawer.attributes("width"))).toBe(
      true,
    );
    expect(defaults.find(".uc-app-layout__notifications-toggle").attributes("icon")).toBe(
      "notifications",
    );
  });
});

const buttonStub = defineComponent({
  name: "QBtnStub",
  props: { label: String },
  setup(props, { attrs, slots }) {
    return () => h("button", attrs, slots.default?.() ?? props.label);
  },
});

const itemStub = defineComponent({
  name: "QItemStub",
  setup(_props, { attrs, slots }) {
    return () => h("div", { ...attrs, "data-q-item": true }, slots.default?.());
  },
});

const quasarStubs = {
  QLayout: simpleStub("QLayoutStub"),
  QHeader: simpleStub("QHeaderStub"),
  QToolbar: simpleStub("QToolbarStub"),
  QDrawer: drawerStub(),
  QPageContainer: simpleStub("QPageContainerStub"),
  QList: simpleStub("QListStub"),
  QItem: itemStub,
  QItemSection: simpleStub("QItemSectionStub"),
  QItemLabel: simpleStub("QItemLabelStub"),
  QBadge: simpleStub("QBadgeStub"),
  QIcon: defineComponent({ name: "QIconStub", setup: () => () => h("i", { "data-q-icon": true }) }),
  QAvatar: simpleStub("QAvatarStub"),
  QBanner: simpleStub("QBannerStub"),
  QInnerLoading: defineComponent({
    name: "QInnerLoadingStub",
    setup: () => () => h("div", { "data-q-loading": true }),
  }),
  QBtn: buttonStub,
  QBtnDropdown: simpleStub("QBtnDropdownStub"),
};

function simpleStub(name: string) {
  return defineComponent({
    name,
    setup(_props, { attrs, slots }) {
      return () => h("div", attrs, slots.default?.());
    },
  });
}

function drawerStub() {
  return defineComponent({
    name: "QDrawerStub",
    setup(_props, { attrs, slots }) {
      return () => h("div", { ...attrs, "data-q-drawer": true }, slots.default?.());
    },
  });
}
