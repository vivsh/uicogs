import type {
  NotificationController,
  UiNotification as CoreNotification,
  UiNotificationAction as CoreNotificationAction,
} from "@uicogs/core";
import { useUiCogs } from "@uicogs/vue";
import type { RouteLocationRaw } from "vue-router";
import {
  QAvatar,
  QBanner,
  QBtn,
  QIcon,
  QInnerLoading,
  QItem,
  QItemLabel,
  QItemSection,
  QList,
} from "quasar";
import { defineComponent, h, type PropType } from "vue";
import { useUcIcon } from "./icons.js";

/** Semantic notification level. UiCogs supplies only class hooks; applications choose appearance. */
export type UcNotificationLevel = "info" | "positive" | "warning" | "negative";

type UcNotificationDestination =
  | Readonly<{ readonly to: RouteLocationRaw; readonly href?: never }>
  | Readonly<{ readonly href: string; readonly to?: never }>
  | Readonly<{ readonly to?: undefined; readonly href?: undefined }>;

/** One native navigation or application-dispatched notification action. */
export type UcNotificationAction = CoreNotificationAction & UcNotificationDestination;

/** Presentation-ready notification data. Core live notifications are accepted unchanged. */
export type UcNotification = Omit<CoreNotification, "actions" | "createdAt"> &
  Readonly<{
    readonly createdAt?: string | Date;
    readonly actions?: readonly UcNotificationAction[];
  }> &
  UcNotificationDestination;

export interface UcNotificationActionEvent {
  readonly notification: UcNotification;
  readonly action: UcNotificationAction;
}

/** Renders a core live inbox by default, or explicit controlled data for alternate inboxes and Storybook. */
export const UcNotificationList = defineComponent({
  name: "UcNotificationList",
  props: {
    items: Array as PropType<readonly UcNotification[]>,
    source: Object as PropType<NotificationController>,
    loading: { type: Boolean, default: false },
    error: String,
    emptyLabel: { type: String, default: "No notifications" },
  },
  emits: [
    "notification-open",
    "notification-action",
    "notification-mark-read",
    "notification-dismiss",
    "notifications-retry",
  ],
  setup(props, { emit, slots }) {
    const icon = useUcIcon();
    const source = props.source ?? injectedNotifications();
    const items = (): readonly UcNotification[] =>
      props.items ?? (source?.items as readonly UcNotification[] | undefined) ?? [];
    const error = (): string | undefined => props.error ?? source?.error;
    const retry = (): void => emit("notifications-retry");
    const open = (notification: UcNotification): void => {
      if (!notification.read) emit("notification-mark-read", notification);
      emit("notification-open", notification);
    };
    const triggerAction = (notification: UcNotification, value: UcNotificationAction): void => {
      assertDestination(value);
      if (!notification.read) emit("notification-mark-read", notification);
      emit("notification-action", Object.freeze({ notification, action: value }));
    };
    const action = (
      notification: UcNotification,
      value: UcNotificationAction,
      event: MouseEvent,
    ) => {
      event.stopPropagation();
      triggerAction(notification, value);
    };
    return () => {
      if (props.loading) return h(QInnerLoading, { showing: true });
      if (error())
        return (
          slots.error?.({ error: error(), retry }) ??
          h(QBanner, { class: "uc-notification-list__error" }, () => [
            error(),
            h(QBtn, { label: "Retry", onClick: retry }),
          ])
        );
      if (!items().length)
        return h(
          "div",
          { class: "uc-notification-list__empty" },
          slots.empty?.() ?? props.emptyLabel,
        );
      return h(QList, { class: "uc-notification-list" }, () =>
        items().map((notification) => {
          assertDestination(notification);
          const custom = slots.notification?.({ notification, open: () => open(notification) });
          if (custom) return custom;
          return h(
            QItem,
            {
              key: notification.id,
              class: [
                "uc-notification-list__item",
                notification.read
                  ? "uc-notification-list__item--read"
                  : "uc-notification-list__item--unread",
                ...(notification.level
                  ? [`uc-notification-list__item--${notification.level}`]
                  : []),
              ],
              clickable: true,
              ...destination(notification),
              onClick: () => open(notification),
            },
            () => [
              slots.leading?.({ notification }) ?? leading(notification, icon),
              h(QItemSection, { class: "uc-notification-list__content" }, () => [
                h(QItemLabel, { class: "uc-notification-list__title" }, () => notification.title),
                notification.message
                  ? h(
                      QItemLabel,
                      { class: "uc-notification-list__message", caption: true },
                      () => notification.message,
                    )
                  : undefined,
                notification.createdAt
                  ? h(QItemLabel, { class: "uc-notification-list__timestamp", caption: true }, () =>
                      timestamp(notification.createdAt!),
                    )
                  : undefined,
                notification.actions?.length
                  ? (slots.actions?.({
                      notification,
                      action: (value: UcNotificationAction) => triggerAction(notification, value),
                    }) ??
                    h(
                      "div",
                      { class: "uc-notification-list__actions" },
                      notification.actions.map((value) => {
                        assertDestination(value);
                        return h(QBtn, {
                          key: value.id,
                          label: value.label,
                          ...(value.icon === undefined ? {} : { icon: icon(value.icon) }),
                          ...destination(value),
                          onClick: (event: MouseEvent) => action(notification, value, event),
                        });
                      }),
                    ))
                  : undefined,
              ]),
            ],
          );
        }),
      );
    };
  },
});

function leading(
  notification: UcNotification,
  icon: (name: string) => string,
): ReturnType<typeof h> | undefined {
  if (notification.image)
    return h(QItemSection, { avatar: true, class: "uc-notification-list__leading" }, () =>
      h(QAvatar, {}, () =>
        h("img", { src: notification.image!.src, alt: notification.image!.alt }),
      ),
    );
  const iconName = notification.icon;
  if (iconName)
    return h(QItemSection, { avatar: true, class: "uc-notification-list__leading" }, () =>
      h(QIcon, { name: icon(iconName) }),
    );
  return undefined;
}

function timestamp(value: string | Date): string {
  return value instanceof Date ? value.toLocaleString() : value;
}

function assertDestination(value: {
  readonly to?: RouteLocationRaw;
  readonly href?: string;
}): void {
  if (value.to !== undefined && value.href !== undefined)
    throw new Error("A notification destination must provide either to or href, not both");
}

function injectedNotifications(): NotificationController | undefined {
  try {
    return useUiCogs().notifications;
  } catch {
    return undefined;
  }
}

function destination(value: {
  readonly to?: RouteLocationRaw;
  readonly href?: string;
  readonly actionUrl?: string;
}): { readonly to?: RouteLocationRaw; readonly href?: string } {
  assertDestination(value);
  if (value.to !== undefined) return { to: value.to };
  if (value.href !== undefined) return { href: value.href };
  if (!value.actionUrl) return {};
  return value.actionUrl.startsWith("/") ? { to: value.actionUrl } : { href: value.actionUrl };
}
