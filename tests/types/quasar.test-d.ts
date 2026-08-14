import { expectAssignable, expectError, expectType } from "tsd";
import {
  type UcAppBrand,
  type UcNavigationBadge,
  type UcNotification,
  type UcNotificationAction,
  defineSkin,
  type FieldSkin,
  type FieldSkinContext,
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
expectAssignable<FieldSkin>({ dense: true, style: "max-width: 24rem" });
expectType<FieldSkinContext>(undefined as unknown as FieldSkinContext);

expectError(defineSkin({ palette: { brand: "#5b4bdb" } }));
expectError(defineSkin({ palette: { "--q-primary": "#5b4bdb" } }));
expectError(defineSkin({ field: { clearable: true } }));
expectError(defineSkin({ field: { outlined: () => true } }));

expectAssignable<UcAppBrand>({ label: "Example", to: { name: "home" } });
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
