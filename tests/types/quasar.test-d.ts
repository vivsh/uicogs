import { expectAssignable, expectError, expectType } from "tsd";
import {
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
