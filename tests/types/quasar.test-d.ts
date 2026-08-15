import { expectAssignable, expectError, expectType } from "tsd";
import {
  type UcAppBrand,
  type UcAppLayoutActionProps,
  type UcActionsProps,
  type UcButtonProps,
  type UcFormActionLayout,
  type UcNavigationBadge,
  type UcNotification,
  type UcNotificationAction,
  defineSkin,
  type FieldSkin,
  type FieldSkinContext,
  type UcSurfaceLayout,
  type UiCogsQuasarSkin,
} from "@uicogs/quasar";

const skin = defineSkin({
  palette: { primary: "#5b4bdb", negative: "#c62828" },
  form: { class: ["application-form", "q-gutter-md"], style: { maxWidth: "42rem" } },
  field: ({ name, field, form }) => {
    expectType<string>(name);
    expectType<boolean | undefined>(field.options.readonly);
    expectType<boolean>(form.field(name).dirty);
    return { outlined: true, bgColor: "grey-2", labelColor: "primary" };
  },
});

expectAssignable<UiCogsQuasarSkin>(skin);
expectAssignable<UcSurfaceLayout>({
  mode: "grid",
  gutter: "sm",
  default: { xs: 12, md: 4 },
  kinds: { boolean: { xs: "auto" } },
});
expectAssignable<FieldSkin>({ dense: true, style: "max-width: 24rem" });
expectType<FieldSkinContext>(undefined as unknown as FieldSkinContext);
expectAssignable<UcButtonProps>({
  label: "Save",
  color: "primary",
  dense: true,
  size: "sm",
  type: "submit",
});
expectAssignable<UcActionsProps>({ inline: true });
expectAssignable<UcFormActionLayout>("inline");
expectError<UcFormActionLayout>("sideways");

expectError(defineSkin({ palette: { brand: "#5b4bdb" } }));
expectError(defineSkin({ palette: { "--q-primary": "#5b4bdb" } }));
expectError(defineSkin({ field: { clearable: true } }));
expectError(defineSkin({ field: { outlined: () => true } }));
expectError(defineSkin({ layout: { filter: { gutter: "huge" } } }));
expectError(defineSkin({ layout: { form: { default: { xs: 13 } } } }));
expectError<UcButtonProps>({ compact: true });
expectError<UcActionsProps>({ inline: "yes" });

expectAssignable<UcAppBrand>({ label: "Example", to: { name: "home" } });
expectAssignable<UcAppLayoutActionProps>({
  flat: true,
  round: true,
  dense: true,
  size: "sm",
  color: "primary",
  icon: "menu_open",
  "aria-label": "Open navigation",
});
expectError<UcAppLayoutActionProps>({ onClick: () => undefined });
expectAssignable<UcNavigationBadge>({ value: 3, label: "3 unread notifications" });
expectAssignable<UcNotification>({
  id: "release",
  title: "Release ready",
  level: "positive",
  to: { name: "release" },
  actions: [{ id: "review", label: "Review", href: "https://example.test/release" }],
});
expectAssignable<UcNotification>({
  id: "release-live",
  title: "Live release",
  actionUrl: "/releases/current",
  actions: [{ id: "open", label: "Open", actionUrl: "/releases/current", priority: "primary" }],
});
expectAssignable<UcNotificationAction>({ id: "dismiss", label: "Dismiss" });

expectError<UcNotification>({ id: "missing-title" });
expectError<UcNotification>({
  id: "ambiguous",
  title: "Ambiguous destination",
  to: { name: "home" },
  href: "https://example.test",
});
expectError<UcAppBrand>({
  label: "Ambiguous brand",
  to: { name: "home" },
  href: "https://example.test",
});
