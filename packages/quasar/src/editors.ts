import { QDate, QIcon, QInput, QPopupProxy, QTime } from "quasar";
import { computed, defineComponent, getCurrentInstance, h, type PropType } from "vue";
import {
  fromCalendarDate,
  fromDateTimeParts,
  fromQuasarDateRange,
  type QuasarDateRange,
  toCalendarDate,
  toDateTimeParts,
  toQuasarDateRange,
  toQuasarTime,
} from "./date-codecs.js";
import { useUcIcon } from "./icons.js";

const baseFieldProps = {
  label: String,
  hint: String,
  error: Boolean,
  errorMessage: String,
  readonly: Boolean,
  disable: Boolean,
};

/** Quasar date picker bound to UiCogs' date-only Date value. */
export const UcDateEditor = defineComponent({
  name: "UcDateEditor",
  inheritAttrs: false,
  props: {
    ...baseFieldProps,
    modelValue: { type: Date as PropType<Date | null | undefined>, default: undefined },
    min: String,
    max: String,
  },
  emits: ["update:modelValue"],
  setup(props, { attrs, emit }) {
    const calendar = computed(() => toCalendarDate(props.modelValue));
    const icon = temporalIcon("date", useUcIcon());
    return () =>
      pickerInput({
        attrs,
        label: props.label,
        hint: props.hint,
        error: props.error,
        errorMessage: props.errorMessage,
        readonly: props.readonly,
        disable: props.disable,
        display: calendar.value ?? "",
        icon,
        picker: () =>
          h(QDate, {
            modelValue: calendar.value,
            mask: "YYYY-MM-DD",
            options: dateOptions(props.min, props.max),
            "onUpdate:modelValue": (value: unknown) => {
              const next = fromCalendarDate(value);
              if (next && isDateAllowed(toCalendarDate(next)!, props.min, props.max))
                emit("update:modelValue", next);
            },
          }),
      });
  },
});

/** Quasar time picker bound to UiCogs' validated time string. */
export const UcTimeEditor = defineComponent({
  name: "UcTimeEditor",
  inheritAttrs: false,
  props: {
    ...baseFieldProps,
    modelValue: { type: String, default: undefined },
    minuteStep: Number,
  },
  emits: ["update:modelValue"],
  setup(props, { attrs, emit }) {
    const clock = computed(() => toQuasarTime(props.modelValue));
    const icon = temporalIcon("time", useUcIcon());
    return () =>
      pickerInput({
        attrs,
        label: props.label,
        hint: props.hint,
        error: props.error,
        errorMessage: props.errorMessage,
        readonly: props.readonly,
        disable: props.disable,
        display: clock.value ?? "",
        icon,
        picker: () =>
          h(QTime, {
            modelValue: clock.value,
            mask: clock.value?.split(":").length === 3 ? "HH:mm:ss" : "HH:mm",
            minuteOptions: minuteOptions(props.minuteStep),
            "onUpdate:modelValue": (value: unknown) => {
              const next = toQuasarTime(value);
              if (next) emit("update:modelValue", next);
            },
          }),
      });
  },
});

/** Quasar range picker bound to UiCogs' immutable date tuple. */
export const UcDateRangeEditor = defineComponent({
  name: "UcDateRangeEditor",
  inheritAttrs: false,
  props: {
    ...baseFieldProps,
    modelValue: {
      type: [Array, Object] as unknown as PropType<
        readonly [Date, Date] | QuasarDateRange | null | undefined
      >,
      default: undefined,
    },
    min: String,
    max: String,
  },
  emits: ["update:modelValue"],
  setup(props, { attrs, emit }) {
    const range = computed(() => toQuasarDateRange(props.modelValue));
    const icon = temporalIcon("dateRange", useUcIcon());
    return () =>
      pickerInput({
        attrs,
        label: props.label,
        hint: props.hint,
        error: props.error,
        errorMessage: props.errorMessage,
        readonly: props.readonly,
        disable: props.disable,
        display: range.value ? `${range.value.from} – ${range.value.to}` : "",
        icon,
        picker: () =>
          h(QDate, {
            modelValue: range.value,
            mask: "YYYY-MM-DD",
            range: true,
            options: dateOptions(props.min, props.max),
            "onUpdate:modelValue": (value: unknown) => {
              const next = fromQuasarDateRange(value);
              if (
                next &&
                isDateAllowed(toCalendarDate(next[0])!, props.min, props.max) &&
                isDateAllowed(toCalendarDate(next[1])!, props.min, props.max)
              )
                emit("update:modelValue", next);
            },
          }),
      });
  },
});

