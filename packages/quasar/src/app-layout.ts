import { useUiCogs, type UiCogsNavigationNode } from "@uicogs/vue";
import {
  QBadge,
  QBtn,
  QBtnDropdown,
  QDrawer,
  QHeader,
  QLayout,
  QPageContainer,
  QToolbar,
} from "quasar";
import { computed, defineComponent, h, type PropType } from "vue";
import type { RouteLocationRaw } from "vue-router";
import { UcNavigationTree, type UcNavigationBadges } from "./navigation.js";
import {
  UcNotificationList,
  type UcNotification,
  type UcNotificationActionEvent,
} from "./notifications.js";
import { UcAlertHost } from "./alert-host.js";

type UcAppBrandDestination =
  | Readonly<{ readonly to: RouteLocationRaw; readonly href?: never }>
  | Readonly<{ readonly href: string; readonly to?: never }>
  | Readonly<{ readonly to?: undefined; readonly href?: undefined }>;

/** The compact default brand rendered by UcAppLayout when no brand slot is supplied. */
export type UcAppBrand = Readonly<{
  readonly label: string;
  readonly icon?: string;
}> &
  UcAppBrandDestination;

/** A Quasar application shell composed from UiCogs navigation and its optional live inbox. */
export const UcAppLayout = defineComponent({
  name: "UcAppLayout",
  props: {
    brand: Object as PropType<UcAppBrand>,
    sidebarPlacement: { type: [String, Boolean] as PropType<string | false>, default: "sidebar" },
    topbarPlacement: { type: [String, Boolean] as PropType<string | false>, default: "topbar" },
    drawerFooterPlacement: [String, Boolean] as PropType<string | false | undefined>,
    navigationBadges: { type: Object as PropType<UcNavigationBadges>, default: () => ({}) },
    navigationOpen: { type: Boolean, default: false },
    notificationsOpen: { type: Boolean, default: false },
    notifications: Array as PropType<readonly UcNotification[]>,
    notificationsLoading: { type: Boolean, default: false },
    notificationsError: String,
  },
  emits: [
    "update:navigationOpen",
    "update:notificationsOpen",
    "notification-open",
    "notification-action",
    "notification-mark-read",
    "notification-dismiss",
    "notifications-retry",
  ],
  setup(props, { emit, slots }) {
    const cogs = useUiCogs();
    const notifications = cogs.notifications ?? {
      status: "disabled" as const,
      unreadCount: 0,
    };
    const sidebar = props.sidebarPlacement
      ? cogs.navigation(props.sidebarPlacement)
      : computed(() => []);
    const topbar = props.topbarPlacement
      ? cogs.navigation(props.topbarPlacement)
      : computed(() => []);
    const footer = props.drawerFooterPlacement
      ? cogs.navigation(props.drawerFooterPlacement)
      : computed(() => []);
    const hasSidebar = computed(
      () =>
        sidebar.value.length > 0 ||
        slots.navigation !== undefined ||
        slots["drawer-header"] !== undefined ||
        slots["drawer-footer"] !== undefined,
    );
    const hasNotifications = computed(
      () =>
        props.notifications !== undefined ||
        notifications.status !== "disabled" ||
        slots.notifications !== undefined,
    );
    const hasHeader = computed(
      () =>
        hasSidebar.value ||
        hasNotifications.value ||
        props.brand !== undefined ||
        slots.brand !== undefined ||
        slots["topbar-before"] !== undefined ||
        slots["topbar-links"] !== undefined ||
        slots["topbar-actions"] !== undefined ||
        topbar.value.length > 0,
    );
    return () =>
      h(QLayout, { class: "uc-app-layout" }, () => [
        hasHeader.value
          ? h(QHeader, { class: "uc-app-layout__header" }, () =>
              h(QToolbar, { class: "uc-app-layout__toolbar" }, () => [
                hasSidebar.value
                  ? h(QBtn, {
                      icon: "menu",
                      "aria-label": "Toggle navigation",
                      onClick: () => emit("update:navigationOpen", !props.navigationOpen),
                    })
                  : undefined,
                props.brand !== undefined || slots.brand !== undefined
                  ? h(
                      "div",
                      { class: "uc-app-layout__brand" },
                      slots.brand?.() ?? defaultBrand(props.brand),
                    )
                  : undefined,
                slots["topbar-before"]?.(),
                topbar.value.length || slots["topbar-links"]
                  ? h(
                      "div",
                      { class: "uc-app-layout__topbar-links" },
                      slots["topbar-links"]?.({ nodes: topbar.value }) ??
                        renderTopbar(topbar.value),
                    )
                  : undefined,
                slots["topbar-actions"]
                  ? h(
                      "div",
                      { class: "uc-app-layout__topbar-actions" },
                      slots["topbar-actions"]?.(),
                    )
                  : undefined,
                hasNotifications.value
                  ? h(
                      QBtn,
                      {
                        icon: "notifications",
                        "aria-label": "Show notifications",
                        onClick: () => emit("update:notificationsOpen", !props.notificationsOpen),
                      },
                      () =>
                        notifications.unreadCount
                          ? h(
                              QBadge,
                              { "aria-label": `${notifications.unreadCount} unread notifications` },
                              () => String(notifications.unreadCount),
                            )
                          : undefined,
                    )
                  : undefined,
              ]),
            )
          : undefined,
        hasSidebar.value
          ? h(
              QDrawer,
              {
                class: "uc-app-layout__drawer",
                modelValue: props.navigationOpen,
                showIfAbove: true,
                "onUpdate:modelValue": (value: boolean) => emit("update:navigationOpen", value),
              },
              () => [
                slots["drawer-header"]?.(),
                h(
                  "div",
                  { class: "uc-app-layout__navigation" },
                  slots.navigation?.({ nodes: sidebar.value }) ??
                    h(UcNavigationTree, { nodes: sidebar.value, badges: props.navigationBadges }),
                ),
                footer.value.length || slots["drawer-footer"]
                  ? h(
                      "div",
                      { class: "uc-app-layout__drawer-footer" },
                      slots["drawer-footer"]?.({ nodes: footer.value }) ??
                        h(UcNavigationTree, {
                          nodes: footer.value,
                          badges: props.navigationBadges,
                        }),
                    )
                  : undefined,
              ],
            )
          : undefined,
        hasNotifications.value
          ? h(
              QDrawer,
              {
                class: "uc-app-layout__notifications-drawer",
                side: "right",
                modelValue: props.notificationsOpen,
                "onUpdate:modelValue": (value: boolean) => emit("update:notificationsOpen", value),
              },
              () => [
                slots["notifications-header"]?.(),
                slots.notifications?.() ??
                  h(
                    UcNotificationList,
                    {
                      ...(props.notifications ? { items: props.notifications } : {}),
                      loading: props.notificationsLoading,
                      error: props.notificationsError,
                      onNotificationOpen: (value: UcNotification) =>
                        emit("notification-open", value),
                      onNotificationAction: (value: UcNotificationActionEvent) =>
                        emit("notification-action", value),
                      onNotificationMarkRead: (value: UcNotification) =>
                        emit("notification-mark-read", value),
                      onNotificationDismiss: (value: UcNotification) =>
                        emit("notification-dismiss", value),
                      onNotificationsRetry: () => emit("notifications-retry"),
                    },
                    {
                      empty: slots["notifications-empty"],
                      notification: slots.notification,
                      leading: slots["notification-leading"],
                      actions: slots["notification-actions"],
                      error: slots["notifications-error"],
                    },
                  ),
              ],
            )
          : undefined,
        h(QPageContainer, { class: "uc-app-layout__page" }, () => slots.default?.()),
        h(UcAlertHost),
      ]);
  },
});

function defaultBrand(brand: UcAppBrand | undefined): ReturnType<typeof h> | undefined {
  if (!brand) return undefined;
  assertDestination(brand);
  return h(QBtn, {
    label: brand.label,
    ...(brand.icon === undefined ? {} : { icon: brand.icon }),
    ...(brand.to === undefined ? {} : { to: brand.to }),
    ...(brand.href === undefined ? {} : { href: brand.href }),
  });
}

function renderTopbar(nodes: readonly UiCogsNavigationNode[]): ReturnType<typeof h>[] {
  return nodes.map((node) => {
    if (node.kind === "group")
      return h(QBtnDropdown, { key: node.id, label: node.label }, () =>
        h(UcNavigationTree, { nodes: node.children }),
      );
    return h(QBtn, {
      key: node.id,
      label: node.label,
      ...(typeof node.icon === "string" ? { icon: node.icon } : {}),
      ...(node.to === undefined ? {} : { to: node.to }),
    });
  });
}

function assertDestination(value: {
  readonly to?: RouteLocationRaw;
  readonly href?: string;
}): void {
  if (value.to !== undefined && value.href !== undefined)
    throw new Error("An application brand must provide either to or href, not both");
}
