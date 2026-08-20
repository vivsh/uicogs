export interface QuasarDateRange {
  readonly from: string;
  readonly to: string;
}

const calendarPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

/** Converts a date-only UiCogs value to Quasar's fixed calendar mask without timezone drift. */
export function toCalendarDate(value: unknown): string | undefined {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) return undefined;
  return `${value.getUTCFullYear().toString().padStart(4, "0")}-${String(
    value.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

/** Parses a fixed-mask Quasar calendar date into UiCogs' UTC date-only representation. */
export function fromCalendarDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const match = calendarPattern.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : undefined;
}

/** Converts a UiCogs date tuple into Quasar's range model. */
export function toQuasarDateRange(value: unknown): QuasarDateRange | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const from = toCalendarDate(value[0]);
  const to = toCalendarDate(value[1]);
  return from && to ? Object.freeze({ from, to }) : undefined;
}

/** Parses Quasar's range model into UiCogs' immutable date tuple. */
export function fromQuasarDateRange(value: unknown): readonly [Date, Date] | undefined {
  if (!isRange(value)) return undefined;
  const from = fromCalendarDate(value.from);
  const to = fromCalendarDate(value.to);
  return from && to ? Object.freeze([from, to]) : undefined;
}

/** Returns a valid UiCogs time string, retaining optional seconds. */
export function toQuasarTime(value: unknown): string | undefined {
  return typeof value === "string" && timePattern.test(value) ? value : undefined;
}

/** Creates a date-time value from a UTC calendar date and local-time picker string. */
export function fromDateTimeParts(date: unknown, time: unknown): Date | undefined {
  const calendar = typeof date === "string" ? date : undefined;
  const clock = toQuasarTime(time);
  if (!calendar || !clock) return undefined;
  const parsedDate = fromCalendarDate(calendar);
  if (!parsedDate) return undefined;
  const [hours, minutes, seconds = "0"] = clock.split(":");
  const result = new Date(
    parsedDate.getUTCFullYear(),
    parsedDate.getUTCMonth(),
    parsedDate.getUTCDate(),
    Number(hours),
    Number(minutes),
    Number(seconds),
  );
  return Number.isNaN(result.valueOf()) ? undefined : result;
}

/** Returns the fixed calendar date and local clock portions displayed by a date-time picker. */
export function toDateTimeParts(
  value: unknown,
): Readonly<{ readonly date: string; readonly time: string }> | undefined {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) return undefined;
  return Object.freeze({
    date: `${value.getFullYear().toString().padStart(4, "0")}-${String(
      value.getMonth() + 1,
    ).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`,
    time: `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}:${String(
      value.getSeconds(),
    ).padStart(2, "0")}`,
  });
}

function isRange(value: unknown): value is QuasarDateRange {
  return (
    typeof value === "object" &&
    value !== null &&
    "from" in value &&
    "to" in value &&
    typeof value.from === "string" &&
    typeof value.to === "string"
  );
}