/** Coordinated Quasar date and time pickers bound to UiCogs' DateTime value. */
export const UcDateTimeEditor = defineComponent({
  name: "UcDateTimeEditor",
  inheritAttrs: false,
  props: {
    ...baseFieldProps,
    modelValue: { type: Date as PropType<Date | null | undefined>, default: undefined },
    minuteStep: Number,
    separate: Boolean,
  },
  emits: ["update:modelValue"],
  setup(props, { attrs, emit }) {
    const parts = computed(() => toDateTimeParts(props.modelValue));
    const resolveIcon = useUcIcon();
    const dateIcon = temporalIcon("date", resolveIcon);
    const timeIcon = temporalIcon("time", resolveIcon);
    const update = (date: string | undefined, time: string | undefined): void => {
      const next = fromDateTimeParts(date, time);
      if (next) emit("update:modelValue", next);
    };
    const datePicker = () =>
      h(QDate, {
        modelValue: parts.value?.date,
        mask: "YYYY-MM-DD",
        "onUpdate:modelValue": (value: unknown) =>
          update(typeof value === "string" ? value : undefined, parts.value?.time),
      });
    const timePicker = () =>
      h(QTime, {
        modelValue: parts.value?.time,
        mask: "HH:mm:ss",
        minuteOptions: minuteOptions(props.minuteStep),
        "onUpdate:modelValue": (value: unknown) =>
          update(parts.value?.date, typeof value === "string" ? value : undefined),
      });
    return () => {
      const display = props.modelValue instanceof Date ? props.modelValue.toLocaleString() : "";
      if (!props.separate)
        return pickerInput({
          attrs,
          label: props.label,
          hint: props.hint,
          error: props.error,
          errorMessage: props.errorMessage,
          readonly: props.readonly,
          disable: props.disable,
          display,
          icon: dateIcon,
          picker: () => h("div", [datePicker(), timePicker()]),
        });
      const { class: className, ...fieldAttrs } = attrs;
      return h("div", { ...fieldAttrs, class: className }, [
        pickerInput({
          attrs: {},
          label: `${props.label ?? "Date and time"} date`,
          readonly: props.readonly,
          disable: props.disable,
          display: parts.value?.date ?? "",
          icon: dateIcon,
          picker: datePicker,
        }),
        pickerInput({
          attrs: {},
          label: `${props.label ?? "Date and time"} time`,
          hint: props.hint,
          error: props.error,
          errorMessage: props.errorMessage,
          readonly: props.readonly,
          disable: props.disable,
          display: parts.value?.time ?? "",
          icon: timeIcon,
          picker: timePicker,
        }),
      ]);
    };
  },
});

function pickerInput(options: {
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly label?: string;
  readonly hint?: string;
  readonly error?: boolean;
  readonly errorMessage?: string;
  readonly readonly?: boolean;
  readonly disable?: boolean;
  readonly display: string;
  readonly icon: string;
  readonly picker: () => ReturnType<typeof h>;
}) {
  const { class: className, ...fieldAttrs } = options.attrs;
  return h(
    QInput,
    {
      ...fieldAttrs,
      class: className,
      modelValue: options.display,
      label: options.label,
      hint: options.hint,
      error: options.error,
      errorMessage: options.errorMessage,
      readonly: true,
      disable: options.disable,
    },
    options.readonly || options.disable
      ? undefined
      : {
          append: () =>
            h(QIcon, { name: options.icon, class: "cursor-pointer" }, () =>
              h(QPopupProxy, {}, { default: options.picker }),
            ),
        },
  );
}

function dateOptions(min: string | undefined, max: string | undefined) {
  return (value: string) => isDateAllowed(value, min, max);
}

/** Resolves runtime overrides before retaining the configured Quasar datetime icon fallback. */
function temporalIcon(
  name: "date" | "dateRange" | "time",
  icon: (name: string, fallback?: string) => string,
): string {
  const kind = name === "time" ? "now" : "today";
  return icon(name, getCurrentInstance()?.proxy?.$q?.iconSet.datetime?.[kind]);
}

function isDateAllowed(value: string, min: string | undefined, max: string | undefined): boolean {
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

function minuteOptions(step: number | undefined): readonly number[] | undefined {
  if (step === undefined) return undefined;
  if (!Number.isInteger(step) || step < 1 || step > 60) return undefined;
  return Object.freeze(Array.from({ length: Math.ceil(60 / step) }, (_, index) => index * step));
}
