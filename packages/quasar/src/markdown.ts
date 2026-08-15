import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import { QBtn, QInput } from "quasar";
import { defineComponent, h, ref, watch, type PropType } from "vue";

const parser = new MarkdownIt({ html: false, linkify: false, typographer: true });

/** Renders Markdown through UiCogs' safe parser and sanitizer. */
export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(parser.render(source));
}

/** Renders a safe Markdown document without introducing a UiCogs visual skin. */
export const UcMarkdown = defineComponent({
  name: "UcMarkdown",
  inheritAttrs: false,
  props: { source: { type: String, required: true } },
  setup(props, { attrs }) {
    return () => {
      const { class: className, ...elementAttrs } = attrs;
      return h("div", {
        ...elementAttrs,
        class: ["uc-markdown", className],
        innerHTML: renderMarkdown(props.source),
      });
    };
  },
});

/** Editable Markdown field with native Quasar controls and a toggleable safe preview. */
export const UcMarkdownEditor = defineComponent({
  name: "UcMarkdownEditor",
  inheritAttrs: false,
  props: {
    modelValue: { type: String, default: "" },
    label: String,
    hint: String,
    error: Boolean,
    errorMessage: String,
    readonly: Boolean,
    disable: Boolean,
    rows: Number,
    autogrow: Boolean,
    defaultView: { type: String as PropType<"edit" | "preview">, default: "edit" },
    resize: {
      type: [String, Boolean] as PropType<"vertical" | "both" | false>,
      default: "vertical",
    },
  },
  emits: ["update:modelValue"],
  setup(props, { attrs, emit }) {
    const preview = ref(props.defaultView === "preview");
    watch(
      () => props.defaultView,
      (next) => {
        preview.value = next === "preview";
      },
    );
    return () => {
      const { class: className, ...fieldAttrs } = attrs;
      const toggle = h(QBtn, {
        flat: true,
        type: "button",
        class: "uc-markdown__toggle",
        label: preview.value ? "Edit" : "Preview",
        onClick: () => {
          preview.value = !preview.value;
        },
      });
      const content = preview.value
        ? h(UcMarkdown, { class: "uc-markdown__preview", source: props.modelValue })
        : h(QInput, {
            ...fieldAttrs,
            class: ["uc-markdown__editor", className],
            modelValue: props.modelValue,
            type: "textarea",
            label: props.label,
            hint: props.hint,
            error: props.error,
            errorMessage: props.errorMessage,
            readonly: props.readonly,
            disable: props.disable,
            rows: props.rows,
            autogrow: props.autogrow,
            inputStyle: resizeStyle(props.resize),
            "onUpdate:modelValue": (value: string) => emit("update:modelValue", value),
          });
      return h("div", { class: "uc-markdown" }, [toggle, content]);
    };
  },
});

function resizeStyle(
  resize: "vertical" | "both" | false,
): Readonly<Record<string, string>> | undefined {
  return resize === false ? undefined : { overflow: "auto", resize };
}
